// Convenience state only: authentication and all checkout values are checked
// by Telegram Serverless again. Never persist signed Telegram credentials.
const PREFIX = 'prime_checkout_draft_v1:';
const MAX_AGE = 24 * 60 * 60 * 1000;
export type CheckoutDraft = { savedAt: number; items: any[]; state: Record<string, any> };

export function readCheckoutDraft(userId: string): CheckoutDraft | null {
  if (!/^\d+$/.test(userId)) return null;
  try {
    const draft = JSON.parse(localStorage.getItem(PREFIX + userId) || 'null');
    if (!draft) return null;
    if (!Number.isFinite(draft.savedAt) || Date.now() - draft.savedAt > MAX_AGE || draft.savedAt > Date.now() ||
        !Array.isArray(draft.items) || !draft.items.length || draft.items.length > 100 ||
        !draft.state || !Number.isInteger(draft.state.currentStep) || draft.state.currentStep < 1 || draft.state.currentStep > 5) {
      clearCheckoutDraft(userId);
      return null;
    }
    return draft;
  } catch { return null; }
}

export function saveCheckoutDraft(userId: string, items: any[], state: Record<string, any>): boolean {
  if (!/^\d+$/.test(userId) || !items.length) return false;
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify({ savedAt: Date.now(), items, state }));
    return true;
  } catch { return false; }
}

export function clearCheckoutDraft(userId: string): void {
  try { localStorage.removeItem(PREFIX + userId); } catch {}
}
