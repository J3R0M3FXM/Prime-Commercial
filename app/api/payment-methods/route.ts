import { NextResponse } from 'next/server';
import { getPaymentMethodsFromDb } from '@/lib/db-adapter';
import { isSupabaseAdminConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    if (!isSupabaseAdminConfigured()) return NextResponse.json({ error: 'Payment methods are temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const paymentMethods = await getPaymentMethodsFromDb();

    // This endpoint is consumed by the public checkout and order-history UI.
    // Explicitly allowlist display fields so database additions can never leak
    // secret keys or internal webhook configuration to the browser.
    const active = paymentMethods
      .filter(p => p.isActive)
      .map(p => ({
        id: p.id,
        name: p.name,
        logo: p.logo,
        paymentType: p.paymentType,
        qrCodeImage: p.qrCodeImage,
        publicKey: p.publicKey,
        walletAddress: p.walletAddress,
        accountName: p.accountName,
        accountNumber: p.accountNumber,
        sortOrder: p.sortOrder,
        isActive: p.isActive,
      }));

    return NextResponse.json(active, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load payment methods' }, { status: 500 });
  }
}
