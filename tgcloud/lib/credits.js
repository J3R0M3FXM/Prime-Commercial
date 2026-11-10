import { db } from 'sdk';

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new TypeError('Invalid Store Credits amount.');
  return Math.round(amount * 100) / 100;
}

/**
 * Reserve credits and mark the owning checkout operation in one conditional
 * SQLite UPDATE. A customer can have only one in-flight credit reservation;
 * the order ledger must reconcile/finalize the prior operation before another
 * operation is allowed to reserve credits.
 */
export async function reserveStoreCredits({ customerId, operationId, amount }) {
  const customer = String(customerId || '').trim();
  const operation = String(operationId || '').trim();
  const requested = normalizeAmount(amount);
  if (!customer || !operation) throw new TypeError('Customer and checkout operation IDs are required.');
  if (requested === 0) return { reserved: true, reused: false, amount: 0, receivedUsed: 0 };

  const persisted = await db.get(`SELECT store_credits_used AS amount, received_transfer_used AS receivedUsed
    FROM orders WHERE id=:operation_id AND customer_id=:customer_id`, { ':operation_id': operation, ':customer_id': customer });
  if (persisted) return Math.round(Number(persisted.amount || 0) * 100) === Math.round(requested * 100)
    ? { reserved: true, reused: true, amount: requested, receivedUsed: Number(persisted.receivedUsed) || 0 }
    : { reserved: false, reason: 'operation_amount_conflict' };

  const existing = await db.get(
    `SELECT store_credits AS balance,
            store_credits_operation_id AS operationId,
            store_credits_operation_amount AS operationAmount,
            store_credits_operation_received_amount AS receivedUsed
       FROM customers WHERE id = :customer_id`,
    { ':customer_id': customer },
  );
  if (!existing) return { reserved: false, reason: 'customer_missing' };
  if (existing.operationId === operation) {
    const sameAmount = Math.round(Number(existing.operationAmount || 0) * 100) === Math.round(requested * 100);
    return sameAmount
      ? { reserved: true, reused: true, amount: requested, balance: Number(existing.balance) || 0, receivedUsed: Number(existing.receivedUsed) || 0 }
      : { reserved: false, reason: 'operation_amount_conflict' };
  }
  if (existing.operationId) return { reserved: false, reason: 'another_operation_in_flight' };

  const result = await db.run(
    `UPDATE customers
        SET store_credits = store_credits - :amount,
            store_credits_operation_id = :operation_id,
            store_credits_operation_amount = :amount,
            store_credits_operation_received_amount = min(coalesce(received_transfer_balance, 0), :amount),
            received_transfer_balance = coalesce(received_transfer_balance, 0) - min(coalesce(received_transfer_balance, 0), :amount),
            updated_at = unixepoch()
      WHERE id = :customer_id
        AND store_credits_operation_id IS NULL
        AND coalesce(store_credits, 0) >= :amount
        AND EXISTS (SELECT 1 FROM checkout_operations o
          WHERE o.id = :operation_id AND o.status = 'processing')
        AND NOT EXISTS (SELECT 1 FROM orders WHERE id = :operation_id)
      RETURNING store_credits AS balance, store_credits_operation_id AS operationId,
                store_credits_operation_amount AS operationAmount,
                store_credits_operation_received_amount AS receivedUsed`,
    { ':customer_id': customer, ':operation_id': operation, ':amount': requested },
  );
  if (Number(result?.rowsAffected) > 0) {
    const row = result.rows?.[0] || {};
    return { reserved: true, reused: false, amount: requested, balance: Number(row.balance) || 0, receivedUsed: Number(row.receivedUsed) || 0 };
  }

  // A concurrent retry of this same operation may have won the conditional update.
  const after = await db.get(
    `SELECT store_credits AS balance,
            store_credits_operation_id AS operationId,
            store_credits_operation_amount AS operationAmount,
            store_credits_operation_received_amount AS receivedUsed
       FROM customers WHERE id = :customer_id`,
    { ':customer_id': customer },
  );
  if (after?.operationId === operation &&
      Math.round(Number(after.operationAmount || 0) * 100) === Math.round(requested * 100)) {
    return { reserved: true, reused: true, amount: requested, balance: Number(after.balance) || 0, receivedUsed: Number(after.receivedUsed) || 0 };
  }
  return {
    reserved: false,
    reason: after?.operationId ? 'another_operation_in_flight' : 'insufficient_store_credits',
  };
}

/** Clear a reservation only after its order is durably persisted. */
export async function finalizeStoreCredits({ customerId, operationId }) {
  const customer = String(customerId || '').trim();
  const operation = String(operationId || '').trim();
  if (!customer || !operation) throw new TypeError('Customer and checkout operation IDs are required.');
  const result = await db.run(
    `UPDATE customers
        SET store_credits_operation_id = NULL,
            store_credits_operation_amount = 0,
            store_credits_operation_received_amount = 0,
            updated_at = unixepoch()
      WHERE id = :customer_id AND store_credits_operation_id = :operation_id`,
    { ':customer_id': customer, ':operation_id': operation },
  );
  if (Number(result?.rowsAffected) > 0) return { finalized: true, alreadyFinalized: false };
  const row = await db.get(
    `SELECT store_credits_operation_id AS operationId FROM customers WHERE id = :customer_id`,
    { ':customer_id': customer },
  );
  return row && !row.operationId
    ? { finalized: true, alreadyFinalized: true }
    : { finalized: false, reason: row ? 'operation_mismatch' : 'customer_missing' };
}

/** Return reserved credits exactly once during a recorded pre-order compensation. */
export async function compensateStoreCredits({ customerId, operationId }) {
  const customer = String(customerId || '').trim();
  const operation = String(operationId || '').trim();
  if (!customer || !operation) throw new TypeError('Customer and checkout operation IDs are required.');
  const result = await db.run(
    `UPDATE customers
        SET store_credits = coalesce(store_credits, 0) + store_credits_operation_amount,
            received_transfer_balance = coalesce(received_transfer_balance, 0) + coalesce(store_credits_operation_received_amount, 0),
            store_credits_operation_id = NULL,
            store_credits_operation_amount = 0,
            store_credits_operation_received_amount = 0,
            updated_at = unixepoch()
      WHERE id = :customer_id AND store_credits_operation_id = :operation_id
      RETURNING store_credits AS balance`,
    { ':customer_id': customer, ':operation_id': operation },
  );
  if (Number(result?.rowsAffected) > 0) {
    return { compensated: true, alreadyCompensated: false, balance: Number(result.rows?.[0]?.balance) || 0 };
  }
  const row = await db.get(
    `SELECT store_credits AS balance, store_credits_operation_id AS operationId
       FROM customers WHERE id = :customer_id`,
    { ':customer_id': customer },
  );
  return row && !row.operationId
    ? { compensated: true, alreadyCompensated: true, balance: Number(row.balance) || 0 }
    : { compensated: false, reason: row ? 'operation_mismatch' : 'customer_missing' };
}
