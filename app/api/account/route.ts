import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { calculateCustomerTier, processMaturedReferrals } from '@/lib/points-system';

export const dynamic = 'force-dynamic';

let lastMaturedReferralsProcessTime = 0;
const MATURED_REFERRALS_INTERVAL_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId') || searchParams.get('id') || '';
    const primeMemberId = searchParams.get('primeMemberId') || '';

    if (!customerId && !primeMemberId) {
      return NextResponse.json({ error: 'Customer identifier is required.' }, { status: 400 });
    }

    const now = Date.now();
    if (now - lastMaturedReferralsProcessTime > MATURED_REFERRALS_INTERVAL_MS) {
      lastMaturedReferralsProcessTime = now;
      processMaturedReferrals().catch(() => {});
    }

    let customer: any = null;

    if (customerId) {
      const { data } = await supabase.from('customers').select('*').eq('id', customerId).single();
      customer = data;
      if (!customer) {
        const { data: tgData } = await supabase.from('customers').select('*').eq('tg_user_id', customerId).single();
        customer = tgData;
      }
    }

    if (!customer && primeMemberId) {
      const { data } = await supabase.from('customers').select('*').eq('prime_member_id', primeMemberId).single();
      customer = data;
    }

    if (!customer) {
      return NextResponse.json({ error: 'Customer profile not found.' }, { status: 404 });
    }

    const userId = customer.id;
    const finalMemberId = customer.prime_member_id || primeMemberId || '';

    const { data: ordersData } = await supabase
      .from('orders')
      .select('*')
      .or(`customer_id.eq.${userId},prime_member_id.eq.${finalMemberId},tg_user_id.eq.${customer.tg_user_id || ''}`)
      .order('created_at', { ascending: false })
      .limit(100);

    const userOrders = (ordersData || []).map((o: any) => ({
      id: o.id,
      orderNumber: o.order_number,
      status: o.status,
      totalAmount: o.total_amount,
      subTotal: o.sub_total,
      promoDiscount: o.promo_discount,
      storeCreditsUsed: o.store_credits_used,
      createdAt: o.created_at,
      deliveredAt: o.delivered_at,
      referredByUserId: o.referred_by_user_id,
      referredByMemberId: o.referred_by_member_id,
      referralPointsStatus: o.referral_points_status,
      customerName: o.customer_name
    }));

    const completedOrders = userOrders.filter((o) => {
      const st = String(o.status || '').toLowerCase();
      return st === 'delivered' || st === 'completed';
    });

    const tierInfo = calculateCustomerTier(completedOrders);

    const lifetimeOrderCount = userOrders.length;
    const lifetimeSuccessfulOrders = completedOrders.length;
    const lifetimeItemSpending = completedOrders.reduce((sum, o) => sum + (Number(o.subTotal) || 0), 0);
    const lifetimeTotalSpending = completedOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const lifetimeDiscounts = userOrders.reduce((sum, o) => {
      const pDisc = Number(o.promoDiscount || 0);
      const cDisc = Number(o.storeCreditsUsed || 0);
      return sum + pDisc + cDisc;
    }, 0);

    const firstOrderDate = userOrders.length > 0 ? userOrders[userOrders.length - 1].createdAt : null;
    const latestOrderDate = userOrders.length > 0 ? userOrders[0].createdAt : null;
    const latestVisitDate = customer.last_seen || customer.updated_at || new Date().toISOString();

    let referralsList: any[] = [];
    if (finalMemberId) {
      const { data: refUsers } = await supabase
        .from('customers')
        .select('*')
        .eq('referred_by_member_id', finalMemberId);

      if (refUsers) {
        for (const r of refUsers) {
          if (r.id !== userId) {
            const hasCompleted = Boolean(r.points > 0 || r.total_spent > 0);
            referralsList.push({
              id: r.id,
              name: r.tg_name || 'Member',
              username: r.tg_username || '',
              primeMemberId: r.prime_member_id || '',
              enrolledAt: r.created_at || '',
              hasDeliveredOrder: hasCompleted,
              rewardStatus: hasCompleted ? 'Earned 50 Pts' : 'Pending Order'
            });
          }
        }
      }
    }

    let pointTransactions: any[] = [];
    const { data: txData } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (txData) {
      pointTransactions = txData.map((t: any) => ({
        id: t.id,
        userId: t.user_id,
        type: t.type,
        amount: t.amount,
        orderId: t.order_id,
        description: t.description,
        createdAt: t.created_at
      }));
    }

    const pendingReferralPoints = 0;
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
    const supabase = getSupabaseAdmin()!;
    const body = await request.json();
    const { customerId, photoUrl } = body;

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }
    if (!photoUrl) {
      return NextResponse.json({ error: 'Photo URL or Base64 data is required' }, { status: 400 });
    }

    const { data: customer } = await supabase.from('customers').select('*').eq('id', customerId).single();
    if (!customer) {
      return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
    }

    await supabase
      .from('customers')
      .update({
        photo_url: photoUrl,
        has_custom_photo: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', customerId);

    return NextResponse.json({ success: true, photoUrl });
  } catch (err: any) {
    console.error('Error updating profile photo:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
