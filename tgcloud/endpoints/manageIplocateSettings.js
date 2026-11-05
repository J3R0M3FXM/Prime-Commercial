import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { systemSettings } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';

const SETTING_KEY = 'iplocate_api_key';

function keyValue(value) {
  return typeof value === 'string' ? value : value && typeof value === 'object' ? value.apiKey : '';
}

export default async function (input, ctx) {
  await requireAdmin(ctx);
  const action = String(input?.action || 'status');
  const row = await db.select({ value: systemSettings.value }).from(systemSettings)
    .where(eq(systemSettings.key, SETTING_KEY)).get();
  if (action === 'status') return { configured: typeof keyValue(row?.value) === 'string' && keyValue(row?.value).trim().length > 0 };
  if (action !== 'set') throw new EndpointError('Unsupported IPLocate.io settings action.', { code: 'INVALID_ACTION' });

  const apiKey = String(input?.apiKey || '').trim();
  if (apiKey.length < 8 || apiKey.length > 512 || /\s/.test(apiKey)) {
    throw new EndpointError('Enter a valid IPLocate.io API key.', { code: 'INVALID_INPUT' });
  }
  await db.insert(systemSettings).values({ key: SETTING_KEY, value: { apiKey }, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: { apiKey }, updatedAt: new Date() } }).run();
  return { configured: true };
}
