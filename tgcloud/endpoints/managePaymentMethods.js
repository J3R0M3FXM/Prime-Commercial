import { db, EndpointError } from 'sdk';
import { asc, eq } from 'sdk/db';
import { paymentMethods } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';

const stringFields = new Set(['name', 'logo', 'paymentType', 'qrCodeImage', 'webhookUrl', 'publicKey', 'secretKey', 'walletAddress', 'accountName', 'accountNumber']);
const writable = new Set([...stringFields, 'sortOrder', 'isActive']);

function normalize(input, creating) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new EndpointError('Invalid payment method payload.', { code: 'INVALID_INPUT' });
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'action' || key === 'id') continue;
    if (!writable.has(key)) throw new EndpointError('Unsupported payment method field: ' + key, { code: 'INVALID_FIELD' });
    if (stringFields.has(key)) {
      if (typeof value !== 'string' && value !== null) throw new EndpointError(key + ' must be text.', { code: 'INVALID_INPUT' });
      const normalized = value == null ? '' : value.trim();
      if ((key === 'name' || key === 'paymentType') && !normalized) throw new EndpointError(key + ' is required.', { code: 'INVALID_INPUT' });
      if (normalized.length > 4000) throw new EndpointError(key + ' is too long.', { code: 'INVALID_INPUT' });
      if (key === 'secretKey' && !normalized) continue; // never erase an existing secret by submitting a blank masked field
      output[key] = normalized;
    } else if (key === 'sortOrder') {
      const n = Number(value);
      if (!Number.isSafeInteger(n)) throw new EndpointError('sortOrder must be an integer.', { code: 'INVALID_INPUT' });
      output.sortOrder = n;
    } else if (key === 'isActive') {
      if (typeof value !== 'boolean') throw new EndpointError('isActive must be a boolean.', { code: 'INVALID_INPUT' });
      output.isActive = value;
    }
  }
  if (creating && (!output.name || !output.paymentType)) throw new EndpointError('name and paymentType are required.', { code: 'INVALID_INPUT' });
  if (!creating && Object.keys(output).length === 0) throw new EndpointError('No editable fields supplied.', { code: 'INVALID_INPUT' });
  output.updatedAt = new Date();
  return output;
}

function publicAdminView(row) {
  const { secretKey, ...safe } = row;
  return { ...safe, secretKeyConfigured: Boolean(secretKey) };
}

export default async function (input, ctx) {
  await requireAdmin(ctx);
  const action = input?.action;

  if (action === 'list') {
    const rows = await db.select().from(paymentMethods).orderBy(asc(paymentMethods.sortOrder)).all();
    return rows.map(publicAdminView);
  }

  if (action === 'create') {
    const values = normalize(input, true);
    values.createdAt = new Date();
    const [created] = await db.insert(paymentMethods).values(values).returning().run();
    return { success: true, paymentMethod: publicAdminView(created) };
  }

  if (action === 'update') {
    if (typeof input?.id !== 'string' || !input.id.trim()) throw new EndpointError('A payment method ID is required.', { code: 'INVALID_INPUT' });
    const values = normalize(input, false);
    const [updated] = await db.update(paymentMethods).set(values).where(eq(paymentMethods.id, input.id)).returning().run();
    if (!updated) throw new EndpointError('Payment method not found.', { code: 'NOT_FOUND' });
    return { success: true, paymentMethod: publicAdminView(updated) };
  }

  if (action === 'reorder') {
    if (!Array.isArray(input?.reorder) || input.reorder.length > 100) throw new EndpointError('reorder must be an array of at most 100 items.', { code: 'INVALID_INPUT' });
    const seen = new Set();
    for (const item of input.reorder) {
      if (!item || typeof item.id !== 'string' || !item.id.trim() || !Number.isSafeInteger(item.sortOrder) || seen.has(item.id)) {
        throw new EndpointError('Each reorder item needs a unique ID and integer sortOrder.', { code: 'INVALID_INPUT' });
      }
      seen.add(item.id);
    }
    for (const item of input.reorder) {
      const result = await db.update(paymentMethods).set({ sortOrder: item.sortOrder, updatedAt: new Date() }).where(eq(paymentMethods.id, item.id)).returning().run();
      if (!result[0]) throw new EndpointError('Payment method not found while reordering: ' + item.id, { code: 'NOT_FOUND' });
    }
    return { success: true, message: 'Order updated' };
  }

  if (action === 'delete') {
    if (typeof input?.id !== 'string' || !input.id.trim()) throw new EndpointError('A payment method ID is required.', { code: 'INVALID_INPUT' });
    const [deleted] = await db.delete(paymentMethods).where(eq(paymentMethods.id, input.id)).returning().run();
    if (!deleted) throw new EndpointError('Payment method not found.', { code: 'NOT_FOUND' });
    return { success: true, id: deleted.id };
  }

  throw new EndpointError('Unsupported payment method action.', { code: 'INVALID_ACTION' });
}
