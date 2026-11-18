import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { orders, couriers, customers } from '../schema.js';
import { ensurePosInvoiceRefunds } from '../lib/pos-invoice-refunds.js';
import { requireAdmin } from '../lib/auth.js';
import { quoteDelivery } from '../lib/delivery.js';
import { pricePosSale } from '../lib/pos-pricing.js';
import { reserveStoreCredits, finalizeStoreCredits, compensateStoreCredits } from '../lib/credits.js';
import { claimPromoUse, redeemPromoClaim, releasePromoClaim } from '../lib/promo-claims.js';

import { beginCheckoutOperation, findCheckoutOperation, canonicalRequest, saveCanonicalCheckoutSnapshot, advanceCheckoutOperation, finishCheckoutOperation, beginCheckoutCompensation, finishCheckoutCompensation } from '../lib/checkout-operations.js';
import { reserveInventoryLine, releaseInventoryReservations } from '../lib/inventory.js';
import { notifyAdminOrderCreated, notifyPosOrderCreated } from '../lib/order-notifications.js';

async function settleSale(order, operationId) {
  if (order.appliedPromoCode) {
    const redeemed = await redeemPromoClaim({ operationId, orderId: operationId });
    if (!redeemed.redeemed) throw new EndpointError('Voucher recovery pending. Retry this sale.');
  }
  if (Number(order.storeCreditsUsed) > 0) {
    const credit = await finalizeStoreCredits({ customerId: order.customerId, operationId });
    if (!credit.finalized) throw new EndpointError('Credit recovery pending. Retry this sale.');
  }
}

const text = (value, max = 300) => String(value ?? '').trim().slice(0, max);

function orderNumber(seconds) {
  const pht = new Date((Number(seconds) + 8 * 60 * 60) * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(pht.getUTCDate())}${pad(pht.getUTCMonth() + 1)}${String(pht.getUTCFullYear()).slice(-2)}${pad(pht.getUTCHours())}${pad(pht.getUTCMinutes())}${pad(pht.getUTCSeconds())}`;
}

export default async function handler(input = {}, ctx) {
  const admin = await requireAdmin(ctx);
  const mode = String(input.mode || '').toLowerCase();
  if (!['store', 'delivery'].includes(mode)) throw new EndpointError('Choose store pickup or delivery.', { code: 'INVALID_ORDER_TYPE' });
  if (input.action === 'deliveryQuote') return await quoteDelivery(input.destination?.lat,input.destination?.lon);
  if (input.action === 'quote') {
    const quote = await pricePosSale(input);
    return { ...quote, totalAmount: quote.total };
  }
  const paymentState = String(input.paymentState || 'paid');
  if (!['paid','unpaid'].includes(paymentState)) throw new EndpointError('Choose paid sale or unpaid invoice.', {code:'INVALID_PAYMENT_STATE'});
  const key = String(input.operationKey || '').trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new EndpointError('Refresh the POS and retry with a new checkout key.', { code: 'INVALID_OPERATION_KEY' });
  const request = {
    mode, paymentState, paymentMethodId:text(input.paymentMethodId,120), customerName:text(input.customerName,120), customerPhone:text(input.customerPhone,40),
    paymentMethodName:text(input.paymentMethodName,100), customerId:text(input.customerId,120),
    telegramId:text(input.telegramId,20), deliveryAddress:mode==='delivery'?text(input.deliveryAddress,500):'',
    deliveryFee:mode==='delivery'?Number(input.deliveryFee):0, courierId:mode==='delivery'?text(input.courierId,120):'',
    destination: input.destination || null, deliveryPaymentMethod: input.deliveryPaymentMethod || 'upon_checkout',
    chargeIds: input.chargeIds || [], manualCharges: input.manualCharges || [], promoCode: text(input.promoCode,100),
    discountMode: input.discountMode || 'none', discountValue: Number(input.discountValue || 0), storeCreditsUsed: Number(input.storeCreditsUsed || 0),
    expectedPayableNow: input.expectedPayableNow == null ? null : Number(input.expectedPayableNow),
    items:input.items, expectedTotal:input.expectedTotal == null ? null : Number(input.expectedTotal),
  };
  const prior = await findCheckoutOperation({customerId:'pos-'+String(admin.id),requestKey:key});
  if(prior.ok) {
    if(input.action!=='resume' && prior.requestSnapshot?.expectedTotal !== undefined && canonicalRequest({paymentState:'paid',paymentMethodId:'',destination:null,deliveryPaymentMethod:'upon_checkout',chargeIds:[],manualCharges:[],promoCode:'',discountMode:'none',discountValue:0,storeCreditsUsed:0,expectedPayableNow:null,...prior.requestSnapshot})!==canonicalRequest(request))
      throw new EndpointError('Retry the original sale before changing its details.',{code:'IDEMPOTENCY_CONFLICT'});
    const saved = await db.select().from(orders).where(eq(orders.id,prior.operationId)).get();
    if(saved) {
      await settleSale(saved, prior.operationId);
      const response={success:true,id:saved.id,orderNumber:saved.orderNumber,mode:prior.requestSnapshot?.mode||mode,totalAmount:Number(saved.totalAmount)||0};
      await finishCheckoutOperation({operationId:prior.operationId,responseSnapshot:response});
      return response;
    }
    if(prior.status==='failed')throw new EndpointError('This sale was not saved. Review the sale and start a new checkout.',{code:'POS_CHECKOUT_FAILED'});
    if(prior.status==='compensating') {
      await releaseInventoryReservations(prior.operationId);
      await releasePromoClaim(prior.operationId);
      if(prior.requestSnapshot?.customerId) await compensateStoreCredits({customerId:prior.requestSnapshot.customerId,operationId:prior.operationId});
      await finishCheckoutCompensation({operationId:prior.operationId});
      throw new EndpointError('This sale was not saved. Review the sale and start a new checkout.',{code:'POS_CHECKOUT_FAILED'});
    }
    if(input.action==='resume')return await handler({...prior.requestSnapshot,operationKey:key},ctx);
  } else if(input.action==='resume')throw new EndpointError('No saved checkout attempt was found.',{code:'POS_OPERATION_MISSING'});
  const operation = await beginCheckoutOperation({
    customerId: 'pos-' + String(admin.id), requestKey: key, requestSnapshot: prior.ok ? prior.requestSnapshot : request,
    expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60, submittedAt: Math.floor(Date.now() / 1000),
  });
  if (!operation.ok) throw new EndpointError('Retry the original sale before changing its details.', { code: 'IDEMPOTENCY_CONFLICT' });
  const operationId=operation.operationId;
  try {
  const customerName = text(input.customerName, 120);
  const customerPhone = text(input.customerPhone, 40);
  let paymentMethodName = text(input.paymentMethodName, 100);
  if (request.paymentMethodId) {
    const method = await db.get('SELECT name,is_active FROM payment_methods WHERE id=:id',{':id':request.paymentMethodId});
    if (!method || !method.is_active) throw new EndpointError('Choose an active payment method.',{code:'PAYMENT_METHOD_UNAVAILABLE'});
    paymentMethodName=method.name;
  }
  if (!customerName || !paymentMethodName) throw new EndpointError('Customer name and payment method are required.', { code: 'INVALID_INPUT' });

  const selectedCustomerId = text(input.customerId, 120);
  const linkedCustomer = selectedCustomerId
    ? await db.select().from(customers).where(eq(customers.id, selectedCustomerId)).get()
    : null;
  if (selectedCustomerId && !linkedCustomer) throw new EndpointError('The selected customer could not be found. Refresh the customer list.', { code: 'CUSTOMER_NOT_FOUND' });
  if (linkedCustomer?.isBanned === true) throw new EndpointError('This customer account is restricted from placing orders.', { code: 'CUSTOMER_RESTRICTED' });
  const manualTelegramId = text(input.telegramId, 20);
  if (manualTelegramId && !/^[0-9]{1,20}$/.test(manualTelegramId)) throw new EndpointError('Enter a numeric Telegram user ID.', { code: 'INVALID_TELEGRAM_ID' });
  if (linkedCustomer && manualTelegramId) throw new EndpointError('Choose an existing customer or enter a guest Telegram ID, not both.', { code: 'AMBIGUOUS_CUSTOMER' });
  const recipientTelegramId = linkedCustomer ? text(linkedCustomer.tgUserId, 20) : manualTelegramId;
  if (recipientTelegramId && !/^[0-9]{1,20}$/.test(recipientTelegramId)) throw new EndpointError('The customer Telegram ID on file is invalid.', { code: 'INVALID_TELEGRAM_ID' });

  const requestedFee = mode === 'delivery' ? Number(input.deliveryFee) : 0;
  if (!Number.isFinite(requestedFee) || requestedFee < 0 || requestedFee > 1_000_000) throw new EndpointError('Enter a valid delivery fee.', { code: 'INVALID_DELIVERY_FEE' });
  const addressText = text(input.deliveryAddress, 500);
  if (mode === 'delivery' && !addressText) throw new EndpointError('Enter the delivery address.', { code: 'DELIVERY_ADDRESS_REQUIRED' });
  let courier = null;
  if (mode === 'delivery') {
    const courierId = text(input.courierId, 120);
    if (!courierId) throw new EndpointError('Choose a courier.', { code: 'COURIER_REQUIRED' });
    courier = await db.select().from(couriers).where(eq(couriers.id, courierId)).get();
    if (!courier || courier.isActive === false) throw new EndpointError('The selected courier is no longer available.', { code: 'COURIER_UNAVAILABLE' });
  }

  const legacy = prior.canonicalSnapshot?.cart && !prior.canonicalSnapshot?.pricing ? prior.canonicalSnapshot : null;
  let pricing = prior.canonicalSnapshot?.pricing || (legacy ? {...legacy,payableNow:legacy.total,payableOnDelivery:0,deliveryPaymentMethod:'upon_checkout',promo:null,promoDiscount:0,shippingSubsidy:0,staffDiscount:0,discountMode:'none',discountValue:0,creditsUsed:0} : await pricePosSale(request));
  let { cart, chargeResult, deliveryFee, total } = pricing;
  if(input.expectedPayableNow!=null && Math.round(Number(input.expectedPayableNow)*100)!==Math.round(pricing.payableNow*100)) throw new EndpointError('Amount due now changed. Review the bill.',{code:'POS_TOTAL_CHANGED'});
  if(input.expectedTotal!=null && (!Number.isFinite(Number(input.expectedTotal)) || Math.round(Number(input.expectedTotal)*100)!==Math.round(total*100)))
    throw new EndpointError('The sale total changed. Review the updated quote before confirming payment.',{code:'POS_TOTAL_CHANGED'});
  if (operation.status === 'complete' && operation.responseSnapshot) return operation.responseSnapshot;

  if (paymentState === 'unpaid') {
    if (!recipientTelegramId) throw new EndpointError('Enter the customer Telegram ID to send an invoice.',{code:'TELEGRAM_ID_REQUIRED'});
    if (pricing.payableNow <= 0) throw new EndpointError('Nothing is due now. Use Confirm received to save this sale.',{code:'NOTHING_DUE'});
    await ensurePosInvoiceRefunds();
  }
  const existingOrder = await db.select().from(orders).where(eq(orders.id, operationId)).get();
  if (existingOrder) {
    await settleSale(existingOrder, operationId);
    const response = { success: true, id: existingOrder.id, orderNumber: existingOrder.orderNumber, mode, totalAmount: Number(existingOrder.totalAmount) || 0 };
    await finishCheckoutOperation({ operationId, responseSnapshot: response });
    await notifyPosOrderCreated({ chatId: existingOrder.tgUserId, orderNumber: existingOrder.orderNumber,
      status: existingOrder.status, paymentMethodName: existingOrder.paymentMethodName,
      totalAmount: existingOrder.payableNow, customerName: existingOrder.customerName,
      items: Array.isArray(existingOrder.items) ? existingOrder.items : [] });
    return response;
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const frozen=await saveCanonicalCheckoutSnapshot({operationId,snapshot:{cart,chargeResult,deliveryFee,total,pricing}});
    if(!frozen.saved)throw new EndpointError('The sale is being recovered. Retry shortly.',{code:'POS_RECOVERY_REQUIRED'});
    if(frozen.snapshot) {
      ({cart,chargeResult,deliveryFee,total}=frozen.snapshot);
      pricing=frozen.snapshot.pricing || pricing;
    }
    for (const line of cart.reservations) {
      const held = await reserveInventoryLine({ orderId: operationId, ...line, expiresAt });
      if (!held.reserved) throw new EndpointError('Stock changed while this sale was being checked out. Refresh the catalog.', { code: 'INSUFFICIENT_STOCK' });
    }
    const advanced = await advanceCheckoutOperation({ operationId, expectedStages: ['prepared', 'inventory_held'], nextStage: 'inventory_held' });
    if (!advanced.advanced) throw new EndpointError('The sale is being recovered. Retry in a moment.', { code: 'POS_RECOVERY_REQUIRED' });

    if (pricing.promo) {
      const claimed = await claimPromoUse({ operationId, promoId: pricing.promo.promoId, promoCode: pricing.promo.code,
        customerId: linkedCustomer.id, deviceId:pricing.fingerprint?.deviceId || '', hardwareId:pricing.fingerprint?.hardwareId || '', deviceFingerprintId:pricing.fingerprint?.deviceFingerprintId || '', discountAmount: pricing.promoDiscount + pricing.shippingSubsidy, expiresAt });
      if (!claimed.claimed) throw new EndpointError('Voucher use is no longer available.');
    }
    let receivedTransferUsed = 0;
    if (pricing.creditsUsed > 0) {
      const credit = await reserveStoreCredits({ customerId: linkedCustomer.id, operationId, amount: pricing.creditsUsed });
      if (!credit.reserved) throw new EndpointError('Store Credits changed. Review the sale.');
      receivedTransferUsed = credit.receivedUsed || 0;
    }
    const now = Math.floor(Date.now() / 1000);
    const start = now;
    let number = orderNumber(start);
    let inserted = false;
    const row = {
      id: operationId, order_number: number, customer_name: customerName, customer_phone: customerPhone,
      tg_user_id: recipientTelegramId, customer_id: linkedCustomer?.id || null,
      prime_member_id: linkedCustomer?.primeMemberId || '', items: JSON.stringify(cart.items),
      subtotal: cart.subtotal, delivery_fee: deliveryFee, discount_amount: pricing.promoDiscount, staff_discount_amount: pricing.staffDiscount,
      staff_discount_mode: pricing.discountMode, staff_discount_value: pricing.discountValue,
      applied_promo_code: pricing.promo?.code || '', promo_shipping_subsidy: pricing.shippingSubsidy,
      store_credits_used: pricing.creditsUsed, received_transfer_used: receivedTransferUsed,
      purchasing_points_amount: pricing.rewardPointsAmount || 0,
      charges_breakdown: JSON.stringify(chargeResult.computedCharges), total_amount: total,
      payable_now: pricing.payableNow, payable_on_delivery: pricing.payableOnDelivery, status: paymentState==='unpaid'?'Pending':'Processing', payment_status: paymentState==='unpaid'?'Unpaid':'Paid',
      confirmed_paid_amount: paymentState==='unpaid'?0:pricing.payableNow, payment_received_amount: paymentState==='unpaid'?0:pricing.payableNow,
      payment_method_id: request.paymentMethodId, payment_method_name: paymentMethodName,
      review_status: paymentState==='unpaid'?'POS invoice — Awaiting payment':'Approved - POS payment received', requires_manual_review: paymentState==='unpaid'?1:0,
      delivery_address: JSON.stringify(mode === 'delivery' ? { formatted: addressText, ...request.destination, courierPaymentMode: pricing.deliveryPaymentMethod, distanceKm: pricing.delivery?.distanceKm, estimatedTravelMinutes: pricing.delivery?.routeTimeMinutes } : { formatted: 'Store pickup' }),
      courier_id: courier?.id || '', courier_name: courier?.name || '', notes: `POS · ${mode === 'store' ? 'Store pickup' : 'Delivery'}`,
      fingerprint_snapshot: JSON.stringify(pricing.fingerprint || {}), payment_deadline_at: paymentState==='unpaid'?now+3600:null, created_at: now, updated_at: now,
    };
    for (let attempt = 0; attempt < 120; attempt++) {
      row.order_number = number;
      const columns = Object.keys(row);
      const params = Object.fromEntries(columns.map((column, index) => [':v' + index, row[column]]));
      const jsonColumns = new Set(['items', 'charges_breakdown', 'delivery_address', 'fingerprint_snapshot']);
      const values = columns.map((column, index) => jsonColumns.has(column) ? `json(:v${index})` : `:v${index}`);
      const result = await db.run(
        `INSERT INTO orders (${columns.join(', ')}) SELECT ${values.join(', ')}
          WHERE EXISTS (SELECT 1 FROM checkout_operations WHERE id=:operation_id AND status='processing')
          AND (:credits=0 OR EXISTS (SELECT 1 FROM customers WHERE id=:credit_customer AND store_credits_operation_id=:operation_id AND store_credits_operation_amount=:credits))
          AND (:has_promo=0 OR EXISTS (SELECT 1 FROM promo_claims WHERE operation_id=:operation_id AND status='held' AND expires_at>unixepoch()))
          AND NOT EXISTS (
            SELECT 1 FROM json_each(:reservations) line
            LEFT JOIN inventory_reservations r ON r.order_id=:operation_id
              AND r.product_id=json_extract(line.value,'$.productId') AND r.variant_id=json_extract(line.value,'$.variantId')
            WHERE r.id IS NULL OR r.status<>'held' OR r.expires_at<=unixepoch() OR r.quantity<>json_extract(line.value,'$.quantity'))
          ON CONFLICT DO NOTHING RETURNING id`,
        { ...params, ':operation_id': operationId, ':reservations': JSON.stringify(cart.reservations), ':credits':pricing.creditsUsed, ':credit_customer':linkedCustomer?.id || '', ':has_promo':pricing.promo ? 1 : 0 },
      );
      if (Number(result?.rowsAffected) > 0) { inserted = true; break; }
      const existing = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, operationId)).get();
      if (existing) { inserted = true; break; }
      const invalidHold = await db.get(`SELECT 1 AS invalid FROM json_each(:reservations) line
        LEFT JOIN inventory_reservations r ON r.order_id=:operation_id
          AND r.product_id=json_extract(line.value,'$.productId') AND r.variant_id=json_extract(line.value,'$.variantId')
        WHERE r.id IS NULL OR r.status<>'held' OR r.expires_at<=unixepoch()
          OR r.quantity<>json_extract(line.value,'$.quantity') LIMIT 1`,
      { ':operation_id': operationId, ':reservations': JSON.stringify(cart.reservations) });
      if (invalidHold) throw new EndpointError('The stock reservation expired. Review the sale and retry.', { code: 'INVENTORY_RESERVATION_EXPIRED' });
      number = orderNumber(start + attempt + 1);
    }
    if (!inserted) throw new EndpointError('Could not save this sale. Retry from the POS.', { code: 'POS_ORDER_SAVE_FAILED' });
    await settleSale({appliedPromoCode:pricing.promo?.code,storeCreditsUsed:pricing.creditsUsed,customerId:linkedCustomer?.id},operationId);
    await db.run('UPDATE checkout_operations SET order_id=:id, updated_at=unixepoch() WHERE id=:id', { ':id': operationId });
    const persisted = await db.select({ orderNumber: orders.orderNumber, totalAmount: orders.totalAmount }).from(orders).where(eq(orders.id, operationId)).get();
    const response = { success: true, id: operationId, orderNumber: persisted?.orderNumber || number, mode, totalAmount: Number(persisted?.totalAmount) || total };
    await finishCheckoutOperation({ operationId, responseSnapshot: response });
    await Promise.allSettled([
      notifyPosOrderCreated({ chatId: recipientTelegramId, orderNumber: response.orderNumber,
        status: paymentState==='unpaid'?'Pending':'Processing', paymentMethodName, totalAmount: pricing.payableNow,
        customerName, items: cart.items }),
      notifyAdminOrderCreated({ orderNumber: response.orderNumber, totalAmount: response.totalAmount,
        customerName, paymentStatus: paymentState==='unpaid'?'Unpaid':'Paid', source: 'pos' }),
    ]);
    return response;
  } catch (error) {
    let saved = await db.select().from(orders).where(eq(orders.id, operationId)).get();
    if (!saved) {
      const fenced=await beginCheckoutCompensation({operationId,message:error?.message});
      if(fenced.compensating) {
        await releaseInventoryReservations(operationId);
        await releasePromoClaim(operationId);
        if(request.customerId) await compensateStoreCredits({customerId:request.customerId,operationId});
        await finishCheckoutCompensation({operationId});
        throw new EndpointError(error?.message || 'This sale could not be saved.',{code:'POS_CHECKOUT_FAILED'});
      }
      saved=await db.select().from(orders).where(eq(orders.id,operationId)).get();
    }
    if(saved) {
      await settleSale(saved,operationId);
      const response={success:true,id:saved.id,orderNumber:saved.orderNumber,mode,totalAmount:Number(saved.totalAmount)||0};
      await finishCheckoutOperation({operationId,responseSnapshot:response});
      return response;
    }
    throw error;
  }
}
