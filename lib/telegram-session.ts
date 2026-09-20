import crypto from 'crypto';
const COOKIE_NAME='prime_telegram_session', MAX_AGE=86400;
function secret(){const v=process.env.SESSION_SECRET;if(!v||v.length<32)throw new Error('SESSION_SECRET must be configured with at least 32 characters');return v;}
function sign(v:string){return crypto.createHmac('sha256',secret()).update(v).digest('base64url');}
export function createTelegramSessionCookie(tgUserId:string,isAdmin=false){const issued=Math.floor(Date.now()/1000),payload=`${tgUserId}|${issued}|${isAdmin?1:0}`;return{name:COOKIE_NAME,value:`${payload}|${sign(payload)}`,httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',maxAge:MAX_AGE};}


export function verifyTelegramSessionCookie(value: string | undefined) {
  if (!value) return null;
  const parts = value.split('|');
  if (parts.length !== 4) return null;
  const [tgUserId, issuedRaw, adminRaw, signature] = parts;
  const issued = Number(issuedRaw);
  const now = Math.floor(Date.now() / 1000);
  if (!tgUserId || !Number.isFinite(issued) || issued > now || now - issued > MAX_AGE) return null;
  const payload = `${tgUserId}|${issued}|${adminRaw}`;
  const expected = sign(payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || '');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { tgUserId, isAdmin: adminRaw === '1' };
}
