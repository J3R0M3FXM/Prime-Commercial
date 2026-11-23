import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { fetch } from 'sdk/fetch';
import { requireAdmin } from '../lib/auth.js';
import { systemSettings } from '../schema.js';

const TABLES = ['products', 'customers', 'orders', 'payment_methods', 'promos', 'warehouses', 'couriers', 'support_tickets', 'charges', 'system_settings', 'account_history', 'device_registrations', 'media_assets'];
const text = (value) => typeof value === 'string' ? value.trim() : '';
async function setting(key) { const row = await db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, key)).get(); const value = row?.value; return typeof value === 'string' ? value.trim() : value && typeof value === 'object' ? text(value.secret || value.value || value.url) : ''; }
async function sign(secret, value) { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
async function push(url, secret, table, rows, cursor) { const body = JSON.stringify({ source: 'tgcloud', table, rows, cursor: String(cursor) }); const timestamp = String(Date.now()); const response = await fetch(url + '/v1/sync/batch', { method: 'POST', headers: { 'content-type': 'application/json', 'x-prime-sync-timestamp': timestamp, 'x-prime-sync-signature': await sign(secret, timestamp + '\n' + body) }, body }); if (!response.ok) throw new EndpointError('Native projection sync rejected a batch.', { code: 'SYNC_REJECTED', status: response.status }); }
async function synchronize(input, ctx) {
  await requireAdmin(ctx);
  const secret = await setting('native_projection_sync_secret'); const url = (await setting('native_projection_gateway_url')).replace(/\/$/, '');
  if (!secret || !url) throw new EndpointError('Native projection sync is not configured.', { code: 'SYNC_NOT_CONFIGURED' });
  const requested = text(input?.table); const tables = requested ? [requested] : TABLES; if (tables.some((table) => !TABLES.includes(table))) throw new EndpointError('Unknown projection table.', { code: 'INVALID_TABLE' });
  let total = 0;
  for (const table of tables) { if (table === 'system_settings') continue; const exists = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name=:table LIMIT 1", { ':table': table }); if (!exists.length) continue; let offset = Number(input?.offset || 0); for (;;) { const select = table === 'media_assets' ? 'id,bucket,path,content_type,size,visibility,created_at,updated_at' : '*'; const rows = await db.all(`SELECT ${select} FROM ${table} ORDER BY rowid LIMIT 40 OFFSET :offset`, { ':offset': offset }); if (!rows.length) break; await push(url, secret, table, rows, `${table}:${offset + rows.length}`); total += rows.length; offset += rows.length; if (rows.length < 40 || input?.singlePage === true) break; } }
  return { synchronized: true, tables, rows: total, complete: input?.singlePage !== true };
}

export default async function (input = {}, ctx) {
  if (input?.action === 'registerPushToken') {
    await requireAdmin(ctx);
    const token = text(input.token);
    if (token.length < 32 || token.length > 4096) throw new EndpointError('Invalid push registration token.', { code: 'INVALID_INPUT' });
    const current = await db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, 'admin_push_tokens')).get();
    let tokens = Array.isArray(current?.value) ? current.value : [];
    tokens = Array.from(new Set([...tokens, token])).slice(-20);
    await db.insert(systemSettings).values({ key: 'admin_push_tokens', value: tokens, updatedAt: new Date() }).onConflictDoUpdate({ target: systemSettings.key, set: { value: tokens, updatedAt: new Date() } }).run();
    return { registered: true };
  }
  if (input?.action === 'sync') return synchronize(input, ctx);
  if (input?.action === 'configure') {
    await requireAdmin(ctx); const secret = text(input.secret); const url = text(input.gatewayUrl);
    if (secret.length < 32 || !/^https:\/\//i.test(url)) throw new EndpointError('A valid gateway URL and sync secret are required.', { code: 'INVALID_INPUT' });
    await db.insert(systemSettings).values({ key: 'native_projection_sync_secret', value: { secret }, updatedAt: new Date() }).onConflictDoUpdate({ target: systemSettings.key, set: { value: { secret }, updatedAt: new Date() } }).run();
    await db.insert(systemSettings).values({ key: 'native_projection_gateway_url', value: url.replace(/\/$/, ''), updatedAt: new Date() }).onConflictDoUpdate({ target: systemSettings.key, set: { value: url.replace(/\/$/, ''), updatedAt: new Date() } }).run();
    return { configured: true };
  }
  return {
    ok: true,
    service: 'prime-commercial',
    target: 'telegram-serverless',
    timestamp: new Date().toISOString(),
  };
}
