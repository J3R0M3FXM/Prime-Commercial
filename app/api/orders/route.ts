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

    // The database is the final authority for product availability and variant stock.
    // This RPC locks each product row, validates current stock, decrements it, and
    // inserts the order in one transaction. Frontend quantities/configuration are
    // never trusted as the source of inventory truth.
    const orderForInventory = {
      id: orderNumber,
      customerId: resolvedCustomerId,
      customerName: authenticatedCustomer.tg_name || customerName || receiverName || '',
      customerPhone: receiverPhone || '',
      tgUserId: String(authenticatedCustomer.tg_user_id || ''),
      primeMemberId: finalMemberId || '',
      items: items || [],
      subtotal: Number(subTotal) || 0,
      deliveryFee: Number(deliveryFee) || 0,
      discountAmount: Number(body.discountAmount) || 0,
      appliedPromoCode: promoCode || '',
      pointsDiscount: Number(body.pointsDiscount) || 0,
      chargesBreakdown: appliedCharges || [],
      totalAmount: Number(totalAmount) || 0,
      payableNow: Number(payableNow) || Number(totalAmount) || 0,
      payableOnDelivery: Number(payableOnDelivery) || 0,
      status: 'Pending',
      paymentStatus: body.paymentProofImage ? 'Pending Review' : 'Unpaid',
      paymentMethodId: body.paymentMethodId || '',
      paymentMethodName: body.paymentMethodName || '',
      paymentProofImage: body.paymentProofImage || '',
      ocrAnalysis: body.ocrAnalysis || null,
      deliveryAddress: deliveryAddress || {},
      courierId: courier || '',
      courierName: body.courierName || '',
      trackingNumber: body.trackingNumber || '',
      notes: notes || '',
      fingerprintSnapshot: body.fingerprintSnapshot || body.deviceSnapshot || null,
    };

    const { data: inventoryOrder, error: inventoryError } = await supabase.rpc(
      'create_order_with_inventory',
      {
        p_order: orderForInventory,
        p_order_number: orderNumber,
      }
    );

    if (inventoryError) {
      console.error('Atomic inventory/order validation failed:', inventoryError);
      const isInventoryConflict =
        inventoryError.code === 'P0002' ||
        /insufficient stock|no longer available|no longer active|selected variant/i.test(inventoryError.message || '');
      const status = isInventoryConflict ? 409 : 500;
      return NextResponse.json(
        { error: inventoryError.message || 'Inventory validation failed. Please refresh and try again.' },
        {
          status,
          headers: {
            'Cache-Control': 'no-store',
            'Pragma': 'no-cache',
          },
        }
      );
    }

    cacheStore.invalidateOrders();

    // Telegram delivery is intentionally non-blocking for order persistence.
    void notifyOrderCreated({
      chatId: authenticatedCustomer.tg_user_id,
      orderNumber,
      status: orderForInventory.status,
      customerName: orderForInventory.customerName,
      totalAmount: orderForInventory.totalAmount,
      payableNow: orderForInventory.payableNow,
      items: inventoryOrder?.items || orderForInventory.items,
      event: 'created',
    });

    return NextResponse.json({
      success: true,
      id: orderNumber,
      orderNumber,
      ...body,
      items: inventoryOrder?.items || body.items,
    }, {
      headers: {
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      },
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
