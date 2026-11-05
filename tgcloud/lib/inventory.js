import { db } from 'sdk';

/**
 * Quantities held by non-expired checkout attempts or live orders. Raw SQL is
 * used for one grouped read so catalog requests do not fetch all order rows.
 */
export async function activeReservationTotals() {
  const rows = await db.all(
    `SELECT r.product_id AS productId, r.variant_id AS variantId,
            CAST(SUM(r.quantity) AS INTEGER) AS reservedQuantity
       FROM inventory_reservations r
       LEFT JOIN orders o ON o.id = r.order_id
      WHERE r.status <> 'released'
        AND ((o.id IS NULL AND r.status = 'held' AND r.expires_at > unixepoch())
          OR (o.id IS NOT NULL
              AND lower(coalesce(o.status, '')) NOT IN ('cancelled', 'canceled', 'expired', 'rejected')
              AND NOT (lower(coalesce(o.status, '')) = 'pending'
                       AND lower(coalesce(o.payment_status, '')) = 'unpaid'
                       AND (o.expired_at IS NOT NULL
                            OR (o.payment_deadline_at IS NOT NULL AND o.payment_deadline_at <= unixepoch())))))
      GROUP BY r.product_id, r.variant_id`,
  );
  return new Map(rows.map((row) => [
    String(row.productId) + ':' + String(row.variantId),
    Math.max(0, Number(row.reservedQuantity) || 0),
  ]));
}

export function withAvailableInventory(product, reservedBySku) {
  const bundle = product?.bundleConfig && typeof product.bundleConfig === 'object' && !Array.isArray(product.bundleConfig)
    ? product.bundleConfig
    : {};
  const variants = Array.isArray(bundle.variants) ? bundle.variants : [];
  if (variants.length) {
    const availableVariants = variants.map((variant) => {
      const key = String(product.id) + ':' + String(variant?.id || 'default');
      const physical = Math.max(0, Number(variant?.stock) || 0);
      return { ...variant, stock: Math.max(0, physical - (reservedBySku.get(key) || 0)) };
    });
    return {
      ...product,
      stock: availableVariants.reduce((sum, variant) => sum + variant.stock, 0),
      bundleConfig: { ...bundle, variants: availableVariants },
    };
  }
  const key = String(product.id) + ':default';
  return {
    ...product,
    stock: Math.max(0, (Number(product.stock) || 0) - (reservedBySku.get(key) || 0)),
  };
}

/**
 * Reserve one product/variant with one conditional SQLite INSERT statement.
 * SQLite serializes writes, so concurrent checkouts cannot both claim the same
 * remaining unit. Repeated calls for the same order line are idempotent.
 */
export async function reserveInventoryLine({ orderId, productId, variantId = 'default', quantity, expiresAt }) {
  const qty = Number(quantity);
  const expires = Number(expiresAt);
  if (!Number.isSafeInteger(qty) || qty < 1 || !Number.isSafeInteger(expires)) {
    throw new TypeError('Invalid inventory reservation quantity or expiry.');
  }
  const skuVariantId = String(variantId || 'default');
  // Remove orphaned expired holds so retries can safely reuse the same key.
  await db.run(
    `DELETE FROM inventory_reservations
      WHERE status = 'held' AND expires_at <= unixepoch()
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = inventory_reservations.order_id)`,
  );
  const result = await db.run(
    `INSERT INTO inventory_reservations
       (id, order_id, product_id, variant_id, quantity, status, expires_at, created_at, updated_at)
     SELECT :reservation_id, :order_id, p.id, :variant_id, :quantity, 'held', :expires_at, unixepoch(), unixepoch()
       FROM products p
      WHERE p.id = :product_id
        AND p.is_active = 1
        AND EXISTS (SELECT 1 FROM checkout_operations o
          WHERE o.id = :order_id AND o.status = 'processing')
        AND CASE
          WHEN json_type(p.bundle_config, '$.variants') = 'array'
           AND json_array_length(p.bundle_config, '$.variants') > 0
          THEN coalesce((
            SELECT CAST(json_extract(v.value, '$.stock') AS INTEGER)
              FROM json_each(p.bundle_config, '$.variants') AS v
             WHERE CAST(json_extract(v.value, '$.id') AS TEXT) = :variant_id
             LIMIT 1
          ), -1)
          WHEN :variant_id = 'default' THEN coalesce(p.stock, 0)
          ELSE -1
        END >= :quantity + coalesce((
          SELECT sum(r.quantity)
            FROM inventory_reservations r
            LEFT JOIN orders o ON o.id = r.order_id
           WHERE r.product_id = p.id
             AND r.variant_id = :variant_id
             AND r.status <> 'released'
             AND ((o.id IS NULL AND r.status = 'held' AND r.expires_at > unixepoch())
               OR (o.id IS NOT NULL
                   AND lower(coalesce(o.status, '')) NOT IN ('cancelled', 'canceled', 'expired', 'rejected')
                   AND NOT (lower(coalesce(o.status, '')) = 'pending'
                            AND lower(coalesce(o.payment_status, '')) = 'unpaid'
                            AND (o.expired_at IS NOT NULL
                                 OR (o.payment_deadline_at IS NOT NULL AND o.payment_deadline_at <= unixepoch())))))
        ), 0)
     ON CONFLICT(order_id, product_id, variant_id) DO NOTHING
     RETURNING id`,
    {
      ':reservation_id': String(orderId) + ':' + String(productId) + ':' + skuVariantId,
      ':order_id': String(orderId),
      ':product_id': String(productId),
      ':variant_id': skuVariantId,
      ':quantity': qty,
      ':expires_at': expires,
    },
  );

  if ((result?.rowsAffected || 0) > 0) return { reserved: true, reused: false };

  const existing = await db.get(
    `SELECT r.quantity, r.status, r.expires_at,
            CASE WHEN o.id IS NOT NULL
                 AND lower(coalesce(o.status, '')) NOT IN ('cancelled', 'canceled', 'expired', 'rejected')
                 AND NOT (lower(coalesce(o.status, '')) = 'pending'
                          AND lower(coalesce(o.payment_status, '')) = 'unpaid'
                          AND (o.expired_at IS NOT NULL
                               OR (o.payment_deadline_at IS NOT NULL AND o.payment_deadline_at <= unixepoch())))
                 THEN 1 ELSE 0 END AS linked_order_active
       FROM inventory_reservations r
       LEFT JOIN orders o ON o.id = r.order_id
      WHERE r.order_id = :order_id AND r.product_id = :product_id AND r.variant_id = :variant_id`,
    {
      ':order_id': String(orderId),
      ':product_id': String(productId),
      ':variant_id': skuVariantId,
    },
  );
  const reusable = existing && Number(existing.quantity) === qty && existing.status !== 'released' &&
    (Number(existing.linked_order_active) === 1 || (existing.status === 'held' && Number(existing.expires_at) > Math.floor(Date.now() / 1000)));
  return reusable ? { reserved: true, reused: true } : { reserved: false, reused: false };
}


/** Release all holds for an order/request using one idempotent SQLite write. */
export async function releaseInventoryReservations(orderId) {
  const normalizedOrderId = String(orderId || "").trim();
  if (!normalizedOrderId) throw new TypeError("An order ID is required to release inventory.");
  const result = await db.run(
    `UPDATE inventory_reservations
        SET status = 'released', updated_at = unixepoch()
      WHERE order_id = :order_id AND status <> 'released'`,
    { ":order_id": normalizedOrderId },
  );
  return Number(result?.rowsAffected) || 0;
}
