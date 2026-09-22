/**
 * Telegram Secretary
 *
 * Portable callback-query/message-edit engine for PRIME.
 * The core deliberately depends only on a small Telegram API adapter so it
 * can run behind the current Next.js webhook and later behind Telegram
 * Serverless without changing callback behavior.
 */

export type TelegramApi = (
  method: string,
  payload: Record<string, unknown>,
) => Promise<any>;

export type SecretaryContext = {
  callback: any;
  connectionId?: string;
  message?: any;
};

export type SecretaryAction =
  | { type: 'text'; text: string; parseMode?: string; replyMarkup?: any }
  | { type: 'media'; media: any; replyMarkup?: any }
  | { type: 'caption'; caption: string; parseMode?: string; replyMarkup?: any }
  | { type: 'markup'; replyMarkup?: any };

function messageTarget(ctx: SecretaryContext) {
  const message = ctx.message || ctx.callback?.message;
  return {
    business_connection_id: ctx.connectionId || ctx.callback?.business_connection_id,
    chat_id: message?.chat?.id,
    message_id: message?.message_id,
  };
}

export async function answerCallbackQuery(
  telegram: TelegramApi,
  callbackQueryId: string,
  options: { text?: string; showAlert?: boolean; url?: string } = {},
) {
  return telegram('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(options.text ? { text: options.text.slice(0, 200) } : {}),
    ...(options.showAlert !== undefined ? { show_alert: options.showAlert } : {}),
    ...(options.url ? { url: options.url } : {}),
  });
}

export async function editMessageText(
  telegram: TelegramApi,
  ctx: SecretaryContext,
  action: Extract<SecretaryAction, { type: 'text' }>,
) {
  return telegram('editMessageText', {
    ...messageTarget(ctx),
    text: action.text.slice(0, 4096),
    ...(action.parseMode ? { parse_mode: action.parseMode } : {}),
    ...(action.replyMarkup !== undefined ? { reply_markup: action.replyMarkup } : {}),
  });
}

export async function editMessageMedia(
  telegram: TelegramApi,
  ctx: SecretaryContext,
  action: Extract<SecretaryAction, { type: 'media' }>,
) {
  return telegram('editMessageMedia', {
    ...messageTarget(ctx),
    media: action.media,
    ...(action.replyMarkup !== undefined ? { reply_markup: action.replyMarkup } : {}),
  });
}

export async function editMessageCaption(
  telegram: TelegramApi,
  ctx: SecretaryContext,
  action: Extract<SecretaryAction, { type: 'caption' }>,
) {
  return telegram('editMessageCaption', {
    ...messageTarget(ctx),
    caption: action.caption.slice(0, 1024),
    ...(action.parseMode ? { parse_mode: action.parseMode } : {}),
    ...(action.replyMarkup !== undefined ? { reply_markup: action.replyMarkup } : {}),
  });
}

export async function editMessageReplyMarkup(
  telegram: TelegramApi,
  ctx: SecretaryContext,
  action: Extract<SecretaryAction, { type: 'markup' }>,
) {
  return telegram('editMessageReplyMarkup', {
    ...messageTarget(ctx),
    ...(action.replyMarkup !== undefined ? { reply_markup: action.replyMarkup } : {}),
  });
}

export async function executeSecretaryAction(
  telegram: TelegramApi,
  ctx: SecretaryContext,
  action: SecretaryAction,
) {
  switch (action.type) {
    case 'text':
      return editMessageText(telegram, ctx, action);
    case 'media':
      return editMessageMedia(telegram, ctx, action);
    case 'caption':
      return editMessageCaption(telegram, ctx, action);
    case 'markup':
      return editMessageReplyMarkup(telegram, ctx, action);
  }
}

/**
 * Parses both the compact Secretary callback used by the configurator:
 *   sec:flowId:buttonId
 *
 * and the older action-qualified form:
 *   sec:text:flowId:buttonId
 *   sec:media:flowId:buttonId
 *   sec:caption:flowId:buttonId
 *   sec:markup:flowId:buttonId
 *
 * Telegram callback_data is limited to 64 bytes, so identifiers should stay
 * short. The action is resolved from persisted button configuration for the
 * compact form.
 */
export function parseSecretaryCallback(data: string) {
  const value = String(data || '');
  if (!value.startsWith('sec:')) return null;

  const parts = value.slice(4).split(':');
  const knownTypes = ['text', 'media', 'caption', 'markup'];

  if (parts.length >= 3 && knownTypes.includes(parts[0])) {
    return {
      type: parts[0] as 'text' | 'media' | 'caption' | 'markup',
      flowId: parts[1],
      buttonId: parts.slice(2).join(':'),
    };
  }

  if (parts.length >= 2) {
    return {
      type: 'auto' as const,
      flowId: parts[0],
      buttonId: parts.slice(1).join(':'),
    };
  }

  return null;
}
