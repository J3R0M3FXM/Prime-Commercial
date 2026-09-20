import { NextResponse } from 'next/server';
import crypto from 'crypto';
const SESSION_COOKIE_NAME = 'prime_telegram_session';
const ADMIN_COOKIE_NAME = 'prime_admin_session';
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || '';
const MAX_AGE = 86400;

function createAdminSessionCookie() {
  if (!ADMIN_ACCESS_CODE) throw new Error('ADMIN_ACCESS_CODE is not configured');
  const issued = Math.floor(Date.now() / 1000);
  const payload = String(issued);
  const key = crypto.createHash('sha256').update((process.env.SESSION_SECRET || '') + '|' + ADMIN_ACCESS_CODE).digest();
  const signature = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  return { name: ADMIN_COOKIE_NAME, value: payload + '|' + signature, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: MAX_AGE };
}

function verifyAdminSessionCookie(value: string | undefined) {
  if (!value || !ADMIN_ACCESS_CODE) return null;
  const parts = value.split('|');
  if (parts.length !== 2) return null;
  const issued = Number(parts[0]), signature = parts[1], now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(issued) || issued > now || now - issued > MAX_AGE) return null;
  const key = crypto.createHash('sha256').update((process.env.SESSION_SECRET || '') + '|' + ADMIN_ACCESS_CODE).digest();
  const expected = crypto.createHmac('sha256', key).update(parts[0]).digest('base64url');
  const a=Buffer.from(expected), b=Buffer.from(signature || '');
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
  return { isAdmin: true, accessCodeVerified: true };
}

function parseCookies(request: Request) {
  const raw = request.headers.get('cookie') || '';
  const cookies: Record<string,string> = {};
  raw.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) cookies[part.slice(0,idx).trim()] = part.slice(idx+1).trim();
  });
  return { admin: cookies[ADMIN_COOKIE_NAME] };
}

export async function POST(request: Request) {
  try {
    const { initData, accessCode } = await request.json().catch(() => ({}));
    if (!ADMIN_ACCESS_CODE) return NextResponse.json({ success:false,error:'ADMIN_ACCESS_CODE is not configured on the server.' }, { status:500 });
    if (typeof accessCode !== 'string' || accessCode.length !== ADMIN_ACCESS_CODE.length || !crypto.timingSafeEqual(Buffer.from(accessCode), Buffer.from(ADMIN_ACCESS_CODE))) {
      return NextResponse.json({ success:false,error:'Invalid Admin Access Code.' },{status:401});
    }

    const response=NextResponse.json({success:true,isAdmin:true,accessCodeVerified:true,user:{id:'admin'}});
    response.cookies.set(createAdminSessionCookie());
    return response;
  } catch(error:any){return NextResponse.json({success:false,error:error.message||'Authentication failed'},{status:500});}
}

export async function GET(request: Request) {
  try {
    const cookies = parseCookies(request);
    const session = verifyAdminSessionCookie(cookies.admin);
    if (!session) return NextResponse.json({ authenticated:false, isAdmin:false, accessCodeVerified:false }, { status:401 });
    return NextResponse.json({ authenticated:true, isAdmin:true, accessCodeVerified:true, user:{id:'admin'} });
  } catch { return NextResponse.json({ authenticated:false, isAdmin:false, accessCodeVerified:false }, { status:401 }); }
}

export async function DELETE() {
  const response = NextResponse.json({ success:true });
  for (const name of [SESSION_COOKIE_NAME, ADMIN_COOKIE_NAME]) response.cookies.set({name,value:'',httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});
  return response;
}
