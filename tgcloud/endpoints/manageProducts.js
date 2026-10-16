import { db, EndpointError } from 'sdk';
import { asc, eq } from 'sdk/db';
import { products } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';

const writable = new Set([
  'name', 'price', 'stock', 'category', 'imageUrl', 'description',
  'isActive', 'active', 'isFeatured', 'sortOrder', 'bundleConfig',
  'variants', 'lowStockThreshold', 'tags', 'gallery',
]);

function validateBundle(bundleConfig, parentStock) {
  if (!bundleConfig || typeof bundleConfig !== 'object' || Array.isArray(bundleConfig)) {
    throw new EndpointError('bundleConfig must be an object.', { code: 'INVALID_INPUT' });
  }
  const variants = bundleConfig.variants;
  if (variants === undefined) return;
  if (!Array.isArray(variants)) throw new EndpointError('bundleConfig.variants must be an array.', { code: 'INVALID_INPUT' });
  if (variants.length === 0) return;

  let total = 0;
  for (const variant of variants) {
    if (!variant || typeof variant !== 'object' || Array.isArray(variant)) {
      throw new EndpointError('Each bundle variant must be an object.', { code: 'INVALID_INPUT' });
    }
    const stock = Number(variant.stock);
    if (!Number.isSafeInteger(stock) || stock < 0) {
      throw new EndpointError('Bundle variant stock must be a non-negative integer.', { code: 'INVALID_INPUT' });
    }
    total += stock;
  }
  if (!Number.isSafeInteger(parentStock) || parentStock < 0 || total !== parentStock) {
    throw new EndpointError('Product stock must equal the sum of bundle variant stock.', { code: 'BUNDLE_STOCK_MISMATCH' });
  }
}

function numeric(value, field, integerOnly = false) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (integerOnly && !Number.isSafeInteger(n))) {
    throw new EndpointError(field + ' must be a non-negative ' + (integerOnly ? 'integer' : 'number') + '.', { code: 'INVALID_INPUT' });
  }
  return n;
}

function normalize(input, creating, current = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new EndpointError('Invalid product payload.', { code: 'INVALID_INPUT' });
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'action' || key === 'id' || key === 'reorder') continue;
    if (!writable.has(key)) throw new EndpointError('Unsupported product field: ' + key, { code: 'INVALID_FIELD' });
    if (key === 'name') {
      if (typeof value !== 'string' || !value.trim() || value.length > 240) throw new EndpointError('name must be a non-empty string.', { code: 'INVALID_INPUT' });
      output.name = value.trim();
    } else if (key === 'price') {
      output.price = numeric(value, 'price');
    } else if (key === 'stock') {
      output.stock = numeric(value, 'stock', true);
    } else if (key === 'sortOrder') {
      const n = Number(value);
      if (!Number.isSafeInteger(n)) throw new EndpointError('sortOrder must be an integer.', { code: 'INVALID_INPUT' });
      output.sortOrder = n;
    } else if (key === 'isActive' || key === 'active' || key === 'isFeatured') {
      if (typeof value !== 'boolean') throw new EndpointError(key + ' must be a boolean.', { code: 'INVALID_INPUT' });
      output[key === 'active' ? 'isActive' : key] = value;
    } else if (key === 'category' || key === 'imageUrl' || key === 'description') {
      if (value !== null && typeof value !== 'string') throw new EndpointError(key + ' must be text or null.', { code: 'INVALID_INPUT' });
      output[key] = value;
    } else if (key === 'tags' || key === 'gallery') {
      if (!Array.isArray(value)) throw new EndpointError(key + ' must be an array.', { code: 'INVALID_INPUT' });
      output[key] = value;
    } else if (key === 'bundleConfig') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EndpointError('bundleConfig must be an object.', { code: 'INVALID_INPUT' });
      output.bundleConfig = value;
    } else if (key === 'variants') {
      if (!Array.isArray(value)) throw new EndpointError('variants must be an array.', { code: 'INVALID_INPUT' });
    } else if (key === 'lowStockThreshold') {
      numeric(value, 'lowStockThreshold', true);
    }
  }

  const currentBundle = current?.bundleConfig && typeof current.bundleConfig === 'object' && !Array.isArray(current.bundleConfig)
    ? current.bundleConfig : {};
  if (input.bundleConfig !== undefined) {
    output.bundleConfig = input.bundleConfig;
  }
  if (input.variants !== undefined || input.lowStockThreshold !== undefined) {
    output.bundleConfig = {
      ...currentBundle,
      ...(input.bundleConfig && typeof input.bundleConfig === 'object' && !Array.isArray(input.bundleConfig) ? input.bundleConfig : {}),
      ...(input.variants !== undefined ? { variants: input.variants } : {}),
      ...(input.lowStockThreshold !== undefined ? { lowStockThreshold: numeric(input.lowStockThreshold, 'lowStockThreshold', true) } : {}),
    };
  }
  const finalStock = output.stock !== undefined ? output.stock : Number(current?.stock ?? 0);
  const finalBundle = output.bundleConfig !== undefined ? output.bundleConfig : currentBundle;
  validateBundle(finalBundle, finalStock);

  if (creating && (!output.name || output.price === undefined || output.stock === undefined)) {
    throw new EndpointError('name, price, and stock are required.', { code: 'INVALID_INPUT' });
  }
  if (!creating && Object.keys(output).length === 0) throw new EndpointError('No editable product fields supplied.', { code: 'INVALID_INPUT' });
  output.updatedAt = new Date();
  return output;
}

export default async function (input, ctx) {
  await requireAdmin(ctx);
  const action = input?.action;

  if (action === 'list') return await db.select().from(products).orderBy(asc(products.sortOrder)).all();

  if (action === 'reorder') {
    if (!Array.isArray(input?.reorder) || input.reorder.length > 500) throw new EndpointError('reorder must be an array of at most 500 items.', { code: 'INVALID_INPUT' });
    const seen = new Set();
    for (const item of input.reorder) {
      if (!item || typeof item.id !== 'string' || !item.id.trim() || !Number.isSafeInteger(item.sortOrder) || seen.has(item.id)) {
        throw new EndpointError('Each reorder item needs a unique product ID and integer sortOrder.', { code: 'INVALID_INPUT' });
      }
      seen.add(item.id);
    }
    // Deliberately update only sort_order; never replace/delete the product collection.
    for (const item of input.reorder) {
      const result = await db.update(products).set({ sortOrder: item.sortOrder, updatedAt: new Date() }).where(eq(products.id, item.id)).returning().run();
      if (!result[0]) throw new EndpointError('Product not found while reordering: ' + item.id, { code: 'NOT_FOUND' });
    }
    return { success: true, count: input.reorder.length };
  }

  if (action === 'create') {
    const values = normalize(input, true);
    values.createdAt = new Date();
    const [product] = await db.insert(products).values(values).returning().run();
    return { success: true, product };
  }

  if (action === 'update') {
    if (typeof input?.id !== 'string' || !input.id.trim()) throw new EndpointError('A product ID is required.', { code: 'INVALID_INPUT' });
    const current = await db.select().from(products).where(eq(products.id, input.id)).get();
    if (!current) throw new EndpointError('Product not found.', { code: 'NOT_FOUND' });
    const values = normalize(input, false, current);
    const [product] = await db.update(products).set(values).where(eq(products.id, input.id)).returning().run();
    if (!product) throw new EndpointError('Product not found.', { code: 'NOT_FOUND' });
    return { success: true, product };
  }

  if (action === 'delete') {
    if (typeof input?.id !== 'string' || !input.id.trim()) throw new EndpointError('A product ID is required.', { code: 'INVALID_INPUT' });
    const [deleted] = await db.delete(products).where(eq(products.id, input.id)).returning().run();
    if (!deleted) throw new EndpointError('Product not found.', { code: 'NOT_FOUND' });
    return { success: true, id: deleted.id };
  }

  throw new EndpointError('Unsupported product action.', { code: 'INVALID_ACTION' });
}
