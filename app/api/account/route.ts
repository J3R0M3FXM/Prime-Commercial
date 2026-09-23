import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { calculateCustomerTier, processMaturedReferrals } from '@/lib/points-system';
import { getAuthenticatedCustomer } from '@/lib/authenticated-customer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedCustomer(request);
    if (auth.error || !auth.customer) {
      return NextResponse.json(
        { error: auth.error || 'Telegram authentication required' },
        { status: 401 }
      );
    }

    const customer = auth.customer;
    const supabase = getSupabaseAdmin()!;

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    }

    // Referral maturity is an atomic database operation. Running it here also
    // keeps accounts correct even when the scheduled cron is temporarily absent.
    await processMaturedReferrals();

    const userId = customer.id;
    const finalMemberId = customer.prime_member_id || '';

    const [{ data: ordersData, error: ordersError }, { data: tierOrdersData, error: tierOrdersError }] =
      await Promise.all([
        supabase
          .from('orders')
          .select('*')
          .or(`customer_id.eq.${userId},prime_member_id.eq.${finalMemberId},tg_user_id.eq.${customer.tg_user_id || ''}`)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('orders')
          .select('id,status,subtotal,total_amount,created_at,delivered_at')
          .eq('customer_id', userId)
          .order('created_at', { ascending: true }),
      ]);

    if (ordersError) throw ordersError;
    if (tierOrdersError) throw tierOrdersError;

    const userOrders = (ordersData || []).map((o: any) => ({
      id: o.id,
      orderNumber: o.order_number,
      status: o.status,
      totalAmount: Number(o.total_amount || 0),
      subTotal: Number(o.subtotal || 0),
      promoDiscount: Number(o.discount_amount || o.promo_discount || 0),
      storeCreditsUsed: Number(o.store_credits_used || 0),
      createdAt: o.created_at,
      deliveredAt: o.delivered_at,
      referredByUserId: o.referred_by_user_id,
      referredByMemberId: o.referred_by_member_id,
      referralPointsStatus: o.referral_points_status,
      customerName: o.customer_name
    }));

    const completedOrders = (tierOrdersData || [])
      .filter((o: any) => ['delivered', 'completed'].includes(String(o.status || '').toLowerCase()))
      .map((o: any) => ({
        subTotal: Number(o.subtotal || 0),
        subtotal: Number(o.subtotal || 0),
        totalAmount: Number(o.total_amount || 0),
        createdAt: o.created_at,
        deliveredAt: o.delivered_at
      }));

    const tierInfo = calculateCustomerTier(completedOrders);

    const lifetimeOrderCount = (tierOrdersData || []).length;
    const lifetimeSuccessfulOrders = completedOrders.length;
    const lifetimeItemSpending = completedOrders.reduce((sum: number, o: any) => sum + (Number(o.subTotal) || 0), 0);
    const lifetimeTotalSpending = completedOrders.reduce((sum: number, o: any) => sum + (Number(o.totalAmount) || 0), 0);
    const lifetimeDiscounts = (ordersData || []).reduce((sum: number, o: any) => {
      const pDisc = Number(o.discount_amount || o.promo_discount || 0);
      const cDisc = Number(o.store_credits_used || 0);
      return sum + pDisc + cDisc;
    }, 0);

    const firstOrderDate = tierOrdersData?.[0]?.created_at || null;
    const latestOrderDate = tierOrdersData && tierOrdersData.length > 0
      ? tierOrdersData[tierOrdersData.length - 1].created_at
      : null;
    const latestVisitDate = customer.last_seen || customer.updated_at || new Date().toISOString();

    let referralsList: any[] = [];
    if (finalMemberId) {
      const { data: refUsers, error: refUsersError } = await supabase
        .from('customers')
        .select('id,tg_name,tg_username,prime_member_id,created_at')
        .eq('referred_by_member_id', finalMemberId);

      if (refUsersError) throw refUsersError;

      const referrerIds = (refUsers || []).map((r: any) => r.id).filter(Boolean);
      const completedByReferrer = new Set<string>();
      if (referrerIds.length > 0) {
        const { data: refOrders, error: refOrdersError } = await supabase
          .from('orders')
          .select('customer_id')
          .in('customer_id', referrerIds)
          .in('status', ['Completed', 'Delivered']);
        if (refOrdersError) throw refOrdersError;
        for (const order of refOrders || []) completedByReferrer.add(order.customer_id);
      }

      referralsList = (refUsers || [])
        .filter((r: any) => r.id !== userId)
        .map((r: any) => {
          const hasCompleted = completedByReferrer.has(r.id);
          return {
            id: r.id,
            name: r.tg_name || 'Member',
            username: r.tg_username || '',
            primeMemberId: r.prime_member_id || '',
            enrolledAt: r.created_at || '',
            hasDeliveredOrder: hasCompleted,
            rewardStatus: hasCompleted ? 'Earned 50 Pts' : 'Pending Order'
          };
        });
    }

    const { data: txData, error: txError } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (txError) throw txError;

    const pointTransactions = (txData || []).map((t: any) => ({
      id: t.id,
      userId: t.user_id,
      type: t.type,
      amount: Number(t.amount || 0),
      orderId: t.order_id,
      description: t.description,
      createdAt: t.created_at
    }));

    const { data: pendingReferralRows, error: pendingReferralError } = await supabase
      .from('orders')
      .select('referral_points_amount')
      .eq('referred_by_user_id', userId)
      .eq('referral_points_status', 'pending_30m');
    if (pendingReferralError) throw pendingReferralError;

    const pendingReferralPoints = (pendingReferralRows || []).reduce(
      (sum: number, row: any) => sum + Number(row.referral_points_amount || 0),
      0
    );

    const purchasingPoints = Number(customer.points || 0);
    const referralPoints = Number(customer.referral_points || 0);
    const storeCredits = Number(customer.store_credits || 0);

    return NextResponse.json({
      customer: {
        id: userId,
        tgUserId: customer.tg_user_id || userId,
        tgName: customer.tg_name || 'Valued Member',
        tgUsername: customer.tg_username || '',
        primeMemberId: finalMemberId,
        phone: customer.phone || 'Not linked',
        photoUrl: customer.photo_url || '',
        hasCustomPhoto: Boolean(customer.has_custom_photo),
        enrollmentDate: customer.created_at || new Date().toISOString(),
        firstOrderDate,
        latestOrderDate,
        latestVisitDate,
        lifetimeOrderCount,
        lifetimeSuccessfulOrders,
        lifetimeItemSpending,
        lifetimeTotalSpending,
        lifetimeDiscounts,
        tierInfo,
        referredBy: customer.referred_by_name || 'N/A',
        referredByUsername: customer.referred_by_username || '',
        referredByMemberId: customer.referred_by_member_id || '',
        referralCount: referralsList.length,
        referrals: referralsList,
        purchasingPoints,
        referralPoints,
        pendingReferralPoints,
        storeCredits
      },
      recentOrders: userOrders.slice(0, 5),
      allOrders: userOrders,
      pointTransactions
    });
  } catch (err: any) {
    console.error('Error fetching account profile:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 400 });
    }
    const auth = await getAuthenticatedCustomer(request);
    if (auth.error || !auth.customer) {
      return NextResponse.json({ error: auth.error || 'Telegram authentication required' }, { status: 401 });
    }
    const supabase = getSupabaseAdmin()!;
    const body = await request.json();
    const { photoUrl } = body;

    if (!photoUrl || typeof photoUrl !== 'string') {
      return NextResponse.json({ error: 'Photo URL or Base64 data is required' }, { status: 400 });
    }
    if (photoUrl.length > 3_000_000) {
      return NextResponse.json({ error: 'Photo is too large.' }, { status: 413 });
    }

    await supabase
      .from('customers')
      .update({
        photo_url: photoUrl,
        has_custom_photo: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', auth.customer.id);

    return NextResponse.json({ success: true, photoUrl });
  } catch (err: any) {
    console.error('Error updating profile photo:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
