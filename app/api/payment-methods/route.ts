import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase
      .from('payment_methods')
      .select('id,name,logo,payment_type,qr_code_image,public_key,wallet_address,account_name,account_number,sort_order,is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json((data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      logo: p.logo,
      paymentType: p.payment_type,
      qrCodeImage: p.qr_code_image,
      publicKey: p.public_key,
      walletAddress: p.wallet_address,
      accountName: p.account_name,
      accountNumber: p.account_number,
      sortOrder: p.sort_order,
      isActive: p.is_active,
    })));
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load payment methods' }, { status: 500 });
  }
}
