import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  const { initData } = await request.json();

  if (!initData) {
    return NextResponse.json({ error: 'Missing initData' }, { status: 400 });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Telegram validation logic
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');

  if (hash !== calculatedHash) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // If valid, generate a cryptotoken
  const cryptoToken = crypto.randomBytes(32).toString('hex');
  
  // In a real app, store this token in a secure, server-side store (e.g., Redis or DB) 
  // with an expiry and bind it to the Telegram user ID.

  return NextResponse.json({ success: true, token: cryptoToken });
}
