import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { systemSettings } from '../schema.js';

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

  const configured = row?.value;
  const adminId = typeof configured === 'string' || typeof configured === 'number'
    ? String(configured).trim()
    : configured && typeof configured === 'object' && configured.userId != null
      ? String(configured.userId).trim()
      : '';

  if (!adminId || !/^[0-9]+$/.test(adminId) || userId !== adminId) {
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
