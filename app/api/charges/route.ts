import { NextResponse } from 'next/server';
import { getChargesFromDb } from '@/lib/db-adapter';
import { isSupabaseAdminConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    if (!isSupabaseAdminConfigured()) return NextResponse.json({ error: 'Charges are temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const charges = await getChargesFromDb();
    return NextResponse.json(charges);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load charges' }, { status: 500 });
  }
}
