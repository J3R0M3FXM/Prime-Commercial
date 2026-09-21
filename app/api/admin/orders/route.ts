import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { cacheStore } from '@/lib/cache';
import { notifyOrderStatusChanged, notifyPaymentUpdated } from '@/lib/telegram-notifications';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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
        const { data: existingOrder, error: lookupError } = await supabase
          .from('orders')
          .select('id, order_number, customer_name, tg_user_id, total_amount, payable_now, courier_name, tracking_number, status, payment_status')
          .or(`id.eq.${orderId},order_number.eq.${orderId}`)
          .limit(1)
          .maybeSingle();

        if (lookupError) {
          failures.push({ id: orderId, error: lookupError.message });
          continue;
        }

        const { error } = await supabase
          .from('orders')
          .update({ status, updated_at: new Date().toISOString() })
          .or(`id.eq.${orderId},order_number.eq.${orderId}`);

        if (error) {
          failures.push({ id: orderId, error: error.message });
        } else {
          results.push(orderId);
          if (existingOrder && existingOrder.status !== status) {
            void notifyOrderStatusChanged({
              chatId: existingOrder.tg_user_id,
              orderNumber: existingOrder.order_number || existingOrder.id,
              status,
              customerName: existingOrder.customer_name,
              totalAmount: Number(existingOrder.total_amount) || 0,
              payableNow: Number(existingOrder.payable_now) || 0,
              courierName: existingOrder.courier_name,
              trackingNumber: existingOrder.tracking_number,
              event: 'status',
            });
          }
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

    const { data: existingOrder, error: existingOrderError } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, tg_user_id, total_amount, payable_now, courier_name, tracking_number, status, payment_status')
      .or(`id.eq.${id},order_number.eq.${id}`)
      .limit(1)
      .maybeSingle();
    if (existingOrderError) throw existingOrderError;
    if (!existingOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const updateData: any = { updated_at: new Date().toISOString() };
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (paymentStatus !== undefined) updateData.payment_status = paymentStatus;
    if (trackingNumber !== undefined) updateData.tracking_number = trackingNumber;
    if (totalAmount !== undefined) updateData.total_amount = Number(totalAmount);

    const { error } = await supabase.from('orders').update(updateData).or(`id.eq.${id},order_number.eq.${id}`);
    if (error) throw error;

    cacheStore.invalidateOrders();

    const resolvedOrderNumber = existingOrder.order_number || existingOrder.id;
    const changedStatus = status !== undefined && existingOrder.status !== status;
    const changedTracking = trackingNumber !== undefined && (existingOrder.tracking_number || '') !== (trackingNumber || '');
    const changedPayment = paymentStatus !== undefined && existingOrder.payment_status !== paymentStatus;

    if (changedStatus || changedTracking) {
      void notifyOrderStatusChanged({
        chatId: existingOrder.tg_user_id,
        orderNumber: resolvedOrderNumber,
        status: status !== undefined ? status : existingOrder.status,
        customerName: existingOrder.customer_name,
        totalAmount: totalAmount !== undefined ? Number(totalAmount) : Number(existingOrder.total_amount) || 0,
        payableNow: Number(existingOrder.payable_now) || 0,
        courierName: existingOrder.courier_name,
        trackingNumber: trackingNumber !== undefined ? trackingNumber : existingOrder.tracking_number,
        event: 'status',
      });
    }

    if (changedPayment) {
      void notifyPaymentUpdated({
        chatId: existingOrder.tg_user_id,
        orderNumber: resolvedOrderNumber,
        status: status !== undefined ? status : existingOrder.status,
        totalAmount: totalAmount !== undefined ? Number(totalAmount) : Number(existingOrder.total_amount) || 0,
        paymentStatus,
        event: 'payment',
      });
    }

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
