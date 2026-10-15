/**
 * Telegram Secretary Engine for Telegram Serverless
 *
 * Runs inside Telegram's low-latency V8 sandbox.
 * Handles sub-millisecond inline keyboard callbacks, message editing,
 * and conversational multi-step menus.
 */

export function parseSecretaryCallback(data) {
  if (!data || typeof data !== 'string') return null;
  const parts = data.split(':');
  if (parts.length < 3 || parts[0] !== 'sec') return null;

  return {
    flowId: parts[1],
    buttonId: parts.slice(2).join(':'),
  };
}

export function buildMessageTarget(ctx) {
  const message = ctx.message || ctx.callback?.message;
  return {
    business_connection_id: ctx.connectionId || ctx.callback?.business_connection_id,
    chat_id: message?.chat?.id,
    message_id: message?.message_id,
  };
}

export async function answerCallbackQuery(bot, callbackQueryId, options = {}) {
  return bot.api('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(options.text ? { text: options.text.slice(0, 200) } : {}),
    ...(options.showAlert !== undefined ? { show_alert: options.showAlert } : {}),
    ...(options.url ? { url: options.url } : {}),
  });
}

export async function editMessageText(bot, ctx, action) {
  return bot.api('editMessageText', {
    ...buildMessageTarget(ctx),
    text: action.text.slice(0, 4096),
    ...(action.parseMode ? { parse_mode: action.parseMode } : {}),
    ...(action.replyMarkup !== undefined ? { reply_markup: action.replyMarkup } : {}),
  });
}

export async function executeSecretaryAction(bot, ctx, action) {
  if (!action) return null;
  if (action.type === 'text') {
    return editMessageText(bot, ctx, action);
  }
  if (action.type === 'markup') {
    return bot.api('editMessageReplyMarkup', {
      ...buildMessageTarget(ctx),
      reply_markup: action.replyMarkup,
    });
  }
  return null;
}
