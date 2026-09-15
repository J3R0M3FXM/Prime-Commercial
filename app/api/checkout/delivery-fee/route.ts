import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

function calculateCourierFee(courier: any, distanceKm: number) {
  const baseFare = Number(courier?.baseFare) || 0;
  const firstMile = Number(courier?.firstMile) || 0;
  const firstMileFee = Number(courier?.firstMileFee) || 0;
  const exceedingKmFee = Number(courier?.exceedingKmFee) || 0;
  const surcharge = Number(courier?.surcharge) || 0;
  const nightDifferential = Number(courier?.nightDifferential) || 0;

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

    // 1. Get the default warehouse (or first warehouse, or fallback coordinates)
    let originLat = 14.5995;
    let originLon = 120.9842;

    try {
      const whSnap = await getDocs(query(collection(db, 'warehouses'), where('isDefault', '==', true)));
      if (!whSnap.empty) {
        const defaultWh = whSnap.docs[0].data();
        originLat = defaultWh.lat || originLat;
        originLon = defaultWh.lon || originLon;
      } else {
        const allWh = await getDocs(collection(db, 'warehouses'));
        if (!allWh.empty) {
          const firstWh = allWh.docs[0].data();
          originLat = firstWh.lat || originLat;
          originLon = firstWh.lon || originLon;
        }
      }
    } catch (e) {
      console.warn("Notice: Warehouse query fallback used", e);
    }

    // 2. Fetch all couriers
    const courierSnap = await getDocs(collection(db, 'couriers'));
    let couriersList: any[] = courierSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (couriersList.length === 0) {
      // Provide standard fallback couriers if none defined
      couriersList = [
        {
          id: "standard-lalamove",
          name: "Lalamove",
          type: "Standard Motorcycle",
          baseFare: 49,
          firstMile: 3.5,
          firstMileFee: 9,
          exceedingKmFee: 10.5,
          surcharge: 0,
          nightDifferential: 0,
          logo: ""
        },
        {
          id: "standard-grab",
          name: "Grab Express",
          type: "Instant Delivery",
          baseFare: 60,
          firstMile: 3,
          firstMileFee: 12,
          exceedingKmFee: 14,
          surcharge: 0,
          nightDifferential: 0,
          logo: ""
        }
      ];
    }

    // 3. Calculate distance via Geoapify Routing API
    const apiKey = process.env.GEOAPIFY_API_KEY;
    let distanceKm = 5; // Safe fallback

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
        console.warn("Routing API error, using haversine fallback", err);
        // Fallback straight-line * road factor 1.3
        const R = 6371; // Earth radius in km
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

    // 4. Calculate Delivery Fee for all couriers
    const computedCouriers = couriersList.map(c => {
      const fee = calculateCourierFee(c, roundedDistance);
      return {
        ...c,
        calculatedFee: fee,
        distanceKm: roundedDistance,
      };
    });

    // Determine target/selected courier
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
