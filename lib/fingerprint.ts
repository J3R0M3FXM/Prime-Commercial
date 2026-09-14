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

export async function enrichFingerprintData(ip: string, lat?: number, lon?: number) {
  const isLocalIp = !ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.16.');
  
  let isp = 'Private Network';
  let country = 'Global';
  let region = 'Virtual';
  let city = 'Direct Tunnel';
  let address = lat && lon ? `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}` : 'Secured Cloud Gateway';
  let vpnDetected = false;
  let resolvedLat = lat || 0;
  let resolvedLon = lon || 0;

  if (!isLocalIp) {
    try {
      // 1. Primary Geo/ISP lookup via ipwho.is (fast, no API key needed, includes VPN/proxy check)
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
          isp = data.connection?.isp || data.connection?.org || data.connection?.asn || 'Unknown ISP';
          country = data.country || 'Unknown';
          region = data.region || 'Unknown';
          city = data.city || 'Unknown';
          address = `${city}, ${region}, ${country}`;
          if (!resolvedLat && data.latitude) resolvedLat = data.latitude;
          if (!resolvedLon && data.longitude) resolvedLon = data.longitude;
          vpnDetected = !!(data.security?.vpn || data.security?.proxy || data.security?.tor);
        }
      }
    } catch (e) {
      // 2. Fallback lookup via ip-api
      try {
        const fbRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,lat,lon,isp,org,proxy`, {
          headers: { 'Accept': 'application/json' }
        });
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          if (fbData.status === 'success') {
            isp = fbData.isp || fbData.org || 'Unknown';
            country = fbData.country || country;
            region = fbData.regionName || region;
            city = fbData.city || city;
            address = `${city}, ${region}, ${country}`;
            if (!resolvedLat && fbData.lat) resolvedLat = fbData.lat;
            if (!resolvedLon && fbData.lon) resolvedLon = fbData.lon;
            vpnDetected = !!fbData.proxy;
          }
        }
      } catch (fbErr) {
        console.warn('IP Geo resolution secondary fallback failed:', fbErr);
      }
    }
  }

  // Reverse geocode if high-precision GPS coordinates were granted by user
  if (lat && lon && process.env.GEOAPIFY_API_KEY) {
    try {
      const geoRes = await fetch(`https://api.geoapify.com/v1/revgeocode?lat=${lat}&lon=${lon}&apiKey=${process.env.GEOAPIFY_API_KEY}`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        const formatted = geoData.features?.[0]?.properties?.formatted;
        if (formatted) address = formatted;
      }
    } catch {
      // Non-blocking
    }
  }

  return {
    isp,
    country,
    region,
    city,
    vpnDetected,
    location: {
      address,
      lat: resolvedLat,
      lon: resolvedLon
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
