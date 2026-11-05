import { api } from 'sdk';
import {
  findAutomationResponse,
  findWelcomeResponse,
  getAutomationChatState,
  getAutomationSettings,
  keyboard,
  recordBotMessage,
  recordCustomerMessage,
  renderTemplate,
  shouldStartAutomation,
} from '../lib/telegram-automation.js';
import { resolveSecretaryPhoto, secretaryFlowMedia } from '../lib/secretary-media.js';

export default async function (message) {
  const connectionId = message?.business_connection_id;
  const chatId = message?.chat?.id;
  if (!connectionId || chatId === undefined || chatId === null) return;

  const text = String(message.text || message.caption || '').trim();
  const settings = await getAutomationSettings();
  const senderId = message.from?.id == null ? '' : String(message.from.id);
  const isBusinessOwner = Boolean(settings.businessUserId && senderId === settings.businessUserId);
  const isBotGenerated = Boolean(message.via_bot || message.sender_business_bot || message.from?.is_bot);

  // Admin replies are not a welcome cooldown or automation suppression gate.
  // The only welcome throttle is lastBotMessageAt inside findWelcomeResponse.
  if (isBusinessOwner && !isBotGenerated) return;
  if (isBotGenerated) return;

  const now = new Date();
  const state = await getAutomationChatState(connectionId, Number(chatId));
  if (!shouldStartAutomation(state, now)) {
    await recordCustomerMessage(connectionId, Number(chatId), now);
    return;
  }

  let result;
  if (state?.testMode === true) {
    const matchingResponse = text ? await findAutomationResponse('message', text) : null;
    result = matchingResponse?.flow
      ? matchingResponse
      : await findWelcomeResponse(state, now) || matchingResponse;
  } else {
    result = await findWelcomeResponse(state, now) || (text ? await findAutomationResponse('message', text) : null);
  }
  if (!result) {
    await recordCustomerMessage(connectionId, Number(chatId), now);
    if (state?.testMode === true && settings.enabled) {
      await api.sendMessage({
        business_connection_id: connectionId,
        chat_id: chatId,
        text: 'Secretary test mode is on, but no active step matched this message. Try a configured trigger phrase or add a welcome/fallback response.',
        disable_web_page_preview: true,
      });
      await recordBotMessage(connectionId, Number(chatId), new Date());
    }
    return;
  }

  const responseText = result.flow?.responseText || result.settings.fallbackResponse;
  const welcomePhotoFileId = result.settings?.welcomePhotoFileId || '';
  const mediaReference = result.flow ? secretaryFlowMedia(result.flow) : '';
  if (!responseText && !welcomePhotoFileId && !mediaReference) {
    await recordCustomerMessage(connectionId, Number(chatId), now);
    if (state?.testMode === true && settings.enabled) {
      await api.sendMessage({
        business_connection_id: connectionId,
        chat_id: chatId,
        text: 'Secretary test mode is on, but the selected step has no response text. Add a response to this step and try again.',
        disable_web_page_preview: true,
      });
      await recordBotMessage(connectionId, Number(chatId), new Date());
    }
    return;
  }

  if (mediaReference) {
    const caption = renderTemplate(responseText, message);
    if (caption.length > 1024) throw new Error('Secretary photo caption exceeds Telegram’s 1024-character limit.');
    await api.sendPhoto({
      business_connection_id: connectionId,
      chat_id: chatId,
      photo: await resolveSecretaryPhoto(mediaReference),
      ...(caption ? { caption } : {}),
      ...(result.flow ? { reply_markup: keyboard(result.flow) } : {}),
    });
  } else if (welcomePhotoFileId && result.flow?.id === result.settings?.welcomeFlowId) {
    const caption = renderTemplate(responseText, message);
    if (caption.length > 1024) throw new Error('Welcome photo caption exceeds Telegram’s 1024-character limit.');
    await api.sendPhoto({
      business_connection_id: connectionId,
      chat_id: chatId,
      photo: welcomePhotoFileId,
      ...(caption ? { caption } : {}),
      ...(result.flow ? { reply_markup: keyboard(result.flow) } : {}),
    });
  } else {
    await api.sendMessage({
      business_connection_id: connectionId,
      chat_id: chatId,
      text: renderTemplate(responseText, message),
      ...(result.flow ? { reply_markup: keyboard(result.flow) } : {}),
      disable_web_page_preview: true,
    });
  }

  await recordCustomerMessage(connectionId, Number(chatId), now);
  await recordBotMessage(connectionId, Number(chatId), new Date());
}
