import { db } from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
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
