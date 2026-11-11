import { requireAdmin } from '../lib/auth.js';
import { createStoryCampaign, listStoryCampaigns, storyCampaignStatus, cancelStoryCampaign, dispatchStoryCampaigns } from '../lib/story-campaigns.js';
import { EndpointError } from 'sdk';

export default async function (input, ctx) {
  const staff = await requireAdmin(ctx);
  const action = String(input?.action || 'list');
  if (action === 'list') return { campaigns: await listStoryCampaigns() };
  if (action === 'status') return await storyCampaignStatus(input?.id, staff.id);
  if (action === 'create') return await createStoryCampaign(input, staff.id);
  if (action === 'cancel') return await cancelStoryCampaign(input?.id);
  if (action === 'dispatchDue') return await dispatchStoryCampaigns(10);
  throw new EndpointError('Unsupported campaign action.', { code:'INVALID_ACTION' });
}
