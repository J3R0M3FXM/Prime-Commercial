import { db } from '@/lib/firebase';
import { doc, collection, addDoc, setDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';

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

  // 1. If GPS coordinates are available, reverse-geocode using Geoapify API to get exact street-level address
  if (hasGps && lat && lon) {
    let geoapifySuccess = false;

    if (geoapifyKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const geoUrl = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&format=json&apiKey=${geoapifyKey}`;
        const geoRes = await fetch(geoUrl, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
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

    // Fallback to OpenStreetMap Nominatim only if Geoapify wasn't available or errored
    if (!geoapifySuccess) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
          {
            signal: controller.signal,
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'PrimeStorefront/1.0 (internal-store)'
            }
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

  // 2. Lookup Internet Provider and network location using IPLocate API (with fallback if needed)
  if (!isLocalIp) {
    let iplocateSuccess = false;

    // Primary: IPLocate API
    if (iplocateKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const ipUrl = `https://www.iplocate.io/api/lookup/${ip}?apikey=${iplocateKey}`;
        const ipRes = await fetch(ipUrl, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
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

    // Secondary fallback: ipwho.is if IPLocate key is missing or failed
    if (!iplocateSuccess) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const res = await fetch(`https://ipwho.is/${ip}`, { 
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
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
        // Silent fallback
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
  if (!tgUserId) return null;

  const nowIso = new Date().toISOString();
  const fingerprintRecord = {
    ...rawData,
    userId: tgUserId,
    lastSeen: nowIso,
    capturedAt: nowIso
  };

  try {
    const userRef = doc(db, 'users', tgUserId);
    const fingerprintsCol = collection(userRef, 'fingerprints');
    
    // 1. Add historical snapshot entry
    const docRef = await addDoc(fingerprintsCol, {
      ...fingerprintRecord,
      createdAt: nowIso
    });

    // 2. Also cache latest fingerprint snapshot directly on user document for instant hydration
    await setDoc(userRef, {
      latestFingerprint: {
        ...fingerprintRecord,
        snapshotId: docRef.id
      },
      lastSeen: nowIso
    }, { merge: true });

    return { id: docRef.id, ...fingerprintRecord };
  } catch (err) {
    console.error(`Error saving fingerprint snapshot for ${tgUserId}:`, err);
    return null;
  }
}

export async function getUserFingerprints(tgUserId: string) {
  try {
    const userRef = doc(db, 'users', tgUserId);
    const fingerprintsCol = collection(userRef, 'fingerprints');
    const q = query(fingerprintsCol, orderBy('createdAt', 'desc'), limit(25));
    const snap = await getDocs(q);

    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString()
      };
    });
  } catch (err) {
    console.error(`Failed to load fingerprint history for ${tgUserId}:`, err);
    return [];
  }
}
