import { db } from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
  getDoc,
  addDoc, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  writeBatch 
} from 'firebase/firestore';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { cacheStore } from '@/lib/cache';

/**
 * Utility to convert keys between camelCase and snake_case for Supabase
 */
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
  if (isSupabaseConfigured()) {
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

    return (data || []).map(p => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      stock: Number(p.stock),
      category: p.category,
      imageUrl: p.image_url,
      description: p.description,
      isActive: p.is_active,
      isFeatured: p.is_featured,
      sortOrder: p.sort_order,
      bundleConfig: p.bundle_config,
      tags: p.tags,
      gallery: p.gallery,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));
  }

  // Fallback to Firestore
  const productsCol = collection(db, 'products');
  const productsSnap = await getDocs(productsCol);
  const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  products.sort((a: any, b: any) => {
    const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 999999;
    const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 999999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.name || '').localeCompare(b.name || '');
  });
  return products;
}

export async function createProductInDb(productData: any) {
  if (isSupabaseConfigured()) {
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
      bundle_config: productData.bundleConfig || {},
      tags: productData.tags || [],
      gallery: productData.gallery || [],
    };

    const { data, error } = await supabase.from('products').insert([payload]).select().single();
    if (error) throw error;
    return { id: data.id, ...productData };
  }

  const productsCol = collection(db, 'products');
  const docRef = await addDoc(productsCol, {
    ...productData,
    createdAt: new Date().toISOString(),
  });
  return { id: docRef.id, ...productData };
}

export async function updateProductInDb(id: string, updates: any) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin()!;
    const payload: Record<string, any> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.price !== undefined) payload.price = Number(updates.price);
    if (updates.stock !== undefined) payload.stock = Number(updates.stock);
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.imageUrl !== undefined) payload.image_url = updates.imageUrl;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    if (updates.isFeatured !== undefined) payload.is_featured = updates.isFeatured;
    if (updates.sortOrder !== undefined) payload.sort_order = Number(updates.sortOrder);
    if (updates.bundleConfig !== undefined) payload.bundle_config = updates.bundleConfig;
    if (updates.tags !== undefined) payload.tags = updates.tags;
    if (updates.gallery !== undefined) payload.gallery = updates.gallery;
    payload.updated_at = new Date().toISOString();

    const { error } = await supabase.from('products').update(payload).eq('id', id);
    if (error) throw error;
    return { success: true };
  }

  const productRef = doc(db, 'products', id);
  await updateDoc(productRef, updates);
  return { success: true };
}

export async function deleteProductInDb(id: string) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin()!;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }

  const productRef = doc(db, 'products', id);
  await deleteDoc(productRef);
  return { success: true };
}

// ==============================================================================
// ORDERS
// ==============================================================================
export async function getOrdersFromDb(limitCount = 150) {
  if (isSupabaseConfigured()) {
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

  // Firestore fallback
  const ordersCol = collection(db, 'orders');
  const q = query(ordersCol, orderBy('createdAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getCustomerOrdersFromDb(customerId: string, primeMemberId: string) {
  if (isSupabaseConfigured()) {
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
      subtotal: Number(o.subtotal),
      totalAmount: Number(o.total_amount),
      createdAt: o.created_at
    })) as any[];
  }

  // Fallback to Firestore
  try {
    const ordersCol = collection(db, 'orders');
    const qField = customerId ? 'customerId' : 'primeMemberId';
    const qVal = customerId || primeMemberId;
    const q = query(ordersCol, where(qField, '==', qVal));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  } catch (err) {
    console.error('Firestore getCustomerOrders error:', err);
    return [] as any[];
  }
}

export async function createOrderInDb(orderPayload: any) {
  if (isSupabaseConfigured()) {
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

  const ordersCol = collection(db, 'orders');
  const docRef = await addDoc(ordersCol, {
    ...orderPayload,
    reviewStatus: 'Pending Manual Review',
    requiresManualReview: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { id: docRef.id, ...orderPayload };
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
    }
  } catch (e) {
    // Treat as plain text
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
    flashHourEnd: promoData.flashHourEnd !== undefined ? promoData.flashHourEnd : null
  };
  return JSON.stringify(meta);
}

export async function getPromosFromDb() {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase
      .from('promos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase getPromos error:', error);
      throw error;
    }

    return (data || []).map(p => deserializePromo(p)) as any[];
  }

  // Fallback to Firestore
  const promosCol = collection(db, 'promos');
  const snap = await getDocs(promosCol);
  const promos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  promos.sort((a: any, b: any) => {
    const tA = new Date(a.createdAt || 0).getTime();
    const tB = new Date(b.createdAt || 0).getTime();
    return tB - tA;
  });
  return promos as any[];
}

export async function getPromoByCodeFromDb(code: string) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase
      .from('promos')
      .select('*')
      .eq('code', cleanCode);

    if (error) throw error;
    if (!data || data.length === 0) return null;
    return deserializePromo(data[0]);
  }

  // Fallback to Firestore
  const promosCol = collection(db, 'promos');
  const q = query(promosCol, where('code', '==', cleanCode));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function createPromoInDb(promoData: any) {
  if (isSupabaseConfigured()) {
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

  // Fallback to Firestore
  const promosCol = collection(db, 'promos');
  const id = promoData.id || `promo_${Date.now()}`;
  await setDoc(doc(db, 'promos', id), {
    ...promoData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return { id, ...promoData };
}

export async function updatePromoInDb(id: string, updates: any) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin()!;
    
    // First, fetch current promo to retrieve existing description metadata to merge with
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

    // Merge updates into meta fields
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

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString()
    };
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

  // Fallback to Firestore
  const promoRef = doc(db, 'promos', id);
  await updateDoc(promoRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
  const snap = await getDoc(promoRef);
  return { id, ...snap.data() };
}

export async function deletePromoInDb(id: string) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin()!;
    const { error } = await supabase.from('promos').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }

  // Fallback to Firestore
  const promoRef = doc(db, 'promos', id);
  await deleteDoc(promoRef);
  return { success: true };
}

export async function getPromoRedemptionsFromDb(limitCount = 200) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase
      .from('promo_redemptions')
      .select('*')
      .limit(limitCount);
      
    if (error) {
      console.error('Supabase getPromoRedemptions error:', error);
      return [] as any[];
    }
    
    return (data || []).map(r => ({
      id: r.id,
      promoCode: r.promo_code,
      promoId: r.promo_id,
      customerId: r.customer_id,
      orderId: r.order_id,
      deviceId: r.device_id,
      discountAmount: Number(r.discount_amount) || 0,
      usedAt: r.used_at
    })) as any[];
  }
  
  // Fallback to Firestore
  try {
    const redCol = collection(db, 'promo_redemptions');
    const qRed = query(redCol, limit(limitCount));
    const redSnap = await getDocs(qRed);
    return redSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  } catch {
    return [] as any[];
  }
}

export async function createPromoRedemptionInDb(redemptionPayload: any) {
  if (isSupabaseConfigured()) {
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
  
  // Fallback to Firestore
  const redCol = collection(db, 'promo_redemptions');
  const id = redemptionPayload.id || `red_${Date.now()}`;
  await setDoc(doc(db, 'promo_redemptions', id), {
    ...redemptionPayload,
    usedAt: redemptionPayload.usedAt || new Date().toISOString()
  });
  return { id, ...redemptionPayload };
}

export async function getPromoRedemptionsForCodeFromDb(code: string) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase
      .from('promo_redemptions')
      .select('*')
      .eq('promo_code', cleanCode);
      
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id,
      promoCode: r.promo_code,
      promoId: r.promo_id,
      customerId: r.customer_id,
      orderId: r.order_id,
      deviceId: r.device_id,
      discountAmount: Number(r.discount_amount) || 0,
      usedAt: r.used_at
    })) as any[];
  }
  
  // Fallback to Firestore
  const redCol = collection(db, 'promo_redemptions');
  const q = query(redCol, where('promoCode', '==', cleanCode));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
}
