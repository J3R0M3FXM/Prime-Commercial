import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { enrichFingerprintData, saveFingerprint } from '@/lib/fingerprint';

function generateMemberId() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

const ADMIN_TELEGRAM_USER_ID = process.env.ADMIN_TELEGRAM_USER_ID || '';

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
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    
    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');

    const normalizedHash = typeof hash === 'string' ? hash.toLowerCase() : '';
    const isValidHash = /^[0-9a-f]{64}$/.test(normalizedHash) && crypto.timingSafeEqual(Buffer.from(normalizedHash, 'hex'), Buffer.from(calculatedHash, 'hex'));
    if (!isValidHash) {
      return NextResponse.json({ error: 'Invalid Telegram initData signature' }, { status: 401 });
    }

    const authDate = Number(params.get('auth_date') || 0);
    const maxAgeSeconds = 24 * 60 * 60;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!authDate || !Number.isFinite(authDate) || authDate > nowSeconds + 300 || nowSeconds - authDate > maxAgeSeconds) {
      return NextResponse.json({ error: 'Telegram initData has expired' }, { status: 401 });
    }

    const userStr = params.get('user');
    if (!userStr) return NextResponse.json({ error: 'No user data found in initData' }, { status: 400 });
    const tgUser = JSON.parse(userStr);
    const tgUserId = tgUser.id ? tgUser.id.toString() : '';

    const isAdmin = Boolean(ADMIN_TELEGRAM_USER_ID && tgUserId === ADMIN_TELEGRAM_USER_ID);

    let existingData: any = null;
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdmin()!;
      const { data } = await supabase.from('customers').select('*').eq('tg_user_id', tgUserId).single();
      existingData = data;
    }

    const primeMemberId = existingData?.prime_member_id || generateMemberId();
    const role = isAdmin ? 'admin' : (existingData?.role || 'customer');
    const fullName = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() || tgUser.username || `User ${tgUserId}`;

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdmin()!;
      const now = new Date().toISOString();
      const customerPayload = {
        tg_user_id: tgUserId,
        tg_name: fullName,
        tg_username: tgUser.username || '',
        prime_member_id: primeMemberId,
        updated_at: now
      };
      await supabase.from('customers').upsert(customerPayload, { onConflict: 'tg_user_id' });
    }

    const cryptoToken = crypto.randomBytes(32).toString('hex');
    let savedFp = null;

    if (fingerprint && isSupabaseConfigured()) {
      try {
        const rawIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
        const clientIp = rawIp.split(',')[0].trim();
        const enriched = await enrichFingerprintData(
          clientIp, 
          fingerprint.location?.lat, 
          fingerprint.location?.lon,
          fingerprint.location?.accuracy
        );
        
        savedFp = await saveFingerprint(tgUserId, {
          ...fingerprint,
          ipSession: clientIp,
          ...enriched,
          enrollmentDate: existingData?.created_at || new Date().toISOString(),
          lastSeen: new Date().toISOString()
        });
      } catch (err) {
        console.error("Device tracking failed:", err);
      }
    }

    return NextResponse.json({ 
      success: true, 
      token: cryptoToken,
      isAdmin,
      tgUserId,
      tgName: fullName,
      tgUsername: tgUser.username || '',
      primeMemberId,
      user: {
        id: tgUserId,
        name: fullName,
        username: tgUser.username || '',
        primeMemberId,
        role,
        latestFingerprint: savedFp
      }
    });
  } catch (error: any) {
    console.error("Auth Route Crash:", error);
    return NextResponse.json({ error: `Internal Server Error: ${error.message || String(error)}` }, { status: 500 });
  }
}
