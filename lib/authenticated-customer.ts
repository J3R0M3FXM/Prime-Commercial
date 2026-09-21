import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyTelegramSessionCookie } from '@/lib/telegram-session';

function generateMemberId() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

export async function getAuthenticatedCustomer(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { customer: null, error: 'Supabase server configuration is missing.' as string };

  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('prime_telegram_session='));
  const cookieValue = match
    ? match.slice('prime_telegram_session='.length)
    : undefined;

  const headerInitData = request.headers.get('x-telegram-init-data') || '';
  let initDataSession: { tgUserId: string; isAdmin: boolean } | null = null;
  if (headerInitData) {
    try {
      const params = new URLSearchParams(headerInitData);
      const hash = params.get('hash')?.toLowerCase() || '';
      params.delete('hash');
      const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
      if (/^[0-9a-f]{64}$/.test(hash) && botToken) {
        const dataCheckString = Array.from(params.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}=${value}`)
          .join('\\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        const authDate = Number(params.get('auth_date') || 0);
        const now = Math.floor(Date.now() / 1000);
        const user = JSON.parse(params.get('user') || '{}');
        const tgUserId = user?.id != null ? String(user.id) : '';
        if (
          calculatedHash === hash &&
          /^[0-9]+$/.test(tgUserId) &&
          Number.isSafeInteger(authDate) &&
          authDate > 0 &&
          authDate <= now + 300 &&
          now - authDate <= 86400
        ) {
          initDataSession = {
            tgUserId,
            isAdmin: Boolean(process.env.ADMIN_TELEGRAM_USER_ID?.trim() && tgUserId === process.env.ADMIN_TELEGRAM_USER_ID.trim()),
          };
        }
      }
    } catch {}
  }
  const session = initDataSession || verifyTelegramSessionCookie(cookieValue);
  if (!session) return { customer: null, error: 'Telegram authentication required' as string };

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('tg_user_id', session.tgUserId)
    .maybeSingle();

  if (error) {
    console.error('Authenticated customer lookup failed:', error);
    return { customer: null, error: 'Unable to load customer session.' as string };
  }

  // A valid Telegram session must always have a corresponding customer row.
  // Older deployments could issue a session before the customer upsert completed.
  // Repair that state here instead of returning a misleading authentication error.
  if (!customer) {
    const { data: repaired, error: repairError } = await supabase
      .from('customers')
      .upsert({
        tg_user_id: session.tgUserId,
        tg_name: 'Valued Member',
        tg_username: '',
        prime_member_id: generateMemberId(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tg_user_id' })
      .select('*')
      .maybeSingle();

    if (repairError || !repaired) {
      console.error('Authenticated customer repair failed:', repairError);
      return { customer: null, error: 'Unable to initialize customer profile.' as string };
    }

    return { customer: repaired, session, error: null as string | null };
  }

  return { customer, session, error: null as string | null };
}
