import { db } from 'sdk';
import { sanitizeFingerprint, saveCustomerFingerprint } from './fingerprints.js';

export const SECURITY_RETENTION_DAYS = 90;
export const DEVICE_RETENTION_DAYS = 180;
let schemaReady;

// Additive, idempotent initialization. Existing customer/order/configuration tables are untouched.
export async function ensureDeviceSecurityTables() {
  if (!schemaReady) schemaReady = (async () => {
    await db.run(`CREATE TABLE IF NOT EXISTS device_registrations (
      id TEXT PRIMARY KEY, telegram_user_id TEXT NOT NULL, installation_id TEXT NOT NULL,
      fingerprint_id TEXT NOT NULL DEFAULT '', metadata TEXT NOT NULL DEFAULT '{}',
      risk_score INTEGER NOT NULL DEFAULT 0, trust_status TEXT NOT NULL DEFAULT 'observed',
      first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
      UNIQUE(telegram_user_id, installation_id))`);
    await db.run('CREATE UNIQUE INDEX IF NOT EXISTS device_registrations_owner_installation_key ON device_registrations (telegram_user_id,installation_id)');
    await db.run('CREATE INDEX IF NOT EXISTS device_registrations_owner_seen_idx ON device_registrations (telegram_user_id,last_seen_at)');
    await db.run('CREATE INDEX IF NOT EXISTS device_registrations_installation_idx ON device_registrations (installation_id)');
    await db.run('CREATE INDEX IF NOT EXISTS device_registrations_fingerprint_idx ON device_registrations (fingerprint_id)');
    await db.run(`CREATE TABLE IF NOT EXISTS device_security_sessions (
      id TEXT PRIMARY KEY, telegram_user_id TEXT NOT NULL, device_registration_id TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, risk_score INTEGER NOT NULL DEFAULT 0,
      risk_reasons TEXT NOT NULL DEFAULT '[]', reported_ip TEXT NOT NULL DEFAULT '', ip_source TEXT NOT NULL DEFAULT 'Unavailable',
      location_checked_at INTEGER, location_accuracy NUMERIC, location_source TEXT NOT NULL DEFAULT '')`);
    await db.run('CREATE INDEX IF NOT EXISTS device_security_sessions_owner_seen_idx ON device_security_sessions (telegram_user_id,last_seen_at)');
    await db.run(`CREATE TABLE IF NOT EXISTS device_security_events (
      id TEXT PRIMARY KEY, telegram_user_id TEXT NOT NULL, device_registration_id TEXT NOT NULL,
      session_id TEXT NOT NULL, event_type TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL)`);
    await db.run('CREATE INDEX IF NOT EXISTS device_security_events_owner_created_idx ON device_security_events (telegram_user_id,created_at)');
  })().catch(error => { schemaReady = undefined; throw error; });
  return schemaReady;
}

async function identifier(...values) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(values)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function parseSecurityJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}
export function normalizeReportedIp(value) {
  if (typeof value !== 'string' || value.length > 45 || value !== value.trim()) return '';
  const v4 = text => /^\d{1,3}(\.\d{1,3}){3}$/.test(text) && text.split('.').every(part => Number(part) <= 255 && String(Number(part)) === part);
  if (v4(value)) return value;
  // IPv6, including a final embedded IPv4. Zone identifiers and ports are rejected.
  if (!/^[0-9a-f:.]+$/i.test(value) || !value.includes(':')) return '';
  let candidate = value;
  if (candidate.includes('.')) {
    const index = candidate.lastIndexOf(':');
    if (!v4(candidate.slice(index + 1))) return '';
    candidate = candidate.slice(0, index + 1) + '0:0';
  }
  if (candidate.split('::').length > 2) return '';
  if (candidate.includes(':::') || (candidate.startsWith(':') && !candidate.startsWith('::')) || (candidate.endsWith(':') && !candidate.endsWith('::'))) return '';
  const parts = candidate.split(':').filter(Boolean);
  if (!parts.every(part => /^[0-9a-f]{1,4}$/i.test(part))) return '';
  const compressed = candidate.includes('::');
  if (compressed ? parts.length >= 8 : parts.length !== 8 || candidate.startsWith(':') || candidate.endsWith(':')) return '';
  return value.toLowerCase();
}

export async function persistFingerprintHistory(customerId, input) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await db.get("SELECT tg_user_id AS tgUserId, COALESCE(CAST(fingerprints AS TEXT), '[]') AS fingerprints FROM customers WHERE id=:id", { ':id': customerId });
    if (!current) return null;
    const saved = await saveCustomerFingerprint(current, input, new Date());
    const result = await db.run(`UPDATE customers SET fingerprints=json(:next), updated_at=unixepoch()
      WHERE id=:id AND COALESCE(fingerprints, '[]')=:current`,
    { ':id': customerId, ':next': JSON.stringify(saved.fingerprints), ':current': String(current.fingerprints || '[]') });
    if (Number(result?.rowsAffected) > 0) return saved.latestFingerprint;
  }
  return null;
}

export async function recordDeviceSession(telegramId, input) {
  const signal = await sanitizeFingerprint(input);
  if (!signal.installationId || !/^SESS_[0-9a-f-]{36}$/i.test(signal.sessionToken)) throw new Error('Refresh the app to initialize device recognition.');
  await ensureDeviceSecurityTables();
  const now = Math.floor(Date.now() / 1000);
  const deviceId = await identifier(telegramId, signal.installationId);
  const sessionId = await identifier(telegramId, signal.installationId, signal.sessionToken);
  const params = { ':owner': telegramId, ':installation': signal.installationId, ':fingerprint': signal.fingerprintId };
  const [previous, shared] = await Promise.all([
    db.get('SELECT fingerprint_id AS fingerprintId, first_seen_at AS firstSeenAt FROM device_registrations WHERE id=:id', { ':id': deviceId }),
    db.get(`SELECT count(DISTINCT telegram_user_id) AS count FROM device_registrations
      WHERE telegram_user_id<>:owner AND last_seen_at>=:cutoff AND (installation_id=:installation OR (:fingerprint<>'' AND fingerprint_id=:fingerprint))`,
      { ...params, ':cutoff': now - DEVICE_RETENTION_DAYS * 86400 }),
  ]);
  const reasons = [];
  if (!previous) reasons.push('New Installation');
  if (previous?.fingerprintId && signal.fingerprintId && previous.fingerprintId !== signal.fingerprintId) reasons.push('Browser Fingerprint Changed');
  if (Number(shared?.count) > 0) reasons.push('Signals Shared With Another Account');
  const riskScore = Math.min(100, reasons.reduce((sum, reason) => sum + (reason === 'Signals Shared With Another Account' ? 25 : reason === 'New Installation' ? 20 : 10), 0));
  // Tokens and client timestamps are not retained in the registry metadata.
  const { sessionToken, ...metadata } = signal;
  await db.run(`INSERT INTO device_registrations (id,telegram_user_id,installation_id,fingerprint_id,metadata,risk_score,first_seen_at,last_seen_at)
    VALUES (:id,:owner,:installation,:fingerprint,:metadata,:risk,:now,:now)
    ON CONFLICT(id) DO UPDATE SET fingerprint_id=CASE WHEN excluded.fingerprint_id<>'' THEN excluded.fingerprint_id ELSE device_registrations.fingerprint_id END,
      metadata=excluded.metadata,risk_score=excluded.risk_score,last_seen_at=excluded.last_seen_at`,
    { ...params, ':id': deviceId, ':metadata': JSON.stringify(metadata), ':risk': riskScore, ':now': now });
  await db.run(`INSERT INTO device_security_sessions (id,telegram_user_id,device_registration_id,first_seen_at,last_seen_at,risk_score,risk_reasons)
    VALUES (:id,:owner,:device,:now,:now,:risk,:reasons)
    ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at,
      risk_score=max(device_security_sessions.risk_score,excluded.risk_score),
      risk_reasons=CASE WHEN excluded.risk_score>device_security_sessions.risk_score THEN excluded.risk_reasons ELSE device_security_sessions.risk_reasons END`,
    { ':id': sessionId, ':owner': telegramId, ':device': deviceId, ':now': now, ':risk': riskScore, ':reasons': JSON.stringify(reasons) });
  for (const eventType of ['Session Started', ...reasons]) {
    const eventId = await identifier(sessionId, eventType, eventType === 'Browser Fingerprint Changed' ? signal.fingerprintId : '');
    await db.run(`INSERT OR IGNORE INTO device_security_events (id,telegram_user_id,device_registration_id,session_id,event_type,details,created_at)
      VALUES (:id,:owner,:device,:session,:type,:details,:now)`,
      { ':id': eventId, ':owner': telegramId, ':device': deviceId, ':session': sessionId, ':type': eventType,
        ':details': JSON.stringify({ reviewOnly: true }), ':now': now });
  }
  await pruneDeviceSecurity(telegramId, now);
  return { deviceId, sessionId, riskScore, reasons, newInstallation: !previous, source: 'Client-Reported Signals' };
}

export async function pruneDeviceSecurity(telegramId, now = Math.floor(Date.now() / 1000)) {
  const params = { ':owner': telegramId, ':cutoff': now - SECURITY_RETENTION_DAYS * 86400 };
  await db.run('DELETE FROM device_security_sessions WHERE telegram_user_id=:owner AND last_seen_at<:cutoff', params);
  await db.run('DELETE FROM device_security_events WHERE telegram_user_id=:owner AND created_at<:cutoff', params);
  await db.run(`DELETE FROM device_security_sessions WHERE telegram_user_id=:owner AND id NOT IN
    (SELECT id FROM device_security_sessions WHERE telegram_user_id=:owner ORDER BY last_seen_at DESC,id LIMIT 100)`, { ':owner': telegramId });
  await db.run(`DELETE FROM device_security_events WHERE telegram_user_id=:owner AND id NOT IN
    (SELECT id FROM device_security_events WHERE telegram_user_id=:owner ORDER BY created_at DESC,id LIMIT 200)`, { ':owner': telegramId });
  await db.run('DELETE FROM device_registrations WHERE telegram_user_id=:owner AND last_seen_at<:cutoff',
    { ':owner': telegramId, ':cutoff': now - DEVICE_RETENTION_DAYS * 86400 });
}

export async function readDeviceSecurity(telegramId) {
  await ensureDeviceSecurityTables();
  await pruneDeviceSecurity(telegramId);
  const params = { ':owner': telegramId };
  const [devices, sessions, events] = await Promise.all([
    db.all('SELECT id,installation_id AS installationId,fingerprint_id AS fingerprintId,metadata,risk_score AS riskScore,trust_status AS trustStatus,first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt FROM device_registrations WHERE telegram_user_id=:owner ORDER BY last_seen_at DESC LIMIT 30', params),
    db.all('SELECT id,device_registration_id AS deviceId,first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt,risk_score AS riskScore,risk_reasons AS riskReasons,reported_ip AS reportedIp,ip_source AS ipSource,location_checked_at AS locationCheckedAt,location_accuracy AS locationAccuracy,location_source AS locationSource FROM device_security_sessions WHERE telegram_user_id=:owner ORDER BY last_seen_at DESC LIMIT 100', params),
    db.all('SELECT id,device_registration_id AS deviceId,event_type AS eventType,created_at AS createdAt FROM device_security_events WHERE telegram_user_id=:owner ORDER BY created_at DESC LIMIT 50', params),
  ]);
  return { devices: devices.map(item => ({ ...item, metadata: parseSecurityJson(item.metadata, {}) })),
    sessions: sessions.map(item => ({ ...item, riskReasons: parseSecurityJson(item.riskReasons, []) })), events,
    retentionDays: SECURITY_RETENTION_DAYS, preciseCoordinatesStored: false, serverIpAvailable: false };
}

/** Staff-only caller: shared client signals are associations for review, not identity proof. */
export async function sharedDeviceAccounts(telegramId) {
  return db.all(`SELECT DISTINCT c.id AS customerId,c.tg_name AS name,c.tg_username AS username,c.prime_member_id AS memberId
    FROM device_registrations own JOIN device_registrations other
      ON (own.installation_id=other.installation_id OR (own.fingerprint_id<>'' AND own.fingerprint_id=other.fingerprint_id))
    JOIN customers c ON c.tg_user_id=other.telegram_user_id
    WHERE own.telegram_user_id=:owner AND other.telegram_user_id<>:owner
      AND own.last_seen_at>=:cutoff AND other.last_seen_at>=:cutoff LIMIT 30`,
    { ':owner': telegramId, ':cutoff': Math.floor(Date.now() / 1000) - DEVICE_RETENTION_DAYS * 86400 });
}

export function runtimeCapabilities(ctx) {
  const names = value => value && typeof value === 'object' ? Object.keys(value).filter(key => /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)).slice(0, 40) : [];
  return { contextKeys: names(ctx), requestKeys: names(ctx?.request), metadataKeys: names(ctx?.metadata),
    serverIpAvailable: false, ipStatus: 'No documented trusted client-IP field. Context names are diagnostic only.' };
}
