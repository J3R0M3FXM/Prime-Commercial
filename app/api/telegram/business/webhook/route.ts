import { NextResponse } from 'next/server';
import { findAutomationResponse, getAutomationFlows } from '@/lib/telegram-automation';

export const dynamic = 'force-dynamic';
const TELEGRAM_API_BASE = 'https://api.telegram.org';

function renderTemplate(text: string, message: any) {
  const from = message?.from || {};
  return String(text || '')
    .replace(/\{\{name\}\}/gi, String(from.first_name || from.last_name || 'Customer'))
    .replace(/\{\{username\}\}/gi, from.username ? '@' + from.username : '')
    .replace(/\{\{user_id\}\}/gi, String(from.id || ''));
}

async function telegram(method: string, payload: Record<string, any>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const response = await fetch(TELEGRAM_API_BASE + '/bot' + token + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.description || ('Telegram ' + method + ' failed.'));
  return result.result;
}

function keyboard(flow: any) {
  const buttons = Array.isArray(flow?.buttons) ? flow.buttons : [];
  if (!buttons.length) return undefined;
  return { inline_keyboard: buttons.map((button: any) => [{
    text: String(button.text || 'Option').slice(0, 64),
    ...(button.url ? { url: String(button.url) } : { callback_data: ('auto:' + flow.id + ':' + button.id).slice(0, 64) })
  }]) };
}

function findButton(flow: any, buttonId: string) {
  return (Array.isArray(flow?.buttons) ? flow.buttons : []).find((button: any) => String(button.id) === buttonId);
}

function verifyWebhookSecret(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  return request.headers.get('x-telegram-bot-api-secret-token') === expected;
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'prime-telegram-business-automation' });
}

export async function POST(request: Request) {
  if (!verifyWebhookSecret(request)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const update = await request.json();
    const businessMessage = update?.business_message;
    if (businessMessage) {
      if (businessMessage.via_bot || businessMessage.from?.is_bot) return NextResponse.json({ ok: true, ignored: true });
      const text = String(businessMessage.text || businessMessage.caption || '').trim();
      const connectionId = businessMessage.business_connection_id || update?.business_connection?.id;
      const chatId = businessMessage.chat?.id;
      if (!text || !connectionId || chatId === undefined) return NextResponse.json({ ok: true, ignored: true });
      const result = await findAutomationResponse('message', text);
      if (!result) return NextResponse.json({ ok: true, matched: false });
      const responseText = result.flow?.responseText || result.settings.fallbackResponse;
      if (!responseText) return NextResponse.json({ ok: true, matched: false });
      await telegram('sendMessage', {
        business_connection_id: connectionId, chat_id: chatId, text: renderTemplate(responseText, businessMessage),
        reply_markup: result.flow ? keyboard(result.flow) : undefined, disable_web_page_preview: true
      });
      return NextResponse.json({ ok: true, matched: true });
    }
    const callback = update?.callback_query;
    if (callback) {
      const connectionId = callback.business_connection_id;
      const message = callback.message;
      const data = String(callback.data || '');
      await telegram('answerCallbackQuery', { callback_query_id: callback.id });
      if (!connectionId || !message || !data.startsWith('auto:')) return NextResponse.json({ ok: true, ignored: true });
      const [, flowId, buttonId] = data.split(':');
      const flows = await getAutomationFlows();
      const flow = flows.find(item => item.id === flowId && item.active);
      const button = findButton(flow, buttonId);
      if (!flow || !button) return NextResponse.json({ ok: true, matched: false });
      await telegram('editMessageText', {
        business_connection_id: connectionId, chat_id: message.chat?.id, message_id: message.message_id,
        text: renderTemplate(button.response || flow.responseText, message), reply_markup: keyboard(flow), disable_web_page_preview: true
      });
      return NextResponse.json({ ok: true, matched: true });
    }
    return NextResponse.json({ ok: true, ignored: true });
  } catch (error: any) {
    console.error('Telegram business automation webhook error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Automation webhook failed.' }, { status: 500 });
  }
}