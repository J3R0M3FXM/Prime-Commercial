import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin, isSupabaseAdminConfigured, uploadToSupabaseStorage } from '@/lib/supabase';
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
// IN-MEMORY STUBS (Active when Supabase is not configured)
// ==============================================================================
const DEFAULT_PRODUCTS = [
  {
    id: 'prod-001',
    name: 'PRIME Heavyweight French Terry Hoodie',
    price: 1899,
    stock: 45,
    category: 'Clothing',
    imageUrl: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=80',
    description: 'Signature 460gsm cotton fleece hoodie with structured drop-shoulder fit and matte chrome hardware accents.',
    isActive: true,
    active: true,
    isFeatured: true,
    sortOrder: 1,
    bundleConfig: {
      variants: [
        { id: 'v1', name: 'Black / M', price: 1899, stock: 15 },
        { id: 'v2', name: 'Black / L', price: 1899, stock: 20 },
        { id: 'v3', name: 'Black / XL', price: 1899, stock: 10 },
      ],
      lowStockThreshold: 5,
    },
    variants: [
      { id: 'v1', name: 'Black / M', price: 1899, stock: 15 },
      { id: 'v2', name: 'Black / L', price: 1899, stock: 20 },
      { id: 'v3', name: 'Black / XL', price: 1899, stock: 10 },
    ],
    lowStockThreshold: 5,
    tags: ['Best Seller', 'Drop 01', 'Featured'],
    gallery: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-002',
    name: 'PRIME Oversized Minimalist Tee',
    price: 899,
    stock: 60,
    category: 'Clothing',
    imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80',
    description: '280gsm combed cotton boxy tee. High density ribbed collar with subtle tonal PRIME crest typography.',
    isActive: true,
    active: true,
    isFeatured: true,
    sortOrder: 2,
    bundleConfig: {
      variants: [
        { id: 'v4', name: 'Washed Black / M', price: 899, stock: 25 },
        { id: 'v5', name: 'Washed Black / L', price: 899, stock: 25 },
        { id: 'v6', name: 'Chalk White / L', price: 899, stock: 10 },
      ],
      lowStockThreshold: 5,
    },
    variants: [
      { id: 'v4', name: 'Washed Black / M', price: 899, stock: 25 },
      { id: 'v5', name: 'Washed Black / L', price: 899, stock: 25 },
      { id: 'v6', name: 'Chalk White / L', price: 899, stock: 10 },
    ],
    lowStockThreshold: 5,
    tags: ['Essential', 'Featured'],
    gallery: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-003',
    name: 'PRIME Stealth Crossbody Bag',
    price: 1450,
    stock: 28,
    category: 'Bags',
    imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80',
    description: 'Weather-resistant Cordura ballistic nylon sling with Fidlock magnetic buckle and modular compartments.',
    isActive: true,
    active: true,
    isFeatured: true,
    sortOrder: 3,
    bundleConfig: { variants: [], lowStockThreshold: 5 },
    variants: [],
    lowStockThreshold: 5,
    tags: ['Accessories', 'Waterproof'],
    gallery: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-004',
    name: 'PRIME Insulated Tumbler 750ml',
    price: 1150,
    stock: 35,
    category: 'Accessories',
    imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80',
    description: 'Double-wall vacuum insulated 18/8 stainless steel flask. Keeps beverages cold 24h, hot 12h.',
    isActive: true,
    active: true,
    isFeatured: false,
    sortOrder: 4,
    bundleConfig: { variants: [], lowStockThreshold: 5 },
    variants: [],
    lowStockThreshold: 5,
    tags: ['Lifestyle'],
    gallery: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-005',
    name: 'PRIME Low-Profile Dad Cap',
    price: 650,
    stock: 50,
    category: 'Accessories',
    imageUrl: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=800&q=80',
    description: 'Washed cotton twill 6-panel cap with brass tri-glide closure and discreet tonal embroidery.',
    isActive: true,
    active: true,
    isFeatured: false,
    sortOrder: 5,
    bundleConfig: { variants: [], lowStockThreshold: 5 },
    variants: [],
    lowStockThreshold: 5,
    tags: ['Headwear'],
    gallery: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-006',
    name: 'PRIME Cargo Utility Track Pants',
    price: 1750,
    stock: 22,
    category: 'Clothing',
    imageUrl: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=800&q=80',
    description: 'Ergonomic tapered fit with dual bellows cargo pockets and toggle hem cinch cords.',
    isActive: true,
    active: true,
    isFeatured: false,
    sortOrder: 6,
    bundleConfig: {
      variants: [
        { id: 'v7', name: 'Matte Slate / M', price: 1750, stock: 10 },
        { id: 'v8', name: 'Matte Slate / L', price: 1750, stock: 12 },
      ],
      lowStockThreshold: 5,
    },
    variants: [
      { id: 'v7', name: 'Matte Slate / M', price: 1750, stock: 10 },
      { id: 'v8', name: 'Matte Slate / L', price: 1750, stock: 12 },
    ],
    lowStockThreshold: 5,
    tags: ['New Arrival'],
    gallery: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DATA_DIR = path.join(process.cwd(), '.data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

function loadInMemoryProducts() {
  try {
    if (fs.existsSync(PRODUCTS_FILE)) {
      const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to load products from disk:", e);
  }
  return [...DEFAULT_PRODUCTS];
}

function saveInMemoryProducts(products: any[]) {
  console.log("Saving products to disk, count:", products.length);
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf8');
  } catch (e) {
    console.warn("Failed to save products to disk:", e);
  }
}

let inMemoryProducts: any[] = loadInMemoryProducts();
let inMemoryOrders: any[] = [];
let inMemoryCouriers: any[] = [
  {
    id: 'courier-grab',
    name: 'Grab Express (Metro Manila)',
    trackingUrlPattern: 'https://grab.com/ph/track/{trackingNumber}',
    isActive: true,
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'courier-lalamove',
    name: 'Lalamove Instant Courier',
    trackingUrlPattern: 'https://lalamove.com/track/{trackingNumber}',
    isActive: true,
    sortOrder: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'courier-jnt',
    name: 'J&T Express (Nationwide)',
    trackingUrlPattern: 'https://jtexpress.ph/index/query/gzquery.html?bills={trackingNumber}',
    isActive: true,
    sortOrder: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
let inMemoryWarehouses: any[] = [
  {
    id: 'wh-main',
    name: 'PRIME BGC Fulfillment Hub',
    code: 'BGC-01',
    address: 'Bonifacio Global City, Taguig, Metro Manila',
    lat: 14.5492,
    lon: 121.0478,
    isActive: true,
    isDefault: true,
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
let inMemoryCharges: any[] = [
  {
    id: 'charge-packaging',
    name: 'Eco-Protective Packaging',
    type: 'fixed',
    amount: 30,
    value: 30,
    rate: 30,
    isActive: true,
    isDefault: true,
    defaultAddToBill: true,
    schedules: { days: [0,1,2,3,4,5,6], daysOfWeek: [0,1,2,3,4,5,6], isOvernight: false, overnight: false, isRecurring: false, recurring: false },
    description: 'High-grade biodegradable courier packaging and tamper-evident seal.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
let inMemoryPaymentMethods: any[] = [
  {
    id: 'pm-gcash',
    name: 'GCash',
    logo: '',
    paymentType: 'manual_qr',
    qrCodeImage: '',
    accountName: 'PRIME MERCHANDISE PH',
    accountNumber: '0917-123-4567',
    sortOrder: 1,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pm-maya',
    name: 'Maya',
    logo: '',
    paymentType: 'manual_qr',
    qrCodeImage: '',
    accountName: 'PRIME STORE INC',
    accountNumber: '0918-987-6543',
    sortOrder: 2,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pm-cod',
    name: 'Cash on Delivery',
    logo: '',
    paymentType: 'cod',
    qrCodeImage: '',
    accountName: '',
    accountNumber: '',
    sortOrder: 3,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
let inMemoryCustomers: any[] = [];
let inMemoryPromos: any[] = [
  {
    id: 'promo-prime10',
    code: 'PRIME10',
    title: '10% Off Prime Welcome',
    description: 'Enjoy 10% off on your order over ₱1,000.',
    voucherType: 'shop_voucher',
    discountType: 'percentage',
    discountValue: 10,
    maxDiscountAmount: 300,
    minSpend: 1000,
    customerEligibility: 'all',
    allowedPaymentMethods: ['all'],
    allowedCourierIds: ['all'],
    activeDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    isPaydayOnly: false,
    usageLimitPerCustomer: 1,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
let inMemoryPromoRedemptions: any[] = [];

// ==============================================================================
// PRODUCTS
// ==============================================================================
export async function getProductsFromDb() {
  if (!isSupabaseAdminConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Supabase admin credentials are not configured.');
    }
    return [...inMemoryProducts];
  }

  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;

  return (data || []).map(p => {
    const bundleConfig = (p.bundle_config && typeof p.bundle_config === 'object') ? p.bundle_config : {};
    const variants = Array.isArray(bundleConfig.variants) ? bundleConfig.variants : [];
    return {
      id: p.id,
      name: p.name,
      price: Number(p.price),
      stock: Number(p.stock),
      category: p.category,
      imageUrl: p.image_url || '',
      image_url: p.image_url || '',
      description: p.description || '',
      isActive: p.is_active !== false,
      active: p.is_active !== false,
      isFeatured: Boolean(p.is_featured),
      sortOrder: Number(p.sort_order) || 0,
      bundleConfig,
      variants,
      lowStockThreshold: Number(bundleConfig.lowStockThreshold ?? 10),
      tags: p.tags || [],
      gallery: p.gallery || [],
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  });
}

async function processProductImage(imageUrl: string | undefined, productId: string, prefix = 'prod'): Promise<string> {
  if (!imageUrl || typeof imageUrl !== 'string') return '';
  const trimmed = imageUrl.trim();
  if (!trimmed) return '';

  // If already an HTTP/HTTPS or relative path, return as is
  if (!trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  // Handle Base64 image
  // 1. Try Supabase Storage if configured
  if (isSupabaseAdminConfigured()) {
    try {
      const ext = trimmed.includes('image/png') ? 'png' : 'jpg';
      const contentType = trimmed.includes('image/png') ? 'image/png' : 'image/jpeg';
      const filename = `${prefix}-${String(productId).replace(/[^a-zA-Z0-9_-]/g, '_')}-${Date.now()}.${ext}`;
      const res = await uploadToSupabaseStorage({
        bucket: 'product-images',
        path: filename,
        data: trimmed,
        contentType,
        upsert: true,
      });
      if (res && res.url) {
        return res.url;
      }
      if (res?.error) {
        console.warn(`Supabase Storage upload warning for ${productId}:`, res.error);
      }
    } catch (storageErr) {
      console.warn(`Supabase Storage upload exception for ${productId}:`, storageErr);
    }
  }

  // 2. Fallback to direct self-contained Base64 Data URL.
  // Base64 Data URLs display reliably across all browsers/WebViews, persist in Postgres TEXT and local JSON,
  // and prevent 404 broken image states from container filesystem restarts.
  return trimmed;
}

export async function createProductInDb(productData: any) {
  const previousProducts = [...inMemoryProducts];
  if (process.env.NODE_ENV === 'production' && !isSupabaseAdminConfigured()) {
    throw new Error('Supabase admin credentials are not configured.');
  }
  const id = productData.id || `prod-${Date.now()}`;
  const rawImage = productData.imageUrl !== undefined ? productData.imageUrl : (productData.image_url || '');
  const finalImageUrl = await processProductImage(rawImage, id, 'prod');

  // Process variant images if any
  let processedVariants = Array.isArray(productData.variants) ? [...productData.variants] : [];
  for (let i = 0; i < processedVariants.length; i++) {
    const v = processedVariants[i];
    if (v && v.imageUrl && typeof v.imageUrl === 'string' && v.imageUrl.startsWith('data:image/')) {
      v.imageUrl = await processProductImage(v.imageUrl, `${id}-v${i + 1}`, 'variant');
    }
    v.stock = Math.max(0, Math.floor(Number(v.stock) || 0));
    v.price = Number(v.price) || Number(productData.price) || 0;
  }

  // Synchronize product stock with sum of variant stocks to respect database triggers
  let totalStock = Number(productData.stock) || 0;
  if (processedVariants.length > 0) {
    totalStock = processedVariants.reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
  }

  const newProduct = {
    id,
    name: productData.name || '',
    price: Number(productData.price) || 0,
    stock: totalStock,
    category: productData.category || 'General',
    imageUrl: finalImageUrl,
    image_url: finalImageUrl,
    description: productData.description || '',
    isActive: productData.isActive !== false,
    active: productData.isActive !== false,
    isFeatured: Boolean(productData.isFeatured),
    sortOrder: Number(productData.sortOrder) || inMemoryProducts.length + 1,
    bundleConfig: {
      ...(productData.bundleConfig || {}),
      variants: processedVariants,
      lowStockThreshold: Number(productData.lowStockThreshold || 5),
    },
    variants: processedVariants,
    lowStockThreshold: Number(productData.lowStockThreshold || 5),
    tags: productData.tags || [],
    gallery: productData.gallery || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const existingIdx = inMemoryProducts.findIndex(p => p.id === id);
  if (existingIdx !== -1) {
    inMemoryProducts[existingIdx] = { ...inMemoryProducts[existingIdx], ...newProduct };
  } else {
    inMemoryProducts.push(newProduct);
  }
  saveInMemoryProducts(inMemoryProducts);
  cacheStore.invalidateProducts();

  if (isSupabaseAdminConfigured()) {
    try {
      const supabase = getSupabaseAdmin()!;
      const payload = {
        id,
        name: newProduct.name,
        price: newProduct.price,
        stock: newProduct.stock,
        category: newProduct.category,
        image_url: finalImageUrl,
        description: newProduct.description,
        is_active: newProduct.isActive,
        is_featured: newProduct.isFeatured,
        sort_order: newProduct.sortOrder,
        bundle_config: newProduct.bundleConfig,
        tags: newProduct.tags,
        gallery: newProduct.gallery,
        updated_at: newProduct.updatedAt,
      };
      const { error: upsertErr } = await supabase.from('products').upsert([payload]);
      if (upsertErr) throw upsertErr;
    } catch (err) {
      inMemoryProducts = previousProducts;
      saveInMemoryProducts(inMemoryProducts);
      cacheStore.invalidateProducts();
      throw err;
    }
  }

  return newProduct;
}

export async function updateProductInDb(id: string, updates: any) {
  const previousProducts = [...inMemoryProducts];
  if (process.env.NODE_ENV === 'production' && !isSupabaseAdminConfigured()) {
    throw new Error('Supabase admin credentials are not configured.');
  }
  const idx = inMemoryProducts.findIndex(p => p.id === id);
  const sanitizedUpdates = Object.entries(updates).reduce((acc, [key, val]) => {
    if (val !== undefined && val !== null) acc[key] = val;
    return acc;
  }, {} as any);
  console.log("Updating product:", id, "Sanitized updates keys:", Object.keys(sanitizedUpdates));
  
  // Process main product image if provided
  let finalImageUrl: string | undefined = undefined;
  if (sanitizedUpdates.imageUrl !== undefined || sanitizedUpdates.image_url !== undefined) {
    const rawImage = sanitizedUpdates.imageUrl !== undefined ? sanitizedUpdates.imageUrl : sanitizedUpdates.image_url;
    finalImageUrl = await processProductImage(rawImage, id, 'prod');
  }

  // Process variant images if provided
  let processedVariants: any[] | undefined = undefined;
  if (Array.isArray(sanitizedUpdates.variants)) {
    processedVariants = [...sanitizedUpdates.variants];
    for (let i = 0; i < processedVariants.length; i++) {
      const v = processedVariants[i];
      if (v && v.imageUrl && typeof v.imageUrl === 'string' && v.imageUrl.startsWith('data:image/')) {
        v.imageUrl = await processProductImage(v.imageUrl, `${id}-v${i + 1}`, 'variant');
      }
      v.stock = Math.max(0, Math.floor(Number(v.stock) || 0));
      v.price = Number(v.price) || Number(sanitizedUpdates.price) || 0;
    }
  }

  let updatedProduct: any;
  if (idx !== -1) {
    const existing = inMemoryProducts[idx];
    const variants = processedVariants !== undefined ? processedVariants : (existing.variants || []);
    let calculatedStock = Number(sanitizedUpdates.stock !== undefined ? sanitizedUpdates.stock : existing.stock) || 0;
    if (variants.length > 0) {
      calculatedStock = variants.reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
    }

    inMemoryProducts[idx] = {
      ...existing,
      ...sanitizedUpdates,
      stock: calculatedStock,
      ...(finalImageUrl !== undefined ? { imageUrl: finalImageUrl, image_url: finalImageUrl } : {}),
      variants,
      bundleConfig: {
        ...(existing.bundleConfig || {}),
        ...(sanitizedUpdates.bundleConfig || {}),
        variants,
        lowStockThreshold: Number(sanitizedUpdates.lowStockThreshold ?? existing.lowStockThreshold ?? 10),
      },
      ...(sanitizedUpdates.active !== undefined ? { isActive: Boolean(sanitizedUpdates.active) } : {}),
      ...(sanitizedUpdates.isActive !== undefined ? { active: Boolean(sanitizedUpdates.isActive) } : {}),
      updatedAt: new Date().toISOString(),
    };
    updatedProduct = inMemoryProducts[idx];
  } else {
    const variants = processedVariants || updates.variants || [];
    let calculatedStock = Number(updates.stock) || 0;
    if (variants.length > 0) {
      calculatedStock = variants.reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
    }
    const img = finalImageUrl !== undefined ? finalImageUrl : (updates.imageUrl || updates.image_url || '');

    updatedProduct = { 
      id, 
      ...updates, 
      stock: calculatedStock,
      imageUrl: img,
      image_url: img,
      variants,
      bundleConfig: {
        ...(updates.bundleConfig || {}),
        variants,
        lowStockThreshold: Number(updates.lowStockThreshold || 10),
      },
      updatedAt: new Date().toISOString() 
    };
    inMemoryProducts.push(updatedProduct);
  }
  saveInMemoryProducts(inMemoryProducts);
  cacheStore.invalidateProducts();

  if (isSupabaseAdminConfigured()) {
    try {
    // IMPORTANT: Updates must be sparse. Never upsert a reconstructed in-memory
    // product here: serverless instances may not have the current DB row loaded,
    // and a sort-only update could otherwise overwrite real product data with
    // empty/default values.
    const supabase = getSupabaseAdmin()!;
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (sanitizedUpdates.name !== undefined) payload.name = sanitizedUpdates.name;
    if (sanitizedUpdates.price !== undefined) payload.price = Number(sanitizedUpdates.price);
    if (sanitizedUpdates.stock !== undefined) payload.stock = Number(sanitizedUpdates.stock);
    if (sanitizedUpdates.category !== undefined) payload.category = sanitizedUpdates.category;
    if (finalImageUrl !== undefined) payload.image_url = finalImageUrl;
    else if (sanitizedUpdates.image_url !== undefined) payload.image_url = sanitizedUpdates.image_url;
    if (sanitizedUpdates.description !== undefined) payload.description = sanitizedUpdates.description;
    if (sanitizedUpdates.isActive !== undefined || sanitizedUpdates.active !== undefined) {
      payload.is_active = sanitizedUpdates.isActive !== undefined
        ? Boolean(sanitizedUpdates.isActive)
        : Boolean(sanitizedUpdates.active);
    }
    if (sanitizedUpdates.isFeatured !== undefined) payload.is_featured = Boolean(sanitizedUpdates.isFeatured);
    if (sanitizedUpdates.sortOrder !== undefined) payload.sort_order = Number(sanitizedUpdates.sortOrder);
    if (sanitizedUpdates.bundleConfig !== undefined) {
      payload.bundle_config = {
        ...sanitizedUpdates.bundleConfig,
        ...(processedVariants !== undefined ? { variants: processedVariants } : {}),
      };
    } else if (processedVariants !== undefined) {
      payload.bundle_config = {
        variants: processedVariants,
        lowStockThreshold: Number(sanitizedUpdates.lowStockThreshold ?? 10),
      };
    } else if (sanitizedUpdates.lowStockThreshold !== undefined) {
      // Preserve other JSON settings when changing only the threshold.
      const { data: current, error: readError } = await supabase
        .from('products')
        .select('bundle_config')
        .eq('id', id)
        .maybeSingle();
      if (readError) throw readError;
      payload.bundle_config = {
        ...((current?.bundle_config && typeof current.bundle_config === 'object') ? current.bundle_config : {}),
        lowStockThreshold: Number(sanitizedUpdates.lowStockThreshold),
      };
    }
    if (sanitizedUpdates.tags !== undefined) payload.tags = sanitizedUpdates.tags;
    if (sanitizedUpdates.gallery !== undefined) payload.gallery = sanitizedUpdates.gallery;

    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error(`Product not found for update: ${id}`);
    } catch (error) {
      inMemoryProducts = previousProducts;
      saveInMemoryProducts(inMemoryProducts);
      cacheStore.invalidateProducts();
      throw error;
    }
  }

  return { success: true, product: updatedProduct };
}

export async function deleteProductInDb(id: string) {
  if (process.env.NODE_ENV === 'production' && !isSupabaseAdminConfigured()) {
    throw new Error('Supabase admin credentials are not configured.');
  }
  if (!isSupabaseAdminConfigured()) {
    inMemoryProducts = inMemoryProducts.filter(p => p.id !== id);
    saveInMemoryProducts(inMemoryProducts);
    return { success: true };
  }
  const supabase = getSupabaseAdmin()!;
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}

// ==============================================================================
// ORDERS
// ==============================================================================
export async function getOrdersFromDb(limitCount = 150) {
  if (!isSupabaseAdminConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new Error('Supabase admin credentials are not configured.');
    return [...inMemoryOrders];
  }
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
  if (!isSupabaseAdminConfigured()) {
    return inMemoryOrders.map(o => ({
      id: o.id,
      status: o.status,
      subtotal: Number(o.subtotal) || 0,
      subTotal: Number(o.subtotal) || 0,
      totalAmount: Number(o.totalAmount) || 0,
      createdAt: o.createdAt,
    })) as any[];
  }
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
  if (!isSupabaseAdminConfigured()) {
    const orderNumber = orderPayload.orderNumber || `ORD-${Date.now()}`;
    const newOrder = {
      id: `ord_${Date.now()}`,
      orderNumber,
      ...orderPayload,
      status: orderPayload.status || 'Processing',
      paymentStatus: orderPayload.paymentStatus || (orderPayload.paymentProofImage ? 'Pending Review' : 'Unpaid'),
      reviewStatus: 'Pending Manual Review',
      requiresManualReview: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    inMemoryOrders.unshift(newOrder);
    return newOrder;
  }
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
  if (!isSupabaseAdminConfigured()) {
    const idx = inMemoryOrders.findIndex(o => o.id === id);
    if (idx !== -1) {
      inMemoryOrders[idx] = { ...inMemoryOrders[idx], ...updates, updatedAt: new Date().toISOString() };
    }
    return { success: true };
  }
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
  if (!isSupabaseAdminConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new Error('Supabase admin credentials are not configured.');
    return [...inMemoryPromos];
  }
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
  if (!isSupabaseAdminConfigured()) {
    const found = inMemoryPromos.find(p => p.code === cleanCode);
    return found ? { ...found } : null;
  }
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
  if (!isSupabaseAdminConfigured()) {
    const newPromo = {
      id: promoData.id || `promo_${Date.now()}`,
      code: String(promoData.code || '').trim().toUpperCase(),
      ...promoData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    inMemoryPromos.push(newPromo);
    return newPromo;
  }
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
  if (!isSupabaseAdminConfigured()) {
    const idx = inMemoryPromos.findIndex(p => p.id === id);
    if (idx !== -1) {
      inMemoryPromos[idx] = { ...inMemoryPromos[idx], ...updates, updatedAt: new Date().toISOString() };
      return inMemoryPromos[idx];
    }
    return null;
  }
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
  if (!isSupabaseAdminConfigured()) {
    inMemoryPromos = inMemoryPromos.filter(p => p.id !== id);
    return { success: true };
  }
  const supabase = getSupabaseAdmin()!;
  const { error } = await supabase.from('promos').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}

export async function getPromoRedemptionsFromDb(limitCount = 200) {
  if (!isSupabaseAdminConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new Error('Supabase admin credentials are not configured.');
    return [...inMemoryPromoRedemptions];
  }
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
  if (!isSupabaseAdminConfigured()) {
    const payload = {
      id: redemptionPayload.id || `red_${Date.now()}`,
      promo_code: redemptionPayload.promoCode,
      promo_id: redemptionPayload.promoId,
      customer_id: redemptionPayload.customerId || null,
      order_id: redemptionPayload.orderId || null,
      device_id: redemptionPayload.deviceId || null,
      hardware_id: redemptionPayload.hardwareId || null,
      device_fingerprint_id: redemptionPayload.deviceFingerprintId || null,
      server_fingerprint_id: redemptionPayload.serverFingerprintId || null,
      discount_amount: Number(redemptionPayload.discountAmount) || 0,
      used_at: redemptionPayload.usedAt || new Date().toISOString()
    };
    inMemoryPromoRedemptions.push(payload);
    return payload;
  }
  const supabase = getSupabaseAdmin()!;
  const payload = {
    id: redemptionPayload.id || `red_${Date.now()}`,
    promo_code: redemptionPayload.promoCode,
    promo_id: redemptionPayload.promoId,
    customer_id: redemptionPayload.customerId || null,
    order_id: redemptionPayload.orderId || null,
    device_id: redemptionPayload.deviceId || null,
    hardware_id: redemptionPayload.hardwareId || null,
    device_fingerprint_id: redemptionPayload.deviceFingerprintId || null,
    server_fingerprint_id: redemptionPayload.serverFingerprintId || null,
    discount_amount: Number(redemptionPayload.discountAmount) || 0,
    used_at: redemptionPayload.usedAt || new Date().toISOString()
  };
  const { data, error } = await supabase.from('promo_redemptions').insert([payload]).select().single();
  if (error) throw error;
  return data;
}

export async function getPromoRedemptionsForCodeFromDb(code: string) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!isSupabaseAdminConfigured()) {
    return inMemoryPromoRedemptions
      .filter(r => (r.promo_code || r.promoCode) === cleanCode && !(r.released_at || r.releasedAt))
      .map(r => ({
        id: r.id,
        promoCode: r.promo_code || r.promoCode,
        promoId: r.promo_id || r.promoId,
        customerId: r.customer_id || r.customerId,
        orderId: r.order_id || r.orderId,
        deviceId: r.device_id || r.deviceId,
        hardwareId: r.hardware_id || r.hardwareId,
        deviceFingerprintId: r.device_fingerprint_id || r.deviceFingerprintId,
        serverFingerprintId: r.server_fingerprint_id || r.serverFingerprintId,
        releasedAt: r.released_at || r.releasedAt,
        discountAmount: Number(r.discount_amount || r.discountAmount) || 0,
        usedAt: r.used_at || r.usedAt
      }));
  }
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
  if (!isSupabaseAdminConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new Error('Supabase admin credentials are not configured.');
    return [...inMemoryWarehouses];
  }
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
  if (!isSupabaseAdminConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new Error('Supabase admin credentials are not configured.');
    return [...inMemoryCouriers];
  }
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
  if (!isSupabaseAdminConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new Error('Supabase admin credentials are not configured.');
    return [...inMemoryCharges];
  }
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
  if (!isSupabaseAdminConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new Error('Supabase admin credentials are not configured.');
    return [...inMemoryPaymentMethods];
  }
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
  if (!isSupabaseAdminConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new Error('Supabase admin credentials are not configured.');
    return [...inMemoryCustomers];
  }
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
