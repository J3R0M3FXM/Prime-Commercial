import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export async function GET() {
  try {
    const snap = await getDocs(collection(db, 'payment_methods'));
    const paymentMethods = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
    return NextResponse.json(paymentMethods, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function POST(request: Request) {
  try {
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
      isActive
    } = data;

    if (!name || !paymentType) {
      return NextResponse.json({ error: "Missing required fields (name, paymentType)" }, { status: 400, headers: NO_CACHE_HEADERS });
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
      isActive: isActive !== false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return NextResponse.json({ success: true, id: docRef.id }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function PUT(request: Request) {
  try {
    const data = await request.json();
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
      isActive
    } = data;

    if (!id || !name || !paymentType) {
      return NextResponse.json({ error: "Missing required fields (id, name, paymentType)" }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    const docRef = doc(db, 'payment_methods', id);
    await updateDoc(docRef, {
      name: String(name),
      logo: String(logo || ''),
      paymentType: String(paymentType),
      qrCodeImage: String(qrCodeImage || ''),
      webhookUrl: String(webhookUrl || ''),
      publicKey: String(publicKey || ''),
      secretKey: String(secretKey || ''),
      walletAddress: String(walletAddress || ''),
      isActive: isActive !== false,
      updatedAt: serverTimestamp()
    });

    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Missing payment method ID" }, { status: 400, headers: NO_CACHE_HEADERS });

    const docRef = doc(db, 'payment_methods', id);
    await deleteDoc(docRef);
    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
