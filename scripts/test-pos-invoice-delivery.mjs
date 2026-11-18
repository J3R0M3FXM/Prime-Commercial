import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const sqlite=new DatabaseSync(':memory:');
const schema=readFileSync('tgcloud/schema.js','utf8');
for(const name of ['orders','paymentMethods']){
 const start=schema.indexOf('export const '+name+' ='),end=schema.indexOf('\nexport const ',start+1),segment=schema.slice(start,end<0?undefined:end);
 const nameSql=segment.match(/table\('([^']+)'/)[1];
 const columns=[...segment.matchAll(/\b(text|numeric|integer|json|blob|boolean)\('([^']+)'/g)].map(([,type,column])=>column+' '+({text:'TEXT',numeric:'REAL',integer:'INTEGER',json:'TEXT',blob:'BLOB',boolean:'INTEGER'}[type])+(column==='id'?' PRIMARY KEY':''));
 for(const column of ['created_at','updated_at'])if(!columns.some(value=>value.startsWith(column+' ')))columns.push(column+' INTEGER');
 sqlite.exec(`CREATE TABLE ${nameSql}(${columns.join(',')})`);
}
sqlite.exec("CREATE TABLE order_workflow(order_id TEXT PRIMARY KEY,edit_state TEXT,cancellation_requested INTEGER); INSERT INTO payment_methods(id,name,is_active,qr_code_image,account_name,account_number,secret_key) VALUES('gcash','GCash',1,'tgmedia:configured-qr','PRIME','09111111111','NEVER-EXPOSE')");
function order(id,number){sqlite.prepare(`INSERT INTO orders(id,order_number,notes,status,payment_status,customer_name,tg_user_id,items,subtotal,charges_breakdown,discount_amount,store_credits_used,delivery_fee,total_amount,payable_now,payable_on_delivery,payment_method_name,payment_method_id,delivery_address,created_at,payment_deadline_at)
 VALUES(?,?,'POS · Store pickup','Pending','Unpaid','Customer','333','[{"name":"Coffee","price":100,"quantity":2}]',200,'[{"name":"Packing","computedAmount":5}]',10,15,40,220,180,40,'GCash','gcash','{"formatted":"Baguio"}',unixepoch(),unixepoch()+86400)`).run(id,number);}
order('o1','181126120000');order('o2','181126120001');order('o3','181126120002');order('o4','181126120003');
const db={async get(sql,params={}){return sqlite.prepare(sql).get(params);},async all(sql,params={}){return sqlite.prepare(sql).all(params);},async run(sql,params={}){const statement=sqlite.prepare(sql);if(/RETURNING/i.test(sql)){const rows=statement.all(params);return {rows,rowsAffected:rows.length};}return {rowsAffected:Number(statement.run(params).changes)};}};
class EndpointError extends Error{constructor(message,options){super(message);this.code=options?.code;}}
class InputFile{constructor(bytes,name,options){Object.assign(this,{bytes,name,options});}}
const requireAdmin=async ctx=>{if(![111,222].includes(ctx?.initData?.user?.id))throw new EndpointError('Admin required',{code:'ADMIN_REQUIRED'});return ctx.initData.user;};
let business=true,recent=true,failSend=false,rejectSend=false;const sent=[],notifications=[];
const api={getBusinessConnection:async()=>({is_enabled:true,rights:{can_reply:true}}),sendPhoto:async input=>{sent.push(input);if(failSend)throw new Error('Uncertain Telegram response');if(rejectSend)throw Object.assign(new Error('Bot blocked'),{code:403});return {message_id:sent.length};}};
const source=readFileSync('tgcloud/endpoints/sendPosInvoice.js','utf8').replace(/^import[\s\S]*?;\n/gm,'').replace('export default async function','async function handler');
const handler=new Function('api','db','EndpointError','InputFile','requireAdmin','publicMediaReference','getAutomationSettings','getAutomationChatState','ensureOrderWorkflow','notifyOrderStatusChanged',source+'\nreturn handler;')(
 api,db,EndpointError,InputFile,requireAdmin,async value=>value,async()=>({businessConnectionId:business?'business-1':''}),async()=>({lastCustomerMessageAt:new Date(Date.now()-(recent?0:25*3600*1000))}),async()=>{},async input=>notifications.push(input));
const caption=new Function(source+'\nreturn invoiceCaption;')();
assert.equal(caption({reference:'INV-123',paymentStatus:'Unpaid',payableNow:12345.67,payment:{name:'GCash'},validUntil:'2026-11-18T06:38:00Z'}),'PRIME Invoice INV-123\n\nPayment Status: Awaiting Payment\n\nAmount Due: P12,345.67\n\nPayment Method: GCash\n\nPayment Due: 18-NOV-2026 02:38 PM');
assert.equal(caption({reference:'INV-123',paymentStatus:'Paid',payableNow:12345.67,payment:{name:'GCash'},validUntil:'2026-11-18T06:38:00Z'}),'PRIME Invoice INV-123\n\nPayment Status: Paid\n\nAmount Paid: P12,345.67\n\nPayment Method: GCash');
const ctx=id=>({initData:{user:{id}}});
await assert.rejects(handler({action:'list'},ctx(999)),{code:'ADMIN_REQUIRED'});
assert.equal((await handler({action:'list'},ctx(111))).length,4);
const prepare=number=>handler({action:'prepare',orderNumber:number,paymentMethodId:'gcash'},ctx(111));
const invoice=await prepare('181126120000');
assert.equal(invoice.invoice.payment.qrCodeImage,'tgmedia:configured-qr');
assert.equal(invoice.invoice.payment.accountNumber,'09111111111');
assert.equal(JSON.stringify(invoice).includes('NEVER-EXPOSE'),false);
assert.equal(invoice.invoice.payableNow,180);assert.equal(invoice.invoice.payableOnDelivery,40);assert.equal(invoice.route,'business');
assert.equal((await prepare('181126120000')).sessionId,invoice.sessionId,'Preparation retries keep the same send session');
const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,...new Array(24).fill(0)]),data=Buffer.from(bytes).toString('base64url');
async function upload(value){await handler({action:'start',sessionId:value.sessionId,fileSize:bytes.length,chunkCount:1},ctx(111));await handler({action:'chunk',sessionId:value.sessionId,index:0,data},ctx(111));}
await assert.rejects(handler({action:'start',sessionId:invoice.sessionId,fileSize:bytes.length,chunkCount:1},ctx(222)),/expired/);
await upload(invoice);
await Promise.allSettled([handler({action:'send',sessionId:invoice.sessionId,chatId:'attacker'},ctx(111)),handler({action:'send',sessionId:invoice.sessionId},ctx(111))]);
assert.ok(sent[0].caption.startsWith('PRIME Invoice 181126120000\n\nPayment Status: Awaiting Payment\n\nAmount Due: P180.00\n\nPayment Method: GCash\n\nPayment Due: '));
assert.match(sent[0].caption,/Payment Due: \d{2}-[A-Z]{3}-\d{4} \d{2}:\d{2} [AP]M$/);
assert.equal(sent.length,1,'Concurrent sends cannot duplicate an invoice');assert.equal(sent[0].chat_id,'333');assert.equal(sent[0].business_connection_id,'business-1');assert.deepEqual(sent[0].photo.bytes,bytes);
await handler({action:'send',sessionId:invoice.sessionId},ctx(111));assert.equal(sent.length,1);
assert.equal(sqlite.prepare('SELECT count(*) n FROM pos_invoice_parts').get().n,0);
const uncertain=await prepare('181126120001');await upload(uncertain);failSend=true;
await assert.rejects(handler({action:'send',sessionId:uncertain.sessionId},ctx(111)),{code:'POS_INVOICE_UNCERTAIN'});
await assert.rejects(handler({action:'send',sessionId:uncertain.sessionId},ctx(111)),{code:'POS_INVOICE_UNCERTAIN'});
assert.equal(sent.length,2);failSend=false;
const expiredWindow=await prepare('181126120002');await upload(expiredWindow);recent=false;
await assert.rejects(handler({action:'send',sessionId:expiredWindow.sessionId},ctx(111)),/window has closed/);assert.equal(sent.length,2);recent=true;
const confirm={action:'confirmPayment',orderNumber:'181126120000',confirmedAmount:180,paymentVerified:true};
await assert.rejects(handler({...confirm,paymentVerified:false},ctx(111)),/Verify the transfer/);
await assert.rejects(handler({...confirm,confirmedAmount:179},ctx(111)),/exact invoice amount/);
sqlite.exec("INSERT INTO order_workflow VALUES('o1','pending',0)");
await assert.rejects(handler(confirm,ctx(111)),/order changed/);
sqlite.exec("UPDATE order_workflow SET edit_state='' WHERE order_id='o1'");
assert.equal((await handler(confirm,ctx(111))).success,true);
assert.equal(sqlite.prepare("SELECT payment_status s FROM orders WHERE id='o1'").get().s,'Paid');
assert.equal((await handler(confirm,ctx(111))).alreadyPaid,true);assert.equal(notifications.length,1);
const paidImage=await prepare('181126120000');assert.equal(paidImage.invoice.paymentStatus,'Paid');assert.notEqual(paidImage.sessionId,invoice.sessionId,'A paid invoice gets a fresh status snapshot');
business=false;const bot=await prepare('181126120003');assert.equal(bot.route,'bot');await upload(bot);await handler({action:'send',sessionId:bot.sessionId},ctx(111));assert.equal(sent.at(-1).business_connection_id,undefined);
order('o5','181126120004');const rejected=await prepare('181126120004');await upload(rejected);rejectSend=true;
await assert.rejects(handler({action:'send',sessionId:rejected.sessionId},ctx(111)),{code:'POS_INVOICE_REJECTED'});
assert.equal(sqlite.prepare('SELECT status s FROM pos_invoice_sessions WHERE id=?').get(rejected.sessionId).s,'uploading','A definite Telegram rejection remains retryable');
rejectSend=false;await handler({action:'send',sessionId:rejected.sessionId},ctx(111));
assert.equal(sent.length,5);
order('o6','181126120005');const changedQr=await prepare('181126120005');await upload(changedQr);
sqlite.exec("UPDATE payment_methods SET qr_code_image='tgmedia:new-qr' WHERE id='gcash'");
await assert.rejects(handler({action:'send',sessionId:changedQr.sessionId},ctx(111)),/Payment instructions changed/);
const refreshed=await prepare('181126120005');assert.equal(refreshed.invoice.payment.qrCodeImage,'tgmedia:new-qr');assert.notEqual(refreshed.sessionId,changedQr.sessionId);
order('o7','181126120006');sqlite.exec("UPDATE orders SET payment_method_name='Cash',payment_method_id='' WHERE id='o7'");
const cash=await handler({action:'prepare',orderNumber:'181126120006'},ctx(111));
assert.equal((await handler({action:'prepare',orderNumber:'181126120006'},ctx(111))).sessionId,cash.sessionId);
sqlite.close();
console.log('PASS: admin-only configured QR invoices, customer/business routing, chunk ownership, duplicate/uncertain send guards and verified payment confirmation.');
