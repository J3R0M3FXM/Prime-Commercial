/** Saved selection takes precedence over balance: a waived delivery fee can still be PUD. */
export function orderDeliveryPaymentMethod(order) {
  let address = order?.deliveryAddress ?? order?.delivery_address ?? {};
  if (typeof address === 'string') {
    try { address = JSON.parse(address); } catch { address = {}; }
  }
  const candidates = [address?.courierPaymentMode, address?.courier_payment_mode,
    order?.deliveryFeePaymentMethod, order?.delivery_fee_payment_method,
    order?.deliveryPaymentMethod, order?.delivery_payment_method];
  for (const candidate of candidates) {
    const mode = String(candidate || '').trim().toLowerCase();
    if (['upon_delivery', 'delivery', 'pud', 'cod', 'cash_on_delivery'].includes(mode)) return 'upon_delivery';
    if (['upon_checkout', 'checkout', 'puc'].includes(mode)) return 'upon_checkout';
  }
  return Number(order?.payableOnDelivery ?? order?.payable_on_delivery) > 0 ? 'upon_delivery' : '';
}
