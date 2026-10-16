import { db, EndpointError } from 'sdk';
import { asc, eq, and, ne } from 'sdk/db';
import { warehouses } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';

const writable = new Set(['name', 'code', 'address', 'isActive', 'sortOrder', 'isDefault', 'latitude', 'longitude']);

function normalize(input, creating) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new EndpointError('Invalid warehouse payload.', { code: 'INVALID_INPUT' });
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'action' || key === 'id') continue;
    if (!writable.has(key)) throw new EndpointError('Unsupported warehouse field: ' + key, { code: 'INVALID_FIELD' });
    if (key === 'name') {
      if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new EndpointError('name must be a non-empty string of at most 160 characters.', { code: 'INVALID_INPUT' });
      output.name = value.trim();
    } else if (key === 'code' || key === 'address') {
      if (value !== null && typeof value !== 'string') throw new EndpointError(key + ' must be text or null.', { code: 'INVALID_INPUT' });
      output[key] = value;
    } else if (key === 'isActive' || key === 'isDefault') {
      if (typeof value !== 'boolean') throw new EndpointError(key + ' must be a boolean.', { code: 'INVALID_INPUT' });
      output[key] = value;
    } else if (key === 'sortOrder') {
      const n = Number(value);
      if (!Number.isSafeInteger(n)) throw new EndpointError('sortOrder must be an integer.', { code: 'INVALID_INPUT' });
      output.sortOrder = n;
    } else if (key === 'latitude' || key === 'longitude') {
      if (value === null || value === '') output[key] = null;
      else {
        const n = Number(value);
        const min = key === 'latitude' ? -90 : -180;
        const max = key === 'latitude' ? 90 : 180;
        if (!Number.isFinite(n) || n < min || n > max) throw new EndpointError(key + ' is out of range.', { code: 'INVALID_INPUT' });
        output[key] = n;
      }
    }
  }
  if (creating && !Object.hasOwn(output, 'name')) throw new EndpointError('name is required.', { code: 'INVALID_INPUT' });
  if (!creating && Object.keys(output).length === 0) throw new EndpointError('No editable warehouse fields supplied.', { code: 'INVALID_INPUT' });
  output.updatedAt = new Date();
  return output;
}

async function ensureDefaultAvailable(isDefault, id) {
  if (!isDefault) return;
  const currentDefault = await db.select({ id: warehouses.id })
    .from(warehouses)
    .where(eq(warehouses.isDefault, true))
    .get();
  if (currentDefault && currentDefault.id !== id) {
    throw new EndpointError('Another warehouse is already the default. Unset it before selecting a different default.', { code: 'DEFAULT_WAREHOUSE_EXISTS' });
  }
}

export default async function (input, ctx) {
  await requireAdmin(ctx);
  const action = input?.action;

  if (action === 'list') return await db.select().from(warehouses).orderBy(asc(warehouses.sortOrder)).all();

  if (action === 'create') {
    const values = normalize(input, true);
    await ensureDefaultAvailable(values.isDefault === true, null);
    values.createdAt = new Date();
    const [warehouse] = await db.insert(warehouses).values(values).returning().run();
    return { success: true, warehouse };
  }

  if (action === 'update') {
    if (typeof input?.id !== 'string' || !input.id.trim()) throw new EndpointError('A warehouse ID is required.', { code: 'INVALID_INPUT' });
    const values = normalize(input, false);
    await ensureDefaultAvailable(values.isDefault === true, input.id);
    const [warehouse] = await db.update(warehouses).set(values).where(eq(warehouses.id, input.id)).returning().run();
    if (!warehouse) throw new EndpointError('Warehouse not found.', { code: 'NOT_FOUND' });
    return { success: true, warehouse };
  }

  if (action === 'delete') {
    if (typeof input?.id !== 'string' || !input.id.trim()) throw new EndpointError('A warehouse ID is required.', { code: 'INVALID_INPUT' });
    const [deleted] = await db.delete(warehouses).where(eq(warehouses.id, input.id)).returning().run();
    if (!deleted) throw new EndpointError('Warehouse not found.', { code: 'NOT_FOUND' });
    return { success: true, id: deleted.id };
  }

  throw new EndpointError('Unsupported warehouse action.', { code: 'INVALID_ACTION' });
}
