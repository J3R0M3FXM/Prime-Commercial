import { NextResponse } from 'next/server';
import { parseMayaWebhookRequest, processMayaWebhook } from '@/lib/maya-webhook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const parsed = await parseMayaWebhookRequest(request);
  if (!parsed.ok) {
    return NextResponse.json({ received: false, error: parsed.error }, { status: parsed.status });
  }

  const result = await processMayaWebhook(request, parsed.payload, 'card');
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'PRIME Maya Checkout card webhook',
    endpoint: '/api/webhooks/maya/card',
  });
}
