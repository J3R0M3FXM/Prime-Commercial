import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

let cachedCouriers: any[] | null = null;
let lastCouriersFetchTime = 0;
const COURIERS_CACHE_TTL_MS = 60000;

export async function GET() {
  try {
    const now = Date.now();
    if (cachedCouriers && (now - lastCouriersFetchTime < COURIERS_CACHE_TTL_MS)) {
      return NextResponse.json(cachedCouriers);
    }

    if (!isSupabaseConfigured()) return NextResponse.json([]);
    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase.from('couriers').select('*');
    if (error) throw error;

    const couriers = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      logo: c.logo,
      type: c.type,
      baseFare: c.base_fare,
      firstMile: c.first_mile,
      firstMileFee: c.first_mile_fee,
      exceedingKmFee: c.exceeding_km_fee,
      surcharge: c.surcharge,
      nightDifferential: c.night_differential,
      createdAt: c.created_at,
      updatedAt: c.updated_at
    }));

    couriers.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

    cachedCouriers = couriers;
    lastCouriersFetchTime = now;

    return NextResponse.json(couriers);
  } catch (error: any) {
    if (cachedCouriers) return NextResponse.json(cachedCouriers);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    cachedCouriers = null;
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 400 });
    const supabase = getSupabaseAdmin()!;
    const data = await request.json().catch(() => ({}));
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: "Courier name is required" }, { status: 400 });
    }

    const payload = {
      name,
      logo: typeof data.logo === 'string' ? data.logo : '',
      type: data.type || "Standard",
      base_fare: Number(data.baseFare) || 0,
      first_mile: Number(data.firstMile) || 0,
      first_mile_fee: Number(data.firstMileFee) || 0,
      exceeding_km_fee: Number(data.exceedingKmFee) || 0,
      surcharge: Number(data.surcharge) || 0,
      night_differential: Number(data.nightDifferential) || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let { data: inserted, error } = await supabase.from('couriers').insert([payload]).select().single();
    if (error?.code === 'PGRST204' && /base_fare|first_mile|first_mile_fee|exceeding_km_fee|surcharge|night_differential|logo|type/.test(error.message || '')) {
      const fallbackPayload = {
        name,
        tracking_url_pattern: typeof data.trackingUrlPattern === 'string' ? data.trackingUrlPattern : '',
        is_active: data.isActive !== false,
        sort_order: Number(data.sortOrder) || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const retry = await supabase.from('couriers').insert([fallbackPayload]).select().single();
      inserted = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    return NextResponse.json({ id: inserted.id, ...data });
  } catch (error: any) {
    console.error("Failed to create courier:", error);
    return NextResponse.json({ error: error.message || "Failed to create courier" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    cachedCouriers = null;
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 400 });
    const supabase = getSupabaseAdmin()!;
    const body = await request.json().catch(() => ({}));
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "Missing courier ID" }, { status: 400 });

    const payload: any = {
      updated_at: new Date().toISOString()
    };

    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.logo !== undefined) payload.logo = data.logo;
    if (data.type !== undefined) payload.type = data.type;
    if (data.baseFare !== undefined) payload.base_fare = Number(data.baseFare) || 0;
    if (data.firstMile !== undefined) payload.first_mile = Number(data.firstMile) || 0;
    if (data.firstMileFee !== undefined) payload.first_mile_fee = Number(data.firstMileFee) || 0;
    if (data.exceedingKmFee !== undefined) payload.exceeding_km_fee = Number(data.exceedingKmFee) || 0;
    if (data.surcharge !== undefined) payload.surcharge = Number(data.surcharge) || 0;
    if (data.nightDifferential !== undefined) payload.night_differential = Number(data.nightDifferential) || 0;

    let { error } = await supabase.from('couriers').update(payload).eq('id', id);
    if (error?.code === 'PGRST204' && /base_fare|first_mile|first_mile_fee|exceeding_km_fee|surcharge|night_differential|logo|type/.test(error.message || '')) {
      const fallbackPayload: any = { updated_at: new Date().toISOString() };
      if (data.name !== undefined) fallbackPayload.name = String(data.name).trim();
      if (data.trackingUrlPattern !== undefined) fallbackPayload.tracking_url_pattern = data.trackingUrlPattern;
      if (data.isActive !== undefined) fallbackPayload.is_active = Boolean(data.isActive);
      if (data.sortOrder !== undefined) fallbackPayload.sort_order = Number(data.sortOrder) || 0;
      const retry = await supabase.from('couriers').update(fallbackPayload).eq('id', id);
      error = retry.error;
    }
    if (error) throw error;
    return NextResponse.json({ success: true, id, ...data });
  } catch (error: any) {
    console.error("Failed to update courier:", error);
    return NextResponse.json({ error: error.message || "Failed to update courier" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    cachedCouriers = null;
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 400 });
    const supabase = getSupabaseAdmin()!;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    
    const { error } = await supabase.from('couriers').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
