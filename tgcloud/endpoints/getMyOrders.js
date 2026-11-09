import { db, EndpointError } from 'sdk';
import { asc, desc, eq, or } from 'sdk/db';
import { customers, orders } from '../schema.js';
import { findMediaAsset } from '../lib/media.js';

export default async function (_input, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]+$/.test(telegramId)) {
    throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  }

  const customer = await db.select({
    id: customers.id,
    primeMemberId: customers.primeMemberId,
  }).from(customers).where(eq(customers.tgUserId, telegramId)).get();

  const ownership = [eq(orders.tgUserId, telegramId)];
  if (customer?.id) ownership.push(eq(orders.customerId, customer.id));
  if (customer?.primeMemberId) ownership.push(eq(orders.primeMemberId, customer.primeMemberId));

  const rows = await db.select().from(orders)
    .where(ownership.length === 1 ? ownership[0] : or(...ownership))
    .orderBy(desc(orders.createdAt))
    .limit(100)
    .all();

  // Read timestamp columns as scalar values: SDK Date wrappers can serialize as {}.
  const params = {};
  const placeholders = rows.map((row, index) => { const key = ':id' + index; params[key] = row.id; return key; });
  const dates = rows.length ? await db.all(`SELECT id, created_at AS placedAt FROM orders WHERE id IN (${placeholders.join(',')})`, params) : [];
  const placedDates = new Map(dates.map(row => [String(row.id), row.placedAt]));
  return await Promise.all(rows.map(async (order) => {
    const receiptAsset = order.paymentProofImage ? await findMediaAsset(order.paymentProofImage) : null;
    const receiptAssetId = receiptAsset && receiptAsset.visibility === 'private' &&
      String(receiptAsset.orderId || '') === String(order.id) ? receiptAsset.id : null;
    return ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    controlState: order.controlState || 'normal',
    staffEditVersion: Number(order.staffEditVersion || 0),
    paymentStatus: order.paymentStatus,
    paymentMethodName: order.paymentMethodName,
    payableNow: Number(order.payableNow || 0),
    payableOnDelivery: Number(order.payableOnDelivery || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    deliveryAddress: order.deliveryAddress,
    customerPhone: order.customerPhone,
    items: order.items,
    courierName: order.courierName,
    trackingUrl: order.trackingUrl,
    trackingNumber: order.trackingNumber,
    notes: order.notes,
    paymentDeadlineAt: order.paymentDeadlineAt,
    paymentProofSubmittedAt: order.paymentProofSubmittedAt,
    paymentProofImage: order.paymentProofImage,
    appliedPromoCode: order.appliedPromoCode,
    pointsDiscount: Number(order.pointsDiscount || 0),
    chargesBreakdown: order.chargesBreakdown,
    dispatchedAt: order.dispatchedAt,
    totalAmount: Number(order.totalAmount || 0),
    subTotal: Number(order.subtotal || 0),
    promoDiscount: Number(order.discountAmount || order.promoDiscount || 0),
    storeCreditsUsed: Number(order.storeCreditsUsed || 0),
    createdAt: placedDates.get(String(order.id)) ?? order.createdAt,
    deliveredAt: order.deliveredAt,
    referredByUserId: order.referredByUserId,
    referredByMemberId: order.referredByMemberId,
    referralPointsStatus: order.referralPointsStatus,
    customerName: order.customerName,
    receiptAssetId,
  });
  }));
}
