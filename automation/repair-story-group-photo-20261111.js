import { api, db } from 'sdk';
import { resolveSecretaryPhoto } from '../lib/secretary-media.js';

/** Owner CLI only. Guarded one-time repair of the 2026-11-11 text-only group campaign. */
export default async function () {
  const id = '218f5272-67d1-4fa9-b8b1-90577b43150a';
  const previousMessageId = 2229;
  const row = await db.get(`SELECT * FROM secretary_story_campaigns WHERE id=:id`, { ':id': id });
  if (!row || row.group_status !== 'sent' || row.group_photo_confirmed !== 0 ||
      row.message_id !== previousMessageId || row.story_status !== 'sent') {
    return { repaired: false, reason: 'Campaign does not match the one-time repair guard.' };
  }
  const claim = await db.run(`UPDATE secretary_story_campaigns SET group_status='repairing',updated_at=unixepoch()
    WHERE id=:id AND group_status='sent' AND group_photo_confirmed=0 AND message_id=:previous RETURNING id`,
    { ':id': id, ':previous': previousMessageId });
  if (!claim?.rows?.length) return { repaired: false, reason: 'Another repair already claimed this campaign.' };
  let sent;
  try {
    const photo = await resolveSecretaryPhoto(row.photo);
    const buttons = JSON.parse(row.buttons);
    const inline_keyboard = [];
    for (let index = 1; index <= 6; index++) {
      const entries = buttons.filter((button) => button.row === index).map(({ text, url }) => ({ text, url }));
      if (entries.length) inline_keyboard.push(entries);
    }
    sent = await api.sendPhoto({ chat_id: row.target, photo, caption: row.group_message,
      ...(inline_keyboard.length ? { reply_markup: { inline_keyboard } } : {}) });
    if (!Number.isSafeInteger(sent?.message_id) || !Array.isArray(sent.photo) || !sent.photo.length)
      throw new Error('Telegram did not confirm the replacement photo.');
  } catch (error) {
    await db.run(`UPDATE secretary_story_campaigns SET group_status='uncertain',group_error=:error,updated_at=unixepoch()
      WHERE id=:id AND group_status='repairing'`,
      { ':id': id, ':error': String(error?.message || error).slice(0, 500) });
    return { repaired: false, reason: 'Photo delivery is uncertain. Do not retry automatically.' };
  }
  await db.run(`UPDATE secretary_story_campaigns SET group_status='sent',message_id=:message,
    group_photo_confirmed=1,group_error=NULL,updated_at=unixepoch()
    WHERE id=:id AND group_status='repairing'`, { ':id': id, ':message': sent.message_id });
  let previousDeleted = false;
  try { previousDeleted = await api.deleteMessage({ chat_id: row.target, message_id: previousMessageId }) === true; }
  catch { /* The replacement photo remains sent; report the old text for manual cleanup. */ }
  return { repaired: true, photoMessageId: sent.message_id, previousMessageId, previousDeleted };
}
