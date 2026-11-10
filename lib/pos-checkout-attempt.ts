export type PosCheckoutAttempt = { operationKey: string; payload: Record<string, any> };
const storageKey = (staffId: string) => {
  if (!/^\d+$/.test(staffId)) throw new Error('Reopen POS with your verified staff account.');
  return 'prime_pos_checkout_v1:' + staffId;
};
export function readPosCheckoutAttempt(staffId: string): PosCheckoutAttempt | null {
  const value = localStorage.getItem(storageKey(staffId));
  if (!value) return null;
  const saved = JSON.parse(value);
  if (!/^[a-f0-9]{48}$/.test(saved?.operationKey) || !saved?.payload || !Array.isArray(saved.payload.items))
    throw new Error('The pending sale could not be read. Check Orders before starting another sale.');
  return saved;
}
export function beginPosCheckoutAttempt(staffId: string, payload: Record<string, any>): PosCheckoutAttempt {
  const existing = readPosCheckoutAttempt(staffId);
  if (existing) return existing;
  const operationKey = Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2,'0')).join('');
  const attempt = { operationKey, payload };
  localStorage.setItem(storageKey(staffId), JSON.stringify(attempt));
  return attempt;
}
export function finishPosCheckoutAttempt(staffId: string, operationKey: string) {
  if (readPosCheckoutAttempt(staffId)?.operationKey === operationKey) localStorage.removeItem(storageKey(staffId));
}
