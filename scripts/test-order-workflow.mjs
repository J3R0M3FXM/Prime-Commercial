import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const sqlite=new DatabaseSync(':memory:');
const schema=readFileSync('tgcloud/schema.js','utf8');
// Use actual column names and SQLite affinities from the production schema.
for(const name of ['orders','customers','products','pointTransactions','inventoryReservations']) {
  const segment=schema.slice(schema.indexOf('export const '+name+' ='),schema.indexOf('\nexport const ',schema.indexOf('export const '+name+' =')+1));
  const table=segment.match(/table\('([^']+)'/)[1];
  const columns=[...segment.matchAll(/\b(text|numeric|integer|json|blob|boolean)\('([^']+)'/g)].map(([,type,column])=>column+' '+({text:'TEXT',numeric:'REAL',integer:'INTEGER',json:'TEXT',blob:'BLOB',boolean:'INTEGER'}[type])+(column==='id'?' PRIMARY KEY':''));
  for(const column of ['created_at','updated_at'])if(!columns.some(value=>value.startsWith(column+' ')))columns.push(column+' INTEGER');
  sqlite.exec(`CREATE TABLE ${table}(${columns.join(',')})`);
}
sqlite.exec(`CREATE TABLE promo_claims(order_id TEXT,status TEXT,updated_at INTEGER);
CREATE TABLE checkout_operations(id TEXT PRIMARY KEY,order_id TEXT,canonical_snapshot TEXT);
INSERT INTO customers(id,tg_user_id,prime_member_id,store_credits,points,referral_points) VALUES('customer','111','MEMBER001',0,0,0);`);
const query=(q,p)=>typeof q==='string'?[q,p||{}]:[q.text,q.params];
const db={async get(q,p){const [s,v]=query(q,p);return sqlite.prepare(s).get(v);},async all(q,p){const [s,v]=query(q,p);return sqlite.prepare(s).all(v);},async run(q,p){const [s,v]=query(q,p);if(/^CREATE /i.test(s.trim())){sqlite.exec(s);return {rowsAffected:0};}const statement=sqlite.prepare(s);if(/RETURNING/i.test(s)){const rows=statement.all(v);return {rowsAffected:rows.length,rows};}return {rowsAffected:Number(statement.run(v).changes)};}};
class EndpointError extends Error {constructor(message,{code}){super(message);this.code=code;}}
let index=0;
function sql(strings,...values){const params={};let text=strings[0];values.forEach((value,i)=>{if(value&&typeof value==='object'&&value.text!=null){text+=value.text;Object.assign(params,value.params);}else{const key=':p'+index++;params[key]=value;text+=key;}text+=strings[i+1];});return {text,params};}
function load(file,names,deps={}){return new Function('db','EndpointError',...Object.keys(deps),readFileSync(file,'utf8').replace(/^import[^\n]*\n/gm,'').replace(/export default async function/,'async function handler').replace(/export /g,'')+'\nreturn {'+names.join(',')+'};')(db,EndpointError,...Object.values(deps));}
const workflow=load('tgcloud/lib/order-workflow.js',['ensureOrderWorkflow','workflowFor','applyWorkflowAction','attachWorkflow','expireReceiptResubmissions','workflowActions','orderWorkflowColumns','customerWorkflowColumns','workflowDefinitions','workflowStage'],{notifyOrderStatusChanged:async()=>{}});
await workflow.ensureOrderWorkflow();
const readiness=load('automation/order-workflow-readiness.js',['handler'],workflow).handler;
assert.equal((await readiness()).ready,true);
const lifecycle=load('tgcloud/lib/order-lifecycle.js',['markOrderReady','markOrderDispatched','markOrderCompleted','reconcileOrderMilestones'],{sql,expireReceiptResubmissions:workflow.expireReceiptResubmissions,notifyOrderStatusChanged:async()=>{}});
const row=id=>{const data=sqlite.prepare('SELECT * FROM orders WHERE id=?').get(id);return Object.fromEntries(Object.entries(data).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));};
db.select=()=>{
  let table,condition={text:'1',params:[]},max=100;
  const decode=data=>data?Object.fromEntries(Object.entries(data).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase()),['items','delivery_address','bundle_config','charges_breakdown'].includes(key)&&typeof value==='string'?JSON.parse(value):value])):undefined;
  const chain={from(value){table=value._table;return chain;},where(value){condition=value;return chain;},orderBy(){return chain;},limit(value){max=value;return chain;},async get(){return decode(sqlite.prepare(`SELECT * FROM ${table} WHERE ${condition.text}`).get(...condition.params));},async all(){return sqlite.prepare(`SELECT * FROM ${table} WHERE ${condition.text} LIMIT ${max}`).all(...condition.params).map(decode);}};return chain;
};
const table=name=>new Proxy({_table:name},{get(target,key){return key==='_table'?target._table:String(key).replace(/[A-Z]/g,letter=>'_'+letter.toLowerCase());}});
const balance=()=>sqlite.prepare("SELECT store_credits n FROM customers WHERE id='customer'").get().n;
async function create(id,extra={}) {
  const values={id,order_number:id,customer_id:'customer',tg_user_id:'111',status:'Pending',payment_status:'Pending Review',control_state:'normal',payment_proof_image:'proof-'+id,staff_edit_version:0,subtotal:100,total_amount:100,payable_now:100,payable_on_delivery:0,delivery_fee:0,promo_shipping_subsidy:0,store_credits_used:0,charges_breakdown:'[]',ready_credit_due:0,ready_credit_issued_amount:0,adjustment_due:0,purchasing_points_amount:5.5,referral_points_status:'none',created_at:Math.floor(Date.now()/1000),...extra};
  sqlite.prepare(`INSERT INTO orders(${Object.keys(values).join(',')}) VALUES(${Object.keys(values).map(()=>'?').join(',')})`).run(...Object.values(values));
  sqlite.prepare("INSERT INTO inventory_reservations(id,order_id,status,quantity) VALUES(?,?,'held',1)").run('stock-'+id,id);
  sqlite.prepare("INSERT INTO promo_claims VALUES(?,'held',unixepoch())").run(id);
  await workflow.workflowFor(row(id));
  return row(id);
}
const action=(id,name,input={})=>workflow.applyWorkflowAction(row(id),name,input);
const paid=(id,amount,extra={})=>action(id,'confirmPayment',{confirmedAmount:amount,providerVerified:true,...extra});

await create('zero-due',{subtotal:0,total_amount:0,payable_now:0,payment_status:'Unpaid',payment_proof_image:null});
await assert.rejects(action('zero-due','confirmPayment',{confirmedAmount:0}),e=>e.code==='PROVIDER_CONFIRMATION_REQUIRED');
await action('zero-due','confirmPayment',{confirmedAmount:0,zeroDueApproved:true});
assert.equal(row('zero-due').status,'Confirmed');
assert.equal(row('zero-due').reviewStatus,'Zero Upfront Balance Approved');
await action('zero-due','processing');

await create('flow',{subtotal:1200,delivery_fee:100,payable_on_delivery:100,store_credits_used:200,payable_now:1000,total_amount:1100});
await assert.rejects(action('flow','confirmPayment',{confirmedAmount:1200}),e=>e.code==='PROVIDER_CONFIRMATION_REQUIRED');
await assert.rejects(paid('flow',999),e=>e.code==='PAYMENT_SHORT');
await paid('flow',1200);assert.equal(row('flow').status,'Confirmed');assert.equal(balance(),200);
await paid('flow',1200);assert.equal(balance(),200,'A repeated confirmation must not refund twice');
await action('flow','requestEdit',{expectedVersion:0,edit:{receiverName:'New Receiver',receiverPhone:'09123456789',deliveryAddress:{unitDetails:'New Unit'},expectedVersion:0}});
assert.equal(row('flow').customerName,null,'A customer edit request must not immediately change the order');
await assert.rejects(action('flow','processing'));
await action('flow','approveCustomerEdit');assert.equal(row('flow').customerName,'New Receiver');
await action('flow','requestCancel');assert.equal(row('flow').status,'Confirmed');await assert.rejects(action('flow','processing'));
await action('flow','rejectCancellation');await action('flow','processing');
await assert.rejects(action('flow','requestEdit',{expectedVersion:1,edit:{}}));
assert.equal((await lifecycle.markOrderReady('flow')).ready,true);
await assert.rejects(lifecycle.markOrderDispatched('flow',''),/tracking link/);
assert.ok(await lifecycle.markOrderDispatched('flow','https://courier.example/track/flow'));
assert.equal(row('flow').deliveryFallbackAt-row('flow').dispatchedAt,21600);
await assert.rejects(action('flow','cancel',{reason:'Cannot Cancel Now'}));
assert.equal((await lifecycle.reconcileOrderMilestones()).autoCompleted,0,'Never complete before six hours');
sqlite.prepare('UPDATE orders SET delivery_fallback_at=unixepoch()-1 WHERE id=?').run('flow');
assert.equal((await lifecycle.reconcileOrderMilestones()).autoCompleted,1);
assert.equal(row('flow').status,'Completed');
assert.equal(sqlite.prepare("SELECT points FROM customers WHERE id='customer'").get().points,5.5,'Completion immediately awards fractional points');
await Promise.all([lifecycle.reconcileOrderMilestones(),lifecycle.reconcileOrderMilestones()]);
assert.equal(sqlite.prepare("SELECT count(*) n FROM point_transactions WHERE id='tx-purchase-flow'").get().n,1);
assert.equal(sqlite.prepare("SELECT points FROM customers WHERE id='customer'").get().points,5.5);

await create('ready-cancel',{subtotal:120,delivery_fee:30,payable_on_delivery:30,store_credits_used:20,payable_now:100,total_amount:130});
const beforeCancel=balance();await paid('ready-cancel',120);await action('ready-cancel','processing');await lifecycle.markOrderReady('ready-cancel');
await assert.rejects(action('ready-cancel','requestCancel'));
await action('ready-cancel','cancel',{reason:'Courier Cannot Deliver'});
assert.equal(balance()-beforeCancel,140,'Refund store-received money plus spent credits, not the uncollected courier fee, without duplicating the overpayment refund');

await create('reduce');const beforeReduce=balance();await paid('reduce',100);
sqlite.prepare("UPDATE orders SET subtotal=60,total_amount=60,payable_now=60 WHERE id='reduce'").run();
assert.equal(balance()-beforeReduce,40,'Verified reductions refund immediately');
assert.throws(()=>sqlite.prepare("UPDATE orders SET subtotal=80,total_amount=80,payable_now=80 WHERE id='reduce'").run(),/bill increase/);
await action('reduce','cancel',{reason:'Customer Cancellation Approved'});assert.equal(balance()-beforeReduce,100);

await create('credit-refund',{store_credits_used:20,subtotal:120});await action('credit-refund','cancel',{reason:'Pending Receipt Cancelled'});
await assert.rejects(action('credit-refund','revalidatePayment',{providerVerified:true,confirmedAmount:0,refundMethod:'credits'}),e=>e.code==='PAYMENT_NOT_RECEIVED');
const beforeRevalidate=balance();await action('credit-refund','revalidatePayment',{providerVerified:true,confirmedAmount:100,refundMethod:'credits'});
assert.equal(balance()-beforeRevalidate,120);
await action('credit-refund','revalidatePayment',{providerVerified:true,confirmedAmount:100,refundMethod:'credits'});assert.equal(balance()-beforeRevalidate,120);

await create('original',{store_credits_used:20,subtotal:120});await action('original','cancel',{reason:'Unverified Payment Cancelled'});
const beforeOriginal=balance();await action('original','revalidatePayment',{providerVerified:true,confirmedAmount:100,refundMethod:'original'});
assert.equal(balance()-beforeOriginal,20,'Original-method refunds return only spent credits to the credit ledger');
assert.equal((await workflow.attachWorkflow(row('original'))).externalRefundState,'pending');
await assert.rejects(action('original','revalidatePayment',{providerVerified:true,confirmedAmount:100,refundMethod:'credits'}),e=>e.code==='REFUND_METHOD_CONFLICT');
await action('original','recordOriginalRefund',{reference:'PROVIDER-REFUND-123'});
assert.equal((await workflow.attachWorkflow(row('original'))).externalRefundState,'submitted');

await create('restricted',{store_credits_used:20,received_transfer_used:20,subtotal:120});await paid('restricted',100);
const beforeRestricted=sqlite.prepare("SELECT received_transfer_balance n FROM customers WHERE id='customer'").get().n||0;
await action('restricted','cancel',{reason:'Return Received Transfer Credits'});
assert.equal(sqlite.prepare("SELECT received_transfer_balance n FROM customers WHERE id='customer'").get().n-beforeRestricted,20,'Refunding spent transferred credits must preserve their non-transferable classification');

await create('stock-edit',{items:JSON.stringify([{productId:'sku',variantId:'default',quantity:2,price:50}])});
sqlite.prepare("UPDATE inventory_reservations SET product_id='sku',variant_id='default',quantity=2 WHERE order_id='stock-edit'").run();
await paid('stock-edit',100);const beforeStock=balance();
sqlite.prepare("UPDATE orders SET items=?,subtotal=50,total_amount=50,payable_now=50 WHERE id='stock-edit'").run(JSON.stringify([{productId:'sku',variantId:'default',quantity:1,price:50}]));
assert.equal(sqlite.prepare("SELECT quantity FROM inventory_reservations WHERE order_id='stock-edit'").get().quantity,1,'Order edits reduce reservations atomically with the refund');
assert.equal(balance()-beforeStock,50);
assert.throws(()=>sqlite.prepare("UPDATE orders SET items=?,subtotal=50,total_amount=50 WHERE id='stock-edit'").run(JSON.stringify([{productId:'sku',variantId:'default',quantity:2,price:25}])),/Stock increases/,'Lower pricing must not bypass the no-stock-increase rule');
assert.throws(()=>sqlite.prepare("UPDATE orders SET items=? WHERE id='stock-edit'").run(JSON.stringify([{productId:'sku',variantId:'default',quantity:1},{productId:'sku',variantId:'default',quantity:1}])),/Stock increases/,'Duplicate SKU lines cannot spend one remaining reservation twice');

await create('concurrent');const beforeConcurrent=balance();
const confirmations=await Promise.allSettled([paid('concurrent',120),paid('concurrent',120)]);
assert.ok(confirmations.some(result=>result.status==='fulfilled'));await paid('concurrent',120);
assert.equal(balance()-beforeConcurrent,20,'Concurrent payment approval cannot duplicate an overpayment refund');

await create('retry');await action('retry','failReceipt');assert.equal((await workflow.attachWorkflow(row('retry'))).receiptFailures,1);
await action('retry','hold');await action('retry','resubmit');
sqlite.prepare("UPDATE orders SET payment_proof_image='replacement',payment_status='Pending Review' WHERE id='retry'").run();
await action('retry','failReceipt');assert.equal(row('retry').status,'Cancelled');
assert.equal((await workflow.attachWorkflow(row('retry'))).receiptFailures,2);
assert.equal(sqlite.prepare("SELECT status FROM inventory_reservations WHERE order_id='retry'").get().status,'released');

await create('busy');sqlite.exec("UPDATE customers SET store_credits_operation_id='other-checkout' WHERE id='customer'");
const beforeBusy=balance();await assert.rejects(paid('busy',120),/ledger is busy/);
assert.equal(row('busy').paymentStatus,'Pending Review','Refund failure rolls back payment confirmation and credit together');assert.equal(balance(),beforeBusy);
sqlite.exec("UPDATE customers SET store_credits_operation_id=NULL WHERE id='customer'");
await create('no-proof',{payment_proof_image:''});await assert.rejects(paid('no-proof',100));
await create('unpaid-dispatched',{status:'Dispatched',payment_status:'Pending Review',dispatched_at:1,delivery_fallback_at:1});
assert.equal((await lifecycle.reconcileOrderMilestones()).autoCompleted,0,'Never auto-complete an unverified payment');
assert.equal(row('unpaid-dispatched').status,'Dispatched');

const loyalty=load('tgcloud/lib/loyalty.js',['calculateCustomerTier','calculateOrderRewardPoints']);
const eq=(field,value)=>({text:field+'=?',params:[value]});
const or=(...conditions)=>({text:'('+conditions.map(condition=>condition.text).join(' OR ')+')',params:conditions.flatMap(condition=>condition.params)});
const requireAdmin=async ctx=>{if(!ctx?.testStaff)throw new EndpointError('Admin required',{code:'ADMIN_REQUIRED'});return {id:999};};
const manage=load('tgcloud/endpoints/manageOrders.js',['handler'],{requireAdmin,eq,or,desc:x=>x,inArray:(field,values)=>({text:field+' IN ('+values.map(()=>'?').join(',')+')',params:values}),orders:table('orders'),customers:table('customers'),products:table('products'),...workflow,...lifecycle,...loyalty,notifyOrderStatusChanged:async()=>{}}).handler;
await assert.rejects(manage({action:'markPaid',orderId:'busy',admin:true},{}),e=>e.code==='ADMIN_REQUIRED');
sqlite.exec("INSERT INTO products(id,name,price,is_active,bundle_config) VALUES('sku','Product',60,1,'{}')");
await create('endpoint-edit',{subtotal:120,store_credits_used:20,items:JSON.stringify([{productId:'sku',variantId:'default',quantity:2,price:60}])});
sqlite.prepare("UPDATE inventory_reservations SET product_id='sku',variant_id='default',quantity=2 WHERE order_id='endpoint-edit'").run();
await assert.rejects(manage({action:'markPaid',orderId:'endpoint-edit',confirmedAmount:100,expectedPayableNow:101,providerVerified:true},{testStaff:true}),e=>e.code==='ORDER_CHANGED');
await manage({action:'markPaid',orderId:'endpoint-edit',confirmedAmount:100,expectedPayableNow:100,providerVerified:true},{testStaff:true});
const beforeEndpoint=balance();
const editPayload={action:'edit',orderId:'endpoint-edit',expectedVersion:0,items:[{productId:'sku',variantId:'default',quantity:1,price:60}],discountMode:'none',discountValue:0,deliveryFee:0,charges:[]};
await manage(editPayload,{testStaff:true});
assert.equal(row('endpoint-edit').totalAmount,40,'The real edit endpoint retains net-of-credits total semantics');
assert.equal(row('endpoint-edit').payableNow,40);assert.equal(balance()-beforeEndpoint,60);
assert.equal(row('endpoint-edit').purchasingPointsAmount,2,'Reward points follow the reduced eligible spend');
assert.equal(sqlite.prepare("SELECT quantity FROM inventory_reservations WHERE order_id='endpoint-edit'").get().quantity,1);
await assert.rejects(manage(editPayload,{testStaff:true}),e=>e.code==='ORDER_CHANGED');
await manage({action:'startProcessing',orderId:'endpoint-edit'},{testStaff:true});
await assert.rejects(manage({...editPayload,expectedVersion:1},{testStaff:true}),e=>e.code==='ORDER_NOT_EDITABLE');
await assert.rejects(manage({action:'dispatchOverride',orderId:'endpoint-edit'},{testStaff:true}),e=>e.code==='LEGACY_WORKFLOW_RETIRED');
const mine=load('tgcloud/endpoints/manageMyOrder.js',['handler'],{eq,orders:table('orders'),customers:table('customers'),...workflow}).handler;
await assert.rejects(mine({action:'cancel',orderId:'concurrent'},{initData:{user:{id:222}}}),e=>e.code==='NOT_FOUND');
await create('customer-edit',{customer_name:'Original Receiver',customer_phone:'09123456789',delivery_address:'{}'});
const requested=await mine({action:'edit',orderId:'customer-edit',expectedVersion:0,receiverName:'New Receiver',receiverPhone:'09123456789',unitDetails:'Unit 2',deliveryNotes:'Call On Arrival'},{initData:{user:{id:111}}});
assert.equal(requested.requestPending,true);assert.equal(row('customer-edit').customerName,'Original Receiver');
await create('blocked-auto',{status:'Dispatched',payment_status:'Paid',dispatched_at:1,delivery_fallback_at:1,payment_received_amount:120,confirmed_paid_amount:100});
await create('healthy-auto',{status:'Dispatched',payment_status:'Paid',dispatched_at:2,delivery_fallback_at:2,payment_received_amount:100,confirmed_paid_amount:100});
sqlite.exec("UPDATE customers SET store_credits_operation_id='unrelated-checkout' WHERE id='customer'");
const deferred=await lifecycle.reconcileOrderMilestones();assert.equal(deferred.autoCompleted,1);assert.equal(deferred.deferredCompletions,1);
assert.equal(row('healthy-auto').status,'Completed');assert.equal(row('blocked-auto').status,'Dispatched','A busy credit ledger must not falsely complete or block healthy orders');
sqlite.exec("UPDATE customers SET store_credits_operation_id=NULL WHERE id='customer'");
assert.equal((await lifecycle.reconcileOrderMilestones()).autoCompleted,1);
// Receipt bytes must not make the queue exceed TGCloud's serialized-result limit.
for(let index=0;index<6;index++)await create('large-proof-'+index,{payment_proof_data:'x'.repeat(500000),payment_proof_image:'tgmedia:proof-'+index,items:JSON.stringify([{productId:'sku',quantity:1,price:100}])});
const summaries=await manage({action:'list'},{testStaff:true});
assert.ok(JSON.stringify(summaries).length<100000,'Queue returns bounded summaries instead of all binary receipt data');
assert.ok(summaries.orders.every(order=>!('paymentProofData' in order)&&!('paymentProofImage' in order)&&!('ocrAnalysis' in order)&&!('fingerprintSnapshot' in order)&&!('items' in order)));
const detail=await manage({action:'get',orderId:'large-proof-0'},{testStaff:true});
assert.equal(detail.orders.length,1);assert.equal(detail.orders[0].items.length,1);assert.equal(detail.orders[0].paymentProofImage,'tgmedia:proof-0');
assert.equal('paymentProofData' in detail.orders[0],false,'Detail never transfers the unused receipt binary copy');
assert.ok(detail.orders[0].workflow.actions.includes('review'));
await assert.rejects(manage({action:'get',orderId:'large-proof-0'},{}),error=>error.code==='ADMIN_REQUIRED');
await assert.rejects(manage({action:'get',orderId:'missing'},{testStaff:true}),error=>error.code==='NOT_FOUND');
await create('inline-receipt',{payment_proof_data:'x'.repeat(500000),payment_proof_image:'inline-payment-proof:operation'});
const inlineDetail=await manage({action:'get',orderId:'inline-receipt'},{testStaff:true});
assert.equal(inlineDetail.orders[0].paymentProofImage,'tgmedia:order-payment-proof:inline-receipt');
assert.equal('paymentProofData' in inlineDetail.orders[0],false);
assert.ok(JSON.stringify(inlineDetail).length<20000,'Inline receipt detail stays bounded');
sqlite.close();
console.log('Order workflow: review/confirm/process, one receipt retry, deadlines, approval gates, paid cancellation, atomic/idempotent refunds, tracking and six-hour exactly-once rewards passed.');
