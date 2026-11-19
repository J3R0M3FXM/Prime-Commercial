import { db, EndpointError } from 'sdk';
import { asc, eq } from 'sdk/db';
import { charges, customers, promos, orders } from '../schema.js';
import { canonicalizeOrderItems } from './orders.js';
import { calculateChargesBreakdown, normalizeCharge } from './charges.js';
import { quoteDelivery } from './delivery.js';
import { deserializePromo, addFreeProductToCart } from './promos.js';
import { calculateCustomerTier, calculateOrderRewardPoints } from './loyalty.js';
import { resolveTrustedFingerprint } from './fingerprints.js';
import validatePromo from '../endpoints/validatePromo.js';

const money = value => Math.round(Number(value) * 100) / 100;
function amount(value, name, max = 1000000) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new EndpointError('Invalid ' + name + '.', { code: 'INVALID_POS_AMOUNT' });
  return money(n);
}
export async function pricePosSale(input) {
  const cart = await canonicalizeOrderItems(input.items);
  const customer = input.customerId ? await db.select().from(customers).where(eq(customers.id, String(input.customerId))).get() : null;
  if (input.customerId && (!customer || customer.isBanned)) throw new EndpointError('Choose an available customer account.', { code: 'CUSTOMER_UNAVAILABLE' });
  const rows = await db.select().from(charges).where(eq(charges.isActive, true)).orderBy(asc(charges.sortOrder)).all();
  const chargeResult = calculateChargesBreakdown(rows, cart.subtotal, new Date());
  if (!Array.isArray(input.chargeIds || []) || (input.chargeIds || []).length > 100) throw new EndpointError('Invalid configured charges.');
  for (const id of new Set(input.chargeIds || [])) {
    if (chargeResult.computedCharges.some(row => row.id === id)) continue;
    const raw = rows.find(row => row.id === id);
    if (!raw) throw new EndpointError('A selected charge is unavailable.', { code: 'CHARGE_UNAVAILABLE' });
    const c = normalizeCharge(raw);
    chargeResult.computedCharges.push({ id: c.id, name: c.name, type: c.type, rate: c.amount, computedAmount: money(c.type === 'percentage' ? cart.subtotal * c.amount / 100 : c.amount) });
  }
  if (!Array.isArray(input.manualCharges || []) || (input.manualCharges || []).length > 20) throw new EndpointError('Too many manual charges.');
  for (const [index, c] of (input.manualCharges || []).entries()) {
    const name = String(c.name || '').trim().slice(0, 100);
    if (!name) throw new EndpointError('Name each manual charge.');
    const rate = amount(c.amount, 'manual charge', c.type === 'percentage' ? 100 : 1000000);
    chargeResult.computedCharges.push({ id: 'manual-' + index, name, type: c.type === 'percentage' ? 'percentage' : 'fixed', rate, computedAmount: money(c.type === 'percentage' ? cart.subtotal * rate / 100 : rate) });
  }
  chargeResult.totalChargesAmount = money(chargeResult.computedCharges.reduce((sum, c) => sum + c.computedAmount, 0));
  const delivery = input.mode === 'delivery' ? await quoteDelivery(input.destination?.lat, input.destination?.lon, input.courierId) : null;
  const deliveryFee = delivery ? money(delivery.fee) : 0;
  const deliveryPaymentMethod = input.deliveryPaymentMethod || 'upon_checkout';
  if (!['upon_checkout', 'upon_delivery'].includes(deliveryPaymentMethod)) throw new EndpointError('Choose when the delivery fee is paid.');
  let promo = null;
  if (String(input.promoCode || '').trim()) {
    if (!customer) throw new EndpointError('Select an existing customer to apply a voucher.');
    promo = await validatePromo({ code: input.promoCode, itemsSubtotal: cart.subtotal, itemQuantity: cart.itemQuantity, items: cart.items, deliveryFee, paymentMethod: delivery ? deliveryPaymentMethod : 'upon_checkout', courierId: delivery?.courier.id || '' }, { initData: { user: { id: customer.tgUserId } } });
    if (!promo.valid) throw new EndpointError(promo.error || 'Voucher unavailable.');
    if (!delivery && ['free_shipping', 'shipping_discount'].includes(promo.discountType)) throw new EndpointError('Delivery vouchers require a delivery transaction.');
    if (promo.discountType === 'free_product') {
      const raw = await db.select().from(promos).where(eq(promos.id, promo.promoId)).get();
      const config = deserializePromo(raw);
      const gift = await canonicalizeOrderItems([{productId:config.freeProductId,variantId:config.freeVariantId || 'default',quantity:1}]);
      addFreeProductToCart(cart, cart.items, gift.items[0]);
    }
  }
  const shipping = ['free_shipping', 'shipping_discount'].includes(promo?.discountType);
  const promoDiscount = shipping ? 0 : Math.min(cart.subtotal, amount(promo?.discountAmount, 'voucher discount'));
  const shippingSubsidy = shipping ? Math.min(deliveryFee, amount(promo?.shippingSubsidy ?? promo?.discountAmount, 'shipping discount')) : 0;
  const discountMode = input.discountMode || 'none';
  if (!['none', 'fixed', 'percentage'].includes(discountMode)) throw new EndpointError('Choose a valid discount type.');
  const discountValue = amount(input.discountValue, 'staff discount', discountMode === 'percentage' ? 100 : 1000000);
  const remaining = money(cart.subtotal - promoDiscount);
  const staffDiscount = discountMode === 'none' ? 0 : Math.min(remaining, money(discountMode === 'percentage' ? remaining * discountValue / 100 : discountValue));
  const netDelivery = money(deliveryFee - shippingSubsidy);
  const beforeCredits = money(remaining - staffDiscount + chargeResult.totalChargesAmount + (deliveryPaymentMethod === 'upon_checkout' ? netDelivery : 0));
  const requestedCredits = amount(input.storeCreditsUsed, 'Store Credits');
  if (requestedCredits && !customer) throw new EndpointError('Select a customer to use Store Credits.');
  const creditsUsed = Math.min(requestedCredits, Number(customer?.storeCredits) || 0, beforeCredits);
  const payableNow = money(beforeCredits - creditsUsed);
  const payableOnDelivery = deliveryPaymentMethod === 'upon_delivery' ? netDelivery : 0;
  const fingerprint = customer ? resolveTrustedFingerprint(customer, {}) : {};
  const history = customer ? await db.select().from(orders).where(eq(orders.customerId,customer.id)).all() : [];
  const tier = calculateCustomerTier(history.filter(order=>['completed','delivered'].includes(String(order.status || '').toLowerCase()))).tier;
  const rewardPointsAmount = customer ? calculateOrderRewardPoints(cart.subtotal,tier,promo?.cashbackPoints || 0,promoDiscount + staffDiscount,creditsUsed) : 0;
  return { fingerprint, rewardPointsAmount, cart, chargeResult, delivery, deliveryFee, deliveryPaymentMethod, promo, promoDiscount, shippingSubsidy, staffDiscount, discountMode, discountValue, creditsUsed, payableNow, payableOnDelivery, total: money(payableNow + payableOnDelivery), availableCredits: Number(customer?.storeCredits) || 0 };
}
