import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export interface FingerprintPayload {
  deviceId?: string;
  appId?: string;
  browser?: string;
  platform?: string;
  screenResolution?: string;
  availScreen?: string;
  colorDepth?: string;
  pixelRatio?: number;
  timezone?: string;
  language?: string;
  languages?: string[];
  graphics?: string;
  vendor?: string;
  canvasHash?: string;
  hardwareConcurrency?: number;
  deviceMemory?: string;
  touchSupport?: string;
  cookiesEnabled?: boolean;
  location?: { lat: number; lon: number };
  ipSession?: string;
  isp?: string;
  country?: string;
  region?: string;
  city?: string;
  address?: string;
  vpnDetected?: boolean;
  enrollmentDate?: string | Date;
  lastSeen?: string | Date;
  [key: string]: any;
}

export async function enrichFingerprintData(ip: string, lat?: number, lon?: number, accuracy?: number) {
  const isLocalIp = !ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.16.');
  
  let isp = 'Standard Connection';
  let country = 'Local';
  let region = 'Area';
  let city = 'Current Area';
  let address = 'Current Location';
  let vpnDetected = false;
  let hasGps = Boolean(lat && lon && lat !== 0 && lon !== 0);
  let resolvedLat = hasGps ? (lat as number) : 0;
  let resolvedLon = hasGps ? (lon as number) : 0;
  let locationSource = hasGps 
    ? (accuracy ? `Precise GPS (within ±${accuracy}m)` : 'Precise GPS') 
    : 'IPLocate Geolocation';

  const geoapifyKey = process.env.GEOAPIFY_API_KEY;
  const iplocateKey = process.env.IPLOCATE_API_KEY;

  if (hasGps && lat && lon) {
    let geoapifySuccess = false;
    if (geoapifyKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const geoUrl = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&format=json&apiKey=${geoapifyKey}`;
        const geoRes = await fetch(geoUrl, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
        clearTimeout(timeoutId);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          const result = geoData.results?.[0] || geoData.features?.[0]?.properties;
          if (result) {
            address = result.formatted || address;
            city = result.city || result.municipality || result.suburb || result.county || city;
            region = result.state || result.state_district || result.region || region;
            country = result.country || country;
            geoapifySuccess = true;
          }
        }
      } catch (geoErr) {
        console.warn('Geoapify reverse-geocode error:', geoErr);
      }
    }

    if (!geoapifySuccess) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
          {
            signal: controller.signal,
            headers: { 'Accept': 'application/json', 'User-Agent': 'PrimeStorefront/1.0' }
          }
        );
        clearTimeout(timeoutId);
        if (nomRes.ok) {
          const nomData = await nomRes.json();
          if (nomData && nomData.display_name) {
            address = nomData.display_name;
            const a = nomData.address || {};
            city = a.city || a.town || a.municipality || a.suburb || a.county || city;
            region = a.state || a.region || region;
            country = a.country || country;
          }
        }
      } catch {
        address = `Coordinates: ${lat?.toFixed(5)}, ${lon?.toFixed(5)}`;
      }
    }
  }

  if (!isLocalIp) {
    let iplocateSuccess = false;
    if (iplocateKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const ipUrl = `https://www.iplocate.io/api/lookup/${ip}?apikey=${iplocateKey}`;
        const ipRes = await fetch(ipUrl, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
        clearTimeout(timeoutId);
        if (ipRes.ok) {
          const ipData = await ipRes.json();
          isp = ipData.company?.name || ipData.asn?.name || isp;
          if (!hasGps) {
            country = ipData.country || country;
            region = ipData.subdivision || region;
            city = ipData.city || city;
            address = [city, region, country].filter(Boolean).join(', ');
            if (ipData.latitude) resolvedLat = ipData.latitude;
            if (ipData.longitude) resolvedLon = ipData.longitude;
            locationSource = 'IPLocate Geolocation';
          }
          if (ipData.privacy) {
            vpnDetected = Boolean(ipData.privacy.is_vpn || ipData.privacy.is_proxy || ipData.privacy.is_tor);
          }
          iplocateSuccess = true;
        }
      } catch (ipErr) {
        console.warn('IPLocate lookup error:', ipErr);
      }
    }

    if (!iplocateSuccess) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(`https://ipwho.is/${ip}`, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            isp = data.connection?.isp || data.connection?.org || isp;
            if (!hasGps) {
              country = data.country || country;
              region = data.region || region;
              city = data.city || city;
              address = `${city}, ${region}, ${country}`;
              if (data.latitude) resolvedLat = data.latitude;
              if (data.longitude) resolvedLon = data.longitude;
            }
            vpnDetected = !!(data.security?.vpn || data.security?.proxy || data.security?.tor);
          }
        }
      } catch {
        // silent
      }
    }
  }

  return {
    isp,
    country,
    region,
    city,
    vpnDetected,
    locationSource,
    location: {
      address,
      lat: resolvedLat,
      lon: resolvedLon,
      accuracy: accuracy || null,
      source: locationSource
    }
  };
}

export async function saveFingerprint(tgUserId: string, rawData: FingerprintPayload) {
  if (!tgUserId || !isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin()!;
  const nowIso = new Date().toISOString();
  const fingerprintRecord = {
    ...rawData,
    userId: tgUserId,
    lastSeen: nowIso,
    capturedAt: nowIso
  };

  try {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, fingerprints')
      .eq('tg_user_id', tgUserId)
      .single();

    const existingFingerprints = customer?.fingerprints || [];
    const updatedFingerprints = [fingerprintRecord, ...existingFingerprints].slice(0, 50);

    if (customer) {
      await supabase
        .from('customers')
        .update({
          fingerprints: updatedFingerprints,
          updated_at: nowIso
        })
        .eq('id', customer.id);
    } else {
      await supabase.from('customers').insert([{
        tg_user_id: tgUserId,
        fingerprints: updatedFingerprints,
        created_at: nowIso,
        updated_at: nowIso
      }]);
    }

    return fingerprintRecord;
  } catch (err) {
    console.error(`Error saving fingerprint for ${tgUserId}:`, err);
    return null;
  }
}

export async function getUserFingerprints(tgUserId: string) {
  if (!tgUserId || !isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  try {
    const { data: customer } = await supabase
      .from('customers')
      .select('fingerprints')
      .eq('tg_user_id', tgUserId)
      .single();

    return customer?.fingerprints || [];
  } catch (err) {
    console.error(`Failed to load fingerprint history for ${tgUserId}:`, err);
    return [];
  }
}
