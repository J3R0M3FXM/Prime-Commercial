import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { cacheStore } from '@/lib/cache';
import { getAuthenticatedCustomer } from '@/lib/authenticated-customer';
import { notifyOrderCreated, notifyPaymentUpdated } from '@/lib/telegram-notifications';

export const dynamic = 'force-dynamic';

function getOrderNumber(): string {
  const d = new Date();
  const pht = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const DD = pad(pht.getUTCDate());
  const MM = pad(pht.getUTCMonth() + 1);
  const YY = pht.getUTCFullYear().toString().slice(-2);
  const HH = pad(pht.getUTCHours());
  const MIN = pad(pht.getUTCMinutes());
  const SS = pad(pht.getUTCSeconds());
  return `${DD}${MM}${YY}${HH}${MIN}${SS}`;
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedCustomer(request);
    if (auth.error || !auth.customer) {
      return NextResponse.json({ error: auth.error || 'Telegram authentication required' }, { status: 401 });
    }
    const authenticatedCustomer = auth.customer;

    const body = await request.json();
    const {
      items,
      customerName,
      primeMemberId, 
      subTotal,
      appliedCharges,
      totalAmount, 
      receiverName,
      receiverPhone,
      deliveryAddress,
      courier,
      deliveryFee,
      payableNow,
      payableOnDelivery,
      promoCode,
      notes 
    } = body;

    if (!items || !items.length) {
      return NextResponse.json({ error: 'Cart items are required' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;

    const resolvedCustomerId = authenticatedCustomer.id;
    const finalMemberId = authenticatedCustomer.prime_member_id || '';

    const orderNumber = getOrderNumber();
    const payload = {
      id: orderNumber,
      order_number: orderNumber,
      customer_id: resolvedCustomerId,
      customer_name: authenticatedCustomer.tg_name || customerName || receiverName || '',
      customer_phone: receiverPhone || '',
      tg_user_id: String(authenticatedCustomer.tg_user_id || ''),
      prime_member_id: finalMemberId || '',
      items: items || [],
      subtotal: Number(subTotal) || 0,
      delivery_fee: Number(deliveryFee) || 0,
      discount_amount: Number(body.discountAmount) || 0,
      applied_promo_code: promoCode || '',
      points_discount: Number(body.pointsDiscount) || 0,
      charges_breakdown: appliedCharges || [],
      total_amount: Number(totalAmount) || 0,
      payable_now: Number(payableNow) || Number(totalAmount) || 0,
      payable_on_delivery: Number(payableOnDelivery) || 0,
      status: 'Pending',
      payment_status: body.paymentProofImage ? 'Pending Review' : 'Unpaid',
      payment_method_id: body.paymentMethodId || '',
      payment_method_name: body.paymentMethodName || '',
      payment_proof_image: body.paymentProofImage || '',
      ocr_analysis: body.ocrAnalysis || null,
      review_status: 'Pending Manual Review',
      requires_manual_review: true,
      delivery_address: deliveryAddress || {},
      courier_id: courier || '',
      courier_name: body.courierName || '',
      notes: notes || '',
      fingerprint_snapshot: body.fingerprintSnapshot || body.deviceSnapshot || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('orders').insert([payload]);
    if (error) throw error;

    cacheStore.invalidateOrders();

    // Telegram delivery is intentionally non-blocking for order persistence.
    void notifyOrderCreated({
      chatId: authenticatedCustomer.tg_user_id,
      orderNumber,
      status: payload.status,
      customerName: payload.customer_name,
      totalAmount: payload.total_amount,
      payableNow: payload.payable_now,
      items: payload.items,
      event: 'created',
    });

    return NextResponse.json({ 
      success: true, 
      id: orderNumber, 
      orderNumber,
      ...body 
    });
  } catch (error: any) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedCustomer(request);
    if (auth.error || !auth.customer) {
      return NextResponse.json({ error: auth.error || 'Telegram authentication required' }, { status: 401 });
    }
    const authenticatedCustomer = auth.customer;

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId') || searchParams.get('id');
    const orderNumber = searchParams.get('orderNumber');

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;

    if (orderId || orderNumber) {
      const target = orderId || orderNumber;
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .or(`id.eq.${target},order_number.eq.${target}`)
        .eq('customer_id', authenticatedCustomer.id)
        .limit(1)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      return NextResponse.json({ id: data.id, ...data });
    }

    const { data: customerOrders, error: customerOrdersError } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', authenticatedCustomer.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (customerOrdersError) throw customerOrdersError;
    return NextResponse.json(customerOrders || []);

  } catch (error: any) {
    if (cacheStore.orders) {
      return NextResponse.json(cacheStore.orders);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await getAuthenticatedCustomer(request);
    if (auth.error || !auth.customer) {
      return NextResponse.json({ error: auth.error || 'Telegram authentication required' }, { status: 401 });
    }

    const data = await request.json();
    const {
      orderId,
      paymentMethodId,
      paymentMethodName,
      paymentProofImage,
      ocrAnalysis,
    } = data;

    if (!orderId) {
      return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;

    const updatePayload: Record<string, any> = {
      payment_method_id: paymentMethodId || '',
      payment_method_name: paymentMethodName || '',
      payment_proof_image: paymentProofImage || '',
      payment_status: 'Pending Review',
      review_status: 'Pending Manual Review',
      requires_manual_review: true,
      updated_at: new Date().toISOString()
    };

    if (ocrAnalysis) {
      updatePayload.ocr_analysis = ocrAnalysis;
    }

    const { error } = await supabase
      .from('orders')
.update(updatePayload)
      .or(`id.eq.${orderId},order_number.eq.${orderId}`)
      .eq('customer_id', auth.customer.id);

    if (error) throw error;

    cacheStore.invalidateOrders();

    void notifyPaymentUpdated({
      chatId: auth.customer.tg_user_id,
      orderNumber: String(orderId),
      status: 'Pending',
      totalAmount: Number(data.totalAmount) || undefined,
      paymentStatus: 'Pending Review',
      event: 'payment',
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating order payment proof:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
