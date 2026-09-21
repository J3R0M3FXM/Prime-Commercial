import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyTelegramSessionCookie } from '@/lib/telegram-session';

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

  if (!customer) return { customer: null, error: 'Customer profile not found.' as string };

  return { customer, session, error: null as string | null };
}
