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
      await supabase.from('warehouses').update({ is_default: false }).neq('id', '0');
    }

    const payload = {
      name: data.name,
      code: data.code || '',
      address: data.address || '',
      is_active: data.isActive !== false,
      is_default: isDefault,
      sort_order: Number(data.sortOrder) || 0,
    };

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
      await supabase.from('warehouses').update({ is_default: false }).neq('id', id);
    }

    const payload = {
      name: data.name,
      code: data.code,
      address: data.address,
      is_active: data.isActive,
      is_default: isDefault,
      sort_order: Number(data.sortOrder),
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
