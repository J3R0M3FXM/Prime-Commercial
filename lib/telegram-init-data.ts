const MAX_AGE_SECONDS = 24 * 60 * 60;

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: BufferSource, message: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

export async function verifyTelegramInitData(initData: string | undefined) {
  try {
    const raw = typeof initData === 'string' ? initData.trim() : '';
    if (!raw) return null;

    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!botToken) return null;

    const params = new URLSearchParams(raw);
    const hash = params.get('hash')?.toLowerCase() || '';
    params.delete('hash');

    if (!/^[0-9a-f]{64}$/.test(hash)) return null;

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    if (!dataCheckString) return null;

    // Telegram Mini Apps: secret_key = HMAC_SHA256(bot_token, "WebAppData"),
    // then hash = HMAC_SHA256(data_check_string, secret_key).
    const secretKey = await hmacSha256(
      new TextEncoder().encode('WebAppData'),
      botToken
    );
    const calculatedHash = toHex(await hmacSha256(secretKey, dataCheckString));

    if (calculatedHash !== hash) return null;

    const authDate = Number(params.get('auth_date') || 0);
    const now = Math.floor(Date.now() / 1000);
    if (
      !Number.isSafeInteger(authDate) ||
      authDate <= 0 ||
      authDate > now + 300 ||
      now - authDate > MAX_AGE_SECONDS
    ) {
      return null;
    }

    const userRaw = params.get('user');
    if (!userRaw) return null;

    const user = JSON.parse(userRaw);
    const tgUserId = user?.id != null ? String(user.id) : '';
    if (!/^[0-9]+$/.test(tgUserId)) return null;

    const adminId = process.env.ADMIN_TELEGRAM_USER_ID?.trim() || '';
    return {
      tgUserId,
      isAdmin: Boolean(adminId && tgUserId === adminId),
    };
  } catch {
    return null;
  }
}
