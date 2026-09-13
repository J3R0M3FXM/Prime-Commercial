import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const usersCol = collection(db, 'users');
    const userSnap = await getDocs(usersCol);
    
    const users = await Promise.all(userSnap.docs.map(async (userDoc) => {
      const userData = userDoc.data();
      
      // Fetch latest fingerprint for this user
      let latestFingerprint = null;
      try {
        const fpCol = collection(db, 'users', userDoc.id, 'fingerprints');
        const fpQuery = query(fpCol, orderBy('lastSeen', 'desc'), limit(1));
        const fpSnap = await getDocs(fpQuery);
        
        if (!fpSnap.empty) {
          latestFingerprint = fpSnap.docs[0].data();
          // Clean timestamps for JSON serialization
          if (latestFingerprint.lastSeen?.toDate) {
            latestFingerprint.lastSeen = latestFingerprint.lastSeen.toDate().toISOString();
          }
          if (latestFingerprint.enrollmentDate?.toDate) {
            latestFingerprint.enrollmentDate = latestFingerprint.enrollmentDate.toDate().toISOString();
          }
        }
      } catch (err) {
        console.error(`Failed to fetch fingerprint for user ${userDoc.id}:`, err);
      }
      
      // Clean user timestamps
      if (userData.createdAt?.toDate) {
        userData.createdAt = userData.createdAt.toDate().toISOString();
      }

      return { 
        id: userDoc.id, 
        ...userData,
        latestFingerprint
      };
    }));
    
    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
