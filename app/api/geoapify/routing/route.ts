import { NextResponse } from 'next/server';
import { calculateRouteTomTom, isTomTomConfigured } from '@/lib/tomtom';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const waypoints = searchParams.get('waypoints'); // e.g., "14.5995,120.9842|14.6000,120.9900"
    
    if (!waypoints) {
      return NextResponse.json({ error: "Missing waypoints" }, { status: 400 });
    }

    // 1. Try TomTom Route Calculation
    if (isTomTomConfigured()) {
      try {
        const parts = waypoints.split('|');
        if (parts.length >= 2) {
          const [startLat, startLon] = parts[0].split(',').map(Number);
          const [endLat, endLon] = parts[1].split(',').map(Number);

          if (Number.isFinite(startLat) && Number.isFinite(startLon) && Number.isFinite(endLat) && Number.isFinite(endLon)) {
            const tomtomRoute = await calculateRouteTomTom(startLat, startLon, endLat, endLon, {
              travelMode: 'motorcycle',
              traffic: true
            });

            if (tomtomRoute) {
              return NextResponse.json({
                distanceKm: tomtomRoute.distanceKm,
                durationMinutes: tomtomRoute.durationMinutes,
                trafficDelaySeconds: tomtomRoute.trafficDelaySeconds,
                source: tomtomRoute.source,
                features: [
                  {
                    properties: {
                      distance: tomtomRoute.distanceKm * 1000,
                      time: tomtomRoute.durationMinutes * 60,
                      traffic_delay: tomtomRoute.trafficDelaySeconds,
                    }
                  }
                ]
              });
            }
          }
        }
      } catch (e) {
        console.warn("TomTom routing calculation failed, trying fallback:", e);
      }
    }

    const apiKey = process.env.GEOAPIFY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "No routing API key configured (TOMTOM_API_KEY or GEOAPIFY_API_KEY)" }, { status: 500 });
    }

    const res = await fetch(`https://api.geoapify.com/v1/routing?waypoints=${waypoints}&mode=drive&apiKey=${apiKey}`);
    
    if (!res.ok) {
      throw new Error("Failed to fetch route");
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
