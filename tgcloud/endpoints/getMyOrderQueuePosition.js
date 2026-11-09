import { db, EndpointError } from 'sdk';

// The caller can only ask about their own order; the response contains no other order data.
export default async function (input, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]+$/.test(telegramId)) throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  const orderId = String(input?.orderId || '').trim();
  if (!orderId || orderId.length > 200) throw new EndpointError('An order is required.', { code: 'INVALID_INPUT' });
  const own = await db.get(`SELECT id, created_at AS createdAt,
    CASE WHEN (lower(trim(coalesce(status, ''))) = 'pending'
      AND (lower(trim(coalesce(payment_status, ''))) = 'pending review'
        OR (lower(trim(coalesce(payment_status, ''))) = 'unpaid'
          AND (trim(coalesce(payment_proof_image, '')) <> ''
            OR coalesce(payment_deadline_at, created_at + 3600) > unixepoch()))))
      OR (lower(status)='confirmed' AND lower(payment_status)='paid') THEN 1 ELSE 0 END AS queued
    FROM orders WHERE id = :id AND tg_user_id = :telegramId`, { ':id': orderId, ':telegramId': telegramId });
  if (!own) throw new EndpointError('Order not found.', { code: 'NOT_FOUND' });
  if (!own.queued) return { position: null, createdAt: Number(own.createdAt) || null };
  const result = await db.get(`SELECT count(*) AS position FROM orders
    WHERE ((lower(trim(coalesce(status, ''))) = 'pending'
      AND (lower(trim(coalesce(payment_status, ''))) = 'pending review'
        OR (lower(trim(coalesce(payment_status, ''))) = 'unpaid'
          AND (trim(coalesce(payment_proof_image, '')) <> ''
            OR coalesce(payment_deadline_at, created_at + 3600) > unixepoch()))))
      OR (lower(status)='confirmed' AND lower(payment_status)='paid'))
      AND (created_at < :createdAt OR (created_at = :createdAt AND id <= :id))`,
    { ':createdAt': own.createdAt, ':id': orderId });
  const position = Number(result?.position) || 0;
  return { position: position > 0 ? position : null, createdAt: Number(own.createdAt) || null };
}
