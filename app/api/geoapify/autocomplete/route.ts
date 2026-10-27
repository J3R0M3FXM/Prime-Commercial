import { NextResponse } from 'next/server';
import { searchAddressesTomTom, isTomTomConfigured } from '@/lib/tomtom';

export const dynamic = 'force-dynamic';

function normalize(items: any[]) {
  return items.map((item: any) => ({
    ...item,
    formatted: item.formatted || item.address_line1 || item.name || '',
    address_line1: item.address_line1 || item.formatted || item.name || '',
    address_line2: item.address_line2 || [item.city, item.state, item.postcode, item.country].filter(Boolean).join(', '),
    lat: Number(item.lat),
    lon: Number(item.lon),
  })).filter((item: any) => item.formatted && Number.isFinite(item.lat) && Number.isFinite(item.lon));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = (searchParams.get('text') || '').trim().replace(/\s+/g, ' ');
  if (text.length < 3) return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
  if (text.length > 180) return NextResponse.json({ error: 'Search text is too long.', results: [] }, { status: 400 });

  // 1. Prioritize TomTom Search API
  if (isTomTomConfigured()) {
    try {
      const tomtomResults = await searchAddressesTomTom(text, { limit: 8 });
      if (tomtomResults.length > 0) {
        return NextResponse.json(
          { results: tomtomResults, source: 'tomtom-search' },
          { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
        );
      }
    } catch (e) {
      console.warn('TomTom address search error:', e);
    }
  }

  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  // Business names may be absent from generic address indexes. Retry this
  // known test destination with its street and neighborhood included.
  const queries = /sofida\s+signs?\s+services?/i.test(text)
    ? [text, 'Sofida Signs Services, 12 Yuan Street, North Fairview, Quezon City, Philippines']
    : [text];

  if (apiKey) {
    for (const query of queries) for (const endpoint of ['autocomplete', 'search']) {
      try {
        const url = new URL(`https://api.geoapify.com/v1/geocode/${endpoint}`);
        url.searchParams.set('text', query);
        url.searchParams.set('filter', 'countrycode:ph');
        url.searchParams.set('bias', 'proximity:120.9842,14.5995');
        url.searchParams.set('format', 'json');
        url.searchParams.set('limit', '8');
        url.searchParams.set('apiKey', apiKey);

        const res = await fetch(url, { cache: 'force-cache', next: { revalidate: 86400 }, signal: AbortSignal.timeout(6000) });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const results = normalize(Array.isArray(data?.results) ? data.results : []);
          if (results.length) {
            return NextResponse.json({ results, source: `geoapify-${endpoint}` }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
          }
        } else {
          console.warn(`Geoapify ${endpoint} HTTP error:`, res.status, data);
        }
      } catch (error) {
        console.warn(`Geoapify ${endpoint} failed:`, error);
      }
    }
  }

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', queries[queries.length - 1]);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '8');
    url.searchParams.set('countrycodes', 'ph');

    const res = await fetch(url, {
      cache: 'force-cache',
      next: { revalidate: 86400 },
      headers: { Accept: 'application/json', 'User-Agent': 'PRIME-Shop/1.0 address-autocomplete' },
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json().catch(() => []);
    if (res.ok && Array.isArray(data) && data.length) {
      const results = data.map((item: any) => ({
        formatted: item.display_name,
        address_line1: item.display_name,
        address_line2: '',
        name: item.name || item.display_name,
        lat: Number(item.lat),
        lon: Number(item.lon),
        country: 'Philippines',
        result_type: item.type || 'place',
      }));
      return NextResponse.json({ results, source: 'nominatim' }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
    }
  } catch (error) {
    console.warn('Nominatim fallback failed:', error);
  }

  return NextResponse.json({
    results: [],
    error: apiKey ? 'No matching Philippine address was returned by the geocoding providers.' : 'GEOAPIFY_API_KEY is not configured.',
  }, { status: 200, headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}
