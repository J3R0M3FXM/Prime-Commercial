import { db } from 'sdk';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) output[key] = stableValue(value[key]);
    }
    return output;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}

export function canonicalRequest(value) {
  const normalized = stableValue(value);
  if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
    delete normalized.expectedPayableNow;
    delete normalized.expectedPayableOnDelivery;
    delete normalized.expectedTotalAmount;
  }
  return JSON.stringify(normalized);
}

function parseJson(value, fallback = null) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

function operationRecord(existing) {
  if (!existing) return null;
  return {
    ok: true,
    created: false,
    operationId: String(existing.id),
    status: String(existing.status),
    stage: String(existing.stage),
    orderId: existing.orderId || null,
    requestSnapshot: parseJson(existing.requestSnapshot, null),
    canonicalSnapshot: parseJson(existing.canonicalSnapshot, null),
    responseSnapshot: parseJson(existing.responseSnapshot, null),
    expiresAt: Number(existing.expiresAt) || 0,
    createdAt: Number(existing.createdAt) || 0,
    lastError: existing.lastError || null,
  };
}

/** Load an operation by key only within the authenticated customer's scope. */
export async function findCheckoutOperation({ customerId, requestKey }) {
  const customer = String(customerId || '').trim();
  const key = String(requestKey || '').trim();
  if (!customer || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) return { ok: false, reason: 'invalid_operation_identity' };
  const existing = await db.get(
    `SELECT id, request_snapshot AS requestSnapshot, canonical_snapshot AS canonicalSnapshot,
            status, stage, order_id AS orderId, response_snapshot AS responseSnapshot,
            expires_at AS expiresAt, created_at AS createdAt, last_error AS lastError
       FROM checkout_operations WHERE customer_id = :customer_id AND request_key = :request_key`,
    { ':customer_id': customer, ':request_key': key },
  );
  return operationRecord(existing) || { ok: false, reason: 'operation_not_found' };
}

/** Create once by (customer, browser request key), or load the original operation. */
export async function beginCheckoutOperation({ customerId, requestKey, requestSnapshot, expiresAt, submittedAt }) {
  const customer = String(customerId || '').trim();
  const key = String(requestKey || '').trim();
  const expiry = Number(expiresAt);
  if (!customer || !/^[A-Za-z0-9_-]{16,128}$/.test(key) || !Number.isSafeInteger(expiry)) {
    return { ok: false, reason: 'invalid_operation_identity' };
  }
  const canonical = canonicalRequest(requestSnapshot);
  const storedSnapshot = JSON.stringify(stableValue(requestSnapshot));
  const inserted = await db.run(
    `INSERT INTO checkout_operations
       (id, customer_id, request_key, request_canonical, status, stage,
        request_snapshot, expires_at, created_at, updated_at)
     VALUES (lower(hex(randomblob(16))), :customer_id, :request_key, :request_canonical,
             'processing', 'prepared', json(:request_snapshot), :expires_at, :submitted_at, unixepoch())
     ON CONFLICT(customer_id, request_key) DO NOTHING
     RETURNING id, created_at AS createdAt`,
    {
      ':customer_id': customer,
      ':request_key': key,
      ':request_canonical': canonical,
      ':request_snapshot': storedSnapshot,
      ':expires_at': expiry,
      ':submitted_at': Number(submittedAt) || Math.floor(Date.now() / 1000),
    },
  );
  if (Number(inserted?.rowsAffected) > 0) {
    return { ok: true, created: true, operationId: String(inserted.rows?.[0]?.id || ''), createdAt: Number(inserted.rows?.[0]?.createdAt) || Number(submittedAt) || 0 };
  }

  const existing = await db.get(
    `SELECT id, request_canonical AS requestCanonical, status, stage,
            request_snapshot AS requestSnapshot, canonical_snapshot AS canonicalSnapshot, order_id AS orderId,
            response_snapshot AS responseSnapshot, expires_at AS expiresAt,
            created_at AS createdAt, last_error AS lastError
       FROM checkout_operations WHERE customer_id = :customer_id AND request_key = :request_key`,
    { ':customer_id': customer, ':request_key': key },
  );
  if (!existing) return { ok: false, reason: 'operation_conflict' };
  if (existing.requestCanonical !== canonical) return { ok: false, reason: 'request_key_reused_with_different_input' };
  return operationRecord(existing);
}

/** Stage transitions are compare-and-set writes, so concurrent retries cannot rewind progress. */
export async function advanceCheckoutOperation({ operationId, expectedStages, nextStage }) {
  const operation = String(operationId || '').trim();
  const expected = Array.isArray(expectedStages) ? expectedStages.map(String) : [];
  const next = String(nextStage || '').trim();
  if (!operation || !expected.length || !next) throw new TypeError('Invalid checkout stage transition.');
  const placeholders = expected.map((_, index) => ':stage_' + index).join(', ');
  const params = { ':operation_id': operation, ':next_stage': next };
  expected.forEach((stage, index) => { params[':stage_' + index] = stage; });
  const result = await db.run(
    `UPDATE checkout_operations
        SET stage = :next_stage, updated_at = unixepoch()
      WHERE id = :operation_id AND status = 'processing'
        AND stage IN (${placeholders})`,
    params,
  );
  if (Number(result?.rowsAffected) > 0) return { advanced: true, changed: true };
  const row = await db.get(
    `SELECT status, stage FROM checkout_operations WHERE id = :operation_id`,
    { ':operation_id': operation },
  );
  return row && row.stage === next
    ? { advanced: true, changed: false, status: row.status }
    : { advanced: false, reason: row ? 'stage_conflict' : 'operation_missing', stage: row?.stage || null };
}

/** Serialize a customer's checkout work while retaining the operation for recovery. */
export async function acquireCustomerCheckoutLock({ customerId, operationId }) {
  const customer = String(customerId || '').trim();
  const operation = String(operationId || '').trim();
  if (!customer || !operation) throw new TypeError('Customer and checkout operation IDs are required.');
  const result = await db.run(
    `UPDATE customers SET active_checkout_operation_id = :operation_id, updated_at = unixepoch()
      WHERE id = :customer_id
        AND (active_checkout_operation_id IS NULL OR active_checkout_operation_id = :operation_id)
      RETURNING active_checkout_operation_id AS operationId`,
    { ':customer_id': customer, ':operation_id': operation },
  );
  if (Number(result?.rowsAffected) > 0) return { acquired: true, reused: false };
  const row = await db.get(
    `SELECT active_checkout_operation_id AS operationId FROM customers WHERE id = :customer_id`,
    { ':customer_id': customer },
  );
  if (!row) return { acquired: false, reason: 'customer_missing' };
  return row.operationId === operation
    ? { acquired: true, reused: true }
    : { acquired: false, reason: row.operationId ? 'another_operation_in_flight' : 'customer_missing', activeOperationId: row.operationId || null };
}

/** Release the per-customer lock only after operation completion or compensation. */
export async function releaseCustomerCheckoutLock({ customerId, operationId }) {
  const customer = String(customerId || '').trim();
  const operation = String(operationId || '').trim();
  if (!customer || !operation) throw new TypeError('Customer and checkout operation IDs are required.');
  const result = await db.run(
    `UPDATE customers SET active_checkout_operation_id = NULL, updated_at = unixepoch()
      WHERE id = :customer_id AND active_checkout_operation_id = :operation_id`,
    { ':customer_id': customer, ':operation_id': operation },
  );
  if (Number(result?.rowsAffected) > 0) return { released: true, alreadyReleased: false };
  const row = await db.get(
    `SELECT active_checkout_operation_id AS operationId FROM customers WHERE id = :customer_id`,
    { ':customer_id': customer },
  );
  return row && !row.operationId
    ? { released: true, alreadyReleased: true }
    : { released: false, reason: row ? 'operation_mismatch' : 'customer_missing' };
}

/** Freeze the server-recalculated order inputs before the first reservation. */
export async function saveCanonicalCheckoutSnapshot({ operationId, snapshot }) {
  const operation = String(operationId || '').trim();
  if (!operation) throw new TypeError('A checkout operation ID is required.');
  const result = await db.run(
    `UPDATE checkout_operations
        SET canonical_snapshot = json(:snapshot), updated_at = unixepoch()
      WHERE id = :operation_id AND stage = 'prepared' AND canonical_snapshot IS NULL
      RETURNING id`,
    { ':operation_id': operation, ':snapshot': JSON.stringify(stableValue(snapshot)) },
  );
  if (Number(result?.rowsAffected) > 0) return { saved: true, reused: false };
  const row = await db.get(
    `SELECT canonical_snapshot AS canonicalSnapshot, stage
       FROM checkout_operations WHERE id = :operation_id`,
    { ':operation_id': operation },
  );
  return row?.canonicalSnapshot
    ? { saved: true, reused: true, snapshot: parseJson(row.canonicalSnapshot, null) }
    : { saved: false, reason: row ? 'operation_stage_conflict' : 'operation_missing' };
}

export async function finishCheckoutOperation({ operationId, responseSnapshot }) {
  const operation = String(operationId || '').trim();
  if (!operation) throw new TypeError('A checkout operation ID is required.');
  const result = await db.run(
    `UPDATE checkout_operations
        SET status = 'complete', stage = 'complete', response_snapshot = json(:response),
            last_error = NULL, updated_at = unixepoch()
      WHERE id = :operation_id AND (status = 'processing' OR status = 'complete')
      RETURNING id`,
    { ':operation_id': operation, ':response': JSON.stringify(stableValue(responseSnapshot)) },
  );
  if (Number(result?.rowsAffected) > 0) return { finished: true };
  return { finished: false, reason: 'operation_missing' };
}

/** Fence forward processing before compensating any pre-order side effects. */
export async function beginCheckoutCompensation({ operationId, message }) {
  const operation = String(operationId || '').trim();
  if (!operation) throw new TypeError('A checkout operation ID is required.');
  const result = await db.run(
    `UPDATE checkout_operations
        SET status = 'compensating', stage = 'compensating', last_error = :message, updated_at = unixepoch()
      WHERE id = :operation_id AND status = 'processing'
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = :operation_id)`,
    { ':operation_id': operation, ':message': String(message || 'Order could not be created.').slice(0, 500) },
  );
  if (Number(result?.rowsAffected) > 0) return { compensating: true, started: true };
  const row = await db.get(
    `SELECT status, EXISTS (SELECT 1 FROM orders o WHERE o.id = :operation_id) AS has_order
       FROM checkout_operations WHERE id = :operation_id`,
    { ':operation_id': operation },
  );
  if (row?.has_order) return { compensating: false, reason: 'order_persisted' };
  if (row?.status === 'compensating') return { compensating: true, started: false };
  if (row?.status === 'failed') return { compensating: false, alreadyFailed: true };
  return { compensating: false, reason: row ? 'operation_state_conflict' : 'operation_missing' };
}

/** Mark failed only after every compensating write has completed. */
export async function finishCheckoutCompensation({ operationId }) {
  const operation = String(operationId || '').trim();
  if (!operation) throw new TypeError('A checkout operation ID is required.');
  const result = await db.run(
    `UPDATE checkout_operations SET status = 'failed', stage = 'failed', updated_at = unixepoch()
      WHERE id = :operation_id AND status = 'compensating'
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = :operation_id)`,
    { ':operation_id': operation },
  );
  if (Number(result?.rowsAffected) > 0) return { failed: true, changed: true };
  const row = await db.get(
    `SELECT status, EXISTS (SELECT 1 FROM orders o WHERE o.id = :operation_id) AS has_order
       FROM checkout_operations WHERE id = :operation_id`,
    { ':operation_id': operation },
  );
  return row?.status === 'failed' && !row.has_order
    ? { failed: true, changed: false }
    : { failed: false, reason: row?.has_order ? 'order_persisted' : 'operation_state_conflict' };
}
