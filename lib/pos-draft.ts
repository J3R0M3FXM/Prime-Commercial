export type PosDraft = {
  savedAt: number;
  mode: 'store' | 'delivery';
  customerType: 'guest' | 'existing';
  selectedCustomerId: string;
  telegramId: string;
  cart: Array<{ key: string; productId: string; variantId: string; name: string; price: number; quantity: number; stock: number }>;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  courierId: string;
  deliveryFee: string;
  paymentMethodName: string;
  paymentMethodId: string;
  deliveryPaymentMethod: string;
  chargeIds: string[];
  manualCharges: Array<{ name: string; type: string; amount: string }>;
  promoCode: string;
  discountMode: string;
  discountValue: string;
  storeCreditsUsed: string;
  cashReceived: string;
  workspaceTab: 'catalog' | 'sale' | 'payment';
};

function key(staffId: string) { return `prime_pos_draft:${staffId}`; }

export function readPosDraft(staffId: string): PosDraft | null {
  if (typeof window === 'undefined' || !staffId) return null;
  try {
    const raw = window.localStorage.getItem(key(staffId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as PosDraft;
    return draft && Array.isArray(draft.cart) && draft.savedAt ? draft : null;
  } catch { return null; }
}

export function writePosDraft(staffId: string, draft: PosDraft) {
  if (typeof window === 'undefined' || !staffId) return;
  try { window.localStorage.setItem(key(staffId), JSON.stringify({ ...draft, savedAt: Date.now() })); } catch { /* Storage is best effort; checkout attempt recovery remains authoritative. */ }
}

export function clearPosDraft(staffId: string) {
  if (typeof window === 'undefined' || !staffId) return;
  try { window.localStorage.removeItem(key(staffId)); } catch { /* Best effort. */ }
}

