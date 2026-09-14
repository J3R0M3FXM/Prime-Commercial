import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text');
  
  if (!text) {
    return NextResponse.json({ error: "Missing text parameter" }, { status: 400 });
  }

  // Bias to Metro Manila (approx rect/circle) or Philippines in general.
  // We use filter countrycode:ph and bias=proximity:120.9842,14.5995 (Manila Lon,Lat) to prioritize Metro Manila results.
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEOAPIFY_API_KEY is not configured" }, { status: 500 });
  }

  try {
    const geoUrl = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&filter=countrycode:ph&bias=proximity:120.9842,14.5995&format=json&apiKey=${apiKey}`;
    const res = await fetch(geoUrl);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
