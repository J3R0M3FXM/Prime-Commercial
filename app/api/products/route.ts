import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { cacheStore } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PRODUCTS_CACHE_TTL_MS = 120000; // 120 seconds (2 minutes)

export async function GET() {
  try {
    const now = Date.now();
    if (cacheStore.products && (now - cacheStore.lastProductsFetchTime < PRODUCTS_CACHE_TTL_MS)) {
      return NextResponse.json(cacheStore.products);
    }

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

    cacheStore.products = products;
    cacheStore.lastProductsFetchTime = now;

    return NextResponse.json(products);
  } catch (err: any) {
    if (cacheStore.products) {
      return NextResponse.json(cacheStore.products);
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

