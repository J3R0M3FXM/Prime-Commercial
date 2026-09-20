import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAYA_PRODUCTION_IPS = new Set(['18.138.50.235', '3.1.207.200']);
const MAYA_SANDBOX_IPS = new Set(['13.229.160.234', '3.1.199.75']);

function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || '';
}

function isAllowedMayaIp(request: Request) {
  if (process.env.MAYA_WEBHOOK_ENFORCE_IP !== 'true') return true;
  const environment = (process.env.MAYA_ENVIRONMENT || 'production').toLowerCase();
  const allowed = environment === 'sandbox' ? MAYA_SANDBOX_IPS : MAYA_PRODUCTION_IPS;
  return allowed.has(getClientIp(request));
}

export async function POST(request: Request) {
  // Maya requires a fast 2xx acknowledgement. Keep the network-facing
  // acknowledgement independent from slower order reconciliation work.
  if (!isAllowedMayaIp(request)) {
    return NextResponse.json({ received: false, error: 'Source not allowed' }, { status: 403 });
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ received: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const paymentStatus = String(payload?.paymentStatus || '').toUpperCase();
  const paymentId = String(payload?.id || '');
  const reference = String(
    payload?.requestReferenceNumber ||
    payload?.requestReferenceNo ||
    payload?.referenceNumber ||
    ''
  );

  console.info('[MAYA WEBHOOK]', {
    paymentStatus,
    paymentId,
    reference,
    receivedAt: new Date().toISOString(),
  });

  // Reconciliation can safely be expanded here as Maya credentials and the
  // exact order-reference mapping are configured. Never trust a webhook to
  // mutate an order until its correlation key is unambiguous.
  if (isSupabaseConfigured() && paymentId) {
    // Keep this endpoint non-blocking for Maya. The payload is intentionally
    // not persisted into an existing business table until a dedicated
    // idempotency/audit table is introduced.
    void getSupabaseAdmin();
  }

  return NextResponse.json({ received: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'PRIME Maya Checkout webhook',
    endpoint: '/api/webhooks/maya',
  });
}
