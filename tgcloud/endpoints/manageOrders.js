import { db, EndpointError } from 'sdk';
import { desc, inArray, eq, or } from 'sdk/db';
import { customers, orders, products } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';
import { markOrderCompleted, markOrderDispatched, markOrderReady, reconcileOrderMilestones } from '../lib/order-lifecycle.js';
import { notifyOrderStatusChanged } from '../lib/order-notifications.js';
import { attachWorkflow, applyWorkflowAction, workflowFor,ensureOrderWorkflow,workflowStage } from '../lib/order-workflow.js';
import { calculateCustomerTier,calculateOrderRewardPoints } from '../lib/loyalty.js';

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
  await ensureOrderWorkflow();
  const action = String(input?.action || 'list');
  if (action === 'list' || action === 'get') {
    let reconciliationWarning = '';
    try {
      const reconciliation=action === 'list' ? await reconcileOrderMilestones({ limit: 20 }) : {};
      if(reconciliation.deferredCompletions)reconciliationWarning='Some overdue completions were deferred. Review locked credit ledgers or unresolved order data.';
    } catch (error) {
      // Listing orders must remain available even if request-driven milestone recovery fails.
      const detail = String(error?.message || '').replace(/[\r\n\t]+/g, ' ').slice(0, 180);
      reconciliationWarning = detail
        ? 'Order milestones could not be reconciled during this refresh: ' + detail
        : 'Order milestones could not be reconciled during this refresh.';
    }
    let rows;
    if (action === 'list') {
      rows = await db.select({
        id: orders.id, orderNumber: orders.orderNumber, customerName: orders.customerName,
        customerPhone: orders.customerPhone, customerId: orders.customerId, tgUserId: orders.tgUserId,
        primeMemberId: orders.primeMemberId, totalAmount: orders.totalAmount, subtotal: orders.subtotal,
        payableNow: orders.payableNow, payableOnDelivery: orders.payableOnDelivery,
        paymentStatus: orders.paymentStatus, paymentMethodName: orders.paymentMethodName,
        status: orders.status, controlState: orders.controlState, courierName: orders.courierName,
        deliveryAddress: orders.deliveryAddress, createdAt: orders.createdAt, updatedAt: orders.updatedAt,
      }).from(orders).orderBy(desc(orders.createdAt)).limit(100).all();
    } else {
      const id = String(input?.orderId || input?.id || '').trim();
      if (!id) throw new EndpointError('Order ID is required.', { code: 'INVALID_INPUT' });
      const order = await db.select().from(orders).where(or(eq(orders.id,id),eq(orders.orderNumber,id))).get();
      if (!order) throw new EndpointError('Order not found.', { code: 'NOT_FOUND' });
      const {paymentProofData, ...detail} = order;
      if (String(order.paymentProofImage || '').startsWith('inline-payment-proof:') && paymentProofData) {
        detail.paymentProofImage = 'tgmedia:order-payment-proof:' + order.id;
      }
      rows = [detail];
    }
    const telegramIds = Array.from(new Set(rows.map(order => String(order.tgUserId || '')).filter(Boolean)));
    const profiles = telegramIds.length
      ? await db.select({tgUserId:customers.tgUserId,tgName:customers.tgName,tgUsername:customers.tgUsername})
        .from(customers).where(inArray(customers.tgUserId,telegramIds)).all() : [];
    const profileByTelegramId = new Map(profiles.map(profile => [String(profile.tgUserId),profile]));
    // Queue refreshes must not transfer every receipt, OCR result and device snapshot.
    if (action === 'list') return {orders: rows.map(order => ({
      id: order.id, orderNumber: order.orderNumber, customerName: order.customerName,
      customerPhone: order.customerPhone, customerId: order.customerId, tgUserId: order.tgUserId,
      primeMemberId: order.primeMemberId, totalAmount: order.totalAmount, subtotal: order.subtotal,
      payableNow: order.payableNow, payableOnDelivery: order.payableOnDelivery,
      paymentStatus: order.paymentStatus, paymentMethodName: order.paymentMethodName,
      status: order.status, courierName: order.courierName,
      deliveryAddress: {courierPaymentMode:order.deliveryAddress?.courierPaymentMode || ''},
      workflow: {stage:workflowStage(order)},
      telegramName:profileByTelegramId.get(String(order.tgUserId || ''))?.tgName || '',
      telegramUsername:profileByTelegramId.get(String(order.tgUserId || ''))?.tgUsername || '',
      createdAt:timestampIso(order.createdAt),updatedAt:timestampIso(order.updatedAt),
    })), reconciliationWarning};
    const identifiers = await db.all(`SELECT id, order_number AS orderNumber,
      applied_promo_code AS promoCode,
      CASE WHEN json_valid(fingerprint_snapshot) THEN json_extract(fingerprint_snapshot,'$.deviceId') END AS deviceId,
      CASE WHEN json_valid(fingerprint_snapshot) THEN json_extract(fingerprint_snapshot,'$.hardwareId') END AS hardwareId,
      CASE WHEN json_valid(fingerprint_snapshot) THEN json_extract(fingerprint_snapshot,'$.deviceFingerprintId') END AS fingerprintId FROM orders`);
    const identityByOrder = new Map(identifiers.map((item) => [String(item.id), item]));
    const bySignal = new Map();
    for (const item of identifiers) for (const key of ['deviceId','hardwareId','fingerprintId','promoCode']) {
      const value = String(item[key] || '').trim();
      if (!value) continue;
      const signal = key + ':' + value;
      if (!bySignal.has(signal)) bySignal.set(signal, []);
      bySignal.get(signal).push(item);
    }
    const matchByOrder = new Map(rows.map((order) => {
      const self = identityByOrder.get(String(order.id));
      const matches = new Map();
      if (self) for (const [key, label] of [['deviceId','Device ID'],['hardwareId','Hardware ID'],['fingerprintId','Fingerprint ID'],['promoCode','Promo code']]) {
        const value = String(self[key] || '').trim();
        if (!value) continue;
        for (const item of bySignal.get(key + ':' + value) || []) {
          if (String(item.id) === String(order.id)) continue;
          if (!matches.has(item.id)) matches.set(item.id, { orderNumber: item.orderNumber || item.id, signals: [] });
          matches.get(item.id).signals.push(label);
        }
      }
      return [String(order.id), Array.from(matches.values()).slice(0, 20)];
    }));
    const tierRows = rows.length ? await db.all(`SELECT order_id AS orderId,
      CASE WHEN json_valid(canonical_snapshot) THEN json_extract(canonical_snapshot,'$.rewardTier') END AS tier FROM checkout_operations
      WHERE order_id IN (${rows.map((_, index) => ':order' + index).join(',')})`,
      Object.fromEntries(rows.map((row, index) => [':order' + index, row.id]))) : [];
    const tierByOrder = new Map(tierRows.map((row) => [String(row.orderId), String(row.tier || '')]));
    return { orders: await Promise.all(rows.map(async (order) => ({
      ...order,
      tierLevel: tierByOrder.get(String(order.id)) || '',
      matchingIdentifiers: matchByOrder.get(String(order.id)) || [],
      workflow: await attachWorkflow(order,true),
      telegramName: profileByTelegramId.get(String(order.tgUserId || ''))?.tgName || '',
      telegramUsername: profileByTelegramId.get(String(order.tgUserId || ''))?.tgUsername || '',
      createdAt: timestampIso(order.createdAt),
      updatedAt: timestampIso(order.updatedAt),
      readyAt: timestampIso(order.readyAt),
      paymentDeadlineAt: timestampIso(order.paymentDeadlineAt),
      expiredAt: timestampIso(order.expiredAt),
      dispatchedAt: timestampIso(order.dispatchedAt),
      deliveredAt: timestampIso(order.deliveredAt),
    }))), reconciliationWarning };
  }

  const orderId = String(input?.orderId || input?.id || '').trim();
  if (!orderId) throw new EndpointError('Order ID is required.', { code: 'INVALID_INPUT' });
  const currentOrder=await db.select().from(orders).where(eq(orders.id,orderId)).get();
  if(!currentOrder)throw new EndpointError('Order not found.',{code:'NOT_FOUND'});
  await workflowFor(currentOrder);
  const workflowAction=({markPaid:'confirmPayment',approveZeroDue:'confirmPayment',failReceipt:'failReceipt',holdOrder:'hold',resubmitOrder:'resubmit',startProcessing:'processing',cancelOrder:'cancel',rejectOrder:'cancel',approveCustomerEdit:'approveCustomerEdit',rejectCustomerEdit:'rejectCustomerEdit',rejectCancellation:'rejectCancellation',revalidatePayment:'revalidatePayment',recordOriginalRefund:'recordOriginalRefund'})[action];
  if(workflowAction) {
    if(action==='markPaid'&&input.expectedPayableNow!=null) {
      const expected=Number(input.expectedPayableNow),actual=Number(currentOrder.payableNow??currentOrder.totalAmount??0);
      if(!Number.isFinite(expected)||!Number.isFinite(actual)||Math.round(expected*100)!==Math.round(actual*100))throw new EndpointError('The amount due changed. Refresh the order and verify the payment again.',{code:'ORDER_CHANGED'});
    }
    const result=await applyWorkflowAction(currentOrder,workflowAction,{...input,...(action==='approveZeroDue'?{confirmedAmount:0,zeroDueApproved:true}:{})});
    const saved=await db.select().from(orders).where(eq(orders.id,orderId)).get();
    if (!result.alreadyApproved && ['markPaid','approveZeroDue','failReceipt','holdOrder','resubmitOrder','startProcessing','cancelOrder','rejectOrder'].includes(action)) {
      await notifyOrderStatusChanged({ ...saved, chatId:saved.tgUserId, orderNumber:saved.orderNumber||saved.id, resubmitExpiresAt:result.resubmitExpiresAt });
    }
    return result;
  }
  if(action==='dispatchOverride'||action==='approveAdjustmentPayment')throw new EndpointError('Tracking is required for dispatch; bill increases require a new order.',{code:'LEGACY_WORKFLOW_RETIRED'});

  if (action === 'expireUnpaid' || action === 'cancelUnpaid' || action === 'rejectUnpaid') {
    throw new EndpointError('The unpaid-order expiry workflow is retired. Use the current payment review and cancellation flow.', { code: 'LEGACY_WORKFLOW_RETIRED' });
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
  if (action === 'edit') {
    const current = await db.select().from(orders).where(eq(orders.id, orderId)).get();
    const expectedVersion = Number(input?.expectedVersion);
    const version = Number(current?.staffEditVersion || 0);
    const currentStatus = String(current?.status || '').toLowerCase();
    if (!current || !['pending','confirmed'].includes(currentStatus) || ['held','failed'].includes(String(current.controlState||'').toLowerCase()))
      throw new EndpointError('Modify is available only before Processing and outside failed/held review.', { code: 'ORDER_NOT_EDITABLE' });
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
    const seenSkus=new Set();
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
      const sku=productId+'_'+variantId;
      if(seenSkus.has(sku))throw new EndpointError('Combine duplicate item lines before saving.',{code:'DUPLICATE_ITEM'});
      seenSkus.add(sku);
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
    const payableOnDelivery = deliveryIsCod ? money(Math.max(0,deliveryFee-Number(current.promoShippingSubsidy||0))) : 0;
    const payableNow = money(Math.max(0, total - payableOnDelivery - Number(current.storeCreditsUsed || 0)));
    const netTotal=money(payableNow+payableOnDelivery);
    const canonical=await db.get("SELECT json_extract(canonical_snapshot,'$.rewardTier') AS tier,json_extract(canonical_snapshot,'$.promo.cashbackPoints') AS cashback FROM checkout_operations WHERE order_id=:id LIMIT 1",{':id':orderId});
    const completedOrders=canonical?.tier?[]:await db.all("SELECT subtotal,delivered_at AS deliveredAt,created_at AS createdAt,status FROM orders WHERE customer_id=:customer AND lower(status) IN ('completed','delivered')",{':customer':current.customerId});
    const reward=calculateOrderRewardPoints(subtotal,canonical?.tier||calculateCustomerTier(completedOrders).tier,Number(canonical?.cashback||0),staffDiscount+Number(current.discountAmount||0)+Number(current.pointsDiscount||0),Number(current.storeCreditsUsed||0));
    if (netTotal > Number(current.totalAmount || 0) + 0.005)
      throw new EndpointError('A paid order can only be reduced. Use a new transaction for any increase.', { code: 'PAID_ORDER_INCREASE' });
    const changed = await db.run(`UPDATE orders SET items=:items, subtotal=:subtotal, delivery_fee=:delivery_fee,
        charges_breakdown=:charges, staff_discount_amount=:discount, staff_discount_mode=:discount_mode,
        staff_discount_value=:discount_value, total_amount=:total, payable_now=:payable_now,
        payable_on_delivery=:payable_on_delivery, staff_edit_version=:next_version,
        ready_credit_due=0,purchasing_points_amount=min(coalesce(purchasing_points_amount,0),:reward),
        updated_at=unixepoch()
      WHERE id=:id AND coalesce(staff_edit_version,0)=:expected_version
        AND lower(status) IN ('pending','confirmed') AND lower(coalesce(control_state,'')) NOT IN ('held','failed')
        AND :new_total <= total_amount + 0.005 RETURNING id`,
      { ':items': JSON.stringify(items), ':subtotal': subtotal, ':delivery_fee': money(deliveryFee), ':charges': JSON.stringify(charges), ':discount': staffDiscount,
        ':discount_mode': discountMode, ':discount_value': money(discountValue), ':total': netTotal, ':payable_now': payableNow,
        ':payable_on_delivery': payableOnDelivery,
        ':next_version': version + 1, ':expected_version': version, ':id': orderId, ':new_total': netTotal,':reward':reward });
    if (!Number(changed?.rowsAffected)) throw new EndpointError('The order changed; refresh and try again.', { code: 'ORDER_CHANGED' });
    return { success: true, orderId, totalAmount: netTotal, payableNow };
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
