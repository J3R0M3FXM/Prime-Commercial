import crypto from 'crypto';

export const ADMIN_COOKIE_NAME = 'prime_admin_session';
export const ADMIN_MAX_AGE = 86400;

export function createAdminSessionCookieValue() {
  const accessCode = process.env.ADMIN_ACCESS_CODE || '';
  if (!accessCode) throw new Error('ADMIN_ACCESS_CODE is not configured');
  const issued = Math.floor(Date.now() / 1000);
  const payload = 'admin|' + issued;
  const signature = crypto.createHmac('sha256', accessCode).update(payload).digest('base64url');
  return { payload, signature };
}

export function verifyAdminSessionCookie(value: string | undefined) {
  const accessCode = process.env.ADMIN_ACCESS_CODE || '';
  if (!value || !accessCode) return null;
  const parts = value.split('|');
  if (parts.length !== 3 || parts[0] !== 'admin') return null;
  const issued = Number(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(issued) || issued > now || now - issued > ADMIN_MAX_AGE) return null;
  const payload = 'admin|' + parts[1];
  const expected = crypto.createHmac('sha256', accessCode).update(payload).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts[2] || '');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { isAdmin: true, accessCodeVerified: true };
}

export function verifyAdminRequest(request: Request) {
  const raw = request.headers.get('cookie') || '';
  const match = raw.split(';').map(part => part.trim()).find(part => part.startsWith(ADMIN_COOKIE_NAME + '='));
  return verifyAdminSessionCookie(match ? match.slice(ADMIN_COOKIE_NAME.length + 1) : undefined);
}
