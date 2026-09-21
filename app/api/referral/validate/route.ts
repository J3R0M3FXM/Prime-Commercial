import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getAuthenticatedCustomer } from '@/lib/authenticated-customer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedCustomer(request);
    if (auth.error || !auth.customer) {
      return NextResponse.json({ valid: false, error: auth.error || 'Telegram authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { referralCode } = body;
    const customerId = auth.customer.id;
    const customerMemberId = auth.customer.prime_member_id || '';

    const cleanCode = String(referralCode || '').trim().toUpperCase();
    if (!cleanCode) {
      return NextResponse.json({ valid: false, error: 'Referral code is required.' }, { status: 400 });
    }

    if (customerMemberId && cleanCode === String(customerMemberId).trim().toUpperCase()) {
      return NextResponse.json({ valid: false, error: 'You cannot use your own PRIME Member ID as a referral code.' });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ valid: false, error: 'Supabase is not configured.' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;

    const { data: referrer, error } = await supabase
      .from('customers')
      .select('*')
      .eq('prime_member_id', cleanCode)
      .single();

    if (error || !referrer) {
      return NextResponse.json({ 
        valid: false, 
        error: 'Invalid referral code. The PRIME Member ID does not exist.' 
      });
    }

    if (customerId && (referrer.id === customerId || referrer.tg_user_id === customerId)) {
      return NextResponse.json({ 
        valid: false, 
        error: 'You cannot use your own PRIME Member ID as a referral code.' 
      });
    }

    return NextResponse.json({
      valid: true,
      referrerUserId: referrer.id,
      referrerMemberId: referrer.prime_member_id || cleanCode,
      referrerName: referrer.tg_name || 'Valued Member',
      referrerUsername: referrer.tg_username || ''
    });
  } catch (err: any) {
    console.error('Referral validate error:', err);
    return NextResponse.json({ valid: false, error: err.message || 'Validation failed.' }, { status: 500 });
  }
}
