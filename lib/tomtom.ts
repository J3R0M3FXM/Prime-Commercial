/**
 * TomTom Geospatial & Routing Service for Philippines (PH) Commerce
 * Handles address search, reverse geocoding, motorcycle road routing, and live traffic.
 */

export interface TomTomAddressResult {
  formatted: string;
  address_line1: string;
  address_line2: string;
  lat: number;
  lon: number;
  result_type?: string;
  building?: string;
  street?: string;
  city?: string;
  state?: string;
  postcode?: string;
  confidence?: number;
}

let runtimeTomTomApiKey: string | null = null;

export function setRuntimeTomTomApiKey(key: string) {
  runtimeTomTomApiKey = key.trim();
  if (typeof process !== 'undefined' && process.env) {
    process.env.TOMTOM_API_KEY = runtimeTomTomApiKey;
  }
}

export function getTomTomApiKey(): string | undefined {
  if (runtimeTomTomApiKey) return runtimeTomTomApiKey;
  const envKey = (process.env.TOMTOM_API_KEY || process.env.NEXT_PUBLIC_TOMTOM_API_KEY)?.trim();
  if (envKey) return envKey;
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('prime_tomtom_api_key');
      if (stored && stored.trim()) return stored.trim();
    } catch {}
  }
  return undefined;
}

export function isTomTomConfigured(): boolean {
  return Boolean(getTomTomApiKey());
}

/**
 * Normalizes TomTom Search API result items into uniform address objects
 */
function normalizeTomTomItem(item: any): TomTomAddressResult | null {
  if (!item || !item.position) return null;
  const lat = Number(item.position.lat);
  const lon = Number(item.position.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const addr = item.address || {};
  const poi = item.poi || {};

  const poiName = (poi.name || '').trim();
  const streetNumber = (addr.streetNumber || '').trim();
  const streetName = (addr.streetName || '').trim();
  const subdivision = (addr.municipalitySubdivision || '').trim();
  const municipality = (addr.municipality || '').trim();
  const province = (addr.countrySubdivision || '').trim();
  const postalCode = (addr.postalCode || '').trim();
  const country = addr.country || 'Philippines';

  const streetFull = [streetNumber, streetName].filter(Boolean).join(' ');
  const address_line1 = poiName || streetFull || addr.freeformAddress || 'Selected Location';
  const address_line2 = [subdivision, municipality, province, postalCode, country].filter(Boolean).join(', ');

  const formatted = poiName && addr.freeformAddress
    ? `${poiName}, ${addr.freeformAddress}`
    : (addr.freeformAddress || `${address_line1}, ${address_line2}`);

  return {
    formatted,
    address_line1,
    address_line2,
    lat,
    lon,
    result_type: item.type || 'Street',
    building: poiName || streetNumber || undefined,
    street: streetName || undefined,
    city: municipality || subdivision || undefined,
    state: province || undefined,
    postcode: postalCode || undefined,
    confidence: item.score || 0.9,
  };
}

/**
 * TomTom Address Autocomplete & Search with Philippines biasing
 */
export async function searchAddressesTomTom(
  query: string,
  options: { limit?: number; lat?: number; lon?: number } = {}
): Promise<TomTomAddressResult[]> {
  const apiKey = getTomTomApiKey();
  if (!apiKey) return [];

  const { limit = 8, lat = 14.5995, lon = 120.9842 } = options;

  try {
    const url = new URL(`https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('countrySet', 'PH');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('radius', '100000'); // 100km radius around Metro Manila / customer
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('typeahead', 'true');
    url.searchParams.set('language', 'en-US');

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      console.warn(`TomTom search HTTP error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const rawResults = Array.isArray(data?.results) ? data.results : [];
    return rawResults.map(normalizeTomTomItem).filter(Boolean) as TomTomAddressResult[];
  } catch (err) {
    console.warn('TomTom address search failed:', err);
    return [];
  }
}

/**
 * TomTom Reverse Geocode (GPS Pin -> Address components)
 */
export async function reverseGeocodeTomTom(
  lat: number,
  lon: number
): Promise<TomTomAddressResult | null> {
  const apiKey = getTomTomApiKey();
  if (!apiKey) return null;

  try {
    const url = new URL(`https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('radius', '150');
    url.searchParams.set('returnSpeedLimit', 'false');

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(4000),
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      console.warn(`TomTom reverse geocode HTTP error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const firstAddr = data.addresses?.[0];
    if (!firstAddr || !firstAddr.address) return null;

    const addr = firstAddr.address;
    const buildingNumber = (addr.buildingNumber || addr.streetNumber || '').trim();
    const streetName = (addr.streetName || addr.street || '').trim();
    const subdivision = (addr.municipalitySubdivision || '').trim();
    const municipality = (addr.municipality || '').trim();
    const province = (addr.countrySubdivision || '').trim();
    const postalCode = (addr.postalCode || '').trim();
    const country = addr.country || 'Philippines';

    const streetFull = [buildingNumber, streetName].filter(Boolean).join(' ');
    const address_line1 = streetFull || addr.freeformAddress || 'Selected Pin Location';
    const address_line2 = [subdivision, municipality, province, postalCode, country].filter(Boolean).join(', ');
    const formatted = addr.freeformAddress || `${address_line1}, ${address_line2}`;

    return {
      formatted,
      address_line1,
      address_line2,
      lat,
      lon,
      result_type: 'Point Address',
      building: buildingNumber || undefined,
      street: streetName || undefined,
      city: municipality || subdivision || undefined,
      state: province || undefined,
      postcode: postalCode || undefined,
    };
  } catch (err) {
    console.warn('TomTom reverse geocode failed:', err);
    return null;
  }
}

export interface TomTomRouteResult {
  distanceKm: number;
  durationMinutes: number;
  trafficDelaySeconds: number;
  travelMode: string;
  source: string;
}

/**
 * TomTom Motorcycle / Car Route calculation with Live Traffic
 */
export async function calculateRouteTomTom(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  options: { travelMode?: 'motorcycle' | 'car'; traffic?: boolean } = {}
): Promise<TomTomRouteResult | null> {
  const apiKey = getTomTomApiKey();
  if (!apiKey) return null;

  const { travelMode = 'motorcycle', traffic = true } = options;

  try {
    const url = new URL(
      `https://api.tomtom.com/routing/1/calculateRoute/${originLat},${originLon}:${destLat},${destLon}/json`
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('travelMode', travelMode);
    url.searchParams.set('traffic', String(traffic));
    url.searchParams.set('departAt', 'now');
    url.searchParams.set('routeType', 'fastest');

    const res = await fetch(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      console.warn(`TomTom routing HTTP error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route || !route.summary) return null;

    const summary = route.summary;
    const distanceMeters = Number(summary.lengthInMeters);
    const travelTimeSeconds = Number(summary.travelTimeInSeconds);
    const trafficDelaySeconds = Number(summary.trafficDelayInSeconds || 0);

    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;

    const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100;
    const durationMinutes = Math.max(1, Math.round(travelTimeSeconds / 60));

    return {
      distanceKm,
      durationMinutes,
      trafficDelaySeconds,
      travelMode,
      source: `tomtom-${travelMode}-live-traffic`,
    };
  } catch (err) {
    console.warn('TomTom route calculation failed:', err);
    return null;
  }
}
