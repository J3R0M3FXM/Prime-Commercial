const SESSION_TTL_SECONDS = 86400;
const PAGE_SIZE = 50;
const READ_ROUTES = new Map([
  ['/v1/products', 'products'],
  ['/v1/customers', 'customers'],
  ['/v1/orders', 'orders'],
  ['/v1/payment-methods', 'payment_methods'],
  ['/v1/promos', 'promos'],
  ['/v1/warehouses', 'warehouses'],
  ['/v1/couriers', 'couriers'],
  ['/v1/charges', 'charges'],
  ['/v1/account-history', 'account_history'],
]);

function headers() {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers() });
}

async function hmacHex(keyBytes, value) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isAdmin(id, env) {
  return String(env.ADMIN_TELEGRAM_USER_IDS || '').split(',').map((value) => value.trim()).includes(String(id));
}

async function verifySession(value, env) {
  const parts = String(value || '').split('|');
  if (parts.length !== 4 || parts[0] !== 'admin' || !/^\d+$/.test(parts[1]) || !/^\d+$/.test(parts[2]) || !/^[a-f0-9]{64}$/i.test(parts[3])) return null;
  const issued = Number(parts[2]);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(issued) || issued > now || now - issued > SESSION_TTL_SECONDS || !isAdmin(parts[1], env)) return null;
  const secret = String(env.SESSION_SIGNING_KEY || '');
  if (secret.length < 32) return null;
  const expected = await hmacHex(new TextEncoder().encode(secret), parts.slice(0, 3).join('|'));
  return expected === parts[3].toLowerCase() ? { id: parts[1], role: 'admin' } : null;
}

async function requireAdmin(request, env) {
  const authorization = request.headers.get('authorization') || '';
  return verifySession(authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '', env);
}

function limitFor(url) {
  const raw = Number(url.searchParams.get('limit') || PAGE_SIZE);
  return Number.isInteger(raw) ? Math.max(1, Math.min(PAGE_SIZE, raw)) : PAGE_SIZE;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers() });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    if (url.pathname === '/health') return json({ ok: true, service: 'prime-admin-gateway', database: Boolean(env.ADMIN_DB) });
    if (url.pathname === '/session') {
      const identity = await requireAdmin(request, env);
      return identity
        ? json({ authenticated: true, isAdmin: true, tgUserId: identity.id, user: identity })
        : json({ authenticated: false }, 401);
    }

    const table = READ_ROUTES.get(url.pathname);
    if (!table) return json({ error: 'Not found' }, 404);
    const identity = await requireAdmin(request, env);
    if (!identity) return json({ error: 'Admin authentication required' }, 401);
    if (!env.ADMIN_DB) return json({ error: 'Admin database is not configured' }, 503);

    const limit = limitFor(url);
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
    const result = await env.ADMIN_DB.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`).bind(limit, offset).all();
    return json({ data: result.results || [], pagination: { limit, offset, count: result.results?.length || 0 } });
  },
};
