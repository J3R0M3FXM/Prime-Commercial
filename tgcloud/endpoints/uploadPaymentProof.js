import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { customers } from '../schema.js';

function isProofImage(data, contentType) {
  if (data.length < 16 || data.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(data)) return false;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const bytes = [];
  let buffer = 0; let bits = 0;
  for (const character of data.slice(0, 24)) {
    buffer = (buffer << 6) | alphabet.indexOf(character); bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 255); buffer &= (1 << bits) - 1; }
  }
  if (contentType === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (contentType === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  return contentType === 'image/webp' && [82, 73, 70, 70].every((value, index) => bytes[index] === value) &&
    [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value);
}

export default async function (input, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^\d+$/.test(telegramId)) throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  const customer = await db.select().from(customers).where(eq(customers.tgUserId, telegramId)).get();
  const sessionId = String(input?.paymentSessionId || '').trim();
  const data = typeof input?.data === 'string' ? input.data : '';
  const contentType = String(input?.contentType || 'image/jpeg');
  if (!customer || !sessionId || data.length > 820000 || !isProofImage(data, contentType))
    throw new EndpointError('Choose a supported payment proof image.', { code: 'INVALID_PROOF' });
  const session = await db.get(`SELECT id, customer_id AS customerId, status, expires_at AS expiresAt
    FROM payment_sessions WHERE id=:id`, { ':id': sessionId });
  if (!session || String(session.customerId) !== String(customer.id) || session.status === 'consumed' || Number(session.expiresAt) <= Math.floor(Date.now() / 1000))
    throw new EndpointError('This payment session expired. Start checkout again.', { code: 'PAYMENT_SESSION_EXPIRED' });
  const ocrAnalysis = input?.ocrAnalysis && typeof input.ocrAnalysis === 'object' ? input.ocrAnalysis : null;
  const updated = await db.run(`UPDATE payment_sessions SET proof_data=:data, proof_content_type=:type, proof_ocr_analysis=json(:analysis), status='proof_uploaded', updated_at=unixepoch() WHERE id=:id AND customer_id=:customer_id AND status <> 'consumed' AND expires_at > unixepoch() RETURNING id`, { ':data': data, ':type': contentType, ':analysis': JSON.stringify(ocrAnalysis), ':id': sessionId, ':customer_id': String(customer.id) });
  if (Number(updated?.rowsAffected) < 1) {
    throw new EndpointError('This payment session is no longer available. Retry checkout to restore your submission.', { code: 'PAYMENT_SESSION_EXPIRED' });
  }
  return { success: true, paymentSessionId: sessionId, status: 'proof_uploaded' };
}
