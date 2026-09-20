import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = new Set(['/api/auth/telegram/validate', '/api/admin/auth']);
const MAX_AGE = 86400;

async function verifyAdminSession(value: string | undefined) {
  if (!value) return null;
  const parts = value.split('|');
  if (parts.length !== 2) return null;
  const [issuedRaw, signature] = parts;
  const issued = Number(issuedRaw);
  const now = Math.floor(Date.now() / 1000);
  const secret = process.env.SESSION_SECRET;
  const accessCode = process.env.ADMIN_ACCESS_CODE;
  if (!secret || secret.length < 32 || !accessCode || !Number.isFinite(issued) || issued > now || now - issued > MAX_AGE) return null;
  const keyMaterial = new TextEncoder().encode(secret + '|' + accessCode);
  const key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(issuedRaw));
  const bytes = new Uint8Array(sig);
  let expected = '';
  for (let i = 0; i < bytes.length; i++) expected += String.fromCharCode(bytes[i]);
  expected = btoa(expected).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return expected === signature ? { isAdmin: true } : null;
}

async function verifySession(value: string | undefined) {
  if (!value) return null;
  const parts = value.split('|');
  if (parts.length !== 4) return null;
  const [tgUserId, issuedRaw, adminRaw, signature] = parts;
  const issued = Number(issuedRaw);
  const now = Math.floor(Date.now() / 1000);
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || !tgUserId || !Number.isFinite(issued) || issued > now || now - issued > MAX_AGE) return null;
  const payload = `${tgUserId}|${issued}|${adminRaw}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const bytes = new Uint8Array(sig);
  let expected = '';
  for (let i = 0; i < bytes.length; i++) expected += String.fromCharCode(bytes[i]);
  expected = btoa(expected).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (expected !== signature) return null;
  return { tgUserId, isAdmin: adminRaw === '1' };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Telegram Mini Apps provide initData in the client-side WebApp object/hash.
  // The initial document request cannot reliably contain that value, so page rendering
  // must remain reachable; sensitive API routes remain server-gated below.
  const pageProtected = false;
  const apiProtected = pathname.startsWith('/api/admin/') || pathname.startsWith('/api/account') || pathname.startsWith('/api/orders') || pathname.startsWith('/api/checkout/') || pathname.startsWith('/api/ocr/') || pathname.startsWith('/api/download') || pathname.startsWith('/api/media/stream/') || pathname.startsWith('/api/geoapify/') || pathname === '/api/products' || pathname === '/api/media/videos';
  // The Admin Panel is intentionally reachable from a native browser.
  // Its sensitive APIs require a server-issued ADMIN_ACCESS_CODE session cookie.
  if (pathname.startsWith('/admin')) return NextResponse.next();
  if (PUBLIC.has(pathname)) return NextResponse.next();
  if (pathname.startsWith('/api/admin/')) {
    const adminSession = await verifyAdminSession(request.cookies.get('prime_admin_session')?.value);
    if (!adminSession) return NextResponse.json({ error: 'Admin access code required' }, { status: 401 });
    return NextResponse.next();
  }
  if (!apiProtected) return NextResponse.next();
  const session = await verifySession(request.cookies.get('prime_telegram_session')?.value);
  if (!session) return NextResponse.json({ error: 'Telegram authentication required' }, { status: 401 });
  return NextResponse.next();
}
export const config = { matcher: ['/', '/admin/:path*', '/api/:path*'] };
