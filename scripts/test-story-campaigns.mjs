import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const sqlite = new DatabaseSync(':memory:');
const calls = { stories: [], groups: [] };
let storyError = null;
let groupError = null;
let rights = true;
const api = {
  getBusinessConnection: async () => ({ is_enabled:true, user:{is_premium:true}, rights: { can_manage_stories: rights } }),
  getChat: async ({ chat_id }) => ({ id: -1001234567890, type: chat_id === '@primegroup' ? 'supergroup' : 'private' }),
  getMe: async () => ({ id:12345 }),
  getChatMember: async () => ({ status:'administrator' }),
  postStory: async request => { calls.stories.push(request); if (storyError) throw storyError; return { id: calls.stories.length }; },
  sendMessage: async request => { calls.groups.push(request); if (groupError) throw groupError; return { message_id: calls.groups.length }; },
};
const db = {
  run: async (sql, params = {}) => {
    const statement = sqlite.prepare(sql);
    const rows = sql.includes(' RETURNING ') ? statement.all(params) : (statement.run(params), []);
    return { rows, rowsAffected: rows.length };
  },
  all: async (sql, params = {}) => sqlite.prepare(sql).all(params),
  get: async (sql, params = {}) => sqlite.prepare(sql).get(params),
};
class EndpointError extends Error {}
const source = readFileSync('tgcloud/lib/story-campaigns.js', 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const campaign = new Function('api','db','EndpointError','getAutomationSettings','resolveSecretaryPhoto',
  `${source}\nreturn {validateStoryCampaign,createStoryCampaign,listStoryCampaigns,storyCampaignStatus,cancelStoryCampaign,dispatchStoryCampaigns};`)(
    api,db,EndpointError,async () => ({ businessConnectionId:'business-1' }),async photo => ({ bytes:photo }));
const now = Math.floor(Date.now()/1000);
const base = { id:'campaign-0000000001',target:'@primegroup',photo:'tgmedia:storyphoto0001',storyCaption:'Story caption',
  groupMessage:'Group announcement',buttons:[{text:'Shop',url:'https://example.com/shop',row:1}],publishAt:now+120,activePeriod:86400 };
assert.throws(() => campaign.validateStoryCampaign({...base, buttons:[{text:'Bad',url:'http://example.com',row:1}]}), /HTTPS/);
assert.throws(() => campaign.validateStoryCampaign({...base, publishAt:now-60}), /time/);
rights = false;
await assert.rejects(campaign.createStoryCampaign(base,'staff-1'), /manage Stories/);
rights = true;
assert.equal((await campaign.createStoryCampaign(base,'staff-1')).status,'queued');
assert.deepEqual(await campaign.storyCampaignStatus(base.id,'staff-1'),{found:true,storyStatus:'queued',groupStatus:'queued'});
assert.deepEqual(await campaign.storyCampaignStatus(base.id,'staff-2'),{found:false});
assert.deepEqual(await campaign.storyCampaignStatus('campaign-0000000999','staff-1'),{found:false});
assert.equal((await campaign.createStoryCampaign(base,'staff-1')).status,'queued');
await assert.rejects(campaign.createStoryCampaign({...base,id:'campaign-0000000002',target:'@private'},'staff-1'),/group/);
assert.equal((await campaign.cancelStoryCampaign(base.id)).status,'cancelled');
const second = {...base,id:'campaign-0000000003'};
await campaign.createStoryCampaign(second,'staff-1');
sqlite.prepare('UPDATE secretary_story_campaigns SET publish_at=:publish WHERE id=:id').run({':publish':now-1,':id':second.id});
const result = await campaign.dispatchStoryCampaigns();
assert.deepEqual(result,{stories:1,messages:1,uncertain:0});
assert.equal(calls.stories[0].business_connection_id,'business-1');
assert.equal(calls.stories[0].content.type,'photo');
assert.deepEqual(calls.groups[0].reply_markup.inline_keyboard,[[{text:'Shop',url:'https://example.com/shop'}]]);
assert.deepEqual(await campaign.dispatchStoryCampaigns(),{stories:0,messages:0,uncertain:0});
const failed = {...base,id:'campaign-0000000004'};
await campaign.createStoryCampaign(failed,'staff-1');
sqlite.prepare('UPDATE secretary_story_campaigns SET publish_at=:publish WHERE id=:id').run({':publish':now-1,':id':failed.id});
storyError = new Error('story timeout');
assert.equal((await campaign.dispatchStoryCampaigns()).uncertain,1);
assert.equal((await campaign.listStoryCampaigns()).find(row => row.id===failed.id).storyStatus,'uncertain');
assert.equal(calls.groups.length,1);
storyError = null;
assert.equal((await campaign.dispatchStoryCampaigns()).stories,0);
const groupFailed = {...base,id:'campaign-0000000005'};
await campaign.createStoryCampaign(groupFailed,'staff-1');
sqlite.prepare('UPDATE secretary_story_campaigns SET publish_at=:publish WHERE id=:id').run({':publish':now-1,':id':groupFailed.id});
groupError = new Error('group timeout');
assert.equal((await campaign.dispatchStoryCampaigns()).uncertain,1);
const status = (await campaign.listStoryCampaigns()).find(row => row.id===groupFailed.id);
assert.equal(status.storyStatus,'sent');
assert.equal(status.groupStatus,'uncertain');
assert.equal((await campaign.dispatchStoryCampaigns()).messages,0);
console.log('Story campaigns: validation, permission, idempotency, cancellation, delivery, and uncertain-send guards passed.');
