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

function camelKey(key) {
  return String(key).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [camelKey(key), camelize(item)]));
}

async function verifySession(value, env) {
  const session = String(value || '').trim();
  if (!session) return null;
  try {
    const response = await fetch('https://auth.codespacelabs.online/session', {
      headers: { Authorization: `Bearer ${session}` },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.authenticated !== true || body?.identity?.role !== 'admin') return null;
    return { id: String(body.identity.id || ''), role: 'admin', authMethod: 'auth_worker_session' };
  } catch {
    return null;
  }
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
    if (url.pathname === '/v1/admin-read') {
      const identity = await requireAdmin(request, env);
      if (!identity) return json({ error: 'Admin authentication required' }, 401);
      const name = url.searchParams.get('name') || '';
      const action = url.searchParams.get('action') || '';
      const readOnly = action === 'list' || action === 'status' || action === 'capabilities' || action === '';
      if (!readOnly) return json({ error: `${name} ${action} is not migrated to the native gateway yet.` }, 501);
      const defaults = {
        manageNotifications: { notifications: [] },
        manageDeviceSecurity: action === 'capabilities' ? { capabilities: [] } : { devices: [], sessions: [] },
        manageSmsEvidence: { configured: false },
        manageStoryCampaigns: { campaigns: [] },
        manageVideos: [],
        manageAutomation: [],
        manageOcrSettings: { googleVisionConfigured: false, ocrSpaceConfigured: false, provider: 'ocr_space' },
        manageIplocateSettings: { configured: false },
        manageTomtomSettings: { configured: false },
      };
      return json({ data: defaults[name] ?? {} });
    }

    const table = READ_ROUTES.get(url.pathname);
    if (!table) return json({ error: 'Not found' }, 404);
    const identity = await requireAdmin(request, env);
    if (!identity) return json({ error: 'Admin authentication required' }, 401);
    if (!env.ADMIN_DB) return json({ error: 'Admin database is not configured' }, 503);

    const limit = limitFor(url);
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
    if (table === 'orders' && url.searchParams.get('action') === 'get') {
      const orderId = String(url.searchParams.get('orderId') || '').trim();
      if (!orderId) return json({ error: 'Order ID is required' }, 400);
      const result = await env.ADMIN_DB.prepare('SELECT * FROM orders WHERE id = ? OR order_number = ? LIMIT 1').bind(orderId, orderId).all();
      return json({ data: camelize(result.results?.[0] || null) });
    }
    const result = await env.ADMIN_DB.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`).bind(limit, offset).all();
    return json({ data: camelize(result.results || []), pagination: { limit, offset, count: result.results?.length || 0 } });
  },
};
