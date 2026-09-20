import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = new Set(['/api/auth/telegram/validate', '/api/admin/auth']);
const MAX_AGE = 86400;

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
  const expectedKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const rawSig = await crypto.subtle.sign('HMAC', expectedKey, new TextEncoder().encode(payload));
  let expected = '';
  for (const b of new Uint8Array(rawSig)) expected += String.fromCharCode(b);
  expected = btoa(expected).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (expected !== signature) return null;

  return { tgUserId, isAdmin: adminRaw === '1' };
}

async function verifyAdminSession(value: string | undefined, tgUserId: string) {
  if (!value) return false;
  const parts = value.split('|');
  if (parts.length !== 3) return false;

  const [adminTgUserId, issuedRaw, signature] = parts;
  const issued = Number(issuedRaw);
  const now = Math.floor(Date.now() / 1000);
  const secret = process.env.SESSION_SECRET;
  const accessCode = process.env.ADMIN_ACCESS_CODE || '';

  if (!secret || secret.length < 32 || !accessCode || adminTgUserId !== tgUserId || !Number.isFinite(issued) || issued > now || now - issued > MAX_AGE) return false;

  const payload = `${adminTgUserId}|${issued}`;
  const derivedKeyBytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret + '|' + accessCode)
  );
  const key = await crypto.subtle.importKey(
    'raw',
    derivedKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const rawSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  let expected = '';
  for (const b of new Uint8Array(rawSig)) expected += String.fromCharCode(b);
  expected = btoa(expected).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return expected === signature;
}
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Telegram Mini Apps provide initData in the client-side WebApp object/hash.
  // The initial document request cannot reliably contain that value, so page rendering
  // must remain reachable; sensitive API routes remain server-gated below.
  const pageProtected = false;
  const apiProtected = pathname.startsWith('/api/admin/') || pathname.startsWith('/api/account') || pathname.startsWith('/api/orders') || pathname.startsWith('/api/checkout/') || pathname.startsWith('/api/ocr/') || pathname.startsWith('/api/download') || pathname.startsWith('/api/media/stream/') || pathname.startsWith('/api/geoapify/');
  if ((!pageProtected && !apiProtected) || PUBLIC.has(pathname)) return NextResponse.next();
  const session = await verifySession(request.cookies.get('prime_telegram_session')?.value);
  if (!session) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Telegram authentication required' }, { status: 401 });
    return new NextResponse('<!doctype html><html><body><h1>Telegram authentication required</h1><p>Open PRIME from Telegram.</p></body></html>', { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin/')) {
    if (!session.isAdmin) {
      if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
      return new NextResponse('<!doctype html><html><body><h1>Admin authorization required</h1></body></html>', { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    const adminCookieValid = await verifyAdminSession(request.cookies.get('prime_admin_session')?.value, session.tgUserId);
    if (!adminCookieValid) {
      if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Admin access code verification required' }, { status: 401 });
      // The document itself remains reachable so the Admin Panel can display the access-code gate.
      return NextResponse.next();
    }
  }
  return NextResponse.next();
}
export const config = { matcher: ['/', '/admin/:path*', '/api/:path*'] };
