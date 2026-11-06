import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { systemSettings } from '../schema.js';

export function configuredAdminIds(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => entry && typeof entry === 'object' ? entry.userId ?? entry.id : entry)
      .map((entry) => String(entry ?? '').trim())
      .filter((entry) => /^[0-9]+$/.test(entry));
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value).trim();
    return /^[0-9]+$/.test(id) ? [id] : [];
  }
  if (value && typeof value === 'object' && value.userId != null) {
    const id = String(value.userId).trim();
    return /^[0-9]+$/.test(id) ? [id] : [];
  }
  return [];
}

/**
 * Telegram Serverless verifies Mini App initData before invoking an endpoint.
 * Admin access is then restricted to the configured Telegram user ID stored as
 * a JSON scalar in system_settings. Missing/malformed configuration fails shut.
 * Never trust an admin flag supplied by the Mini App.
 */
export async function requireAdmin(ctx) {
  const user = ctx?.initData?.user;
  const userId = user?.id == null ? '' : String(user.id);
  if (!/^[0-9]+$/.test(userId)) {
    throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  }

  const row = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, 'admin_telegram_user_id'))
    .get();

  const adminIds = configuredAdminIds(row?.value);

  if (!adminIds.includes(userId)) {
    throw new EndpointError('Admin access required.', { code: 'ADMIN_REQUIRED' });
  }

  return user;
}


export async function isAdminUser(ctx) {
  try {
    await requireAdmin(ctx);
    return true;
  } catch {
    return false;
  }
}
