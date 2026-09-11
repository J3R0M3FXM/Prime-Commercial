import { db } from '@/lib/firebase';
import { doc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

export async function enrichFingerprintData(ip: string, lat: number, lon: number) {
  // Mock implementations of API calls for structure
  // In production, these use the API keys from process.env
  
  const ipData = await fetch(`https://api.iplocate.io/lookup/${ip}?apikey=${process.env.IPLOCATE_API_KEY}`).then(res => res.json());
  const geoData = await fetch(`https://api.geoapify.com/v1/revgeocode?lat=${lat}&lon=${lon}&apiKey=${process.env.GEOAPIFY_API_KEY}`).then(res => res.json());

  return {
    isp: ipData.org || 'Unknown',
    vpnDetected: false, // Implementation of VPN detection requires advanced IP databases
    location: {
      address: geoData.features?.[0]?.properties?.formatted || 'Unknown',
      lat,
      lon
    }
  };
}

export async function saveFingerprint(tgUserId: string, data: any) {
  const userRef = doc(db, 'users', tgUserId);
  const fingerprintsCol = collection(userRef, 'fingerprints');
  
  await addDoc(fingerprintsCol, {
    ...data,
    createdAt: serverTimestamp()
  });
}
