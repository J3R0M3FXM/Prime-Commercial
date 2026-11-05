import { db, EndpointError } from 'sdk';
import { eq, inArray } from 'sdk/db';
import { systemSettings } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';

const TAGGUN_SETTING_KEY = 'receipt_ocr_taggun_api_key';
const GOOGLE_SETTING_KEY = 'receipt_ocr_google_vision_api_key';
const OCR_SPACE_SETTING_KEY = 'receipt_ocr_space_api_key';
const PROVIDER_SETTING_KEY = 'receipt_ocr_provider';

function secretValue(row) {
  return typeof row?.value === 'string' ? row.value : row?.value?.apiKey;
}

export default async function (input, ctx) {
  await requireAdmin(ctx);
  const action = String(input?.action || 'status');
  const rows = await db.select().from(systemSettings)
    .where(inArray(systemSettings.key, [TAGGUN_SETTING_KEY, GOOGLE_SETTING_KEY, OCR_SPACE_SETTING_KEY, PROVIDER_SETTING_KEY])).all();
  const byKey = new Map((rows || []).map((row) => [String(row.key), row]));
  const taggunConfigured = typeof secretValue(byKey.get(TAGGUN_SETTING_KEY)) === 'string' && secretValue(byKey.get(TAGGUN_SETTING_KEY)).trim().length > 0;
  const googleVisionConfigured = typeof secretValue(byKey.get(GOOGLE_SETTING_KEY)) === 'string' && secretValue(byKey.get(GOOGLE_SETTING_KEY)).trim().length > 0;
  const ocrSpaceConfigured = typeof secretValue(byKey.get(OCR_SPACE_SETTING_KEY)) === 'string' && secretValue(byKey.get(OCR_SPACE_SETTING_KEY)).trim().length > 0;
  const configured = ocrSpaceConfigured || taggunConfigured;
  const providerRow = byKey.get(PROVIDER_SETTING_KEY)?.value;
  const activeProvider = String(providerRow?.provider || (ocrSpaceConfigured ? 'ocr_space' : taggunConfigured ? 'taggun' : 'ocr_space'));

  if (action === 'status') {
    return { provider: activeProvider, configured, taggunConfigured, googleVisionConfigured, ocrSpaceConfigured };
  }
  if (action === 'selectTaggun') {
    if (!taggunConfigured) throw new EndpointError('Save a Taggun API key before selecting Taggun.', { code: 'TAGGUN_NOT_CONFIGURED' });
    await db.insert(systemSettings).values({ key: PROVIDER_SETTING_KEY, value: { provider: 'taggun' }, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: { provider: 'taggun' }, updatedAt: new Date() } }).run();
    return { success: true, provider: 'taggun', configured: true, taggunConfigured, ocrSpaceConfigured };
  }
  if (action === 'disconnectTaggun') {
    await db.delete(systemSettings).where(eq(systemSettings.key, TAGGUN_SETTING_KEY)).run();
    await db.insert(systemSettings).values({ key: PROVIDER_SETTING_KEY, value: { provider: 'ocr_space' }, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: { provider: 'ocr_space' }, updatedAt: new Date() } }).run();
    return { success: true, provider: 'ocr_space', configured: ocrSpaceConfigured, taggunConfigured: false };
  }
  if (action === 'disconnectGoogleVision') {
    await db.delete(systemSettings).where(eq(systemSettings.key, GOOGLE_SETTING_KEY)).run();
    return { success: true, provider: 'ocr_space', configured: ocrSpaceConfigured, googleVisionConfigured: false };
  }
  if (action === 'setTaggun') {
    const apiKey = String(input?.apiKey || '').trim();
    if (apiKey.length < 12 || apiKey.length > 512 || /\s/.test(apiKey)) {
      throw new EndpointError('Enter a valid Taggun API key.', { code: 'INVALID_INPUT' });
    }
    await db.insert(systemSettings).values({ key: TAGGUN_SETTING_KEY, value: { apiKey }, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: { apiKey }, updatedAt: new Date() } }).run();
    await db.insert(systemSettings).values({ key: PROVIDER_SETTING_KEY, value: { provider: 'taggun' }, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: { provider: 'taggun' }, updatedAt: new Date() } }).run();
    return { success: true, provider: 'taggun', configured: true, taggunConfigured: true, ocrSpaceConfigured };
  }
  if (action !== 'set') throw new EndpointError('Unsupported OCR settings action.', { code: 'INVALID_ACTION' });

  const selectedProvider = 'ocr_space';
  if (input?.provider && String(input.provider).trim().toLowerCase() !== selectedProvider) throw new EndpointError('Only OCR.space is currently supported for receipt scanning.', { code: 'INVALID_INPUT' });
  const apiKey = String(input?.apiKey || '').trim();
  if (apiKey.length < 12 || apiKey.length > 512 || /\s/.test(apiKey)) {
    throw new EndpointError('Enter a valid OCR.space API key.', { code: 'INVALID_INPUT' });
  }
  await db.insert(systemSettings).values({ key: OCR_SPACE_SETTING_KEY, value: { apiKey }, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: { apiKey }, updatedAt: new Date() } }).run();
  await db.insert(systemSettings).values({ key: PROVIDER_SETTING_KEY, value: { provider: selectedProvider }, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: { provider: selectedProvider }, updatedAt: new Date() } }).run();
  return { success: true, provider: selectedProvider, configured: true };
}
