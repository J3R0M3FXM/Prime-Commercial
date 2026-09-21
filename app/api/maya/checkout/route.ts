import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getAuthenticatedCustomer } from '@/lib/authenticated-customer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function mayaCheckoutUrl() {
  const environment = (process.env.MAYA_ENVIRONMENT || 'production').toLowerCase();
  return environment === 'sandbox'
    ? 'https://pg-sandbox.paymaya.com/checkout/v1/checkouts'
    : 'https://pg.maya.ph/checkout/v1/checkouts';
}

function splitName(name: string) {
  const parts = String(name || 'Customer').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || 'Customer', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function asCheckoutItems(items: any[]) {
  return (Array.isArray(items) ? items : []).slice(0, 100).map((item, index) => {
    const quantity = Math.max(1, Number(item?.quantity) || 1);
    const unitPrice = Math.max(0, Number(item?.price) || 0);
    const total = Math.round(unitPrice * quantity * 100) / 100;
    return {
      name: String(item?.name || `Item ${index + 1}`).slice(0, 100),
      code: String(item?.productId || item?.id || `ITEM-${index + 1}`).slice(0, 64),
      description: String(item?.variantId || '').slice(0, 100),
      quantity: String(quantity),
      amount: { value: unitPrice, currency: 'PHP' },
      totalAmount: { value: total, currency: 'PHP' },
    };
  });
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedCustomer(request);
    if (auth.error || !auth.customer) {
      return NextResponse.json({ error: auth.error || 'Telegram authentication required' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    const paymentMethodId = String(body?.paymentMethodId || '').trim();

    if (!orderId || !paymentMethodId) {
      return NextResponse.json({ error: 'Order ID and Maya payment method are required.' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500 });
    }

    const supabase = getSupabaseAdmin()!;

    const [{ data: order, error: orderError }, { data: method, error: methodError }] = await Promise.all([
      supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('customer_id', auth.customer.id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('payment_methods')
        .select('id,name,payment_type,public_key,is_active')
        .eq('id', paymentMethodId)
        .limit(1)
        .maybeSingle(),
    ]);

    if (orderError) throw orderError;
    if (methodError) throw methodError;

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (!method || method.is_active !== true || method.payment_type !== 'api') {
      return NextResponse.json({ error: 'Selected Maya payment method is unavailable.' }, { status: 400 });
    }

    const publicKey = String(method.public_key || '').trim();
    if (!publicKey) {
      return NextResponse.json({ error: 'Maya public API key is not configured for this payment method.' }, { status: 500 });
    }

    const payableNow = Math.round(Number(order.payable_now) * 100) / 100;
    if (!Number.isFinite(payableNow) || payableNow <= 0) {
      return NextResponse.json({ error: 'This order has no outstanding Maya payment.' }, { status: 400 });
    }

    const requestReferenceNumber = String(order.order_number || order.id || '').slice(0, 36);
    if (!requestReferenceNumber) {
      return NextResponse.json({ error: 'Order reference is missing.' }, { status: 500 });
    }

    const customerName = String(auth.customer.tg_name || order.customer_name || 'Customer');
    const { firstName, lastName } = splitName(customerName);
    const origin = new URL(request.url).origin;
    const resultBase = `${origin}/payment/maya/result?order=${encodeURIComponent(requestReferenceNumber)}`;

    const payload = {
      totalAmount: {
        value: payableNow,
        currency: 'PHP',
      },
      buyer: {
        firstName,
        lastName,
        contact: {
          phone: String(auth.customer.phone_number || order.customer_phone || '').replace(/\s+/g, ''),
        },
      },
      items: asCheckoutItems(order.items),
      redirectUrl: {
        success: `${resultBase}&result=success`,
        failure: `${resultBase}&result=failure`,
        cancel: `${resultBase}&result=cancel`,
      },
      requestReferenceNumber,
      metadata: {
        primeOrderId: String(order.id),
        primePaymentMethodId: String(method.id),
        primePaymentMethodName: String(method.name),
      },
    };

    const authorization = Buffer.from(`${publicKey}:`).toString('base64');
    const response = await fetch(mayaCheckoutUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const responseBody = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('[MAYA CREATE CHECKOUT FAILED]', {
        status: response.status,
        orderId: order.id,
        paymentMethodId: method.id,
        response: responseBody,
      });
      return NextResponse.json(
        { error: responseBody?.message || responseBody?.error || 'Maya Checkout could not be created.' },
        { status: 502 }
      );
    }

    const mayaPaymentId = String(responseBody?.checkoutId || responseBody?.id || '').trim();
    const mayaRedirectUrl = String(responseBody?.redirectUrl || '').trim();

    if (!mayaPaymentId || !mayaRedirectUrl) {
      console.error('[MAYA CREATE CHECKOUT INVALID RESPONSE]', {
        orderId: order.id,
        response: responseBody,
      });
      return NextResponse.json({ error: 'Maya returned an invalid checkout response.' }, { status: 502 });
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        payment_method_id: method.id,
        payment_method_name: method.name,
        payment_status: 'Awaiting Maya Payment',
        review_status: 'Awaiting Maya Payment',
        requires_manual_review: false,
        maya_payment_id: mayaPaymentId,
        maya_request_reference_number: requestReferenceNumber,
        maya_last_webhook_status: null,
        maya_last_webhook_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('customer_id', auth.customer.id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: requestReferenceNumber,
      paymentMethod: method.name,
      checkoutId: mayaPaymentId,
      redirectUrl: mayaRedirectUrl,
    }, {
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('[MAYA CREATE CHECKOUT ERROR]', error);
    return NextResponse.json({ error: error?.message || 'Failed to create Maya Checkout.' }, { status: 500 });
  }
}
