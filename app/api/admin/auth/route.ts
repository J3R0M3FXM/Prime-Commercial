import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createTelegramSessionCookie } from '@/lib/telegram-session';

const SESSION_COOKIE_NAME = 'prime_telegram_session';
const ADMIN_TELEGRAM_USER_ID = process.env.ADMIN_TELEGRAM_USER_ID || '';
export async function POST(request: Request) {
  try {
    const { initData } = await request.json().catch(() => ({}));
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!initData || !botToken) return NextResponse.json({ success: false, error: 'Valid Telegram initData is required.' }, { status: 401 });
    const params = new URLSearchParams(initData), hash = params.get('hash'), userStr = params.get('user'), authDate = Number(params.get('auth_date') || 0), now = Math.floor(Date.now()/1000);
    if (!hash || !userStr || !authDate || !Number.isFinite(authDate) || authDate > now + 300 || now - authDate > 86400) return NextResponse.json({ success:false,error:'Invalid or expired Telegram initData.'},{status:401});
    params.delete('hash');
    const sortedParams=Array.from(params.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join('\n');
    const secretKey=crypto.createHmac('sha256','WebAppData').update(botToken).digest();
    const calculatedHash=crypto.createHmac('sha256',secretKey).update(sortedParams).digest('hex');
    const normalizedHash=hash.toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(normalizedHash)||!crypto.timingSafeEqual(Buffer.from(normalizedHash,'hex'),Buffer.from(calculatedHash,'hex'))) return NextResponse.json({success:false,error:'Invalid Telegram initData signature.'},{status:401});
    const tgUser=JSON.parse(userStr), tgUserId=tgUser.id?String(tgUser.id):'';
    if(!ADMIN_TELEGRAM_USER_ID||tgUserId!==ADMIN_TELEGRAM_USER_ID) return NextResponse.json({success:false,error:'Telegram account is not authorized for Admin Panel.'},{status:403});
    const response=NextResponse.json({success:true,isAdmin:true,token:'server-session',user:{id:tgUserId,name:`${tgUser.first_name||""} ${tgUser.last_name||""}`.trim(),username:tgUser.username||'',photoUrl:tgUser.photo_url||''}});
    response.cookies.set(createTelegramSessionCookie(tgUserId,true)); return response;
  } catch(error:any){return NextResponse.json({success:false,error:error.message||'Authentication failed'},{status:500});}
}


export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
