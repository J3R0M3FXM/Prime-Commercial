import { db, EndpointError } from 'sdk';

const fail=(message,code='ORDER_ACTION_UNAVAILABLE')=>{throw new EndpointError(message,{code});};
const gross=`max(0,coalesce(NEW.subtotal,0)-coalesce(NEW.staff_discount_amount,0)-coalesce(NEW.discount_amount,0)-coalesce(NEW.points_discount,0))
  +coalesce((SELECT sum(coalesce(json_extract(value,'$.computedAmount'),json_extract(value,'$.amount'),0)) FROM json_each(coalesce(NEW.charges_breakdown,'[]'))),0)
  +coalesce(NEW.delivery_fee,0)-coalesce(NEW.promo_shipping_subsidy,0)`;
const due=`max(0,(${gross})-coalesce(NEW.payable_on_delivery,0))`;
const desired=`CASE WHEN lower(NEW.status)='cancelled' THEN
  CASE WHEN (SELECT refund_method FROM order_workflow WHERE order_id=NEW.id)='original' THEN coalesce(NEW.store_credits_used,0)
    ELSE coalesce(NEW.payment_received_amount,NEW.confirmed_paid_amount,0)+coalesce(NEW.store_credits_used,0) END
  ELSE max(0,coalesce(NEW.payment_received_amount,NEW.confirmed_paid_amount,0)-max(0,(${due})-coalesce(NEW.store_credits_used,0)))
    +max(0,coalesce(NEW.store_credits_used,0)-(${due})) END`;
const restrictedDesired=`CASE WHEN lower(NEW.status)='cancelled' THEN coalesce(NEW.received_transfer_used,0)
  ELSE min(coalesce(NEW.received_transfer_used,0),max(0,coalesce(NEW.store_credits_used,0)-(${due}))) END`;

export const orderWorkflowColumns=[
  ['confirmed_paid_amount','NUMERIC'],['payment_received_amount','NUMERIC'],['ready_at','INTEGER'],['tracking_url','TEXT'],
  ['dispatched_at','INTEGER'],['delivery_fallback_at','INTEGER'],['purchasing_points_credit_after','INTEGER'],
  ['ready_credit_due','NUMERIC NOT NULL DEFAULT 0'],['ready_credit_issued_amount','NUMERIC NOT NULL DEFAULT 0'],
  ['adjustment_due','NUMERIC NOT NULL DEFAULT 0'],['adjustment_status',"TEXT NOT NULL DEFAULT 'none'"],
  ['adjustment_revised_total','NUMERIC'],['adjustment_proof_image','TEXT'],['adjustment_payment_method_id','TEXT'],
  ['adjustment_payment_method_name','TEXT'],['adjustment_proof_submitted_at','INTEGER'],['adjustment_verified_at','INTEGER'],
];
export const customerWorkflowColumns=[['points_operation_id','TEXT'],['points_operation_amount','NUMERIC NOT NULL DEFAULT 0']];
const skuMatch=(alias,other)=>`json_extract(${alias}.value,'$.productId')=json_extract(${other}.value,'$.productId') AND coalesce(json_extract(${alias}.value,'$.variantId'),'default')=coalesce(json_extract(${other}.value,'$.variantId'),'default')`;
const heldSku=`r.order_id=NEW.id AND r.product_id=json_extract(n.value,'$.productId') AND coalesce(r.variant_id,'default')=coalesce(json_extract(n.value,'$.variantId'),'default') AND r.status<>'released'`;
const newReservedQuantity=`coalesce((SELECT sum(json_extract(n.value,'$.quantity')) FROM json_each(NEW.items) n WHERE json_extract(n.value,'$.productId')=inventory_reservations.product_id AND coalesce(json_extract(n.value,'$.variantId'),'default')=coalesce(inventory_reservations.variant_id,'default')),0)`;

export const workflowDefinitions=[
  ['index','order_workflow_point_order_idx',`CREATE INDEX IF NOT EXISTS order_workflow_point_order_idx ON point_transactions(order_id)`],
  ['table','order_receipt_deadlines',`CREATE TABLE IF NOT EXISTS order_receipt_deadlines(order_id TEXT PRIMARY KEY,requested_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)`],
  ['table','order_workflow',`CREATE TABLE IF NOT EXISTS order_workflow(order_id TEXT PRIMARY KEY,original_bill REAL NOT NULL,receipt_failures INTEGER NOT NULL DEFAULT 0,replacement_uploaded INTEGER NOT NULL DEFAULT 0,resubmission_requested INTEGER NOT NULL DEFAULT 0,edit_request TEXT,edit_state TEXT NOT NULL DEFAULT '',cancellation_requested INTEGER NOT NULL DEFAULT 0,refund_method TEXT NOT NULL DEFAULT 'credits',refund_credited_cents INTEGER NOT NULL DEFAULT 0,refund_restricted_cents INTEGER NOT NULL DEFAULT 0,external_refund_state TEXT NOT NULL DEFAULT '',external_refund_reference TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL)`],
  ['table','order_workflow_credits',`CREATE TABLE IF NOT EXISTS order_workflow_credits(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,customer_id TEXT NOT NULL,amount_cents INTEGER NOT NULL,restricted_cents INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL,created_at INTEGER NOT NULL)`],
  ['trigger','trg_workflow_items_guard_v1',`CREATE TRIGGER IF NOT EXISTS trg_workflow_items_guard_v1 BEFORE UPDATE OF items ON orders WHEN NEW.items<>OLD.items AND EXISTS(SELECT 1 FROM order_workflow WHERE order_id=NEW.id) BEGIN
    SELECT CASE WHEN lower(OLD.status) NOT IN ('pending','confirmed') OR lower(coalesce(OLD.control_state,'')) IN ('held','failed') OR json_type(NEW.items)<>'array' OR json_array_length(NEW.items)<1 THEN RAISE(ABORT,'Items can only be reduced before Processing') END;
    SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.items) n WHERE json_type(n.value,'$.quantity')<>'integer' OR json_extract(n.value,'$.quantity')<1
      OR (SELECT count(*) FROM json_each(NEW.items) d WHERE ${skuMatch('n','d')})<>1
      OR json_extract(n.value,'$.quantity')>coalesce((SELECT sum(json_extract(o.value,'$.quantity')) FROM json_each(OLD.items) o WHERE ${skuMatch('n','o')}),0)
      OR (SELECT count(*) FROM inventory_reservations r WHERE ${heldSku})<>1
      OR json_extract(n.value,'$.quantity')>coalesce((SELECT sum(r.quantity) FROM inventory_reservations r WHERE ${heldSku}),0)) THEN RAISE(ABORT,'Stock increases or unreserved items require a new order') END;
  END`],
  ['trigger','trg_workflow_items_reserved_v1',`CREATE TRIGGER IF NOT EXISTS trg_workflow_items_reserved_v1 AFTER UPDATE OF items ON orders WHEN NEW.items<>OLD.items AND EXISTS(SELECT 1 FROM order_workflow WHERE order_id=NEW.id) BEGIN
    UPDATE inventory_reservations SET quantity=${newReservedQuantity},status=CASE WHEN ${newReservedQuantity}=0 THEN 'released' ELSE status END,updated_at=unixepoch() WHERE order_id=NEW.id AND status<>'released';
  END`],
  ['trigger','trg_workflow_credit_v1',`CREATE TRIGGER IF NOT EXISTS trg_workflow_credit_v1 AFTER INSERT ON order_workflow_credits BEGIN
    UPDATE customers SET store_credits=round(coalesce(store_credits,0)*100+NEW.amount_cents)/100.0,
      received_transfer_balance=round(coalesce(received_transfer_balance,0)*100+NEW.restricted_cents)/100.0,updated_at=unixepoch() WHERE id=NEW.customer_id AND store_credits_operation_id IS NULL;
    SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'Customer credit ledger is busy; retry after checkout completes') END;
    INSERT INTO point_transactions(id,user_id,type,amount,order_id,description,created_at) VALUES(NEW.id,NEW.customer_id,'store_credit_refund',NEW.amount_cents/100.0,NEW.order_id,NEW.reason,unixepoch());
    UPDATE order_workflow SET refund_credited_cents=refund_credited_cents+NEW.amount_cents,refund_restricted_cents=refund_restricted_cents+NEW.restricted_cents,updated_at=unixepoch() WHERE order_id=NEW.order_id;
  END`],
  ['trigger','trg_workflow_failure_v1',`CREATE TRIGGER IF NOT EXISTS trg_workflow_failure_v1 AFTER UPDATE OF payment_status ON orders WHEN lower(NEW.payment_status)='failed' AND lower(coalesce(OLD.payment_status,''))<>'failed' AND EXISTS(SELECT 1 FROM order_workflow WHERE order_id=NEW.id) BEGIN
    SELECT CASE WHEN lower(OLD.status)<>'pending' OR trim(coalesce(OLD.payment_proof_image,''))='' OR lower(coalesce(OLD.control_state,''))='held' THEN RAISE(ABORT,'Receipt is not awaiting staff validation') END;
    UPDATE order_workflow SET receipt_failures=receipt_failures+1,resubmission_requested=0,updated_at=unixepoch() WHERE order_id=NEW.id AND receipt_failures<2;
    SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'Receipt validation already failed twice') END;
    UPDATE orders SET status=CASE WHEN (SELECT receipt_failures FROM order_workflow WHERE order_id=NEW.id)>=2 THEN 'Cancelled' ELSE 'Pending' END,
      control_state=CASE WHEN (SELECT receipt_failures FROM order_workflow WHERE order_id=NEW.id)>=2 THEN 'cancelled' ELSE 'failed' END,
      review_status=CASE WHEN (SELECT receipt_failures FROM order_workflow WHERE order_id=NEW.id)>=2 THEN 'Second Receipt Failed — Payment Revalidation Required' ELSE 'Receipt Failed — One Resubmission Available' END WHERE id=NEW.id;
  END`],
  ['trigger','trg_workflow_receipt_guard_v1',`CREATE TRIGGER IF NOT EXISTS trg_workflow_receipt_guard_v1 BEFORE UPDATE OF payment_proof_image ON orders WHEN trim(coalesce(OLD.payment_proof_image,''))<>'' AND NEW.payment_proof_image<>OLD.payment_proof_image AND EXISTS(SELECT 1 FROM order_workflow WHERE order_id=NEW.id) BEGIN
    SELECT CASE WHEN lower(OLD.status)<>'pending' OR lower(OLD.payment_status)<>'failed' OR lower(coalesce(OLD.control_state,''))<>'held'
      OR NOT EXISTS(SELECT 1 FROM order_workflow w JOIN order_receipt_deadlines d ON d.order_id=w.order_id WHERE w.order_id=NEW.id AND w.receipt_failures=1 AND w.replacement_uploaded=0 AND w.resubmission_requested=1 AND d.expires_at>unixepoch())
      THEN RAISE(ABORT,'Only one staff-requested replacement receipt is allowed') END;
  END`],
  ['trigger','trg_workflow_receipt_saved_v1',`CREATE TRIGGER IF NOT EXISTS trg_workflow_receipt_saved_v1 AFTER UPDATE OF payment_proof_image ON orders WHEN trim(coalesce(OLD.payment_proof_image,''))<>'' AND NEW.payment_proof_image<>OLD.payment_proof_image AND EXISTS(SELECT 1 FROM order_workflow WHERE order_id=NEW.id) BEGIN
    UPDATE order_workflow SET replacement_uploaded=1,resubmission_requested=0,updated_at=unixepoch() WHERE order_id=NEW.id;
    UPDATE orders SET control_state='resubmitted',review_status='Replacement Receipt Pending Payment Validation' WHERE id=NEW.id;
  END`],
  ['trigger','trg_workflow_guard_v1',`CREATE TRIGGER IF NOT EXISTS trg_workflow_guard_v1 BEFORE UPDATE OF status,total_amount ON orders WHEN EXISTS(SELECT 1 FROM order_workflow WHERE order_id=NEW.id) BEGIN
    SELECT CASE WHEN NEW.total_amount>OLD.total_amount+0.005 THEN RAISE(ABORT,'A bill increase requires a new order') END;
    SELECT CASE WHEN (${gross})>(${gross.replace(/NEW\./g,'OLD.')})+0.005 THEN RAISE(ABORT,'A bill increase requires a new order') END;
    SELECT CASE WHEN NEW.status<>OLD.status AND lower(NEW.status)='processing' AND (lower(OLD.status)<>'confirmed' OR lower(NEW.payment_status)<>'paid') THEN RAISE(ABORT,'Verify payment before Processing') END;
    SELECT CASE WHEN NEW.status<>OLD.status AND lower(NEW.status)='ready' AND (lower(OLD.status)<>'processing' OR lower(NEW.payment_status)<>'paid') THEN RAISE(ABORT,'Only paid Processing orders can be Ready') END;
    SELECT CASE WHEN NEW.status<>OLD.status AND lower(NEW.status)='dispatched' AND (lower(OLD.status) NOT IN ('ready','packed') OR lower(NEW.payment_status)<>'paid' OR coalesce(NEW.tracking_url,'') NOT LIKE 'https://%') THEN RAISE(ABORT,'A paid Ready order and tracking link are required') END;
    SELECT CASE WHEN NEW.status<>OLD.status AND lower(NEW.status)='completed' AND (lower(OLD.status)<>'dispatched' OR lower(NEW.payment_status)<>'paid') THEN RAISE(ABORT,'Only paid Dispatched orders can complete') END;
    SELECT CASE WHEN NEW.status<>OLD.status AND lower(NEW.status)='cancelled' AND lower(OLD.status) IN ('dispatched','completed','delivered') THEN RAISE(ABORT,'Dispatched orders cannot be cancelled') END;
  END`],
  ['trigger','trg_workflow_refund_v1',`CREATE TRIGGER IF NOT EXISTS trg_workflow_refund_v1 AFTER UPDATE OF payment_status,status,total_amount,payment_received_amount ON orders WHEN lower(NEW.payment_status)='paid' AND EXISTS(SELECT 1 FROM order_workflow WHERE order_id=NEW.id) BEGIN
    INSERT INTO order_workflow_credits(id,order_id,customer_id,amount_cents,restricted_cents,reason,created_at)
      SELECT 'workflow-refund:'||NEW.id||':'||CAST(round((${desired})*100) AS INTEGER),NEW.id,NEW.customer_id,
      CAST(round((${desired})*100) AS INTEGER)-refund_credited_cents,
      min(CAST(round((${desired})*100) AS INTEGER)-refund_credited_cents,max(0,CAST(round((${restrictedDesired})*100) AS INTEGER)-refund_restricted_cents)),
      'Store Credit Refund for Verified Order #'||coalesce(NEW.order_number,NEW.id),unixepoch()
      FROM order_workflow WHERE order_id=NEW.id AND CAST(round((${desired})*100) AS INTEGER)>refund_credited_cents ON CONFLICT(id) DO NOTHING;
    UPDATE order_workflow SET external_refund_state=CASE WHEN lower(NEW.status)='cancelled' AND refund_method='original' AND external_refund_state='' THEN 'pending' ELSE external_refund_state END,updated_at=unixepoch() WHERE order_id=NEW.id;
  END`],
  ['trigger','trg_workflow_cancel_cleanup_v1',`CREATE TRIGGER IF NOT EXISTS trg_workflow_cancel_cleanup_v1 AFTER UPDATE OF status ON orders WHEN lower(NEW.status)='cancelled' AND lower(OLD.status)<>'cancelled' AND EXISTS(SELECT 1 FROM order_workflow WHERE order_id=NEW.id) BEGIN
    UPDATE order_workflow SET cancellation_requested=0,resubmission_requested=0,edit_state=CASE WHEN edit_state='pending' THEN 'cancelled' ELSE edit_state END,updated_at=unixepoch() WHERE order_id=NEW.id;
    UPDATE inventory_reservations SET status='released',updated_at=unixepoch() WHERE order_id=NEW.id AND status<>'released';
    UPDATE promo_claims SET status='released',updated_at=unixepoch() WHERE order_id=NEW.id AND status IN ('held','redeemed');
    UPDATE orders SET referral_points_status=CASE WHEN referral_points_status LIKE 'pending%' THEN 'cancelled' ELSE referral_points_status END WHERE id=NEW.id;
  END`],
];

let workflowInitialized=false;
export async function ensureOrderWorkflow() {
  if(workflowInitialized)return;
  const columns=new Set((await db.all("SELECT name FROM pragma_table_info('orders')")).map(row=>row.name));
  for(const [name,type] of orderWorkflowColumns)if(!columns.has(name)) {
    try {await db.run(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);}
    catch(error){if(!await db.get("SELECT name FROM pragma_table_info('orders') WHERE name=:name",{':name':name}))throw error;}
  }
  const customerColumns=new Set((await db.all("SELECT name FROM pragma_table_info('customers')")).map(row=>row.name));
  for(const [name,type] of customerWorkflowColumns)if(!customerColumns.has(name)) {
    try{await db.run(`ALTER TABLE customers ADD COLUMN ${name} ${type}`);}
    catch(error){if(!await db.get("SELECT name FROM pragma_table_info('customers') WHERE name=:name",{':name':name}))throw error;}
  }
  for(const [type,name,definition] of workflowDefinitions) {
    if(!await db.get('SELECT name FROM sqlite_master WHERE type=:type AND name=:name',{':type':type,':name':name})) {
      try {await db.run(definition);}catch(error){if(!await db.get('SELECT name FROM sqlite_master WHERE type=:type AND name=:name',{':type':type,':name':name}))throw error;}
    }
  }
  workflowInitialized=true;
}
export async function workflowFor(order) {
  await ensureOrderWorkflow();
  const existing=await db.get('SELECT * FROM order_workflow WHERE order_id=:id',{':id':String(order.id)});
  if(existing)return existing;
  await db.run(`INSERT INTO order_workflow(order_id,original_bill,refund_credited_cents,updated_at)
    SELECT :id,:bill,CAST(round(coalesce(sum(CASE WHEN type IN ('store_credit_refund','store_credit_received') AND (id LIKE 'credit-received-%' OR id LIKE 'credit-ready-%' OR id LIKE 'refund-ledger:%') THEN amount ELSE 0 END),0)*100) AS INTEGER),unixepoch()
    FROM point_transactions WHERE order_id=:id ON CONFLICT(order_id) DO NOTHING`,{':id':String(order.id),':bill':Number(order.payableNow||0)+Number(order.payableOnDelivery||0)+Number(order.storeCreditsUsed||0)});
  return db.get('SELECT * FROM order_workflow WHERE order_id=:id',{':id':String(order.id)});
}
/** Run from the shared scheduler; the write guard also rejects late uploads between ticks. */
export async function expireReceiptResubmissions({customerId='',limit=20}={}) {
  await ensureOrderWorkflow();
  const result=await db.run(`UPDATE orders SET status='Cancelled',control_state='cancelled',
    review_status='Replacement Receipt Deadline Expired — Payment Revalidation Required',updated_at=unixepoch()
    WHERE id IN (SELECT o.id FROM orders o JOIN order_receipt_deadlines d ON d.order_id=o.id
      JOIN order_workflow w ON w.order_id=o.id
      WHERE lower(o.status)='pending' AND lower(o.payment_status)='failed' AND o.control_state='held'
        AND w.replacement_uploaded=0 AND d.expires_at<=unixepoch()
        AND (:customer='' OR o.customer_id=:customer)
      ORDER BY d.expires_at,o.id LIMIT :limit)
      AND lower(status)='pending' AND lower(payment_status)='failed' AND control_state='held'
      RETURNING id`,{':customer':String(customerId),':limit':Math.max(1,Math.min(100,Number(limit)||20))});
  return {cancelled:Number(result?.rowsAffected)||0};
}
export function workflowStage(order) {
  const status=String(order.status||'').toLowerCase(),control=String(order.controlState||'').toLowerCase();
  return status==='pending'?(control==='held'?'Held':control==='failed'?'Failed':'Pending'):status?status[0].toUpperCase()+status.slice(1):'Pending';
}
export function workflowActions(order) {
  return ({Pending:['review','modify','cancel'],Confirmed:['processing','modify','cancel'],Failed:['hold','cancel'],Held:['resubmit','review','cancel'],Processing:['ready','cancel'],Ready:['dispatch','cancel'],Packed:['dispatch','cancel'],Dispatched:['complete'],Cancelled:['revalidate']}[workflowStage(order)]||[]);
}
export async function attachWorkflow(order,staff=false) {
  const flow=await workflowFor(order);
  const deadline=await db.get('SELECT expires_at FROM order_receipt_deadlines WHERE order_id=:id',{':id':String(order.id)});
  let edit=null;try{edit=flow.edit_request?JSON.parse(flow.edit_request):null;}catch{}
  return {stage:workflowStage(order),...(staff?{actions:workflowActions(order),editRequest:edit}:{}),receiptFailures:Number(flow.receipt_failures),replacementUploaded:Boolean(flow.replacement_uploaded),resubmitExpiresAt:deadline?Number(deadline.expires_at)*1000:null,canResubmit:workflowStage(order)==='Held'&&Number(flow.receipt_failures)===1&&!flow.replacement_uploaded&&Boolean(flow.resubmission_requested)&&Number(deadline?.expires_at)>Math.floor(Date.now()/1000),editState:flow.edit_state,cancellationRequested:Boolean(flow.cancellation_requested),refundMethod:flow.refund_method,refundedCredits:Number(flow.refund_credited_cents)/100,externalRefundState:flow.external_refund_state,externalRefundReference:flow.external_refund_reference};
}
export async function applyWorkflowAction(order,action,input={}) {
  const flow=await workflowFor(order),id=String(order.id),stage=workflowStage(order);
  const params={':id':id,':status':String(order.status),':payment':String(order.paymentStatus||'')};
  if(action==='rejectCancellation') {
    await db.run("UPDATE order_workflow SET cancellation_requested=0,updated_at=unixepoch() WHERE order_id=:id",{':id':id});
    return {success:true,orderId:id};
  }
  if(action==='recordOriginalRefund') {
    const reference=String(input.reference||'').trim();
    if(stage==='Cancelled'&&flow.external_refund_state==='submitted'&&flow.external_refund_reference===reference)return {success:true,orderId:id,alreadyRecorded:true};
    if(stage!=='Cancelled'||flow.external_refund_state!=='pending'||reference.length<6||reference.length>160)fail('Record the provider refund reference only after processing the refund with the provider.');
    const changed=await db.run("UPDATE order_workflow SET external_refund_state='submitted',external_refund_reference=:reference,updated_at=unixepoch() WHERE order_id=:id AND external_refund_state='pending'",{':id':id,':reference':reference});
    if(!Number(changed?.rowsAffected))fail('The refund changed. Refresh before recording its reference.','ORDER_CHANGED');
    return {success:true,orderId:id};
  }
  if(action==='confirmPayment'||action==='revalidatePayment') {
    if(input.providerVerified!==true)fail('Confirm that the transaction was verified directly with the payment provider.','PROVIDER_CONFIRMATION_REQUIRED');
    const amount=Number(input.confirmedAmount),cents=Math.round(amount*100),due=Math.round(Number(order.payableNow??order.totalAmount??0)*100);
    if(!Number.isFinite(amount)||amount<0||!Number.isSafeInteger(cents)||Math.abs(amount*100-cents)>0.00001)fail('Enter the exact provider-confirmed amount with at most two decimal places.','INVALID_AMOUNT');
    if(String(order.paymentStatus).toLowerCase()==='paid') {
      if(cents!==Math.round(Number(order.paymentReceivedAmount??order.confirmedPaidAmount??0)*100))fail('Payment was already verified for a different amount.','PAYMENT_CONFLICT');
      if(action==='revalidatePayment'&&flow.refund_method!==(input.refundMethod==='original'?'original':'credits'))fail('This refund was already committed using another method.','REFUND_METHOD_CONFLICT');
      return {success:true,orderId:id,alreadyApproved:true};
    }
    const cancelled=action==='revalidatePayment';
    if(cancelled&&due>0&&cents===0)fail('No provider payment was received. Do not confirm payment or issue a cash refund.','PAYMENT_NOT_RECEIVED');
    if(cancelled&&input.refundMethod==='original'&&cents===0)fail('There is no external payment to return. Select Store Credits for an internally funded order.','NO_EXTERNAL_PAYMENT');
    if((cancelled?stage!=='Cancelled':stage!=='Pending')||!String(order.paymentProofImage||'').trim())fail('A submitted receipt awaiting payment validation is required.');
    if(!cancelled&&(!['pending review','unpaid'].includes(String(order.paymentStatus).toLowerCase())||flow.edit_state==='pending'||flow.cancellation_requested))fail('Resolve outstanding requests before confirming payment.');
    if(!cancelled&&cents<due)fail('The verified payment is below the store amount due.','PAYMENT_SHORT');
    const method=cancelled&&input.refundMethod==='original'?'original':'credits';
    if(cancelled&&Number(flow.refund_credited_cents)>0)fail('A refund was already issued; review the ledger instead of changing its method.');
    // Lock the refund method before payment changes; the payment write below is guarded by this value.
    if(cancelled)await db.run("UPDATE order_workflow SET refund_method=:method,updated_at=unixepoch() WHERE order_id=:id AND EXISTS(SELECT 1 FROM orders WHERE id=:id AND status=:status AND payment_status=:payment)",{...params,':method':method});
    const result=await db.run(`UPDATE orders SET payment_status='Paid',status=:next,confirmed_paid_amount=:due,payment_received_amount=:received,
      review_status='Provider Payment Verified',requires_manual_review=0,updated_at=unixepoch()
      WHERE id=:id AND status=:status AND payment_status=:payment AND payment_proof_image=:proof
      AND coalesce(staff_edit_version,0)=:version
      AND EXISTS(SELECT 1 FROM order_workflow WHERE order_id=:id AND refund_method=:method
        AND (:cancelled=1 OR (edit_state<>'pending' AND cancellation_requested=0))) RETURNING id`,
      {...params,':next':cancelled?'Cancelled':'Confirmed',':due':due/100,':received':cents/100,':proof':order.paymentProofImage,':version':Number(order.staffEditVersion||0),':method':method,':cancelled':cancelled?1:0});
    if(!Number(result?.rowsAffected))fail('The order changed. Refresh before verifying payment.','ORDER_CHANGED');
    return {success:true,orderId:id,status:cancelled?'Cancelled':'Confirmed',paymentStatus:'Paid',refundMethod:method};
  }
  if(action==='requestCancel') {
    if(!['Pending','Confirmed','Failed','Held','Processing'].includes(stage))fail('Cancellation is available only before Ready.');
    const changed=await db.run(`UPDATE order_workflow SET cancellation_requested=1,updated_at=unixepoch() WHERE order_id=:id AND EXISTS(SELECT 1 FROM orders WHERE id=:id AND status=:status AND payment_status=:payment)`,params);
    if(!Number(changed?.rowsAffected))fail('The order changed. Refresh and retry.','ORDER_CHANGED');
    return {success:true,orderId:id,status:order.status,cancellationRequested:true};
  }
  if(action==='requestEdit') {
    if(!['Pending','Confirmed'].includes(stage))fail('Editing is unavailable after Processing or while payment is held.');
    await db.run(`UPDATE order_workflow SET edit_request=:request,edit_state='pending',updated_at=unixepoch() WHERE order_id=:id AND EXISTS(SELECT 1 FROM orders WHERE id=:id AND status=:status AND payment_status=:payment AND coalesce(staff_edit_version,0)=:version)`,{...params,':request':JSON.stringify(input.edit),':version':Number(input.expectedVersion)});
    const saved=await db.get('SELECT edit_request FROM order_workflow WHERE order_id=:id',{':id':id});
    if(saved?.edit_request!==JSON.stringify(input.edit))fail('The order changed. Refresh before editing.','ORDER_CHANGED');
    return {success:true,orderId:id,requestPending:true};
  }
  let query,extra={};
  if(action==='failReceipt') {
    if(!['Pending','Held'].includes(stage)||!order.paymentProofImage||String(order.paymentStatus).toLowerCase()!=='pending review')fail('Only a receipt awaiting validation can fail review.');
    query="UPDATE orders SET payment_status='Failed',requires_manual_review=1,updated_at=unixepoch() WHERE id=:id AND status=:status AND payment_status=:payment AND payment_proof_image=:proof RETURNING id";extra={':proof':order.paymentProofImage};
  } else if(action==='hold') {
    if(stage!=='Failed'||Number(flow.receipt_failures)!==1)fail('Hold is available after the first failed receipt.');
    query="UPDATE orders SET control_state='held',review_status='On Hold — Replacement Receipt Required',updated_at=unixepoch() WHERE id=:id AND status=:status AND payment_status=:payment AND control_state='failed' RETURNING id";
  } else if(action==='resubmit') {
    if(stage!=='Held'||Number(flow.receipt_failures)!==1||flow.replacement_uploaded)fail('The single replacement receipt has already been used.');
    await db.run(`INSERT INTO order_receipt_deadlines(order_id,requested_at,expires_at)
      SELECT :id,unixepoch(),unixepoch()+3600 WHERE EXISTS(SELECT 1 FROM orders o JOIN order_workflow w ON w.order_id=o.id
      WHERE o.id=:id AND lower(o.status)='pending' AND lower(o.payment_status)='failed' AND o.control_state='held' AND w.receipt_failures=1 AND w.replacement_uploaded=0)
      ON CONFLICT(order_id) DO NOTHING`,{':id':id});
    const deadline=await db.get('SELECT expires_at FROM order_receipt_deadlines WHERE order_id=:id',{':id':id});
    if(!deadline||Number(deadline.expires_at)<=Math.floor(Date.now()/1000))fail('The replacement receipt deadline has expired.','RECEIPT_DEADLINE_EXPIRED');
    const requested=await db.run("UPDATE order_workflow SET resubmission_requested=1,updated_at=unixepoch() WHERE order_id=:id AND receipt_failures=1 AND replacement_uploaded=0 AND EXISTS(SELECT 1 FROM orders WHERE id=:id AND lower(status)='pending' AND lower(payment_status)='failed' AND control_state='held') AND EXISTS(SELECT 1 FROM order_receipt_deadlines WHERE order_id=:id AND expires_at>unixepoch())",{':id':id});
    if(!Number(requested?.rowsAffected))fail('The order changed or its receipt deadline expired.','ORDER_CHANGED');
    return {success:true,orderId:id,status:order.status,resubmitExpiresAt:Number(deadline.expires_at)*1000};
  } else if(action==='processing') {
    if(stage!=='Confirmed'||String(order.paymentStatus).toLowerCase()!=='paid'||flow.edit_state==='pending'||flow.cancellation_requested)fail('Resolve edit/cancellation requests and confirm payment before Processing.');
    query="UPDATE orders SET status='Processing',updated_at=unixepoch() WHERE id=:id AND status=:status AND payment_status=:payment AND EXISTS(SELECT 1 FROM order_workflow WHERE order_id=:id AND edit_state<>'pending' AND cancellation_requested=0) RETURNING id";
  } else if(action==='cancel') {
    if(!workflowActions(order).includes('cancel'))fail('This order cannot be cancelled.');
    if(String(input.reason||'').trim().length<8)fail('Enter a cancellation reason of at least 8 characters.','REASON_REQUIRED');
    query="UPDATE orders SET status='Cancelled',review_status=:reason,updated_at=unixepoch() WHERE id=:id AND status=:status AND payment_status=:payment RETURNING id";extra={':reason':String(input.reason).trim().slice(0,500)};
  } else if(action==='approveCustomerEdit'||action==='rejectCustomerEdit') {
    if(flow.edit_state!=='pending'||!['Pending','Confirmed'].includes(stage))fail('No editable customer request is awaiting approval.');
    if(action==='rejectCustomerEdit'){await db.run("UPDATE order_workflow SET edit_state='rejected',updated_at=unixepoch() WHERE order_id=:id AND edit_state='pending' AND edit_request=:request",{':id':id,':request':flow.edit_request});return {success:true,orderId:id};}
    const edit=JSON.parse(flow.edit_request);
    query="UPDATE orders SET delivery_address=:address,customer_name=:name,customer_phone=:phone,staff_edit_version=coalesce(staff_edit_version,0)+1,updated_at=unixepoch() WHERE id=:id AND status=:status AND payment_status=:payment AND coalesce(staff_edit_version,0)=:version AND EXISTS(SELECT 1 FROM order_workflow WHERE order_id=:id AND edit_state='pending' AND edit_request=:request) RETURNING id";
    extra={':address':JSON.stringify(edit.deliveryAddress),':name':edit.receiverName,':phone':edit.receiverPhone,':version':Number(edit.expectedVersion),':request':flow.edit_request};
  } else fail('Unsupported workflow action.','INVALID_ACTION');
  const result=await db.run(query,{...params,...extra});
  if(!Number(result?.rowsAffected))fail('The order changed. Refresh and retry.','ORDER_CHANGED');
  if(action==='approveCustomerEdit')await db.run("UPDATE order_workflow SET edit_state='approved',updated_at=unixepoch() WHERE order_id=:id AND edit_request=:request",{':id':id,':request':flow.edit_request});
  return {success:true,orderId:id};
}
