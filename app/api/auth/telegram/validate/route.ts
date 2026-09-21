import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { enrichFingerprintData, saveFingerprint } from '@/lib/fingerprint';
import { createTelegramSessionCookie, verifyTelegramSessionCookie } from '@/lib/telegram-session';

function generateMemberId() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

const ADMIN_TELEGRAM_USER_ID = process.env.ADMIN_TELEGRAM_USER_ID || '';

function json(data: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(data, { status });
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  return response;
}

export async function GET(request: NextRequest) {
  const session = verifyTelegramSessionCookie(request.cookies.get('prime_telegram_session')?.value);

  if (!session) {
    return json({
      authenticated: false,
      sessionReady: false,
    }, 401);
  }

  return json({
    authenticated: true,
    sessionReady: true,
    tgUserId: session.tgUserId,
    isAdmin: session.isAdmin,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const initData = typeof body.initData === 'string' ? body.initData.trim() : '';
    const fingerprint = body.fingerprint;

    if (!initData) return json({ error: 'Missing Telegram WebApp initData' }, 400);

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!BOT_TOKEN) {
      return json({ error: 'Server configuration error: TELEGRAM_BOT_TOKEN is missing.' }, 500);
    }

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    if (!hash || !/^[0-9a-fA-F]{64}$/.test(hash)) {
      return json({ error: 'Invalid Telegram initData signature' }, 401);
    }

    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    if (!sortedParams) return json({ error: 'Invalid Telegram initData payload' }, 401);

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');
    const normalizedHash = hash.toLowerCase();

    if (
      !crypto.timingSafeEqual(
        Buffer.from(normalizedHash, 'hex'),
        Buffer.from(calculatedHash, 'hex')
      )
    ) {
      return json({ error: 'Invalid Telegram initData signature' }, 401);
    }

    const authDate = Number(params.get('auth_date') || 0);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const maxAgeSeconds = 24 * 60 * 60;

    if (
      !Number.isSafeInteger(authDate) ||
      authDate <= 0 ||
      authDate > nowSeconds + 300 ||
      nowSeconds - authDate > maxAgeSeconds
    ) {
      return json({ error: 'Telegram initData has expired or has an invalid auth_date' }, 401);
    }

    const userStr = params.get('user');
    if (!userStr) return json({ error: 'No Telegram user data found in initData' }, 400);

    let tgUser: any;
    try {
      tgUser = JSON.parse(userStr);
    } catch {
      return json({ error: 'Invalid Telegram user data' }, 400);
    }

    const tgUserId = tgUser?.id != null ? String(tgUser.id) : '';
    if (!/^[0-9]+$/.test(tgUserId)) {
      return json({ error: 'Invalid Telegram user id' }, 401);
    }

    const isAdmin = Boolean(ADMIN_TELEGRAM_USER_ID && tgUserId === ADMIN_TELEGRAM_USER_ID);

    let existingData: any = null;
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdmin()!;
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('tg_user_id', tgUserId)
        .maybeSingle();
      existingData = data;
    }

    const primeMemberId = existingData?.prime_member_id || generateMemberId();
    const role = isAdmin ? 'admin' : (existingData?.role || 'customer');
    const fullName =
      `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() ||
      tgUser.username ||
      `User ${tgUserId}`;

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdmin()!;
      const now = new Date().toISOString();
      const customerPayload = {
        tg_user_id: tgUserId,
        tg_name: fullName,
        tg_username: tgUser.username || '',
        prime_member_id: primeMemberId,
        updated_at: now,
      };
      const { error } = await supabase
        .from('customers')
        .upsert(customerPayload, { onConflict: 'tg_user_id' });

      if (error) {
        console.error('Telegram customer upsert failed:', error);
        return json({ error: 'Unable to initialize customer session' }, 500);
      }
    }

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
          lastSeen: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Device tracking failed:', err);
      }
    }

    const response = json({
      success: true,
      sessionReady: true,
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
        latestFingerprint: savedFp,
      },
    });

    response.cookies.set(createTelegramSessionCookie(tgUserId, isAdmin));
    return response;
  } catch (error: any) {
    console.error('Telegram Auth Route Crash:', error);
    return json({ error: 'Unable to initialize secure Telegram session' }, 500);
  }
}
