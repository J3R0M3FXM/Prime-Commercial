import { NextResponse } from 'next/server';
import { processMayaWebhook } from '@/lib/maya-webhook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ received: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const result = await processMayaWebhook(request, payload, 'wallet');
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'PRIME Maya Checkout mobile wallet webhook',
    endpoint: '/api/webhooks/maya/wallet',
  });
}
