import { NextResponse } from 'next/server';
import crypto from 'crypto';

const ADMIN_TELEGRAM_USER_ID = process.env.ADMIN_TELEGRAM_USER_ID || '';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { code, initData } = body;
    const adminCode = process.env.ADMIN_ACCESS_CODE;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    // 1. Direct Telegram InitData validation
    if (initData) {
      try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        const userStr = params.get('user');

        if (userStr) {
          let isValidTelegram = false;

          if (botToken && hash) {
            params.delete('hash');
            const sortedParams = Array.from(params.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => `${key}=${value}`)
              .join('\n');

            const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
            const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');

            if (hash === calculatedHash) {
              isValidTelegram = true;
            }
          } else if (!botToken || (!hash && process.env.NODE_ENV !== 'production')) {
            // In environment without BOT_TOKEN or during non-production testing, allow parsed user
            isValidTelegram = true;
          }

          if (isValidTelegram) {
            const tgUser = JSON.parse(userStr);
            const tgUserId = tgUser.id ? tgUser.id.toString() : '';

            if (Boolean(ADMIN_TELEGRAM_USER_ID && tgUserId === ADMIN_TELEGRAM_USER_ID)) {
              return NextResponse.json({
                success: true,
                isAdmin: true,
                token: "admin-telegram-granted",
                user: {
                  id: tgUserId,
                  name: `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim(),
                  username: tgUser.username || '',
                  photoUrl: tgUser.photo_url || ''
                }
              });
            } else {
              return NextResponse.json({
                success: false,
                error: `Access Denied: Telegram ID ${tgUserId} is not authorized for Admin Panel.`
              }, { status: 403 });
            }
          }
        }
      } catch (err: any) {
        console.error("Failed to parse initData in admin auth:", err);
      }
    }

    // 2. Manual Access Code validation
    if (code) {
      if (!adminCode) {
        return NextResponse.json({ success: false, error: "Server missing ADMIN_ACCESS_CODE" }, { status: 500 });
      }

      if (code === adminCode) {
        return NextResponse.json({ success: true, isAdmin: true, token: "admin-session-granted" });
      } else {
        return NextResponse.json({ success: false, error: "Invalid access code" }, { status: 401 });
      }
    }

    return NextResponse.json({ success: false, error: "Missing authorization credentials" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

