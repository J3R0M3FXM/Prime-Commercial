type Pending = { key: string; signature: string; operationId: string };
const memory = new Map<string, Pending>();

export function hasPendingCreditOperation(customerId: string, kind: 'conversion' | 'transfer') {
  const key = `prime_credit_request:${customerId}:${kind}`;
  try { if (/^[a-f0-9]{32}$/.test(JSON.parse(localStorage.getItem(key) || 'null')?.operationId)) return true; } catch { /* Use memory fallback. */ }
  return memory.has(key);
}

/** Keep an unconfirmed financial request stable across retries and WebView reloads. */
export function beginCreditOperation(customerId: string, kind: 'conversion' | 'transfer', payload: Record<string, string | number>): Pending {
  if (!customerId) throw new Error('Refresh your account before continuing.');
  const key = `prime_credit_request:${customerId}:${kind}`;
  const signature = JSON.stringify(payload);
  let existing = memory.get(key);
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && typeof saved.signature === 'string' && /^[a-f0-9]{32}$/.test(saved.operationId)) existing = { key, signature: saved.signature, operationId: saved.operationId };
  } catch { /* In-memory retries still work when device storage is unavailable. */ }
  if (existing) {
    if (existing.signature !== signature) throw new Error('Your previous request is not confirmed. Retry with the same amount and recipient or point type first.');
    memory.set(key, existing);
    return existing;
  }
  const operationId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  const pending = { key, signature, operationId };
  memory.set(key, pending);
  try { localStorage.setItem(key, JSON.stringify(pending)); } catch { /* Preserve the in-memory request. */ }
  return pending;
}

export function finishCreditOperation(pending: Pending) {
  if (memory.get(pending.key)?.operationId === pending.operationId) memory.delete(pending.key);
  try {
    if (JSON.parse(localStorage.getItem(pending.key) || 'null')?.operationId === pending.operationId) localStorage.removeItem(pending.key);
  } catch { /* The server-confirmed result remains authoritative. */ }
}

export function isDefinitiveCreditFailure(error: any) {
  const code = String(error?.parameters?.code || error?.code || '');
  return ['INVALID_AMOUNT','INVALID_POINTS_TYPE','INVALID_OPERATION_ID','CUSTOMER_NOT_FOUND','ACCOUNT_NOT_FOUND','INSUFFICIENT_POINTS','INVALID_MEMBER_ID','RECIPIENT_NOT_FOUND','SELF_TRANSFER','INSUFFICIENT_TRANSFERABLE_CREDITS'].includes(code);
}
