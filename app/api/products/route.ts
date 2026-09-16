import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const productsCol = collection(db, 'products');
  const productsSnap = await getDocs(productsCol);
  const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json(products, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
  });
}

