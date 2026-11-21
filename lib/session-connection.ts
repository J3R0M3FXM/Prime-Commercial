/** Transport failures are recoverable; rejected Telegram credentials are not. */
export function isSessionConnectionError(error: unknown): boolean {
  const value = error as { message?: unknown; code?: unknown; type?: unknown; status?: unknown } | null;
  const code = String(value?.code || value?.type || '');
  if (/AUTH|FORBIDDEN|UNAUTHORIZED|ACCESS_DENIED/i.test(code) || value?.status === 401 || value?.status === 403) return false;
  const message = String(value?.message || error || '');
  return /network error|failed to fetch|network request failed|load failed|timed? out|too long to respond|did not initialize|offline|connection (?:lost|refused|reset)/i.test(message);
}
