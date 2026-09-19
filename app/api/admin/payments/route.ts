import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

let cachedPayments: any[] | null = null;
let lastPaymentsFetchTime = 0;
const PAYMENTS_CACHE_TTL_MS = 60000; // 60 seconds

export async function GET() {
  try {
    const now = Date.now();
    if (cachedPayments && (now - lastPaymentsFetchTime < PAYMENTS_CACHE_TTL_MS)) {
      return NextResponse.json(cachedPayments);
    }

    const snap = await getDocs(collection(db, 'payment_methods'));
    const paymentMethods = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as any[];

    // Sort by sortOrder ascending (fallback to 9999)
    paymentMethods.sort((a, b) => {
      const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 9999;
      const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 9999;
      return orderA - orderB;
    });

    cachedPayments = paymentMethods;
    lastPaymentsFetchTime = now;

    return NextResponse.json(paymentMethods);
  } catch (error: any) {
    if (cachedPayments) return NextResponse.json(cachedPayments);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    cachedPayments = null;
    const data = await request.json();
    const {
      name,
      logo,
      paymentType,
      qrCodeImage,
      webhookUrl,
      publicKey,
      secretKey,
      walletAddress,
      accountName,
      accountNumber,
      sortOrder,
      isActive
    } = data;

    if (!name || !paymentType) {
      return NextResponse.json({ error: "Missing required fields (name, paymentType)" }, { status: 400 });
    }

    // Determine sort order
    let resolvedSortOrder = typeof sortOrder === 'number' ? sortOrder : 0;
    if (typeof sortOrder !== 'number') {
      const snap = await getDocs(collection(db, 'payment_methods'));
      resolvedSortOrder = snap.docs.length;
    }

    const docRef = await addDoc(collection(db, 'payment_methods'), {
      name: String(name),
      logo: String(logo || ''),
      paymentType: String(paymentType),
      qrCodeImage: String(qrCodeImage || ''),
      webhookUrl: String(webhookUrl || ''),
      publicKey: String(publicKey || ''),
      secretKey: String(secretKey || ''),
      walletAddress: String(walletAddress || ''),
      accountName: String(accountName || ''),
      accountNumber: String(accountNumber || ''),
      sortOrder: resolvedSortOrder,
      isActive: isActive !== false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    cachedPayments = null;
    const data = await request.json();

    // Check for bulk reorder request: { reorder: [{ id: "...", sortOrder: 0 }, ...] }
    if (Array.isArray(data.reorder)) {
      const batch = writeBatch(db);
      for (const item of data.reorder) {
        if (item.id && typeof item.sortOrder === 'number') {
          const itemRef = doc(db, 'payment_methods', item.id);
          batch.update(itemRef, { 
            sortOrder: item.sortOrder,
            updatedAt: serverTimestamp()
          });
        }
      }
      await batch.commit();
      return NextResponse.json({ success: true, message: "Order updated" });
    }

    const {
      id,
      name,
      logo,
      paymentType,
      qrCodeImage,
      webhookUrl,
      publicKey,
      secretKey,
      walletAddress,
      accountName,
      accountNumber,
      sortOrder,
      isActive
    } = data;

    if (!id || !name || !paymentType) {
      return NextResponse.json({ error: "Missing required fields (id, name, paymentType)" }, { status: 400 });
    }

    const updatePayload: any = {
      name: String(name),
      logo: String(logo || ''),
      paymentType: String(paymentType),
      qrCodeImage: String(qrCodeImage || ''),
      webhookUrl: String(webhookUrl || ''),
      publicKey: String(publicKey || ''),
      secretKey: String(secretKey || ''),
      walletAddress: String(walletAddress || ''),
      accountName: String(accountName || ''),
      accountNumber: String(accountNumber || ''),
      isActive: isActive !== false,
      updatedAt: serverTimestamp()
    };

    if (typeof sortOrder === 'number') {
      updatePayload.sortOrder = sortOrder;
    }

    const docRef = doc(db, 'payment_methods', id);
    await updateDoc(docRef, updatePayload);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    cachedPayments = null;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Missing payment method ID" }, { status: 400 });

    const docRef = doc(db, 'payment_methods', id);
    await deleteDoc(docRef);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
