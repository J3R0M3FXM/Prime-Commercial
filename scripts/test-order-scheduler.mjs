import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname,relative,resolve } from 'node:path';
const require=createRequire(import.meta.url),yaml=require('js-yaml');
const source=readFileSync('automation/order-milestones.js','utf8').replace(/^import[^\n]*\n/gm,'').replace('export default async function','async function handler');
const load=reconcile=>new Function('reconcileOrderMilestones',source+'\nreturn handler;')(reconcile);
let calls=0;
const result=await load(async input=>{assert.equal(input.limit,20);calls++;return calls===1?{autoCompleted:2,receiptExpired:1,credited:3,purchasingAwarded:2,pending:0}:{autoCompleted:0,receiptExpired:0,credited:0,purchasingAwarded:0,pending:1};})();
assert.equal(calls,2);assert.equal(result.autoCompleted,2);assert.equal(result.receiptExpired,1);assert.equal(result.credited,3);
calls=0;await load(async()=>{calls++;return {autoCompleted:20};})();assert.equal(calls,5,'A scheduled invocation must be bounded');
await assert.rejects(load(async()=>({deferredCompletions:1}))(),/deferred/,'Deferred completions must fail visibly rather than report false success');
const workflow=yaml.load(readFileSync('.github/workflows/prime-order-milestones.yml','utf8'));
assert.equal(workflow.on.schedule[0].cron,'2-57/5 * * * *');
assert.equal(workflow.permissions.contents,'read');assert.equal(workflow.concurrency['cancel-in-progress'],false);
assert.match(workflow.jobs.reconcile.if,/PRIME_ORDER_AUTOMATION_ENABLED/);assert.match(workflow.jobs.reconcile.if,/PRIME_AUTOMATION_REF/);
assert.equal(workflow.jobs.reconcile.steps[0].with['persist-credentials'],false);
const step=workflow.jobs.reconcile.steps.find(step=>step.env?.TGCLOUD_TOKEN);
assert.equal(step.env.TGCLOUD_TOKEN,'${{ secrets.TGCLOUD_TOKEN }}');
assert.match(step.run,/app8830494959/);assert.match(step.run,/tgcloud run endpoints\/orderMilestones/);
assert.match(step.run,/test ! -e tgcloud\/endpoints\/orderMilestones\.js/);
assert.match(step.run,/tgcloud pull/);assert.match(step.run,/sha256sum --check --strict/);
assert.match(step.run,/private-runtime\.log.*2>&1/,'Public Actions logs must not expose customer-related runtime warnings');
assert.doesNotMatch(step.run,/cat.*private-runtime|upload-artifact/);
const pinned=new Set();
const localPath=file=>file==='tgcloud/endpoints/orderMilestones.js'?'automation/order-milestones.js':file;
for(const line of readFileSync('automation/order-milestones.sha256','utf8').trim().split('\n')) {
  const [digest,file]=line.split(/\s+/);assert.equal(createHash('sha256').update(readFileSync(localPath(file))).digest('hex'),digest,'Only the exact validated deployed dependency closure may run: '+file);
  pinned.add(file);
}
const visited=new Set(),pending=['tgcloud/endpoints/orderMilestones.js'];
while(pending.length){const file=pending.pop();if(visited.has(file))continue;visited.add(file);assert.ok(pinned.has(file),'Unpinned scheduler dependency: '+file);for(const [,target] of readFileSync(localPath(file),'utf8').matchAll(/^import\s+.*?from\s+['"]([^'"]+)['"]/gm)){if(target.startsWith('.'))pending.push(relative(process.cwd(),resolve(dirname(file),target)));else assert.ok(['sdk','sdk/db','sdk/fetch'].includes(target),'Unexpected external backend dependency');}}
assert.deepEqual([...visited].sort(),[...pinned].sort(),'The manifest must pin the whole scheduler dependency closure');
assert.doesNotMatch(step.run,/--ctx|tgcloud push|curl|initData/,'The scheduler uses the owner CLI only, with no fake identity or public endpoint');
console.log('Scheduler: bounded shared reconciliation, five-minute cron, pinned source, explicit activation gate, target-app guard and existing secret passed.');
