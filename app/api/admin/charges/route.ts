import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getChargesFromDb } from '@/lib/db-adapter';
import { normalizeCharge } from '@/lib/charges';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const charges = await getChargesFromDb();
    return NextResponse.json(charges);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 400 });
    const supabase = getSupabaseAdmin()!;
    const data = await request.json();
    const normalized = normalizeCharge(data);
    
    const payload = {
      name: normalized.name,
      type: normalized.type,
      rate: normalized.amount,
      is_active: normalized.isActive !== false,
      description: JSON.stringify({ ...(normalized.schedules || {}), isDefault: normalized.isDefault }),
      sort_order: 0,
    };

    const { data: inserted, error } = await supabase.from('charges').insert([payload]).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, id: inserted.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 400 });
    const supabase = getSupabaseAdmin()!;
    const data = await request.json();
    const { id, ...updateData } = data;
    if (!id) return NextResponse.json({ error: "Missing charge ID" }, { status: 400 });

    const normalized = normalizeCharge({ id, ...updateData }, id);

    const payload = {
      name: normalized.name,
      type: normalized.type,
      rate: normalized.amount,
      is_active: normalized.isActive !== false,
      description: JSON.stringify({ ...(normalized.schedules || {}), isDefault: normalized.isDefault }),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from('charges').update(payload).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 400 });
    const supabase = getSupabaseAdmin()!;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Missing charge ID" }, { status: 400 });

    const { error } = await supabase.from('charges').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
