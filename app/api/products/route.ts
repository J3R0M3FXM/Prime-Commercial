import { NextResponse } from 'next/server';
import { getProductsFromDb } from '@/lib/db-adapter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Product configuration and stock are server-authoritative.
    // Do not serve process-local Vercel cache here: another instance may have
    // already received an admin configuration/stock update.
    const products = await getProductsFromDb();

    return NextResponse.json(products, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to load products' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        },
      }
    );
  }
}
