import { NextResponse } from 'next/server';
import { detectMayaWebhookChannel, parseMayaWebhookRequest, processMayaWebhook } from '@/lib/maya-webhook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const parsed = await parseMayaWebhookRequest(request);
  if (!parsed.ok) {
    return NextResponse.json({ received: false, error: parsed.error }, { status: parsed.status });
  }

  const channel = detectMayaWebhookChannel(parsed.payload);
  const result = await processMayaWebhook(
    request,
    parsed.payload,
    channel === 'card' || channel === 'wallet' ? channel : null,
  );

  return NextResponse.json(result.body, { status: result.status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'PRIME Maya Checkout webhook router',
    endpoints: {
      all: '/api/webhooks/maya',
      card: '/api/webhooks/maya/card',
      wallet: '/api/webhooks/maya/wallet',
    },
    events: [
      'PAYMENT_SUCCESS',
      'PAYMENT_FAILED',
      'PAYMENT_EXPIRED',
      'PAYMENT_CANCELLED',
      'AUTHORIZED',
    ],
  });
}
