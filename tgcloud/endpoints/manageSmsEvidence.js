import { db, EndpointError } from 'sdk';
import { fetch } from 'sdk/fetch';
import { eq } from 'sdk/db';
import { orders, systemSettings } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';
import { scanReceipt } from '../lib/receipt-ocr.js';
import { comparePaymentEvidence, moneyCents } from '../lib/payment-evidence.js';
import getMediaContent from './getMediaContent.js';
const ORIGIN='https://prime-media-gateway.pages.dev';
function object(value){if(value&&typeof value==='object')return value;try{return JSON.parse(value||'{}')}catch{return {}}}
async function bridgeKey(){const row=await db.select({value:systemSettings.value}).from(systemSettings).where(eq(systemSettings.key,'sms_bridge_service_key')).get();const value=object(row?.value);return typeof row?.value==='string'&&!row.value.startsWith('{')?row.value:String(value.key||'');}
async function receiptImage(order,ctx){
 const proof=String(order.paymentProofImage||'');
 const id=proof.startsWith('inline-payment-proof:')?'order-payment-proof:'+order.id:proof.startsWith('tgmedia:')?proof.slice(8):'';
 if(!id)throw new EndpointError('This order has no supported saved receipt image.',{code:'RECEIPT_NOT_FOUND'});
 const parts=[];let contentType='';
 for(let index=0;index<8;index++){
  const part=await getMediaContent({id,chunkIndex:index},ctx);
  if(index===0){contentType=part.contentType;if(part.size>900000||part.chunkCount>8)throw new EndpointError('Receipt is too large for text extraction.',{code:'RECEIPT_TOO_LARGE'});}
  if(part.contentType!==contentType||!part.base64)throw new EndpointError('Incomplete receipt transfer.',{code:'RECEIPT_READ_FAILED'});
  parts.push(part.base64);if(index===part.chunkCount-1)return {data:parts.join('').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),contentType};
 }
 throw new EndpointError('Incomplete receipt image.',{code:'RECEIPT_READ_FAILED'});
}
export default async function(input,ctx){
 const staff=await requireAdmin(ctx),action=String(input?.action||'status');
 const key=await bridgeKey();
 if(action==='status')return {configured:Boolean(key),sender:'MayaBiz'};
 if(!['check','get'].includes(action))throw new EndpointError('Unsupported SMS evidence action.',{code:'INVALID_ACTION'});
 const id=String(input.orderId||'');
 if(!id||id.length>128)throw new EndpointError('Choose an order.',{code:'INVALID_ORDER'});
 const order=await db.select().from(orders).where(eq(orders.id,id)).get();
 if(!order)throw new EndpointError('Order not found.',{code:'NOT_FOUND'});
 let analysis=object(order.ocrAnalysis);
 if(action==='get')return {receipt:analysis.paymentEvidence||null,result:analysis.smsEvidence||null};
 const image=await receiptImage(order,ctx);
 const scan=await scanReceipt(image.data,image.contentType,String(order.customerId||'staff:'+staff.id));
 analysis={...analysis,...scan};
 let result={status:key?'no_sms_match':'bridge_not_configured',matched:false,requiresManualReview:true};
 const receipt=scan.paymentEvidence;
 if(!receipt.reference)result={status:receipt.status||'receipt_reference_unreadable',matched:false,requiresManualReview:true};
 else if(key){
  const response=await fetch(ORIGIN+'/sms/match',{method:'POST',headers:{'Content-Type':'application/json','X-Prime-Sms-Service':key,'User-Agent':'PRIME-Payment-Evidence/1.0'},body:JSON.stringify({type:receipt.referenceType,value:receipt.reference})});
  if(!response.ok)throw new EndpointError('SMS bridge is unavailable. Receipt remains for staff review.',{code:'SMS_BRIDGE_UNAVAILABLE'});
  const data=await response.json(),expected=moneyCents(Number(order.payableNow??order.totalAmount).toFixed(2));
  const candidates=(Array.isArray(data.events)?data.events:[]).map(event=>({event,comparison:comparePaymentEvidence(receipt,event,expected)}));
  const matches=candidates.filter(item=>item.comparison.matched);
  if(data.truncated||matches.length>1)result={status:'ambiguous_sms_matches',matched:false,requiresManualReview:true};
  else if(matches.length===1){
   const {event,comparison}=matches[0];
   await db.run(`CREATE TABLE IF NOT EXISTS payment_sms_links (
     event_id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE,image_sha256 TEXT NOT NULL,
     reference_type TEXT NOT NULL,reference_value TEXT NOT NULL,matched_at INTEGER NOT NULL)`);
   await db.run(`INSERT OR IGNORE INTO payment_sms_links VALUES (:event,:order,:hash,:type,:ref,unixepoch())`,{':event':event.id,':order':id,':hash':scan.receiptImageSha256,':type':receipt.referenceType,':ref':receipt.reference});
   const linked=await db.get('SELECT order_id AS orderId,image_sha256 AS imageSha256 FROM payment_sms_links WHERE event_id=:id',{':id':event.id});
   result=linked?.orderId===id&&linked.imageSha256===scan.receiptImageSha256
    ?{...comparison,eventId:event.id,sms:{sender:event.sender,qrPhInvoice:event.qrPhInvoice,mayaTrn:event.mayaTrn,amountCents:event.amountCents,paidAt:event.paidAt,receivedAt:event.receivedAt},checkedAt:new Date().toISOString()}
    :{status:'sms_already_linked_or_receipt_changed',matched:false,requiresManualReview:true};
  }else if(candidates.length)result={status:candidates[0].comparison.status,matched:false,requiresManualReview:true};
 }
 const persisted={...analysis,smsEvidence:result,requiresManualReview:true};
 const saved=await db.run(`UPDATE orders SET ocr_analysis=:analysis,updated_at=unixepoch() WHERE id=:id AND payment_proof_image=:proof RETURNING id`,{':analysis':JSON.stringify(persisted),':id':id,':proof':order.paymentProofImage});
 if(!Number(saved?.rowsAffected))throw new EndpointError('The receipt changed. Reopen the order and check again.',{code:'RECEIPT_CHANGED'});
 // Corroboration never changes paid status, received amounts, credits or inventory.
 return {receipt,result};
}
