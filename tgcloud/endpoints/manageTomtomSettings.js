import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { systemSettings } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';

const SETTING_KEY = 'tomtom_api_key';

export default async function (input, ctx) {
  await requireAdmin(ctx);
  const action = String(input?.action || 'status');
  const row = await db.select({ value: systemSettings.value }).from(systemSettings)
    .where(eq(systemSettings.key, SETTING_KEY)).get();

  if (action === 'status') {
    const value = row?.value;
    const apiKey = typeof value === 'string' ? value : value && typeof value === 'object' ? value.apiKey : '';
    return { configured: typeof apiKey === 'string' && apiKey.trim().length > 0 };
  }
  if (action === 'disconnect') {
    await db.delete(systemSettings).where(eq(systemSettings.key, SETTING_KEY)).run();
    return { configured: false };
  }
  if (action !== 'set') throw new EndpointError('Unsupported routing settings action.', { code: 'INVALID_ACTION' });

  const apiKey = String(input?.apiKey || '').trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(apiKey)) {
    throw new EndpointError('Enter a valid routing API key.', { code: 'INVALID_INPUT' });
  }
  await db.insert(systemSettings).values({ key: SETTING_KEY, value: { apiKey }, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: { apiKey }, updatedAt: new Date() } }).run();
  return { configured: true };
}
