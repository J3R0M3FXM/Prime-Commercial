import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { referralCode, customerId, customerMemberId } = body;

    const cleanCode = String(referralCode || '').trim().toUpperCase();
    if (!cleanCode) {
      return NextResponse.json({ valid: false, error: 'Referral code is required.' }, { status: 400 });
    }

    // A customer cannot refer themselves
    if (customerMemberId && cleanCode === String(customerMemberId).trim().toUpperCase()) {
      return NextResponse.json({ valid: false, error: 'You cannot use your own PRIME Member ID as a referral code.' });
    }

    // Search for existing user with this primeMemberId
    const usersCol = collection(db, 'users');
    const q = query(usersCol, where('primeMemberId', '==', cleanCode));
    const snap = await getDocs(q);

    if (snap.empty) {
      return NextResponse.json({ 
        valid: false, 
        error: 'Invalid referral code. The PRIME Member ID does not exist.' 
      });
    }

    const referrerDoc = snap.docs[0];
    const referrerData = referrerDoc.data();

    // Prevent referring self via customerId or tgUserId
    if (customerId && (referrerDoc.id === customerId || referrerData.tgUserId === customerId)) {
      return NextResponse.json({ 
        valid: false, 
        error: 'You cannot use your own PRIME Member ID as a referral code.' 
      });
    }

    return NextResponse.json({
      valid: true,
      referrerUserId: referrerDoc.id,
      referrerMemberId: referrerData.primeMemberId || cleanCode,
      referrerName: referrerData.tgName || 'Valued Member',
      referrerUsername: referrerData.tgUsername || ''
    });
  } catch (err: any) {
    console.error('Referral validate error:', err);
    return NextResponse.json({ valid: false, error: err.message || 'Validation failed.' }, { status: 500 });
  }
}
