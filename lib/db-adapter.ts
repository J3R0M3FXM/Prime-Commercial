import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { cacheStore } from '@/lib/cache';

export function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = val;
  }
  return result;
}

export function toCamelCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = val;
  }
  return result;
}

// ==============================================================================
// PRODUCTS
// ==============================================================================
export async function getProductsFromDb() {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Supabase getProducts error:', error);
    throw error;
  }

  return (data || []).map(p => {
    const bundleConfig = (p.bundle_config && typeof p.bundle_config === 'object') ? p.bundle_config : {};
    return {
      id: p.id,
      name: p.name,
      price: Number(p.price),
      stock: Number(p.stock),
      category: p.category,
      imageUrl: p.image_url,
      description: p.description,
      isActive: p.is_active,
      active: p.is_active,
      isFeatured: p.is_featured,
      sortOrder: p.sort_order,
      bundleConfig,
      variants: Array.isArray(bundleConfig.variants) ? bundleConfig.variants : [],
      lowStockThreshold: Number(bundleConfig.lowStockThreshold ?? 10),
      tags: p.tags,
      gallery: p.gallery,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  });
}

export async function createProductInDb(productData: any) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const payload = {
    name: productData.name,
    price: Number(productData.price) || 0,
    stock: Number(productData.stock) || 0,
    category: productData.category || 'General',
    image_url: productData.imageUrl || '',
    description: productData.description || '',
    is_active: productData.isActive !== false,
    is_featured: Boolean(productData.isFeatured),
    sort_order: Number(productData.sortOrder) || 0,
    bundle_config: {
      ...((productData.bundleConfig && typeof productData.bundleConfig === 'object') ? productData.bundleConfig : {}),
      ...(Array.isArray(productData.variants) ? { variants: productData.variants } : {}),
      ...(productData.lowStockThreshold !== undefined ? { lowStockThreshold: Number(productData.lowStockThreshold) || 0 } : {}),
    },
    tags: productData.tags || [],
    gallery: productData.gallery || [],
  };

  const { data, error } = await supabase.from('products').insert([payload]).select().single();
  if (error) throw error;
  return { id: data.id, ...productData };
}

export async function updateProductInDb(id: string, updates: any) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const payload: Record<string, any> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.price !== undefined) payload.price = Number(updates.price);
  if (updates.stock !== undefined) payload.stock = Number(updates.stock);
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.imageUrl !== undefined) payload.image_url = updates.imageUrl;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.isActive !== undefined) payload.is_active = updates.isActive;
  if (updates.active !== undefined) payload.is_active = Boolean(updates.active);
  if (updates.isFeatured !== undefined) payload.is_featured = updates.isFeatured;
  if (updates.sortOrder !== undefined) payload.sort_order = Number(updates.sortOrder);
  if (updates.bundleConfig !== undefined) payload.bundle_config = updates.bundleConfig;
  if (updates.variants !== undefined || updates.lowStockThreshold !== undefined) {
    const { data: current, error: currentError } = await supabase
      .from('products')
      .select('bundle_config')
      .eq('id', id)
      .single();
    if (currentError) throw currentError;
    const currentBundle = (current?.bundle_config && typeof current.bundle_config === 'object') ? current.bundle_config : {};
    payload.bundle_config = {
      ...currentBundle,
      ...(updates.bundleConfig && typeof updates.bundleConfig === 'object' ? updates.bundleConfig : {}),
      ...(updates.variants !== undefined ? { variants: updates.variants } : {}),
      ...(updates.lowStockThreshold !== undefined ? { lowStockThreshold: Number(updates.lowStockThreshold) || 0 } : {}),
    };
  }
  if (updates.tags !== undefined) payload.tags = updates.tags;
  if (updates.gallery !== undefined) payload.gallery = updates.gallery;
  payload.updated_at = new Date().toISOString();

  const { error } = await supabase.from('products').update(payload).eq('id', id);
  if (error) throw error;
  return { success: true };
}

export async function deleteProductInDb(id: string) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}

// ==============================================================================
// ORDERS
// ==============================================================================
export async function getOrdersFromDb(limitCount = 150) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limitCount);

  if (error) throw error;

  return (data || []).map(o => ({
    id: o.id,
    orderNumber: o.order_number,
    customerId: o.customer_id,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    tgUserId: o.tg_user_id,
    primeMemberId: o.prime_member_id,
    items: o.items,
    subtotal: Number(o.subtotal),
    deliveryFee: Number(o.delivery_fee),
    discountAmount: Number(o.discount_amount),
    appliedPromoCode: o.applied_promo_code,
    pointsDiscount: Number(o.points_discount),
    chargesBreakdown: o.charges_breakdown,
    totalAmount: Number(o.total_amount),
    payableNow: Number(o.payable_now),
    payableOnDelivery: Number(o.payable_on_delivery),
    status: o.status,
    paymentStatus: o.payment_status,
    paymentMethodId: o.payment_method_id,
    paymentMethodName: o.payment_method_name,
    paymentProofImage: o.payment_proof_image,
    ocrAnalysis: o.ocr_analysis,
    reviewStatus: o.review_status,
    requiresManualReview: o.requires_manual_review,
    deliveryAddress: o.delivery_address,
    courierId: o.courier_id,
    courierName: o.courier_name,
    trackingNumber: o.tracking_number,
    notes: o.notes,
    fingerprintSnapshot: o.fingerprint_snapshot,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  }));
}

export async function getCustomerOrdersFromDb(customerId: string, primeMemberId: string) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  let queryBuilder = supabase.from('orders').select('*');
  if (customerId && primeMemberId) {
    queryBuilder = queryBuilder.or(`customer_id.eq.${customerId},prime_member_id.eq.${primeMemberId}`);
  } else if (customerId) {
    queryBuilder = queryBuilder.eq('customer_id', customerId);
  } else if (primeMemberId) {
    queryBuilder = queryBuilder.eq('prime_member_id', primeMemberId);
  } else {
    return [] as any[];
  }
  const { data, error } = await queryBuilder;
  if (error) {
    console.error('Supabase getCustomerOrders error:', error);
    return [] as any[];
  }
  return (data || []).map(o => ({
    id: o.id,
    status: o.status,
    subtotal: Number(o.subtotal) || 0,
    subTotal: Number(o.subtotal) || 0,
    totalAmount: Number(o.total_amount) || 0,
    createdAt: o.created_at
  })) as any[];
}

export async function createOrderInDb(orderPayload: any) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const payload = {
    order_number: orderPayload.orderNumber || `ORD-${Date.now()}`,
    customer_id: orderPayload.customerId || null,
    customer_name: orderPayload.customerName || orderPayload.receiverName || '',
    customer_phone: orderPayload.customerPhone || orderPayload.receiverPhone || '',
    tg_user_id: String(orderPayload.tgUserId || ''),
    prime_member_id: orderPayload.primeMemberId || '',
    items: orderPayload.items || [],
    subtotal: Number(orderPayload.subtotal) || 0,
    delivery_fee: Number(orderPayload.deliveryFee) || 0,
    discount_amount: Number(orderPayload.discountAmount) || 0,
    applied_promo_code: orderPayload.appliedPromoCode || '',
    points_discount: Number(orderPayload.pointsDiscount) || 0,
    charges_breakdown: orderPayload.chargesBreakdown || [],
    total_amount: Number(orderPayload.totalAmount) || 0,
    payable_now: Number(orderPayload.payableNow) || 0,
    payable_on_delivery: Number(orderPayload.payableOnDelivery) || 0,
    status: orderPayload.status || 'Processing',
    payment_status: orderPayload.paymentStatus || (orderPayload.paymentProofImage ? 'Pending Review' : 'Unpaid'),
    payment_method_id: orderPayload.paymentMethodId || '',
    payment_method_name: orderPayload.paymentMethodName || '',
    payment_proof_image: orderPayload.paymentProofImage || '',
    ocr_analysis: orderPayload.ocrAnalysis || null,
    review_status: 'Pending Manual Review',
    requires_manual_review: true,
    delivery_address: orderPayload.deliveryAddress || {},
    courier_id: orderPayload.courierId || '',
    courier_name: orderPayload.courierName || '',
    tracking_number: orderPayload.trackingNumber || '',
    notes: orderPayload.notes || '',
    fingerprint_snapshot: orderPayload.fingerprintSnapshot || null,
  };

  const { data, error } = await supabase.from('orders').insert([payload]).select().single();
  if (error) throw error;
  return { id: data.id, ...orderPayload };
}

export async function updateOrderInDb(id: string, updates: any) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.paymentStatus !== undefined) payload.payment_status = updates.paymentStatus;
  if (updates.trackingNumber !== undefined) payload.tracking_number = updates.trackingNumber;
  if (updates.courierId !== undefined) payload.courier_id = updates.courierId;
  if (updates.courierName !== undefined) payload.courier_name = updates.courierName;
  if (updates.reviewStatus !== undefined) payload.review_status = updates.reviewStatus;

  const { error } = await supabase.from('orders').update(payload).eq('id', id);
  if (error) throw error;
  return { success: true };
}

// ==============================================================================
// PROMOS & VOUCHERS
// ==============================================================================
function deserializePromo(p: any) {
  if (!p) return null;
  let description = p.description || '';
  let voucherType = 'shop_voucher';
  let customerEligibility = 'all';
  let minItemQuantity = null;
  let minPreviousOrders = null;
  let eligibleTiers: string[] = [];
  let allowedPaymentMethods = ['all'];
  let allowedCourierIds = ['all'];
  let activeDaysOfWeek = [0, 1, 2, 3, 4, 5, 6];
  let isPaydayOnly = false;
  let flashHourStart = null;
  let flashHourEnd = null;
  let cappedShippingDiscount = null;
  let cashbackPercentage = null;

  try {
    if (description && description.startsWith('{') && description.endsWith('}')) {
      const meta = JSON.parse(description);
      description = meta.realDescription || '';
      if (meta.voucherType !== undefined) voucherType = meta.voucherType;
      if (meta.customerEligibility !== undefined) customerEligibility = meta.customerEligibility;
      if (meta.minItemQuantity !== undefined) minItemQuantity = meta.minItemQuantity;
      if (meta.minPreviousOrders !== undefined) minPreviousOrders = meta.minPreviousOrders;
      if (meta.eligibleTiers !== undefined) eligibleTiers = meta.eligibleTiers;
      if (meta.allowedPaymentMethods !== undefined) allowedPaymentMethods = meta.allowedPaymentMethods;
      if (meta.allowedCourierIds !== undefined) allowedCourierIds = meta.allowedCourierIds;
      if (meta.activeDaysOfWeek !== undefined) activeDaysOfWeek = meta.activeDaysOfWeek;
      if (meta.isPaydayOnly !== undefined) isPaydayOnly = meta.isPaydayOnly;
      if (meta.flashHourStart !== undefined) flashHourStart = meta.flashHourStart;
      if (meta.flashHourEnd !== undefined) flashHourEnd = meta.flashHourEnd;
      if (meta.cappedShippingDiscount !== undefined) cappedShippingDiscount = meta.cappedShippingDiscount;
      if (meta.cashbackPercentage !== undefined) cashbackPercentage = meta.cashbackPercentage;
    }
  } catch {
    // plain text
  }

  return {
    id: p.id,
    code: p.code,
    title: p.title || '',
    description,
    voucherType,
    discountType: p.discount_type,
    discountValue: Number(p.discount_value) || 0,
    maxDiscountAmount: p.max_discount_amount !== null ? Number(p.max_discount_amount) : undefined,
    minSpend: Number(p.min_spend) || 0,
    minItemQuantity: minItemQuantity || undefined,
    customerEligibility,
    minPreviousOrders: minPreviousOrders || undefined,
    eligibleTiers,
    allowedPaymentMethods,
    allowedCourierIds,
    activeDaysOfWeek,
    isPaydayOnly,
    flashHourStart: flashHourStart !== null ? Number(flashHourStart) : undefined,
    flashHourEnd: flashHourEnd !== null ? Number(flashHourEnd) : undefined,
    cappedShippingDiscount: cappedShippingDiscount !== null ? Number(cappedShippingDiscount) : undefined,
    cashbackPercentage: cashbackPercentage !== null ? Number(cashbackPercentage) : undefined,
    totalUsageLimit: p.total_usage_limit !== null ? Number(p.total_usage_limit) : undefined,
    usageCount: Number(p.usage_count) || 0,
    usageLimitPerCustomer: Number(p.usage_limit_per_customer) || 1,
    isActive: p.is_active !== false,
    startDate: p.start_date || undefined,
    endDate: p.end_date || undefined,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function serializePromoDescription(promoData: any) {
  const meta = {
    realDescription: promoData.description || '',
    voucherType: promoData.voucherType || 'shop_voucher',
    customerEligibility: promoData.customerEligibility || 'all',
    minItemQuantity: promoData.minItemQuantity !== undefined ? promoData.minItemQuantity : null,
    minPreviousOrders: promoData.minPreviousOrders !== undefined ? promoData.minPreviousOrders : null,
    eligibleTiers: promoData.eligibleTiers || [],
    allowedPaymentMethods: promoData.allowedPaymentMethods || ['all'],
    allowedCourierIds: promoData.allowedCourierIds || ['all'],
    activeDaysOfWeek: promoData.activeDaysOfWeek || [0, 1, 2, 3, 4, 5, 6],
    isPaydayOnly: Boolean(promoData.isPaydayOnly),
    flashHourStart: promoData.flashHourStart !== undefined ? promoData.flashHourStart : null,
    flashHourEnd: promoData.flashHourEnd !== undefined ? promoData.flashHourEnd : null,
    cappedShippingDiscount: promoData.cappedShippingDiscount !== undefined ? promoData.cappedShippingDiscount : null,
    cashbackPercentage: promoData.cashbackPercentage !== undefined ? promoData.cashbackPercentage : null
  };
  return JSON.stringify(meta);
}

export async function getPromosFromDb() {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from('promos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(p => deserializePromo(p)) as any[];
}

export async function getPromoByCodeFromDb(code: string) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from('promos')
    .select('*')
    .eq('code', cleanCode);

  if (error) throw error;
  if (!data || data.length === 0) return null;
  return deserializePromo(data[0]);
}

export async function createPromoInDb(promoData: any) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const serializedDesc = serializePromoDescription(promoData);
  const payload = {
    id: promoData.id || `promo_${Date.now()}`,
    code: String(promoData.code || '').trim().toUpperCase(),
    title: promoData.title || '',
    description: serializedDesc,
    discount_type: promoData.discountType,
    discount_value: Number(promoData.discountValue) || 0,
    max_discount_amount: promoData.maxDiscountAmount ? Number(promoData.maxDiscountAmount) : null,
    min_spend: Number(promoData.minSpend) || 0,
    total_usage_limit: promoData.totalUsageLimit ? Number(promoData.totalUsageLimit) : null,
    usage_count: Number(promoData.usageCount) || 0,
    usage_limit_per_customer: Number(promoData.usageLimitPerCustomer) || 1,
    is_active: promoData.isActive !== false,
    start_date: promoData.startDate || null,
    end_date: promoData.endDate || null,
  };

  const { data, error } = await supabase.from('promos').insert([payload]).select().single();
  if (error) throw error;
  return deserializePromo(data);
}

export async function updatePromoInDb(id: string, updates: any) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const { data: current, error: getErr } = await supabase
    .from('promos')
    .select('*')
    .eq('id', id)
    .single();

  if (getErr) throw getErr;

  let currentMeta: any = {};
  try {
    if (current.description && current.description.startsWith('{') && current.description.endsWith('}')) {
      currentMeta = JSON.parse(current.description);
    } else {
      currentMeta = { realDescription: current.description || '' };
    }
  } catch {
    currentMeta = { realDescription: current.description || '' };
  }

  if (updates.description !== undefined) currentMeta.realDescription = updates.description;
  if (updates.voucherType !== undefined) currentMeta.voucherType = updates.voucherType;
  if (updates.customerEligibility !== undefined) currentMeta.customerEligibility = updates.customerEligibility;
  if (updates.minItemQuantity !== undefined) currentMeta.minItemQuantity = updates.minItemQuantity;
  if (updates.minPreviousOrders !== undefined) currentMeta.minPreviousOrders = updates.minPreviousOrders;
  if (updates.eligibleTiers !== undefined) currentMeta.eligibleTiers = updates.eligibleTiers;
  if (updates.allowedPaymentMethods !== undefined) currentMeta.allowedPaymentMethods = updates.allowedPaymentMethods;
  if (updates.allowedCourierIds !== undefined) currentMeta.allowedCourierIds = updates.allowedCourierIds;
  if (updates.activeDaysOfWeek !== undefined) currentMeta.activeDaysOfWeek = updates.activeDaysOfWeek;
  if (updates.isPaydayOnly !== undefined) currentMeta.isPaydayOnly = updates.isPaydayOnly;
  if (updates.flashHourStart !== undefined) currentMeta.flashHourStart = updates.flashHourStart;
  if (updates.flashHourEnd !== undefined) currentMeta.flashHourEnd = updates.flashHourEnd;
  if (updates.cappedShippingDiscount !== undefined) currentMeta.cappedShippingDiscount = updates.cappedShippingDiscount;
  if (updates.cashbackPercentage !== undefined) currentMeta.cashbackPercentage = updates.cashbackPercentage;

  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.code !== undefined) payload.code = String(updates.code).trim().toUpperCase();
  if (updates.title !== undefined) payload.title = updates.title;
  payload.description = JSON.stringify(currentMeta);
  if (updates.discountType !== undefined) payload.discount_type = updates.discountType;
  if (updates.discountValue !== undefined) payload.discount_value = Number(updates.discountValue);
  if (updates.maxDiscountAmount !== undefined) payload.max_discount_amount = updates.maxDiscountAmount ? Number(updates.maxDiscountAmount) : null;
  if (updates.minSpend !== undefined) payload.min_spend = Number(updates.minSpend);
  if (updates.totalUsageLimit !== undefined) payload.total_usage_limit = updates.totalUsageLimit ? Number(updates.totalUsageLimit) : null;
  if (updates.usageCount !== undefined) payload.usage_count = Number(updates.usageCount);
  if (updates.usageLimitPerCustomer !== undefined) payload.usage_limit_per_customer = Number(updates.usageLimitPerCustomer);
  if (updates.isActive !== undefined) payload.is_active = updates.isActive;
  if (updates.startDate !== undefined) payload.start_date = updates.startDate;
  if (updates.endDate !== undefined) payload.end_date = updates.endDate;

  const { data, error } = await supabase.from('promos').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return deserializePromo(data);
}

export async function deletePromoInDb(id: string) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const { error } = await supabase.from('promos').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}

export async function getPromoRedemptionsFromDb(limitCount = 200) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from('promo_redemptions')
    .select('*')
    .limit(limitCount);
    
  if (error) return [] as any[];
  return (data || []).map(r => ({
    id: r.id,
    promoCode: r.promo_code,
    promoId: r.promo_id,
    customerId: r.customer_id,
    orderId: r.order_id,
    deviceId: r.device_id,
    hardwareId: r.hardware_id,
    deviceFingerprintId: r.device_fingerprint_id,
    serverFingerprintId: r.server_fingerprint_id,
    releasedAt: r.released_at,
    discountAmount: Number(r.discount_amount) || 0,
    usedAt: r.used_at
  })) as any[];
}

export async function createPromoRedemptionInDb(redemptionPayload: any) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const payload = {
    id: redemptionPayload.id || `red_${Date.now()}`,
    promo_code: redemptionPayload.promoCode,
    promo_id: redemptionPayload.promoId,
    customer_id: redemptionPayload.customerId || null,
    order_id: redemptionPayload.orderId || null,
    device_id: redemptionPayload.deviceId || redemptionPayload.hardwareId || null,
    discount_amount: Number(redemptionPayload.discountAmount) || 0,
    used_at: redemptionPayload.usedAt || new Date().toISOString()
  };
  const { data, error } = await supabase.from('promo_redemptions').insert([payload]).select().single();
  if (error) throw error;
  return data;
}

export async function getPromoRedemptionsForCodeFromDb(code: string) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from('promo_redemptions')
    .select('*')
    .eq('promo_code', cleanCode)
    .is('released_at', null);
    
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.id,
    promoCode: r.promo_code,
    promoId: r.promo_id,
    customerId: r.customer_id,
    orderId: r.order_id,
    deviceId: r.device_id,
    hardwareId: r.hardware_id,
    deviceFingerprintId: r.device_fingerprint_id,
    serverFingerprintId: r.server_fingerprint_id,
    releasedAt: r.released_at,
    discountAmount: Number(r.discount_amount) || 0,
    usedAt: r.used_at
  })) as any[];
}

// ==============================================================================
// WAREHOUSES, COURIERS, CHARGES, PAYMENT METHODS, CUSTOMERS
// ==============================================================================
export async function getWarehousesFromDb() {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase.from('warehouses').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map(w => ({
    id: w.id,
    name: w.name,
    code: w.code,
    address: w.address,
    lat: w.latitude !== null && w.latitude !== undefined ? Number(w.latitude) : null,
    lon: w.longitude !== null && w.longitude !== undefined ? Number(w.longitude) : null,
    isActive: w.is_active,
    isDefault: Boolean(w.is_default),
    sortOrder: w.sort_order,
    createdAt: w.created_at,
    updatedAt: w.updated_at
  }));
}

export async function getCouriersFromDb() {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase.from('couriers').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map(c => ({
    id: c.id,
    name: c.name,
    trackingUrlPattern: c.tracking_url_pattern,
    isActive: c.is_active,
    sortOrder: c.sort_order,
    createdAt: c.created_at,
    updatedAt: c.updated_at
  }));
}

export async function getChargesFromDb() {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase.from('charges').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map(ch => {
    let schedules: any = {};
    try {
      if (typeof ch.description === 'string' && ch.description.trim().startsWith('{')) {
        schedules = JSON.parse(ch.description);
      }
    } catch {}
    return {
      id: ch.id,
      name: ch.name,
      type: ch.type,
      amount: Number(ch.rate) || 0,
      value: Number(ch.rate) || 0,
      rate: Number(ch.rate) || 0,
      isActive: ch.is_active,
      isDefault: typeof schedules.isDefault === 'boolean' ? schedules.isDefault : undefined,
      defaultAddToBill: typeof schedules.isDefault === 'boolean' ? schedules.isDefault : undefined,
      schedules: {
        ...schedules,
        days: Array.isArray(schedules.days) ? schedules.days : (Array.isArray(schedules.daysOfWeek) ? schedules.daysOfWeek : []),
        daysOfWeek: Array.isArray(schedules.days) ? schedules.days : (Array.isArray(schedules.daysOfWeek) ? schedules.daysOfWeek : []),
        isOvernight: Boolean(schedules.isOvernight ?? schedules.overnight ?? false),
        overnight: Boolean(schedules.isOvernight ?? schedules.overnight ?? false),
        isRecurring: Boolean(schedules.isRecurring ?? schedules.recurring ?? false),
        recurring: Boolean(schedules.isRecurring ?? schedules.recurring ?? false),
      },
      description: ch.description,
      createdAt: ch.created_at,
      updatedAt: ch.updated_at
    };
  });
}

export async function getPaymentMethodsFromDb() {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase.from('payment_methods').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map(pm => ({
    id: pm.id,
    name: pm.name,
    logo: pm.logo,
    paymentType: pm.payment_type,
    qrCodeImage: pm.qr_code_image,
    webhookUrl: pm.webhook_url,
    publicKey: pm.public_key,
    secretKey: pm.secret_key,
    walletAddress: pm.wallet_address,
    accountName: pm.account_name,
    accountNumber: pm.account_number,
    sortOrder: pm.sort_order,
    isActive: pm.is_active,
    createdAt: pm.created_at,
    updatedAt: pm.updated_at
  }));
}

export async function getCustomersFromDb() {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(c => ({
    id: c.id,
    tgUserId: c.tg_user_id,
    tgName: c.tg_name,
    tgUsername: c.tg_username,
    phoneNumber: c.phone_number,
    primeMemberId: c.prime_member_id,
    points: Number(c.points) || 0,
    storeCredits: Number(c.store_credits) || 0,
    referralCode: c.referral_code,
    referredBy: c.referred_by,
    totalOrders: Number(c.total_orders) || 0,
    lifetimeSpent: Number(c.lifetime_spent) || 0,
    isBanned: Boolean(c.is_banned),
    fingerprints: c.fingerprints || [],
    createdAt: c.created_at,
    updatedAt: c.updated_at
  }));
}
