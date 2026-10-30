import { NextResponse } from 'next/server';
import { getTomTomApiKey, setRuntimeTomTomApiKey, isTomTomConfigured } from '@/lib/tomtom';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const key = getTomTomApiKey();
    const isConfigured = isTomTomConfigured();
    const maskedKey = key && key.length > 8
      ? `${key.slice(0, 4)}••••••••${key.slice(-4)}`
      : (key ? '••••••••' : '');

    return NextResponse.json({
      configured: isConfigured,
      maskedKey,
      provider: 'tomtom',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to get logistics settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';

    if (!apiKey) {
      return NextResponse.json({ error: 'TomTom API Key cannot be empty' }, { status: 400 });
    }

    // Set in runtime memory & process.env
    setRuntimeTomTomApiKey(apiKey);

    // Verify key with a quick ping to TomTom
    try {
      const testRes = await fetch(
        `https://api.tomtom.com/search/2/reverseGeocode/14.5995,120.9842.json?key=${encodeURIComponent(apiKey)}&radius=100`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!testRes.ok) {
        return NextResponse.json({
          error: `TomTom returned status ${testRes.status}. Please ensure your API Key is active.`,
        }, { status: 400 });
      }
    } catch (testErr: any) {
      console.warn('TomTom test ping timed out or failed:', testErr);
      // Proceed even if test ping had transient network issue
    }

    return NextResponse.json({
      success: true,
      configured: true,
      message: 'TomTom API Key successfully configured and active.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to save logistics settings' }, { status: 500 });
  }
}
