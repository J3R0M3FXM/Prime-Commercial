import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getAuthenticatedCustomer } from '@/lib/authenticated-customer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    }

    const auth = await getAuthenticatedCustomer(request);
    if (auth.error || !auth.customer) {
      return NextResponse.json(
        { error: auth.error || 'Telegram authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const pointsType = body?.pointsType;
    const amount = Math.floor(Number(body?.amount) || 0);

    if (pointsType !== 'purchasing' && pointsType !== 'referral') {
      return NextResponse.json(
        { error: 'Invalid points type. Must be purchasing or referral.' },
        { status: 400 }
      );
    }
    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Please specify a valid amount of points to convert.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase.rpc('convert_points_to_store_credits', {
      p_customer_id: auth.customer.id,
      p_points_type: pointsType,
      p_amount: amount,
    });

    if (error) {
      console.error('Atomic point conversion failed:', error);
      return NextResponse.json(
        { error: error.message || 'Point conversion failed.' },
        { status: /insufficient|invalid/i.test(error.message || '') ? 400 : 500 }
      );
    }

    return NextResponse.json(data || {
      success: true,
      pointsType,
      convertedAmount: amount,
    });
  } catch (err: any) {
    console.error('Point conversion error:', err);
    return NextResponse.json(
      { error: err.message || 'Conversion failed.' },
      { status: 500 }
    );
  }
}
