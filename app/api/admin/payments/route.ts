import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

let cachedPayments: any[] | null = null;
let lastPaymentsFetchTime = 0;
const PAYMENTS_CACHE_TTL_MS = 60000;

export async function GET() {
  try {
    const now = Date.now();
    if (cachedPayments && (now - lastPaymentsFetchTime < PAYMENTS_CACHE_TTL_MS)) {
      return NextResponse.json(cachedPayments);
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;

    const paymentMethods = (data || []).map(p => ({
      id: p.id,
      name: p.name,
      logo: p.logo,
      paymentType: p.payment_type,
      qrCodeImage: p.qr_code_image,
      webhookUrl: p.webhook_url,
      publicKey: p.public_key,
      secretKey: p.secret_key,
      walletAddress: p.wallet_address,
      accountName: p.account_name,
      accountNumber: p.account_number,
      sortOrder: p.sort_order,
      isActive: p.is_active,
    }));

    cachedPayments = paymentMethods;
    lastPaymentsFetchTime = now;
    return NextResponse.json(paymentMethods);
  } catch (error: any) {
    if (cachedPayments) return NextResponse.json(cachedPayments);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    cachedPayments = null;
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const data = await request.json();
    const {
      name,
      logo,
      paymentType,
      qrCodeImage,
      webhookUrl,
      publicKey,
      secretKey,
      walletAddress,
      accountName,
      accountNumber,
      sortOrder,
      isActive
    } = data;

    if (!name || !paymentType) {
      return NextResponse.json({ error: "Missing required fields (name, paymentType)" }, { status: 400 });
    }

    let resolvedSortOrder = typeof sortOrder === 'number' ? sortOrder : 0;
    if (typeof sortOrder !== 'number') {
      const { count } = await supabase.from('payment_methods').select('*', { count: 'exact', head: true });
      resolvedSortOrder = count || 0;
    }

    const newId = `pm_${Date.now()}`;
    const payload = {
      id: newId,
      name: String(name),
      logo: String(logo || ''),
      payment_type: String(paymentType),
      qr_code_image: String(qrCodeImage || ''),
      webhook_url: String(webhookUrl || ''),
      public_key: String(publicKey || ''),
      secret_key: String(secretKey || ''),
      wallet_address: String(walletAddress || ''),
      account_name: String(accountName || ''),
      account_number: String(accountNumber || ''),
      sort_order: resolvedSortOrder,
      is_active: isActive !== false,
    };

    const { error } = await supabase.from('payment_methods').insert([payload]);
    if (error) throw error;

    return NextResponse.json({ success: true, id: newId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    cachedPayments = null;
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const data = await request.json();

    if (Array.isArray(data.reorder)) {
      for (const item of data.reorder) {
        if (item.id && typeof item.sortOrder === 'number') {
          await supabase.from('payment_methods').update({ sort_order: item.sortOrder }).eq('id', item.id);
        }
      }
      return NextResponse.json({ success: true, message: "Order updated" });
    }

    const {
      id,
      name,
      logo,
      paymentType,
      qrCodeImage,
      webhookUrl,
      publicKey,
      secretKey,
      walletAddress,
      accountName,
      accountNumber,
      sortOrder,
      isActive
    } = data;

    if (!id || !name || !paymentType) {
      return NextResponse.json({ error: "Missing required fields (id, name, paymentType)" }, { status: 400 });
    }

    const updatePayload: any = {
      name: String(name),
      logo: String(logo || ''),
      payment_type: String(paymentType),
      qr_code_image: String(qrCodeImage || ''),
      webhook_url: String(webhookUrl || ''),
      public_key: String(publicKey || ''),
      secret_key: String(secretKey || ''),
      wallet_address: String(walletAddress || ''),
      account_name: String(accountName || ''),
      account_number: String(accountNumber || ''),
      is_active: isActive !== false,
      updated_at: new Date().toISOString()
    };

    if (typeof sortOrder === 'number') {
      updatePayload.sort_order = sortOrder;
    }

    const { error } = await supabase.from('payment_methods').update(updatePayload).eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    cachedPayments = null;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Missing payment method ID" }, { status: 400 });

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const { error } = await supabase.from('payment_methods').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
