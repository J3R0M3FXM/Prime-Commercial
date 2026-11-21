import { db } from 'sdk';
import { accountHistory } from '../schema.js';

function clean(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

export async function recordAccountChanges({ customerId, telegramUserId, changes, eventType = 'profile_changed', details = {} }) {
  const rows = (Array.isArray(changes) ? changes : []).filter(change => change?.fieldName)
    .map(change => ({
      customerId: String(customerId), telegramUserId: String(telegramUserId), eventType,
      fieldName: String(change.fieldName), previousValue: clean(change.previousValue), nextValue: clean(change.nextValue), details,
    }));
  if (!rows.length) return 0;
  await db.insert(accountHistory).values(rows).run();
  return rows.length;
}

