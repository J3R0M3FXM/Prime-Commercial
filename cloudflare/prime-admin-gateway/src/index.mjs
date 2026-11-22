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
  ['/v1/support-tickets', 'support_tickets'],
  ['/v1/charges', 'charges'],
  ['/v1/account-history', 'account_history'],
  ['/v1/device-registrations', 'device_registrations'],
  ['/v1/media-assets', 'media_assets'],
]);

function headers() {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, x-prime-sync-timestamp, x-prime-sync-signature',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
}

const SYNC_TABLES = new Set([
  'products', 'customers', 'orders', 'payment_methods', 'promos', 'warehouses',
  'couriers', 'support_tickets', 'charges', 'system_settings', 'account_history',
  'device_registrations', 'media_assets',
]);
const SYNC_KEYS = { system_settings: 'key' };

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifySync(request, env, body) {
  const secret = String(env.SYNC_SECRET || '').trim();
  const timestamp = String(request.headers.get('x-prime-sync-timestamp') || '').trim();
  const signature = String(request.headers.get('x-prime-sync-signature') || '').trim().toLowerCase();
  const age = Date.now() - Number(timestamp);
  if (!secret || !/^\d{13}$/.test(timestamp) || !Number.isFinite(age) || Math.abs(age) > 5 * 60 * 1000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return constantTimeEqual(signature, await hmac(secret, `${timestamp}\n${body}`));
}

async function applySyncBatch(env, payload) {
  const table = String(payload?.table || '');
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  if (!SYNC_TABLES.has(table) || rows.length > 250) throw new Error('Invalid synchronization batch');
  const info = await env.ADMIN_DB.prepare(`PRAGMA table_info(${table})`).all();
  const allowed = new Set((info.results || []).map((column) => column.name));
  let imported = 0;
  for (const sourceRow of rows) {
    const hasMediaContent = Object.prototype.hasOwnProperty.call(sourceRow || {}, 'content_base64');
    const row = Object.fromEntries(Object.entries(sourceRow || {}).filter(([key]) => allowed.has(key)));
    if (table === 'media_assets' && !hasMediaContent) row.content_base64 = '';
    const columns = Object.keys(row);
    if (!columns.length) continue;
    const values = columns.map((column) => {
      const value = row[column];
      return value && typeof value === 'object' ? JSON.stringify(value) : value == null ? null : value;
    });
    const placeholders = columns.map(() => '?').join(',');
    const key = SYNC_KEYS[table] || 'id';
    const updates = columns.filter((column) => column !== key && !(table === 'media_assets' && column === 'content_base64' && !hasMediaContent)).map((column) => `${column}=excluded.${column}`).join(',');
    const statement = updates
      ? `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders}) ON CONFLICT(${key}) DO UPDATE SET ${updates}`
      : `INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
    await env.ADMIN_DB.prepare(statement).bind(...values).run();
    imported += 1;
  }
  await env.ADMIN_DB.prepare('INSERT INTO projection_sync_runs (source_name,table_name,row_count,cursor,status,error,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(String(payload?.source || 'tgcloud'), table, imported, String(payload?.cursor || ''), 'ok', '', Date.now()).run();
  return imported;
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

function normalizeProjectionRow(table, row) {
  const value = camelize(row);
  const parse = (key, fallback) => {
    if (typeof value[key] !== 'string') return;
    try { value[key] = JSON.parse(value[key]); } catch { value[key] = fallback; }
  };
  if (table === 'products') {
    parse('bundleConfig', {}); parse('tags', []); parse('gallery', []);
    if (!Array.isArray(value.variants) && Array.isArray(value.bundleConfig?.variants)) value.variants = value.bundleConfig.variants;
  }
  if (table === 'orders') { parse('items', []); parse('deliveryAddress', {}); parse('chargesBreakdown', []); parse('workflow', {}); parse('fingerprintSnapshot', {}); parse('matchingIdentifiers', []); parse('ocrAnalysis', {}); }
  if (table === 'support_tickets') parse('messages', []);
  return value;
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
    if (request.method !== 'GET' && !(request.method === 'POST' && ['/v1/media-upload', '/v1/sync/batch'].includes(url.pathname))) return json({ error: 'Method not allowed' }, 405);
    if (url.pathname === '/health') return json({ ok: true, service: 'prime-admin-gateway', database: Boolean(env.ADMIN_DB) });
    if (url.pathname === '/session') {
      const identity = await requireAdmin(request, env);
      return identity
        ? json({ authenticated: true, isAdmin: true, tgUserId: identity.id, user: identity })
        : json({ authenticated: false }, 401);
    }
    if (url.pathname === '/v1/sync/batch') {
      if (!env.ADMIN_DB) return json({ error: 'Admin database is not configured' }, 503);
      const body = await request.text();
      if (!(await verifySync(request, env, body))) return json({ error: 'Invalid synchronization signature' }, 401);
      try {
        const imported = await applySyncBatch(env, JSON.parse(body));
        return json({ data: { ok: true, imported, table: JSON.parse(body).table } });
      } catch (error) {
        return json({ error: String(error?.message || 'Synchronization failed') }, 400);
      }
    }
    if (url.pathname === '/v1/sync/status') {
      const identity = await requireAdmin(request, env);
      if (!identity) return json({ error: 'Admin authentication required' }, 401);
      if (!env.ADMIN_DB) return json({ error: 'Admin database is not configured' }, 503);
      const result = await env.ADMIN_DB.prepare('SELECT table_name AS tableName, SUM(row_count) AS rows, MAX(created_at) AS lastSyncAt, MAX(status) AS status FROM projection_sync_runs GROUP BY table_name ORDER BY table_name').all();
      return json({ data: { automatic: Boolean(env.SYNC_SECRET), tables: result.results || [] } });
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

    if (url.pathname === '/v1/device-security') {
      const identity = await requireAdmin(request, env);
      if (!identity) return json({ error: 'Admin authentication required' }, 401);
      if (!env.ADMIN_DB) return json({ error: 'Admin database is not configured' }, 503);
      const action = url.searchParams.get('action') || 'staffDetail';
      if (action === 'capabilities') return json({ data: { contextKeys: [], requestKeys: ['authorization'], metadataKeys: [], ipStatus: 'Server IP is available only in source security records.' } });
      const customerId = String(url.searchParams.get('customerId') || '').trim();
      const rows = customerId
        ? await env.ADMIN_DB.prepare('SELECT d.* FROM device_registrations d LEFT JOIN customers c ON c.tg_user_id = d.telegram_user_id OR c.id = d.telegram_user_id WHERE c.id = ? OR c.tg_user_id = ? ORDER BY d.last_seen_at DESC LIMIT 100').bind(customerId, customerId).all()
        : await env.ADMIN_DB.prepare('SELECT * FROM device_registrations ORDER BY last_seen_at DESC LIMIT 100').all();
      const devices = (rows.results || []).map((row) => {
        let metadata = {}; try { metadata = JSON.parse(row.metadata || '{}'); } catch {}
        return { id: row.id, installationId: row.installation_id, fingerprintId: row.fingerprint_id, riskScore: Number(row.risk_score || 0), trustStatus: row.trust_status || 'observed', firstSeenAt: Number(row.first_seen_at || 0), lastSeenAt: Number(row.last_seen_at || 0), metadata };
      });
      return json({ data: { devices, sessions: [], events: [], retentionDays: 365, preciseCoordinatesStored: false, serverIpAvailable: devices.some((device) => Boolean(device.metadata?.clientObservedIp)) } });
    }
    if (url.pathname === '/v1/media-content') {
      const identity = await requireAdmin(request, env);
      if (!identity) return json({ error: 'Admin authentication required' }, 401);
      if (!env.ADMIN_DB) return json({ error: 'Admin database is not configured' }, 503);
      const id = String(url.searchParams.get('id') || '').trim();
      const row = await env.ADMIN_DB.prepare('SELECT id,content_type,size,content_base64 FROM media_assets WHERE id = ? AND visibility = ? LIMIT 1').bind(id, 'public').first();
      if (!row) return json({ error: 'Media not found' }, 404);
      const chunkSize = 192 * 1024;
      const index = Number(url.searchParams.get('chunkIndex') || 0);
      const bytes = Number(row.size);
      const count = Math.ceil(bytes / chunkSize);
      if (!Number.isInteger(index) || index < 0 || index >= count) return json({ error: 'Invalid media transfer part' }, 400);
      const start = Math.floor(index * chunkSize / 3) * 4;
      const end = Math.ceil(Math.min(bytes, (index + 1) * chunkSize) / 3) * 4;
      return json({ id: row.id, contentType: row.content_type, size: bytes, chunkIndex: index, chunkCount: count, base64: String(row.content_base64).slice(start, end) });
    }
    if (url.pathname === '/v1/media-upload') {
      const identity = await requireAdmin(request, env);
      if (!identity) return json({ error: 'Admin authentication required' }, 401);
      if (!env.ADMIN_DB) return json({ error: 'Admin database is not configured' }, 503);
      const input = await request.json().catch(() => ({}));
      const id = String(input.id || '').trim();
      const bucket = input.action === 'uploadProductImage' ? 'product-images' : String(input.bucket || '').trim();
      const contentType = String(input.contentType || '');
      const encoded = String(input.data || '');
      if (!/^img-[A-Za-z0-9_-]{8,80}$/.test(id) || !['product-images','media-gallery','courier-logos','payment-method-logos','payment-qr-codes'].includes(bucket) || !['image/jpeg','image/png'].includes(contentType) || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > 1250000) return json({ error: 'Invalid or oversized image upload.' }, 400);
      const size = Math.floor(encoded.length * 3 / 4);
      await env.ADMIN_DB.prepare('INSERT OR REPLACE INTO media_assets (id,bucket,path,content_type,size,visibility,content_base64,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,bucket,`${id}.${contentType === 'image/png' ? 'png' : 'jpg'}`,contentType,size,'public',encoded,Date.now(),Date.now()).run();
      return json({ data: { success: true, id, bucket, reference: `tgmedia:${id}`, contentType, size } });
    }
    if (url.pathname === '/v1/media-assets') {
      const identity = await requireAdmin(request, env);
      if (!identity) return json({ error: 'Admin authentication required' }, 401);
      if (!env.ADMIN_DB) return json({ error: 'Admin database is not configured' }, 503);
      const result = await env.ADMIN_DB.prepare('SELECT id,bucket,path,content_type,size,visibility,created_at,updated_at FROM media_assets ORDER BY created_at DESC LIMIT 500').all();
      return json({ data: (result.results || []).map((row) => camelize(row)) });
    }

    if (url.pathname === '/v1/support-tickets') {
      const identity = await requireAdmin(request, env);
      if (!identity) return json({ error: 'Admin authentication required' }, 401);
      if (!env.ADMIN_DB) return json({ error: 'Admin database is not configured' }, 503);
      const action = url.searchParams.get('action') || 'list';
      const ticketId = String(url.searchParams.get('id') || '').trim();
      const mapTicket = (row) => {
        const ticket = normalizeProjectionRow('support_tickets', row);
        ticket.messages = Array.isArray(ticket.messages) ? ticket.messages : [];
        ticket.unread = Number(ticket.staffSeenVersion || 0) < Number(ticket.version || 0);
        return ticket;
      };
      if (action === 'detail' && ticketId) {
        const row = await env.ADMIN_DB.prepare('SELECT * FROM support_tickets WHERE id = ? LIMIT 1').bind(ticketId).first();
        return json({ data: { ticket: row ? mapTicket(row) : null } });
      }
      const result = await env.ADMIN_DB.prepare('SELECT * FROM support_tickets ORDER BY updated_at DESC LIMIT 500').all();
      const tickets = (result.results || []).map(mapTicket);
      return json({ data: { tickets, total: tickets.length, unread: tickets.filter((ticket) => ticket.unread).length, nextCursor: null } });
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
    const result = await env.ADMIN_DB.prepare(`SELECT * FROM ${table} ORDER BY ${table === 'orders' ? 'created_at' : 'updated_at'} DESC LIMIT ? OFFSET ?`).bind(limit, offset).all();
    return json({ data: (result.results || []).map((row) => normalizeProjectionRow(table, row)), pagination: { limit, offset, count: result.results?.length || 0 } });
  },
};
