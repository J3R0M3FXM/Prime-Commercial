export function orderNotificationDestination(value: string): { tab: 'orders' | 'account' | 'media'; orderId?: string; receipt?: boolean } | null {
  if (value === 'rewards') return { tab: 'account' };
  if (value === 'media') return { tab: 'media' };
  const match = /^(order|receipt)_([A-Za-z0-9_-]{1,120})$/.exec(value);
  return match ? { tab: 'orders', orderId: match[2], receipt: match[1] === 'receipt' } : null;
}

export function courierTrackingLink(value: unknown): string | null {
  const text = String(value || '').trim();
  if (!/^https:\/\//i.test(text) || /[\\\u0000-\u0020]/.test(text)) return null;
  try { const url = new URL(text); return url.hostname && !url.username && !url.password ? url.href : null; } catch { return null; }
}
