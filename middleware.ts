import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = new Set(['/api/auth/telegram/validate', '/api/admin/auth']);
const MAX_AGE = 86400;
const SESSION_DERIVATION_LABEL = 'PRIME_TELEGRAM_SESSION_V1';

async function getTelegramSessionKey() {
  const configured = process.env.SESSION_SECRET?.trim();
  const material = configured && configured.length >= 32
    ? configured
    : process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!material) return null;

  if (configured && configured.length >= 32) {
    return crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(material),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
  }

  // Match lib/telegram-session.ts fallback derivation exactly.
  const derivationKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(material),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const derived = await crypto.subtle.sign(
    'HMAC',
    derivationKey,
    new TextEncoder().encode(SESSION_DERIVATION_LABEL)
  );

  return crypto.subtle.importKey(
    'raw',
    derived,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function verifyAdminSession(value: string | undefined) {
  if (!value) return null;
  const parts = value.split('|');
  if (parts.length !== 3 || parts[0] !== 'admin') return null;

  const [, issuedRaw, signature] = parts;
  const issued = Number(issuedRaw);
  const now = Math.floor(Date.now() / 1000);
  const accessCode = process.env.ADMIN_ACCESS_CODE;
  if (!accessCode || !Number.isFinite(issued) || issued > now || now - issued > MAX_AGE) return null;

  const payload = 'admin|' + issuedRaw;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(accessCode),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
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
  if (
    !/^[0-9]+$/.test(tgUserId) ||
    (adminRaw !== '0' && adminRaw !== '1') ||
    !/^[0-9]+$/.test(issuedRaw) ||
    !Number.isSafeInteger(issued) ||
    issued > now ||
    now - issued > MAX_AGE
  ) return null;

  const key = await getTelegramSessionKey();
  if (!key) return null;

  const payload = `${tgUserId}|${issuedRaw}|${adminRaw}`;
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

  // Telegram Mini App initData is available client-side, so the initial document
  // remains reachable while sensitive API requests are server-gated.
  const apiProtected =
    pathname.startsWith('/api/admin/') ||
    pathname.startsWith('/api/account') ||
    pathname.startsWith('/api/orders') ||
    pathname.startsWith('/api/checkout/') ||
    pathname.startsWith('/api/ocr/') ||
    pathname.startsWith('/api/download') ||
    pathname.startsWith('/api/media/stream/') ||
    pathname.startsWith('/api/geoapify/') ||
    pathname === '/api/products' ||
    pathname === '/api/media/videos' ||
    pathname === '/api/charges' ||
    pathname === '/api/payment-methods';

  if (pathname.startsWith('/admin')) return NextResponse.next();
  if (PUBLIC.has(pathname)) return NextResponse.next();

  if (pathname.startsWith('/api/admin/')) {
    const adminSession = await verifyAdminSession(request.cookies.get('prime_admin_session')?.value);
    if (!adminSession) {
      return NextResponse.json({ error: 'Admin access code required' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Video management is an Admin capability. Published gallery reads remain
  // available to authenticated Telegram customers, while unpublished reads and
  // all writes require the Admin Access Code session.
  if (pathname === '/api/media/videos') {
    const includeAll = request.nextUrl.searchParams.get('all') === 'true';
    const adminOperation = request.method !== 'GET' || includeAll;
    if (adminOperation) {
      const adminSession = await verifyAdminSession(request.cookies.get('prime_admin_session')?.value);
      if (!adminSession) {
        return NextResponse.json({ error: 'Admin access code required' }, { status: 401 });
      }
      return NextResponse.next();
    }
  }

  if (!apiProtected) return NextResponse.next();

  const session = await verifySession(request.cookies.get('prime_telegram_session')?.value);
  if (!session) {
    return NextResponse.json({ error: 'Telegram authentication required' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = { matcher: ['/', '/admin/:path*', '/api/:path*'] };
