import { reconcileOrderMilestones } from '../lib/order-lifecycle.js';

/** Owner CLI template: copy temporarily into tgcloud/endpoints; never deploy this entry point. */
export default async function () {
  const totals={autoCompleted:0,deferredCompletions:0,receiptExpired:0,credited:0,purchasingAwarded:0,pending:0,batches:0};
  for(let batch=0;batch<5;batch++) {
    const result=await reconcileOrderMilestones({limit:20});
    totals.batches++;
    for(const key of ['autoCompleted','deferredCompletions','receiptExpired','credited','purchasingAwarded','pending'])totals[key]+=Number(result[key])||0;
    if(!result.autoCompleted&&!result.receiptExpired&&!result.credited&&!result.purchasingAwarded)break;
  }
  if(totals.deferredCompletions>0)throw new Error('Order automation deferred '+totals.deferredCompletions+' completion attempts. Other eligible orders were processed; review locked ledgers or unresolved order data before retrying.');
  return totals;
}
