import { db, EndpointError } from 'sdk';
import { asc, desc, eq } from 'sdk/db';
import { fetch } from 'sdk/fetch';
import { customers, orders, charges as chargeTable, systemSettings } from '../schema.js';
import { beginCheckoutOperation, acquireCustomerCheckoutLock, releaseCustomerCheckoutLock,
  findCheckoutOperation,
  saveCanonicalCheckoutSnapshot, advanceCheckoutOperation, finishCheckoutOperation,
  beginCheckoutCompensation, finishCheckoutCompensation } from '../lib/checkout-operations.js';
import { reserveStoreCredits, finalizeStoreCredits, compensateStoreCredits } from '../lib/credits.js';
import { claimPromoUse, redeemPromoClaim, releasePromoClaim } from '../lib/promo-claims.js';
import { reserveInventoryLine, releaseInventoryReservations } from '../lib/inventory.js';
import { canonicalizeOrderItems } from '../lib/orders.js';
import { calculateChargesBreakdown } from '../lib/charges.js';
import { quoteDelivery } from '../lib/delivery.js';
import { resolveTrustedFingerprint } from '../lib/fingerprints.js';
import { publicMediaReference } from '../lib/media.js';
import validatePromo from './validatePromo.js';
import { notifyAdminOrderCreated, notifyOrderCreated } from '../lib/order-notifications.js';
import { calculateCustomerTier, calculateOrderRewardPoints } from '../lib/loyalty.js';
import { addFreeProductToCart } from '../lib/promos.js';

const stages = ['prepared', 'inventory_held', 'promo_claimed', 'credits_reserved', 'order_persisted', 'promo_redeemed', 'credits_finalized', 'effects_recorded', 'complete'];
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

async function settingKey(key) {
  const row = await db.select({ value: systemSettings.value }).from(systemSettings)
    .where(eq(systemSettings.key, key)).get();
  const value = row?.value;
  return typeof value === 'string' ? value.trim() : value && typeof value === 'object' ? String(value.apiKey || '').trim() : '';
}

function validIp(value) {
  const ip = String(value || '').trim();
  if (!ip || ip.length > 64 || /[^0-9a-fA-F:.]/.test(ip)) return '';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return '';
  }
  if (ip.includes(':') && !/^[0-9a-fA-F:]+$/.test(ip)) return '';
  return ip;
}

async function reverseGeocodeWithGeoapify(lat, lon) {
  const apiKey = await settingKey('geoapify_api_key');
  if (!apiKey || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;
  try {
    const url = 'https://api.geoapify.com/v1/geocode/reverse?lat=' + encodeURIComponent(String(lat)) +
      '&lon=' + encodeURIComponent(String(lon)) + '&format=json&apiKey=' + encodeURIComponent(apiKey);
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const result = Array.isArray(data?.results) ? data.results[0] : null;
    if (!result?.formatted) return null;
    return {
      formatted: text(result.formatted, 500),
      resultType: text(result.result_type || result.rank?.match_type, 80),
      street: text(result.street, 180), houseNumber: text(result.housenumber, 40),
      postcode: text(result.postcode, 24), city: text(result.city || result.suburb || result.county, 120),
      subdivision: text(result.state || result.state_district, 120), country: text(result.country, 100),
      matchType: text(result.rank?.match_type, 80),
      confidence: Number.isFinite(Number(result.rank?.confidence)) ? Number(result.rank.confidence) : null,
      buildingConfidence: Number.isFinite(Number(result.rank?.confidence_building_level)) ? Number(result.rank.confidence_building_level) : null,
      houseLevelResult: String(result.result_type || '').toLowerCase() === 'building' && Boolean(result.housenumber),
      provider: 'Geoapify',
    };
  } catch {
    return null;
  }
}

async function enrichOrderLocationSignals(fingerprint, deliveryAddress) {
  const gps = fingerprint?.deviceGps;
  if (gps) {
    const geo = await reverseGeocodeWithGeoapify(gps.lat, gps.lon);
    fingerprint.deviceGps = {
      ...gps,
      source: 'Order-time device GPS',
      reverseGeocodedAddress: geo?.formatted || '',
      reverseGeocodingProvider: geo?.provider || '',
      reverseGeocodingDetails: geo,
    };
  }

  const observation = fingerprint?.deviceLocationObservation;
  if (observation && Number.isFinite(Number(observation.lat)) && Number.isFinite(Number(observation.lon))) {
    const geo = await reverseGeocodeWithGeoapify(observation.lat, observation.lon);
    fingerprint.deviceLocationObservation = {
      ...observation,
      source: 'Client-reported app-open device location',
      reverseGeocodedAddress: geo?.formatted || '',
      reverseGeocodingProvider: geo?.provider || '',
      reverseGeocodingDetails: geo,
    };
  }

  const addressGeo = await reverseGeocodeWithGeoapify(deliveryAddress?.lat, deliveryAddress?.lon);
  deliveryAddress.geocodedAddress = addressGeo?.formatted || '';
  deliveryAddress.geocodingProvider = addressGeo?.provider || '';
  deliveryAddress.geocodingDetails = addressGeo;

  const ip = validIp(fingerprint?.clientObservedIp);
  const geoapifyKey = ip ? await settingKey('geoapify_api_key') : '';
  if (!ip || !geoapifyKey) {
    fingerprint.ipLocation = { ip, status: ip ? 'Geoapify key not configured' : 'IP not observed', verified: false, source: 'Browser-observed IP · approximate only' };
    return;
  }

  let geoapifyError = '';
  try {
    const url = 'https://api.geoapify.com/v1/ipinfo?ip=' + encodeURIComponent(ip) + '&apiKey=' + encodeURIComponent(geoapifyKey);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Geoapify IP lookup failed.');
    const data = await response.json();
    const latitude = Number(data?.location?.latitude);
    const longitude = Number(data?.location?.longitude);
    fingerprint.ipLocation = {
      ip: text(data?.ip || ip, 64), verified: false,
      provider: 'Geoapify IP Geolocation', precision: 'Approximate network area; not a street or house location',
      source: 'Browser-observed IP · Geoapify · approximate network location',
      country: text(data?.country?.name, 100), countryCode: text(data?.country?.iso_code, 4),
      city: text(data?.city?.name, 120), subdivision: text(data?.state?.name, 120),
      postalCode: text(data?.postcode, 24),
      latitude: Number.isFinite(latitude) ? latitude : null, longitude: Number.isFinite(longitude) ? longitude : null,
      timezone: text(data?.time_zone?.name, 80),
      status: 'complete',
    };
    // Keep IPLocate's network/privacy indicators as corroborating metadata,
    // while Geoapify remains the primary approximate IP-area source.
    const ipLocateKey = await settingKey('iplocate_api_key');
    if (ipLocateKey) {
      try {
        const networkResponse = await fetch('https://www.iplocate.io/api/lookup/' + encodeURIComponent(ip) + '?apikey=' + encodeURIComponent(ipLocateKey));
        if (networkResponse.ok) {
          const network = await networkResponse.json();
          fingerprint.ipLocation.networkProvider = 'IPLocate';
          fingerprint.ipLocation.asn = text(network?.asn?.asn, 40);
          fingerprint.ipLocation.route = text(network?.asn?.route, 80);
          fingerprint.ipLocation.isp = text(network?.company?.name || network?.asn?.name, 180);
          fingerprint.ipLocation.ispDomain = text(network?.company?.domain || network?.asn?.domain, 160);
          fingerprint.ipLocation.privacy = {
            isAbuser: Boolean(network?.privacy?.is_abuser), isAnonymous: Boolean(network?.privacy?.is_anonymous),
            isProxy: Boolean(network?.privacy?.is_proxy), isTor: Boolean(network?.privacy?.is_tor),
            isVpn: Boolean(network?.privacy?.is_vpn), isHosting: Boolean(network?.privacy?.is_hosting),
            isIcloudRelay: Boolean(network?.privacy?.is_icloud_relay), isBogon: Boolean(network?.privacy?.is_bogon),
          };
        }
      } catch {
        // IP area capture succeeds independently of optional network metadata.
      }
    }
  } catch {
    geoapifyError = 'Geoapify lookup failed';
  }

  // Retain the existing IPLocate enrichment as a fallback if Geoapify is
  // unavailable. Both providers only estimate the network area from an IP.
  if (geoapifyError) {
    const ipLocateKey = await settingKey('iplocate_api_key');
    if (!ipLocateKey) {
      fingerprint.ipLocation = { ip, provider: 'Geoapify IP Geolocation', status: geoapifyError, verified: false, source: 'Browser-observed IP · approximate only' };
      return;
    }
    try {
      const response = await fetch('https://www.iplocate.io/api/lookup/' + encodeURIComponent(ip) + '?apikey=' + encodeURIComponent(ipLocateKey));
      if (!response.ok) throw new Error('IPLocate fallback failed.');
      const data = await response.json();
      const latitude = Number(data?.latitude); const longitude = Number(data?.longitude);
      fingerprint.ipLocation = {
        ip: text(data?.ip || ip, 64), verified: false, provider: 'IPLocate fallback',
        precision: 'Approximate network area; not a street or house location',
        source: 'Browser-observed IP · IPLocate fallback · approximate network location',
        country: text(data?.country, 100), countryCode: text(data?.country_code, 4), city: text(data?.city, 120),
        subdivision: text(data?.subdivision, 120), postalCode: text(data?.postal_code, 24),
        latitude: Number.isFinite(latitude) ? latitude : null, longitude: Number.isFinite(longitude) ? longitude : null,
        timezone: text(data?.time_zone, 80), asn: text(data?.asn?.asn, 40), route: text(data?.asn?.route, 80),
        isp: text(data?.company?.name || data?.asn?.name, 180), ispDomain: text(data?.company?.domain || data?.asn?.domain, 160),
        privacy: {
          isAbuser: Boolean(data?.privacy?.is_abuser), isAnonymous: Boolean(data?.privacy?.is_anonymous),
          isProxy: Boolean(data?.privacy?.is_proxy), isTor: Boolean(data?.privacy?.is_tor),
          isVpn: Boolean(data?.privacy?.is_vpn), isHosting: Boolean(data?.privacy?.is_hosting),
          isIcloudRelay: Boolean(data?.privacy?.is_icloud_relay), isBogon: Boolean(data?.privacy?.is_bogon),
        },
        status: 'complete',
      };
    } catch {
      fingerprint.ipLocation = { ip, provider: 'Geoapify then IPLocate', status: 'IP geolocation lookups failed', verified: false, source: 'Browser-observed IP · approximate only' };
    }
  }
}
const epochSeconds = (value) => {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  const number = Number(value) || 0;
  return Math.floor(number > 1e12 ? number / 1000 : number);
};
function formatOrderNumber(unixSeconds) {
  const pht = new Date((Number(unixSeconds) + 8 * 60 * 60) * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(pht.getUTCDate())}${pad(pht.getUTCMonth() + 1)}${String(pht.getUTCFullYear()).slice(-2)}${pad(pht.getUTCHours())}${pad(pht.getUTCMinutes())}${pad(pht.getUTCSeconds())}`;
}

function parseJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

async function readOperation(operationId) {
  const row = await db.get(
    `SELECT id, customer_id AS customerId, status, stage,
            request_snapshot AS requestSnapshot, canonical_snapshot AS canonicalSnapshot,
            response_snapshot AS responseSnapshot, order_id AS orderId,
            expires_at AS expiresAt, created_at AS createdAt, last_error AS lastError
       FROM checkout_operations WHERE id = :id`,
    { ':id': String(operationId) },
  );
  if (!row) return null;
  return { ...row, createdAt: Number(row.createdAt) || 0, requestSnapshot: parseJson(row.requestSnapshot, null),
    canonicalSnapshot: parseJson(row.canonicalSnapshot, null), responseSnapshot: parseJson(row.responseSnapshot, null) };
}

async function advanceAtLeast(operationId, target) {
  const targetIndex = stages.indexOf(target);
  const operation = await readOperation(operationId);
  if (!operation || targetIndex < 0) throw new EndpointError('Checkout operation is unavailable.', { code: 'OPERATION_MISSING' });
  const currentIndex = stages.indexOf(String(operation.stage));
  if (currentIndex < 0) throw new EndpointError('Checkout operation has an invalid recovery stage.', { code: 'OPERATION_STAGE_INVALID' });
  if (currentIndex >= targetIndex) return;
  const result = await advanceCheckoutOperation({
    operationId,
    expectedStages: [String(operation.stage)],
    nextStage: target,
  });
  if (!result.advanced) throw new EndpointError('Checkout is being recovered. Please retry shortly.', { code: 'OPERATION_STAGE_CONFLICT' });
}

function sanitizedRequest(input) {
  const address = input?.deliveryAddress && typeof input.deliveryAddress === 'object' ? input.deliveryAddress : {};
  const fingerprint = input?.fingerprintSnapshot && typeof input.fingerprintSnapshot === 'object'
    ? input.fingerprintSnapshot : input?.deviceSnapshot && typeof input.deviceSnapshot === 'object' ? input.deviceSnapshot : {};
  return {
    paymentSessionId: text(input?.paymentSessionId, 120),
    paymentProofData: text(input?.paymentProofData, 820000),
    paymentProofContentType: text(input?.paymentProofContentType, 40),
    paymentProofOcrAnalysis: input?.paymentProofOcrAnalysis && typeof input.paymentProofOcrAnalysis === 'object' ? input.paymentProofOcrAnalysis : null,
    paymentMethodId: text(input?.paymentMethodId, 120),
    items: Array.isArray(input?.items) ? input.items.slice(0, 100).map((item) => ({
      id: text(item?.id, 200), productId: text(item?.productId || item?.product_id, 120),
      variantId: text(item?.variantId || item?.variant_id, 120), quantity: Number(item?.quantity ?? 1),
    })) : [],
    deliveryAddress: {
      formatted: text(address.formatted, 500),
      lat: Number(address.lat), lon: Number(address.lon),
      unitDetails: text(address.unitDetails, 250),
    },
    courierId: text(typeof input?.courier === 'string' ? input.courier : input?.courier?.id, 100),
    deliveryPaymentMethod: text(input?.deliveryPaymentMethod || input?.deliveryFeePaymentMethod, 40).toLowerCase(),
    receiverName: text(input?.receiverName, 120).toUpperCase(),
    receiverPhone: text(input?.receiverPhone, 40),
    promoCode: text(input?.promoCode, 80).toUpperCase(),
    storeCreditsRequested: Math.max(0, money(input?.storeCreditsUsed ?? input?.appliedStoreCredits)),
    expectedPayableNow: input?.expectedPayableNow == null ? null : money(input.expectedPayableNow),
    expectedPayableOnDelivery: input?.expectedPayableOnDelivery == null ? null : money(input.expectedPayableOnDelivery),
    expectedTotalAmount: input?.expectedTotalAmount == null ? null : money(input.expectedTotalAmount),
    referralCode: text(input?.referralCode, 100).toUpperCase(),
    notes: text(input?.notes, 1000),
    fingerprint: {
      deviceId: text(fingerprint.deviceId, 200),
      hardwareId: text(fingerprint.hardwareId, 200),
      deviceFingerprintId: text(fingerprint.deviceFingerprintId, 200),
      sessionToken: text(fingerprint.sessionToken, 300),
      deviceGps: fingerprint.deviceGps && typeof fingerprint.deviceGps === 'object' ? {
        lat: Number(fingerprint.deviceGps.lat ?? fingerprint.deviceGps.latitude),
        lon: Number(fingerprint.deviceGps.lon ?? fingerprint.deviceGps.longitude),
        accuracy: Number(fingerprint.deviceGps.accuracy),
        capturedAt: text(fingerprint.deviceGps.capturedAt || fingerprint.deviceGps.captured_at, 80),
      } : null,
      deviceLocationObservation: fingerprint.deviceLocationObservation && typeof fingerprint.deviceLocationObservation === 'object' ? {
        lat: Number(fingerprint.deviceLocationObservation.lat ?? fingerprint.deviceLocationObservation.latitude),
        lon: Number(fingerprint.deviceLocationObservation.lon ?? fingerprint.deviceLocationObservation.longitude),
        accuracy: Number(fingerprint.deviceLocationObservation.accuracy),
        capturedAt: text(fingerprint.deviceLocationObservation.capturedAt || fingerprint.deviceLocationObservation.captured_at, 80),
        source: 'Client-reported app-open device location',
      } : null,
      // This is client-reported and is independently enriched by IPLocate.
      clientObservedIp: validIp(fingerprint.clientObservedIp),
    },
  };
}

async function makeCanonicalSnapshot(request, customer, submittedAt) {
  if (!request.receiverName || !request.receiverPhone) throw new EndpointError('Receiver name and phone are required.', { code: 'INVALID_RECEIVER' });
  if (!Number.isFinite(request.deliveryAddress.lat) || request.deliveryAddress.lat < -90 || request.deliveryAddress.lat > 90 ||
      !Number.isFinite(request.deliveryAddress.lon) || request.deliveryAddress.lon < -180 || request.deliveryAddress.lon > 180) {
    throw new EndpointError('A valid delivery map location is required.', { code: 'INVALID_ADDRESS' });
  }
  if (!['upon_checkout', 'upon_delivery'].includes(request.deliveryPaymentMethod)) {
    throw new EndpointError('Choose when to pay the delivery fee.', { code: 'INVALID_DELIVERY_PAYMENT' });
  }

  const gps = request.fingerprint.deviceGps;
  if (gps) {
    if (!Number.isFinite(gps.lat) || gps.lat < -90 || gps.lat > 90 ||
        !Number.isFinite(gps.lon) || gps.lon < -180 || gps.lon > 180 || (gps.lat === 0 && gps.lon === 0)) {
      throw new EndpointError('The submitted Use My Location snapshot is invalid.', { code: 'INVALID_LOCATION_SNAPSHOT' });
    }
    if (!Number.isFinite(Number(gps.accuracy)) || Number(gps.accuracy) > 20) {
      throw new EndpointError('GPS accuracy must be 20 meters or better. Retry location or select the delivery pin on the map.', { code: 'GPS_ACCURACY_INSUFFICIENT' });
    }
    request.fingerprint.deviceGps = { ...gps, source: 'Order-time device GPS' };
  }
  await enrichOrderLocationSignals(request.fingerprint, request.deliveryAddress);
  const cart = await canonicalizeOrderItems(request.items);
  const tierRows = await db.select({ status: orders.status, subtotal: orders.subtotal,
    createdAt: orders.createdAt, deliveredAt: orders.deliveredAt })
    .from(orders).where(eq(orders.customerId, customer.id))
    .orderBy(desc(orders.createdAt)).limit(1000).all();
  const completedOrders = tierRows.filter((order) => ['completed', 'delivered']
    .includes(String(order.status || '').toLowerCase()));
  const rewardTier = calculateCustomerTier(completedOrders).tier;
  const canonicalItems = await Promise.all(cart.items.map(async (item) => ({
    ...item, imageUrl: await publicMediaReference(item.imageUrl || ''),
  })));
  const delivery = await quoteDelivery(request.deliveryAddress.lat, request.deliveryAddress.lon, request.courierId);
  const chargeRows = await db.select().from(chargeTable).where(eq(chargeTable.isActive, true)).orderBy(asc(chargeTable.sortOrder)).all();
  const chargeResult = calculateChargesBreakdown(chargeRows, cart.subtotal, new Date());
  const fingerprint = resolveTrustedFingerprint(customer, request.fingerprint);

  let promo = null;
  if (request.promoCode) {
    promo = await validatePromo({
      code: request.promoCode,
      itemsSubtotal: cart.subtotal,
      itemQuantity: cart.itemQuantity,
      totalItems: cart.itemQuantity,
      deliveryFee: delivery.fee,
      paymentMethod: request.deliveryPaymentMethod,
      courierId: delivery.courier.id,
      deviceId: fingerprint.deviceId,
      hardwareId: fingerprint.hardwareId,
      deviceFingerprintId: fingerprint.deviceFingerprintId,
      sessionToken: fingerprint.sessionToken,
    }, { initData: { user: { id: customer.tgUserId } } });
    if (!promo?.valid) throw new EndpointError(promo?.error || 'Promo code is no longer valid.', { code: 'PROMO_INVALID' });
  }

  if (promo?.discountType === 'free_product') {
    // The gift is selected from current Serverless catalog data, priced at zero,
    // and held by the same inventory reservation/compensation path as paid lines.
    const gift = await canonicalizeOrderItems([{ productId: promo.freeProductId,
      variantId: promo.freeVariantId || 'default', quantity: 1 }]);
    const giftLine = { ...gift.items[0], imageUrl: await publicMediaReference(gift.items[0].imageUrl || '') };
    addFreeProductToCart(cart, canonicalItems, giftLine);
  }

  let referrer = null;
  if (customer.referredByUserId || customer.referredByMemberId) {
    const linked = await db.get(`SELECT id, prime_member_id AS memberId FROM customers
      WHERE (:id <> '' AND id = :id) OR (:member <> '' AND upper(prime_member_id) = upper(:member))
      ORDER BY CASE WHEN id = :id THEN 0 ELSE 1 END LIMIT 1`,
    { ':id': String(customer.referredByUserId || ''), ':member': String(customer.referredByMemberId || '') });
    if (linked && String(linked.id) !== String(customer.id)) referrer = { id: linked.id, memberId: linked.memberId || '' };
  } else if (request.referralCode) {
    referrer = await db.select({ id: customers.id, primeMemberId: customers.primeMemberId })
      .from(customers).where(eq(customers.primeMemberId, request.referralCode)).get();
    if (!referrer || referrer.id === customer.id) throw new EndpointError('Referral code is invalid.', { code: 'REFERRAL_INVALID' });
    referrer = { id: referrer.id, memberId: referrer.primeMemberId || request.referralCode };
  }
  // Attribution is allowed before the referrer's first delivery. The award
  // remains pending until both members have a successful completed order.

  const shippingPromo = ['free_shipping', 'shipping_discount'].includes(String(promo?.discountType || '').toLowerCase());
  const promoDiscount = shippingPromo ? 0 : money(promo?.discountAmount || 0);
  const shippingSubsidy = shippingPromo ? money(promo?.shippingSubsidy ?? promo?.discountAmount ?? 0) : 0;
  const netDelivery = Math.max(0, money(delivery.fee - shippingSubsidy));
  const chargeTotal = money(chargeResult.totalChargesAmount);
  const payableBeforeCredits = money(Math.max(0, cart.subtotal - promoDiscount) + chargeTotal +
    (request.deliveryPaymentMethod === 'upon_checkout' ? netDelivery : 0));
  const requestedCredits = Math.min(request.storeCreditsRequested, payableBeforeCredits);
  const creditsUsed = Math.min(Math.max(0, Number(customer.storeCredits) || 0), requestedCredits);
  const rewardPointsAmount = calculateOrderRewardPoints(cart.subtotal, rewardTier,
    promo?.cashbackPoints || 0, promoDiscount, creditsUsed);
  const payableNow = money(Math.max(0, payableBeforeCredits - creditsUsed));
  const payableOnDelivery = request.deliveryPaymentMethod === 'upon_delivery' ? netDelivery : 0;
  const expectedAmounts = [
    ['payable now', request.expectedPayableNow, payableNow],
    ['delivery amount', request.expectedPayableOnDelivery, payableOnDelivery],
    ['total payable', request.expectedTotalAmount, money(payableNow + payableOnDelivery)],
  ];
  const mismatch = expectedAmounts.some(([, expected, actual]) =>
    expected != null && Math.abs(Number(expected) - Number(actual)) > 0.01);
  if (mismatch) {
    throw new EndpointError('The payable amount changed while checkout was open. Review the updated charges and delivery amount, then submit again.', { code: 'CHECKOUT_TOTAL_CHANGED' });
  }
  const nowSeconds = Number(submittedAt) || Math.floor(Date.now() / 1000);
  return {
    items: canonicalItems,
    reservations: cart.reservations,
    subtotal: cart.subtotal,
    itemQuantity: cart.itemQuantity,
    deliveryFee: money(delivery.fee),
    deliveryPaymentMethod: request.deliveryPaymentMethod,
    courier: { id: delivery.courier.id, name: delivery.courier.name, type: delivery.courier.type || 'Standard',
      logo: await publicMediaReference(delivery.courier.logo || '') },
    deliveryAddress: { ...request.deliveryAddress },
    chargesBreakdown: chargeResult.computedCharges,
    chargeTotal,
    promo: promo ? { id: promo.promoId, code: promo.code, discount: promoDiscount,
      discountType: promo.discountType, title: promo.title, isFreeShipping: Boolean(promo.isFreeShipping),
      shippingSubsidy, cashbackPoints: Number(promo.cashbackPoints) || 0,
      freeProductId: promo.freeProductId || '', freeVariantId: promo.freeVariantId || '' } : null,
    rewardPointsAmount,
    rewardTier,
    creditsUsed,
    payableNow,
    payableOnDelivery,
    totalAmount: money(payableNow + payableOnDelivery),
    customerName: request.receiverName,
    customerPhone: request.receiverPhone,
    notes: request.notes,
    fingerprintSnapshot: { ...request.fingerprint, ...fingerprint },
    referrer,
    paymentDeadlineAt: nowSeconds + 60 * 60,
    paymentProofData: request.paymentProofData || '',
    paymentProofContentType: request.paymentProofContentType || '',
    paymentProofOcrAnalysis: request.paymentProofOcrAnalysis || null,
    paymentMethodId: request.paymentMethodId || '',
    orderNumberTimestamp: Number(submittedAt) || nowSeconds,
    orderNumber: formatOrderNumber(submittedAt || nowSeconds),
  };
}

function orderResponse(snapshot, operationId) {
  return {
    success: true,
    id: operationId,
    orderNumber: snapshot.orderNumber,
    items: snapshot.items,
    subtotal: snapshot.subtotal,
    subTotal: snapshot.subtotal,
    deliveryFee: snapshot.deliveryFee,
    deliveryFeePaymentMethod: snapshot.deliveryPaymentMethod,
    chargesBreakdown: snapshot.chargesBreakdown,
    appliedCharges: snapshot.chargesBreakdown,
    promoCode: snapshot.promo?.code || null,
    promoTitle: snapshot.promo?.title || null,
    isFreeShipping: Boolean(snapshot.promo?.isFreeShipping),
    promoId: snapshot.promo?.id || null,
    promoDiscount: snapshot.promo?.discount || 0,
    discountAmount: snapshot.promo?.discount || 0,
    shippingSubsidy: snapshot.promo?.shippingSubsidy || 0,
    cashbackPoints: snapshot.promo?.cashbackPoints || 0,
    storeCreditsUsed: snapshot.creditsUsed,
    totalAmount: snapshot.totalAmount,
    payableNow: snapshot.payableNow,
    payableOnDelivery: snapshot.payableOnDelivery,
    courier: snapshot.courier,
    receiverName: snapshot.customerName,
    receiverPhone: snapshot.customerPhone,
    deliveryAddress: snapshot.deliveryAddress,
    status: 'Pending',
    paymentStatus: snapshot.paymentProofData ? 'Pending Review' : 'Unpaid',
    paymentDeadlineAt: new Date(epochSeconds(snapshot.paymentDeadlineAt) * 1000).toISOString(),
    paymentProofSubmittedAt: null,
    notes: snapshot.notes,
    referralCode: snapshot.referrer?.memberId || null,
  };
}

async function persistOrder(snapshot, operationId, customer) {
  const orderTimestamp = Number(snapshot.orderNumberTimestamp) || (epochSeconds(snapshot.paymentDeadlineAt) - 60 * 60);
  let orderNumber = snapshot.orderNumber || formatOrderNumber(orderTimestamp);
  const row = {
    id: operationId,
    order_number: orderNumber,
    customer_id: customer.id,
    customer_name: snapshot.customerName,
    customer_phone: snapshot.customerPhone,
    tg_user_id: String(customer.tgUserId),
    prime_member_id: customer.primeMemberId || '',
    items: JSON.stringify(snapshot.items),
    subtotal: snapshot.subtotal,
    delivery_fee: snapshot.deliveryFee,
    discount_amount: snapshot.promo?.discount || 0,
    applied_promo_code: snapshot.promo?.code || null,
    charges_breakdown: JSON.stringify(snapshot.chargesBreakdown),
    total_amount: snapshot.totalAmount,
    payable_now: snapshot.payableNow,
    payable_on_delivery: snapshot.payableOnDelivery,
    status: 'Pending',
    payment_status: snapshot.paymentProofData ? 'Pending Review' : 'Unpaid',
    payment_method_id: snapshot.paymentMethodId || '',
    payment_method_name: '',
    payment_proof_image: snapshot.paymentProofData ? 'inline-payment-proof:' + operationId : null,
    payment_proof_data: snapshot.paymentProofData || null,
    payment_proof_content_type: snapshot.paymentProofContentType || null,
    ocr_analysis: snapshot.paymentProofOcrAnalysis || null,
    review_status: 'Pending Manual Review',
    requires_manual_review: 1,
    delivery_address: JSON.stringify(snapshot.deliveryAddress),
    courier_id: snapshot.courier.id,
    courier_name: snapshot.courier.name,
    tracking_number: '',
    notes: snapshot.notes,
    fingerprint_snapshot: JSON.stringify(snapshot.fingerprintSnapshot),
    store_credits_used: snapshot.creditsUsed,
    received_transfer_used: snapshot.receivedTransferUsed || 0,
    promo_shipping_subsidy: snapshot.promo?.shippingSubsidy || 0,
    // New orders credit voucher and tier points once through the mature purchasing ledger.
    cashback_points_amount: snapshot.rewardPointsAmount == null ? snapshot.promo?.cashbackPoints || 0 : 0,
    // Old in-flight canonical snapshots keep their original 5-per-₱100 award.
    purchasing_points_amount: snapshot.rewardPointsAmount ?? Math.floor(snapshot.subtotal / 100) * 5,
    referred_by_user_id: snapshot.referrer?.id || null,
    referred_by_member_id: snapshot.referrer?.memberId || null,
    referral_points_status: snapshot.referrer?.id ? 'pending_delivery' : 'none',
    referral_points_credit_after: null,
    referral_points_amount: snapshot.referrer?.id ? 50 : 0,
    payment_deadline_at: snapshot.paymentDeadlineAt,
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  };
  const columns = Object.keys(row);
  const values = Object.values(row);
  const jsonColumns = new Set(['items', 'charges_breakdown', 'delivery_address', 'fingerprint_snapshot']);
  const params = {};
  const placeholders = columns.map((column, index) => {
    const key = ':v' + index;
    params[key] = values[index];
    return jsonColumns.has(column) ? 'json(' + key + ')' : key;
  });
  params[':operation_id'] = operationId;
  params[':reservations'] = JSON.stringify(snapshot.reservations);
  let persisted = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    params[':v' + columns.indexOf('order_number')] = orderNumber;
    const result = await db.run(
      `INSERT INTO orders (${columns.join(', ')})
       SELECT ${placeholders.join(', ')}
        WHERE EXISTS (SELECT 1 FROM checkout_operations o
          WHERE o.id = :operation_id AND o.status = 'processing')
          AND NOT EXISTS (
            SELECT 1 FROM json_each(:reservations) line
            LEFT JOIN inventory_reservations r ON r.order_id = :operation_id
              AND r.product_id = json_extract(line.value, '$.productId')
              AND r.variant_id = json_extract(line.value, '$.variantId')
            WHERE r.id IS NULL OR r.status <> 'held' OR r.expires_at <= unixepoch()
              OR r.quantity <> json_extract(line.value, '$.quantity'))
       ON CONFLICT DO NOTHING RETURNING id`, params,
    );
    if (Number(result?.rowsAffected) > 0) {
      persisted = true;
      break;
    }
    const existing = await db.select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders).where(eq(orders.id, operationId)).get();
    if (existing) {
      orderNumber = existing.orderNumber || orderNumber;
      persisted = true;
      break;
    }
    const expiredHold = await db.get(`SELECT 1 AS invalid
      FROM json_each(:reservations) line
      LEFT JOIN inventory_reservations r ON r.order_id = :operation_id
        AND r.product_id = json_extract(line.value, '$.productId')
        AND r.variant_id = json_extract(line.value, '$.variantId')
      WHERE r.id IS NULL OR r.status <> 'held' OR r.expires_at <= unixepoch()
        OR r.quantity <> json_extract(line.value, '$.quantity') LIMIT 1`,
    { ':reservations': params[':reservations'], ':operation_id': operationId });
    if (expiredHold) throw new EndpointError('The stock reservation expired. Retry checkout to check availability.', { code: 'INVENTORY_RESERVATION_EXPIRED' });
    orderNumber = formatOrderNumber(orderTimestamp + attempt + 1);
  }
  if (!persisted) throw new EndpointError('Could not allocate a unique order number. Retry this checkout.', { code: 'ORDER_NUMBER_UNAVAILABLE' });
  await db.run(
    `UPDATE checkout_operations SET order_id = :order_id, updated_at = unixepoch() WHERE id = :operation_id`,
    { ':order_id': operationId, ':operation_id': operationId },
  );
  return { ...snapshot, orderNumber };
}

async function recordOrderEffects(snapshot, operationId, customer) {
  if (snapshot.creditsUsed > 0) {
    await db.run(
      `INSERT INTO point_transactions (id, user_id, type, amount, order_id, description, created_at)
       VALUES (:id, :user_id, 'store_credit_usage', :amount, :order_id, :description, unixepoch())
       ON CONFLICT(id) DO NOTHING`,
      { ':id': 'credit-' + operationId, ':user_id': customer.id, ':amount': -snapshot.creditsUsed,
        ':order_id': operationId, ':description': 'Store Credits used on Order #' + String(snapshot.orderNumber || operationId) },
    );
  }
  if (snapshot.referrer?.id && !customer.referredByMemberId) {
    await db.run(
      `UPDATE customers SET referred_by = :member_id, referred_by_user_id = :referrer_id,
              referred_by_member_id = :member_id, updated_at = unixepoch()
        WHERE id = :customer_id AND (referred_by_member_id IS NULL OR referred_by_member_id = '')`,
      { ':member_id': snapshot.referrer.memberId, ':referrer_id': snapshot.referrer.id, ':customer_id': customer.id },
    );
  }
}

async function compensateUnpersistedOperation(operationId, customerId, message) {
  const order = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, operationId)).get();
  if (order) return false;
  const claim = await beginCheckoutCompensation({ operationId, message });
  if (claim.alreadyFailed) {
    await releaseCustomerCheckoutLock({ customerId, operationId });
    return true;
  }
  if (!claim.compensating) return false;
  await releaseInventoryReservations(operationId);
  const promo = await releasePromoClaim(operationId);
  if (!promo.released && promo.reason === 'claim_already_redeemed') {
    const persisted = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, operationId)).get();
    if (persisted) return false;
    throw new EndpointError('Promo recovery could not release the pre-order claim.', { code: 'PROMO_COMPENSATION_PENDING' });
  }
  const credits = await compensateStoreCredits({ customerId, operationId });
  if (!credits.compensated) throw new EndpointError('Store Credit recovery is still pending.', { code: 'CREDIT_COMPENSATION_PENDING' });
  const finished = await finishCheckoutCompensation({ operationId });
  if (!finished.failed) return false;
  await releaseCustomerCheckoutLock({ customerId, operationId });
  return true;
}

async function processOperation(operation, request, customer) {
  const operationId = String(operation.id || operation.operationId);
  const existingOrder = await db.select().from(orders).where(eq(orders.id, operationId)).get();
  if (operation.status === 'complete' && operation.responseSnapshot) {
    await releaseCustomerCheckoutLock({ customerId: customer.id, operationId });
    return operation.responseSnapshot;
  }
  if (operation.status === 'failed') throw new EndpointError(operation.lastError || 'This checkout attempt failed. Start a new checkout.', { code: 'OPERATION_FAILED' });
  if (operation.status === 'compensating') throw new EndpointError(operation.lastError || 'This checkout attempt is being recovered.', { code: 'OPERATION_COMPENSATING' });

  let snapshot = operation.canonicalSnapshot;
  if (existingOrder) {
    snapshot = snapshot || {
      items: parseJson(existingOrder.items, []), subtotal: Number(existingOrder.subtotal) || 0,
      deliveryFee: Number(existingOrder.deliveryFee) || 0, deliveryPaymentMethod: Number(existingOrder.payableOnDelivery) > 0 ? 'upon_delivery' : 'upon_checkout',
      chargesBreakdown: parseJson(existingOrder.chargesBreakdown, []),
      promo: existingOrder.appliedPromoCode ? { code: existingOrder.appliedPromoCode, discount: Number(existingOrder.discountAmount) || 0,
        shippingSubsidy: Number(existingOrder.promoShippingSubsidy) || 0, cashbackPoints: Number(existingOrder.cashbackPointsAmount) || 0 } : null,
      creditsUsed: Number(existingOrder.storeCreditsUsed) || 0, totalAmount: Number(existingOrder.totalAmount) || 0,
      payableNow: Number(existingOrder.payableNow) || 0, payableOnDelivery: Number(existingOrder.payableOnDelivery) || 0,
      courier: { id: existingOrder.courierId, name: existingOrder.courierName }, deliveryAddress: existingOrder.deliveryAddress,
      customerName: existingOrder.customerName, customerPhone: existingOrder.customerPhone, notes: existingOrder.notes || '',
      fingerprintSnapshot: existingOrder.fingerprintSnapshot || {}, referrer: existingOrder.referredByUserId
        ? { id: existingOrder.referredByUserId, memberId: existingOrder.referredByMemberId } : null,
      paymentDeadlineAt: epochSeconds(existingOrder.paymentDeadlineAt), orderNumber: existingOrder.orderNumber,
    };
    if (snapshot) snapshot.orderNumber = existingOrder.orderNumber || snapshot.orderNumber;
  } else if (!snapshot) {
    if (!request.paymentSessionId || !request.paymentProofData || !request.paymentMethodId) {
      throw new EndpointError('Upload payment proof before submitting this order.', { code: 'PAYMENT_PROOF_REQUIRED' });
    }
    snapshot = await makeCanonicalSnapshot(request, customer, operation.createdAt);
    const stored = await saveCanonicalCheckoutSnapshot({ operationId, snapshot });
    if (!stored.saved) throw new EndpointError('Checkout could not save its recovery snapshot.', { code: 'SNAPSHOT_FAILED' });
    if (stored.snapshot) snapshot = stored.snapshot;
  }

  if (!existingOrder) {
    if (!snapshot.paymentProofData || !snapshot.paymentMethodId) {
      throw new EndpointError('Upload payment proof before submitting this order.', { code: 'PAYMENT_PROOF_REQUIRED' });
    }
    if (Number(operation.expiresAt) <= Math.floor(Date.now() / 1000)) {
      throw new EndpointError('This checkout attempt expired. Start checkout again.', { code: 'OPERATION_EXPIRED' });
    }
    const holdExpiry = Math.floor(Date.now() / 1000) + 20 * 60;
    for (const line of snapshot.reservations) {
      const held = await reserveInventoryLine({ orderId: operationId, ...line, expiresAt: holdExpiry });
      if (!held.reserved) throw new EndpointError('An item is no longer available in the requested quantity.', { code: 'OUT_OF_STOCK' });
    }
    await advanceAtLeast(operationId, 'inventory_held');

    if (snapshot.promo) {
      const claimed = await claimPromoUse({ operationId, promoId: snapshot.promo.id, promoCode: snapshot.promo.code,
        customerId: customer.id, deviceId: snapshot.fingerprintSnapshot.deviceId,
        hardwareId: snapshot.fingerprintSnapshot.hardwareId,
        deviceFingerprintId: snapshot.fingerprintSnapshot.deviceFingerprintId,
        discountAmount: snapshot.promo.discount + snapshot.promo.shippingSubsidy,
        expiresAt: holdExpiry });
      if (!claimed.claimed) throw new EndpointError('Promo use is no longer available.', { code: 'PROMO_LIMIT_REACHED' });
    }
    await advanceAtLeast(operationId, 'promo_claimed');

    const credit = await reserveStoreCredits({ customerId: customer.id, operationId, amount: snapshot.creditsUsed });
    if (!credit.reserved) throw new EndpointError('Store Credits changed. Refresh and review your total.', { code: 'CREDITS_UNAVAILABLE' });
    snapshot.receivedTransferUsed = credit.receivedUsed || 0;
    await advanceAtLeast(operationId, 'credits_reserved');
    snapshot = await persistOrder(snapshot, operationId, customer);
    await advanceAtLeast(operationId, 'order_persisted');
  }

  if (snapshot.promo) {
    const redeemed = await redeemPromoClaim({ operationId, orderId: operationId });
    if (!redeemed.redeemed) throw new EndpointError('Promo claim recovery is required.', { code: 'PROMO_RECOVERY_REQUIRED' });
  }
  await advanceAtLeast(operationId, 'promo_redeemed');
  const finalized = await finalizeStoreCredits({ customerId: customer.id, operationId });
  if (!finalized.finalized) throw new EndpointError('Store Credit recovery is required.', { code: 'CREDIT_RECOVERY_REQUIRED' });
  await advanceAtLeast(operationId, 'credits_finalized');
  await recordOrderEffects(snapshot, operationId, customer);
  await advanceAtLeast(operationId, 'effects_recorded');
  const response = orderResponse(snapshot, operationId);
  const finished = await finishCheckoutOperation({ operationId, responseSnapshot: response });
  if (!finished.finished) throw new EndpointError('Order is saved and will be returned on retry.', { code: 'ORDER_RECOVERY_PENDING' });
  await releaseCustomerCheckoutLock({ customerId: customer.id, operationId });
  return response;
}

export default async function (input, ctx) {
  const submittedAt = Math.floor(Date.now() / 1000);
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]+$/.test(telegramId)) throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  const customer = await db.select().from(customers).where(eq(customers.tgUserId, telegramId)).get();
  if (!customer) throw new EndpointError('Customer account was not found. Reopen the Mini App and try again.', { code: 'CUSTOMER_MISSING' });
  if (customer.isBanned === true) throw new EndpointError('This customer account cannot place orders.', { code: 'CUSTOMER_BANNED' });

  let requestKey = text(input?.operationKey, 128);
  const resuming = input?.resume === true;
  let request;
  let operation;
  if (resuming) {
    operation = await findCheckoutOperation({ customerId: customer.id, requestKey });
    if (operation.ok && !operation.requestSnapshot) {
      throw new EndpointError('This checkout attempt has no recovery snapshot. Start a new checkout.', { code: 'OPERATION_SNAPSHOT_MISSING' });
    }
    request = operation.requestSnapshot || {};
  } else {
    // Resolve an earlier submission before validating a retry's newly-created
    // payment session. A lost response can leave the original session consumed;
    // the checkout operation key remains the durable identity of that order.
    const submittedRequest = sanitizedRequest(input);
    let paymentSession = null;
    if (submittedRequest.paymentSessionId) {
      paymentSession = await db.get(`SELECT id, customer_id AS customerId, operation_key AS operationKey,
          request_snapshot AS requestSnapshot, payment_method_id AS paymentMethodId,
          proof_data AS proofData, proof_content_type AS proofContentType,
          proof_ocr_analysis AS proofOcrAnalysis, status, expires_at AS expiresAt
        FROM payment_sessions WHERE id=:id AND customer_id=:customer_id`, {
        ':id': submittedRequest.paymentSessionId, ':customer_id': String(customer.id),
      });
      if (paymentSession?.operationKey) requestKey = String(paymentSession.operationKey);
    }
    const prior = await findCheckoutOperation({ customerId: customer.id, requestKey });
    if (prior.ok) {
      if (!prior.requestSnapshot) {
        throw new EndpointError('This checkout attempt has no recovery snapshot. Start a new checkout.', { code: 'OPERATION_SNAPSHOT_MISSING' });
      }
      if (prior.status === 'failed') {
        throw new EndpointError('This checkout attempt could not be completed. Start a new checkout to try again.', { code: 'CHECKOUT_ATTEMPT_FAILED' });
      }
      operation = prior;
      request = prior.requestSnapshot;
    } else {
      request = submittedRequest;
      if (!request.paymentSessionId) {
        throw new EndpointError('Upload payment proof before submitting this order.', { code: 'PAYMENT_PROOF_REQUIRED' });
      }
      if (request.paymentSessionId) {
        const session = paymentSession;
        if (!session || session.status !== 'proof_uploaded' || !session.proofData || !session.paymentMethodId || Number(session.expiresAt) <= submittedAt)
          throw new EndpointError('Upload payment proof before submitting this order.', { code: 'PAYMENT_PROOF_REQUIRED' });
        // SQLite returns request_snapshot as JSON text through the raw db.get
        // path. Parse it before sanitizing; treating that string as an object
        // silently discards receiver, address, courier and item fields.
        const sessionRequest = parseJson(session.requestSnapshot, null);
        if (!sessionRequest || typeof sessionRequest !== 'object' || Array.isArray(sessionRequest)) {
          throw new EndpointError('Payment session checkout details could not be read. Please restart checkout.', { code: 'PAYMENT_SESSION_SNAPSHOT_INVALID' });
        }
        request = { ...sanitizedRequest(sessionRequest), paymentSessionId: request.paymentSessionId,
          paymentMethodId: String(session.paymentMethodId || ''), paymentProofData: String(session.proofData || ''),
          paymentProofContentType: String(session.proofContentType || ''), paymentProofOcrAnalysis: session.proofOcrAnalysis || null };
      }
      operation = await beginCheckoutOperation({ customerId: customer.id, requestKey,
        requestSnapshot: request, expiresAt: submittedAt + 20 * 60, submittedAt });
    }
  }
  if (!operation.ok) throw new EndpointError('Checkout retry key is invalid or was reused with different order details.', { code: 'IDEMPOTENCY_CONFLICT' });
  if (operation.status === 'complete' && operation.responseSnapshot) {
    const completedOrder = await db.select().from(orders).where(eq(orders.id, operation.operationId)).get();
    await releaseCustomerCheckoutLock({ customerId: customer.id, operationId: operation.operationId });
    return operation.responseSnapshot;
  }

  let lock = await acquireCustomerCheckoutLock({ customerId: customer.id, operationId: operation.operationId });
  if (!lock.acquired && lock.activeOperationId) {
    const prior = await readOperation(lock.activeOperationId);
    if (prior && prior.customerId === customer.id) {
      if (prior.status === 'complete' || prior.status === 'failed') {
        await releaseCustomerCheckoutLock({ customerId: customer.id, operationId: prior.id });
      } else {
        try {
          await processOperation(prior, prior.requestSnapshot || {}, customer);
        } catch (recoveryError) {
          await compensateUnpersistedOperation(prior.id, customer.id, recoveryError?.message || 'Checkout recovery failed.');
          const persisted = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, prior.id)).get();
          if (persisted) throw recoveryError;
        }
      }
      lock = await acquireCustomerCheckoutLock({ customerId: customer.id, operationId: operation.operationId });
    }
  }
  if (!lock.acquired) throw new EndpointError('Another checkout is being recovered. Retry this order shortly.', { code: 'CHECKOUT_IN_PROGRESS' });
  const fullOperation = { ...operation, id: operation.operationId };
  const storedRequest = operation.created ? request : operation.requestSnapshot || request;
  try {
    const response = await processOperation(fullOperation, storedRequest, customer);
    if (operation.created) await Promise.allSettled([
      notifyOrderCreated({
        chatId: customer.tgUserId,
        orderNumber: response.orderNumber,
        status: response.status,
        customerName: response.receiverName,
        totalAmount: response.totalAmount,
        payableNow: response.payableNow,
        paymentDeadlineAt: response.paymentDeadlineAt,
        paymentStatus: response.paymentStatus,
        items: response.items,
      }),
      notifyAdminOrderCreated({ ...response, customerName: response.receiverName,
        paymentStatus: response.paymentStatus, source: 'shopfront' }),
    ]);
    if (request.paymentSessionId) await db.run(`UPDATE payment_sessions SET status='consumed', consumed_at=unixepoch(), updated_at=unixepoch() WHERE id=:id AND status='proof_uploaded'`, { ':id': request.paymentSessionId });
    return response;
  } catch (error) {
    // If order persistence may have committed, leave all claims intact for retry recovery.
    try { await compensateUnpersistedOperation(operation.operationId, customer.id, error?.message || 'Order creation failed.'); }
    catch { throw error; }
    throw error;
  }
}
