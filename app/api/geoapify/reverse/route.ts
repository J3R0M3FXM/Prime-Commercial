import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  
  if (!lat || !lon) {
    return NextResponse.json({ error: "Missing lat/lon parameters" }, { status: 400 });
  }

  const numLat = Number(lat);
  const numLon = Number(lon);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLon) || (numLat === 0 && numLon === 0)) {
    return NextResponse.json({ error: "Invalid lat/lon parameters" }, { status: 400 });
  }

  // Provider 1: Geoapify if API Key present
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (apiKey) {
    try {
      const geoUrl = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&format=json&apiKey=${apiKey}`;
      const res = await fetch(geoUrl, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const data = await res.json();
        const formatted = data.results?.[0]?.formatted;
        if (formatted && typeof formatted === 'string' && formatted.trim()) {
          return NextResponse.json(data);
        }
      }
    } catch (e) {
      console.warn("Geoapify reverse geocoding failed or timed out:", e);
    }
  }

  // Provider 2: OpenStreetMap Nominatim (Free, no key required)
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const nomRes = await fetch(nomUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PrimeStoreFront/1.0'
      },
      signal: AbortSignal.timeout(4000)
    });
    if (nomRes.ok) {
      const nomData = await nomRes.json();
      const displayName = nomData.display_name;
      if (displayName && typeof displayName === 'string' && displayName.trim()) {
        return NextResponse.json({
          results: [
            {
              formatted: displayName,
              address_line1: nomData.address?.road || nomData.address?.building || nomData.address?.suburb || displayName,
              address_line2: [nomData.address?.city || nomData.address?.town || nomData.address?.county, nomData.address?.country].filter(Boolean).join(', ')
            }
          ]
        });
      }
    }
  } catch (e) {
    console.warn("Nominatim reverse geocoding failed or timed out:", e);
  }

  // Provider 3: BigDataCloud Free Reverse Geocode API
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const bdcRes = await fetch(bdcUrl, { signal: AbortSignal.timeout(4000) });
    if (bdcRes.ok) {
      const bdcData = await bdcRes.json();
      const parts = [
        bdcData.locality || bdcData.city,
        bdcData.principalSubdivision,
        bdcData.countryName
      ].filter(Boolean);
      if (parts.length > 0) {
        const formattedBDC = parts.join(', ');
        return NextResponse.json({
          results: [{ formatted: formattedBDC }]
        });
      }
    }
  } catch (e) {
    console.warn("BigDataCloud reverse geocoding failed or timed out:", e);
  }

  return NextResponse.json({
    results: [{ formatted: `${numLat.toFixed(5)}, ${numLon.toFixed(5)}` }]
  });
}
