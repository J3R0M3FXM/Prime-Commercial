export function deserializePromo(row) {
  if (!row) return null;
  const rawDescription = String(row.description || '');
  let meta = {};
  try {
    if (rawDescription.startsWith('{') && rawDescription.endsWith('}')) meta = JSON.parse(rawDescription);
  } catch {
    meta = {};
  }
  const hasMeta = meta && typeof meta === 'object' && !Array.isArray(meta);
  return {
    id: row.id,
    code: String(row.code || ''),
    title: String(row.title || ''),
    description: hasMeta ? String(meta.realDescription || '') : rawDescription,
    voucherType: hasMeta ? meta.voucherType ?? 'shop_voucher' : 'shop_voucher',
    discountType: row.discountType,
    discountValue: Number(row.discountValue) || 0,
    maxDiscountAmount: row.maxDiscountAmount == null ? undefined : Number(row.maxDiscountAmount),
    cappedShippingDiscount: hasMeta && meta.cappedShippingDiscount != null ? Number(meta.cappedShippingDiscount) : undefined,
    cashbackPercentage: hasMeta && meta.cashbackPercentage != null ? Number(meta.cashbackPercentage) : undefined,
    minSpend: Number(row.minSpend) || 0,
    minItemQuantity: hasMeta && meta.minItemQuantity != null ? Number(meta.minItemQuantity) : undefined,
    customerEligibility: hasMeta ? meta.customerEligibility ?? 'all' : 'all',
    minPreviousOrders: hasMeta && meta.minPreviousOrders != null ? Number(meta.minPreviousOrders) : undefined,
    eligibleTiers: hasMeta && Array.isArray(meta.eligibleTiers) ? meta.eligibleTiers : [],
    allowedPaymentMethods: hasMeta && Array.isArray(meta.allowedPaymentMethods) ? meta.allowedPaymentMethods : ['all'],
    allowedCourierIds: hasMeta && Array.isArray(meta.allowedCourierIds) ? meta.allowedCourierIds : ['all'],
    activeDaysOfWeek: hasMeta && Array.isArray(meta.activeDaysOfWeek) ? meta.activeDaysOfWeek : [0, 1, 2, 3, 4, 5, 6],
    isPaydayOnly: hasMeta ? Boolean(meta.isPaydayOnly) : false,
    flashHourStart: hasMeta && meta.flashHourStart != null ? Number(meta.flashHourStart) : undefined,
    flashHourEnd: hasMeta && meta.flashHourEnd != null ? Number(meta.flashHourEnd) : undefined,
    totalUsageLimit: row.totalUsageLimit == null ? undefined : Number(row.totalUsageLimit),
    usageCount: Number(row.usageCount) || 0,
    usageLimitPerCustomer: Number(row.usageLimitPerCustomer) || 1,
    isActive: row.isActive !== false,
    startDate: row.startDate || undefined,
    endDate: row.endDate || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializePromoDescription(promo, existingDescription = '') {
  let previous = {};
  try {
    if (typeof existingDescription === 'string' && existingDescription.startsWith('{') && existingDescription.endsWith('}')) {
      const parsed = JSON.parse(existingDescription);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) previous = parsed;
    }
  } catch {
    previous = {};
  }
  return JSON.stringify({
    ...previous,
    realDescription: String(promo.description || ''),
    voucherType: promo.voucherType || 'shop_voucher',
    customerEligibility: promo.customerEligibility || 'all',
    minItemQuantity: promo.minItemQuantity !== undefined ? promo.minItemQuantity : null,
    minPreviousOrders: promo.minPreviousOrders !== undefined ? promo.minPreviousOrders : null,
    eligibleTiers: Array.isArray(promo.eligibleTiers) ? promo.eligibleTiers : [],
    allowedPaymentMethods: Array.isArray(promo.allowedPaymentMethods) ? promo.allowedPaymentMethods : ['all'],
    allowedCourierIds: Array.isArray(promo.allowedCourierIds) ? promo.allowedCourierIds : ['all'],
    activeDaysOfWeek: Array.isArray(promo.activeDaysOfWeek) ? promo.activeDaysOfWeek : [0, 1, 2, 3, 4, 5, 6],
    isPaydayOnly: Boolean(promo.isPaydayOnly),
    flashHourStart: promo.flashHourStart !== undefined ? promo.flashHourStart : null,
    flashHourEnd: promo.flashHourEnd !== undefined ? promo.flashHourEnd : null,
    cappedShippingDiscount: promo.cappedShippingDiscount !== undefined ? promo.cappedShippingDiscount : null,
    cashbackPercentage: promo.cashbackPercentage !== undefined ? promo.cashbackPercentage : null,
  });
}


export function calculatePromoDiscount(promo, itemsSubtotal, deliveryFee = 0) {
  const subtotalValue = Number(itemsSubtotal);
  const feeValue = Number(deliveryFee);
  const subtotal = Number.isFinite(subtotalValue) ? Math.max(0, subtotalValue) : 0;
  const fee = Number.isFinite(feeValue) ? Math.max(0, feeValue) : 0;
  if (promo.discountType === 'free_shipping') {
    return { discount: fee, isFreeShipping: true, shippingSubsidy: fee, cashbackPoints: 0 };
  }
  if (promo.discountType === 'shipping_discount') {
    const cap = Number(promo.cappedShippingDiscount || promo.discountValue) || fee;
    const subsidy = Math.min(fee, Math.max(0, cap));
    return { discount: subsidy, isFreeShipping: subsidy >= fee && fee > 0, shippingSubsidy: subsidy, cashbackPoints: 0 };
  }
  if (promo.discountType === 'fixed') {
    return { discount: Math.min(subtotal, Number(promo.discountValue) || 0), isFreeShipping: false, shippingSubsidy: 0, cashbackPoints: 0 };
  }
  if (promo.discountType === 'percentage') {
    const percent = Math.max(0, Number(promo.discountValue) || 0);
    let calculated = subtotal * percent / 100;
    if (promo.maxDiscountAmount && promo.maxDiscountAmount > 0) calculated = Math.min(calculated, Number(promo.maxDiscountAmount));
    return { discount: Math.min(subtotal, calculated), isFreeShipping: false, shippingSubsidy: 0, cashbackPoints: 0 };
  }
  if (promo.discountType === 'coins_cashback') {
    const percent = Math.max(0, Number(promo.discountValue || promo.cashbackPercentage) || 0);
    let points = Math.floor(subtotal * percent / 100);
    if (promo.maxDiscountAmount && promo.maxDiscountAmount > 0) points = Math.min(points, Number(promo.maxDiscountAmount));
    return { discount: 0, isFreeShipping: false, shippingSubsidy: 0, cashbackPoints: points };
  }
  return { discount: 0, isFreeShipping: false, shippingSubsidy: 0, cashbackPoints: 0 };
}
