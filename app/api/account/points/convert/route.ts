import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getAuthenticatedCustomer } from '@/lib/authenticated-customer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const auth = await getAuthenticatedCustomer(request);
    if (auth.error || !auth.customer) {
      return NextResponse.json({ error: auth.error || 'Telegram authentication required' }, { status: 401 });
    }
    const body = await request.json();
    const { pointsType, amount } = body;

    const convertAmount = Math.floor(Number(amount) || 0);
    if (convertAmount <= 0) {
      return NextResponse.json({ error: 'Please specify a valid amount of points to convert.' }, { status: 400 });
    }
    if (pointsType !== 'purchasing' && pointsType !== 'referral') {
      return NextResponse.json({ error: 'Invalid points type. Must be purchasing or referral.' }, { status: 400 });
    }

    const customer = auth.customer;
    const currentPoints = pointsType === 'referral'
      ? Number(customer.referral_points || 0)
      : Number(customer.points || 0);

    if (currentPoints < convertAmount) {
      return NextResponse.json({ error: `Insufficient Points. Available: ${currentPoints}` }, { status: 400 });
    }

    const newPointsBalance = currentPoints - convertAmount;
    const currentCredits = Number(customer.store_credits || 0);
    const newCreditsBalance = currentCredits + convertAmount;

    const { error: updateErr } = await supabase
      .from('customers')
      .update({
        ...(pointsType === 'referral'
          ? { referral_points: newPointsBalance }
          : { points: newPointsBalance }),
        store_credits: newCreditsBalance,
        updated_at: new Date().toISOString()
      })
      .eq('id', customer.id);

    if (updateErr) throw updateErr;

    await supabase.from('point_transactions').insert([{
      id: `tx-conv-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      user_id: customer.id,
      type: pointsType === 'purchasing' ? 'conversion_purchasing' : 'conversion_referral',
      amount: convertAmount,
      description: `Converted ${convertAmount} Points to ₱${convertAmount} Store Credits`,
      created_at: new Date().toISOString()
    }]);

    return NextResponse.json({
      success: true,
      pointsType,
      convertedAmount: convertAmount,
      newPointsBalance,
      newCreditsBalance
    });
  } catch (err: any) {
    console.error('Point conversion error:', err);
    return NextResponse.json({ error: err.message || 'Conversion failed.' }, { status: 400 });
  }
}
