import { NextResponse } from 'next/server';
import { getChargesFromDb } from '@/lib/db-adapter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const charges = await getChargesFromDb();
    return NextResponse.json(charges);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load charges' }, { status: 500 });
  }
}
