import { api } from 'sdk';
import {
  findAutomationResponse,
  findWelcomeResponse,
  getAutomationChatState,
  getAutomationSettings,
  keyboard,
  recordBotMessage,
  recordCustomerMessage,
  recordHumanTakeover,
  renderTemplate,
  shouldStartAutomation,
} from '../lib/telegram-automation.js';

export default async function (message) {
  const connectionId = message?.business_connection_id;
  const chatId = message?.chat?.id;
  if (!connectionId || chatId === undefined || chatId === null) return;

  const text = String(message.text || message.caption || '').trim();
  const settings = await getAutomationSettings();
  const senderId = message.from?.id == null ? '' : String(message.from.id);
  const isBusinessOwner = Boolean(settings.businessUserId && senderId === settings.businessUserId);
  const isBotGenerated = Boolean(message.via_bot || message.sender_business_bot || message.from?.is_bot);

  if (isBusinessOwner && !isBotGenerated) {
    await recordHumanTakeover(connectionId, Number(chatId), new Date());
    return;
  }
  if (isBotGenerated) return;

  const now = new Date();
  const state = await getAutomationChatState(connectionId, Number(chatId));
  if (!shouldStartAutomation(state, now)) {
    await recordCustomerMessage(connectionId, Number(chatId), now);
    return;
  }

  const result = await findWelcomeResponse() || (text ? await findAutomationResponse('message', text) : null);
  if (!result) return;

  const responseText = result.flow?.responseText || result.settings.fallbackResponse;
  if (!responseText) {
    await recordCustomerMessage(connectionId, Number(chatId), now);
    return;
  }

  await api.sendMessage({
    business_connection_id: connectionId,
    chat_id: chatId,
    text: renderTemplate(responseText, message),
    ...(result.flow ? { reply_markup: keyboard(result.flow) } : {}),
    disable_web_page_preview: true,
  });

  await recordCustomerMessage(connectionId, Number(chatId), now);
  await recordBotMessage(connectionId, Number(chatId), new Date());
}
