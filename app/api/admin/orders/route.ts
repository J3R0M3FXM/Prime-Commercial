import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { cacheStore } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = Date.now();
    const { searchParams } = new URL(request.url);
    const forceFresh = searchParams.has('_fresh');
    if (!forceFresh && cacheStore.adminOrders && (now - cacheStore.lastAdminOrdersFetchTime < 60000)) {
      return NextResponse.json(cacheStore.adminOrders);
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(150);

    if (error) throw error;

    const orders = (data || []).map(o => ({
      id: o.id,
      orderNumber: o.order_number,
      customerId: o.customer_id,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      tgUserId: o.tg_user_id,
      primeMemberId: o.prime_member_id,
      items: o.items,
      subTotal: Number(o.subtotal || o.sub_total || 0),
      deliveryFee: Number(o.delivery_fee || 0),
      discountAmount: Number(o.discount_amount || 0),
      appliedPromoCode: o.applied_promo_code,
      pointsDiscount: Number(o.points_discount || 0),
      chargesBreakdown: o.charges_breakdown,
      totalAmount: Number(o.total_amount || 0),
      payableNow: Number(o.payable_now || 0),
      payableOnDelivery: Number(o.payable_on_delivery || 0),
      status: o.status,
      paymentStatus: o.payment_status,
      paymentMethodId: o.payment_method_id,
      paymentMethodName: o.payment_method_name,
      paymentProofImage: o.payment_proof_image,
      ocrAnalysis: o.ocr_analysis,
      reviewStatus: o.review_status,
      requiresManualReview: o.requires_manual_review,
      deliveryAddress: o.delivery_address,
      courierId: o.courier_id,
      courierName: o.courier_name,
      trackingNumber: o.tracking_number,
      notes: o.notes,
      createdAt: o.created_at,
      updatedAt: o.updated_at
    }));

    cacheStore.adminOrders = orders;
    cacheStore.lastAdminOrdersFetchTime = now;

    return NextResponse.json(orders);
  } catch (error: any) {
    if (cacheStore.adminOrders) {
      return NextResponse.json(cacheStore.adminOrders);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;

    if (Array.isArray(body.ids) && body.ids.length > 0 && body.status) {
      const { ids, status } = body;
      const results: string[] = [];
      const failures: { id: string; error: string }[] = [];
      for (const orderId of ids) {
        const { error } = await supabase
          .from('orders')
          .update({ status, updated_at: new Date().toISOString() })
          .or(`id.eq.${orderId},order_number.eq.${orderId}`);
        if (error) {
          failures.push({ id: orderId, error: error.message });
        } else {
          results.push(orderId);
        }
      }
      cacheStore.invalidateOrders();
      if (failures.length > 0) {
        return NextResponse.json(
          { error: `Failed to update ${failures.length} of ${ids.length} orders`, updatedCount: results.length, ids: results, failures },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true, updatedCount: results.length, ids: results });
    }

    const { id, status, notes, paymentStatus, trackingNumber, totalAmount } = body;
    if (!id) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });

    const updateData: any = { updated_at: new Date().toISOString() };
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (paymentStatus !== undefined) updateData.payment_status = paymentStatus;
    if (trackingNumber !== undefined) updateData.tracking_number = trackingNumber;
    if (totalAmount !== undefined) updateData.total_amount = Number(totalAmount);

    const { error } = await supabase.from('orders').update(updateData).or(`id.eq.${id},order_number.eq.${id}`);
    if (error) throw error;

    cacheStore.invalidateOrders();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const { error } = await supabase.from('orders').delete().or(`id.eq.${id},order_number.eq.${id}`);
    if (error) throw error;

    cacheStore.invalidateOrders();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
