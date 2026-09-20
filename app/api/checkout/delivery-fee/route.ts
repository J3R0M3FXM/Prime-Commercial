import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

function calculateCourierFee(courier: any, distanceKm: number) {
  const baseFare = Number(courier?.baseFare || courier?.base_fare) || 0;
  const firstMile = Number(courier?.firstMile || courier?.first_mile) || 0;
  const firstMileFee = Number(courier?.firstMileFee || courier?.first_mile_fee) || 0;
  const exceedingKmFee = Number(courier?.exceedingKmFee || courier?.exceeding_km_fee) || 0;
  const surcharge = Number(courier?.surcharge) || 0;
  const nightDifferential = Number(courier?.nightDifferential || courier?.night_differential) || 0;

  let fee = baseFare;

  if (distanceKm <= firstMile) {
    fee += (distanceKm * firstMileFee);
  } else {
    fee += (firstMile * firstMileFee);
    const excessKm = distanceKm - firstMile;
    fee += (excessKm * exceedingKmFee);
  }

  fee += surcharge + nightDifferential;
  return Math.round(fee * 100) / 100;
}

export async function POST(request: Request) {
  try {
    const { destinationLat, destinationLon, courierId } = await request.json();

    if (!destinationLat || !destinationLon) {
      return NextResponse.json({ error: "Missing destination coordinates" }, { status: 400 });
    }

    let originLat = 14.5995;
    let originLon = 120.9842;

    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin()!;
        const { data: whData } = await supabase.from('warehouses').select('*').order('sort_order', { ascending: true });
        if (whData && whData.length > 0) {
          const defaultWh = whData.find((w: any) => w.is_default) || whData[0];
          originLat = defaultWh.lat || originLat;
          originLon = defaultWh.lon || originLon;
        }
      } catch (e) {
        console.warn("Notice: Warehouse query fallback used", e);
      }
    }

    let couriersList: any[] = [];
    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin()!;
        const { data: cData } = await supabase.from('couriers').select('*').order('sort_order', { ascending: true });
        if (cData) {
          couriersList = cData.map(c => ({
            id: c.id,
            name: c.name,
            baseFare: c.base_fare || c.baseFare || 49,
            firstMile: c.first_mile || c.firstMile || 3.5,
            firstMileFee: c.first_mile_fee || c.firstMileFee || 9,
            exceedingKmFee: c.exceeding_km_fee || c.exceedingKmFee || 10.5,
            surcharge: c.surcharge || 0,
            nightDifferential: c.night_differential || c.nightDifferential || 0,
            logo: c.logo || ''
          }));
        }
      } catch (e) {
        console.warn("Couriers fetch error:", e);
      }
    }

    if (couriersList.length === 0) {
      couriersList = [
        {
          id: "standard-lalamove",
          name: "Lalamove",
          baseFare: 49,
          firstMile: 3.5,
          firstMileFee: 9,
          exceedingKmFee: 10.5,
          surcharge: 0,
          nightDifferential: 0,
          logo: ""
        }
      ];
    }

    const apiKey = process.env.GEOAPIFY_API_KEY;
    let distanceKm = 5;

    if (apiKey) {
      try {
        const routingUrl = `https://api.geoapify.com/v1/routing?waypoints=${originLat},${originLon}|${destinationLat},${destinationLon}&mode=drive&apiKey=${apiKey}`;
        const routeRes = await fetch(routingUrl);
        if (routeRes.ok) {
          const routeData = await routeRes.json();
          if (routeData.features && routeData.features.length > 0) {
            const distanceMeters = routeData.features[0].properties.distance;
            distanceKm = distanceMeters / 1000;
          }
        }
      } catch (err) {
        const R = 6371;
        const dLat = (destinationLat - originLat) * Math.PI / 180;
        const dLon = (destinationLon - originLon) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(originLat * Math.PI / 180) * Math.cos(destinationLat * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distanceKm = Math.max(1, Math.round(R * c * 1.3 * 10) / 10);
      }
    }

    const roundedDistance = Math.round(distanceKm * 100) / 100;

    const computedCouriers = couriersList.map(c => {
      const fee = calculateCourierFee(c, roundedDistance);
      return {
        ...c,
        calculatedFee: fee,
        distanceKm: roundedDistance,
      };
    });

    const targetCourier = (courierId ? computedCouriers.find(c => c.id === courierId) : null) || computedCouriers[0];

    return NextResponse.json({
      distanceKm: roundedDistance,
      fee: targetCourier?.calculatedFee || 0,
      courier: targetCourier,
      couriers: computedCouriers
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
