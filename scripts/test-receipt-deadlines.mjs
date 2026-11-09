import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const sqlite=new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY,customer_id TEXT,status TEXT,payment_status TEXT,control_state TEXT,review_status TEXT,payment_proof_image TEXT,updated_at INTEGER,total_amount REAL,subtotal REAL,staff_discount_amount REAL,discount_amount REAL,points_discount REAL,charges_breakdown TEXT,delivery_fee REAL,promo_shipping_subsidy REAL,payable_on_delivery REAL,store_credits_used REAL,payment_received_amount REAL,confirmed_paid_amount REAL,order_number TEXT,tracking_url TEXT,referral_points_status TEXT);
CREATE TABLE customers(id TEXT PRIMARY KEY,store_credits REAL,store_credits_operation_id TEXT,updated_at INTEGER);
CREATE TABLE point_transactions(id TEXT PRIMARY KEY,user_id TEXT,type TEXT,amount REAL,order_id TEXT,description TEXT,created_at INTEGER);
CREATE TABLE inventory_reservations(order_id TEXT,status TEXT,updated_at INTEGER);
CREATE TABLE promo_claims(order_id TEXT,status TEXT,updated_at INTEGER);`);
const db={
  async get(sql,params={}) { return sqlite.prepare(sql).get(params); },
  async run(sql,params={}) {
    if(/^CREATE /i.test(sql.trim())) { sqlite.exec(sql); return {rowsAffected:0}; }
    const statement=sqlite.prepare(sql);
    // Telegram db.run returns rowsAffected even for statements with RETURNING.
    if(/RETURNING/i.test(sql))return {rowsAffected:statement.all(params).length};
    return {rowsAffected:Number(statement.run(params).changes)};
  },
};
class EndpointError extends Error {constructor(message,{code}){super(message);this.code=code;}}
const source=readFileSync('tgcloud/lib/order-workflow.js','utf8').replace(/^import[^\n]*\n/gm,'').replace(/export /g,'');
const workflow=new Function('db','EndpointError',source+'\nreturn {ensureOrderWorkflow,applyWorkflowAction,attachWorkflow,expireReceiptResubmissions};')(db,EndpointError);
await workflow.ensureOrderWorkflow();
await workflow.ensureOrderWorkflow();
function create(id) {
  sqlite.prepare(`INSERT INTO orders(id,customer_id,status,payment_status,control_state,payment_proof_image,total_amount,subtotal,referral_points_status) VALUES(?, 'customer','Pending','Failed','held','old-receipt',100,100,'pending')`).run(id);
  sqlite.prepare(`INSERT INTO order_workflow(order_id,original_bill,receipt_failures,updated_at) VALUES(?,100,1,unixepoch())`).run(id);
  sqlite.prepare(`INSERT INTO inventory_reservations VALUES(?,'reserved',unixepoch())`).run(id);
  sqlite.prepare(`INSERT INTO promo_claims VALUES(?,'held',unixepoch())`).run(id);
  return {id,status:'Pending',paymentStatus:'Failed',controlState:'held',payableNow:100};
}
const first=create('expired');
const requested=await workflow.applyWorkflowAction(first,'resubmit');
const deadline=sqlite.prepare('SELECT * FROM order_receipt_deadlines WHERE order_id=?').get(first.id);
assert.equal(deadline.expires_at-deadline.requested_at,3600);
assert.equal(requested.resubmitExpiresAt,deadline.expires_at*1000);
assert.equal((await workflow.attachWorkflow(first)).canResubmit,true);
await workflow.applyWorkflowAction(first,'resubmit');
assert.equal(sqlite.prepare('SELECT expires_at FROM order_receipt_deadlines WHERE order_id=?').get(first.id).expires_at,deadline.expires_at,'Repeating Resubmit must not extend the deadline');
sqlite.prepare('UPDATE order_receipt_deadlines SET expires_at=unixepoch() WHERE order_id=?').run(first.id);
assert.equal((await workflow.attachWorkflow(first)).canResubmit,false);
assert.throws(()=>sqlite.prepare("UPDATE orders SET payment_proof_image='late-receipt' WHERE id=?").run(first.id),/Only one staff-requested/,'Uploads at the deadline are rejected before the scheduler runs');
await assert.rejects(workflow.applyWorkflowAction(first,'resubmit'),error=>error.code==='RECEIPT_DEADLINE_EXPIRED');
assert.equal((await workflow.expireReceiptResubmissions({customerId:'someone-else'})).cancelled,0);
assert.equal((await workflow.expireReceiptResubmissions()).cancelled,1);
assert.equal(sqlite.prepare('SELECT status FROM orders WHERE id=?').get(first.id).status,'Cancelled');
assert.equal(sqlite.prepare('SELECT status FROM inventory_reservations WHERE order_id=?').get(first.id).status,'released');
assert.equal(sqlite.prepare('SELECT status FROM promo_claims WHERE order_id=?').get(first.id).status,'released');
assert.equal(sqlite.prepare('SELECT count(*) n FROM order_workflow_credits').get().n,0,'Unverified payments must not create refunds');
assert.equal((await workflow.expireReceiptResubmissions()).cancelled,0,'Repeated scheduler runs are idempotent');
const uploaded=create('uploaded');
await workflow.applyWorkflowAction(uploaded,'resubmit');
sqlite.prepare("UPDATE orders SET payment_proof_image='replacement',payment_status='Pending Review' WHERE id=?").run(uploaded.id);
sqlite.prepare('UPDATE order_receipt_deadlines SET expires_at=unixepoch()-1 WHERE order_id=?').run(uploaded.id);
assert.equal((await workflow.expireReceiptResubmissions()).cancelled,0,'An uploaded replacement must not expire while awaiting staff review');
assert.equal(sqlite.prepare('SELECT replacement_uploaded FROM order_workflow WHERE order_id=?').get(uploaded.id).replacement_uploaded,1);
assert.throws(()=>sqlite.prepare("UPDATE orders SET payment_proof_image='third-receipt' WHERE id=?").run(uploaded.id),/Only one staff-requested/);
sqlite.close();
console.log('Receipt deadlines: one hour, retry stability, late upload rejection, cancellation cleanup and completed uploads passed.');
