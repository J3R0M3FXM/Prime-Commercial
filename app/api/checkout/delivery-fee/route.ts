import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const { destinationLat, destinationLon, courierId } = await request.json();

    if (!destinationLat || !destinationLon) {
      return NextResponse.json({ error: "Missing destination coordinates" }, { status: 400 });
    }

    // 1. Get the default warehouse
    const whSnap = await getDocs(query(collection(db, 'warehouses'), where('isDefault', '==', true)));
    if (whSnap.empty) {
      return NextResponse.json({ error: "No default warehouse configured" }, { status: 400 });
    }
    const defaultWh = whSnap.docs[0].data();
    const originLat = defaultWh.lat;
    const originLon = defaultWh.lon;

    // 2. Fetch specific courier or default to first one
    let courierData = null;
    if (courierId) {
      const courierSnap = await getDocs(collection(db, 'couriers'));
      const courierDoc = courierSnap.docs.find(d => d.id === courierId);
      if (courierDoc) courierData = courierDoc.data();
    }
    if (!courierData) {
      const courierSnap = await getDocs(collection(db, 'couriers'));
      if (!courierSnap.empty) courierData = courierSnap.docs[0].data();
    }
    if (!courierData) {
      return NextResponse.json({ error: "No courier configurations available" }, { status: 400 });
    }

    // 3. Calculate distance via Geoapify Routing API
    const apiKey = process.env.GEOAPIFY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing Geoapify API Key" }, { status: 500 });
    }

    const routingUrl = `https://api.geoapify.com/v1/routing?waypoints=${originLat},${originLon}|${destinationLat},${destinationLon}&mode=drive&apiKey=${apiKey}`;
    const routeRes = await fetch(routingUrl);
    
    if (!routeRes.ok) {
      throw new Error("Failed to calculate route");
    }

    const routeData = await routeRes.json();
    if (!routeData.features || routeData.features.length === 0) {
      return NextResponse.json({ error: "No valid route found" }, { status: 400 });
    }

    // Distance in meters converted to kilometers
    const distanceMeters = routeData.features[0].properties.distance;
    const distanceKm = distanceMeters / 1000;

    // 4. Calculate Delivery Fee
    const { 
      baseFare = 0, 
      firstMile = 0, 
      firstMileFee = 0, 
      exceedingKmFee = 0, 
      surcharge = 0, 
      nightDifferential = 0 
    } = courierData;

    let fee = baseFare;

    if (distanceKm <= firstMile) {
      // Within first mile threshold
      fee += (distanceKm * firstMileFee);
    } else {
      // Exceeds first mile
      fee += (firstMile * firstMileFee);
      const excessKm = distanceKm - firstMile;
      fee += (excessKm * exceedingKmFee);
    }

    fee += surcharge + nightDifferential;

    // Round to 2 decimal places
    fee = Math.round(fee * 100) / 100;

    return NextResponse.json({
      distanceKm: Math.round(distanceKm * 100) / 100,
      fee,
      courier: courierData
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
