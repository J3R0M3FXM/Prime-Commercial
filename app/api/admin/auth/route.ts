import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createTelegramSessionCookie, verifyTelegramSessionCookie } from '@/lib/telegram-session';

const SESSION_COOKIE_NAME = 'prime_telegram_session';
const ADMIN_COOKIE_NAME = 'prime_admin_session';
const ADMIN_TELEGRAM_USER_ID = process.env.ADMIN_TELEGRAM_USER_ID || '';
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || '';
const MAX_AGE = 86400;

function createAdminSessionCookie(tgUserId: string) {
  if (!ADMIN_ACCESS_CODE) throw new Error('ADMIN_ACCESS_CODE is not configured');
  const issued = Math.floor(Date.now() / 1000);
  const payload = tgUserId + '|' + issued;
  const key = crypto.createHash('sha256').update((process.env.SESSION_SECRET || '') + '|' + ADMIN_ACCESS_CODE).digest();
  const signature = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  return { name: ADMIN_COOKIE_NAME, value: payload + '|' + signature, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: MAX_AGE };
}

function verifyAdminSessionCookie(value: string | undefined) {
  if (!value || !ADMIN_ACCESS_CODE) return null;
  const parts = value.split('|');
  if (parts.length !== 3) return null;
  const tgUserId = parts[0], issued = Number(parts[1]), signature = parts[2], now = Math.floor(Date.now() / 1000);
  if (!tgUserId || !Number.isFinite(issued) || issued > now || now - issued > MAX_AGE) return null;
  const payload = tgUserId + '|' + issued;
  const key = crypto.createHash('sha256').update((process.env.SESSION_SECRET || '') + '|' + ADMIN_ACCESS_CODE).digest();
  const expected = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  const a=Buffer.from(expected), b=Buffer.from(signature || '');
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
  if (!ADMIN_TELEGRAM_USER_ID || tgUserId !== ADMIN_TELEGRAM_USER_ID) return null;
  return { tgUserId, isAdmin: true, accessCodeVerified: true };
}

function parseCookies(request: Request) {
  const raw = request.headers.get('cookie') || '';
  const cookies: Record<string,string> = {};
  raw.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) cookies[part.slice(0,idx).trim()] = part.slice(idx+1).trim();
  });
  return { session: cookies[SESSION_COOKIE_NAME], admin: cookies[ADMIN_COOKIE_NAME] };
}

export async function POST(request: Request) {
  try {
    const { initData, accessCode } = await request.json().catch(() => ({}));
    if (!ADMIN_ACCESS_CODE) return NextResponse.json({ success:false,error:'ADMIN_ACCESS_CODE is not configured on the server.' }, { status:500 });
    if (typeof accessCode !== 'string' || accessCode.length !== ADMIN_ACCESS_CODE.length || !crypto.timingSafeEqual(Buffer.from(accessCode), Buffer.from(ADMIN_ACCESS_CODE))) {
      return NextResponse.json({ success:false,error:'Invalid Admin Access Code.' },{status:401});
    }

    const cookies = parseCookies(request);
    let tgUserId = '';
    let user: any = null;
    const existingSession = verifyTelegramSessionCookie(cookies.session);
    if (existingSession) tgUserId = existingSession.tgUserId;

    if (initData) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) return NextResponse.json({ success:false,error:'Telegram authentication is not configured.' },{status:500});
      const params = new URLSearchParams(initData), hash = params.get('hash'), userStr = params.get('user'), authDate = Number(params.get('auth_date') || 0), now = Math.floor(Date.now()/1000);
      if (!hash || !userStr || !authDate || !Number.isFinite(authDate) || authDate > now + 300 || now - authDate > 86400) return NextResponse.json({success:false,error:'Invalid or expired Telegram initData.'},{status:401});
      params.delete('hash');
      const sortedParams=Array.from(params.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>key+'='+value).join('\n');
      const secretKey=crypto.createHmac('sha256','WebAppData').update(botToken).digest();
      const calculatedHash=crypto.createHmac('sha256',secretKey).update(sortedParams).digest('hex');
      const normalizedHash=hash.toLowerCase();
      if(!/^[0-9a-f]{64}$/.test(normalizedHash)||!crypto.timingSafeEqual(Buffer.from(normalizedHash,'hex'),Buffer.from(calculatedHash,'hex'))) return NextResponse.json({success:false,error:'Invalid Telegram initData signature.'},{status:401});
      const tgUser=JSON.parse(userStr); tgUserId=tgUser.id?String(tgUser.id):'';
      user={id:tgUserId,name:(tgUser.first_name||'')+' '+(tgUser.last_name||''),username:tgUser.username||'',photoUrl:tgUser.photo_url||''};
    }

    if (!tgUserId || !ADMIN_TELEGRAM_USER_ID || tgUserId !== ADMIN_TELEGRAM_USER_ID) return NextResponse.json({success:false,error:'Telegram account is not authorized for Admin Panel.'},{status:403});
    const response=NextResponse.json({success:true,isAdmin:true,accessCodeVerified:true,user:user||{id:tgUserId}});
    response.cookies.set(createTelegramSessionCookie(tgUserId,true));
    response.cookies.set(createAdminSessionCookie(tgUserId));
    return response;
  } catch(error:any){return NextResponse.json({success:false,error:error.message||'Authentication failed'},{status:500});}
}

export async function GET() {
  // Deliberately never auto-authenticate the Admin Panel.
  // ADMIN_ACCESS_CODE must be entered through the Admin Panel gate on every open.
  return NextResponse.json(
    { authenticated:false, isAdmin:false, accessCodeVerified:false, requiresAccessCode:true },
    { status:401 }
  );
}

export async function DELETE() {
  const response = NextResponse.json({ success:true });
  for (const name of [SESSION_COOKIE_NAME, ADMIN_COOKIE_NAME]) response.cookies.set({name,value:'',httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});
  return response;
}
