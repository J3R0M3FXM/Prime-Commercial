import { NextResponse } from 'next/server';
import {
  answerCallbackQuery,
  executeSecretaryAction,
  parseSecretaryCallback,
} from '@/lib/telegram-secretary';
import {
  findAutomationResponse,
  findWelcomeResponse,
  getAutomationFlows,
  getAutomationSettings,
  getAutomationChatState,
  recordBotMessage,
  recordCustomerMessage,
  recordHumanTakeover,
  saveBusinessConnection,
  shouldStartAutomation,
} from '@/lib/telegram-automation';

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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.description || ('Telegram ' + method + ' failed.'));
  }
  return result.result;
}

function buttonCallbackData(flowId: string, button: any) {
  const action = String(button?.action || '').toLowerCase();

  // Existing buttons remain backward compatible.
  if (!action || action === 'text') {
    return ('auto:' + flowId + ':' + button.id).slice(0, 64);
  }

  if (['media', 'caption', 'markup'].includes(action)) {
    return ('sec:' + action + ':' + flowId + ':' + button.id).slice(0, 64);
  }

  return ('auto:' + flowId + ':' + button.id).slice(0, 64);
}

function keyboard(flow: any) {
  const buttons = Array.isArray(flow?.buttons) ? flow.buttons : [];
  if (!buttons.length) return undefined;

  return {
    inline_keyboard: buttons.map((button: any) => [{
      text: String(button.text || 'Option').slice(0, 64),
      ...(button.url
        ? { url: String(button.url) }
        : { callback_data: buttonCallbackData(String(flow.id), button) }),
    }]),
  };
}

function findButton(flow: any, buttonId: string) {
  return (Array.isArray(flow?.buttons) ? flow.buttons : [])
    .find((button: any) => String(button.id) === buttonId);
}

function verifyWebhookSecret(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  return request.headers.get('x-telegram-bot-api-secret-token') === expected;
}

function secretaryAction(button: any, actionType: string, message: any, flow: any) {
  const fallbackText = renderTemplate(button?.response || flow?.responseText || '', message);
  const parseMode = button?.parseMode || button?.parse_mode;

  if (actionType === 'media') {
    const mediaUrl = String(button?.mediaUrl || button?.media_url || button?.media?.url || '').trim();
    const mediaType = String(button?.mediaType || button?.media_type || button?.media?.type || 'photo').trim();

    if (!mediaUrl) {
      throw new Error('Telegram Secretary media action requires mediaUrl.');
    }

    return {
      type: 'media' as const,
      media: {
        type: mediaType,
        media: mediaUrl,
        ...(button?.caption !== undefined
          ? { caption: renderTemplate(String(button.caption), message) }
          : fallbackText
            ? { caption: fallbackText }
            : {}),
        ...(parseMode ? { parse_mode: parseMode } : {}),
      },
      ...(button?.replyMarkup ? { replyMarkup: button.replyMarkup } : {}),
    };
  }

  if (actionType === 'caption') {
    return {
      type: 'caption' as const,
      caption: renderTemplate(
        String(button?.caption ?? button?.response ?? flow?.responseText ?? ''),
        message,
      ),
      ...(parseMode ? { parseMode } : {}),
      ...(button?.replyMarkup ? { replyMarkup: button.replyMarkup } : {}),
    };
  }

  if (actionType === 'markup') {
    return {
      type: 'markup' as const,
      replyMarkup: button?.replyMarkup ?? button?.reply_markup ?? undefined,
    };
  }

  return {
    type: 'text' as const,
    text: fallbackText,
    ...(parseMode ? { parseMode } : {}),
    replyMarkup: button?.replyMarkup ?? button?.reply_markup ?? keyboard(flow),
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'prime-telegram-business-automation',
    secretary: {
      enabled: true,
      callbackActions: ['text', 'media', 'caption', 'markup'],
    },
  });
}

export async function POST(request: Request) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const update = await request.json();

    if (update?.business_connection) {
      await saveBusinessConnection(update.business_connection);
      return NextResponse.json({ ok: true, connection_saved: true });
    }

    const businessMessage = update?.business_message;
    if (businessMessage) {
      const text = String(businessMessage.text || businessMessage.caption || '').trim();
      const connectionId = businessMessage.business_connection_id || update?.business_connection?.id;
      const chatId = businessMessage.chat?.id;

      if (!text || !connectionId || chatId === undefined) {
        return NextResponse.json({ ok: true, ignored: true });
      }

      const settings = await getAutomationSettings();
      const senderId = businessMessage.from?.id ? String(businessMessage.from.id) : '';
      const isBusinessOwner = Boolean(settings.businessUserId && senderId === settings.businessUserId);
      const isBotGenerated = Boolean(
        businessMessage.via_bot ||
        businessMessage.sender_business_bot ||
        businessMessage.from?.is_bot,
      );

      if (isBusinessOwner && !isBotGenerated) {
        await recordHumanTakeover(connectionId, Number(chatId), new Date());
        return NextResponse.json({ ok: true, ignored: true, reason: 'human_takeover' });
      }

      if (isBotGenerated) {
        return NextResponse.json({ ok: true, ignored: true, reason: 'bot_message' });
      }

      const now = new Date();
      const state = await getAutomationChatState(connectionId, Number(chatId));
      const eligible = shouldStartAutomation(state, now);

      if (!eligible) {
        await recordCustomerMessage(connectionId, Number(chatId), now);
        return NextResponse.json({ ok: true, matched: false, reason: 'within_24h' });
      }

      const result = await findWelcomeResponse() || await findAutomationResponse('message', text);
      if (!result) return NextResponse.json({ ok: true, matched: false });

      const responseText = result.flow?.responseText || result.settings.fallbackResponse;
      if (!responseText) {
        await recordCustomerMessage(connectionId, Number(chatId), now);
        return NextResponse.json({ ok: true, matched: false });
      }

      await telegram('sendMessage', {
        business_connection_id: connectionId,
        chat_id: chatId,
        text: renderTemplate(responseText, businessMessage),
        reply_markup: result.flow ? keyboard(result.flow) : undefined,
        disable_web_page_preview: true,
      });

      await recordCustomerMessage(connectionId, Number(chatId), now);
      await recordBotMessage(connectionId, Number(chatId), new Date());
      return NextResponse.json({ ok: true, matched: true });
    }

    const callback = update?.callback_query;
    if (callback) {
      const connectionId = callback.business_connection_id;
      const message = callback.message;
      const data = String(callback.data || '');

      // Always close the Telegram loading state first.
      await answerCallbackQuery(telegram, callback.id);

      if (!message) {
        return NextResponse.json({ ok: true, ignored: true, reason: 'no_message' });
      }

      const secretary = parseSecretaryCallback(data);
      const legacy = data.startsWith('auto:');

      if (!secretary && !legacy) {
        // Do not consume unrelated callback namespaces. PRIME can add other
        // callback handlers later without the Secretary hijacking them.
        return NextResponse.json({ ok: true, ignored: true, reason: 'unhandled_callback' });
      }

      if (!connectionId) {
        return NextResponse.json({ ok: true, ignored: true, reason: 'missing_business_connection' });
      }

      const [, flowId, buttonId] = data.split(':').length >= 4
        ? data.split(':').slice(1)
        : ['', '', ''];

      const flows = await getAutomationFlows();
      const flow = flows.find(item => item.id === flowId && item.active);
      const button = findButton(flow, buttonId);

      if (!flow || !button) {
        return NextResponse.json({ ok: true, matched: false, reason: 'button_not_found' });
      }

      if (secretary) {
        const action = secretaryAction(button, secretary.type, message, flow);
        await executeSecretaryAction(
          telegram,
          { callback, connectionId, message },
          action,
        );

        return NextResponse.json({
          ok: true,
          matched: true,
          secretary: secretary.type,
        });
      }

      await executeSecretaryAction(
        telegram,
        { callback, connectionId, message },
        secretaryAction(button, 'text', message, flow),
      );

      return NextResponse.json({ ok: true, matched: true, secretary: 'text' });
    }

    return NextResponse.json({ ok: true, ignored: true });
  } catch (error: any) {
    console.error('Telegram business automation webhook error:', error);
    return NextResponse.json({
      ok: false,
      error: error?.message || 'Automation webhook failed.',
    }, { status: 500 });
  }
}
