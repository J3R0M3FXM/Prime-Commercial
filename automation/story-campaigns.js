import { dispatchStoryCampaigns } from '../lib/story-campaigns.js';

/** Owner CLI template: copy temporarily into tgcloud/endpoints; never deploy this entry point. */
export default async function () {
  return await dispatchStoryCampaigns(10);
}
