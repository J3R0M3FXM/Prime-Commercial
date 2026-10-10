import { db } from 'sdk';
import { asc, eq } from 'sdk/db';
import { products } from '../schema.js';

/**
 * Public, read-only catalog endpoint.
 *
 * Never accepts a client-supplied price or stock value. Checkout must re-read
 * product data on the server and reserve stock atomically; this endpoint is
 * only for displaying currently active products.
 */
export default async function () {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      stock: products.stock,
      category: products.category,
      imageUrl: products.imageUrl,
      description: products.description,
      isFeatured: products.isFeatured,
      sortOrder: products.sortOrder,
      bundleConfig: products.bundleConfig,
      tags: products.tags,
      gallery: products.gallery,
    })
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(asc(products.sortOrder))
    .all();

  return { products: rows };
}
