import { NextResponse } from 'next/server';
import { cacheStore } from '@/lib/cache';
import { getProductsFromDb } from '@/lib/db-adapter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PRODUCTS_CACHE_TTL_MS = 120000; // 120 seconds (2 minutes)

export async function GET() {
  try {
    const now = Date.now();
    if (cacheStore.products && (now - cacheStore.lastProductsFetchTime < PRODUCTS_CACHE_TTL_MS)) {
      return NextResponse.json(cacheStore.products);
    }

    const products = await getProductsFromDb();

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

