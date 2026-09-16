import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { address, lat, lon, unitDetails } = await request.json();
    const apiKey = process.env.GEOAPIFY_API_KEY;

    const cleanAddress = (address || '').trim();

    if (!cleanAddress) {
      return NextResponse.json({
        isValid: false,
        score: 'invalid',
        status: 'error',
        message: 'Delivery address text is required.',
        missingFields: ['address']
      }, { status: 400 });
    }

    if (!apiKey) {
      // Fallback local structural validation if API key is not present
      const isLenValid = cleanAddress.length >= 6;
      const isLatLonValid = typeof lat === 'number' && lat >= 4.5 && lat <= 21.5;
      return NextResponse.json({
        isValid: isLenValid && isLatLonValid,
        score: isLenValid && isLatLonValid ? 'high' : 'low',
        status: isLenValid && isLatLonValid ? 'verified' : 'error',
        message: isLenValid && isLatLonValid ? 'Address verified.' : 'Address needs street name or map pin selection.',
        missingFields: []
      });
    }

    // Call Geoapify search to validate street-level address match
    const geoUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(cleanAddress)}&filter=countrycode:ph&format=json&apiKey=${apiKey}`;
    const res = await fetch(geoUrl);
    const data = await res.json();

    if (data.results && data.results.length > 0) {
      const top = data.results[0];
      const matchType = top.result_type; // e.g. building, street, amenity, postoffice, suburb, city
      const confidence = top.rank?.confidence || 0.8;

      let score: "high" | "medium" | "low" = "medium";
      let status: "verified" | "warning" | "error" = "verified";
      let message = "Address validated against Philippines spatial database.";

      if (matchType === "building" || matchType === "amenity" || matchType === "street" || matchType === "building_part") {
        score = "high";
        status = "verified";
        message = `High precision match: ${top.formatted || cleanAddress}`;
      } else if (matchType === "city" || matchType === "county" || matchType === "postcode" || matchType === "suburb") {
        score = "medium";
        status = "warning";
        message = "Broad area match. Adding specific house number, building, or landmark is recommended.";
      }

      const hasUnit = (unitDetails || '').trim().length > 0;
      const missingFields: string[] = [];
      if (!hasUnit && !/\d/.test(cleanAddress)) {
        missingFields.push('unit_building');
      }

      return NextResponse.json({
        isValid: true,
        score,
        status,
        message,
        formatted: top.formatted || cleanAddress,
        lat: top.lat || lat,
        lon: top.lon || lon,
        resultType: top.result_type,
        confidence,
        missingFields
      });
    } else {
      return NextResponse.json({
        isValid: true,
        score: "medium",
        status: "warning",
        message: "Address accepted. Please double check map pin placement for accurate courier pick-up.",
        formatted: cleanAddress,
        missingFields: ['exact_match']
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
