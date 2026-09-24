import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { cacheStore } from '@/lib/cache';
import { getAuthenticatedCustomer } from '@/lib/authenticated-customer';
import { notifyOrderCreated, notifyPaymentUpdated } from '@/lib/telegram-notifications';
import { getChargesFromDb } from '@/lib/db-adapter';
import { buildDeviceFingerprintId, getRequestClientIp, getServerFingerprintId, resolveTrustedFingerprint } from '@/lib/fingerprint';
import { calculateChargesBreakdown } from '@/lib/charges';
import { calculateDeliveryFee, calculateRoadDistanceFallback } from '@/lib/delivery-fee';

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

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function extractProductId(item: any): string {
  const explicit = String(item?.productId || item?.product_id || '').trim();
  if (explicit) return explicit;
  const rawId = String(item?.id || '').trim();
  if (!rawId) return '';
  return rawId.includes('_') ? rawId.split('_')[0] : rawId;
}

function extractVariantId(item: any): string {
  const explicit = String(item?.variantId || item?.variant_id || '').trim();
  if (explicit) return explicit;
  const rawId = String(item?.id || '').trim();
  return rawId.includes('_') ? (rawId.split('_')[1] || 'default') : 'default';
}

async function canonicalizeCart(supabase: any, inputItems: any[]) {
  if (!Array.isArray(inputItems) || inputItems.length === 0) {
    throw new Error('Cart items are required.');
  }
  if (inputItems.length > 100) {
    throw new Error('Cart contains too many distinct items.');
  }

  const productIds = Array.from(new Set(inputItems.map(extractProductId).filter(Boolean)));
  if (productIds.length === 0) {
    throw new Error('Each cart item must identify a product.');
  }

  const { data: products, error } = await supabase
    .from('products')
    .select('id,name,price,is_active,bundle_config,image_url')
    .in('id', productIds);

  if (error) throw error;

  const productMap = new Map<string, any>((products || []).map((product: any) => [String(product.id), product]));
  const canonicalItems: any[] = [];
  let subtotal = 0;
  let itemCount = 0;

  for (const rawItem of inputItems) {
    const productId = extractProductId(rawItem);
    const variantId = extractVariantId(rawItem);
    const product = productMap.get(productId);

    if (!product) {
      throw new Error('One or more cart products are no longer available.');
    }
    if (product.is_active !== true) {
      throw new Error(`Product "${product.name}" is no longer available.`);
    }

    const quantity = Math.min(1000, Math.max(1, Math.floor(toFiniteNumber(rawItem?.quantity, 1))));
    const bundle = product.bundle_config && typeof product.bundle_config === 'object'
      ? product.bundle_config
      : {};
    const variants = Array.isArray(bundle.variants) ? bundle.variants : [];

    let price = Math.max(0, toFiniteNumber(product.price, 0));
    let imageUrl = String(product.image_url || '');

    if (variants.length > 0) {
      const variant = variants.find((candidate: any) => String(candidate?.id || '') === variantId);
      if (!variant) {
        throw new Error(`Selected variant for "${product.name}" is no longer available.`);
      }
      price = Math.max(0, toFiniteNumber(variant.price, price));
      imageUrl = String(variant.imageUrl || variant.image_url || imageUrl || '');
    }

    subtotal += price * quantity;
    itemCount += quantity;

    canonicalItems.push({
      id: rawItem?.id || `${productId}_${variantId}`,
      productId,
      variantId,
      name: String(product.name || rawItem?.name || 'Item'),
      price,
      originalPrice: price,
      quantity,
      imageUrl,
      isFree: price === 0,
    });
  }

  return {
    items: canonicalItems,
    subtotal: Math.round(Math.max(0, subtotal) * 100) / 100,
    itemCount,
  };
}

async function calculateServerDelivery(
  supabase: any,
  destinationLat: number,
  destinationLon: number,
  courierId: string
) {
  if (
    !Number.isFinite(destinationLat) ||
    !Number.isFinite(destinationLon) ||
    destinationLat < -90 ||
    destinationLat > 90 ||
    destinationLon < -180 ||
    destinationLon > 180
  ) {
    throw new Error('A valid delivery location is required.');
  }

  const [{ data: warehouses, error: warehouseError }, { data: couriers, error: courierError }] = await Promise.all([
    supabase
      .from('warehouses')
      .select('id,name,address,latitude,longitude,is_active,is_default,sort_order')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('sort_order', { ascending: true }),
    supabase
      .from('couriers')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ]);

  if (warehouseError) throw warehouseError;
  if (courierError) throw courierError;

  const warehouse = (warehouses || []).find(
    (row: any) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
  );
  if (!warehouse) {
    throw new Error('No active warehouse with valid coordinates is configured.');
  }

  const courierRows = (couriers || []).map((courier: any) => ({
    id: String(courier.id),
    name: String(courier.name || ''),
    type: String(courier.type || 'Standard'),
    logo: String(courier.logo || ''),
    baseFare: toFiniteNumber(courier.base_fare),
    firstMile: toFiniteNumber(courier.first_mile),
    firstMileFee: toFiniteNumber(courier.first_mile_fee),
    exceedingKmFee: toFiniteNumber(courier.exceeding_km_fee),
    surcharge: toFiniteNumber(courier.surcharge),
    nightDifferential: toFiniteNumber(courier.night_differential),
  }));

  if (courierRows.length === 0) {
    throw new Error('No active couriers are configured.');
  }

  const selected = courierRows.find((courier: any) => courier.id === courierId);
  if (!selected) {
    throw new Error('Selected courier is no longer available.');
  }

  const originLat = Number(warehouse.latitude);
  const originLon = Number(warehouse.longitude);
  let distanceKm: number | null = null;

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (apiKey) {
    try {
      const routingUrl =
        'https://api.geoapify.com/v1/routing' +
        `?waypoints=${encodeURIComponent(`${originLat},${originLon}|${destinationLat},${destinationLon}`)}` +
        `&mode=drive&apiKey=${encodeURIComponent(apiKey)}`;
      const routeRes = await fetch(routingUrl, { cache: 'no-store' });
      if (routeRes.ok) {
        const routeData = await routeRes.json();
        const meters = Number(routeData?.features?.[0]?.properties?.distance);
        if (Number.isFinite(meters) && meters >= 0) distanceKm = meters / 1000;
      }
    } catch (error) {
      console.warn('Geoapify routing unavailable; using distance fallback.', error);
    }
  }

  if (distanceKm === null) {
    distanceKm = calculateRoadDistanceFallback(originLat, originLon, destinationLat, destinationLon);
  }

  const roundedDistance = Math.round(Math.max(0, distanceKm) * 100) / 100;

  return {
    courier: selected,
    distanceKm: roundedDistance,
    deliveryFee: calculateDeliveryFee(selected, roundedDistance),
  };
}

function mapOrderError(error: any) {
  const message = String(error?.message || error || 'Order validation failed.');
  const code = String(error?.code || '');
  const inventory = code === 'P0002' || /insufficient stock|no longer available|selected variant/i.test(message);
  const conflict = inventory || /already redeemed|usage limit|promo abuse|restricted to|not valid for|not applicable/i.test(message);
  return {
    status: inventory ? 409 : conflict ? 409 : 400,
    message,
  };
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedCustomer(request);
    if (auth.error || !auth.customer) {
      return NextResponse.json(
        { error: auth.error || 'Telegram authentication required' },
        { status: 401 }
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
    }

    const body = await request.json();
    const supabase = getSupabaseAdmin()!;

    const deliveryAddress = body?.deliveryAddress && typeof body.deliveryAddress === 'object'
      ? body.deliveryAddress
      : null;

    const destinationLat = toFiniteNumber(deliveryAddress?.lat, NaN);
    const destinationLon = toFiniteNumber(deliveryAddress?.lon, NaN);
    const courierInput = body?.courier;
    const courierId = String(
      typeof courierInput === 'string' ? courierInput : courierInput?.id || ''
    ).trim();

    // Canonical field is deliveryPaymentMethod. Accept known legacy aliases while
    // older cached clients roll forward, then use the already-calculated
    // payableOnDelivery split as a compatibility fallback when the field is absent.
    const rawDeliveryPaymentMethod =
      body?.deliveryPaymentMethod ??
      body?.deliveryFeePaymentMethod ??
      body?.delivery_payment_method ??
      body?.delivery_fee_payment_method ??
      '';
    let deliveryPaymentMethod = String(rawDeliveryPaymentMethod).trim().toLowerCase();

    if (deliveryPaymentMethod !== 'upon_checkout' && deliveryPaymentMethod !== 'upon_delivery') {
      const submittedPayableOnDelivery = toFiniteNumber(body?.payableOnDelivery, NaN);
      const submittedDeliveryFee = Math.max(0, toFiniteNumber(body?.deliveryFee, 0));

      if (submittedDeliveryFee > 0 && Number.isFinite(submittedPayableOnDelivery)) {
        deliveryPaymentMethod =
          submittedPayableOnDelivery > 0 ? 'upon_delivery' : 'upon_checkout';
      }
    }

    if (!courierId) {
      return NextResponse.json({ error: 'A courier must be selected.' }, { status: 400 });
    }
    if (deliveryPaymentMethod !== 'upon_checkout' && deliveryPaymentMethod !== 'upon_delivery') {
      return NextResponse.json({ error: 'A valid delivery payment method is required.' }, { status: 400 });
    }
    if (!deliveryAddress || !Number.isFinite(destinationLat) || !Number.isFinite(destinationLon)) {
      return NextResponse.json({ error: 'A valid delivery address and map location are required.' }, { status: 400 });
    }

    const cart = await canonicalizeCart(supabase, body?.items);
    const delivery = await calculateServerDelivery(
      supabase,
      destinationLat,
      destinationLon,
      courierId
    );

    const charges = await getChargesFromDb();
    const { computedCharges } = calculateChargesBreakdown(
      charges,
      cart.subtotal,
      { date: new Date(), timezone: 'Asia/Manila' }
    );

    const finalMemberId = String(auth.customer.prime_member_id || '');
    const requestedReferralCode = String(body?.referralCode || '').trim().toUpperCase();
    let referrerUserId = '';
    let referrerMemberId = '';

    if (!auth.customer.referred_by_member_id && requestedReferralCode) {
      const { data: referrer, error: referrerError } = await supabase
        .from('customers')
        .select('id,prime_member_id')
        .eq('prime_member_id', requestedReferralCode)
        .maybeSingle();

      if (referrerError) throw referrerError;
      if (!referrer) {
        return NextResponse.json({ error: 'Invalid referral code.' }, { status: 400 });
      }
      if (referrer.id === auth.customer.id) {
        return NextResponse.json({ error: 'You cannot use your own referral code.' }, { status: 400 });
      }

      referrerUserId = String(referrer.id);
      referrerMemberId = String(referrer.prime_member_id || requestedReferralCode);
    }

    const receiverName = String(body?.receiverName || '').trim().toUpperCase();
    const receiverPhone = String(body?.receiverPhone || '').trim();

    if (!receiverName || !receiverPhone) {
      return NextResponse.json(
        { error: "Receiver's name and phone are required. Please provide them in Checkout Step 1." },
        { status: 400 }
      );
    }

    const orderNumber = getOrderNumber();
    const submittedFingerprint = body?.fingerprintSnapshot && typeof body.fingerprintSnapshot === 'object'
      ? body.fingerprintSnapshot
      : body?.deviceSnapshot && typeof body.deviceSnapshot === 'object'
        ? body.deviceSnapshot
        : {};
    const trustedFingerprint = resolveTrustedFingerprint(auth.customer, submittedFingerprint);
    const serverFingerprintId = getServerFingerprintId(request);
    const serverIp = getRequestClientIp(request);
    const deviceId = trustedFingerprint.deviceId;
    const hardwareId = trustedFingerprint.hardwareId;
    const deviceFingerprintId = trustedFingerprint.deviceFingerprintId || buildDeviceFingerprintId(submittedFingerprint);
    const sessionToken = trustedFingerprint.sessionToken;
    // Precise location is optional. It is only trusted when the customer
    // explicitly used Checkout -> Use My Location and the client attached the
    // resulting order-time snapshot as fingerprintSnapshot.deviceGps.
    const submittedPhysicalGps =
      submittedFingerprint?.deviceGps &&
      typeof submittedFingerprint.deviceGps === 'object'
        ? submittedFingerprint.deviceGps
        : null;

    let trustedPhysicalGpsSnapshot: Record<string, any> | null = null;

    if (submittedPhysicalGps) {
      const physicalGpsLat = Number(
        submittedPhysicalGps?.lat ?? submittedPhysicalGps?.latitude
      );
      const physicalGpsLon = Number(
        submittedPhysicalGps?.lon ?? submittedPhysicalGps?.longitude
      );

      if (
        !Number.isFinite(physicalGpsLat) ||
        !Number.isFinite(physicalGpsLon) ||
        physicalGpsLat < -90 ||
        physicalGpsLat > 90 ||
        physicalGpsLon < -180 ||
        physicalGpsLon > 180 ||
        (physicalGpsLat === 0 && physicalGpsLon === 0)
      ) {
        return NextResponse.json(
          { error: 'The submitted Use My Location snapshot is invalid.' },
          { status: 400 }
        );
      }

      const physicalGpsAccuracy = Number(submittedPhysicalGps?.accuracy);
      const physicalGpsCapturedAt = String(
        submittedPhysicalGps?.capturedAt ||
          submittedPhysicalGps?.captured_at ||
          new Date().toISOString()
      ).trim();
      const physicalGpsAddress = String(
        submittedPhysicalGps?.reverseGeocodedAddress ||
          submittedPhysicalGps?.reverse_geocoded_address ||
          ''
      ).trim();

      trustedPhysicalGpsSnapshot = {
        lat: physicalGpsLat,
        lon: physicalGpsLon,
        latitude: physicalGpsLat,
        longitude: physicalGpsLon,
        ...(Number.isFinite(physicalGpsAccuracy)
          ? { accuracy: physicalGpsAccuracy }
          : {}),
        source: 'Use My Location snapshot',
        capturedAt: physicalGpsCapturedAt,
        reverseGeocodedAddress: physicalGpsAddress || null,
      };
    }

    const trustedFingerprintSnapshot = {
      ...submittedFingerprint,
      deviceId,
      hardwareId,
      deviceFingerprintId,
      serverFingerprintId,
      ipSession: serverIp,
      sessionToken,
      deviceGps: trustedPhysicalGpsSnapshot,
    };

    const requestedStoreCredits = Math.max(
      0,
      toFiniteNumber(body?.storeCreditsUsed ?? body?.appliedStoreCredits, 0)
    );

    const orderPayload = {
      id: orderNumber,
      customerId: auth.customer.id,
      customerName: receiverName,
      customerPhone: receiverPhone,
      primeMemberId: finalMemberId,
      items: cart.items,
      deliveryFee: delivery.deliveryFee,
      deliveryPaymentMethod,
      chargesBreakdown: computedCharges,
      promoCode: String(body?.promoCode || '').trim().toUpperCase(),
      storeCreditsRequested: requestedStoreCredits,
      referrerUserId,
      referrerMemberId,
      deviceId,
      hardwareId,
      deviceFingerprintId,
      serverFingerprintId,
      fingerprintSnapshot: trustedFingerprintSnapshot,
      deliveryAddress: {
        ...deliveryAddress,
        lat: destinationLat,
        lon: destinationLon,
      },
      courierId: delivery.courier.id,
      courierName: delivery.courier.name,
      trackingNumber: '',
      notes: String(body?.notes || ''),
      paymentMethodId: '',
      paymentMethodName: '',
    };

    const { data: createdOrder, error: createError } = await supabase.rpc(
      'create_order_with_loyalty',
      {
        p_order: orderPayload,
        p_order_number: orderNumber,
      }
    );

    if (createError) {
      console.error('Atomic order/loyalty validation failed:', createError);
      const mapped = mapOrderError(createError);
      return NextResponse.json(
        { error: mapped.message },
        {
          status: mapped.status,
          headers: {
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
          },
        }
      );
    }

    cacheStore.invalidateOrders();

    const { data: persistedOrderDeadline } = await supabase
      .from('orders')
      .select('payment_deadline_at')
      .eq('id', createdOrder?.id || orderNumber)
      .maybeSingle();

    const paymentDeadlineAt =
      persistedOrderDeadline?.payment_deadline_at ||
      new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const authoritativeOrder = {
      success: true,
      id: createdOrder?.id || orderNumber,
      orderNumber: createdOrder?.orderNumber || orderNumber,
      items: createdOrder?.items || cart.items,
      subtotal: Number(createdOrder?.subtotal ?? cart.subtotal) || 0,
      subTotal: Number(createdOrder?.subtotal ?? cart.subtotal) || 0,
      deliveryFee: Number(createdOrder?.deliveryFee ?? delivery.deliveryFee) || 0,
      promoCode: createdOrder?.promoCode || (body?.promoCode ? String(body.promoCode).trim().toUpperCase() : null),
      promoId: createdOrder?.promoId || null,
      promoDiscount: Number(createdOrder?.promoDiscount) || 0,
      discountAmount: Number(createdOrder?.discountAmount) || 0,
      shippingSubsidy: Number(createdOrder?.shippingSubsidy) || 0,
      cashbackPoints: Number(createdOrder?.cashbackPoints) || 0,
      storeCreditsUsed: Number(createdOrder?.storeCreditsUsed) || 0,
      totalAmount: Number(createdOrder?.totalAmount) || 0,
      payableNow: Number(createdOrder?.payableNow) || 0,
      payableOnDelivery: Number(createdOrder?.payableOnDelivery) || 0,
      deliveryFeePaymentMethod: deliveryPaymentMethod,
      courier: {
        id: delivery.courier.id,
        name: delivery.courier.name,
        type: delivery.courier.type,
        logo: delivery.courier.logo || '',
      },
      receiverName: String(body?.receiverName || ''),
      receiverPhone: String(body?.receiverPhone || ''),
      deliveryAddress: orderPayload.deliveryAddress,
      promoTitle: null,
      isFreeShipping: Number(createdOrder?.shippingSubsidy || 0) >= Number(createdOrder?.deliveryFee || delivery.deliveryFee),
      referralCode: createdOrder?.referralCode || referrerMemberId || auth.customer.referred_by_member_id || null,
      status: 'Pending',
      paymentStatus: 'Unpaid',
      paymentDeadlineAt,
      paymentProofSubmittedAt: null,
      notes: orderPayload.notes,
      deviceGps: trustedFingerprintSnapshot?.deviceGps || trustedFingerprintSnapshot?.location || null,
      ip: serverIp,
    };

    void notifyOrderCreated({
      chatId: auth.customer.tg_user_id,
      orderNumber: authoritativeOrder.orderNumber,
      status: authoritativeOrder.status,
      customerName: authoritativeOrder.receiverName,
      totalAmount: authoritativeOrder.totalAmount,
      payableNow: authoritativeOrder.payableNow,
      items: authoritativeOrder.items,
      paymentDeadlineAt: authoritativeOrder.paymentDeadlineAt,
      paymentStatus: authoritativeOrder.paymentStatus,
      event: 'created',
    });

    return NextResponse.json(authoritativeOrder, {
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('Error creating order:', error);
    const mapped = mapOrderError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

async function hydrateCustomerOrder(order: any, supabase: any) {
  if (!order || typeof order !== 'object') return order;

  const rawCharges = order.charges_breakdown ?? order.appliedCharges ?? order.charges ?? [];
  const charges = Array.isArray(rawCharges) ? rawCharges : [];
  const items = Array.isArray(order.items) ? order.items : [];

  const productIds = Array.from(new Set(items
    .map((item: any) => String(item?.productId || item?.product_id || '').trim())
    .filter(Boolean)));

  let productsById = new Map<string, any>();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('id,name,bundle_config')
      .in('id', productIds);

    productsById = new Map((products || []).map((product: any) => [String(product.id), product]));
  }

  const hydratedItems = items.map((item: any) => {
    const productId = String(item?.productId || item?.product_id || '').trim();
    const variantId = String(item?.variantId || item?.variant_id || '').trim();
    const product = productsById.get(productId);
    const variants = Array.isArray(product?.bundle_config?.variants)
      ? product.bundle_config.variants
      : [];
    const variant = variants.find((candidate: any) => String(candidate?.id || '') === variantId) || null;

    return {
      ...item,
      productName: item?.productName || product?.name || item?.name || '',
      variantId: variantId || 'default',
      selectedVariant: variant
        ? { id: String(variant.id || variantId), name: String(variant.name || variant.label || variant.title || variantId) }
        : (item?.selectedVariant || (variantId && variantId !== 'default'
          ? { id: variantId, name: variantId }
          : null)),
    };
  });

  return {
    ...order,
    id: order.id || order.order_id || order.orderId,
    orderNumber: order.order_number || order.orderNumber || order.id,
    items: hydratedItems,
    appliedCharges: charges,
    chargesBreakdown: charges,
    charges,
    deliveryFeePaymentMethod:
      Number(order.payable_on_delivery ?? order.payableOnDelivery ?? 0) > 0
        ? 'upon_delivery'
        : 'upon_checkout',
    payableNow: order.payable_now ?? order.payableNow ?? 0,
    payableOnDelivery: order.payable_on_delivery ?? order.payableOnDelivery ?? 0,
    deliveryFee: order.delivery_fee ?? order.deliveryFee ?? 0,
    totalAmount: order.total_amount ?? order.totalAmount ?? 0,
  };
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
      return NextResponse.json(await hydrateCustomerOrder({ id: data.id, ...data }, supabase), {
        headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
      });
    }

    const { data: customerOrders, error: customerOrdersError } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', authenticatedCustomer.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (customerOrdersError) throw customerOrdersError;
    const hydratedOrders = await Promise.all((customerOrders || []).map((order: any) => hydrateCustomerOrder(order, supabase)));
    return NextResponse.json(hydratedOrders, {
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    });

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

    const { data: currentOrder, error: currentOrderError } = await supabase
      .from('orders')
      .select('id,order_number,status,payment_status,payment_proof_image,payment_deadline_at,created_at,total_amount')
      .or(`id.eq.${orderId},order_number.eq.${orderId}`)
      .eq('customer_id', auth.customer.id)
      .limit(1)
      .maybeSingle();

    if (currentOrderError) throw currentOrderError;
    if (!currentOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (String(currentOrder.status || '').toLowerCase() !== 'pending') {
      return NextResponse.json(
        { error: 'Payment proof can only be submitted while the order is Pending.' },
        { status: 409 }
      );
    }

    if (String(currentOrder.payment_status || '').toLowerCase() !== 'unpaid') {
      return NextResponse.json(
        { error: 'This order is no longer awaiting payment proof.' },
        { status: 409 }
      );
    }

    if (String(currentOrder.payment_proof_image || '').trim()) {
      return NextResponse.json(
        { error: 'Payment proof has already been submitted for this order.' },
        { status: 409 }
      );
    }

    if (!String(paymentProofImage || '').trim()) {
      return NextResponse.json(
        { error: 'Payment proof image is required.' },
        { status: 400 }
      );
    }

    const paymentDeadlineMs = currentOrder.payment_deadline_at
      ? Date.parse(String(currentOrder.payment_deadline_at))
      : NaN;

    if (Number.isFinite(paymentDeadlineMs) && paymentDeadlineMs <= Date.now()) {
      return NextResponse.json(
        { error: 'This order has expired because payment proof was not submitted within one hour.' },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      payment_method_id: paymentMethodId || '',
      payment_method_name: paymentMethodName || '',
      payment_proof_image: paymentProofImage || '',
      payment_proof_submitted_at: nowIso,
      payment_status: 'Pending Review',
      review_status: 'Pending Manual Review',
      requires_manual_review: true,
      updated_at: nowIso,
    };

    if (ocrAnalysis) {
      updatePayload.ocr_analysis = ocrAnalysis;
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', currentOrder.id)
      .eq('customer_id', auth.customer.id)
      .eq('status', 'Pending')
      .eq('payment_status', 'Unpaid')
      .is('expired_at', null)
      .gt('payment_deadline_at', nowIso)
      .select('id,order_number,payment_deadline_at,payment_proof_submitted_at')
      .maybeSingle();

    if (updateError) throw updateError;

    if (!updatedOrder) {
      return NextResponse.json(
        { error: 'This order has expired or is no longer awaiting payment proof.' },
        { status: 409 }
      );
    }

    void notifyPaymentUpdated({
      chatId: auth.customer.tg_user_id,
      orderNumber: String(currentOrder.order_number || orderId),
      status: 'Pending',
      totalAmount: Number(currentOrder.total_amount) || undefined,
      paymentStatus: 'Pending Review',
      event: 'payment',
    });

    cacheStore.invalidateOrders();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating order payment proof:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
