import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, orderBy, where, limit } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

function cleanTimestamps(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const copy: any = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && typeof (value as any).toDate === 'function') {
      copy[key] = (value as any).toDate().toISOString();
    } else if (value && typeof value === 'object') {
      copy[key] = cleanTimestamps(value);
    } else {
      copy[key] = value;
    }
  }
  return copy;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('id');

    // 1. Single Customer Deep Dossier
    if (customerId) {
      const userRef = doc(db, 'users', customerId);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }

      const userData = cleanTimestamps(userSnap.data());

      // Fetch all historical fingerprint snapshots
      let fingerprints: any[] = [];
      try {
        const fpCol = collection(db, 'users', customerId, 'fingerprints');
        const fpSnap = await getDocs(fpCol);
        fingerprints = fpSnap.docs.map(d => ({
          id: d.id,
          ...cleanTimestamps(d.data())
        }));
        // Sort by lastSeen or createdAt descending
        fingerprints.sort((a, b) => {
          const tA = new Date(a.createdAt || a.lastSeen || 0).getTime();
          const tB = new Date(b.createdAt || b.lastSeen || 0).getTime();
          return tB - tA;
        });
      } catch (err) {
        console.warn(`Failed to fetch fingerprints for customer ${customerId}:`, err);
      }

      // Fetch order history for this customer
      let orders: any[] = [];
      try {
        const ordersCol = collection(db, 'orders');
        const ordersSnap = await getDocs(ordersCol);
        orders = ordersSnap.docs
          .map(d => ({ id: d.id, ...cleanTimestamps(d.data()) }))
          .filter((ord: any) => 
            ord.customerId === customerId || 
            ord.tgUserId === customerId || 
            (userData.primeMemberId && ord.primeMemberId === userData.primeMemberId)
          );
        orders.sort((a, b) => {
          const tA = new Date(a.createdAt || 0).getTime();
          const tB = new Date(b.createdAt || 0).getTime();
          return tB - tA;
        });
      } catch (ordErr) {
        console.warn(`Failed to fetch orders for customer ${customerId}:`, ordErr);
      }

      return NextResponse.json({
        customer: {
          id: userSnap.id,
          ...userData,
          latestFingerprint: userData.latestFingerprint || (fingerprints.length > 0 ? fingerprints[0] : null)
        },
        fingerprints,
        orders
      });
    }

    // 2. All Customers Compact List
    const usersCol = collection(db, 'users');
    const userSnap = await getDocs(usersCol);

    // Also fetch orders count/totals for all customers
    let allOrders: any[] = [];
    try {
      const ordersCol = collection(db, 'orders');
      const ordersSnap = await getDocs(ordersCol);
      allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...cleanTimestamps(d.data()) }));
    } catch {
      allOrders = [];
    }
    
    const users = await Promise.all(userSnap.docs.map(async (userDoc) => {
      const userData = cleanTimestamps(userDoc.data());
      
      let latestFingerprint = userData.latestFingerprint || null;
      let snapshotCount = 0;

      try {
        const fpCol = collection(db, 'users', userDoc.id, 'fingerprints');
        const fpSnap = await getDocs(fpCol);
        snapshotCount = fpSnap.size;
        if (!latestFingerprint && !fpSnap.empty) {
          const fps = fpSnap.docs.map(d => ({ id: d.id, ...cleanTimestamps(d.data()) }));
          fps.sort((a, b) => {
            const tA = new Date(a.createdAt || a.lastSeen || 0).getTime();
            const tB = new Date(b.createdAt || b.lastSeen || 0).getTime();
            return tB - tA;
          });
          latestFingerprint = fps[0];
        }
      } catch (err) {
        console.warn(`Fingerprint lookup for ${userDoc.id}:`, err);
      }

      // Customer orders count & sum
      const customerOrders = allOrders.filter((ord: any) => 
        ord.customerId === userDoc.id || 
        ord.tgUserId === userDoc.id ||
        (userData.primeMemberId && ord.primeMemberId === userData.primeMemberId)
      );
      const totalSpent = customerOrders.reduce((sum: number, o: any) => sum + (Number(o.totalAmount) || 0), 0);

      return { 
        id: userDoc.id, 
        ...userData,
        latestFingerprint,
        snapshotCount: Math.max(snapshotCount, latestFingerprint ? 1 : 0),
        orderCount: customerOrders.length,
        totalSpent
      };
    }));
    
    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
