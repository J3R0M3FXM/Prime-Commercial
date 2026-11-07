import { db, EndpointError } from 'sdk';
import { desc, inArray, eq, and, isNull, sql } from 'sdk/db';
import { customers, orders, products, inventoryReservations } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';
import { markOrderCompleted, markOrderDispatched, markOrderReady, reconcileOrderMilestones } from '../lib/order-lifecycle.js';
import { notifyOrderStatusChanged, notifyPaymentUpdated } from '../lib/order-notifications.js';
import { requestOrderCancellation } from '../lib/order-cancellation.js';
import { applyOrderControl } from '../lib/order-controls.js';

function timestampMs(value, depth = 0) {
  if (depth > 3 || value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return timestampMs(value.toDate(), depth + 1);
    for (const key of ['epochMilliseconds', 'epochMillis', 'milliseconds', 'timestamp', 'epochSeconds', 'seconds', '_seconds', '$date', 'value']) {
      if (value[key] != null) {
        const parsed = timestampMs(value[key], depth + 1);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? (numeric > 1e12 ? numeric : numeric * 1000) : null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampIso(value) {
  const ms = timestampMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

function normalizeHttpsTrackingUrl(value) {
  const text = String(value || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  const match = /^https:\/\/([^/?#]+)(?:[/?#][^\s]*)?$/i.exec(text);
  if (!match) return null;
  const authority = match[1];
  if (authority.includes('@') || authority.includes('\\')) return null;
  const portSplit = authority.match(/^(.+?)(?::(\d+))?$/);
  if (!portSplit) return null;
  const hostname = portSplit[1].toLowerCase();
  if (portSplit[2] && (Number(portSplit[2]) < 1 || Number(portSplit[2]) > 65535)) return null;
  const labels = hostname.split('.');
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
  return text;
}

export default async function (input, ctx) {
  const staff = await requireAdmin(ctx);
  const action = String(input?.action || 'list');
  if (action === 'list') {
    let reconciliationWarning = '';
    try {
      await reconcileOrderMilestones({ limit: 20 });
    } catch (error) {
      // Listing orders must remain available even if request-driven milestone recovery fails.
      const detail = String(error?.message || '').replace(/[\r\n\t]+/g, ' ').slice(0, 180);
      reconciliationWarning = detail
        ? 'Order milestones could not be reconciled during this refresh: ' + detail
        : 'Order milestones could not be reconciled during this refresh.';
    }
    const rows = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(100).all();
    const telegramIds = Array.from(new Set(rows.map((order) => String(order.tgUserId || '')).filter(Boolean)));
    const profiles = telegramIds.length
      ? await db.select({ tgUserId: customers.tgUserId, tgName: customers.tgName, tgUsername: customers.tgUsername })
        .from(customers).where(inArray(customers.tgUserId, telegramIds)).all()
      : [];
    const profileByTelegramId = new Map(profiles.map((profile) => [String(profile.tgUserId), profile]));
    return { orders: rows.map((order) => ({
      ...order,
      telegramName: profileByTelegramId.get(String(order.tgUserId || ''))?.tgName || '',
      telegramUsername: profileByTelegramId.get(String(order.tgUserId || ''))?.tgUsername || '',
      createdAt: timestampIso(order.createdAt),
      updatedAt: timestampIso(order.updatedAt),
      readyAt: timestampIso(order.readyAt),
      paymentDeadlineAt: timestampIso(order.paymentDeadlineAt),
      expiredAt: timestampIso(order.expiredAt),
      dispatchedAt: timestampIso(order.dispatchedAt),
      deliveredAt: timestampIso(order.deliveredAt),
    })), reconciliationWarning };
  }

  const orderId = String(input?.orderId || input?.id || '').trim();
  if (!orderId) throw new EndpointError('Order ID is required.', { code: 'INVALID_INPUT' });

  if (action === 'holdOrder' || action === 'resubmitOrder' || action === 'dispatchOverride') {
    const controlAction = action === 'holdOrder' ? 'hold' : action === 'resubmitOrder' ? 'resubmit' : 'dispatch_override';
    const result = await applyOrderControl({ orderId, actorTelegramId: staff.id, action: controlAction,
      reason: input?.reason, operationId: input?.operationId });
    const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (order) await notifyOrderStatusChanged({ chatId: order.tgUserId, orderNumber: order.orderNumber || order.id,
      status: controlAction === 'hold' ? 'On Hold' : controlAction === 'resubmit' ? 'Resubmitted' : 'Dispatched',
      paymentStatus: order.paymentStatus, totalAmount: Number(order.totalAmount) || 0,
      courierName: order.courierName, trackingNumber: order.trackingNumber,
      trackingOverridden: controlAction === 'dispatch_override',
      controlEventId: result.eventId });
    return result;
  }

  if (action === 'expireUnpaid' || action === 'cancelUnpaid' || action === 'rejectUnpaid') {
    throw new EndpointError('The unpaid-order expiry workflow is retired. Use the current payment review and cancellation flow.', { code: 'LEGACY_WORKFLOW_RETIRED' });
  }
  if (action === 'cancelOrder' || action === 'rejectOrder') {
    const current = await db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!current) throw new EndpointError('Order not found.', { code: 'NOT_FOUND' });
    return requestOrderCancellation(current, action === 'rejectOrder' ? 'reject' : 'cancel', {
      staffOverride: true,
      actorTelegramId: staff.id,
      reason: input?.reason,
    });
  }

  const notifyStatus = async (status, trackingUrl) => {
    const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) return;
    await notifyOrderStatusChanged({
      chatId: order.tgUserId, orderNumber: order.orderNumber || order.id, status,
      primeMemberId: order.primeMemberId,
      customerName: order.customerName, totalAmount: Number(order.totalAmount) || 0,
      payableNow: Number(order.payableNow) || 0, courierName: order.courierName,
      trackingNumber: order.trackingNumber,
      trackingUrl: trackingUrl ?? order.trackingUrl,
      paymentStatus: order.paymentStatus,
    });
  };
  const notifyPayment = async () => {
    const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) return;
    await notifyPaymentUpdated({
      chatId: order.tgUserId, orderNumber: order.orderNumber || order.id,
      primeMemberId: order.primeMemberId, customerName: order.customerName,
      status: order.status, totalAmount: Number(order.totalAmount) || 0,
      paymentStatus: order.paymentStatus,
    });
  };

  if (action === 'edit') {
    const current = await db.select().from(orders).where(eq(orders.id, orderId)).get();
    const expectedVersion = Number(input?.expectedVersion);
    const version = Number(current?.staffEditVersion || 0);
    const currentStatus = String(current?.status || '').toLowerCase();
    const currentPayment = String(current?.paymentStatus || '').toLowerCase();
    const paidDownwardEdit = currentPayment === 'paid' && ['processing', 'ready', 'packed'].includes(currentStatus);
    if (!current || (!((currentStatus === 'pending' && currentPayment !== 'paid') || paidDownwardEdit)))
      throw new EndpointError('Only unpaid Pending orders or paid in-house orders can be edited.', { code: 'ORDER_NOT_EDITABLE' });
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== version)
      throw new EndpointError('This order was updated elsewhere. Refresh it and reapply your changes.', { code: 'ORDER_CHANGED' });
    if (Number(current.adjustmentDue || 0) > 0 && String(current.adjustmentStatus || '').toLowerCase() !== 'paid')
      throw new EndpointError('Resolve the outstanding payment adjustment before editing this order.', { code: 'ADJUSTMENT_PENDING' });
    let lines = input?.items;
    try { if (typeof lines === 'string') lines = JSON.parse(lines); } catch { lines = null; }
    if (!Array.isArray(lines)) lines = [];
    if (!lines.length || lines.length > 100) throw new EndpointError('Keep at least one item in the order.', { code: 'INVALID_ITEMS' });
    const heldRows = await db.all(`SELECT product_id AS productId, variant_id AS variantId, quantity
      FROM inventory_reservations WHERE order_id=:id AND status<>'released'`, { ':id': orderId });
    const heldBySku = new Map((heldRows || []).map((row) => [String(row.productId) + '_' + String(row.variantId || 'default'), Number(row.quantity) || 0]));
    const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const items = [];
    for (const line of lines) {
      const rawId = String(line?.id || '').trim();
      const productId = String(line?.productId || (rawId.includes('_') ? rawId.slice(0, rawId.indexOf('_')) : rawId)).trim();
      const variantId = String(line?.variantId || (rawId.includes('_') ? rawId.slice(rawId.indexOf('_') + 1) : 'default')).trim() || 'default';
      const quantity = Number(line?.quantity);
      const price = Number(line?.price);
      const mode = String(line?.offerMode || 'none').toLowerCase();
      const value = Number(line?.offerValue || 0);
      if (!productId || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000 ||
          !Number.isFinite(price) || price < 0 || !['none', 'percent', 'fixed', 'free'].includes(mode) ||
          !Number.isFinite(value) || value < 0 || (mode === 'percent' && value > 100))
        throw new EndpointError('Check each item price, quantity, and offer.', { code: 'INVALID_ITEMS' });
      if (quantity === 0) continue;
      if (!heldBySku.has(productId + '_' + variantId) || quantity > heldBySku.get(productId + '_' + variantId))
        throw new EndpointError('This change increases reserved stock or adds an unreserved item. Reduce quantities here; stock increases and new items need a fresh inventory reservation flow.', { code: 'INVENTORY_RESERVATION_REQUIRED' });
      const product = await db.select().from(products).where(eq(products.id, productId)).get();
      if (!product || product.isActive === false) throw new EndpointError('An item is no longer available.', { code: 'PRODUCT_UNAVAILABLE' });
      const bundle = product.bundleConfig && typeof product.bundleConfig === 'object' ? product.bundleConfig : {};
      const variants = Array.isArray(bundle.variants) ? bundle.variants : [];
      const variant = variants.length ? variants.find((v) => String(v?.id) === variantId) : null;
      if (variants.length && !variant) throw new EndpointError('An item option is no longer available.', { code: 'VARIANT_UNAVAILABLE' });
      let unit = money(price);
      if (mode === 'percent') unit = money(unit * (100 - value) / 100);
      if (mode === 'fixed') unit = money(Math.max(0, unit - value));
      if (mode === 'free') unit = 0;
      items.push({ ...line, id: productId + '_' + variantId, productId, variantId,
        name: String(line.name || product.name) + (variant ? ' - ' + String(variant.name || variantId) : ''),
        quantity, originalPrice: money(price), price: unit, offerMode: mode, offerValue: money(value), isFree: mode === 'free' || unit === 0 });
    }
    if (!items.length) throw new EndpointError('Keep at least one item in the order.', { code: 'INVALID_ITEMS' });
    const subtotal = money(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
    const discountMode = String(input?.discountMode || 'none').toLowerCase();
    const discountValue = Number(input?.discountValue || 0);
    if (!['none', 'percent', 'fixed'].includes(discountMode) || !Number.isFinite(discountValue) || discountValue < 0 || (discountMode === 'percent' && discountValue > 100))
      throw new EndpointError('Enter a valid order discount.', { code: 'INVALID_DISCOUNT' });
    const staffDiscount = money(Math.min(subtotal, discountMode === 'percent' ? subtotal * discountValue / 100 : discountMode === 'fixed' ? discountValue : 0));
    const deliveryFee = Number(input?.deliveryFee);
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0 || deliveryFee > 1_000_000) throw new EndpointError('Enter a valid delivery fee.', { code: 'INVALID_DELIVERY_FEE' });
    let rawCharges = input?.charges;
    try { if (typeof rawCharges === 'string') rawCharges = JSON.parse(rawCharges); } catch { rawCharges = null; }
    if (!Array.isArray(rawCharges)) rawCharges = [];
    if (rawCharges.length > 20) throw new EndpointError('Too many additional charge lines.', { code: 'INVALID_CHARGES' });
    const charges = rawCharges.map((charge) => {
      const name = String(charge?.name || '').trim().slice(0, 80);
      const type = String(charge?.type || 'fixed').toLowerCase();
      const value = Number(charge?.value);
      if (!name || !['fixed', 'percentage'].includes(type) || !Number.isFinite(value) || value < 0 || value > 1_000_000)
        throw new EndpointError('Check the additional charge lines.', { code: 'INVALID_CHARGES' });
      return { id: String(charge?.id || 'staff-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-')), name, type, rate: money(value), computedAmount: money(type === 'percentage' ? subtotal * value / 100 : value), staffAdded: true };
    });
    const chargeTotal = money(charges.reduce((sum, charge) => sum + charge.computedAmount, 0));
    const oldDeliveryDue = Number(current.payableOnDelivery || 0);
    const deliveryIsCod = oldDeliveryDue > 0;
    const total = money(Math.max(0, subtotal - staffDiscount - Number(current.discountAmount || 0) - Number(current.pointsDiscount || 0)) + chargeTotal + deliveryFee - Number(current.promoShippingSubsidy || 0));
    const payableOnDelivery = deliveryIsCod ? deliveryFee : 0;
    const payableNow = money(Math.max(0, total - payableOnDelivery - Number(current.storeCreditsUsed || 0)));
    const reconcileReducedHolds = async () => {
      for (const [sku, heldQuantity] of heldBySku) {
        const line = items.find((item) => item.productId + '_' + item.variantId === sku);
        if (!line) {
          await db.run(`UPDATE inventory_reservations SET quantity=0,status='released',updated_at=unixepoch() WHERE order_id=:order_id AND product_id=:product_id AND variant_id=:variant_id`,
            { ':order_id': orderId, ':product_id': sku.slice(0, sku.lastIndexOf('_')), ':variant_id': sku.slice(sku.lastIndexOf('_') + 1) });
        } else if (line.quantity < heldQuantity) {
          await db.run(`UPDATE inventory_reservations SET quantity=:quantity,updated_at=unixepoch() WHERE order_id=:order_id AND product_id=:product_id AND variant_id=:variant_id AND status<>'released'`,
            { ':order_id': orderId, ':product_id': line.productId, ':variant_id': line.variantId, ':quantity': line.quantity });
        }
      }
    };
    if (paidDownwardEdit && total > Number(current.totalAmount || 0) + 0.005)
      throw new EndpointError('A paid order can only be reduced. Use a new transaction for any increase.', { code: 'PAID_ORDER_INCREASE' });
    const changed = await db.run(`UPDATE orders SET items=:items, subtotal=:subtotal, delivery_fee=:delivery_fee,
        charges_breakdown=:charges, staff_discount_amount=:discount, staff_discount_mode=:discount_mode,
        staff_discount_value=:discount_value, total_amount=:total, payable_now=:payable_now,
        payable_on_delivery=:payable_on_delivery, staff_edit_version=:next_version,
        ready_credit_due=0,
        updated_at=unixepoch()
      WHERE id=:id AND staff_edit_version=:expected_version
        AND ((lower(status)='pending' AND lower(payment_status)<>'paid')
          OR (lower(payment_status)='paid' AND lower(status) IN ('processing','ready','packed')))
        AND :new_total <= total_amount + 0.005 RETURNING id`,
      { ':items': JSON.stringify(items), ':subtotal': subtotal, ':delivery_fee': money(deliveryFee), ':charges': JSON.stringify(charges), ':discount': staffDiscount,
        ':discount_mode': discountMode, ':discount_value': money(discountValue), ':total': total, ':payable_now': payableNow,
        ':payable_on_delivery': payableOnDelivery,
        ':next_version': version + 1, ':expected_version': version, ':id': orderId, ':new_total': total });
    if (!Number(changed?.rowsAffected)) throw new EndpointError('The order changed; refresh and try again.', { code: 'ORDER_CHANGED' });
    await reconcileReducedHolds();
    return { success: true, orderId, totalAmount: total, payableNow };
  }

  if (action === 'markPaid') {
    const confirmedAmount = Number(input?.confirmedAmount);
    if (!Number.isFinite(confirmedAmount) || confirmedAmount < 0) {
      throw new EndpointError('Enter the amount verified in the payment provider.', { code: 'INVALID_INPUT' });
    }
    const pending = await db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (pending && ['processing', 'ready', 'packed'].includes(String(pending.status || '').toLowerCase()) && String(pending.paymentStatus || '').toLowerCase() === 'paid') {
      const priorVersion = Number(pending.staffEditVersion) || 0;
      const priorReceivedCents = Math.max(0, Math.round((Number(pending.paymentReceivedAmount ?? pending.confirmedPaidAmount) || 0) * 100));
      const priorDueCents = Math.max(0, Math.round((Number(pending.confirmedPaidAmount ?? pending.payableNow ?? pending.totalAmount) || 0) * 100));
      const priorExcessCents = Math.max(0, priorReceivedCents - priorDueCents);
      if (priorExcessCents > 0 && pending.customerId) await db.run(
        `INSERT INTO point_transactions (id, user_id, type, amount, order_id, description, created_at)
         VALUES (:id, :user_id, 'store_credit_received', :amount, :order_id, :description, unixepoch())
         ON CONFLICT(id) DO NOTHING`,
        { ':id': 'credit-received-' + orderId + '-' + priorReceivedCents,
          ':user_id': String(pending.customerId), ':amount': priorExcessCents / 100, ':order_id': orderId,
          ':description': 'Store Credit received from verified overpayment for Order #' + String(pending.orderNumber || orderId) },
      );
      const priorCreditOperation = 'order-paid:' + orderId + ':' + (Number(pending.staffEditVersion) || 0) + ':' + confirmedAmount.toFixed(2);
      if (pending.customerId) await db.run(`UPDATE customers SET store_credits_operation_id=NULL, store_credits_operation_amount=0, updated_at=unixepoch() WHERE id=:id AND store_credits_operation_id=:operation`, { ':id': pending.customerId, ':operation': priorCreditOperation });
      return { success: true, orderId, status: pending.status, paymentStatus: pending.paymentStatus, alreadyApproved: true };
    }
    const pendingPaymentStatus = String(pending?.paymentStatus || '').toLowerCase();
    const hasSubmittedProof = Boolean(String(pending?.paymentProofImage || '').trim());
    // Initial checkout may attach a payment-session receipt before the order exists.
    // That path historically persisted the order as Unpaid; allow the same manual
    // provider verification used for Pending Review receipts without trusting the image.
    const awaitingProofReview = pendingPaymentStatus === 'pending review' || (pendingPaymentStatus === 'unpaid' && hasSubmittedProof);
    if (!pending || String(pending.status || '').toLowerCase() !== 'pending' || !awaitingProofReview || !hasSubmittedProof || String(pending.controlState || 'normal').toLowerCase() === 'held')
      throw new EndpointError('Only a Pending order with a submitted receipt can be approved.', { code: 'ORDER_NOT_AWAITING_REVIEW' });
    const amountDueCents = Math.max(0, Math.round((Number(pending.payableNow ?? pending.totalAmount) || 0) * 100));
    const receivedCents = Math.max(0, Math.round(confirmedAmount * 100));
    if (receivedCents < amountDueCents) throw new EndpointError('The provider-confirmed amount must match the amount payable now.', { code: 'PAYMENT_SHORT' });
    if (receivedCents > amountDueCents) throw new EndpointError('The provider-confirmed amount exceeds the amount payable now. Verify that the delivery fee payable on delivery was not included, then approve only the exact amount paid to the shop.', { code: 'PAYMENT_OVERAGE_REVIEW' });
    const amountDue = amountDueCents / 100;
    const receivedAmount = receivedCents / 100;
    const excess = (receivedCents - amountDueCents) / 100;
    const editVersion = Number(pending.staffEditVersion) || 0;
    const creditOperationId = 'order-paid:' + orderId + ':' + editVersion + ':' + receivedAmount.toFixed(2);
    // Payment approval never creates Store Credit. A payment above payable_now
    // is ambiguous when delivery is payable on delivery and must be reviewed.
    const rollbackStagedCredit = async () => {
      if (excess <= 0) return;
      await db.run(`UPDATE customers SET store_credits=coalesce(store_credits,0)-:amount,
          store_credits_operation_id=NULL, store_credits_operation_amount=0, updated_at=unixepoch()
        WHERE id=:id AND store_credits_operation_id=:operation AND store_credits_operation_amount=:amount`,
        { ':id': pending.customerId, ':amount': excess, ':operation': creditOperationId });
    };
    // The amount was checked against the just-read due in integer cents above.
    // The edit-version predicate below makes that comparison safe against a
    // concurrent staff edit; avoid repeating the money comparison in SQLite SQL,
    // where NUMERIC/REAL storage and ROUND result typing can reject valid cents.
    const editVersionGuard = pending.staffEditVersion == null
      ? isNull(orders.staffEditVersion)
      : eq(orders.staffEditVersion, editVersion);
    const result = await db.update(orders).set({
      paymentStatus: 'Paid', confirmedPaidAmount: amountDue, paymentReceivedAmount: receivedAmount,
      status: 'Processing', reviewStatus: 'Approved', requiresManualReview: false, updatedAt: new Date(),
    }).where(and(
      eq(orders.id, orderId),
      eq(orders.status, pending.status),
      eq(orders.paymentStatus, pending.paymentStatus),
      eq(orders.paymentProofImage, pending.paymentProofImage),
      sql`coalesce(${orders.controlState}, 'normal') <> 'held'`,
      editVersionGuard,
    )).returning({ id: orders.id }).run();
    let approvalSaved = (Array.isArray(result) && result.length > 0) ||
      Number(result?.rowsAffected) > 0 || (Array.isArray(result?.rows) && result.rows.length > 0);
    // Some Serverless SQLite adapters return no row metadata for a successful
    // UPDATE ... RETURNING. Read the order before treating that as a failed write.
    let latest = null;
    if (!approvalSaved) {
      latest = await db.select().from(orders).where(eq(orders.id, orderId)).get();
      approvalSaved = String(latest?.status || '').toLowerCase() === 'processing' &&
        String(latest?.paymentStatus || '').toLowerCase() === 'paid' &&
        Number(latest?.staffEditVersion || 0) === editVersion &&
        Math.round((Number(latest?.paymentReceivedAmount || 0) || 0) * 100) === receivedCents;
    }
    if (!approvalSaved) {
      latest ||= await db.select().from(orders).where(eq(orders.id, orderId)).get();
      const latestPaymentStatus = String(latest?.paymentStatus || '').toLowerCase();
      const latestHasSubmittedProof = Boolean(String(latest?.paymentProofImage || '').trim());
      if (!latest || String(latest.status || '').toLowerCase() !== 'pending' || !(latestPaymentStatus === 'pending review' || (latestPaymentStatus === 'unpaid' && latestHasSubmittedProof)) || !latestHasSubmittedProof) {
        if (String(latest?.status || '').toLowerCase() === 'pending') await rollbackStagedCredit();
        throw new EndpointError('Payment was not approved because the order is no longer awaiting receipt review. Refresh the order to see its current status.', { code: 'ORDER_NOT_AWAITING_REVIEW' });
      }
      if (Number(latest.staffEditVersion || 0) !== editVersion) {
        await rollbackStagedCredit();
        throw new EndpointError('The order was edited during payment review, so nothing was approved. Refresh the order, review the attached receipt and revised total, then try again.', { code: 'ORDER_CHANGED' });
      }
      const latestDueCents = Math.max(0, Math.round((Number(latest.payableNow ?? latest.totalAmount) || 0) * 100));
      if (receivedCents < latestDueCents) {
        await rollbackStagedCredit();
        throw new EndpointError('The verified payment is below the revised amount due. Do not approve yet; collect and verify the remaining amount first.', { code: 'PAYMENT_SHORT' });
      }
      await rollbackStagedCredit();
      throw new EndpointError('Payment approval was not saved. Refresh the order and try again.', { code: 'ORDER_CHANGED' });
    }
    await notifyStatus('Processing');
    await notifyPayment();
    return { success: true, orderId, status: 'Processing', paymentStatus: 'Paid' };
  }

  if (action === 'approveAdjustmentPayment') {
    const result = await db.run(
      `UPDATE orders SET adjustment_status = 'paid',
              confirmed_paid_amount = coalesce(confirmed_paid_amount, 0) + coalesce(adjustment_due, 0),
              payment_received_amount = coalesce(payment_received_amount, confirmed_paid_amount, 0) + coalesce(adjustment_due, 0),
              adjustment_verified_at = unixepoch(), updated_at = unixepoch()
        WHERE id = :order_id AND lower(coalesce(status, '')) = 'processing'
          AND lower(coalesce(payment_status, '')) = 'paid'
          AND coalesce(adjustment_due, 0) > 0
          AND lower(coalesce(adjustment_status, '')) = 'pending_review'
          AND trim(coalesce(adjustment_proof_image, '')) <> ''
        RETURNING id`,
      { ':order_id': orderId },
    );
    if (!Number(result?.rowsAffected)) throw new EndpointError('No adjustment receipt is awaiting manual verification.', { code: 'ADJUSTMENT_NOT_AWAITING_REVIEW' });
    await notifyPayment();
    return { success: true, orderId, adjustmentStatus: 'paid' };
  }

  if (action === 'approveZeroDue') {
    const result = await db.run(
      `UPDATE orders SET status = 'Processing', payment_status='Paid', confirmed_paid_amount=0, payment_received_amount=0,
              review_status = 'Approved - zero pre-dispatch due',
              requires_manual_review = 0, updated_at = unixepoch()
        WHERE id = :order_id AND lower(coalesce(status, '')) = 'pending'
          AND lower(coalesce(payment_status, '')) = 'unpaid'
          AND coalesce(payable_now, total_amount, 0) <= 0
          AND trim(coalesce(payment_proof_image, '')) = ''
          AND expired_at IS NULL
          AND lower(coalesce(control_state, 'normal')) <> 'held'
        RETURNING id`,
      { ':order_id': orderId },
    );
    if (!Number(result?.rowsAffected)) throw new EndpointError('Only an active order with no pre-dispatch amount due can be approved without a receipt.', { code: 'ORDER_ZERO_DUE_NOT_ELIGIBLE' });
    await notifyStatus('Processing');
    return { success: true, orderId, status: 'Processing', paymentStatus: 'Paid', reviewStatus: 'Approved - zero pre-dispatch due' };
  }

  if (action === 'markReady') {
    const result = await markOrderReady(orderId);
    if (!result.ready) {
      const messages = {
        order_not_paid_processing: 'Only a Paid Processing order can be marked Ready.',
        adjustment_unpaid: 'Verify the required top-up receipt before marking the order Ready.',
        customer_missing: 'The order has no linked customer account for its Store Credit refund.',
        credits_busy: 'The customer account is processing another Store Credit change. Retry shortly.',
      };
      throw new EndpointError(messages[result.reason] || 'The order could not be marked Ready. Refresh and try again.', { code: 'ORDER_NOT_READY' });
    }
    if (!result.alreadyReady) await notifyStatus('Ready');
    return { success: true, orderId, status: 'Ready', storeCreditIssued: result.storeCreditIssued || 0 };
  }

  if (action === 'dispatch') {
    const trackingUrl = normalizeHttpsTrackingUrl(input?.trackingUrl);
    if (!trackingUrl) throw new EndpointError('A valid HTTPS live tracking URL is required before dispatch.', { code: 'TRACKING_URL_REQUIRED' });
    const dispatched = await markOrderDispatched(orderId, trackingUrl);
    if (!dispatched) throw new EndpointError('Only a paid, ready order can be dispatched.', { code: 'ORDER_NOT_READY' });
    await notifyStatus('Dispatched', trackingUrl);
    return { success: true, orderId, status: 'Dispatched', ...dispatched };
  }

  if (action === 'complete' || action === 'delivered') {
    const result = await markOrderCompleted(orderId);
    if (!result.completed) throw new EndpointError('Only a dispatched order can be completed.', { code: 'ORDER_NOT_DISPATCHED' });
    return { success: true, orderId, status: 'Completed', ...result };
  }

  throw new EndpointError('Unsupported order action.', { code: 'INVALID_ACTION' });
}
