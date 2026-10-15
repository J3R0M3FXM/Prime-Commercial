import { NextResponse } from 'next/server';
import { getPaymentMethodsFromDb } from '@/lib/db-adapter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const paymentMethods = await getPaymentMethodsFromDb();
    const active = paymentMethods.filter(p => p.isActive);
    return NextResponse.json(active);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load payment methods' }, { status: 500 });
  }
}
