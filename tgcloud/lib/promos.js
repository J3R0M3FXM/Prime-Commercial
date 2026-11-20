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
    freeProductId: hasMeta ? String(meta.freeProductId || '') : '',
    freeVariantId: hasMeta ? String(meta.freeVariantId || 'default') : 'default',
    discountValue: Number(row.discountValue) || 0,
    maxDiscountAmount: row.maxDiscountAmount == null ? undefined : Number(row.maxDiscountAmount),
    cappedShippingDiscount: hasMeta && meta.cappedShippingDiscount != null ? Number(meta.cappedShippingDiscount) : undefined,
    cashbackPercentage: hasMeta && meta.cashbackPercentage != null ? Number(meta.cashbackPercentage) : undefined,
    minSpend: Number(row.minSpend) || 0,
    minItemQuantity: hasMeta && meta.minItemQuantity != null ? Number(meta.minItemQuantity) : undefined,
    requiredItemsMatch: hasMeta ? meta.requiredItemsMatch ?? 'all' : 'all',
    requiredItems: hasMeta && meta.requiredItems != null ? meta.requiredItems : [],
    customerEligibility: hasMeta ? meta.customerEligibility ?? 'all' : 'all',
    eligibleCustomerId: hasMeta ? String(meta.eligibleCustomerId || '') : '',
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
    isActive: row.isActive === true || row.isActive === 1 || row.isActive === '1',
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
    eligibleCustomerId: String(promo.eligibleCustomerId || '').trim(),
    requiredItemsMatch: promo.requiredItemsMatch ?? previous.requiredItemsMatch ?? 'all',
    requiredItems: Array.isArray(promo.requiredItems) ? promo.requiredItems : [],
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
    freeProductId: promo.freeProductId || '',
    freeVariantId: promo.freeVariantId || 'default',
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

export function addFreeProductToCart(cart, canonicalItems, giftLine) {
  canonicalItems.push({ ...giftLine, id: 'gift_' + giftLine.id,
    name: 'Free gift · ' + giftLine.name, price: 0, isFree: true });
  const existing = cart.reservations.find((line) =>
    line.productId === giftLine.productId && line.variantId === giftLine.variantId);
  if (existing) existing.quantity += 1;
  else cart.reservations.push({ productId: giftLine.productId, variantId: giftLine.variantId, quantity: 1 });
}
export function generatePromoCode(prefix = 'PRIME') {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 4; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
  const cleanPrefix = String(prefix || 'PRIME').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleanPrefix + '-' + rand;
}

// Evaluate purchase conditions before any free gift is added to the cart.
function variantWeight(value) {
  const match=String(value || '').trim().match(/^(\d+(?:\.\d+)?|\.\d+)\s*(mg|g|kg|grams?|milligrams?|kilograms?)(?:\s*\|\s*~?\s*\d+(?:\.\d+)?\s*u)?$/i);
  if(!match)return null;
  const unit=match[2].toLowerCase();
  const weight=Number(match[1])*(unit==='mg'||unit.startsWith('milligram')?1:unit==='kg'||unit.startsWith('kilogram')?1000000:1000);
  return Number.isFinite(weight)&&weight>0?Math.round(weight*1000)/1000:null;
}

function qualifyingVariant(rule, line, catalogById) {
  if(!rule.variantId)return true;
  const selected=String(line.variantId || 'default');
  if(selected===rule.variantId)return true;
  const product=catalogById[rule.productId];
  const variants=Array.isArray(product?.variants)?product.variants:[];
  const minimum=variants.find(variant=>String(variant.id)===rule.variantId);
  const candidate=variants.find(variant=>String(variant.id)===selected);
  const minimumWeight=variantWeight(minimum?.name),candidateWeight=variantWeight(candidate?.name);
  return minimumWeight!==null&&candidateWeight!==null&&candidateWeight>=minimumWeight;
}

export function checkPromoItems(promo, items, catalogById = {}) {
  const requirements = promo.requiredItems || [];
  if (!Array.isArray(requirements)) return 'This promo has invalid product requirements.';
  const match = promo.requiredItemsMatch ?? 'all';
  if (match !== 'any' && match !== 'all') return 'This promo has invalid product requirements.';
  if (!requirements.length) return '';
  let matched = 0, missingQuantity = 0;
  const lines = Array.isArray(items) ? items.filter(line => line && !line.isFree) : [];
  for (const rule of requirements) {
    if (!rule || typeof rule.productId !== 'string' || !rule.productId.trim() ||
        typeof rule.variantId !== 'string' || !Number.isSafeInteger(rule.quantity) || rule.quantity < 1) {
      return 'This promo has invalid product requirements.';
    }
    const quantity = lines.reduce((total, line) => {
      const amount = Number(line.quantity);
      return String(line.productId || '') === rule.productId &&
        qualifyingVariant(rule,line,catalogById) &&
        Number.isSafeInteger(amount) && amount > 0 ? total + amount : total;
    }, 0);
    if (quantity >= rule.quantity) matched += 1;
    else if (!missingQuantity) missingQuantity = rule.quantity;
  }
  if (match === 'any') return matched > 0 ? '' : 'Buy the required quantity of at least one selected product and variant to use this promo.';
  return matched === requirements.length ? '' : 'Add every required product and quantity to use this promo (' + missingQuantity + ' required).';
}
