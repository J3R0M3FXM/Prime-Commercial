const CODE_TTL_SECONDS = 60;
const SESSION_TTL_SECONDS = 86400;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

async function hmacHex(keyBytes, value) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyTelegramLogin(url, env) {
  const params = new URLSearchParams(url.search);
  const hash = params.get('hash') || '';
  if (!/^[a-f0-9]{64}$/i.test(hash)) return null;
  params.delete('hash');
  const authDate = Number(params.get('auth_date') || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(authDate) || authDate <= 0 || authDate > now + 300 || now - authDate > 86400) return null;
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return null;
  const tokenKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  if ((await hmacHex(tokenKey, dataCheck)) !== hash.toLowerCase()) return null;
  let user;
  try { user = JSON.parse(params.get('user') || '{}'); } catch { return null; }
  const tgUserId = user?.id == null ? '' : String(user.id);
  if (!/^\d+$/.test(tgUserId)) return null;
  return { tgUserId, user };
}

function isAdminTelegramUser(tgUserId, env) {
  const configured = String(env.ADMIN_TELEGRAM_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value));
  return configured.includes(String(tgUserId));
}

async function signedSession(tgUserId, env) {
  const secret = String(env.SESSION_SIGNING_KEY || '');
  if (secret.length < 32) throw new Error('SESSION_SIGNING_KEY is not configured');
  const issued = Math.floor(Date.now() / 1000);
  const payload = `admin|${tgUserId}|${issued}`;
  const key = new TextEncoder().encode(secret);
  const signature = await hmacHex(key, payload);
  return `${payload}|${signature}`;
}

async function verifySession(session, env) {
  const parts = String(session || '').split('|');
  if (parts.length !== 4 || parts[0] !== 'admin' || !/^\d+$/.test(parts[1]) || !/^\d+$/.test(parts[2]) || !/^[a-f0-9]{64}$/i.test(parts[3])) return null;
  const issued = Number(parts[2]);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(issued) || issued > now || now - issued > SESSION_TTL_SECONDS || !isAdminTelegramUser(parts[1], env)) return null;
  const expected = await hmacHex(new TextEncoder().encode(String(env.SESSION_SIGNING_KEY || '')), parts.slice(0, 3).join('|'));
  if (expected !== parts[3].toLowerCase()) return null;
  return { id: parts[1], role: 'admin', authMethod: 'gateway_session', expiresAt: issued + SESSION_TTL_SECONDS };
}

function loginPage(env) {
  const bot = String(env.TELEGRAM_BOT_USERNAME || 'primenetworkphbot').replace(/^@/, '');
  const callback = String(env.AUTH_CALLBACK_URL || 'https://auth.codespacelabs.online/api/telegram/callback');
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRIME sign in</title><script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${bot}" data-size="large" data-auth-url="${callback}" data-request-access="write"></script>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    if (url.pathname === '/health') return json({ ok: true, service: 'prime-auth' });
    if (url.pathname === '/login') return loginPage(env);
    if (url.pathname === '/callback' || url.pathname === '/api/telegram/callback') {
      const verified = await verifyTelegramLogin(url, env);
      if (!verified || !env.AUTH_CODES || !isAdminTelegramUser(verified.tgUserId, env)) return new Response('Admin authentication failed.', { status: 401 });
      const code = crypto.randomUUID().replaceAll('-', '');
      await env.AUTH_CODES.put(`code:${code}`, await signedSession(verified.tgUserId, env), { expirationTtl: CODE_TTL_SECONDS });
      const target = String(env.NATIVE_CALLBACK_URL || 'prime://auth/callback');
      const redirect = new URL(target);
      redirect.searchParams.set('code', code);
      return Response.redirect(redirect.toString(), 302);
    }
    if (url.pathname === '/exchange') {
      const code = url.searchParams.get('code') || '';
      if (!/^[a-f0-9]{32}$/.test(code) || !env.AUTH_CODES) return json({ error: 'Invalid or expired code' }, 400);
      const key = `code:${code}`;
      const session = await env.AUTH_CODES.get(key);
      if (!session) return json({ error: 'Invalid or expired code' }, 401);
      await env.AUTH_CODES.delete(key);
      return json({ authenticated: true, session, expiresIn: SESSION_TTL_SECONDS });
    }
    if (url.pathname === '/session') {
      const authorization = request.headers.get('authorization') || '';
      const session = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      const identity = await verifySession(session, env);
      return identity ? json({ authenticated: true, identity }) : json({ authenticated: false }, 401);
    }
    return json({ error: 'Not found' }, 404);
  },
};
