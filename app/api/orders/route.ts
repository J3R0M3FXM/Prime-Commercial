import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, getDoc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

function cleanTimestamps(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const copy: any = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && typeof (value as any).toDate === 'function') {
      copy[key] = (value as any).toDate().toISOString();
    } else if (value && typeof value === 'object') {
      copy[key] = cleanTimestamps(value);
    } else {
      copy[key] = value;
    }
  }
  return copy;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      items, 
      customerId, 
      customerName, 
      customerUsername, 
      primeMemberId, 
      totalAmount, 
      deviceSnapshot,
      notes 
    } = body;

    if (!items || !items.length) {
      return NextResponse.json({ error: 'Cart items are required' }, { status: 400 });
    }

    const orderNumber = `PRM-${Math.floor(100000 + Math.random() * 900000)}`;
    const calculatedTotal = totalAmount || items.reduce((sum: number, it: any) => sum + (Number(it.price) * (Number(it.quantity) || 1)), 0);

    const orderData = {
      orderNumber,
      customerId: customerId || '1085949511',
      tgUserId: customerId || '1085949511',
      customerName: customerName || 'Customer',
      customerUsername: customerUsername || '',
      primeMemberId: primeMemberId || '',
      items: items.map((it: any) => ({
        id: it.id,
        name: it.name,
        price: Number(it.price),
        quantity: Number(it.quantity) || 1,
        imageUrl: it.imageUrl || ''
      })),
      totalAmount: calculatedTotal,
      status: 'Processing',
      notes: notes || 'Submitted via Telegram Mini App Storefront',
      deviceSnapshot: deviceSnapshot || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const ordersCol = collection(db, 'orders');
    const docRef = await addDoc(ordersCol, orderData);

    return NextResponse.json({ 
      success: true, 
      id: docRef.id, 
      ...orderData 
    });
  } catch (error: any) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');

    const ordersCol = collection(db, 'orders');
    const snap = await getDocs(ordersCol);
    let orders = snap.docs.map(d => ({ id: d.id, ...cleanTimestamps(d.data()) }));

    if (customerId) {
      orders = orders.filter((o: any) => o.customerId === customerId || o.tgUserId === customerId);
    }

    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return NextResponse.json(orders);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
