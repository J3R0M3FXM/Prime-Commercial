/**
 * PRIME Commercial - Telegram Serverless Entry Point
 *
 * Runs on Telegram's Serverless Edge Infrastructure.
 * Provides instant responses, native SQLite database queries,
 * Mini App launchers, and Telegram Secretary automation.
 */

import {
  parseSecretaryCallback,
  answerCallbackQuery,
  executeSecretaryAction,
} from './secretary.js';

function getAppUrl(env) {
  return env?.PRIME_APP_URL || env?.NEXT_PUBLIC_APP_URL || 'https://prime-commercial.app';
}

function renderTemplate(text, user) {
  const name = user?.first_name || user?.name || 'Customer';
  const username = user?.username ? `@${user.username}` : '';
  const userId = String(user?.id || '');

  return String(text || '')
    .replace(/\{\{name\}\}/gi, name)
    .replace(/\{\{username\}\}/gi, username)
    .replace(/\{\{user_id\}\}/gi, userId);
}

function createWebAppKeyboard(appUrl, startParam = '') {
  const url = startParam ? `${appUrl}?tgWebAppStartParam=${encodeURIComponent(startParam)}` : appUrl;
  return {
    inline_keyboard: [
      [
        {
          text: '🛍️ Open PRIME Store',
          web_app: { url }
        }
      ],
      [
        { text: '📦 My Orders', callback_data: 'sec:quick:orders' },
        { text: '⭐ Loyalty Points', callback_data: 'sec:quick:points' }
      ],
      [
        { text: '💬 Customer Support', callback_data: 'sec:quick:support' }
      ]
    ]
  };
}

export default {
  /**
   * Main Telegram Serverless Update Handler
   * @param {object} update - Telegram Bot API Update object
   * @param {object} context - Serverless context containing { bot, db, env }
   */
  async onUpdate(update, { bot, db, env }) {
    const appUrl = getAppUrl(env);

    // 1. Handle Business Connections (Telegram Business)
    if (update.business_connection) {
      const bc = update.business_connection;
      await db('business_connections').upsert({
        id: bc.id,
        business_connection_id: bc.id,
        user_id: String(bc.user_id),
        can_reply: Boolean(bc.can_reply),
        is_enabled: Boolean(bc.is_enabled),
        created_at: new Date().toISOString()
      });
      return;
    }

    // 2. Handle Inline Callback Queries (Secretary & Quick Buttons)
    if (update.callback_query) {
      const cq = update.callback_query;
      const data = cq.data || '';
      const from = cq.from || {};
      const ctx = { callback: cq, message: cq.message };

      if (data.startsWith('sec:quick:')) {
        const action = data.replace('sec:quick:', '');
        if (action === 'orders') {
          await answerCallbackQuery(bot, cq.id, { text: 'Opening your orders in PRIME...' });
          await bot.api('sendMessage', {
            chat_id: cq.message?.chat?.id,
            text: '📋 *PRIME Commercial Orders*\n\nTap below to review your live active and completed orders with realtime tracking.',
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📦 View Orders in App', web_app: { url: `${appUrl}?openOrder=all` } }]
              ]
            }
          });
          return;
        }

        if (action === 'points') {
          await answerCallbackQuery(bot, cq.id, { text: 'Loading loyalty points balance...' });
          // Fetch or default from edge SQLite database
          let userRecord = await db('users').where({ tg_user_id: String(from.id) }).first();
          const balance = userRecord?.points_balance || 0;
          const memberId = userRecord?.prime_member_id || `PRIME-${from.id.toString().slice(-4)}`;

          await bot.api('sendMessage', {
            chat_id: cq.message?.chat?.id,
            text: `⭐ *PRIME VIP Loyalty Points*\n\nMember ID: \`${memberId}\`\nAvailable Balance: *${balance.toLocaleString()} Points*\n\nEarn 1 point for every ₱100 spent! Redeem for delivery credits and exclusive discounts in the shop.`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🛍️ Redeem in PRIME Shop', web_app: { url: `${appUrl}?tab=account` } }]
              ]
            }
          });
          return;
        }

        if (action === 'support') {
          await answerCallbackQuery(bot, cq.id);
          await bot.api('sendMessage', {
            chat_id: cq.message?.chat?.id,
            text: '💬 *Customer Care*\n\nA representative has been alerted. Send any message or question here, or browse our shop menu anytime.',
            parse_mode: 'Markdown',
            reply_markup: createWebAppKeyboard(appUrl)
          });
          return;
        }
      }

      // Handle Secretary dynamic flow buttons
      const parsed = parseSecretaryCallback(data);
      if (parsed) {
        await answerCallbackQuery(bot, cq.id);
        const flow = await db('automation_flows').where({ id: parsed.flowId, active: true }).first();
        if (flow) {
          let buttons = [];
          try { buttons = JSON.parse(flow.buttons_json || '[]'); } catch {}

          const clickedBtn = buttons.find(b => String(b.id) === parsed.buttonId);
          const replyText = clickedBtn?.response || flow.response_text;

          await executeSecretaryAction(bot, ctx, {
            type: 'text',
            text: renderTemplate(replyText, from),
            replyMarkup: createWebAppKeyboard(appUrl)
          });
        }
        return;
      }

      await answerCallbackQuery(bot, cq.id);
      return;
    }

    // 3. Handle Messages (Direct & Business Messages)
    const msg = update.message || update.business_message;
    if (!msg || !msg.text) return;

    const chatId = msg.chat?.id;
    const from = msg.from || {};
    const text = msg.text.trim();
    const isBusiness = Boolean(update.business_message);

    // Track user in edge SQLite
    await db('users').upsert({
      id: String(from.id),
      tg_user_id: String(from.id),
      username: from.username || '',
      full_name: `${from.first_name || ''} ${from.last_name || ''}`.trim(),
      prime_member_id: `PRIME-${String(from.id).slice(-4)}`,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    // Check chat pause/takeover state
    const chatState = await db('chat_states').where({ chat_id: String(chatId) }).first();
    const nowSec = Math.floor(Date.now() / 1000);
    if (chatState && chatState.paused_until > nowSec) {
      return; // Agent takeover active, pause bot
    }

    // /start command
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const startParam = parts[1] || '';

      const welcomeText =
        `👋 Welcome to *PRIME Commercial*, ${from.first_name || 'Valued Customer'}!\n\n` +
        `Your official on-demand shop for premium products, instant checkout, Maya card/wallet payments, and live courier tracking.\n\n` +
        `Tap *Open PRIME Store* below to start shopping!`;

      await bot.api('sendMessage', {
        chat_id: chatId,
        text: welcomeText,
        parse_mode: 'Markdown',
        reply_markup: createWebAppKeyboard(appUrl, startParam)
      });
      return;
    }

    // /orders command
    if (text === '/orders') {
      await bot.api('sendMessage', {
        chat_id: chatId,
        text: '📦 *Check Your Orders*\n\nTap below to open your real-time order history in PRIME:',
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📦 Open Orders', web_app: { url: `${appUrl}?openOrder=all` } }]
          ]
        }
      });
      return;
    }

    // Automation flows matching in SQLite
    const flows = await db('automation_flows')
      .where({ active: true, trigger_type: 'message' })
      .orderBy('priority', 'asc')
      .all();

    const matchedFlow = flows.find(f => {
      const val = (f.trigger_value || '').toLowerCase();
      const input = text.toLowerCase();
      if (f.match_mode === 'exact') return input === val;
      if (f.match_mode === 'starts_with') return input.startsWith(val);
      return input.includes(val);
    });

    if (matchedFlow) {
      await bot.api('sendMessage', {
        chat_id: chatId,
        text: renderTemplate(matchedFlow.response_text, from),
        parse_mode: 'Markdown',
        reply_markup: createWebAppKeyboard(appUrl)
      });
      return;
    }

    // Default conversational reply if directly messaged
    if (!isBusiness) {
      await bot.api('sendMessage', {
        chat_id: chatId,
        text: `Hello ${from.first_name || ''}! How can we assist you today?\n\nYou can launch the official shop anytime using the button below.`,
        reply_markup: createWebAppKeyboard(appUrl)
      });
    }
  }
};
