import crypto from 'crypto';

const COOKIE_NAME = 'prime_telegram_session';
const MAX_AGE = 86400;
const FALLBACK_DERIVATION_LABEL = 'PRIME_TELEGRAM_SESSION_V1';

function secret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;

  // Keep production authentication bootstrappable if SESSION_SECRET was omitted.
  // The Telegram bot token is already a required server secret; derive a separate
  // session-signing key from it instead of using the bot token directly.
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (botToken) {
    return crypto
      .createHmac('sha256', botToken)
      .update(FALLBACK_DERIVATION_LABEL)
      .digest('base64url');
  }

  throw new Error('Telegram session signing is not configured');
}

function sign(value: string) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

export function createTelegramSessionCookie(tgUserId: string, isAdmin = false) {
  const issued = Math.floor(Date.now() / 1000);
  const payload = `${tgUserId}|${issued}|${isAdmin ? 1 : 0}`;
  return {
    name: COOKIE_NAME,
    value: `${payload}|${sign(payload)}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE,
  };
}

export function verifyTelegramSessionCookie(value: string | undefined) {
  try {
    if (!value) return null;
    const parts = value.split('|');
    if (parts.length !== 4) return null;

    const [tgUserId, issuedRaw, adminRaw, signature] = parts;
    if (!/^[0-9]+$/.test(tgUserId)) return null;
    if (adminRaw !== '0' && adminRaw !== '1') return null;
    if (!/^[0-9]+$/.test(issuedRaw)) return null;

    const issued = Number(issuedRaw);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(issued) || issued > now || now - issued > MAX_AGE) return null;

    const payload = `${tgUserId}|${issuedRaw}|${adminRaw}`;
    const expected = sign(payload);
    const a = Buffer.from(expected);
    const b = Buffer.from(signature || '');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    return { tgUserId, isAdmin: adminRaw === '1' };
  } catch {
    return null;
  }
}
