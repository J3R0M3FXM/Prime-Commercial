import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { enrichFingerprintData, saveFingerprint } from '@/lib/fingerprint';

function generateMemberId() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

const ADMIN_TELEGRAM_USER_ID = process.env.ADMIN_TELEGRAM_USER_ID || '1085949511';

export async function POST(request: NextRequest) {
  const { initData, fingerprint } = await request.json();

  if (!initData) {
    return NextResponse.json({ error: 'Missing initData' }, { status: 400 });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'Server configuration error: TELEGRAM_BOT_TOKEN is missing.' }, { status: 500 });
  }

  try {
    // Telegram validation logic (HMAC SHA256)
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    
    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');

    if (hash && BOT_TOKEN) {
      if (hash !== calculatedHash) {
        return NextResponse.json({ error: `Unauthorized: hash mismatch. Sent: ${hash}, Calc: ${calculatedHash}` }, { status: 401 });
      }
    } else if (!hash && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Missing security hash in initData' }, { status: 401 });
    }

    // Parse user info
    const userStr = params.get('user');
    if (!userStr) return NextResponse.json({ error: 'No user data found in initData' }, { status: 400 });
    const tgUser = JSON.parse(userStr);
    const tgUserId = tgUser.id ? tgUser.id.toString() : '';

    // Check if Telegram user is authorized Admin
    const isAdmin = tgUserId === '1085949511' || tgUserId === ADMIN_TELEGRAM_USER_ID;

    // Handle Firestore storage
    const userRef = doc(db, 'users', tgUserId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      // Create new user
      await setDoc(userRef, {
        tgUserId,
        tgName: `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim(),
        tgUsername: tgUser.username || '',
        primeMemberId: generateMemberId(),
        role: isAdmin ? 'admin' : 'customer',
        createdAt: new Date()
      });
    } else {
      if (isAdmin && userSnap.data()?.role !== 'admin') {
        await setDoc(userRef, { role: 'admin' }, { merge: true });
      }
    }

    // Generate session cryptotoken
    const cryptoToken = crypto.randomBytes(32).toString('hex');
    
    // Store fingerprint (separate collection)
    if (fingerprint) {
      try {
        const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
        const enriched = await enrichFingerprintData(ip, fingerprint.location?.lat, fingerprint.location?.lon);
        
        await saveFingerprint(tgUserId, {
          ...fingerprint,
          ipSession: ip,
          ...enriched,
          enrollmentDate: new Date(),
          lastSeen: new Date()
        });
      } catch (err) {
        console.error("Fingerprint tracking failed silently:", err);
      }
    }

    return NextResponse.json({ 
      success: true, 
      token: cryptoToken,
      isAdmin,
      tgUserId,
      user: {
        id: tgUserId,
        name: `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim(),
        username: tgUser.username || '',
        role: isAdmin ? 'admin' : 'customer'
      }
    });
  } catch (error: any) {
    console.error("Auth Route Crash:", error);
    return NextResponse.json({ error: `Internal Server Error: ${error.message || String(error)}` }, { status: 500 });
  }
}
