import { createHash } from 'crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { notifyPaymentUpdated } from '@/lib/telegram-notifications';

export type MayaWebhookChannel = 'card' | 'wallet' | 'unknown';

const MAYA_PRODUCTION_IPS = new Set(['18.138.50.235', '3.1.207.200']);
const MAYA_SANDBOX_IPS = new Set(['13.229.160.234', '3.1.199.75']);
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

const CARD_FUND_SOURCE_TYPES = new Set(['card']);
const WALLET_FUND_SOURCE_TYPES = new Set([
  'maya-wallet',
  'paymaya',
  'qrph',
  'gcash',
  'grabpay',
  'shopeepay',
  'coinsph',
  'alipay',
  'wechatpay',
]);

const HANDLED_STATUSES = new Set([
  'PAYMENT_SUCCESS',
  'PAYMENT_FAILED',
  'PAYMENT_EXPIRED',
  'PAYMENT_CANCELLED',
  'AUTHORIZED',
]);

function getClientIp(request: Request): string {
  // Vercel overwrites x-forwarded-for with the public client IP, which makes
  // it suitable for Maya's documented IP allowlist.
  return (
    request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    ''
  ).split(',')[0].trim();
}

export function isAllowedMayaIp(request: Request): boolean {
  const environment = (process.env.MAYA_ENVIRONMENT || 'production').toLowerCase();
  const configured = process.env.MAYA_WEBHOOK_ENFORCE_IP;
  const enforce = configured ? configured === 'true' : environment === 'production';

  if (!enforce) return true;

  const allowed = environment === 'sandbox' ? MAYA_SANDBOX_IPS : MAYA_PRODUCTION_IPS;
  return allowed.has(getClientIp(request));
}

function getFundSourceType(payload: any): string {
  return String(payload?.fundSource?.type || '').trim().toLowerCase();
}

function hasCardFundingInstrument(payload: any): boolean {
  return Boolean(payload?.paymentDetails?.responses?.efs?.payer?.fundingInstrument?.card);
}

export function detectMayaWebhookChannel(payload: any): MayaWebhookChannel {
  const fundSourceType = getFundSourceType(payload);

  if (CARD_FUND_SOURCE_TYPES.has(fundSourceType) || hasCardFundingInstrument(payload)) {
    return 'card';
  }

  if (WALLET_FUND_SOURCE_TYPES.has(fundSourceType)) {
    return 'wallet';
  }

  const scheme = String(payload?.paymentScheme || '').toLowerCase();
  if (['visa', 'master-card', 'mastercard', 'jcb', 'american-express', 'amex'].includes(scheme)) {
    return 'card';
  }

  return 'unknown';
}

function amountFromPayload(payload: any): number | null {
  const candidates = [
    payload?.amount,
    payload?.totalAmount,
    payload?.amount?.value,
    payload?.totalAmount?.value,
    payload?.paymentDetails?.responses?.efs?.amount?.total?.value,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') continue;
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= 0) return Math.round(value * 100) / 100;
  }

  return null;
}

function currencyFromPayload(payload: any): string | null {
  const raw =
    payload?.currency ||
    payload?.amount?.currency ||
    payload?.totalAmount?.currency ||
    payload?.paymentDetails?.responses?.efs?.amount?.total?.currency;

  if (raw === undefined || raw === null || raw === '') return null;
  return String(raw).trim().toUpperCase();
}

function getPaymentId(payload: any): string {
  return String(payload?.id || '').trim();
}

function getRequestReference(payload: any): string {
  return String(
    payload?.requestReferenceNumber ||
    payload?.requestReferenceNo ||
    payload?.referenceNumber ||
    ''
  ).trim();
}

function getReceiptNumber(payload: any): string {
  return String(payload?.receiptNumber || payload?.receipt?.receiptNo || '').trim();
}

function getEventKey(payload: any): string {
  const paymentId = getPaymentId(payload);
  const status = String(payload?.paymentStatus || payload?.status || '').toUpperCase();
  const updatedAt = String(payload?.updatedAt || '');
  const requestReference = getRequestReference(payload);

  return createHash('sha256')
    .update([paymentId, status, updatedAt, requestReference, JSON.stringify(payload || {})].join('|'))
    .digest('hex');
}

function paymentStatusLabel(status: string): {
  paymentStatus: string;
  reviewStatus: string;
  requiresManualReview: boolean;
} | null {
  switch (status) {
    case 'PAYMENT_SUCCESS':
      return { paymentStatus: 'Paid', reviewStatus: 'Auto Verified', requiresManualReview: false };
    case 'AUTHORIZED':
      return { paymentStatus: 'Authorized', reviewStatus: 'Awaiting Capture', requiresManualReview: false };
    case 'PAYMENT_FAILED':
      return { paymentStatus: 'Payment Failed', reviewStatus: 'Payment Failed', requiresManualReview: false };
    case 'PAYMENT_EXPIRED':
      return { paymentStatus: 'Expired', reviewStatus: 'Payment Expired', requiresManualReview: false };
    case 'PAYMENT_CANCELLED':
      return { paymentStatus: 'Cancelled', reviewStatus: 'Payment Cancelled', requiresManualReview: false };
    default:
      return null;
  }
}

function paymentStatusRank(status: string): number {
  switch (String(status || '').toLowerCase()) {
    case 'paid':
      return 4;
    case 'authorized':
      return 3;
    case 'payment failed':
    case 'expired':
    case 'cancelled':
      return 2;
    default:
      return 1;
  }
}

export function shouldApplyMayaPaymentStatus(currentStatus: string, incomingStatus: string): boolean {
  const currentRank = paymentStatusRank(currentStatus);
  const incomingRank = paymentStatusRank(incomingStatus);

  // A successful payment may legitimately follow a failed/expired/cancelled
  // attempt when the customer retries checkout. Never let a stale lower-ranked
  // webhook move an already stronger state backwards.
  return incomingRank >= currentRank;
}

export function validateMayaWebhookPayload(
  payload: any,
  expectedChannel: Exclude<MayaWebhookChannel, 'unknown'> | null = null,
): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'Invalid JSON payload';
  }

  const paymentId = getPaymentId(payload);
  if (!paymentId || paymentId.length > 200) {
    return 'Missing or invalid payment id';
  }

  const paymentStatus = String(payload?.paymentStatus || payload?.status || '').toUpperCase();
  if (!HANDLED_STATUSES.has(paymentStatus)) {
    return 'Unsupported payment status';
  }

  const channel = detectMayaWebhookChannel(payload);
  if (expectedChannel && channel !== expectedChannel) {
    return 'Payment channel does not match endpoint';
  }

  const amount = amountFromPayload(payload);
  const currency = currencyFromPayload(payload);

  // Maya's Checkout webhook payload represents the payment resource. For
  // money-moving states, require an explicit amount and PHP currency rather
  // than defaulting missing values and accidentally accepting a malformed event.
  if (paymentStatus === 'PAYMENT_SUCCESS' || paymentStatus === 'AUTHORIZED') {
    if (amount === null) return 'Missing or invalid payment amount';
    if (!currency) return 'Missing payment currency';
  }

  if (currency && currency !== 'PHP') {
    return `Unsupported currency: ${currency}`;
  }

  if (getFundSourceType(payload) === 'qrph' && !getReceiptNumber(payload)) {
    return 'QRPH webhook is missing receiptNumber';
  }

  return null;
}

export async function parseMayaWebhookRequest(request: Request): Promise<
  { ok: true; payload: any } | { ok: false; status: number; error: string }
> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Webhook payload too large' };
  }

  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch {
    return { ok: false, status: 400, error: 'Unable to read request body' };
  }

  if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Webhook payload too large' };
  }

  try {
    const payload = JSON.parse(rawBody);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, status: 400, error: 'Invalid JSON payload' };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON' };
  }
}

async function findOrder(supabase: ReturnType<typeof getSupabaseAdmin>, payload: any) {
  const paymentId = getPaymentId(payload);
  const requestReference = getRequestReference(payload);
  const receiptNumber = getReceiptNumber(payload);

  if (!supabase) return null;

  if (paymentId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('maya_payment_id', paymentId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (requestReference) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('maya_request_reference_number', requestReference)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;

    const { data: byOrderNumber, error: orderNumberError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', requestReference)
      .limit(1)
      .maybeSingle();
    if (orderNumberError) throw orderNumberError;
    if (byOrderNumber) return byOrderNumber;
  }

  // Maya recommends receiptNumber for QRPH reconciliation.
  if (receiptNumber) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('maya_receipt_number', receiptNumber)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const metadataOrderId = String(
    payload?.metadata?.orderId ||
    payload?.metadata?.order_id ||
    payload?.metadata?.primeOrderId ||
    ''
  ).trim();

  if (metadataOrderId) {
    const { data: byId, error: byIdError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', metadataOrderId)
      .limit(1)
      .maybeSingle();
    if (byIdError) throw byIdError;
    if (byId) return byId;

    const { data: byOrderNumber, error: byOrderNumberError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', metadataOrderId)
      .limit(1)
      .maybeSingle();
    if (byOrderNumberError) throw byOrderNumberError;
    if (byOrderNumber) return byOrderNumber;
  }

  return null;
}

function amountsMatch(order: any, webhookAmount: number | null): boolean {
  // Failure/expiry/cancellation payloads may omit amount; successful and
  // authorized events are required to provide it by validateMayaWebhookPayload.
  if (webhookAmount === null) return true;
  const expected = Number(order?.payable_now ?? order?.total_amount ?? 0);
  if (!Number.isFinite(expected)) return false;
  return Math.abs(expected - webhookAmount) < 0.01;
}

export async function processMayaWebhook(
  request: Request,
  payload: any,
  expectedChannel: Exclude<MayaWebhookChannel, 'unknown'> | null = null,
) {
  if (!isAllowedMayaIp(request)) {
    return { status: 403, body: { received: false, error: 'Source not allowed' } };
  }

  const validationError = validateMayaWebhookPayload(payload, expectedChannel);
  if (validationError) {
    const isUnsupported = validationError === 'Unsupported payment status';
    const isRouting = validationError === 'Payment channel does not match endpoint';
    return {
      status: isUnsupported || isRouting ? 200 : 400,
      body: {
        received: isUnsupported || isRouting,
        ...(isUnsupported ? { ignored: true } : {}),
        ...(isRouting ? { routed: false } : {}),
        error: validationError,
      },
    };
  }

  const paymentStatus = String(payload?.paymentStatus || payload?.status || '').toUpperCase();
  const channel = detectMayaWebhookChannel(payload);

  if (!isSupabaseConfigured()) {
    console.error('[MAYA WEBHOOK] Supabase is not configured');
    return { status: 500, body: { received: false, error: 'Webhook storage unavailable' } };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { status: 500, body: { received: false, error: 'Webhook storage unavailable' } };
  }

  const paymentId = getPaymentId(payload);
  const requestReference = getRequestReference(payload);
  const receiptNumber = getReceiptNumber(payload);
  const webhookAmount = amountFromPayload(payload);
  const currency = currencyFromPayload(payload) || 'PHP';
  const fundSourceType = getFundSourceType(payload);
  const eventKey = getEventKey(payload);

  let eventId = '';
  const { data: insertedEvent, error: eventInsertError } = await supabase
    .from('maya_webhook_events')
    .insert([{
      event_key: eventKey,
      payment_id: paymentId || null,
      request_reference_number: requestReference || null,
      receipt_number: receiptNumber || null,
      payment_status: paymentStatus,
      channel,
      amount: webhookAmount,
      currency,
      fund_source_type: fundSourceType || null,
      payload,
      processing_status: 'RECEIVED',
    }])
    .select('id')
    .single();

  if (eventInsertError) {
    if (eventInsertError.code !== '23505') {
      console.error('[MAYA WEBHOOK] Event audit insert failed:', eventInsertError);
      return { status: 500, body: { received: false, error: 'Webhook audit storage failed' } };
    }

    const { data: existingEvent, error: existingEventError } = await supabase
      .from('maya_webhook_events')
      .select('id,processing_status')
      .eq('event_key', eventKey)
      .limit(1)
      .maybeSingle();

    if (existingEventError) {
      console.error('[MAYA WEBHOOK] Existing event lookup failed:', existingEventError);
      return { status: 500, body: { received: false, error: 'Webhook audit lookup failed' } };
    }

    if (!existingEvent) {
      return { status: 500, body: { received: false, error: 'Webhook audit state unavailable' } };
    }

    if (
      existingEvent.processing_status === 'PROCESSED' ||
      existingEvent.processing_status === 'UNMATCHED' ||
      existingEvent.processing_status === 'REJECTED'
    ) {
      return {
        status: 200,
        body: {
          received: true,
          duplicate: true,
          processingStatus: existingEvent.processing_status,
        },
      };
    }

    eventId = String(existingEvent.id);
    await supabase
      .from('maya_webhook_events')
      .update({
        processing_status: 'RECEIVED',
        processing_error: null,
        processed_at: null,
      })
      .eq('id', eventId);
  } else {
    eventId = String(insertedEvent?.id || '');
  }

  if (!eventId) {
    return { status: 500, body: { received: false, error: 'Webhook audit event ID missing' } };
  }

  let order: any = null;

  try {
    order = await findOrder(supabase, payload);

    if (!order) {
      await supabase
        .from('maya_webhook_events')
        .update({
          processing_status: 'UNMATCHED',
          processing_error: 'No PRIME order matched Maya payment ID, request reference, receipt number, or metadata.',
          processed_at: new Date().toISOString(),
        })
        .eq('id', eventId);

      console.warn('[MAYA WEBHOOK] Unmatched payment event', {
        paymentId,
        requestReference,
        receiptNumber,
        paymentStatus,
        channel,
      });

      return { status: 200, body: { received: true, matched: false } };
    }

    if (currency !== 'PHP') {
      const message = `Unsupported currency: ${currency}`;
      await supabase
        .from('maya_webhook_events')
        .update({
          order_id: order.id,
          processing_status: 'REJECTED',
          processing_error: message,
          processed_at: new Date().toISOString(),
        })
        .eq('id', eventId);
      return { status: 200, body: { received: true, processed: false, rejected: true, error: message } };
    }

    if (!amountsMatch(order, webhookAmount)) {
      const expected = Number(order.payable_now ?? order.total_amount ?? 0);
      const received = webhookAmount === null ? 'missing' : Number(webhookAmount).toFixed(2);
      const message = `Payment amount mismatch: expected ${expected.toFixed(2)}, received ${received}`;
      await supabase
        .from('maya_webhook_events')
        .update({
          order_id: order.id,
          processing_status: 'REJECTED',
          processing_error: message,
          processed_at: new Date().toISOString(),
        })
        .eq('id', eventId);
      return { status: 200, body: { received: true, processed: false, rejected: true, error: message } };
    }

    const labels = paymentStatusLabel(paymentStatus);
    if (!labels) {
      return { status: 200, body: { received: true, ignored: true } };
    }

    if (!shouldApplyMayaPaymentStatus(String(order.payment_status || 'Unpaid'), labels.paymentStatus)) {
      await supabase
        .from('maya_webhook_events')
        .update({
          order_id: order.id,
          processing_status: 'PROCESSED',
          processing_error: 'Ignored stale payment status transition.',
          processed_at: new Date().toISOString(),
        })
        .eq('id', eventId);

      return {
        status: 200,
        body: {
          received: true,
          processed: true,
          stale: true,
          paymentStatus: order.payment_status,
          channel,
        },
      };
    }

    const orderUpdate = {
      payment_status: labels.paymentStatus,
      review_status: labels.reviewStatus,
      requires_manual_review: labels.requiresManualReview,
      maya_payment_id: paymentId || order.maya_payment_id || null,
      maya_request_reference_number: requestReference || order.maya_request_reference_number || null,
      maya_receipt_number: receiptNumber || order.maya_receipt_number || null,
      maya_payment_scheme: String(payload?.paymentScheme || '').trim() || null,
      maya_fund_source_type: fundSourceType || null,
      maya_last_webhook_status: paymentStatus,
      maya_last_webhook_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: updatedOrder, error: orderUpdateError } = await supabase
      .from('orders')
      .update(orderUpdate)
      .eq('id', order.id)
      .select('id,order_number,tg_user_id,customer_name,total_amount,payable_now,status,payment_status')
      .single();

    if (orderUpdateError) throw orderUpdateError;

    await supabase
      .from('maya_webhook_events')
      .update({
        order_id: updatedOrder.id,
        processing_status: 'PROCESSED',
        processing_error: null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (updatedOrder.tg_user_id) {
      void notifyPaymentUpdated({
        chatId: updatedOrder.tg_user_id,
        orderNumber: String(updatedOrder.order_number),
        status: String(updatedOrder.status || 'Processing'),
        totalAmount: Number(updatedOrder.total_amount) || undefined,
        payableNow: Number(updatedOrder.payable_now) || undefined,
        paymentStatus: String(updatedOrder.payment_status || labels.paymentStatus),
        event: 'payment',
      });
    }

    console.info('[MAYA WEBHOOK PROCESSED]', {
      eventId,
      orderId: updatedOrder.id,
      paymentId,
      requestReference,
      receiptNumber,
      paymentStatus,
      channel,
    });

    return {
      status: 200,
      body: {
        received: true,
        processed: true,
        orderId: updatedOrder.id,
        paymentStatus: labels.paymentStatus,
        channel,
      },
    };
  } catch (error: any) {
    const message = error?.message || 'Webhook processing failed';

    await supabase
      .from('maya_webhook_events')
      .update({
        order_id: order?.id || null,
        processing_status: 'FAILED',
        processing_error: message.slice(0, 1000),
        processed_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    console.error('[MAYA WEBHOOK] Processing failed:', {
      eventId,
      paymentId,
      requestReference,
      receiptNumber,
      paymentStatus,
      error: message,
    });

    // Transient processing failures must return 5xx so Maya can retry. The
    // event row remains FAILED and is eligible for reprocessing on the next delivery.
    return { status: 500, body: { received: false, processed: false, error: 'Temporary webhook processing failure' } };
  }
}
