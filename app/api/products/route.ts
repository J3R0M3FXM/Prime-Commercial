import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const productsCol = collection(db, 'products');
  const productsSnap = await getDocs(productsCol);
  const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Sort products by sortOrder ascending (lower numbers appear first)
  products.sort((a: any, b: any) => {
    const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 999999;
    const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 999999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.name || '').localeCompare(b.name || '');
  });

  return NextResponse.json(products, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
  });
}

