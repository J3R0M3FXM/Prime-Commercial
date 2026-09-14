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
    : 'Approximate (Internet Address)';

  // 1. If high-precision GPS coordinates are available, perform reverse geocode to get exact physical street & city
  if (hasGps) {
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
    } catch (nomErr) {
      console.warn('GPS reverse geocode skipped:', nomErr);
      address = `Coordinates: ${lat?.toFixed(5)}, ${lon?.toFixed(5)}`;
    }
  }

  // 2. Lookup Internet Provider and approximate network location if not local
  if (!isLocalIp) {
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
          isp = data.connection?.isp || data.connection?.org || 'Standard Internet Provider';
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
      // Secondary fallback
      try {
        const fbRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,lat,lon,isp,org,proxy`, {
          headers: { 'Accept': 'application/json' }
        });
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          if (fbData.status === 'success') {
            isp = fbData.isp || fbData.org || isp;
            if (!hasGps) {
              country = fbData.country || country;
              region = fbData.regionName || region;
              city = fbData.city || city;
              address = `${city}, ${region}, ${country}`;
              if (fbData.lat) resolvedLat = fbData.lat;
              if (fbData.lon) resolvedLon = fbData.lon;
            }
            vpnDetected = !!fbData.proxy;
          }
        }
      } catch {
        // Non-blocking
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
