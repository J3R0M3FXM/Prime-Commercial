import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

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

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdmin()!;
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .order('sort_order', { ascending: true });

      if (!error && data) {
        const paymentMethods = data.map(p => ({
          id: p.id,
          name: p.name,
          logo: p.logo,
          paymentType: p.payment_type,
          qrCodeImage: p.qr_code_image,
          webhookUrl: p.webhook_url,
          publicKey: p.public_key,
          secretKey: p.secret_key,
          walletAddress: p.wallet_address,
          accountName: p.account_name,
          accountNumber: p.account_number,
          sortOrder: p.sort_order,
          isActive: p.is_active,
        }));
        cachedPayments = paymentMethods;
        lastPaymentsFetchTime = now;
        return NextResponse.json(paymentMethods);
      }
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

    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin()!;
        await supabase.from('payment_methods').insert([{
          id: docRef.id,
          name: String(name),
          logo: String(logo || ''),
          payment_type: String(paymentType),
          qr_code_image: String(qrCodeImage || ''),
          webhook_url: String(webhookUrl || ''),
          public_key: String(publicKey || ''),
          secret_key: String(secretKey || ''),
          wallet_address: String(walletAddress || ''),
          account_name: String(accountName || ''),
          account_number: String(accountNumber || ''),
          sort_order: resolvedSortOrder,
          is_active: isActive !== false,
        }]);
      } catch (sbErr) {
        console.warn('Supabase payment method insert error:', sbErr);
      }
    }

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

      if (isSupabaseConfigured()) {
        try {
          const supabase = getSupabaseAdmin()!;
          for (const item of data.reorder) {
            if (item.id) {
              await supabase.from('payment_methods').update({ sort_order: item.sortOrder }).eq('id', item.id);
            }
          }
        } catch (sbErr) {
          console.warn('Supabase payment reorder error:', sbErr);
        }
      }

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

    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin()!;
        await supabase.from('payment_methods').update({
          name: String(name),
          logo: String(logo || ''),
          payment_type: String(paymentType),
          qr_code_image: String(qrCodeImage || ''),
          webhook_url: String(webhookUrl || ''),
          public_key: String(publicKey || ''),
          secret_key: String(secretKey || ''),
          wallet_address: String(walletAddress || ''),
          account_name: String(accountName || ''),
          account_number: String(accountNumber || ''),
          sort_order: typeof sortOrder === 'number' ? sortOrder : 0,
          is_active: isActive !== false,
        }).eq('id', id);
      } catch (sbErr) {
        console.warn('Supabase payment update error:', sbErr);
      }
    }

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

    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin()!;
        await supabase.from('payment_methods').delete().eq('id', id);
      } catch (sbErr) {
        console.warn('Supabase payment delete error:', sbErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
