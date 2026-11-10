import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

function load(file,names,deps={}) {
  const source=readFileSync(file,'utf8').replace(/^import[^\n]*\n/gm,'').replace(/export default async function\s*\(/,'async function handler(').replace(/export /g,'');
  return new Function(...Object.keys(deps),source+'\nreturn {'+names.join(',')+'};')(...Object.values(deps));
}
const content=load('tgcloud/lib/customer-order-notifications.js',['customerNotificationKind','customerNotificationContent','customerNotificationKeyboard']);
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT,tg_user_id TEXT,status TEXT,payment_status TEXT,control_state TEXT,review_status TEXT,tracking_url TEXT,payment_proof_image TEXT);
CREATE TABLE order_workflow(order_id TEXT PRIMARY KEY,resubmission_requested INTEGER);
CREATE TABLE order_receipt_deadlines(order_id TEXT PRIMARY KEY,expires_at INTEGER);
CREATE TABLE telegram_notification_outbox(id TEXT PRIMARY KEY,event_key TEXT UNIQUE,chat_id TEXT,message_text TEXT,order_number TEXT,button_label TEXT,status TEXT,attempt_count INTEGER,next_attempt_at INTEGER,lease_token TEXT,lease_until INTEGER,created_at INTEGER,sent_at INTEGER,last_error TEXT);
INSERT INTO orders VALUES('id','1111011558','111','Pending','Pending Review','','','','proof');
INSERT INTO order_workflow VALUES('id',0);`);
const db={async get(sql,p={}){return sqlite.prepare(sql).get(p);},async all(sql,p={}){return sqlite.prepare(sql).all(p);},async run(sql,p={}){const q=sqlite.prepare(sql);if(/RETURNING/i.test(sql)){const rows=q.all(p);return {rows,rowsAffected:rows.length};}return {rowsAffected:Number(q.run(p).changes)};}};
const messages=[];let fail=false;
const api={getMe:async()=>({username:'prime_test_bot'}),sendMessage:async message=>{if(fail)throw Error('Unavailable');messages.push(message);return {message_id:messages.length};}};
const sender=load('tgcloud/lib/order-notifications.js',['notifyOrderCreated','notifyOrderStatusChanged','notifyPaymentProofSubmitted','dispatchOrderNotificationRetries','ensureNotificationOutbox'],{api,db,...content});
const order={orderNumber:'1111011558',chatId:'111'};
await Promise.all([sender.notifyOrderCreated(order),sender.notifyOrderCreated(order)]);
assert.equal(messages.length,1,'Concurrent same-event calls send once');
assert.equal(messages[0].text,'Greetings from PRIME™ Core!\n\nWe have received your order #1111011558, and it is now pending review.\n\nWe will send you another notification once the review has been completed and your payment has been validated.\n\nThank you for choosing PRIME™ Core!');
assert.equal(messages[0].reply_markup.inline_keyboard[0][0].text,'VIEW ORDER DETAILS');
assert.match(messages[0].reply_markup.inline_keyboard[0][0].url,/startapp=order_1111011558$/);
for(const status of ['Confirmed','Processing','Ready','Dispatched','Completed']) {
  sqlite.prepare("UPDATE orders SET status=?,payment_status='Paid',tracking_url='https://courier.example/track/123' WHERE id='id'").run(status);
  await sender.notifyOrderStatusChanged(order);
  assert.match(messages.at(-1).text,/Greetings from PRIME™ Core!/);
  if(status==='Confirmed'||status==='Processing')assert.match(messages.at(-1).text,/payment.*successfully verified and confirmed/);
  if(status==='Dispatched'){
    assert.deepEqual(messages.at(-1).reply_markup.inline_keyboard[0].map(button=>button.text),['TRACK DELIVERY','VIEW ORDER DETAILS']);
    assert.equal(messages.at(-1).reply_markup.inline_keyboard[0][0].url,'https://courier.example/track/123');
    assert.match(messages.at(-1).text,/6 hours after dispatch/);
  }
  if(status==='Completed'){
    assert.match(messages.at(-1).text,/within 24 hours of order completion/);
    assert.equal(messages.at(-1).reply_markup.inline_keyboard[0][0].url,'https://t.me/prime_test_bot?startapp=rewards');
  }
}
sqlite.exec("UPDATE orders SET status='Pending',payment_status='Failed',control_state='held' WHERE id='id'");
const before=messages.length;await sender.notifyOrderStatusChanged(order);
assert.equal(messages.length,before,'A hold without a resubmit request must not promise an unstarted deadline');
sqlite.exec("UPDATE order_workflow SET resubmission_requested=1; INSERT INTO order_receipt_deadlines VALUES('id',unixepoch()+3600)");
await sender.notifyOrderStatusChanged(order);
assert.match(messages.at(-1).text,/within 1 hour/);
assert.match(messages.at(-1).text,/Receipt Deadline:/);
assert.deepEqual(messages.at(-1).reply_markup.inline_keyboard[0].map(button=>button.text),['RE-UPLOAD RECEIPT','VIEW ORDER DETAILS']);
assert.match(messages.at(-1).reply_markup.inline_keyboard[0][0].url,/startapp=receipt_1111011558$/);
sqlite.exec("UPDATE orders SET status='Cancelled',control_state='cancelled',review_status='Replacement Receipt Deadline Expired — Payment Revalidation Required'");
await sender.notifyOrderStatusChanged(order);assert.match(messages.at(-1).text,/automatically cancelled because a new and valid proof/);
sqlite.exec("UPDATE orders SET review_status='Customer cancellation approved'");
await sender.notifyOrderStatusChanged(order);assert.match(messages.at(-1).text,/cancelled, as requested/);assert.match(messages.at(-1).text,/eligible refund amount/);
sqlite.exec("UPDATE orders SET review_status='Second Receipt Failed — Payment Revalidation Required'");
await sender.notifyOrderStatusChanged(order);assert.match(messages.at(-1).text,/replacement receipt did not pass/);
// Queued messages must use the same buttons, remain leased, and never announce a stale status.
sqlite.exec("UPDATE orders SET status='Ready',control_state='',payment_status='Paid'; DELETE FROM telegram_notification_outbox");
fail=true;await sender.notifyOrderStatusChanged(order);
sqlite.exec("UPDATE telegram_notification_outbox SET next_attempt_at=unixepoch()-1");
fail=false;
const retried=await Promise.all([sender.dispatchOrderNotificationRetries(),sender.dispatchOrderNotificationRetries()]);
assert.equal(retried.reduce((sum,value)=>sum+value.sent,0),1,'Concurrent retry workers share a lease');
sqlite.exec("DELETE FROM telegram_notification_outbox; UPDATE orders SET status='Pending',payment_status='Pending Review'");
fail=true;await sender.notifyOrderStatusChanged(order);fail=false;
sqlite.exec("UPDATE telegram_notification_outbox SET next_attempt_at=unixepoch()-1; UPDATE orders SET status='Completed',payment_status='Paid'");
assert.equal((await sender.dispatchOrderNotificationRetries()).superseded,1,'A delayed Pending message cannot arrive after completion');
assert.equal(sqlite.prepare('SELECT last_error AS error FROM telegram_notification_outbox').get().error,'superseded_status_or_template');
const hostile=content.customerNotificationContent({orderNumber:'<script>',status:'Pending'});
assert.ok(hostile.text.includes('&lt;script&gt;'));assert.ok(!hostile.text.includes('<script>'));
assert.match(content.customerNotificationKeyboard('bot','123','TRACK DELIVERY','javascript:alert(1)').inline_keyboard[0][0].url,/startapp=order_123$/);
class EndpointError extends Error{constructor(message,options){super(message);this.code=options?.code;}}
const manage=load('tgcloud/endpoints/manageNotifications.js',['handler'],{db,EndpointError,dispatchOrderNotificationRetries:sender.dispatchOrderNotificationRetries,ensureNotificationOutbox:sender.ensureNotificationOutbox,requireAdmin:async ctx=>{if(!ctx?.staff)throw new EndpointError('Denied',{code:'ADMIN_REQUIRED'});}}).handler;
await assert.rejects(manage({action:'list'},{}),{code:'ADMIN_REQUIRED'});
assert.equal((await manage({action:'list'},{staff:true})).notifications.length,1);
sqlite.exec('DROP TABLE telegram_notification_outbox');
await Promise.all([sender.ensureNotificationOutbox(),sender.ensureNotificationOutbox()]);
assert.ok(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='telegram_notification_outbox'").get(),'Missing legacy notification storage is created without a schema migration');
sqlite.close();
console.log('PASS: status-specific PRIME Core messages, real saved-order recipients, exact inline destinations, deadline timing, cancellation reasons, leased retries, stale-message suppression and staff-only outbox management.');
