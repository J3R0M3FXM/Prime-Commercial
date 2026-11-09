import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { customers } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';
import { ensureDeviceSecurityTables, recordDeviceSession, persistFingerprintHistory, readDeviceSecurity, sharedDeviceAccounts, normalizeReportedIp, runtimeCapabilities } from '../lib/device-security.js';

export default async function (input = {}, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]+$/.test(telegramId)) throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  const action = String(input.action || 'list');
  if (action === 'capabilities') { await requireAdmin(ctx); return runtimeCapabilities(ctx); }
  if (action === 'staffDetail') {
    await requireAdmin(ctx);
    const customerId = typeof input.customerId === 'string' ? input.customerId.trim().slice(0, 128) : '';
    const customer = customerId ? await db.select().from(customers).where(eq(customers.id, customerId)).get() : null;
    if (!customer?.tgUserId) throw new EndpointError('Customer not found.', { code: 'NOT_FOUND' });
    const data = await readDeviceSecurity(String(customer.tgUserId));
    return { ...data, sharedAccounts: await sharedDeviceAccounts(String(customer.tgUserId)) };
  }
  const customer = await db.select().from(customers).where(eq(customers.tgUserId, telegramId)).get();
  if (!customer || customer.isBanned === true) throw new EndpointError('This account is unavailable.', { code: 'ACCOUNT_UNAVAILABLE' });
  if (action === 'list') return readDeviceSecurity(telegramId);
  if (action === 'record') {
    const fingerprint = input.fingerprint;
    if (!fingerprint || Array.isArray(fingerprint) || typeof fingerprint !== 'object' || JSON.stringify(fingerprint).length > 12000)
      throw new EndpointError('Invalid device signals.', { code: 'INVALID_SIGNALS' });
    const result = await recordDeviceSession(telegramId, fingerprint);
    await persistFingerprintHistory(String(customer.id), fingerprint);
    return result;
  }
  if (!['network', 'location'].includes(action)) throw new EndpointError('Unsupported device action.', { code: 'INVALID_ACTION' });
  if (input.consent !== true) throw new EndpointError('Select the network or location check to continue.', { code: 'CONSENT_REQUIRED' });
  const sessionId = typeof input.sessionId === 'string' ? input.sessionId : '';
  if (!/^[0-9a-f]{64}$/.test(sessionId)) throw new EndpointError('Refresh your device session first.', { code: 'INVALID_SESSION' });
  await ensureDeviceSecurityTables();
  const session = await db.get('SELECT device_registration_id AS deviceId FROM device_security_sessions WHERE id=:id AND telegram_user_id=:owner', { ':id': sessionId, ':owner': telegramId });
  if (!session) throw new EndpointError('Device session not found.', { code: 'NOT_FOUND' });
  const now = Math.floor(Date.now() / 1000);
  const params = { ':id': sessionId, ':owner': telegramId, ':now': now };
  if (action === 'network') {
    const ip = normalizeReportedIp(input.reportedIp);
    if (!ip) throw new EndpointError('A valid public IP response is required.', { code: 'INVALID_IP' });
    await db.run("UPDATE device_security_sessions SET reported_ip=:ip,ip_source='Browser-Reported',last_seen_at=:now WHERE id=:id AND telegram_user_id=:owner", { ...params, ':ip': ip });
    return { saved: true, source: 'Browser-Reported', trustedServerIp: false };
  }
  const lat = input.latitude, lon = input.longitude, accuracy = input.accuracy;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180 ||
      (accuracy != null && (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000)))
    throw new EndpointError('A valid location reading is required.', { code: 'INVALID_LOCATION' });
  // Check coordinates only in memory. No exact location or route history is persisted.
  await db.run("UPDATE device_security_sessions SET location_checked_at=:now,location_accuracy=:accuracy,location_source='User-Shared Device Location',last_seen_at=:now WHERE id=:id AND telegram_user_id=:owner", { ...params, ':accuracy': accuracy ?? null });
  return { saved: true, checkedAt: now, accuracy: accuracy ?? null, preciseCoordinatesStored: false, source: 'User-Shared Device Location' };
}
