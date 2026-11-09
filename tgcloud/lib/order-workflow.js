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

export const workflowDefinitions=[
  ['table','order_receipt_deadlines',`CREATE TABLE IF NOT EXISTS order_receipt_deadlines(order_id TEXT PRIMARY KEY,requested_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)`],
  ['table','order_workflow',`CREATE TABLE IF NOT EXISTS order_workflow(order_id TEXT PRIMARY KEY,original_bill REAL NOT NULL,receipt_failures INTEGER NOT NULL DEFAULT 0,replacement_uploaded INTEGER NOT NULL DEFAULT 0,resubmission_requested INTEGER NOT NULL DEFAULT 0,edit_request TEXT,edit_state TEXT NOT NULL DEFAULT '',cancellation_requested INTEGER NOT NULL DEFAULT 0,refund_method TEXT NOT NULL DEFAULT 'credits',refund_credited_cents INTEGER NOT NULL DEFAULT 0,external_refund_state TEXT NOT NULL DEFAULT '',external_refund_reference TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL)`],
  ['table','order_workflow_credits',`CREATE TABLE IF NOT EXISTS order_workflow_credits(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,customer_id TEXT NOT NULL,amount_cents INTEGER NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL)`],
  ['trigger','trg_workflow_credit_v1',`CREATE TRIGGER IF NOT EXISTS trg_workflow_credit_v1 AFTER INSERT ON order_workflow_credits BEGIN
    UPDATE customers SET store_credits=round(coalesce(store_credits,0)*100+NEW.amount_cents)/100.0,updated_at=unixepoch() WHERE id=NEW.customer_id AND store_credits_operation_id IS NULL;
    SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'Customer credit ledger is busy; retry after checkout completes') END;
    INSERT INTO point_transactions(id,user_id,type,amount,order_id,description,created_at) VALUES(NEW.id,NEW.customer_id,'store_credit_refund',NEW.amount_cents/100.0,NEW.order_id,NEW.reason,unixepoch());
    UPDATE order_workflow SET refund_credited_cents=refund_credited_cents+NEW.amount_cents,updated_at=unixepoch() WHERE order_id=NEW.order_id;
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
    SELECT CASE WHEN NEW.status<>OLD.status AND lower(NEW.status)='processing' AND (lower(OLD.status)<>'confirmed' OR lower(NEW.payment_status)<>'paid') THEN RAISE(ABORT,'Verify payment before Processing') END;
    SELECT CASE WHEN NEW.status<>OLD.status AND lower(NEW.status)='ready' AND (lower(OLD.status)<>'processing' OR lower(NEW.payment_status)<>'paid') THEN RAISE(ABORT,'Only paid Processing orders can be Ready') END;
    SELECT CASE WHEN NEW.status<>OLD.status AND lower(NEW.status)='dispatched' AND (lower(OLD.status) NOT IN ('ready','packed') OR lower(NEW.payment_status)<>'paid' OR NEW.tracking_url NOT LIKE 'https://%') THEN RAISE(ABORT,'A paid Ready order and tracking link are required') END;
    SELECT CASE WHEN NEW.status<>OLD.status AND lower(NEW.status)='completed' AND (lower(OLD.status)<>'dispatched' OR lower(NEW.payment_status)<>'paid') THEN RAISE(ABORT,'Only paid Dispatched orders can complete') END;
    SELECT CASE WHEN NEW.status<>OLD.status AND lower(NEW.status)='cancelled' AND lower(OLD.status) IN ('dispatched','completed','delivered') THEN RAISE(ABORT,'Dispatched orders cannot be cancelled') END;
  END`],
  ['trigger','trg_workflow_refund_v1',`CREATE TRIGGER IF NOT EXISTS trg_workflow_refund_v1 AFTER UPDATE OF payment_status,status,total_amount,payment_received_amount ON orders WHEN lower(NEW.payment_status)='paid' AND EXISTS(SELECT 1 FROM order_workflow WHERE order_id=NEW.id) BEGIN
    INSERT INTO order_workflow_credits(id,order_id,customer_id,amount_cents,reason,created_at)
      SELECT 'workflow-refund:'||NEW.id||':'||CAST(round((${desired})*100) AS INTEGER),NEW.id,NEW.customer_id,
      CAST(round((${desired})*100) AS INTEGER)-refund_credited_cents,'Store Credit Refund for Verified Order #'||coalesce(NEW.order_number,NEW.id),unixepoch()
      FROM order_workflow WHERE order_id=NEW.id AND CAST(round((${desired})*100) AS INTEGER)>refund_credited_cents ON CONFLICT(id) DO NOTHING;
    UPDATE order_workflow SET external_refund_state=CASE WHEN lower(NEW.status)='cancelled' AND refund_method='original' AND external_refund_state='' THEN 'pending' ELSE external_refund_state END,updated_at=unixepoch() WHERE order_id=NEW.id;
  END`],
  ['trigger','trg_workflow_cancel_cleanup_v1',`CREATE TRIGGER IF NOT EXISTS trg_workflow_cancel_cleanup_v1 AFTER UPDATE OF status ON orders WHEN lower(NEW.status)='cancelled' AND lower(OLD.status)<>'cancelled' AND EXISTS(SELECT 1 FROM order_workflow WHERE order_id=NEW.id) BEGIN
    UPDATE inventory_reservations SET status='released',updated_at=unixepoch() WHERE order_id=NEW.id AND status<>'released';
    UPDATE promo_claims SET status='released',updated_at=unixepoch() WHERE order_id=NEW.id AND status IN ('held','redeemed');
    UPDATE orders SET referral_points_status=CASE WHEN referral_points_status LIKE 'pending%' THEN 'cancelled' ELSE referral_points_status END WHERE id=NEW.id;
  END`],
];

export async function ensureOrderWorkflow() {
  for(const [type,name,definition] of workflowDefinitions) {
    if(!await db.get('SELECT name FROM sqlite_master WHERE type=:type AND name=:name',{':type':type,':name':name})) {
      try {await db.run(definition);}catch(error){if(!await db.get('SELECT name FROM sqlite_master WHERE type=:type AND name=:name',{':type':type,':name':name}))throw error;}
    }
  }
}
export async function workflowFor(order) {
  await ensureOrderWorkflow();
  await db.run(`INSERT INTO order_workflow(order_id,original_bill,updated_at) VALUES(:id,:bill,unixepoch()) ON CONFLICT(order_id) DO NOTHING`,{':id':String(order.id),':bill':Number(order.payableNow||0)+Number(order.payableOnDelivery||0)+Number(order.storeCreditsUsed||0)});
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
  if(action==='requestCancel') {
    if(!['Pending','Confirmed','Failed','Held','Processing'].includes(stage))fail('Cancellation is available only before Ready.');
    await db.run(`UPDATE order_workflow SET cancellation_requested=1,updated_at=unixepoch() WHERE order_id=:id AND EXISTS(SELECT 1 FROM orders WHERE id=:id AND status=:status AND payment_status=:payment)`,params);
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
    await db.run("UPDATE order_workflow SET resubmission_requested=1,updated_at=unixepoch() WHERE order_id=:id AND receipt_failures=1 AND replacement_uploaded=0 AND EXISTS(SELECT 1 FROM orders WHERE id=:id AND lower(status)='pending' AND lower(payment_status)='failed' AND control_state='held') AND EXISTS(SELECT 1 FROM order_receipt_deadlines WHERE order_id=:id AND expires_at>unixepoch())",{':id':id});
    return {success:true,orderId:id,status:order.status,resubmitExpiresAt:Number(deadline.expires_at)*1000};
  } else if(action==='processing') {
    if(stage!=='Confirmed'||String(order.paymentStatus).toLowerCase()!=='paid'||flow.edit_state==='pending'||flow.cancellation_requested)fail('Resolve edit/cancellation requests and confirm payment before Processing.');
    query="UPDATE orders SET status='Processing',updated_at=unixepoch() WHERE id=:id AND status=:status AND payment_status=:payment RETURNING id";
  } else if(action==='cancel') {
    if(!workflowActions(order).includes('cancel'))fail('This order cannot be cancelled.');
    if(String(input.reason||'').trim().length<8)fail('Enter a cancellation reason of at least 8 characters.','REASON_REQUIRED');
    query="UPDATE orders SET status='Cancelled',review_status=:reason,updated_at=unixepoch() WHERE id=:id AND status=:status AND payment_status=:payment RETURNING id";extra={':reason':String(input.reason).trim().slice(0,500)};
  } else if(action==='approveCustomerEdit'||action==='rejectCustomerEdit') {
    if(flow.edit_state!=='pending'||!['Pending','Confirmed'].includes(stage))fail('No editable customer request is awaiting approval.');
    if(action==='rejectCustomerEdit'){await db.run("UPDATE order_workflow SET edit_state='rejected',updated_at=unixepoch() WHERE order_id=:id AND edit_state='pending'",{':id':id});return {success:true,orderId:id};}
    const edit=JSON.parse(flow.edit_request);
    query="UPDATE orders SET delivery_address=:address,customer_name=:name,customer_phone=:phone,staff_edit_version=coalesce(staff_edit_version,0)+1,updated_at=unixepoch() WHERE id=:id AND status=:status AND payment_status=:payment RETURNING id";
    extra={':address':JSON.stringify(edit.deliveryAddress),':name':edit.receiverName,':phone':edit.receiverPhone};
  } else fail('Unsupported workflow action.','INVALID_ACTION');
  const result=await db.run(query,{...params,...extra});
  if(!Number(result?.rowsAffected))fail('The order changed. Refresh and retry.','ORDER_CHANGED');
  if(action==='approveCustomerEdit')await db.run("UPDATE order_workflow SET edit_state='approved',updated_at=unixepoch() WHERE order_id=:id",{':id':id});
  return {success:true,orderId:id};
}
