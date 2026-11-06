'use client';

export function getLiveTelegramInitData(): string {
  if (typeof window === 'undefined') return '';
  const webApp = (window as any).Telegram?.WebApp;
  const live = typeof webApp?.initData === 'string' ? webApp.initData.trim() : '';
  if (live) {
    try { sessionStorage.setItem('prime_telegram_init_data', live); } catch {}
    return live;
  }
  try {
    return sessionStorage.getItem('prime_telegram_init_data')?.trim() || '';
  } catch {
    return '';
  }
}

async function bootstrapTelegramSession(initData: string): Promise<void> {
  if (!initData) throw new Error('Telegram authentication required. Please reopen PRIME from Telegram.');
  const response = await fetch('/api/auth/telegram/validate', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Unable to restore Telegram session.');
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const initData = getLiveTelegramInitData();
  const headers = new Headers(init.headers || {});
  if (initData) headers.set('X-Telegram-Init-Data', initData);
  let response = await fetch(input, { ...init, headers, credentials: 'include', cache: 'no-store' });
  if (response.status !== 401 || !initData) return response;
  await bootstrapTelegramSession(initData);
  const retryHeaders = new Headers(init.headers || {});
  retryHeaders.set('X-Telegram-Init-Data', initData);
  return fetch(input, { ...init, headers: retryHeaders, credentials: 'include', cache: 'no-store' });
}
