import assert from 'node:assert/strict';
import { orderDeliveryPaymentMethod } from '../tgcloud/lib/order-delivery-payment.js';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'rolldown';

const sqlite=new DatabaseSync(':memory:');
const schema=readFileSync('tgcloud/schema.js','utf8');
for(const name of ['orders','customers','products','charges','couriers','inventoryReservations','pointTransactions','promos','promoRedemptions','paymentMethods']) {
  const start=schema.indexOf('export const '+name+' =');
  const end=schema.indexOf('\nexport const ',start+1);
  const segment=schema.slice(start,end<0?undefined:end);
  const table=segment.match(/table\('([^']+)'/)[1];
  const columns=[...segment.matchAll(/\b(text|numeric|integer|json|blob|boolean)\('([^']+)'/g)].map(([,type,column])=>column+' '+({text:'TEXT',numeric:'REAL',integer:'INTEGER',json:'TEXT',blob:'BLOB',boolean:'INTEGER'}[type])+(column==='id'?' PRIMARY KEY':''));
  for(const column of ['created_at','updated_at'])if(!columns.some(value=>value.startsWith(column+' ')))columns.push(column+' INTEGER');
  sqlite.exec(`CREATE TABLE ${table}(${columns.join(',')})`);
}
sqlite.exec(`CREATE UNIQUE INDEX order_number_unique ON orders(order_number);
ALTER TABLE customers ADD COLUMN active_checkout_operation_id TEXT;
CREATE UNIQUE INDEX reservation_unique ON inventory_reservations(order_id,product_id,variant_id);
CREATE TABLE checkout_operations(id TEXT PRIMARY KEY,customer_id TEXT,request_key TEXT,request_canonical TEXT,status TEXT,stage TEXT,request_snapshot TEXT,canonical_snapshot TEXT,response_snapshot TEXT,order_id TEXT,expires_at INTEGER,created_at INTEGER,updated_at INTEGER,last_error TEXT,UNIQUE(customer_id,request_key));
INSERT INTO products(id,name,price,stock,is_active,bundle_config) VALUES('last','Last Unit',100,1,1,'{}'),('multi','Many Units',50,10,1,'{}');
INSERT INTO customers(id,tg_user_id,store_credits,received_transfer_balance) VALUES('customer','111',100,20);`);
const decode=row=>row?Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),['items','bundle_config','charges_breakdown'].includes(key)&&typeof value==='string'?JSON.parse(value):value])):undefined;
const table=name=>new Proxy({_table:name},{get:(target,key)=>key==='_table'?target._table:String(key).replace(/[A-Z]/g,c=>'_'+c.toLowerCase())});
const db={
  async get(sql,params={}){return sqlite.prepare(sql).get(params);},
  async all(sql,params={}){return sqlite.prepare(sql).all(params);},
  async run(sql,params={}){if(/CREATE TRIGGER IF NOT EXISTS trg_pos_unpaid_invoice_refund_v1/.test(sql)&&sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_pos_unpaid_invoice_refund_v1'").get())throw new Error('Write query looks like a read one');const q=sqlite.prepare(sql);if(/RETURNING/i.test(sql)){const rows=q.all(params);return {rows,rowsAffected:rows.length};}return {rowsAffected:Number(q.run(params).changes)};},
  select(){let t,condition={text:'1',params:[]};const chain={from(value){t=value._table;return chain;},where(value){condition=value;return chain;},orderBy(){return chain;},async get(){return decode(sqlite.prepare(`SELECT * FROM ${t} WHERE ${condition.text}`).get(...condition.params));},async all(){return sqlite.prepare(`SELECT * FROM ${t} WHERE ${condition.text}`).all(...condition.params).map(decode);}};return chain;},
};
class EndpointError extends Error{constructor(message,options){super(message);this.code=options?.code;}}
function load(file,names,deps={}) {
 const source=readFileSync(file,'utf8').replace(/^import[\s\S]*?;\n/gm,'').replace(/export default async function(?: handler)?\s*\(/,'async function handler(').replace(/export /g,'');
 return new Function('db','EndpointError',...Object.keys(deps),source+'\nreturn {'+names.join(',')+'};')(db,EndpointError,...Object.values(deps));
}
const eq=(field,value)=>({text:field+'=?',params:[typeof value==='boolean'?Number(value):value]});
const inArray=(field,values)=>({text:field+' IN ('+values.map(()=>'?').join(',')+')',params:values});
const operations=load('tgcloud/lib/checkout-operations.js',['beginCheckoutOperation','findCheckoutOperation','canonicalRequest','saveCanonicalCheckoutSnapshot','advanceCheckoutOperation','finishCheckoutOperation','beginCheckoutCompensation','finishCheckoutCompensation','acquireCustomerCheckoutLock','releaseCustomerCheckoutLock']);
const inventory=load('tgcloud/lib/inventory.js',['reserveInventoryLine','releaseInventoryReservations','activeReservationTotals','withAvailableInventory']);
const canonical=load('tgcloud/lib/orders.js',['canonicalizeOrderItems'],{inArray,products:table('products')});
const charges=load('tgcloud/lib/charges.js',['calculateChargesBreakdown','normalizeCharge']);
const credits=load('tgcloud/lib/credits.js',['reserveStoreCredits','finalizeStoreCredits','compensateStoreCredits']);
const loyalty=load('tgcloud/lib/loyalty.js',['calculateCustomerTier','calculateOrderRewardPoints']);
const pricing=load('tgcloud/lib/pos-pricing.js',['pricePosSale'],{...canonical,...charges,...loyalty,eq,asc:x=>x,charges:table('charges'),customers:table('customers'),orders:table('orders'),resolveTrustedFingerprint:()=>({})});
const invoiceRefunds=load('tgcloud/lib/pos-invoice-refunds.js',['ensurePosInvoiceRefunds']);
await invoiceRefunds.ensurePosInvoiceRefunds();
await invoiceRefunds.ensurePosInvoiceRefunds(); // Repeated saves must skip no-op trigger writes.
const deps={...invoiceRefunds,orderDeliveryPaymentMethod,...credits,...pricing,...operations,releasePromoClaim:async()=>{},...inventory,...canonical,...charges,eq,asc:x=>x,orders:table('orders'),customers:table('customers'),charges:table('charges'),couriers:table('couriers'),requireAdmin:async ctx=>{if(!ctx?.staff)throw new EndpointError('Staff required',{code:'ADMIN_REQUIRED'});return {id:ctx.staff};},notifyAdminOrderCreated:async()=>{},notifyPosOrderCreated:async()=>{}};
const ratePricing=load('tgcloud/lib/pos-pricing.js',['pricePosSale'],{...canonical,...charges,...loyalty,eq,asc:x=>x,charges:table('charges'),customers:table('customers'),orders:table('orders'),resolveTrustedFingerprint:()=>({}),quoteDelivery:async()=>({fee:40,courier:{id:'courier'}}),validatePromo:async()=>({valid:true,promoId:'voucher',code:'SAVE',discountType:'fixed',discountAmount:10})});
sqlite.exec("INSERT INTO charges(id,name,type,rate,is_active,description) VALUES('extra','Packing','fixed',5,1,'{\"isDefault\":false}')");
const priced=await ratePricing.pricePosSale({mode:'delivery',customerId:'customer',items:[{productId:'multi',quantity:2}],chargeIds:['extra','extra'],manualCharges:[{name:'Handling',amount:10,type:'percentage'}],promoCode:'SAVE',discountMode:'percentage',discountValue:10,storeCreditsUsed:20,deliveryPaymentMethod:'upon_delivery'});
assert.equal(priced.chargeResult.totalChargesAmount,15,'Selected configured charges are deduplicated; percentages use items subtotal');
assert.equal(priced.staffDiscount,9,'Staff discount applies after voucher');
assert.equal(priced.payableNow,76);
assert.equal(priced.payableOnDelivery,40);
assert.equal(priced.total,116);
await assert.rejects(ratePricing.pricePosSale({mode:'store',items:[{productId:'multi',quantity:1}],discountMode:'percentage',discountValue:101}));
await assert.rejects(ratePricing.pricePosSale({mode:'store',items:[{productId:'multi',quantity:1}],storeCreditsUsed:1}));
await assert.rejects(ratePricing.pricePosSale({mode:'store',items:[{productId:'multi',quantity:1}],chargeIds:['missing']}));
const pos=load('tgcloud/endpoints/createPosOrder.js',['handler'],deps).handler;
sqlite.exec(`CREATE TABLE promo_claims(operation_id TEXT PRIMARY KEY,promo_id TEXT,promo_code TEXT,customer_id TEXT,order_id TEXT,device_id TEXT,hardware_id TEXT,device_fingerprint_id TEXT,server_fingerprint_id TEXT,discount_amount REAL,status TEXT,expires_at INTEGER,created_at INTEGER,updated_at INTEGER);`);
const request={mode:'store',customerName:'Customer',paymentMethodName:'Cash',items:[{productId:'last',variantId:'default',quantity:1}],expectedTotal:100,operationKey:'a'.repeat(32)};
await assert.rejects(pos(request,{}),{code:'ADMIN_REQUIRED'});
await assert.rejects(pos({...request,operationKey:'a'.repeat(129)},{staff:999}),{code:'INVALID_OPERATION_KEY'});
const first=await Promise.allSettled([pos(request,{staff:999}),pos(request,{staff:999})]);
assert.ok(first.some(result=>result.status==='fulfilled'),first.map(result=>result.reason?.stack||result.status).join('\n'));
assert.equal(sqlite.prepare('SELECT count(*) n FROM orders').get().n,1,'Concurrent same-key POS creates one order');
assert.equal(sqlite.prepare("SELECT sum(quantity) n FROM inventory_reservations WHERE status<>'released'").get().n,1,'The saved order retains the last unit');
const original=first.find(result=>result.status==='fulfilled').value;
sqlite.exec("UPDATE products SET price=999,is_active=0 WHERE id='last'");
assert.deepEqual(await pos(request,{staff:999}),original,'Lost response recovers original result even after catalog changes');
await assert.rejects(pos({...request,customerName:'Different'},{staff:999}),{code:'IDEMPOTENCY_CONFLICT'});
sqlite.exec("UPDATE products SET price=100,is_active=1 WHERE id='last'");
await assert.rejects(pos({...request,operationKey:'b'.repeat(32)},{staff:888}),{code:'POS_CHECKOUT_FAILED'});
await assert.rejects(pos({...request,operationKey:'b'.repeat(32)},{staff:888}),{code:'POS_CHECKOUT_FAILED'});
assert.equal(sqlite.prepare('SELECT count(*) n FROM orders').get().n,1);
assert.equal(inventory.withAvailableInventory({id:'last',stock:1},new Map()).stock,1,'One free unit remains sellable');
assert.equal(inventory.withAvailableInventory({id:'last',stock:1},await inventory.activeReservationTotals()).stock,0,'One reserved unit is unavailable');
for(const quantity of [0,1.5,1001,Infinity])await assert.rejects(canonical.canonicalizeOrderItems([{productId:'multi',quantity}]),{code:'INVALID_CART'});
assert.equal((await canonical.canonicalizeOrderItems([{productId:'multi',quantity:1}])).itemQuantity,1);

const creditOp=await operations.beginCheckoutOperation({customerId:'customer',requestKey:'c'.repeat(32),requestSnapshot:{},expiresAt:Math.floor(Date.now()/1000)+60});
const creditRequest={customerId:'customer',operationId:creditOp.operationId,amount:30};
await Promise.all([credits.reserveStoreCredits(creditRequest),credits.reserveStoreCredits(creditRequest)]);
assert.equal(sqlite.prepare("SELECT store_credits n FROM customers WHERE id='customer'").get().n,70);
sqlite.prepare('INSERT INTO orders(id,customer_id,store_credits_used,received_transfer_used) VALUES(?,?,30,20)').run(creditOp.operationId,'customer');
await credits.finalizeStoreCredits(creditRequest);
assert.equal((await credits.reserveStoreCredits(creditRequest)).reused,true,'Retry after finalization cannot debit again');
assert.equal(sqlite.prepare("SELECT store_credits n FROM customers WHERE id='customer'").get().n,70);
assert.equal((await operations.beginCheckoutCompensation({operationId:creditOp.operationId,message:'late failure'})).reason,'order_persisted','Compensation is fenced against saved orders');

// POS uses the credit reservation ledger and recovers without charging twice.
const creditSale={...request,customerId:'customer',items:[{productId:'multi',quantity:1}],storeCreditsUsed:20,expectedTotal:30,operationKey:'p'.repeat(32)};
const balanceStart=sqlite.prepare("SELECT store_credits n FROM customers WHERE id='customer'").get().n;
const paid=await pos(creditSale,{staff:999});
assert.equal(paid.totalAmount,30);
await pos(creditSale,{staff:999});
assert.equal(sqlite.prepare("SELECT store_credits n FROM customers WHERE id='customer'").get().n,balanceStart-20);
assert.equal(sqlite.prepare('SELECT store_credits_used n FROM orders WHERE id=?').get(paid.id).n,20);
const failing=load('tgcloud/endpoints/createPosOrder.js',['handler'],{...deps,reserveStoreCredits:async args=>{await credits.reserveStoreCredits(args);throw new Error('Simulated disconnect after debit');}}).handler;
await assert.rejects(failing({...creditSale,operationKey:'q'.repeat(32)},{staff:999}),{code:'POS_CHECKOUT_FAILED'});
assert.equal(sqlite.prepare("SELECT store_credits n FROM customers WHERE id='customer'").get().n,balanceStart-20,'Failed sale returns its credit reservation');

// POS commit must reject missing or expired reservations, even after a successful hold call.
const expiring=load('tgcloud/endpoints/createPosOrder.js',['handler'],{...deps,reserveInventoryLine:async line=>{const held=await inventory.reserveInventoryLine(line);sqlite.prepare('UPDATE inventory_reservations SET expires_at=unixepoch()-1 WHERE order_id=?').run(line.orderId);return held;}}).handler;
const before=sqlite.prepare('SELECT count(*) n FROM orders').get().n;
await assert.rejects(expiring({...request,operationKey:'d'.repeat(32),items:[{productId:'multi',quantity:1}],expectedTotal:50},{staff:999}),{code:'POS_CHECKOUT_FAILED'});
assert.equal(sqlite.prepare('SELECT count(*) n FROM orders').get().n,before);
// Run the actual storefront processing pipeline against the same real SQLite adapter.
for(const column of ['payment_proof_data','payment_proof_content_type']) if(!sqlite.prepare('SELECT name FROM pragma_table_info(\'orders\') WHERE name=?').get(column)) sqlite.exec(`ALTER TABLE orders ADD COLUMN ${column} TEXT`);
const storefront = load('tgcloud/endpoints/createOrder.js',['processOperation','advanceAtLeast'],{...deps,...credits});
const now=Math.floor(Date.now()/1000);
const webOp=await operations.beginCheckoutOperation({customerId:'customer',requestKey:'web'.repeat(16),requestSnapshot:{},expiresAt:now+120,submittedAt:now});
const snapshot={items:[{id:'multi',productId:'multi',variantId:'default',quantity:1,price:50}],reservations:[{productId:'multi',variantId:'default',quantity:1}],subtotal:50,deliveryFee:0,deliveryPaymentMethod:'upon_checkout',chargesBreakdown:[],promo:null,creditsUsed:10,totalAmount:50,payableNow:40,payableOnDelivery:0,courier:{id:'courier',name:'Courier'},customerName:'Customer',customerPhone:'09123456789',deliveryAddress:{formatted:'Test Address'},fingerprintSnapshot:{},notes:'',paymentProofData:'verified-proof-fixture',paymentProofContentType:'image/jpeg',paymentMethodId:'method',paymentDeadlineAt:now+3600,orderNumberTimestamp:now,orderNumber:'WEB000001',rewardPointsAmount:2.5};
await operations.saveCanonicalCheckoutSnapshot({operationId:webOp.operationId,snapshot});
const webOperation=await operations.findCheckoutOperation({customerId:'customer',requestKey:'web'.repeat(16)});
const customer={id:'customer',tgUserId:'111'};
const balanceBefore=sqlite.prepare("SELECT store_credits AS n FROM customers WHERE id='customer'").get().n;
const webResults=await Promise.allSettled([storefront.processOperation(webOperation,{},customer),storefront.processOperation(webOperation,{},customer)]);
assert.ok(webResults.some(result=>result.status==='fulfilled'),webResults.map(result=>result.reason?.stack||result.status).join('\n'));
assert.equal(sqlite.prepare('SELECT count(*) n FROM orders WHERE id=?').get(webOp.operationId).n,1,'Concurrent storefront retries persist one order');
assert.equal(sqlite.prepare("SELECT store_credits n FROM customers WHERE id='customer'").get().n,balanceBefore-10,'Concurrent storefront retries debit once');
assert.equal(sqlite.prepare('SELECT count(*) n FROM point_transactions WHERE order_id=?').get(webOp.operationId).n,1,'One credit usage ledger entry');
assert.equal(sqlite.prepare('SELECT payment_status AS status FROM orders WHERE id=?').get(webOp.operationId).status,'Pending Review');
const response=await storefront.processOperation(await operations.findCheckoutOperation({customerId:'customer',requestKey:'web'.repeat(16)}),{},customer);
assert.equal(response.orderNumber,'WEB000001');
assert.equal(sqlite.prepare("SELECT store_credits n FROM customers WHERE id='customer'").get().n,balanceBefore-10,'Completed storefront replay never debits again');
sqlite.exec("INSERT INTO promos(id,code,is_active,usage_limit_per_customer,total_usage_limit) VALUES('voucher','SAVE',1,1,1)");
const claims=load('tgcloud/lib/promo-claims.js',['claimPromoUse','redeemPromoClaim','releasePromoClaim']);
const voucherPos=load('tgcloud/endpoints/createPosOrder.js',['handler'],{...deps,...ratePricing,...claims}).handler;
const voucherRequest={...request,customerId:'customer',items:[{productId:'multi',quantity:1}],promoCode:'SAVE',expectedTotal:40,operationKey:'v'.repeat(32)};
const voucherSale=await voucherPos(voucherRequest,{staff:999});
await voucherPos(voucherRequest,{staff:999});
assert.equal(sqlite.prepare("SELECT count(*) n FROM promo_claims WHERE status='redeemed'").get().n,1,'Voucher retries redeem one claim');
assert.equal(sqlite.prepare('SELECT discount_amount n FROM orders WHERE id=?').get(voucherSale.id).n,10);
await assert.rejects(voucherPos({...voucherRequest,operationKey:'w'.repeat(32)},{staff:999}),{code:'POS_CHECKOUT_FAILED'});
assert.equal(sqlite.prepare("SELECT count(*) n FROM promo_claims WHERE status='redeemed'").get().n,1,'Per-customer and total voucher limits are enforced');

// Unpaid chat invoices reserve the same canonical sale without recording money received.
sqlite.exec("UPDATE products SET stock=100 WHERE id='multi'; INSERT INTO payment_methods(id,name,is_active,qr_code_image,account_name,account_number) VALUES('gcash','GCash',1,'configured-qr','PRIME','09111111111')");
const invoiceRequest={mode:'store',customerName:'Invoice Customer',customerId:'customer',paymentMethodId:'gcash',paymentMethodName:'GCash',paymentState:'unpaid',storeCreditsUsed:10,items:[{productId:'multi',quantity:1}],expectedTotal:40,operationKey:'invoice'.repeat(5)};
const beforeInvoice=sqlite.prepare("SELECT store_credits n,received_transfer_balance r FROM customers WHERE id='customer'").get();
const invoiceSale=await pos(invoiceRequest,{staff:999});
const unpaid=sqlite.prepare('SELECT * FROM orders WHERE id=?').get(invoiceSale.id);
assert.equal(unpaid.status,'Pending');assert.equal(unpaid.payment_status,'Unpaid');
assert.equal(unpaid.payment_received_amount,0);assert.equal(unpaid.confirmed_paid_amount,0);
assert.equal(unpaid.payment_method_id,'gcash');assert.ok(unpaid.payment_deadline_at>Math.floor(Date.now()/1000));
assert.equal(sqlite.prepare("SELECT store_credits n FROM customers WHERE id='customer'").get().n,beforeInvoice.n-10);
assert.deepEqual(await pos(invoiceRequest,{staff:999}),invoiceSale,'Invoice retries return the same saved order');
await assert.rejects(pos({...invoiceRequest,paymentState:'paid'},{staff:999}),{code:'IDEMPOTENCY_CONFLICT'});
sqlite.prepare("UPDATE orders SET status='Cancelled' WHERE id=?").run(invoiceSale.id);
assert.equal(sqlite.prepare("SELECT store_credits n FROM customers WHERE id='customer'").get().n,beforeInvoice.n,'Unpaid cancellation restores only Store Credits');
assert.equal(sqlite.prepare("SELECT received_transfer_balance r FROM customers WHERE id='customer'").get().r,beforeInvoice.r,'Restricted credits retain their restriction on cancellation');
sqlite.prepare("UPDATE orders SET status='Cancelled' WHERE id=?").run(invoiceSale.id);
assert.equal(sqlite.prepare("SELECT store_credits n FROM customers WHERE id='customer'").get().n,beforeInvoice.n,'Cancellation retries never refund twice');
console.log('PASS: unpaid POS invoice status, canonical retry, configured tender, exact Store Credit return and cancellation idempotency.');
sqlite.close();

const bundled=await build({input:'lib/pos-checkout-attempt.ts',write:false,platform:'node',output:{format:'esm'}});
const moduleUrl='data:text/javascript;base64,'+Buffer.from(bundled.output[0].code).toString('base64');
const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
const pending=await import(moduleUrl),attempt=pending.beginPosCheckoutAttempt('999',{items:request.items,mode:'store'});
const reloaded=await import(moduleUrl+'#reload');
assert.deepEqual(reloaded.beginPosCheckoutAttempt('999',{items:[],mode:'delivery'}),attempt,'Reload and changed form cannot replace uncertain sale');
assert.equal(reloaded.readPosCheckoutAttempt('888'),null,'Staff accounts have isolated retry state');
reloaded.finishPosCheckoutAttempt('999',attempt.operationKey);assert.equal(reloaded.readPosCheckoutAttempt('999'),null);
console.log('PASS: POS concurrent retries, immutable results, fenced compensation, stock=1, stale holds, strict quantities, single credit debit and reload-safe POS recovery.');
