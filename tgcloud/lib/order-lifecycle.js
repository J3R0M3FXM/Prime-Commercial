import { db } from 'sdk';
import { sql } from 'sdk/db';
import { notifyOrderStatusChanged } from './order-notifications.js';

const THIRTY_MINUTES = 30 * 60;
const SIX_HOURS = 6 * 60 * 60;
const idText = (value) => String(value || '').trim();

function generateMemberId() {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 6; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function completeDispatchedOrder(orderId, completedAt) {
  const params = {
    ':order_id': idText(orderId),
    ':completed_at': Number(completedAt),
    ':credit_after': Number(completedAt) + THIRTY_MINUTES,
  };
  const result = await db.run(
    `UPDATE orders
        SET status = 'Completed', delivered_at = :completed_at, delivery_fallback_at = NULL,
            referral_points_status = CASE
              WHEN (trim(coalesce(referred_by_user_id, '')) <> '' OR trim(coalesce(referred_by_member_id, '')) <> '')
                THEN 'pending_30m' ELSE 'none' END,
            referral_points_credit_after = CASE
              WHEN (trim(coalesce(referred_by_user_id, '')) <> '' OR trim(coalesce(referred_by_member_id, '')) <> '')
                THEN :credit_after ELSE NULL END,
            purchasing_points_credit_after = CASE WHEN coalesce(purchasing_points_amount, 0) > 0
                THEN :credit_after ELSE NULL END,
            updated_at = unixepoch()
      WHERE id = :order_id AND lower(coalesce(status, '')) = 'dispatched'
      RETURNING id`,
    params,
  );
  const changed = Number(result?.rowsAffected) > 0;
  if (changed) {
    const order = await db.get(
      `SELECT id, order_number AS orderNumber, tg_user_id AS tgUserId, customer_id AS customerId,
              customer_name AS customerName, total_amount AS totalAmount,
              payable_now AS payableNow, courier_name AS courierName,
              tracking_number AS trackingNumber, payment_status AS paymentStatus
         FROM orders WHERE id = :order_id`,
      { ':order_id': idText(orderId) },
    );
    if (order) {
      const custKey = order.customerId || order.tgUserId;
      if (custKey) {
        const cust = await db.get(
          `SELECT id, prime_member_id AS primeMemberId FROM customers WHERE id = :key OR tg_user_id = :key`,
          { ':key': String(custKey) }
        );
        if (cust && (!cust.primeMemberId || !String(cust.primeMemberId).trim())) {
          let newPrimeId = '';
          for (let attempt = 0; attempt < 20; attempt++) {
            const candidate = generateMemberId();
            const existing = await db.get(`SELECT id FROM customers WHERE prime_member_id = :prime_id`, { ':prime_id': candidate });
            if (!existing) { newPrimeId = candidate; break; }
          }
          if (newPrimeId) {
            await db.run(
              `UPDATE customers SET prime_member_id = :prime_id, updated_at = unixepoch() WHERE id = :id AND (prime_member_id IS NULL OR trim(prime_member_id) = '')`,
              { ':prime_id': newPrimeId, ':id': cust.id }
            );
            await db.run(
              `UPDATE orders SET prime_member_id = :prime_id WHERE id = :order_id`,
              { ':prime_id': newPrimeId, ':order_id': idText(orderId) }
            );
          }
        }
      }

      await notifyOrderStatusChanged({
        chatId: order.tgUserId, orderNumber: order.orderNumber || order.id,
        status: 'Completed', customerName: order.customerName,
        totalAmount: Number(order.totalAmount) || 0, payableNow: Number(order.payableNow) || 0,
        courierName: order.courierName, trackingNumber: order.trackingNumber,
        paymentStatus: order.paymentStatus,
      });
    }
  }
  return changed;
}

/** Mark an eligible paid order dispatched; customer/staff may confirm before the six-hour fallback. */
export async function markOrderDispatched(orderId, trackingUrl) {
  const result = await db.run(
    `UPDATE orders SET status = 'Dispatched', tracking_url = :tracking_url, dispatched_at = unixepoch(),
            delivery_fallback_at = unixepoch() + :fallback_seconds, updated_at = unixepoch()
      WHERE id = :order_id AND lower(coalesce(payment_status, '')) IN ('paid', 'completed')
        AND (coalesce(adjustment_due, 0) <= 0 OR lower(coalesce(adjustment_status, '')) = 'paid')
        AND lower(coalesce(status, '')) IN ('ready', 'packed')
      RETURNING id, dispatched_at AS dispatchedAt, delivery_fallback_at AS deliveryFallbackAt`,
    { ':order_id': idText(orderId), ':tracking_url': String(trackingUrl || ''), ':fallback_seconds': SIX_HOURS },
  );
  return result?.rows?.[0] || null;
}

/** Final pre-dispatch gate. Store Credit refunds from Processing edits vest here. */
export async function markOrderReady(orderId) {
  const current = await db.get(
    `SELECT id, order_number AS orderNumber, customer_id AS customerId, status, payment_status AS paymentStatus,
            adjustment_due AS adjustmentDue, adjustment_status AS adjustmentStatus,
            ready_credit_due AS readyCreditDue, ready_credit_issued_amount AS readyCreditIssuedAmount,
            staff_edit_version AS staffEditVersion
       FROM orders WHERE id=:order_id`,
    { ':order_id': idText(orderId) },
  );
  if (!current) return { ready: false, reason: 'order_missing' };
  if (['ready', 'packed'].includes(String(current.status || '').toLowerCase())) {
    const priorOperation = 'order-ready:' + idText(orderId) + ':' + (Number(current.staffEditVersion) || 0);
    const issuedAmount = Math.max(0, Math.round((Number(current.readyCreditIssuedAmount) || 0) * 100));
    if (issuedAmount > 0 && current.customerId) await db.run(
      `INSERT INTO point_transactions (id, user_id, type, amount, order_id, description, created_at)
       VALUES (:id, :user_id, 'store_credit_received', :amount, :order_id, :description, unixepoch())
       ON CONFLICT(id) DO NOTHING`,
      { ':id': 'credit-ready-' + idText(orderId) + '-' + (Number(current.staffEditVersion) || 0),
        ':user_id': String(current.customerId), ':amount': issuedAmount / 100, ':order_id': idText(orderId),
        ':description': 'Store Credit refund for paid order edit #' + String(current.orderNumber || orderId) },
    );
    if (Number(current.readyCreditIssuedAmount) > 0 && current.customerId) await db.run(
      `UPDATE customers SET store_credits_operation_id=NULL, store_credits_operation_amount=0, updated_at=unixepoch()
        WHERE id=:customer_id AND store_credits_operation_id=:operation_id`,
      { ':customer_id': String(current.customerId), ':operation_id': priorOperation },
    );
    return { ready: true, alreadyReady: true };
  }
  if (String(current.status || '').toLowerCase() !== 'processing' || String(current.paymentStatus || '').toLowerCase() !== 'paid')
    return { ready: false, reason: 'order_not_paid_processing' };
  if (Number(current.adjustmentDue || 0) > 0 && String(current.adjustmentStatus || '').toLowerCase() !== 'paid')
    return { ready: false, reason: 'adjustment_unpaid' };

  const refund = Math.round((Number(current.readyCreditDue) || 0) * 100) / 100;
  const operationId = 'order-ready:' + idText(orderId) + ':' + (Number(current.staffEditVersion) || 0);
  if (refund > 0) {
    if (!current.customerId) return { ready: false, reason: 'customer_missing' };
    const customer = await db.get(
      `SELECT store_credits_operation_id AS operationId FROM customers WHERE id=:customer_id`,
      { ':customer_id': String(current.customerId) },
    );
    if (customer?.operationId && customer.operationId !== operationId) return { ready: false, reason: 'credits_busy' };
    if (customer?.operationId !== operationId) {
      const credit = await db.run(
        `UPDATE customers SET store_credits=coalesce(store_credits,0)+:amount,
                store_credits_operation_id=:operation_id, store_credits_operation_amount=:amount,
                updated_at=unixepoch()
          WHERE id=:customer_id AND (store_credits_operation_id IS NULL OR trim(store_credits_operation_id)='')
          RETURNING id`,
        { ':customer_id': String(current.customerId), ':amount': refund, ':operation_id': operationId },
      );
      if (!Number(credit?.rowsAffected)) return { ready: false, reason: 'credits_busy' };
    }
  }

  const changed = await db.run(
    `UPDATE orders SET status='Ready', ready_at=coalesce(ready_at, unixepoch()), ready_credit_due=0,
            ready_credit_issued_amount=coalesce(ready_credit_issued_amount,0)+:refund,
            updated_at=unixepoch()
      WHERE id=:order_id AND lower(coalesce(status,''))='processing'
        AND lower(coalesce(payment_status,''))='paid'
        AND (coalesce(adjustment_due,0)<=0 OR lower(coalesce(adjustment_status,''))='paid')
        AND coalesce(staff_edit_version,0)=:edit_version
      RETURNING id`,
    { ':order_id': idText(orderId), ':refund': refund, ':edit_version': Number(current.staffEditVersion) || 0 },
  );
  if (!Number(changed?.rowsAffected)) return { ready: false, reason: 'order_changed' };
  if (refund > 0) await db.run(
    `INSERT INTO point_transactions (id, user_id, type, amount, order_id, description, created_at)
     VALUES (:id, :user_id, 'store_credit_received', :amount, :order_id, :description, unixepoch())
     ON CONFLICT(id) DO NOTHING`,
    { ':id': 'credit-ready-' + idText(orderId) + '-' + (Number(current.staffEditVersion) || 0),
      ':user_id': String(current.customerId), ':amount': refund, ':order_id': idText(orderId),
      ':description': 'Store Credit refund for paid order edit #' + String(current.orderNumber || orderId) },
  );
  if (refund > 0) await db.run(
    `UPDATE customers SET store_credits_operation_id=NULL, store_credits_operation_amount=0, updated_at=unixepoch()
      WHERE id=:customer_id AND store_credits_operation_id=:operation_id`,
    { ':customer_id': String(current.customerId), ':operation_id': operationId },
  );
  return { ready: true, alreadyReady: false, storeCreditIssued: refund };
}

/** Customer receipt or staff completion starts the 30-minute rewards delay. */
export async function markOrderCompleted(orderId, completedAt = Math.floor(Date.now() / 1000)) {
  const changed = await completeDispatchedOrder(orderId, completedAt);
  if (changed) return { completed: true, alreadyCompleted: false };
  const current = await db.get(
    `SELECT status, delivered_at AS deliveredAt FROM orders WHERE id = :order_id`,
    { ':order_id': idText(orderId) },
  );
  return current && ['completed', 'delivered'].includes(String(current.status || '').toLowerCase())
    ? { completed: true, alreadyCompleted: true, deliveredAt: current.deliveredAt }
    : { completed: false, reason: 'order_not_dispatched' };
}

async function applyMaturedReferral(order) {
  const orderId = idText(order.id);
  const operationId = 'referral-award:' + orderId;
  const status = String(order.referralPointsStatus || '').toLowerCase();
  if (['pending_30m', 'crediting'].includes(status)) {
    if (status === 'pending_30m') {
      const claim = await db.run(
        `UPDATE orders SET referral_points_status = 'crediting', updated_at = unixepoch()
          WHERE id = :order_id AND referral_points_status = 'pending_30m'
            AND referral_points_credit_after <= unixepoch()
            AND lower(coalesce(status, '')) IN ('completed', 'delivered')
          RETURNING id`,
        { ':order_id': orderId },
      );
      if (!Number(claim?.rowsAffected)) {
        const fresh = await db.get(`SELECT referral_points_status AS status FROM orders WHERE id = :order_id`, { ':order_id': orderId });
        if (String(fresh?.status || '').toLowerCase() !== 'crediting') return { credited: false, pending: false };
      }
    }
  } else if (status === 'credited') {
    const marker = await db.get(
      `SELECT points_operation_id AS operationId FROM customers
        WHERE (:referrer_id <> '' AND id = :referrer_id)
           OR (:referrer_member_id <> '' AND upper(coalesce(prime_member_id, '')) = upper(:referrer_member_id))
        ORDER BY CASE WHEN id = :referrer_id THEN 0 ELSE 1 END
        LIMIT 1`,
      { ':referrer_id': idText(order.referredByUserId), ':referrer_member_id': idText(order.referredByMemberId) },
    );
    if (marker?.operationId !== operationId) return { credited: true, pending: false, alreadyCredited: true };
  } else {
    return { credited: false, pending: false };
  }

  const referrer = await db.get(
    `SELECT id, points_operation_id AS operationId
       FROM customers
      WHERE (:user_id <> '' AND id = :user_id)
         OR (:member_id <> '' AND upper(coalesce(prime_member_id, '')) = upper(:member_id))
      ORDER BY CASE WHEN id = :user_id THEN 0 ELSE 1 END LIMIT 1`,
    { ':user_id': idText(order.referredByUserId), ':member_id': idText(order.referredByMemberId) },
  );
  if (!referrer || String(referrer.id) === String(order.customerId || '')) {
    await db.run(
      `UPDATE orders SET referral_points_status = 'rejected', updated_at = unixepoch()
        WHERE id = :order_id AND referral_points_status = 'crediting'`,
      { ':order_id': orderId },
    );
    return { credited: false, pending: false, reason: 'referrer_missing' };
  }
  const amount = Math.max(0, Number(order.referralPointsAmount) || 0);
  if (!referrer.operationId) {
    const eligible = await db.get(`SELECT id FROM orders
      WHERE customer_id = :customer_id AND lower(coalesce(status, '')) IN ('completed', 'delivered') LIMIT 1`,
    { ':customer_id': String(referrer.id) });
    if (!eligible) return { credited: false, pending: true, reason: 'referrer_delivery_pending' };
  }
  if (referrer.operationId && referrer.operationId !== operationId) {
    return { credited: false, pending: true, reason: 'referrer_points_busy' };
  }
  if (!referrer.operationId) {
    const reserved = await db.run(
      `UPDATE customers SET referral_points = coalesce(referral_points, 0) + :amount,
              points_operation_id = :operation_id,
              points_operation_amount = :amount, updated_at = unixepoch()
        WHERE id = :customer_id AND points_operation_id IS NULL
          AND EXISTS (SELECT 1 FROM orders WHERE id = :order_id AND referral_points_status = 'crediting')
          AND EXISTS (SELECT 1 FROM orders own WHERE own.customer_id = :customer_id
            AND lower(coalesce(own.status, '')) IN ('completed', 'delivered'))
          AND EXISTS (SELECT 1 FROM orders referred WHERE referred.id = :order_id
            AND lower(coalesce(referred.status, '')) IN ('completed', 'delivered'))
        RETURNING id`,
      { ':amount': amount, ':operation_id': operationId, ':customer_id': String(referrer.id), ':order_id': orderId },
    );
    if (!Number(reserved?.rowsAffected)) {
      const fresh = await db.get(`SELECT referral_points_status AS status FROM orders WHERE id = :order_id`, { ':order_id': orderId });
      if (String(fresh?.status || '').toLowerCase() === 'credited') return { credited: true, pending: false, alreadyCredited: true };
      return { credited: false, pending: true, reason: 'referrer_points_busy' };
    }
  }
  await db.run(
    `INSERT INTO point_transactions (id, user_id, type, amount, order_id, description, created_at)
     VALUES (:id, :user_id, 'referral', :amount, :order_id, :description, unixepoch())
     ON CONFLICT(id) DO NOTHING`,
    { ':id': 'tx-referral-' + orderId, ':user_id': String(referrer.id), ':amount': amount,
      ':order_id': orderId, ':description': '50 Referral Points for Order #' + String(order.orderNumber || orderId) },
  );
  await db.run(
    `UPDATE orders SET referral_points_status = 'credited',
            referral_points_credited_at = coalesce(referral_points_credited_at, referral_points_credit_after),
            updated_at = unixepoch()
      WHERE id = :order_id AND referral_points_status IN ('crediting', 'credited')`,
    { ':order_id': orderId },
  );
  await db.run(
    `UPDATE customers SET points_operation_id = NULL,
            points_operation_amount = 0, updated_at = unixepoch()
      WHERE id = :customer_id AND points_operation_id = :operation_id`,
    { ':customer_id': String(referrer.id), ':operation_id': operationId },
  );
  return { credited: true, pending: false };
}

async function applyMaturedPurchasingPoints(order) {
  const orderId = idText(order.id);
  const operationId = 'purchasing-award:' + orderId;
  const amount = Math.max(0, Number(order.purchasingPointsAmount) || 0);
  if (amount <= 0) return { awarded: false, pending: false };
  const customer = await db.get(
    `SELECT points_operation_id AS operationId FROM customers WHERE id = :customer_id`,
    { ':customer_id': idText(order.customerId) },
  );
  if (!customer) return { awarded: false, pending: false, reason: 'customer_missing' };
  if (order.purchasingPointsAwardedAt && customer.operationId !== operationId) {
    return { awarded: true, pending: false, alreadyAwarded: true };
  }
  if (customer.operationId && customer.operationId !== operationId) {
    return { awarded: false, pending: true, reason: 'customer_points_busy' };
  }
  if (!customer.operationId) {
    const reserved = await db.run(
      `UPDATE customers SET points = coalesce(points, 0) + :amount,
              points_operation_id = :operation_id, points_operation_amount = :amount,
              updated_at = unixepoch()
        WHERE id = :customer_id AND points_operation_id IS NULL
          AND EXISTS (SELECT 1 FROM orders WHERE id = :order_id
            AND purchasing_points_awarded_at IS NULL
            AND purchasing_points_credit_after <= unixepoch()
            AND lower(coalesce(status, '')) IN ('completed', 'delivered'))
        RETURNING id`,
      { ':amount': amount, ':operation_id': operationId,
        ':customer_id': idText(order.customerId), ':order_id': orderId },
    );
    if (!Number(reserved?.rowsAffected)) {
      const fresh = await db.get(`SELECT purchasing_points_awarded_at AS awardedAt FROM orders WHERE id = :order_id`, { ':order_id': orderId });
      if (fresh?.awardedAt) return { awarded: true, pending: false, alreadyAwarded: true };
      return { awarded: false, pending: true, reason: 'customer_points_busy' };
    }
  }
  await db.run(
    `INSERT INTO point_transactions (id, user_id, type, amount, order_id, description, created_at)
     VALUES (:id, :user_id, 'purchasing', :amount, :order_id, :description, unixepoch())
     ON CONFLICT(id) DO NOTHING`,
    { ':id': 'tx-purchase-' + orderId, ':user_id': idText(order.customerId), ':amount': amount,
      ':order_id': orderId, ':description': 'Purchasing Points reward for Order #' + String(order.orderNumber || orderId) },
  );
  await db.run(
    `UPDATE orders SET purchasing_points_awarded_at = coalesce(purchasing_points_awarded_at, purchasing_points_credit_after),
            updated_at = unixepoch()
      WHERE id = :order_id AND lower(coalesce(status, '')) IN ('completed', 'delivered')`,
    { ':order_id': orderId },
  );
  await db.run(
    `UPDATE customers SET points_operation_id = NULL, points_operation_amount = 0, updated_at = unixepoch()
      WHERE id = :customer_id AND points_operation_id = :operation_id`,
    { ':customer_id': idText(order.customerId), ':operation_id': operationId },
  );
  return { awarded: true, pending: false };
}

/** Bounded, request-driven 30-minute loyalty maturity reconciliation. */
export async function reconcileOrderMilestones({ customerId = '', memberId = '', limit = 10 } = {}) {
  const customer = idText(customerId);
  const member = idText(memberId);
  const maxRows = Math.max(1, Math.min(20, Number(limit) || 10));
  const autoCompleted = 0;

  const referrerFilter = customer || member
    ? sql`AND ((${customer} <> '' AND o.referred_by_user_id = ${customer})
         OR (${member} <> '' AND upper(coalesce(o.referred_by_member_id, '')) = upper(${member})))`
    : sql``;
  const referralRows = await db.all(sql`
    SELECT o.id, o.order_number AS orderNumber, o.customer_id AS customerId,
            o.referred_by_user_id AS referredByUserId, o.referred_by_member_id AS referredByMemberId,
            o.referral_points_amount AS referralPointsAmount,
            o.referral_points_status AS referralPointsStatus,
            o.referral_points_credit_after AS referralPointsCreditAfter
       FROM orders o
      WHERE o.referral_points_credit_after <= unixepoch()
        AND lower(coalesce(o.status, '')) IN ('completed', 'delivered')
        AND EXISTS (SELECT 1 FROM customers ref
          WHERE ((o.referred_by_user_id <> '' AND ref.id = o.referred_by_user_id)
            OR (o.referred_by_member_id <> '' AND upper(ref.prime_member_id) = upper(o.referred_by_member_id)))
          AND (ref.points_operation_id = 'referral-award:' || o.id OR EXISTS (
            SELECT 1 FROM orders own WHERE own.customer_id = ref.id
              AND lower(coalesce(own.status, '')) IN ('completed', 'delivered'))))
        AND (o.referral_points_status IN ('pending_30m', 'crediting') OR
             (o.referral_points_status = 'credited' AND EXISTS (
               SELECT 1 FROM customers c
                WHERE ((trim(coalesce(o.referred_by_user_id, '')) <> '' AND c.id = o.referred_by_user_id)
                    OR (trim(coalesce(o.referred_by_member_id, '')) <> ''
                        AND upper(coalesce(c.prime_member_id, '')) = upper(o.referred_by_member_id)))
                  AND c.points_operation_id = 'referral-award:' || o.id)))
        ${referrerFilter}
      ORDER BY o.referral_points_credit_after ASC
      LIMIT ${maxRows}`);
  let credited = 0;
  let pending = 0;
  for (const order of referralRows) {
    const result = await applyMaturedReferral(order);
    if (result.credited) credited += 1;
    if (result.pending) pending += 1;
  }

  const purchasingCustomerFilter = customer ? sql`AND o.customer_id = ${customer}` : sql``;
  const purchasingRows = await db.all(sql`
    SELECT o.id, o.customer_id AS customerId, o.order_number AS orderNumber,
            o.purchasing_points_amount AS purchasingPointsAmount,
            o.purchasing_points_credit_after AS purchasingPointsCreditAfter,
            o.purchasing_points_awarded_at AS purchasingPointsAwardedAt
       FROM orders o
      WHERE o.purchasing_points_credit_after <= unixepoch()
        AND lower(coalesce(o.status, '')) IN ('completed', 'delivered')
        AND (o.purchasing_points_awarded_at IS NULL OR EXISTS (
          SELECT 1 FROM customers c WHERE c.id = o.customer_id
            AND c.points_operation_id = 'purchasing-award:' || o.id))
        AND coalesce(o.purchasing_points_amount, 0) > 0
        ${purchasingCustomerFilter}
      ORDER BY o.purchasing_points_credit_after ASC
      LIMIT ${maxRows}`);
  let purchasingAwarded = 0;
  for (const order of purchasingRows) {
    const result = await applyMaturedPurchasingPoints(order);
    if (result.awarded) purchasingAwarded += 1;
    if (result.pending) pending += 1;
  }
  return { autoCompleted, credited, purchasingAwarded, pending };
}
