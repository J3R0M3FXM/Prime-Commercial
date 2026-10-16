import { db, EndpointError } from 'sdk';
import { asc, eq } from 'sdk/db';
import { couriers } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';

const textFields = new Set(['name', 'trackingUrlPattern', 'logo', 'type']);
const numericFields = new Set(['baseFare', 'firstMile', 'firstMileFee', 'exceedingKmFee', 'surcharge', 'nightDifferential']);
const writable = new Set([...textFields, ...numericFields, 'isActive', 'sortOrder']);

function normalize(input, creating) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new EndpointError('Invalid courier payload.', { code: 'INVALID_INPUT' });
  }
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'action' || key === 'id') continue;
    if (!writable.has(key)) throw new EndpointError('Unsupported courier field: ' + key, { code: 'INVALID_FIELD' });
    if (textFields.has(key)) {
      if (key === 'name' || key === 'type') {
        if (typeof value !== 'string' || !value.trim() || value.length > 160) {
          throw new EndpointError(key + ' must be a non-empty string of at most 160 characters.', { code: 'INVALID_INPUT' });
        }
        output[key] = value.trim();
      } else {
        if (value !== null && typeof value !== 'string') throw new EndpointError(key + ' must be text or null.', { code: 'INVALID_INPUT' });
        output[key] = value;
      }
    } else if (numericFields.has(key)) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) throw new EndpointError(key + ' must be a finite non-negative number.', { code: 'INVALID_INPUT' });
      output[key] = n;
    } else if (key === 'sortOrder') {
      const n = Number(value);
      if (!Number.isSafeInteger(n)) throw new EndpointError('sortOrder must be an integer.', { code: 'INVALID_INPUT' });
      output[key] = n;
    } else if (key === 'isActive') {
      if (typeof value !== 'boolean') throw new EndpointError('isActive must be a boolean.', { code: 'INVALID_INPUT' });
      output[key] = value;
    }
  }
  if (creating && (!Object.hasOwn(output, 'name') || !Object.hasOwn(output, 'type'))) {
    throw new EndpointError('name and type are required.', { code: 'INVALID_INPUT' });
  }
  if (!creating && Object.keys(output).length === 0) throw new EndpointError('No editable courier fields supplied.', { code: 'INVALID_INPUT' });
  output.updatedAt = new Date();
  return output;
}

export default async function (input, ctx) {
  await requireAdmin(ctx);
  const action = input?.action;

  if (action === 'list') return await db.select().from(couriers).orderBy(asc(couriers.sortOrder)).all();

  if (action === 'create') {
    const values = normalize(input, true);
    values.createdAt = new Date();
    const [courier] = await db.insert(couriers).values(values).returning().run();
    return { success: true, courier };
  }

  if (action === 'update') {
    if (typeof input?.id !== 'string' || !input.id.trim()) throw new EndpointError('A courier ID is required.', { code: 'INVALID_INPUT' });
    const values = normalize(input, false);
    const [courier] = await db.update(couriers).set(values).where(eq(couriers.id, input.id)).returning().run();
    if (!courier) throw new EndpointError('Courier not found.', { code: 'NOT_FOUND' });
    return { success: true, courier };
  }

  if (action === 'delete') {
    if (typeof input?.id !== 'string' || !input.id.trim()) throw new EndpointError('A courier ID is required.', { code: 'INVALID_INPUT' });
    const [deleted] = await db.delete(couriers).where(eq(couriers.id, input.id)).returning().run();
    if (!deleted) throw new EndpointError('Courier not found.', { code: 'NOT_FOUND' });
    return { success: true, id: deleted.id };
  }

  throw new EndpointError('Unsupported courier action.', { code: 'INVALID_ACTION' });
}
