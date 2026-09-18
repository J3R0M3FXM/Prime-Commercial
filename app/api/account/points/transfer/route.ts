import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, runTransaction } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { senderCustomerId, recipientMemberId, amount } = body;

    const transferAmount = Math.floor(Number(amount) || 0);
    const cleanRecipientCode = String(recipientMemberId || '').trim().toUpperCase();

    if (!senderCustomerId) {
      return NextResponse.json({ error: 'Sender identity is required.' }, { status: 400 });
    }
    if (!cleanRecipientCode) {
      return NextResponse.json({ error: 'Recipient PRIME Member ID is required.' }, { status: 400 });
    }
    if (transferAmount <= 0) {
      return NextResponse.json({ error: 'Please enter a valid transfer amount.' }, { status: 400 });
    }

    // 1. Locate recipient by primeMemberId
    const usersCol = collection(db, 'users');
    const recQ = query(usersCol, where('primeMemberId', '==', cleanRecipientCode));
    const recSnap = await getDocs(recQ);

    if (recSnap.empty) {
      return NextResponse.json({ error: 'Recipient not found. Please verify the PRIME Member ID.' }, { status: 404 });
    }

    const recipientDoc = recSnap.docs[0];
    const recipientId = recipientDoc.id;
    const recipientData = recipientDoc.data();

    // Prevent transferring to oneself
    if (recipientId === senderCustomerId) {
      return NextResponse.json({ error: 'You cannot transfer Store Credits to yourself.' }, { status: 400 });
    }

    // 2. Perform atomic Firestore transaction
    const senderRef = doc(db, 'users', senderCustomerId);
    const recipientRef = doc(db, 'users', recipientId);

    const result = await runTransaction(db, async (txn) => {
      const senderSnap = await txn.get(senderRef);
      if (!senderSnap.exists()) {
        throw new Error('Sender profile not found.');
      }

      const senderData = senderSnap.data();
      const senderCredits = Number(senderData.storeCredits || 0);

      if (senderCredits < transferAmount) {
        throw new Error(`Insufficient Store Credits. Available balance: ₱${senderCredits.toLocaleString()}`);
      }

      const recSnapInner = await txn.get(recipientRef);
      if (!recSnapInner.exists()) {
        throw new Error('Recipient account was not found during transaction.');
      }
      const recDataInner = recSnapInner.data();
      const recipientCredits = Number(recDataInner.storeCredits || 0);

      // Decrement sender
      const newSenderBalance = senderCredits - transferAmount;
      txn.update(senderRef, {
        storeCredits: newSenderBalance,
        updatedAt: new Date().toISOString()
      });

      // Increment recipient
      const newRecipientBalance = recipientCredits + transferAmount;
      txn.update(recipientRef, {
        storeCredits: newRecipientBalance,
        updatedAt: new Date().toISOString()
      });

      const nowIso = new Date().toISOString();

      // Transaction log for sender
      const txOutId = `tx-out-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      txn.set(doc(db, 'point_transactions', txOutId), {
        userId: senderCustomerId,
        type: 'transfer_out',
        amount: -transferAmount,
        description: `Transferred ₱${transferAmount.toLocaleString()} to ${recipientData.tgName || 'Member'} (${cleanRecipientCode})`,
        recipientMemberId: cleanRecipientCode,
        recipientName: recipientData.tgName || 'Member',
        createdAt: nowIso
      });

      // Transaction log for recipient
      const txInId = `tx-in-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      txn.set(doc(db, 'point_transactions', txInId), {
        userId: recipientId,
        type: 'transfer_in',
        amount: transferAmount,
        description: `Received ₱${transferAmount.toLocaleString()} from ${senderData.tgName || 'Member'} (${senderData.primeMemberId || 'Sender'})`,
        senderMemberId: senderData.primeMemberId || '',
        senderName: senderData.tgName || 'Member',
        createdAt: nowIso
      });

      return {
        success: true,
        transferredAmount: transferAmount,
        newSenderBalance,
        recipientName: recipientData.tgName || 'Member',
        recipientMemberId: cleanRecipientCode
      };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Point transfer error:', err);
    return NextResponse.json({ error: err.message || 'Transfer failed.' }, { status: 400 });
  }
}
