import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { calculateCustomerTier } from '@/lib/points-system';
import { cacheStore } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const CUSTOMERS_CACHE_TTL_MS = 60000;

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('id');

    if (customerId) {
      let { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();

      if (!customer) {
        const { data: primeData } = await supabase
          .from('customers')
          .select('*')
          .eq('prime_member_id', customerId)
          .single();
        customer = primeData;
      }

      if (!customer) {
        const { data: tgData } = await supabase
          .from('customers')
          .select('*')
          .eq('tg_user_id', customerId)
          .single();
        customer = tgData;
      }

      if (!customer) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }

      const targetId = customer.id;
      const fingerprints = customer.fingerprints || [];

      const { data: ordersData } = await supabase
        .from('orders')
        .select('*')
        .or(`customer_id.eq.${targetId},prime_member_id.eq.${customer.prime_member_id || ''},tg_user_id.eq.${customer.tg_user_id || ''}`)
        .order('created_at', { ascending: false })
        .limit(50);

      const orders = (ordersData || []).map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        totalAmount: o.total_amount,
        subTotal: o.sub_total,
        promoDiscount: o.promo_discount,
        storeCreditsUsed: o.store_credits_used,
        createdAt: o.created_at,
        deliveredAt: o.delivered_at
      }));

      const completedOrders = orders.filter((o: any) => {
        const st = String(o.status || '').toLowerCase();
        return st === 'delivered' || st === 'completed';
      });
      const tierInfo = calculateCustomerTier(completedOrders);

      return NextResponse.json({
        customer: {
          id: customer.id,
          tgUserId: customer.tg_user_id,
          tgName: customer.tg_name,
          tgUsername: customer.tg_username,
          primeMemberId: customer.prime_member_id,
          phone: customer.phone,
          photoUrl: customer.photo_url,
          points: Number(customer.points || 0),
          purchasingPoints: Number(customer.points || 0),
          referralPoints: Number(customer.referral_points || 0),
          storeCredits: Number(customer.store_credits || 0),
          tier: tierInfo.tier,
          tierInfo,
          fingerprints,
          latestFingerprint: fingerprints[0] || null,
          sharedAccounts: [],
          isPromoFraudRisk: false
        },
        fingerprints,
        orders
      });
    }

    const now = Date.now();
    if (cacheStore.customers && (now - cacheStore.lastCustomersFetchTime < CUSTOMERS_CACHE_TTL_MS)) {
      return NextResponse.json(cacheStore.customers);
    }

    const { data: customersData, error } = await supabase.from('customers').select('*');
    if (error) throw error;

    const { data: allOrdersData } = await supabase.from('orders').select('*').limit(500);
    const allOrders = allOrdersData || [];

    const users = (customersData || []).map((c: any) => {
      const customerOrders = allOrders.filter((ord: any) => 
        ord.customer_id === c.id || 
        ord.tg_user_id === c.tg_user_id ||
        (c.prime_member_id && ord.prime_member_id === c.prime_member_id)
      );

      const totalSpent = customerOrders.reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0);
      const completedCustOrders = customerOrders.filter((o: any) => {
        const st = String(o.status || '').toLowerCase();
        return st === 'delivered' || st === 'completed';
      });
      const compactTier = calculateCustomerTier(completedCustOrders).tier;
      const fingerprints = c.fingerprints || [];

      return {
        id: c.id,
        tgUserId: c.tg_user_id,
        tgName: c.tg_name,
        tgUsername: c.tg_username,
        primeMemberId: c.prime_member_id,
        phone: c.phone,
        photoUrl: c.photo_url,
        tier: compactTier,
        storeCredits: Number(c.store_credits || 0),
        purchasingPoints: Number(c.points || 0),
        referralPoints: Number(c.referral_points || 0),
        latestFingerprint: fingerprints[0] || null,
        orderCount: customerOrders.length,
        totalSpent,
        isPromoFraudRisk: false,
        sharedAccountCount: 0
      };
    });

    cacheStore.customers = users;
    cacheStore.lastCustomersFetchTime = now;

    return NextResponse.json(users);
  } catch (error: any) {
    if (cacheStore.customers) {
      return NextResponse.json(cacheStore.customers);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
