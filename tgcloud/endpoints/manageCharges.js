import { db, EndpointError } from 'sdk';
import { asc, eq } from 'sdk/db';
import { charges } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';

const writable = new Set(['name', 'type', 'rate', 'isActive', 'sortOrder', 'description']);

function normalize(input, creating) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new EndpointError('Invalid charge payload.', { code: 'INVALID_INPUT' });
  }

  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'action' || key === 'id') continue;
    if (!writable.has(key)) {
      throw new EndpointError('Unsupported charge field: ' + key, { code: 'INVALID_FIELD' });
    }
    if (key === 'name' || key === 'type') {
      if (typeof value !== 'string' || !value.trim() || value.length > 120) {
        throw new EndpointError(key + ' must be a non-empty string of at most 120 characters.', { code: 'INVALID_INPUT' });
      }
      output[key] = value.trim();
    } else if (key === 'description') {
      if (value !== null && typeof value !== 'string') {
        throw new EndpointError('description must be text or null.', { code: 'INVALID_INPUT' });
      }
      output[key] = value;
    } else if (key === 'rate') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        throw new EndpointError('rate must be a finite non-negative number.', { code: 'INVALID_INPUT' });
      }
      output.rate = n;
    } else if (key === 'sortOrder') {
      const n = Number(value);
      if (!Number.isSafeInteger(n)) {
        throw new EndpointError('sortOrder must be an integer.', { code: 'INVALID_INPUT' });
      }
      output.sortOrder = n;
    } else if (key === 'isActive') {
      if (typeof value !== 'boolean') {
        throw new EndpointError('isActive must be a boolean.', { code: 'INVALID_INPUT' });
      }
      output.isActive = value;
    }
  }

  if (creating && (!Object.hasOwn(output, 'name') || !Object.hasOwn(output, 'type') || !Object.hasOwn(output, 'rate'))) {
    throw new EndpointError('name, type, and rate are required.', { code: 'INVALID_INPUT' });
  }
  if (!creating && Object.keys(output).length === 0) {
    throw new EndpointError('No editable charge fields supplied.', { code: 'INVALID_INPUT' });
  }
  output.updatedAt = new Date();
  return output;
}

/**
 * Admin-only CRUD for the charge configurator. The allowlist intentionally
 * excludes IDs and timestamps from client control.
 * Input: { action: 'list'|'create'|'update'|'delete', id?, name?, type?, rate?, ... }
 */
export default async function (input, ctx) {
  await requireAdmin(ctx);
  const action = input?.action;

  if (action === 'list') {
    return await db.select().from(charges).orderBy(asc(charges.sortOrder)).all();
  }

  if (action === 'create') {
    const values = normalize(input, true);
    values.createdAt = new Date();
    const [created] = await db.insert(charges).values(values).returning().run();
    return { success: true, charge: created };
  }

  if (action === 'update') {
    if (typeof input?.id !== 'string' || !input.id.trim()) {
      throw new EndpointError('A charge ID is required for update.', { code: 'INVALID_INPUT' });
    }
    const values = normalize(input, false);
    const [updated] = await db.update(charges).set(values).where(eq(charges.id, input.id)).returning().run();
    if (!updated) throw new EndpointError('Charge not found.', { code: 'NOT_FOUND' });
    return { success: true, charge: updated };
  }

  if (action === 'delete') {
    if (typeof input?.id !== 'string' || !input.id.trim()) {
      throw new EndpointError('A charge ID is required for delete.', { code: 'INVALID_INPUT' });
    }
    const [deleted] = await db.delete(charges).where(eq(charges.id, input.id)).returning().run();
    if (!deleted) throw new EndpointError('Charge not found.', { code: 'NOT_FOUND' });
    return { success: true, id: deleted.id };
  }

  throw new EndpointError('Unsupported charge action.', { code: 'INVALID_ACTION' });
}
