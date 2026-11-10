import { db, EndpointError } from 'sdk';
import { inArray } from 'sdk/db';
import { products } from '../schema.js';

function productIdOf(item) {
  const explicit = String(item?.productId || item?.product_id || '').trim();
  if (explicit) return explicit;
  const raw = String(item?.id || '').trim();
  return raw.includes('_') ? raw.slice(0, raw.indexOf('_')) : raw;
}

function variantIdOf(item) {
  const explicit = String(item?.variantId || item?.variant_id || '').trim();
  if (explicit) return explicit;
  const raw = String(item?.id || '').trim();
  return raw.includes('_') ? raw.slice(raw.indexOf('_') + 1) || 'default' : 'default';
}

/** Rebuild the checkout basket using current Serverless product data only. */
export async function canonicalizeOrderItems(inputItems) {
  if (!Array.isArray(inputItems) || inputItems.length < 1 || inputItems.length > 100) {
    throw new EndpointError('Cart must contain between 1 and 100 different items.', { code: 'INVALID_CART' });
  }
  const grouped = new Map();
  for (const raw of inputItems) {
    const productId = productIdOf(raw);
    const variantId = variantIdOf(raw) || 'default';
    const quantityValue = Number(raw?.quantity ?? 1);
    if (!productId || !Number.isSafeInteger(quantityValue) || quantityValue < 1 || quantityValue > 1000) {
      throw new EndpointError('Each cart item needs a product and valid quantity.', { code: 'INVALID_CART' });
    }
    const quantity = quantityValue;
    const key = productId + '\u0000' + variantId;
    const previous = grouped.get(key);
    const total = (previous?.quantity || 0) + quantity;
    if (total > 1000) throw new EndpointError('Requested quantity exceeds the allowed limit.', { code: 'INVALID_CART' });
    grouped.set(key, { productId, variantId, quantity: total });
  }
  const lines = Array.from(grouped.values());
  const productIds = Array.from(new Set(lines.map((line) => line.productId)));
  const rows = await db.select().from(products).where(inArray(products.id, productIds)).all();
  const productMap = new Map(rows.map((row) => [String(row.id), row]));
  let subtotal = 0;
  let itemQuantity = 0;
  const items = [];

  for (const line of lines) {
    const product = productMap.get(line.productId);
    if (!product || product.isActive === false) {
      throw new EndpointError('One or more selected products are no longer available. Refresh your cart.', { code: 'PRODUCT_UNAVAILABLE' });
    }
    const bundle = product.bundleConfig && typeof product.bundleConfig === 'object' && !Array.isArray(product.bundleConfig)
      ? product.bundleConfig : {};
    const variants = Array.isArray(bundle.variants) ? bundle.variants : [];
    const variant = variants.length ? variants.find((row) => String(row?.id) === line.variantId) : null;
    if (variants.length && !variant) {
      throw new EndpointError('A selected option is no longer available. Refresh your cart.', { code: 'VARIANT_UNAVAILABLE' });
    }
    const price = Math.max(0, Number(variant?.price ?? product.price) || 0);
    const name = String(product.name || 'Item') + (variant ? ' - ' + String(variant.name || line.variantId) : '');
    const imageUrl = String(variant?.imageUrl || variant?.image_url || product.imageUrl || '');
    subtotal += price * line.quantity;
    itemQuantity += line.quantity;
    items.push({
      id: line.productId + '_' + line.variantId,
      productId: line.productId,
      variantId: line.variantId,
      name,
      price,
      originalPrice: price,
      quantity: line.quantity,
      imageUrl,
      isFree: price === 0,
    });
  }
  return {
    items,
    reservations: lines,
    subtotal: Math.round(subtotal * 100) / 100,
    itemQuantity,
  };
}
