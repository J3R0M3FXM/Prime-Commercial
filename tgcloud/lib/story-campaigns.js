import { api, db, EndpointError } from 'sdk';
import { getAutomationSettings } from './telegram-automation.js';
import { resolveSecretaryPhoto } from './secretary-media.js';

function invalid(message) { throw new EndpointError(message, { code: 'INVALID_CAMPAIGN' }); }
const keyPattern = /^[A-Za-z0-9_-]{16,128}$/;
const mediaPattern = /^tgmedia:[A-Za-z0-9_-]{8,64}$/;
const targetPattern = /^(?:@[A-Za-z][A-Za-z0-9_]{4,31}|-[1-9][0-9]{0,15})$/;

export async function ensureStoryCampaigns() {
  await db.run(`CREATE TABLE IF NOT EXISTS secretary_story_campaigns (
    id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, business_connection_id TEXT NOT NULL,
    target TEXT NOT NULL, photo TEXT NOT NULL, story_caption TEXT NOT NULL,
    group_message TEXT NOT NULL, buttons TEXT NOT NULL, publish_at INTEGER NOT NULL,
    active_period INTEGER NOT NULL, story_status TEXT NOT NULL DEFAULT 'queued',
    group_status TEXT NOT NULL DEFAULT 'queued', story_id INTEGER, message_id INTEGER,
    story_error TEXT, group_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  await db.run('CREATE INDEX IF NOT EXISTS secretary_story_campaigns_due_idx ON secretary_story_campaigns(publish_at,story_status,group_status)');
}

export function validateStoryCampaign(input) {
  const id = String(input?.id || '');
  const target = String(input?.target || '').trim();
  const photo = String(input?.photo || '').trim();
  const storyCaption = String(input?.storyCaption || '').trim();
  const groupMessage = String(input?.groupMessage || '').trim();
  const publishAt = Number(input?.publishAt);
  const activePeriod = Number(input?.activePeriod || 86400);
  if (!keyPattern.test(id)) invalid('Invalid campaign key.');
  if (!targetPattern.test(target) || (target.startsWith('-') && !Number.isSafeInteger(Number(target)))) invalid('Enter a group @username or negative chat ID.');
  if (!mediaPattern.test(photo)) invalid('Upload a Story photo.');
  if (storyCaption.length > 2048) invalid('Story caption exceeds 2048 characters.');
  if (!groupMessage || groupMessage.length > 4096) invalid('Group message must be 1–4096 characters.');
  if (!Number.isSafeInteger(publishAt) || publishAt < Math.floor(Date.now() / 1000) + 60 || publishAt > Math.floor(Date.now() / 1000) + 31536000) invalid('Choose a time between one minute and one year from now.');
  if (![21600,43200,86400,172800].includes(activePeriod)) invalid('Choose a valid Story duration.');
  if (!Array.isArray(input?.buttons) || input.buttons.length > 12) invalid('Use at most 12 link buttons.');
  const buttons = input.buttons.map(button => {
    const text = String(button?.text || '').trim();
    const url = String(button?.url || '').trim();
    const row = Number(button?.row);
    if (!text || text.length > 64 || !Number.isInteger(row) || row < 1 || row > 6) invalid('Each button needs a label and row 1–6.');
    if (url.length > 2048 || !/^https:\/\/[^/\s@]+(?:\/[^\s]*)?$/i.test(url)) invalid('Buttons need valid HTTPS URLs without credentials.');
    return { text, url, row };
  });
  for (let row=1; row<=6; row++) if (buttons.filter(button => button.row === row).length > 2) invalid('Use at most two buttons per row.');
  return { id, target, photo, storyCaption, groupMessage, buttons, publishAt, activePeriod };
}

export async function createStoryCampaign(input, staffId) {
  await ensureStoryCampaigns();
  const requestId = String(input?.id || '');
  if (keyPattern.test(requestId)) {
    const existing = await db.get('SELECT staff_id,story_status,group_status FROM secretary_story_campaigns WHERE id=:id', { ':id':requestId });
    if (existing) {
      if (existing.staff_id !== String(staffId)) invalid('This campaign key is already in use.');
      return { id:requestId, status:existing.story_status === 'queued' && existing.group_status === 'queued' ? 'queued' : 'started' };
    }
  }
  const request = validateStoryCampaign(input);
  const settings = await getAutomationSettings();
  if (!settings.businessConnectionId) invalid('Connect the Telegram Business account first.');
  const connection = await api.getBusinessConnection({ business_connection_id: settings.businessConnectionId });
  if (connection?.is_enabled !== true) invalid('The Telegram Business connection is disabled. Enable it before scheduling.');
  if (!connection?.rights?.can_manage_stories) invalid('Allow the connected bot to manage Stories in Telegram Business settings.');
  if (request.activePeriod !== 86400 && connection?.user?.is_premium !== true) invalid('6, 12, and 48 hour Stories require Telegram Premium.');
  const chat = await api.getChat({ chat_id: request.target });
  if (!['group','supergroup'].includes(chat?.type)) invalid('Choose a group that the bot can post in.');
  const bot = await api.getMe();
  const membership = await api.getChatMember({ chat_id: chat.id, user_id: bot.id });
  if (!['member','administrator','creator'].includes(membership?.status) &&
      !(membership?.status === 'restricted' && membership?.can_send_messages)) invalid('Add the bot to this group and allow it to send messages.');
  const params = {
    ':id': request.id, ':staff': String(staffId), ':connection': settings.businessConnectionId,
    ':target': String(chat.id), ':photo': request.photo, ':caption': request.storyCaption,
    ':message': request.groupMessage, ':buttons': JSON.stringify(request.buttons),
    ':publish': request.publishAt, ':period': request.activePeriod,
  };
  const result = await db.run(`INSERT INTO secretary_story_campaigns
    (id,staff_id,business_connection_id,target,photo,story_caption,group_message,buttons,publish_at,active_period,created_at,updated_at)
    VALUES (:id,:staff,:connection,:target,:photo,:caption,:message,:buttons,:publish,:period,unixepoch(),unixepoch())
    ON CONFLICT(id) DO NOTHING RETURNING id`, params);
  if (!result?.rows?.length) {
    const previous = await db.get(`SELECT staff_id,business_connection_id,target,photo,story_caption,group_message,
      buttons,publish_at,active_period,story_status,group_status FROM secretary_story_campaigns WHERE id=:id`, { ':id':request.id });
    if (!previous || previous.staff_id !== String(staffId) || previous.business_connection_id !== settings.businessConnectionId ||
      previous.target !== String(chat.id) || previous.photo !== request.photo || previous.story_caption !== request.storyCaption ||
      previous.group_message !== request.groupMessage || previous.buttons !== JSON.stringify(request.buttons) ||
      previous.publish_at !== request.publishAt || previous.active_period !== request.activePeriod) invalid('This campaign key belongs to a different request.');
    return { id:request.id, status:previous.story_status === 'queued' && previous.group_status === 'queued' ? 'queued' : 'started' };
  }
  return { id: request.id, status: 'queued' };
}

export async function listStoryCampaigns() {
  await ensureStoryCampaigns();
  return await db.all(`SELECT id,target,photo,story_caption AS storyCaption,group_message AS groupMessage,
    buttons,publish_at AS publishAt,active_period AS activePeriod,story_status AS storyStatus,
    group_status AS groupStatus,story_id AS storyId,message_id AS messageId,
    story_error AS storyError,group_error AS groupError,created_at AS createdAt
    FROM secretary_story_campaigns ORDER BY publish_at DESC LIMIT 50`);
}

export async function storyCampaignStatus(id, staffId) {
  await ensureStoryCampaigns();
  const key = String(id || '');
  if (!keyPattern.test(key)) invalid('Invalid campaign key.');
  const row = await db.get(`SELECT story_status AS storyStatus,group_status AS groupStatus
    FROM secretary_story_campaigns WHERE id=:id AND staff_id=:staff`, { ':id':key, ':staff':String(staffId) });
  return row ? { found:true, ...row } : { found:false };
}

export async function cancelStoryCampaign(id) {
  await ensureStoryCampaigns();
  const result = await db.run(`UPDATE secretary_story_campaigns SET story_status='cancelled',group_status='cancelled',updated_at=unixepoch()
    WHERE id=:id AND story_status='queued' AND group_status='queued' RETURNING id`, { ':id': String(id || '') });
  if (!result?.rows?.length) invalid('Campaign has started or cannot be cancelled.');
  return { status: 'cancelled' };
}

function keyboard(buttons) {
  const rows = [];
  for (let row=1; row<=6; row++) {
    const entries = buttons.filter(button => button.row === row).map(({ text,url }) => ({ text,url }));
    if (entries.length) rows.push(entries);
  }
  return rows.length ? { inline_keyboard: rows } : undefined;
}

/** One-way claims prevent automatic duplicates when Telegram accepted a call but its response was lost. */
export async function dispatchStoryCampaigns(limit = 10) {
  await ensureStoryCampaigns();
  const due = await db.all(`SELECT id FROM secretary_story_campaigns WHERE publish_at<=unixepoch()
    AND (story_status='queued' OR (story_status='sent' AND group_status='queued'))
    ORDER BY publish_at,id LIMIT :limit`, { ':limit': Math.min(20, Math.max(1, Number(limit) || 10)) });
  const totals = { stories: 0, messages: 0, uncertain: 0 };
  for (const { id } of due) {
    let row = await db.get('SELECT * FROM secretary_story_campaigns WHERE id=:id', { ':id':id });
    if (row?.story_status === 'queued') {
      const claim = await db.run(`UPDATE secretary_story_campaigns SET story_status='sending',updated_at=unixepoch()
        WHERE id=:id AND story_status='queued' RETURNING id`, { ':id':id });
      if (!claim?.rows?.length) continue;
      try {
        const photo = await resolveSecretaryPhoto(row.photo);
        const story = await api.postStory({ business_connection_id: row.business_connection_id,
          content: { type:'photo', photo }, caption: row.story_caption, active_period: row.active_period });
        if (!Number.isSafeInteger(story?.id) || story.id <= 0) throw new Error('Telegram did not confirm the Story ID.');
        await db.run(`UPDATE secretary_story_campaigns SET story_status='sent',story_id=:story,updated_at=unixepoch()
          WHERE id=:id AND story_status='sending'`, { ':id':id, ':story':story.id });
        totals.stories++;
      } catch (error) {
        await db.run(`UPDATE secretary_story_campaigns SET story_status='uncertain',story_error=:error,updated_at=unixepoch()
          WHERE id=:id AND story_status='sending'`, { ':id':id, ':error':String(error?.message || error).slice(0,500) });
        totals.uncertain++;
        continue;
      }
    }
    row = await db.get('SELECT * FROM secretary_story_campaigns WHERE id=:id', { ':id':id });
    if (row?.story_status !== 'sent' || row.group_status !== 'queued') continue;
    const claim = await db.run(`UPDATE secretary_story_campaigns SET group_status='sending',updated_at=unixepoch()
      WHERE id=:id AND story_status='sent' AND group_status='queued' RETURNING id`, { ':id':id });
    if (!claim?.rows?.length) continue;
    try {
      const sent = await api.sendMessage({ chat_id:row.target,text:row.group_message,
        ...(keyboard(JSON.parse(row.buttons)) ? { reply_markup:keyboard(JSON.parse(row.buttons)) } : {}) });
      if (!Number.isSafeInteger(sent?.message_id) || sent.message_id <= 0) throw new Error('Telegram did not confirm the group message ID.');
      await db.run(`UPDATE secretary_story_campaigns SET group_status='sent',message_id=:message,updated_at=unixepoch()
        WHERE id=:id AND group_status='sending'`, { ':id':id, ':message':sent.message_id });
      totals.messages++;
    } catch (error) {
      await db.run(`UPDATE secretary_story_campaigns SET group_status='uncertain',group_error=:error,updated_at=unixepoch()
        WHERE id=:id AND group_status='sending'`, { ':id':id, ':error':String(error?.message || error).slice(0,500) });
      totals.uncertain++;
    }
  }
  return totals;
}
