import { db, EndpointError } from 'sdk';
import { customers } from '../schema.js';
import { eq } from 'sdk/db';

const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const id = (value, prefix) => prefix + '-' + text(value, 120).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);

export default async function (input, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^\d+$/.test(telegramId)) throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  const customer = await db.select().from(customers).where(eq(customers.tgUserId, telegramId)).get();
  if (!customer) throw new EndpointError('Customer account was not found.', { code: 'CUSTOMER_MISSING' });
  await db.run(`CREATE TABLE IF NOT EXISTS payment_sessions (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, request_snapshot TEXT NOT NULL DEFAULT '{}',
    payment_method_id TEXT NOT NULL DEFAULT '', proof_data TEXT, proof_content_type TEXT,
    proof_ocr_analysis TEXT, status TEXT NOT NULL DEFAULT 'awaiting_proof', expires_at INTEGER NOT NULL,
    consumed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`);
  for (const statement of [
    `ALTER TABLE orders ADD COLUMN payment_proof_data TEXT`,
    `ALTER TABLE orders ADD COLUMN payment_proof_content_type TEXT`,
  ]) { try { await db.run(statement); } catch {} }
  const request = input?.request && typeof input.request === 'object' ? input.request : null;
  const paymentMethodId = text(input?.paymentMethodId, 120);
  const operationKey = text(input?.operationKey, 128);
  if (!request || !paymentMethodId || !operationKey) throw new EndpointError('Checkout details and payment method are required.', { code: 'INVALID_INPUT' });
  const now = Math.floor(Date.now() / 1000);
  // Use a deterministic ID for the first attempt. If its session was consumed,
  // createOrder will recover the existing immutable operation by operationKey
  // before looking at the new session, preventing duplicate reservations/orders.
  const baseSessionId = id(operationKey, 'payment-session');
  const existing = await db.get('SELECT customer_id AS customerId, status, expires_at AS expiresAt FROM payment_sessions WHERE id=:id', { ':id': baseSessionId });
  if (existing && String(existing.customerId) !== String(customer.id)) {
    throw new EndpointError('This checkout key is already in use. Refresh checkout and try again.', { code: 'CHECKOUT_KEY_CONFLICT' });
  }
  const sessionId = existing && (existing.status === 'consumed' || Number(existing.expiresAt) <= now)
    ? id(operationKey + '-' + now.toString(36) + '-' + globalThis.crypto.randomUUID(), 'payment-session')
    : baseSessionId;
  const expiresAt = now + 60 * 60;
  await db.run(`INSERT INTO payment_sessions (id,customer_id,request_snapshot,payment_method_id,status,expires_at,created_at,updated_at)
    VALUES (:id,:customer_id,json(:request),:method,'awaiting_proof',:expires_at,unixepoch(),unixepoch())
    ON CONFLICT(id) DO UPDATE SET request_snapshot=excluded.request_snapshot, payment_method_id=excluded.payment_method_id, expires_at=excluded.expires_at, updated_at=unixepoch()
    WHERE payment_sessions.customer_id=:customer_id AND payment_sessions.status <> 'consumed'`, {
    ':id': sessionId, ':customer_id': String(customer.id), ':request': JSON.stringify(request), ':method': paymentMethodId, ':expires_at': expiresAt,
  });
  const saved = await db.get('SELECT customer_id AS customerId, status, expires_at AS expiresAt FROM payment_sessions WHERE id=:id', { ':id': sessionId });
  if (!saved || String(saved.customerId) !== String(customer.id) || saved.status === 'consumed') {
    throw new EndpointError('A fresh payment session could not be started. Retry checkout.', { code: 'PAYMENT_SESSION_CREATE_FAILED' });
  }
  return { success: true, paymentSessionId: sessionId, expiresAt: new Date(Number(saved.expiresAt) * 1000).toISOString(), status: saved.status };
}
