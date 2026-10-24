import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET() {
  const configured = isSupabaseConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!configured) {
    return NextResponse.json(
      { ok: false, service: 'prime-commercial', checks: { configuration: false } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Supabase admin client unavailable');
    const { error } = await supabase.from('products').select('id', { count: 'exact', head: true });
    if (error) throw error;

    return NextResponse.json(
      { ok: true, service: 'prime-commercial', checks: { configuration: true, database: true } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    // Never return connection strings, credentials, SQL details, or customer data.
    console.error('Health check database probe failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json(
      { ok: false, service: 'prime-commercial', checks: { configuration: true, database: false } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
