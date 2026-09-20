import { NextResponse } from 'next/server';
import crypto from 'crypto';

const ADMIN_COOKIE_NAME = 'prime_admin_session';
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || '';
const MAX_AGE = 86400;

function createAdminSessionCookie() {
  if (!ADMIN_ACCESS_CODE) throw new Error('ADMIN_ACCESS_CODE is not configured');
  const issued = Math.floor(Date.now() / 1000);
  const payload = 'admin|' + issued;
  const signature = crypto.createHmac('sha256', ADMIN_ACCESS_CODE).update(payload).digest('base64url');
  return {
    name: ADMIN_COOKIE_NAME,
    value: payload + '|' + signature,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE,
  };
}

function verifyAdminSessionCookie(value: string | undefined) {
  if (!value || !ADMIN_ACCESS_CODE) return null;
  const parts = value.split('|');
  if (parts.length !== 3 || parts[0] !== 'admin') return null;

  const issuedRaw = parts[1];
  const signature = parts[2];
  const issued = Number(issuedRaw);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(issued) || issued > now || now - issued > MAX_AGE) return null;

  const payload = 'admin|' + issuedRaw;
  const expected = crypto.createHmac('sha256', ADMIN_ACCESS_CODE).update(payload).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || '');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  return { isAdmin: true, accessCodeVerified: true };
}

function getAdminCookie(request: Request) {
  const raw = request.headers.get('cookie') || '';
  const match = raw.split(';').map(part => part.trim()).find(part => part.startsWith(ADMIN_COOKIE_NAME + '='));
  return match ? match.slice(ADMIN_COOKIE_NAME.length + 1) : undefined;
}

export async function POST(request: Request) {
  try {
    const { accessCode } = await request.json().catch(() => ({}));

    if (!ADMIN_ACCESS_CODE) {
      return NextResponse.json(
        { success: false, error: 'ADMIN_ACCESS_CODE is not configured on the server.' },
        { status: 500 }
      );
    }

    if (
      typeof accessCode !== 'string' ||
      accessCode.length !== ADMIN_ACCESS_CODE.length ||
      !crypto.timingSafeEqual(Buffer.from(accessCode), Buffer.from(ADMIN_ACCESS_CODE))
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid Admin Access Code.' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      isAdmin: true,
      accessCodeVerified: true,
      user: { id: 'admin' },
    });
    response.cookies.set(createAdminSessionCookie());
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Authentication failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const session = verifyAdminSessionCookie(getAdminCookie(request));
    if (!session) {
      return NextResponse.json(
        { authenticated: false, isAdmin: false, accessCodeVerified: false },
        { status: 401 }
      );
    }
    return NextResponse.json({
      authenticated: true,
      isAdmin: true,
      accessCodeVerified: true,
      user: { id: 'admin' },
    });
  } catch {
    return NextResponse.json(
      { authenticated: false, isAdmin: false, accessCodeVerified: false },
      { status: 401 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
