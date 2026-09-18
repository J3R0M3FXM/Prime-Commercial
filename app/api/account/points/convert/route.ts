import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerId, pointsType, amount } = body;

    const convertAmount = Math.floor(Number(amount) || 0);
    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID is required.' }, { status: 400 });
    }
    if (convertAmount <= 0) {
      return NextResponse.json({ error: 'Please specify a valid amount of points to convert.' }, { status: 400 });
    }
    if (pointsType !== 'purchasing' && pointsType !== 'referral') {
      return NextResponse.json({ error: 'Invalid points type. Must be purchasing or referral.' }, { status: 400 });
    }

    const uRef = doc(db, 'users', customerId);

    const result = await runTransaction(db, async (txn) => {
      const uSnap = await txn.get(uRef);
      if (!uSnap.exists()) {
        throw new Error('Customer profile not found.');
      }

      const uData = uSnap.data();
      const fieldKey = pointsType === 'purchasing' ? 'purchasingPoints' : 'referralPoints';
      const currentPoints = Number(uData[fieldKey] || 0);

      if (currentPoints < convertAmount) {
        throw new Error(`Insufficient ${pointsType === 'purchasing' ? 'Purchasing' : 'Referral'} Points. Available: ${currentPoints}`);
      }

      const newPointsBalance = currentPoints - convertAmount;
      const currentCredits = Number(uData.storeCredits || 0);
      const newCreditsBalance = currentCredits + convertAmount; // 1 point = ₱1 credit

      // Update user doc
      txn.update(uRef, {
        [fieldKey]: newPointsBalance,
        storeCredits: newCreditsBalance,
        updatedAt: new Date().toISOString()
      });

      // Record transaction
      const txId = `tx-conv-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const txRef = doc(db, 'point_transactions', txId);
      txn.set(txRef, {
        userId: customerId,
        type: pointsType === 'purchasing' ? 'conversion_purchasing' : 'conversion_referral',
        amount: convertAmount,
        description: `Converted ${convertAmount} ${pointsType === 'purchasing' ? 'Purchasing' : 'Referral'} Points to ₱${convertAmount} Store Credits`,
        createdAt: new Date().toISOString()
      });

      return {
        success: true,
        pointsType,
        convertedAmount: convertAmount,
        newPointsBalance,
        newCreditsBalance
      };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Point conversion error:', err);
    return NextResponse.json({ error: err.message || 'Conversion failed.' }, { status: 400 });
  }
}
