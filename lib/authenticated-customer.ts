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

  const session = verifyTelegramSessionCookie(cookieValue);
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
