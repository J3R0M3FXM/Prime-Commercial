import { db, EndpointError } from 'sdk';
import { customers, paymentMethods } from '../schema.js';
import { eq } from 'sdk/db';

const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const id = (value, prefix) => prefix + '-' + text(value, 120).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);

export default async function (input, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^\d+$/.test(telegramId)) throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  const customer = await db.select().from(customers).where(eq(customers.tgUserId, telegramId)).get();
  if (!customer) throw new EndpointError('Customer account was not found.', { code: 'CUSTOMER_MISSING' });
  if (customer.isBanned === true) throw new EndpointError('This account cannot place orders.', { code: 'CUSTOMER_BANNED' });
  await db.run(`CREATE TABLE IF NOT EXISTS payment_sessions (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, request_snapshot TEXT NOT NULL DEFAULT '{}',
    payment_method_id TEXT NOT NULL DEFAULT '', proof_data TEXT, proof_content_type TEXT,
    proof_ocr_analysis TEXT, status TEXT NOT NULL DEFAULT 'awaiting_proof', expires_at INTEGER NOT NULL,
    consumed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    operation_key TEXT NOT NULL DEFAULT ''
  )`);
  for (const statement of [
    `ALTER TABLE payment_sessions ADD COLUMN operation_key TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE orders ADD COLUMN payment_proof_data TEXT`,
    `ALTER TABLE orders ADD COLUMN payment_proof_content_type TEXT`,
  ]) { try { await db.run(statement); } catch {} }
  const request = input?.request && typeof input.request === 'object' ? input.request : null;
  const paymentMethodId = text(input?.paymentMethodId, 120);
  const operationKey = text(input?.operationKey, 128);
  if (!request || !paymentMethodId || !operationKey) throw new EndpointError('Checkout details and payment method are required.', { code: 'INVALID_INPUT' });
  const method = await db.select().from(paymentMethods).where(eq(paymentMethods.id, paymentMethodId)).get();
  if (!method || !method.isActive) throw new EndpointError('Choose an active payment method.', { code: 'PAYMENT_METHOD_UNAVAILABLE' });
  const now = Math.floor(Date.now() / 1000);
  const previousOperation = await db.get(`SELECT status FROM checkout_operations
    WHERE customer_id=:customer_id AND request_key=:request_key`, {
    ':customer_id': String(customer.id), ':request_key': operationKey,
  });
  const retryingTerminalFailure = previousOperation?.status === 'failed';
  const sessionOperationKey = retryingTerminalFailure ? 'retry-' + globalThis.crypto.randomUUID() : operationKey;
  // Use a deterministic ID for the first attempt. If its session was consumed,
  // createOrder will recover the existing immutable operation by operationKey
  // before looking at the new session, preventing duplicate reservations/orders.
  const baseSessionId = id(operationKey, 'payment-session');
  const existing = await db.get('SELECT customer_id AS customerId, status, expires_at AS expiresAt FROM payment_sessions WHERE id=:id', { ':id': baseSessionId });
  if (existing && String(existing.customerId) !== String(customer.id)) {
    throw new EndpointError('This checkout key is already in use. Refresh checkout and try again.', { code: 'CHECKOUT_KEY_CONFLICT' });
  }
  const sessionId = retryingTerminalFailure || (existing && (existing.status === 'consumed' || Number(existing.expiresAt) <= now))
    ? id(operationKey + '-' + now.toString(36) + '-' + globalThis.crypto.randomUUID(), 'payment-session')
    : baseSessionId;
  const expiresAt = now + 60 * 60;
  await db.run(`INSERT INTO payment_sessions (id,customer_id,request_snapshot,payment_method_id,status,expires_at,created_at,updated_at,operation_key)
    VALUES (:id,:customer_id,json(:request),:method,'awaiting_proof',:expires_at,unixepoch(),unixepoch(),:operation_key)
    ON CONFLICT(id) DO UPDATE SET
      proof_data=CASE WHEN payment_sessions.request_snapshot=excluded.request_snapshot AND payment_sessions.payment_method_id=excluded.payment_method_id THEN payment_sessions.proof_data ELSE NULL END,
      proof_content_type=CASE WHEN payment_sessions.request_snapshot=excluded.request_snapshot AND payment_sessions.payment_method_id=excluded.payment_method_id THEN payment_sessions.proof_content_type ELSE NULL END,
      proof_ocr_analysis=CASE WHEN payment_sessions.request_snapshot=excluded.request_snapshot AND payment_sessions.payment_method_id=excluded.payment_method_id THEN payment_sessions.proof_ocr_analysis ELSE NULL END,
      status=CASE WHEN payment_sessions.request_snapshot=excluded.request_snapshot AND payment_sessions.payment_method_id=excluded.payment_method_id THEN payment_sessions.status ELSE 'awaiting_proof' END,
      request_snapshot=excluded.request_snapshot, payment_method_id=excluded.payment_method_id, expires_at=excluded.expires_at, operation_key=excluded.operation_key, updated_at=unixepoch()
    WHERE payment_sessions.customer_id=:customer_id AND payment_sessions.status <> 'consumed'`, {
    ':id': sessionId, ':customer_id': String(customer.id), ':request': JSON.stringify(request), ':method': paymentMethodId, ':expires_at': expiresAt, ':operation_key': sessionOperationKey,
  });
  const saved = await db.get('SELECT customer_id AS customerId, status, expires_at AS expiresAt, operation_key AS operationKey FROM payment_sessions WHERE id=:id', { ':id': sessionId });
  if (!saved || String(saved.customerId) !== String(customer.id) || saved.status === 'consumed' || saved.operationKey !== sessionOperationKey) {
    throw new EndpointError('A fresh payment session could not be started. Retry checkout.', { code: 'PAYMENT_SESSION_CREATE_FAILED' });
  }
  return { success: true, paymentSessionId: sessionId, operationKey: saved.operationKey, expiresAt: new Date(Number(saved.expiresAt) * 1000).toISOString(), status: saved.status };
}
