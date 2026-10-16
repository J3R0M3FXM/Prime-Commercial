import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' });
  const { data, error } = await supabase.from('products').select('*');
  return NextResponse.json({ data, error });
}
