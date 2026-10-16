import { api, db } from 'sdk';
import { asc, eq } from 'sdk/db';
import { telegramAutomationChats, telegramAutomationFlows, telegramAutomationSettings } from '../schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getAutomationSettings() {
  const row = await db.select().from(telegramAutomationSettings)
    .where(eq(telegramAutomationSettings.id, 'default')).get();
  return {
    enabled: row?.enabled === true,
    fallbackEnabled: row?.fallbackEnabled === true,
    fallbackResponse: row?.fallbackResponse || '',
    businessConnectionId: row?.businessConnectionId || '',
    businessUserId: row?.businessUserId == null ? '' : String(row.businessUserId),
    businessUserChatId: row?.businessUserChatId == null ? '' : String(row.businessUserChatId),
    welcomeFlowId: row?.welcomeFlowId || '',
  };
}

export async function saveBusinessConnection(connection) {
  const now = new Date();
  await db.insert(telegramAutomationSettings).values({
    id: 'default',
    enabled: false,
    fallbackEnabled: false,
    fallbackResponse: '',
    businessConnectionId: connection?.id || null,
    businessUserId: connection?.user?.id == null ? null : Number(connection.user.id),
    businessUserChatId: connection?.user_chat_id == null ? null : Number(connection.user_chat_id),
    updatedAt: now,
  }).onConflictDoUpdate({
    target: telegramAutomationSettings.id,
    set: {
      businessConnectionId: connection?.id || null,
      businessUserId: connection?.user?.id == null ? null : Number(connection.user.id),
      businessUserChatId: connection?.user_chat_id == null ? null : Number(connection.user_chat_id),
      updatedAt: now,
    },
  }).run();
}

export async function getAutomationFlows() {
  return await db.select().from(telegramAutomationFlows)
    .orderBy(asc(telegramAutomationFlows.priority), asc(telegramAutomationFlows.createdAt)).all();
}

export async function getAutomationChatState(connectionId, chatId) {
  return await db.select().from(telegramAutomationChats)
    .where(
      eq(telegramAutomationChats.businessConnectionId, String(connectionId)),
      eq(telegramAutomationChats.chatId, Number(chatId)),
    ).get();
}

export async function updateAutomationChatState(connectionId, chatId, changes) {
  const now = new Date();
  const values = {
    businessConnectionId: String(connectionId),
    chatId: Number(chatId),
    createdAt: now,
    updatedAt: now,
    ...changes,
  };
  const { createdAt, businessConnectionId, chatId, ...updates } = values;
  await db.insert(telegramAutomationChats).values(values).onConflictDoUpdate({
    target: [telegramAutomationChats.businessConnectionId, telegramAutomationChats.chatId],
    set: { ...updates, updatedAt: now },
  }).run();
}

export async function recordCustomerMessage(connectionId, chatId, now) {
  await updateAutomationChatState(connectionId, chatId, { lastCustomerMessageAt: now });
}

export async function recordBotMessage(connectionId, chatId, now) {
  await updateAutomationChatState(connectionId, chatId, { lastBotMessageAt: now });
}

export async function recordHumanTakeover(connectionId, chatId, now) {
  await updateAutomationChatState(connectionId, chatId, {
    lastHumanMessageAt: now,
    humanTakeoverUntil: new Date(now.getTime() + DAY_MS),
  });
}

export function shouldStartAutomation(state, now) {
  if (state?.botPaused === true) return false;
  if (!state?.lastCustomerMessageAt) return true;
  if (now.getTime() - new Date(state.lastCustomerMessageAt).getTime() < DAY_MS) return false;
  if (!state.humanTakeoverUntil) return true;
  return now.getTime() >= new Date(state.humanTakeoverUntil).getTime();
}

function matches(value, trigger, mode) {
  const source = String(value || '').trim().toLowerCase();
  const target = String(trigger || '').trim().toLowerCase();
  if (!target) return false;
  if (mode === 'exact') return source === target;
  if (mode === 'starts_with') return source.startsWith(target);
  return source.includes(target);
}

export async function findAutomationResponse(triggerType, value) {
  const settings = await getAutomationSettings();
  if (!settings.enabled) return null;
  const flows = await getAutomationFlows();
  const flow = flows.find((item) => item.active && item.triggerType === triggerType &&
    matches(value, item.triggerValue, item.matchMode));
  if (flow) return { flow, settings };
  if (triggerType === 'message' && settings.fallbackEnabled && settings.fallbackResponse) {
    return { flow: null, settings };
  }
  return null;
}

export async function findWelcomeResponse() {
  const settings = await getAutomationSettings();
  if (!settings.enabled || !settings.welcomeFlowId) return null;
  const flows = await getAutomationFlows();
  const flow = flows.find((item) => item.id === settings.welcomeFlowId && item.active && item.responseText);
  return flow ? { flow, settings } : null;
}

export function renderTemplate(text, message) {
  const from = message?.from || {};
  return String(text || '')
    .replace(/\{\{name\}\}/gi, String(from.first_name || from.last_name || 'Customer'))
    .replace(/\{\{username\}\}/gi, from.username ? '@' + from.username : '')
    .replace(/\{\{user_id\}\}/gi, String(from.id || ''));
}

export function keyboard(flow) {
  const buttons = Array.isArray(flow?.buttons) ? flow.buttons : [];
  if (!buttons.length) return undefined;
  return {
    inline_keyboard: buttons.map((button) => [{
      text: String(button.text || 'Option').slice(0, 64),
      ...(button.url ? { url: String(button.url) } : {
        callback_data: (String(button.action || '').toLowerCase() === 'url' ? '' : ('sec:' + flow.id + ':' + button.id).slice(0, 64)),
      }),
    }]),
  };
}

export function findButton(flow, buttonId) {
  return (Array.isArray(flow?.buttons) ? flow.buttons : []).find((button) => String(button.id) === String(buttonId));
}

export function parseSecretaryCallback(data) {
  const value = String(data || '');
  if (!value.startsWith('sec:')) return null;
  const parts = value.slice(4).split(':');
  const knownTypes = ['text', 'media', 'caption', 'markup'];
  if (parts.length >= 3 && knownTypes.includes(parts[0])) {
    return { type: parts[0], flowId: parts[1], buttonId: parts.slice(2).join(':') };
  }
  if (parts.length >= 2) return { type: 'auto', flowId: parts[0], buttonId: parts.slice(1).join(':') };
  return null;
}

export function buildSecretaryAction(button, actionType, message, flow) {
  const fallbackText = renderTemplate(button?.response || flow?.responseText || '', message);
  const parseMode = button?.parseMode || button?.parse_mode;
  if (actionType === 'media') {
    const mediaUrl = String(button?.mediaUrl || button?.media_url || button?.media?.url || '').trim();
    const mediaType = String(button?.mediaType || button?.media_type || button?.media?.type || 'photo').trim();
    if (!mediaUrl) throw new Error('Telegram Secretary media action requires mediaUrl.');
    return {
      type: 'media',
      media: {
        type: mediaType,
        media: mediaUrl,
        ...(button?.caption !== undefined ? { caption: renderTemplate(String(button.caption), message) } :
          fallbackText ? { caption: fallbackText } : {}),
        ...(parseMode ? { parse_mode: parseMode } : {}),
      },
      ...(button?.replyMarkup ? { replyMarkup: button.replyMarkup } : {}),
    };
  }
  if (actionType === 'caption') return {
    type: 'caption',
    caption: renderTemplate(String(button?.caption ?? button?.response ?? flow?.responseText ?? ''), message),
    ...(parseMode ? { parseMode } : {}),
    ...(button?.replyMarkup ? { replyMarkup: button.replyMarkup } : {}),
  };
  if (actionType === 'markup') return {
    type: 'markup',
    replyMarkup: button?.replyMarkup ?? button?.reply_markup ?? undefined,
  };
  return {
    type: 'text',
    text: fallbackText,
    ...(parseMode ? { parseMode } : {}),
    replyMarkup: button?.replyMarkup ?? button?.reply_markup ?? keyboard(flow),
  };
}

function messageTarget(context) {
  const message = context.message || context.callback?.message;
  return {
    business_connection_id: context.connectionId || context.callback?.business_connection_id,
    chat_id: message?.chat?.id,
    message_id: message?.message_id,
  };
}

export async function executeSecretaryAction(context, action) {
  const target = messageTarget(context);
  if (action.type === 'media') return await api.editMessageMedia({
    ...target, media: action.media,
    ...(action.replyMarkup !== undefined ? { reply_markup: action.replyMarkup } : {}),
  });
  if (action.type === 'caption') return await api.editMessageCaption({
    ...target, caption: String(action.caption || '').slice(0, 1024),
    ...(action.parseMode ? { parse_mode: action.parseMode } : {}),
    ...(action.replyMarkup !== undefined ? { reply_markup: action.replyMarkup } : {}),
  });
  if (action.type === 'markup') return await api.editMessageReplyMarkup({
    ...target, ...(action.replyMarkup !== undefined ? { reply_markup: action.replyMarkup } : {}),
  });
  return await api.editMessageText({
    ...target, text: String(action.text || '').slice(0, 4096),
    ...(action.parseMode ? { parse_mode: action.parseMode } : {}),
    ...(action.replyMarkup !== undefined ? { reply_markup: action.replyMarkup } : {}),
  });
}

export async function answerSecretaryCallback(callbackId) {
  return await api.answerCallbackQuery({ callback_query_id: callbackId });
}
