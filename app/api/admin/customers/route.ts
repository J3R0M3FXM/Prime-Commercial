import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { calculateCustomerTier } from '@/lib/points-system';

export const dynamic = 'force-dynamic';

function normalizeFingerprint(raw: any, index = 0) {
  const lastSeen = raw?.lastSeen || raw?.capturedAt || raw?.timestamp || raw?.createdAt || null;
  const createdAt = raw?.createdAt || raw?.firstSeen || raw?.capturedAt || raw?.timestamp || lastSeen;
  const deviceId = raw?.deviceId || raw?.device_id || '';
  const sessionToken = raw?.sessionToken || raw?.session_token || '';
  return {
    ...(raw || {}),
    id: raw?.id || (sessionToken ? `sess_${sessionToken}` : `fp_${deviceId || 'unknown'}_${createdAt || index}`),
    createdAt,
    firstSeen: raw?.firstSeen || createdAt,
    lastSeen,
    deviceId,
    hardwareId: raw?.hardwareId || raw?.hardware_id || '',
    deviceFingerprintId: raw?.deviceFingerprintId || raw?.device_fingerprint_id || '',
    serverFingerprintId: raw?.serverFingerprintId || raw?.server_fingerprint_id || '',
    sessionToken,
  };
}

function sortFingerprints(raw: any[]) {
  return (Array.isArray(raw) ? raw : []).map(normalizeFingerprint).sort((a: any, b: any) =>
    new Date(b.lastSeen || b.createdAt || 0).getTime() - new Date(a.lastSeen || a.createdAt || 0).getTime()
  );
}

function telemetryFrom(fingerprints: any[]) {
  const latest = fingerprints[0] || null;
  return {
    latestFingerprint: latest,
    deviceId: latest?.deviceId || '',
    hardwareId: latest?.hardwareId || '',
    deviceFingerprintId: latest?.deviceFingerprintId || '',
    serverFingerprintId: latest?.serverFingerprintId || '',
    appId: latest?.appId || '',
    sessionToken: latest?.sessionToken || '',
    lastSeen: latest?.lastSeen || latest?.createdAt || null,
    sessionCount: fingerprints.length,
  };
}

function noStore(data: any, status = 200) {
  const response = NextResponse.json(data, { status });
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  return response;
}

function orderMatchesCustomer(o: any, c: any) {
  return o.customer_id === c.id ||
    Boolean(c.tg_user_id && o.tg_user_id === c.tg_user_id) ||
    Boolean(c.prime_member_id && o.prime_member_id === c.prime_member_id);
}

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) return noStore({ error: 'Supabase is not configured.' }, 400);
    const supabase = getSupabaseAdmin()!;
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('id');

    if (customerId) {
      let customer = (await supabase.from('customers').select('*').eq('id', customerId).maybeSingle()).data;
      if (!customer) customer = (await supabase.from('customers').select('*').eq('prime_member_id', customerId).maybeSingle()).data;
      if (!customer) customer = (await supabase.from('customers').select('*').eq('tg_user_id', customerId).maybeSingle()).data;
      if (!customer) return noStore({ error: 'Customer not found' }, 404);

      const fingerprints = sortFingerprints(customer.fingerprints);
      const filters = [
        `customer_id.eq.${customer.id}`,
        customer.prime_member_id ? `prime_member_id.eq.${customer.prime_member_id}` : '',
        customer.tg_user_id ? `tg_user_id.eq.${customer.tg_user_id}` : '',
      ].filter(Boolean).join(',');
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders').select('*').or(filters).order('created_at', { ascending: false }).limit(100);
      if (ordersError) throw ordersError;

      const orders = (ordersData || []).map((o: any) => ({
        id: o.id, orderNumber: o.order_number, status: o.status, totalAmount: o.total_amount,
        subTotal: o.subtotal ?? o.sub_total, promoDiscount: o.discount_amount ?? o.promo_discount,
        storeCreditsUsed: o.store_credits_used ?? o.applied_store_credits, createdAt: o.created_at, deliveredAt: o.delivered_at,
        deviceSnapshot: o.fingerprint_snapshot || o.device_snapshot || null,
        deviceId: o.fingerprint_snapshot?.deviceId || null,
        hardwareId: o.fingerprint_snapshot?.hardwareId || null,
        deviceFingerprintId: o.fingerprint_snapshot?.deviceFingerprintId || null,
        serverFingerprintId: o.fingerprint_snapshot?.serverFingerprintId || null,
        appliedPromoCode: o.applied_promo_code || null,
        paymentStatus: o.payment_status || null,
        paymentDeadlineAt: o.payment_deadline_at || null,
        expiredAt: o.expired_at || null,
        customerId: o.customer_id,
        tgUserId: o.tg_user_id, primeMemberId: o.prime_member_id,
      }));
      const completedOrders = orders.filter((o: any) => ['delivered', 'completed'].includes(String(o.status || '').toLowerCase()));
      const tierInfo = calculateCustomerTier(completedOrders);

      const identifiers = new Set(fingerprints.flatMap((fp: any) => [
        fp.deviceId,
        fp.hardwareId,
        fp.deviceFingerprintId,
      ].filter(Boolean).map(String)));
      const { data: others, error: othersError } = await supabase
        .from('customers').select('id,tg_user_id,tg_name,tg_username,prime_member_id,phone_number,fingerprints').neq('id', customer.id);
      if (othersError) throw othersError;
      const sharedAccounts = (others || [])
        .filter((other: any) => sortFingerprints(other.fingerprints).some((fp: any) =>
          [fp.deviceId, fp.hardwareId, fp.deviceFingerprintId].filter(Boolean).some((id: any) => identifiers.has(String(id)))
        ))
        .map((other: any) => ({ id: other.id, name: other.tg_name || '', username: other.tg_username || '', memberId: other.prime_member_id || '', tgUserId: other.tg_user_id || '' }));

      return noStore({
        customer: {
          id: customer.id, tgUserId: customer.tg_user_id, tgName: customer.tg_name, tgUsername: customer.tg_username,
          primeMemberId: customer.prime_member_id, phone: customer.phone_number ?? customer.phone ?? '', photoUrl: customer.photo_url ?? '',
          points: Number(customer.points || 0), purchasingPoints: Number(customer.points || 0), referralPoints: Number(customer.referral_points || 0),
          storeCredits: Number(customer.store_credits || 0), tier: tierInfo.tier, tierInfo, fingerprints,
          ...telemetryFrom(fingerprints), sharedAccounts, sharedAccountCount: sharedAccounts.length,
          isPromoFraudRisk: sharedAccounts.length > 0, role: customer.role || 'customer', isPremium: Boolean(customer.is_premium),
          updatedAt: customer.updated_at, createdAt: customer.created_at,
        },
        fingerprints, orders, fetchedAt: new Date().toISOString(),
      });
    }

    const { data: customersData, error } = await supabase.from('customers').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    const { data: allOrdersData, error: ordersError } = await supabase
      .from('orders').select('id,customer_id,tg_user_id,prime_member_id,total_amount,subtotal,status,created_at,delivered_at');
    if (ordersError) throw ordersError;
    const allOrders = allOrdersData || [];

    const deviceOwners = new Map<string, Set<string>>();
    for (const c of customersData || []) {
      for (const fp of sortFingerprints(c.fingerprints)) {
        for (const identifier of [fp.deviceId, fp.hardwareId].filter(Boolean).map(String)) {
          if (!deviceOwners.has(identifier)) deviceOwners.set(identifier, new Set());
          deviceOwners.get(identifier)!.add(c.id);
        }
      }
    }

    const users = (customersData || []).map((c: any) => {
      const customerOrders = allOrders.filter((o: any) => orderMatchesCustomer(o, c));
      const fingerprints = sortFingerprints(c.fingerprints);
      const telemetry = telemetryFrom(fingerprints);
      const identifiers = new Set(fingerprints.flatMap((fp: any) => [fp.deviceId, fp.hardwareId].filter(Boolean).map(String)));
      const sharedAccountCount = Array.from(identifiers).reduce((max, id) => Math.max(max, Math.max(0, (deviceOwners.get(id)?.size || 1) - 1)), 0);
      const completed = customerOrders
        .filter((o: any) => ['delivered', 'completed'].includes(String(o.status || '').toLowerCase()))
        .map((o: any) => ({
          subTotal: Number(o.subtotal ?? 0),
          totalAmount: Number(o.total_amount ?? 0),
          createdAt: o.created_at,
          deliveredAt: o.delivered_at,
        }));
      return {
        id:c.id, tgUserId:c.tg_user_id, tgName:c.tg_name, tgUsername:c.tg_username, primeMemberId:c.prime_member_id,
        phone:c.phone_number ?? c.phone ?? '', photoUrl:c.photo_url ?? '', role:c.role || 'customer', isPremium:Boolean(c.is_premium),
        tier:calculateCustomerTier(completed).tier, storeCredits:Number(c.store_credits||0), purchasingPoints:Number(c.points||0), referralPoints:Number(c.referral_points||0),
        ...telemetry, orderCount:customerOrders.length, totalSpent:customerOrders.reduce((sum:number,o:any)=>sum+(Number(o.total_amount)||0),0),
        lastActive:telemetry.lastSeen || c.updated_at || c.created_at, isPromoFraudRisk:sharedAccountCount>0, sharedAccountCount,
        updatedAt:c.updated_at, createdAt:c.created_at,
      };
    });

    return noStore(users);
  } catch (error: any) {
    console.error('Admin customer telemetry query failed:', error);
    return noStore({ error: error?.message || 'Unable to load customers.' }, 500);
  }
}
