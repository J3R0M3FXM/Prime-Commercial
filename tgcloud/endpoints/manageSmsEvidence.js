import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { orders, systemSettings } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';
import { scanReceipt } from '../lib/receipt-ocr.js';
import { reconcileOrderSmsEvidence } from '../lib/sms-order-evidence.js';
import getMediaContent from './getMediaContent.js';
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
 if(action==='get')return await reconcileOrderSmsEvidence(id) || {receipt:null,result:{status:'receipt_changed',matched:false,requiresManualReview:true}};
 const image=await receiptImage(order,ctx);
 const scan=await scanReceipt(image.data,image.contentType,String(order.customerId||'staff:'+staff.id));
 analysis={...analysis,...scan};

 const persisted={...analysis,smsEvidence:null,requiresManualReview:true};
 const saved=await db.run(`UPDATE orders SET ocr_analysis=:analysis,updated_at=unixepoch() WHERE id=:id AND payment_proof_image=:proof RETURNING id`,{':analysis':JSON.stringify(persisted),':id':id,':proof':order.paymentProofImage});
 if(!Number(saved?.rowsAffected))throw new EndpointError('The receipt changed. Reopen the order and check again.',{code:'RECEIPT_CHANGED'});
 // Corroboration never changes paid status, received amounts, credits or inventory.
 return await reconcileOrderSmsEvidence(id) || {receipt:scan.paymentEvidence,result:{status:"receipt_changed",matched:false,requiresManualReview:true}};
}
