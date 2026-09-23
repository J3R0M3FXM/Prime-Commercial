import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: Request) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  try {
    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase.rpc('process_matured_referrals');
    if (error) throw error;

    return NextResponse.json(
      { success: true, processed: Number(data?.processed || 0) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    console.error('Loyalty cron failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process loyalty rewards.' },
      { status: 500 }
    );
  }
}
