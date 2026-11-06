import { api, db } from 'sdk';
import { asc, desc, eq } from 'sdk/db';
import { telegramAutomationChats, telegramAutomationFlows, telegramAutomationSettings } from '../schema.js';
import { flowButtons, resolveSecretaryPhoto, secretaryFlowMedia, validateFlowButtons } from './secretary-media.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WELCOME_COOLDOWN_MS = 12 * 60 * 60 * 1000;

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
    welcomePhotoFileId: row?.welcomePhotoFileId || '',
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
  const { createdAt: ignoredCreatedAt, businessConnectionId: ignoredConnectionId, chatId: ignoredChatId, ...updates } = values;
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
  if (state?.testMode === true) return true;
  // Welcome throttling is governed only by lastBotMessageAt in
  // findWelcomeResponse. Admin replies must not create a second cooldown.
  return true;
}

function matches(value, trigger, mode) {
  const source = String(value || '').trim().toLowerCase();
  const target = String(trigger || '').trim().toLowerCase();
  if (!target) return false;
  if (mode === 'exact') return source === target;
  if (mode === 'starts_with') return source.startsWith(target);
  return source.includes(target);
}

function validateAutomationFlow(flow) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(flow.id || ''))) throw new Error('Step ID must be 1–64 letters, numbers, dashes, or underscores.');
  if (Array.from(String(flow.name || '')).length > 80) throw new Error('Step name must be 80 characters or fewer.');
  if (Array.from(String(flow.responseText || '')).length > 4096) throw new Error('Message text exceeds Telegram’s 4096-character limit.');
  const buttons = flowButtons(flow);
  validateFlowButtons(flow.buttons || []);
  if (buttons.length > 50) throw new Error('A step can contain at most 50 inline buttons.');
  const ids = new Set();
  for (const [index, button] of buttons.entries()) {
    const buttonId = String(button?.id || '');
    const label = String(button?.text || '').trim();
    const action = String(button?.action || 'text').toLowerCase();
    if (!buttonId || ids.has(buttonId)) throw new Error(`Button ${index + 1} needs a unique ID.`);
    ids.add(buttonId);
    if (!label || Array.from(label).length > 64) throw new Error(`Button ${index + 1} needs a label of 1–64 characters.`);
    if (!['flow', 'text', 'reply', 'caption', 'media', 'markup', 'url'].includes(action)) throw new Error(`Button ${index + 1} has an unsupported action.`);
    if (button?.url && !/^https:\/\//i.test(String(button.url))) throw new Error(`Button ${index + 1} URL must use HTTPS.`);
    if (action === 'url' && !/^https:\/\//i.test(String(button?.url || ''))) throw new Error(`Button ${index + 1} needs an HTTPS URL.`);
    if (action === 'media' && !String(button?.mediaFileId || button?.media_file_id || button?.mediaUrl || button?.media_url || '').trim()) throw new Error(`Button ${index + 1} needs an uploaded Telegram file.`);
    if (action === 'caption' && Array.from(String(button?.caption ?? button?.response ?? '')).length > 1024) throw new Error(`Button ${index + 1} caption exceeds Telegram’s 1024-character limit.`);
    if (action === 'media' && Array.from(String(button?.caption || '')).length > 1024) throw new Error(`Button ${index + 1} media caption exceeds Telegram’s 1024-character limit.`);
    if (action !== 'url' && new TextEncoder().encode(`sec:${flow.id}:${buttonId}`).length > 64) throw new Error(`Button ${index + 1} callback data exceeds Telegram’s 64-byte limit.`);
    const markup = button?.replyMarkup ?? button?.reply_markup;
    if (markup !== undefined && (!markup || typeof markup !== 'object' || Array.isArray(markup))) throw new Error(`Button ${index + 1} inline markup must be an object.`);
  }
}

export async function findAutomationResponse(triggerType, value) {
  const settings = await getAutomationSettings();
  if (!settings.enabled) return null;
  const flows = await getAutomationFlows();
  const welcomeFlowId = String(settings.welcomeFlowId || '');
  const flow = flows.find((item) => item.active &&
    // Welcome is checked separately with its 12-hour send throttle. Prevent an
    // empty message trigger from selecting that same welcome flow on every message.
    !(triggerType === 'message' && welcomeFlowId && String(item.id) === welcomeFlowId) &&
    item.triggerType === triggerType &&
    ((triggerType === 'message' && !String(item.triggerValue || '').trim()) ||
      matches(value, item.triggerValue, item.matchMode)));
  if (flow) return { flow, settings };
  if (triggerType === 'message' && settings.fallbackEnabled && settings.fallbackResponse) {
    return { flow: null, settings };
  }
  return null;
}

export async function findWelcomeResponse(state, now = new Date()) {
  if (state?.lastBotMessageAt && now.getTime() - new Date(state.lastBotMessageAt).getTime() < WELCOME_COOLDOWN_MS) return null;
  const settings = await getAutomationSettings();
  if (!settings.enabled || !settings.welcomeFlowId) return null;
  const flows = await getAutomationFlows();
  const flow = flows.find((item) => item.id === settings.welcomeFlowId && item.active && (item.responseText || settings.welcomePhotoFileId || secretaryFlowMedia(item)));
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
  const buttons = flowButtons(flow);
  if (!buttons.length) return undefined;
  const rows = [];
  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2).map((button) => ({
      text: String(button.text || 'Option').slice(0, 64),
      ...(button.url ? { url: String(button.url) } : {
        callback_data: (String(button.action || '').toLowerCase() === 'url' ? '' : ('sec:' + flow.id + ':' + button.id).slice(0, 64)),
      }),
    })));
  }
  return {
    inline_keyboard: rows,
  };
}

export function findButton(flow, buttonId) {
  return flowButtons(flow).find((button) => String(button.id) === String(buttonId));
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
    const mediaFileId = String(button?.mediaFileId || button?.media_file_id || '').trim();
    const mediaUrl = String(button?.mediaUrl || button?.media_url || button?.media?.url || '').trim();
    const mediaType = String(button?.mediaType || button?.media_type || button?.media?.type || 'photo').trim();
    const mediaSource = mediaFileId || mediaUrl;
    if (!mediaSource) throw new Error('Telegram Secretary media action requires an uploaded file.');
    return {
      type: 'media',
      media: {
        type: mediaType,
        media: mediaSource,
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
  if (action.type === 'media') {
    const reference = String(action.media?.media || '').trim();
    if (reference.startsWith('tgmedia:')) {
      const sent = await api.sendPhoto({
        business_connection_id: target.business_connection_id,
        chat_id: target.chat_id,
        photo: await resolveSecretaryPhoto(reference),
        ...(action.media?.caption ? { caption: String(action.media.caption).slice(0, 1024) } : {}),
        ...(action.replyMarkup !== undefined ? { reply_markup: action.replyMarkup } : {}),
      });
      await api.editMessageReplyMarkup({ ...target, reply_markup: { inline_keyboard: [] } });
      return sent;
    }
    return await api.editMessageMedia({
      ...target, media: action.media,
      ...(action.replyMarkup !== undefined ? { reply_markup: action.replyMarkup } : {}),
    });
  }
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

export async function getAutomationChats(limit = 100) {
  return await db.select().from(telegramAutomationChats)
    .orderBy(desc(telegramAutomationChats.updatedAt)).limit(Math.max(1, Math.min(500, Number(limit) || 100))).all();
}

export async function setAutomationChatPaused(connectionId, chatId, paused) {
  await updateAutomationChatState(connectionId, chatId, {
    botPaused: Boolean(paused),
    ...(paused ? { testMode: false } : {}),
  });
  return await getAutomationChatState(connectionId, chatId);
}

export async function setAutomationChatTestMode(connectionId, chatId, enabled) {
  await updateAutomationChatState(connectionId, chatId, {
    testMode: Boolean(enabled),
    ...(enabled ? { botPaused: false } : {}),
  });
  return await getAutomationChatState(connectionId, chatId);
}

export async function updateAutomationSettings(input) {
  const now = new Date();
  const businessUserId = input.businessUserId === '' || input.businessUserId == null ? null : Number(input.businessUserId);
  const businessUserChatId = input.businessUserChatId === '' || input.businessUserChatId == null ? null : Number(input.businessUserChatId);
  if (businessUserId !== null && !Number.isSafeInteger(businessUserId)) throw new Error('businessUserId must be a safe integer.');
  if (businessUserChatId !== null && !Number.isSafeInteger(businessUserChatId)) throw new Error('businessUserChatId must be a safe integer.');
  const values = {
    id: 'default',
    enabled: Boolean(input.enabled),
    fallbackEnabled: Boolean(input.fallbackEnabled),
    fallbackResponse: String(input.fallbackResponse || ''),
    businessConnectionId: String(input.businessConnectionId || '') || null,
    businessUserId,
    businessUserChatId,
    welcomeFlowId: String(input.welcomeFlowId || '') || null,
    welcomePhotoFileId: input.welcomePhotoFileId === undefined
      ? (await getAutomationSettings()).welcomePhotoFileId || null
      : String(input.welcomePhotoFileId || '') || null,
    updatedAt: now,
  };
  await db.insert(telegramAutomationSettings).values(values).onConflictDoUpdate({
    target: telegramAutomationSettings.id,
    set: {
      enabled: values.enabled,
      fallbackEnabled: values.fallbackEnabled,
      fallbackResponse: values.fallbackResponse,
      businessConnectionId: values.businessConnectionId,
      businessUserId: values.businessUserId,
      businessUserChatId: values.businessUserChatId,
      welcomeFlowId: values.welcomeFlowId,
      welcomePhotoFileId: values.welcomePhotoFileId,
      updatedAt: now,
    },
  }).run();
  return await getAutomationSettings();
}

export async function createAutomationFlow(input) {
  const now = new Date();
  const matchMode = ['exact', 'contains', 'starts_with'].includes(input.matchMode) ? input.matchMode : 'contains';
  const flow = {
    id: String(input.id || 'auto_' + Date.now()),
    name: String(input.name || 'Automation').trim(),
    active: input.active !== false,
    triggerType: input.triggerType === 'callback' ? 'callback' : 'message',
    triggerValue: String(input.triggerValue || '').trim(),
    matchMode,
    responseText: String(input.responseText || ''),
    buttons: Array.isArray(input.buttons) ? input.buttons : [],
    priority: Number.isSafeInteger(Number(input.priority)) ? Number(input.priority) : 100,
    createdAt: now,
    updatedAt: now,
  };
  if (!flow.name) throw new Error('Automation name is required.');
  validateAutomationFlow(flow);
  await db.insert(telegramAutomationFlows).values(flow).run();
  return flow;
}

export async function updateAutomationFlow(id, input) {
  const values = { updatedAt: new Date() };
  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim()) throw new Error('Automation name is required.');
    values.name = input.name.trim();
  }
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') throw new Error('active must be a boolean.');
    values.active = input.active;
  }
  if (input.triggerType !== undefined) values.triggerType = input.triggerType === 'callback' ? 'callback' : 'message';
  if (input.triggerValue !== undefined) values.triggerValue = String(input.triggerValue).trim();
  if (input.matchMode !== undefined) values.matchMode = ['exact', 'contains', 'starts_with'].includes(input.matchMode) ? input.matchMode : 'contains';
  if (input.responseText !== undefined) values.responseText = String(input.responseText);
  if (input.buttons !== undefined) {
    if (!Array.isArray(input.buttons)) throw new Error('buttons must be an array.');
    values.buttons = input.buttons;
  }
  if (input.priority !== undefined) {
    const priority = Number(input.priority);
    if (!Number.isSafeInteger(priority)) throw new Error('priority must be an integer.');
    values.priority = priority;
  }
  const current = await db.select().from(telegramAutomationFlows)
    .where(eq(telegramAutomationFlows.id, id)).get();
  if (!current) throw new Error('Automation flow not found.');
  validateAutomationFlow({ ...current, ...values, id, buttons: values.buttons ?? current.buttons });
  const result = await db.update(telegramAutomationFlows).set(values)
    .where(eq(telegramAutomationFlows.id, id)).returning().run();
  if (!result[0]) throw new Error('Automation flow not found.');
  return result[0];
}

export async function deleteAutomationFlow(id) {
  const result = await db.delete(telegramAutomationFlows)
    .where(eq(telegramAutomationFlows.id, id)).returning().run();
  if (!result[0]) throw new Error('Automation flow not found.');
  return { success: true, id };
}
