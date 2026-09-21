import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = (searchParams.get('text') || '').trim();

  if (text.length < 3) {
    return NextResponse.json({ results: [] });
  }

  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();

  // Primary provider: Geoapify Address Autocomplete.
  if (apiKey) {
    try {
      const geoUrl = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
      geoUrl.searchParams.set('text', text);
      geoUrl.searchParams.set('filter', 'countrycode:ph');
      geoUrl.searchParams.set('bias', 'proximity:120.9842,14.5995');
      geoUrl.searchParams.set('format', 'json');
      geoUrl.searchParams.set('limit', '8');
      geoUrl.searchParams.set('apiKey', apiKey);

      const res = await fetch(geoUrl, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && Array.isArray(data?.results)) {
        return NextResponse.json(
          { results: data.results },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }

      console.warn('Geoapify autocomplete returned an error:', res.status, data);
    } catch (error) {
      console.warn('Geoapify autocomplete failed; using fallback:', error);
    }
  }

  // Fallback provider keeps address search functional if Geoapify is unavailable
  // or the project key has temporarily exhausted/failed.
  try {
    const nomUrl = new URL('https://nominatim.openstreetmap.org/search');
    nomUrl.searchParams.set('q', text);
    nomUrl.searchParams.set('format', 'jsonv2');
    nomUrl.searchParams.set('addressdetails', '1');
    nomUrl.searchParams.set('limit', '8');
    nomUrl.searchParams.set('countrycodes', 'ph');

    const res = await fetch(nomUrl, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PRIME-Shop/1.0 address-autocomplete',
      },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => []);

    if (res.ok && Array.isArray(data)) {
      return NextResponse.json({
        results: data.map((item: any) => ({
          formatted: item.display_name,
          name: item.name || item.display_name,
          lat: Number(item.lat),
          lon: Number(item.lon),
          country: 'Philippines',
          result_type: item.type || 'place',
        })),
        source: 'fallback',
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
  } catch (error) {
    console.warn('Address autocomplete fallback failed:', error);
  }

  return NextResponse.json({ results: [] }, { status: 200 });
}
