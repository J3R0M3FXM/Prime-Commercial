import { db } from 'sdk';

/**
 * Atomically claim one use against total and per-customer limits. Existing
 * `promo_redemptions` are retained as legacy uses; new Serverless checkouts
 * keep the claim row as their redemption record through `held` -> `redeemed`.
 */
export async function claimPromoUse({
  operationId,
  promoId,
  promoCode,
  customerId,
  deviceId = '',
  hardwareId = '',
  deviceFingerprintId = '',
  serverFingerprintId = '',
  discountAmount = 0,
  expiresAt,
}) {
  const operation = String(operationId || '').trim();
  const promo = String(promoId || '').trim();
  const code = String(promoCode || '').trim().toUpperCase();
  const customer = String(customerId || '').trim();
  const expiry = Number(expiresAt);
  const discount = Number(discountAmount);
  if (!operation || !promo || !code || !customer || !Number.isSafeInteger(expiry) ||
      !Number.isFinite(discount) || discount < 0) {
    throw new TypeError('Invalid promo claim details.');
  }

  const existing = await db.get(
    `SELECT promo_id AS promoId, customer_id AS customerId,
            status, expires_at AS expiresAt, order_id AS orderId
       FROM promo_claims WHERE operation_id = :operation_id`,
    { ':operation_id': operation },
  );
  if (existing) {
    const matches = existing.promoId === promo && existing.customerId === customer;
    return matches
      ? { claimed: existing.status === 'held' || existing.status === 'redeemed', reused: true, status: existing.status, orderId: existing.orderId }
      : { claimed: false, reason: 'operation_conflict' };
  }

  const result = await db.run(
    `INSERT INTO promo_claims
       (operation_id, promo_id, promo_code, customer_id, order_id,
        device_id, hardware_id, device_fingerprint_id, server_fingerprint_id,
        discount_amount, status, expires_at, created_at, updated_at)
     SELECT :operation_id, p.id, p.code, :customer_id, NULL,
            :device_id, :hardware_id, :device_fingerprint_id, :server_fingerprint_id,
            :discount_amount, 'held', :expires_at, unixepoch(), unixepoch()
       FROM promos p
      WHERE p.id = :promo_id
        AND EXISTS (SELECT 1 FROM checkout_operations o
          WHERE o.id = :operation_id AND o.status = 'processing')
        AND p.is_active = 1
        AND (p.start_date IS NULL OR p.start_date <= unixepoch())
        AND (p.end_date IS NULL OR p.end_date >= unixepoch())
        AND (p.total_usage_limit IS NULL OR p.total_usage_limit <= 0 OR
             ((SELECT count(*) FROM promo_redemptions r
                WHERE (r.promo_id = p.id OR r.promo_code = p.code) AND r.released_at IS NULL) +
              (SELECT count(*) FROM promo_claims c
                WHERE (c.promo_id = p.id OR c.promo_code = p.code) AND
                  (c.status = 'redeemed' OR (c.status = 'held' AND c.expires_at > unixepoch())))) < p.total_usage_limit)
        AND ((SELECT count(*) FROM promo_redemptions r
                WHERE (r.promo_id = p.id OR r.promo_code = p.code) AND r.customer_id = :customer_id AND r.released_at IS NULL) +
             (SELECT count(*) FROM promo_claims c
                WHERE (c.promo_id = p.id OR c.promo_code = p.code) AND c.customer_id = :customer_id AND
                  (c.status = 'redeemed' OR (c.status = 'held' AND c.expires_at > unixepoch()))))
            < max(1, coalesce(p.usage_limit_per_customer, 1))
        AND NOT EXISTS (
          SELECT 1 FROM promo_redemptions r
           WHERE r.promo_id = p.id AND r.released_at IS NULL
             AND r.customer_id <> :customer_id
             AND ((:device_id <> '' AND r.device_id = :device_id) OR
                  (:hardware_id <> '' AND r.hardware_id = :hardware_id) OR
                  (:device_fingerprint_id <> '' AND r.device_fingerprint_id = :device_fingerprint_id)))
        AND NOT EXISTS (
          SELECT 1 FROM promo_claims c
           WHERE c.promo_id = p.id AND c.customer_id <> :customer_id
             AND (c.status = 'redeemed' OR (c.status = 'held' AND c.expires_at > unixepoch()))
             AND ((:device_id <> '' AND c.device_id = :device_id) OR
                  (:hardware_id <> '' AND c.hardware_id = :hardware_id) OR
                  (:device_fingerprint_id <> '' AND c.device_fingerprint_id = :device_fingerprint_id)))
     ON CONFLICT(operation_id) DO NOTHING
     RETURNING operation_id`,
    {
      ':operation_id': operation,
      ':promo_id': promo,
      ':customer_id': customer,
      ':device_id': String(deviceId || ''),
      ':hardware_id': String(hardwareId || ''),
      ':device_fingerprint_id': String(deviceFingerprintId || ''),
      ':server_fingerprint_id': String(serverFingerprintId || ''),
      ':discount_amount': Math.round(discount * 100) / 100,
      ':expires_at': expiry,
    },
  );
  if (Number(result?.rowsAffected) > 0) return { claimed: true, reused: false, status: 'held' };

  const after = await db.get(
    `SELECT promo_id AS promoId, customer_id AS customerId, status,
            expires_at AS expiresAt, order_id AS orderId
       FROM promo_claims WHERE operation_id = :operation_id`,
    { ':operation_id': operation },
  );
  if (after && after.promoId === promo && after.customerId === customer) {
    return { claimed: after.status === 'held' || after.status === 'redeemed', reused: true, status: after.status, orderId: after.orderId };
  }
  return { claimed: false, reason: 'promo_unavailable_or_usage_limit' };
}

/** Idempotent conversion of the claim into the operation's durable redemption. */
export async function redeemPromoClaim({ operationId, orderId }) {
  const operation = String(operationId || '').trim();
  const order = String(orderId || '').trim();
  if (!operation || !order) throw new TypeError('Operation and order IDs are required.');
  const result = await db.run(
    `UPDATE promo_claims
        SET status = 'redeemed', order_id = :order_id,
            updated_at = unixepoch()
      WHERE operation_id = :operation_id
        AND (status = 'held' OR (status = 'redeemed' AND order_id = :order_id))`,
    { ':operation_id': operation, ':order_id': order },
  );
  if (Number(result?.rowsAffected) > 0) return { redeemed: true, reused: false };
  const row = await db.get(
    `SELECT status, order_id AS orderId FROM promo_claims WHERE operation_id = :operation_id`,
    { ':operation_id': operation },
  );
  return row?.status === 'redeemed' && row.orderId === order
    ? { redeemed: true, reused: true }
    : { redeemed: false, reason: row ? 'claim_not_redeemable' : 'claim_missing' };
}

/** A held claim can be released during pre-order compensation; redemption is terminal. */
export async function releasePromoClaim(operationId) {
  const operation = String(operationId || '').trim();
  if (!operation) throw new TypeError('A checkout operation ID is required.');
  const result = await db.run(
    `UPDATE promo_claims SET status = 'released', updated_at = unixepoch()
      WHERE operation_id = :operation_id AND status = 'held'`,
    { ':operation_id': operation },
  );
  if (Number(result?.rowsAffected) > 0) return { released: true, alreadyReleased: false };
  const row = await db.get(
    `SELECT status FROM promo_claims WHERE operation_id = :operation_id`,
    { ':operation_id': operation },
  );
  return row?.status === 'released'
    ? { released: true, alreadyReleased: true }
    : { released: false, reason: row ? 'claim_already_redeemed' : 'claim_missing' };
}
