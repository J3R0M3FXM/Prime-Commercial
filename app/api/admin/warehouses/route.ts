import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getWarehousesFromDb } from '@/lib/db-adapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const warehouses = await getWarehousesFromDb();
    return NextResponse.json(warehouses);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 400 });
    const supabase = getSupabaseAdmin()!;
    const data = await request.json();
    const isDefault = data.isDefault === true;

    if (isDefault) {
      const { error: clearDefaultError } = await supabase.from('warehouses').update({ is_default: false }).neq('id', '0');
      if (clearDefaultError) throw clearDefaultError;
    }

    const payload = {
      name: String(data.name || '').trim(),
      code: String(data.code || '').trim(),
      address: String(data.address || '').trim(),
      latitude: data.lat !== undefined && data.lat !== null ? Number(data.lat) : null,
      longitude: data.lon !== undefined && data.lon !== null ? Number(data.lon) : null,
      is_active: data.isActive !== false,
      is_default: isDefault,
      sort_order: Number(data.sortOrder) || 0,
      updated_at: new Date().toISOString(),
    };

    if (!payload.name || !payload.address) {
      return NextResponse.json({ error: 'Warehouse name and address are required' }, { status: 400 });
    }
    const { data: inserted, error } = await supabase.from('warehouses').insert([payload]).select().single();
    if (error) throw error;
    return NextResponse.json({ id: inserted.id, ...data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 400 });
    const supabase = getSupabaseAdmin()!;
    const { id, ...data } = await request.json();
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    const isDefault = data.isDefault === true;
    if (isDefault) {
      const { error: clearDefaultError } = await supabase.from('warehouses').update({ is_default: false }).neq('id', id);
      if (clearDefaultError) throw clearDefaultError;
    }

    const payload = {
      name: String(data.name || '').trim(),
      code: String(data.code || '').trim(),
      address: String(data.address || '').trim(),
      latitude: data.lat !== undefined && data.lat !== null ? Number(data.lat) : null,
      longitude: data.lon !== undefined && data.lon !== null ? Number(data.lon) : null,
      is_active: data.isActive !== false,
      is_default: isDefault,
      sort_order: Number(data.sortOrder) || 0,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('warehouses').update(payload).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true, id, ...data });
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
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    const { error } = await supabase.from('warehouses').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
