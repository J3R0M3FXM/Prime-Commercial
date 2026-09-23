import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { notifyOrderStatusChanged } from '@/lib/telegram-notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: Request) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  try {
    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase.rpc('expire_unpaid_orders', { p_limit: 100 });
    if (error) throw error;

    const expiredOrders = Array.isArray(data?.orders) ? data.orders : [];
    await Promise.allSettled(
      expiredOrders
        .filter((order: any) => order?.chatId && order?.orderNumber)
        .map((order: any) =>
          notifyOrderStatusChanged({
            chatId: order.chatId,
            orderNumber: String(order.orderNumber),
            status: 'Expired',
            paymentStatus: 'Expired',
            event: 'status',
          })
        )
    );

    return NextResponse.json(
      {
        success: true,
        expiredCount: Number(data?.expiredCount || 0),
        failedCount: Number(data?.failedCount || 0),
        errors: Array.isArray(data?.errors) ? data.errors : [],
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    console.error('Order expiry cron failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to expire unpaid orders.' },
      { status: 500 }
    );
  }
}