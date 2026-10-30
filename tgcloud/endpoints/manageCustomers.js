import { db, EndpointError } from 'sdk';
import { desc, eq, or } from 'sdk/db';
import { customers, orders, pointTransactions } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';

function iso(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function num(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function memberId() {
  if (!globalThis.crypto?.getRandomValues) throw new EndpointError('Secure random generation is unavailable.', { code: 'SECURE_RANDOM_UNAVAILABLE' });
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function epochSeconds(value) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  const number = Number(value) || 0;
  return Math.floor(number > 1e12 ? number / 1000 : number);
}
function fingerprintList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
  return [];
}
function identifiers(fp) {
  return [
    ['deviceId', fp?.deviceId || fp?.device_id],
    ['hardwareId', fp?.hardwareId || fp?.hardware_id],
    ['deviceFingerprintId', fp?.deviceFingerprintId || fp?.device_fingerprint_id],
  ].filter(([, value]) => value).map(([type, value]) => ({ type, value: String(value).trim() }));
}
function formatOrderNumber(seconds) {
  const pht = new Date((Number(seconds) + 8 * 60 * 60) * 1000);
  const pad = value => String(value).padStart(2, '0');
  return `${pad(pht.getUTCDate())}${pad(pht.getUTCMonth() + 1)}${String(pht.getUTCFullYear()).slice(-2)}${pad(pht.getUTCHours())}${pad(pht.getUTCMinutes())}${pad(pht.getUTCSeconds())}`;
}

async function normalizeTestIdentifiers() {
  const people = await db.select().from(customers).all();
  const ids = new Set(people.map(row => String(row.primeMemberId || '').toUpperCase()).filter(Boolean));
  const changedMembers = [];
  for (const person of people) {
    const previous = String(person.primeMemberId || '');
    if (/^[A-F0-9]{12}$/.test(previous)) continue;
    let next = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = memberId();
      if (!ids.has(candidate)) { next = candidate; break; }
    }
    if (!next) throw new EndpointError('Could not allocate a unique PRIME Member ID.', { code: 'MEMBER_ID_UNAVAILABLE' });
    const result = await db.run(
      `UPDATE customers SET prime_member_id = :next, updated_at = unixepoch()
        WHERE id = :id AND COALESCE(prime_member_id, '') = :previous`,
      { ':next': next, ':id': person.id, ':previous': previous },
    );
    if (Number(result?.rowsAffected) > 0) {
      ids.delete(previous.toUpperCase()); ids.add(next);
      changedMembers.push({ customerId: person.id, previous, next });
    }
  }

  for (const change of changedMembers) {
    await db.run(`UPDATE customers SET referred_by_member_id = :next, referred_by = :next,
        updated_at = unixepoch()
      WHERE (referred_by_user_id IS NULL OR referred_by_user_id = '')
        AND (referred_by_member_id = :previous OR referred_by = :previous)`,
    { ':next': change.next, ':previous': change.previous });
    await db.run(`UPDATE orders SET prime_member_id = :next, updated_at = unixepoch()
      WHERE (customer_id IS NULL OR customer_id = '') AND prime_member_id = :previous`,
    { ':next': change.next, ':previous': change.previous });
    await db.run(`UPDATE orders SET referred_by_member_id = :next
      WHERE (referred_by_user_id IS NULL OR referred_by_user_id = '') AND referred_by_member_id = :previous`,
    { ':next': change.next, ':previous': change.previous });
  }

  // Rebuild references from stable customer IDs so retries can finish after a partial run.
  await db.run(`UPDATE customers SET referred_by_member_id =
      (SELECT prime_member_id FROM customers ref WHERE ref.id = customers.referred_by_user_id),
      referred_by = (SELECT prime_member_id FROM customers ref WHERE ref.id = customers.referred_by_user_id),
      updated_at = unixepoch()
    WHERE referred_by_user_id IS NOT NULL AND referred_by_user_id <> ''
      AND EXISTS (SELECT 1 FROM customers ref WHERE ref.id = customers.referred_by_user_id)`);
  await db.run(`UPDATE orders SET prime_member_id =
      (SELECT prime_member_id FROM customers c WHERE c.id = orders.customer_id),
      updated_at = unixepoch()
    WHERE customer_id IS NOT NULL AND customer_id <> ''
      AND EXISTS (SELECT 1 FROM customers c WHERE c.id = orders.customer_id)`);
  await db.run(`UPDATE orders SET referred_by_member_id =
      (SELECT prime_member_id FROM customers ref WHERE ref.id = orders.referred_by_user_id)
    WHERE referred_by_user_id IS NOT NULL AND referred_by_user_id <> ''
      AND EXISTS (SELECT 1 FROM customers ref WHERE ref.id = orders.referred_by_user_id)`);

  const allOrders = await db.select().from(orders).all();
  let changedOrders = 0;
  const reserved = new Set(allOrders.map(order => String(order.orderNumber || '')));
  for (const order of allOrders) {
    const previous = String(order.orderNumber || '');
    if (/^[0-9]{12}$/.test(previous)) continue;
    const timestamp = epochSeconds(order.createdAt) || Math.floor(Date.now() / 1000);
    let next = '';
    for (let offset = 0; offset < 3600; offset++) {
      const candidate = formatOrderNumber(timestamp + offset);
      if (!reserved.has(candidate)) { next = candidate; break; }
    }
    if (!next) throw new EndpointError('Could not allocate a unique order number.', { code: 'ORDER_NUMBER_UNAVAILABLE' });
    const result = await db.run(
      `UPDATE orders SET order_number = :next, updated_at = unixepoch()
        WHERE id = :id AND order_number = :previous`,
      { ':next': next, ':id': order.id, ':previous': previous },
    );
    if (Number(result?.rowsAffected) > 0) {
      reserved.delete(previous); reserved.add(next); changedOrders++;
      await db.run(`UPDATE checkout_operations SET
          canonical_snapshot = CASE WHEN canonical_snapshot IS NULL THEN NULL ELSE json_set(canonical_snapshot, '$.orderNumber', :next) END,
          response_snapshot = CASE WHEN response_snapshot IS NULL THEN NULL ELSE json_set(response_snapshot, '$.orderNumber', :next) END,
          updated_at = unixepoch()
        WHERE id = :id OR order_id = :id`, { ':next': next, ':id': order.id });
      await db.run(`UPDATE point_transactions SET description = replace(description, :previous, :next)
        WHERE order_id = :id AND description IS NOT NULL`, { ':previous': previous, ':next': next, ':id': order.id });
    }
  }
  return { changedMemberIds: changedMembers.length, changedOrderNumbers: changedOrders };
}
function normalizedCustomer(row, customerOrders) {
  const completed = customerOrders.filter(order => ['completed', 'delivered'].includes(String(order.status || '').toLowerCase()));
  const isVisitor = !row.primeMemberId || !String(row.primeMemberId).trim();
  return {
    id: row.id, tgUserId: row.tgUserId || '', tgName: row.tgName || '', tgUsername: row.tgUsername || '',
    phoneNumber: row.phoneNumber || '', primeMemberId: row.primeMemberId || '',
    visitorBadgeNo: row.visitorBadgeNo || (row.tgUserId ? `VIS-${row.tgUserId}` : `VIS-${row.id.slice(0, 6)}`),
    isVisitor,
      points: num(row.points), referralPoints: num(row.referralPoints), storeCredits: num(row.storeCredits),
      totalOrders: customerOrders.length, lifetimeSpent: completed.reduce((sum, order) => sum + num(order.totalAmount), 0), isBanned: row.isBanned === true,
    referredByUserId: row.referredByUserId || '', referredByMemberId: row.referredByMemberId || row.referredBy || '',
    createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), successfulOrders: completed.length,
    orders: customerOrders.map(order => ({
      id: order.id, orderNumber: order.orderNumber, createdAt: iso(order.createdAt), status: order.status,
      paymentStatus: order.paymentStatus, subtotal: num(order.subtotal), totalAmount: num(order.totalAmount),
      paymentMethodName: order.paymentMethodName || '', courierName: order.courierName || '',
      items: Array.isArray(order.items) ? order.items : [], deliveryAddress: order.deliveryAddress || {},
      fingerprintSnapshot: order.fingerprintSnapshot || null,
    })),
    fingerprints: fingerprintList(row.fingerprints).map(fp => ({
      deviceId: fp?.deviceId || fp?.device_id || '', hardwareId: fp?.hardwareId || fp?.hardware_id || '',
      deviceFingerprintId: fp?.deviceFingerprintId || fp?.device_fingerprint_id || '',
      sessionToken: fp?.sessionToken || fp?.session_token || '',
      userAgent: fp?.userAgent || fp?.user_agent || '', platform: fp?.platform || '',
      browser: fp?.browser || '', screenResolution: fp?.screenResolution || fp?.screen_resolution || '',
      firstSeen: iso(fp?.firstSeen || fp?.first_seen || fp?.capturedAt || fp?.captured_at),
      capturedAt: iso(fp?.capturedAt || fp?.captured_at),
      lastSeen: iso(fp?.lastSeen || fp?.last_seen || fp?.createdAt || fp?.created_at),
    })).sort((a, b) => (Date.parse(b.lastSeen || '') || 0) - (Date.parse(a.lastSeen || '') || 0)),
  };
}

export default async function (input = {}, ctx) {
  await requireAdmin(ctx);
  const action = String(input.action || 'list');
  if (action === 'normalizeTestIdentifiers') return normalizeTestIdentifiers();
  if (action === 'reverseErroneousOverpaymentCredit') {
    const orderId = String(input.orderId || '').trim();
    const amount = Math.round(Number(input.amount) * 100) / 100;
    const reason = String(input.reason || '').trim();
    if (!orderId || !Number.isFinite(amount) || amount <= 0 || amount > 100000 || !reason || reason.length > 500)
      throw new EndpointError('A valid order, positive amount, and reason are required.', { code: 'INVALID_ADJUSTMENT' });
    const order = await db.select().from(orders).where(or(eq(orders.id, orderId), eq(orders.orderNumber, orderId))).get();
    if (!order || !order.customerId) throw new EndpointError('The linked order/customer could not be found.', { code: 'ORDER_NOT_FOUND' });
    const expected = Math.round((Number(order.payableNow) || 0) * 100);
    const delivery = Math.round((Number(order.payableOnDelivery) || 0) * 100);
    const received = Math.round((Number(order.paymentReceivedAmount) || 0) * 100);
    if (delivery !== Math.round(amount * 100) || received !== expected)
      throw new EndpointError('This adjustment is allowed only when the credit exactly matches a pay-on-delivery amount and the recorded payment equals payable now.', { code: 'ADJUSTMENT_NOT_PROVEN' });
    const existing = await db.select().from(pointTransactions).where(eq(pointTransactions.orderId, orderId)).limit(200).all();
    const credit = existing.find(tx => String(tx.type) === 'store_credit_received' && Math.abs(Number(tx.amount) - amount) < 0.005);
    if (!credit) throw new EndpointError('No matching Store Credit receipt was found for this order.', { code: 'CREDIT_NOT_FOUND' });
    const adjustmentId = 'credit-adjustment-' + String(credit.id);
    const already = existing.find(tx => String(tx.id) === adjustmentId);
    if (already) return { success: true, alreadyApplied: true, customerId: order.customerId, amount };
    const changed = await db.run(`UPDATE customers SET store_credits=coalesce(store_credits,0)-:amount, updated_at=unixepoch()
      WHERE id=:customer_id AND coalesce(store_credits,0)>=:amount`, { ':customer_id': String(order.customerId), ':amount': amount });
    if (!Number(changed?.rowsAffected)) throw new EndpointError('The customer balance is lower than the requested reversal.', { code: 'BALANCE_TOO_LOW' });
    await db.run(`INSERT INTO point_transactions (id,user_id,type,amount,order_id,description,created_at)
      VALUES (:id,:user_id,'store_credit_adjustment',:amount,:order_id,:description,unixepoch())`,
      { ':id': adjustmentId, ':user_id': String(order.customerId), ':amount': -amount, ':order_id': orderId,
        ':description': 'Admin reversal: ' + reason });
    return { success: true, alreadyApplied: false, customerId: order.customerId, amount };
  }
  if (action === 'list') {
    const [people, allOrders] = await Promise.all([
      db.select().from(customers).orderBy(desc(customers.createdAt)).limit(500).all(),
      db.select().from(orders).orderBy(desc(orders.createdAt)).limit(2000).all(),
    ]);
    const counts = new Map();
    for (const order of allOrders) {
      const id = String(order.customerId || '');
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return people.map(row => ({
      id: row.id, tgUserId: row.tgUserId || '', tgName: row.tgName || '', tgUsername: row.tgUsername || '',
      phoneNumber: row.phoneNumber || '', primeMemberId: row.primeMemberId || '',
      points: num(row.points), referralPoints: num(row.referralPoints), storeCredits: num(row.storeCredits),
      totalOrders: counts.get(String(row.id)) ?? num(row.totalOrders), lifetimeSpent: num(row.lifetimeSpent),
      isBanned: row.isBanned === true, referredByMemberId: row.referredByMemberId || row.referredBy || '',
      createdAt: iso(row.createdAt), fingerprintCount: fingerprintList(row.fingerprints).length,
      latestFingerprint: fingerprintList(row.fingerprints).sort((a, b) =>
        (Date.parse(b?.lastSeen || b?.last_seen || '') || 0) - (Date.parse(a?.lastSeen || a?.last_seen || '') || 0))[0] || null,
    }));
  }
  if (action !== 'detail') throw new EndpointError('Unsupported customer action.', { code: 'INVALID_ACTION' });
  const id = String(input.id || '').trim();
  if (!id || id.length > 128) throw new EndpointError('A valid customer is required.', { code: 'INVALID_CUSTOMER' });
  const row = await db.select().from(customers).where(eq(customers.id, id)).get();
  if (!row) throw new EndpointError('Customer not found.', { code: 'NOT_FOUND' });
  const owned = [eq(orders.customerId, row.id)];
  if (row.tgUserId) owned.push(eq(orders.tgUserId, row.tgUserId));
  if (row.primeMemberId) owned.push(eq(orders.primeMemberId, row.primeMemberId));
  const customerOrders = await db.select().from(orders).where(or(...owned)).orderBy(desc(orders.createdAt)).limit(100).all();
  const dossier = normalizedCustomer(row, customerOrders);
  const customerTransactions = await db.select().from(pointTransactions)
    .where(eq(pointTransactions.userId, String(row.id)))
    .orderBy(desc(pointTransactions.createdAt)).limit(2000).all();
  dossier.storeCreditTransactions = customerTransactions
    .filter(tx => String(tx.type || '').startsWith('store_credit_')).slice(0, 200).map(tx => ({
    id: String(tx.id || ''), type: String(tx.type || ''), amount: num(tx.amount),
    orderId: String(tx.orderId || ''), description: String(tx.description || ''), createdAt: iso(tx.createdAt),
  }));
  const fingerprints = dossier.fingerprints;
  const ownIds = fingerprints.flatMap(fp => identifiers(fp));
  const keys = new Set(ownIds.map(item => `${item.type}:${item.value}`));
  if (keys.size) {
    const others = await db.select().from(customers).orderBy(desc(customers.createdAt)).limit(500).all();
    dossier.sharedAccounts = others.filter(other => other.id !== row.id).flatMap(other => {
      const matches = fingerprintList(other.fingerprints).flatMap(fp => identifiers(fp)
        .filter(item => keys.has(`${item.type}:${item.value}`)));
      const matchTypes = [...new Set(matches.map(item => item.type))];
      return matches.length ? [{ id: other.id, tgName: other.tgName || '', tgUsername: other.tgUsername || '', primeMemberId: other.primeMemberId || '', matchCount: matches.length, matchTypes }] : [];
    });
  } else dossier.sharedAccounts = [];
  return dossier;
}
