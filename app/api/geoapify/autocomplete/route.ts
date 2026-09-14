import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text');
  
  if (!text) {
    return NextResponse.json({ error: "Missing text parameter" }, { status: 400 });
  }

  // Bias to Metro Manila (approx rect/circle) or Philippines in general.
  // We can bias to Philippines: filter=countrycode:ph
  // Bias to Metro Manila using proximity or boundary. Let's use filter countrycode:ph for simplicity.
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEOAPIFY_API_KEY is not configured" }, { status: 500 });
  }

  try {
    const geoUrl = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&filter=countrycode:ph&format=json&apiKey=${apiKey}`;
    const res = await fetch(geoUrl);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
