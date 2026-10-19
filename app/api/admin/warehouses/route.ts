import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase';
import { getWarehousesFromDb } from '@/lib/db-adapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!isSupabaseAdminConfigured()) return NextResponse.json({ error: 'Supabase admin credentials are not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const warehouses = await getWarehousesFromDb();
    return NextResponse.json(warehouses, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseAdminConfigured()) return NextResponse.json({ error: 'Supabase admin client is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const supabase = getSupabaseAdmin()!;
    const data = await request.json();
    const name = String(data.name || '').trim();
    const address = String(data.address || '').trim();
    if (!name || !address) {
      return NextResponse.json({ error: 'Warehouse name and address are required' }, { status: 400 });
    }

    const isDefault = data.isDefault === true;
    let previousDefaultIds: string[] = [];
    if (isDefault) {
      const { data: defaults, error: defaultsError } = await supabase
        .from('warehouses').select('id').eq('is_default', true);
      if (defaultsError) throw defaultsError;
      previousDefaultIds = (defaults || []).map((row: any) => String(row.id));
    }

    const payload = {
      name,
      code: String(data.code || '').trim(),
      address,
      latitude: data.lat !== undefined && data.lat !== null ? Number(data.lat) : null,
      longitude: data.lon !== undefined && data.lon !== null ? Number(data.lon) : null,
      is_active: data.isActive !== false,
      // Establish the row first, then switch the default with compensation if needed.
      is_default: false,
      sort_order: Number(data.sortOrder) || 0,
      updated_at: new Date().toISOString(),
    };
    if ((payload.latitude !== null && !Number.isFinite(payload.latitude)) ||
        (payload.longitude !== null && !Number.isFinite(payload.longitude))) {
      return NextResponse.json({ error: 'Warehouse coordinates must be valid numbers' }, { status: 400 });
    }

    const { data: inserted, error: insertError } = await supabase.from('warehouses').insert([payload]).select().single();
    if (insertError) throw insertError;

    if (isDefault) {
      if (previousDefaultIds.length) {
        const { error: clearError } = await supabase.from('warehouses').update({ is_default: false }).in('id', previousDefaultIds);
        if (clearError) {
          await supabase.from('warehouses').delete().eq('id', inserted.id);
          throw clearError;
        }
      }
      const { error: setDefaultError } = await supabase.from('warehouses').update({ is_default: true }).eq('id', inserted.id);
      if (setDefaultError) {
        if (previousDefaultIds.length) {
          await supabase.from('warehouses').update({ is_default: true }).in('id', previousDefaultIds);
        }
        await supabase.from('warehouses').delete().eq('id', inserted.id);
        throw setDefaultError;
      }
    }

    return NextResponse.json({ id: inserted.id, ...data, isDefault });
  } catch (error: any) {
    console.error('Failed to create warehouse:', error);
    return NextResponse.json({ error: error.message || 'Failed to create warehouse' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!isSupabaseAdminConfigured()) return NextResponse.json({ error: 'Supabase admin client is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const supabase = getSupabaseAdmin()!;
    const { id, ...data } = await request.json();
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const { data: existing, error: existingError } = await supabase
      .from('warehouses').select('id,is_default').eq('id', id).maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });

    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) {
      payload.name = String(data.name || '').trim();
      if (!payload.name) return NextResponse.json({ error: 'Warehouse name cannot be empty' }, { status: 400 });
    }
    if (data.code !== undefined) payload.code = String(data.code || '').trim();
    if (data.address !== undefined) {
      payload.address = String(data.address || '').trim();
      if (!payload.address) return NextResponse.json({ error: 'Warehouse address cannot be empty' }, { status: 400 });
    }
    if (data.lat !== undefined) {
      payload.latitude = data.lat === null ? null : Number(data.lat);
      if (payload.latitude !== null && !Number.isFinite(payload.latitude)) return NextResponse.json({ error: 'Warehouse latitude must be a valid number' }, { status: 400 });
    }
    if (data.lon !== undefined) {
      payload.longitude = data.lon === null ? null : Number(data.lon);
      if (payload.longitude !== null && !Number.isFinite(payload.longitude)) return NextResponse.json({ error: 'Warehouse longitude must be a valid number' }, { status: 400 });
    }
    if (data.isActive !== undefined) payload.is_active = Boolean(data.isActive);
    if (data.isDefault !== undefined) payload.is_default = Boolean(data.isDefault);
    if (data.sortOrder !== undefined) payload.sort_order = Number(data.sortOrder) || 0;
    if (Object.keys(payload).length === 1) return NextResponse.json({ error: 'No warehouse fields supplied for update' }, { status: 400 });

    if (payload.is_default === true) {
      const { data: defaults, error: defaultsError } = await supabase
        .from('warehouses').select('id').eq('is_default', true).neq('id', id);
      if (defaultsError) throw defaultsError;
      const previousDefaultIds = (defaults || []).map((row: any) => String(row.id));

      const { data: updated, error: updateError } = await supabase
        .from('warehouses').update(payload).eq('id', id).select('id').maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });

      if (previousDefaultIds.length) {
        const { error: clearError } = await supabase.from('warehouses').update({ is_default: false }).in('id', previousDefaultIds);
        if (clearError) {
          await supabase.from('warehouses').update({ is_default: Boolean(existing.is_default) }).eq('id', id);
          throw clearError;
        }
      }
      return NextResponse.json({ success: true, id, ...data });
    }

    const { data: updated, error: updateError } = await supabase
      .from('warehouses').update(payload).eq('id', id).select('id').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    return NextResponse.json({ success: true, id, ...data });
  } catch (error: any) {
    console.error('Failed to update warehouse:', error);
    return NextResponse.json({ error: error.message || 'Failed to update warehouse' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!isSupabaseAdminConfigured()) return NextResponse.json({ error: 'Supabase admin client is not configured; check SUPABASE_SERVICE_ROLE_KEY' }, { status: 503 });
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
