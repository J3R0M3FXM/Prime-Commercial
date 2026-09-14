import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, runTransaction } from 'firebase/firestore';

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

function getOrderNumber(): string {
  const d = new Date();
  // Adjust to Philippine Time (UTC + 8)
  const pht = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const DD = pad(pht.getUTCDate());
  const MM = pad(pht.getUTCMonth() + 1);
  const YY = pht.getUTCFullYear().toString().slice(-2);
  const HH = pad(pht.getUTCHours());
  const MIN = pad(pht.getUTCMinutes());
  const SS = pad(pht.getUTCSeconds());
  return `${DD}${MM}${YY}${HH}${MIN}${SS}`;
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

    const MAX_RETRIES = 5;
    let orderCreated = false;
    let finalOrderData: any = null;
    
    let orderNumber = getOrderNumber();
    let orderDocRef = doc(db, 'orders', orderNumber);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await runTransaction(db, async (transaction) => {
          // 1. Check if order number already exists (collision)
          const orderSnap = await transaction.get(orderDocRef);
          if (orderSnap.exists()) {
            throw new Error("ORDER_NUMBER_COLLISION");
          }

          // 2. Pull real-time stock levels and prepare updates
          const productRefs = items.map((it: any) => doc(db, 'products', it.id));
          const productDocs = await Promise.all(productRefs.map((ref: any) => transaction.get(ref)));
          
          const stockUpdates = [];
          for (let i = 0; i < productDocs.length; i++) {
            const pDoc = productDocs[i];
            if (!pDoc.exists()) {
              throw new Error(`Product "${items[i].name}" not found`);
            }
            const data = pDoc.data();
            const currentStock = typeof data.stock === 'number' ? data.stock : 0;
            const requestedQuantity = Number(items[i].quantity) || 1;
            
            if (currentStock < requestedQuantity) {
              throw new Error(`Insufficient stock for "${items[i].name}". Available: ${currentStock}`);
            }
            
            stockUpdates.push({ ref: pDoc.ref, newStock: currentStock - requestedQuantity });
          }

          // 3. Update stock levels
          stockUpdates.forEach(update => {
            transaction.update(update.ref, { stock: update.newStock, updatedAt: new Date().toISOString() });
          });

          // 4. Create the order
          const calculatedTotal = totalAmount || items.reduce((sum: number, it: any) => sum + (Number(it.price) * (Number(it.quantity) || 1)), 0);
          
          finalOrderData = {
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

          transaction.set(orderDocRef, finalOrderData);
        });
        
        orderCreated = true;
        break; // Transaction successful
      } catch (e: any) {
        if (e.message === "ORDER_NUMBER_COLLISION") {
          // Wait exactly 1 second to shift to the next second slot
          await new Promise(resolve => setTimeout(resolve, 1000));
          orderNumber = getOrderNumber();
          orderDocRef = doc(db, 'orders', orderNumber);
        } else {
          // Throw stock or other errors immediately to client
          throw e; 
        }
      }
    }

    if (!orderCreated) {
       throw new Error("System is processing high volume of transactions. Please try again.");
    }

    return NextResponse.json({ 
      success: true, 
      id: orderNumber, 
      ...finalOrderData 
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
