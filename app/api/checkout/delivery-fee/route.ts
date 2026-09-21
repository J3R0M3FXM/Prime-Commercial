import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { calculateDeliveryFee, calculateRoadDistanceFallback } from '@/lib/delivery-fee';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const destinationLat = Number(body?.destinationLat);
    const destinationLon = Number(body?.destinationLon);
    const courierId = String(body?.courierId || '');

    if (!Number.isFinite(destinationLat) || !Number.isFinite(destinationLon) ||
        destinationLat < -90 || destinationLat > 90 ||
        destinationLon < -180 || destinationLon > 180) {
      return NextResponse.json({ error: 'Valid destination coordinates are required.' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Logistics database is not configured.' }, { status: 503 });
    }

    const supabase = getSupabaseAdmin()!;

    const { data: warehouses, error: warehouseError } = await supabase
      .from('warehouses')
      .select('id,name,address,latitude,longitude,is_active,is_default,sort_order')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('sort_order', { ascending: true });

    if (warehouseError) throw warehouseError;

    const warehouse = (warehouses || []).find(
      (w: any) => Number.isFinite(Number(w.latitude)) && Number.isFinite(Number(w.longitude))
    );

    if (!warehouse) {
      return NextResponse.json(
        { error: 'No active warehouse with valid coordinates is configured. Set up a warehouse before calculating delivery fees.' },
        { status: 409 }
      );
    }

    const originLat = Number(warehouse.latitude);
    const originLon = Number(warehouse.longitude);

    const { data: courierRows, error: courierError } = await supabase
      .from('couriers')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (courierError) throw courierError;

    const couriersList = (courierRows || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      logo: c.logo || '',
      type: c.type || 'Standard',
      baseFare: Number(c.base_fare) || 0,
      firstMile: Number(c.first_mile) || 0,
      firstMileFee: Number(c.first_mile_fee) || 0,
      exceedingKmFee: Number(c.exceeding_km_fee) || 0,
      surcharge: Number(c.surcharge) || 0,
      nightDifferential: Number(c.night_differential) || 0,
    }));

    if (couriersList.length === 0) {
      return NextResponse.json({ error: 'No active couriers are configured.' }, { status: 409 });
    }

    let distanceKm: number | null = null;
    let routingSource = 'geodesic-fallback';
    const apiKey = process.env.GEOAPIFY_API_KEY;

    if (apiKey) {
      try {
        const routingUrl =
          'https://api.geoapify.com/v1/routing' +
          `?waypoints=${encodeURIComponent(`${originLat},${originLon}|${destinationLat},${destinationLon}`)}` +
          `&mode=drive&apiKey=${encodeURIComponent(apiKey)}`;

        const routeRes = await fetch(routingUrl, { cache: 'no-store' });
        if (routeRes.ok) {
          const routeData = await routeRes.json();
          const meters = Number(routeData?.features?.[0]?.properties?.distance);
          if (Number.isFinite(meters) && meters >= 0) {
            distanceKm = meters / 1000;
            routingSource = 'geoapify';
          }
        }
      } catch (error) {
        console.warn('Geoapify routing unavailable; using distance fallback.', error);
      }
    }

    if (distanceKm === null) {
      distanceKm = calculateRoadDistanceFallback(originLat, originLon, destinationLat, destinationLon);
    }

    const roundedDistance = Math.round(Math.max(0, distanceKm) * 100) / 100;

    const computedCouriers = couriersList.map((courier: any) => ({
      ...courier,
      calculatedFee: calculateDeliveryFee(courier, roundedDistance),
      distanceKm: roundedDistance,
    }));

    const targetCourier =
      (courierId && computedCouriers.find((c: any) => c.id === courierId)) ||
      computedCouriers[0];

    return NextResponse.json({
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        address: warehouse.address,
        lat: originLat,
        lon: originLon,
      },
      distanceKm: roundedDistance,
      fee: targetCourier.calculatedFee,
      courier: targetCourier,
      couriers: computedCouriers,
      routingSource,
    });
  } catch (error: any) {
    console.error('Delivery fee calculation error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to calculate delivery fee.' }, { status: 500 });
  }
}
