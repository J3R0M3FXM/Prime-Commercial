import { db, EndpointError } from 'sdk';
import { fetch } from 'sdk/fetch';
import { eq } from 'sdk/db';
import { systemSettings } from '../schema.js';
import { extractReceiptEvidence } from './payment-evidence.js';
export async function ensureReceiptScans() {
  await db.run(`CREATE TABLE IF NOT EXISTS payment_receipt_scans (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, image_sha256 TEXT NOT NULL,
    status TEXT NOT NULL, analysis TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  await db.run(`CREATE INDEX IF NOT EXISTS payment_receipt_scans_customer_time ON payment_receipt_scans(customer_id,created_at)`);
}
export function proofBytes(data) {
  if(typeof data!=='string'||data.length<16||data.length>1250000||data.length%4===1||!/^[A-Za-z0-9_-]+$/.test(data))throw new EndpointError('Invalid receipt image.',{code:'INVALID_RECEIPT_IMAGE'});
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',bytes=new Uint8Array(Math.floor(data.length*3/4));let buffer=0,bits=0,offset=0;
  for(const char of data){buffer=buffer<<6|alphabet.indexOf(char);bits+=6;if(bits>=8){bits-=8;bytes[offset++]=buffer>>bits&255;buffer&=(1<<bits)-1;}}
  if(bits&&buffer)throw new EndpointError('Invalid receipt encoding.',{code:'INVALID_RECEIPT_IMAGE'});
  return bytes.subarray(0,offset);
}
export async function imageHash(data) { const bytes=proofBytes(data);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join(''); }
async function setting(key) {const row=await db.select({value:systemSettings.value}).from(systemSettings).where(eq(systemSettings.key,key)).get();let value=row?.value;if(typeof value==='string'&&value.startsWith('{')){try{value=JSON.parse(value)}catch{}}return value;}
export async function scanReceipt(data,contentType,customerId) {
  if(!['image/jpeg','image/png','image/webp'].includes(contentType))throw new EndpointError('Unsupported receipt format.',{code:'INVALID_RECEIPT_IMAGE'});
  const bytes=proofBytes(data);
  if(contentType==='image/jpeg'&&(bytes[0]!==255||bytes[1]!==216))throw new EndpointError('Receipt is not a JPEG image.',{code:'INVALID_RECEIPT_IMAGE'});
  const hash=await imageHash(data),id=String(customerId)+':'+hash;
  await ensureReceiptScans();
  const old=await db.get('SELECT status,analysis,updated_at AS updatedAt FROM payment_receipt_scans WHERE id=:id',{':id':id});
  if(old?.status==='complete'){try{return JSON.parse(old.analysis)}catch{}}
  if(old&&Number(old.updatedAt)>Date.now()/1000-90)throw new EndpointError('Receipt scan is already running or was recently attempted. Try again shortly.',{code:'RECEIPT_SCAN_BUSY'});
  const selected=await setting('receipt_ocr_provider');
  const provider=String(selected?.provider||'ocr_space');
  const secret=await setting(provider==='taggun'?'receipt_ocr_taggun_api_key':'receipt_ocr_space_api_key');
  const key=typeof secret==='string'?secret:String(secret?.apiKey||'');
  if(!key)throw new EndpointError('Receipt text scanning is not configured. Staff can still review the image.',{code:'OCR_NOT_CONFIGURED'});
  // At most ten new image scans per account per hour; one active request per image.
  const reserved=old?await db.run(`UPDATE payment_receipt_scans SET status='processing',updated_at=unixepoch() WHERE id=:id AND updated_at<=unixepoch()-90 RETURNING id`,{':id':id})
    :await db.run(`INSERT OR IGNORE INTO payment_receipt_scans(id,customer_id,image_sha256,status,created_at,updated_at)
      SELECT :id,:customer,:hash,'processing',unixepoch(),unixepoch()
      WHERE (SELECT count(*) FROM payment_receipt_scans WHERE customer_id=:customer AND created_at>unixepoch()-3600)<10 RETURNING id`,{':id':id,':customer':String(customerId),':hash':hash});
  if(!Number(reserved?.rowsAffected))throw new EndpointError('Receipt scanning is busy or the hourly limit was reached. Staff can review your image.',{code:'OCR_RATE_LIMIT'});
  try {
    const base64=data.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(data.length/4)*4,'=');
    let response;
    if(provider==='taggun')response=await fetch('https://api.taggun.io/api/receipt/v1/verbose/encoded',{method:'POST',headers:{'Content-Type':'application/json',apikey:key},body:JSON.stringify({image:base64,filename:'payment-receipt.'+(contentType==='image/png'?'png':contentType==='image/webp'?'webp':'jpg'),contentType,extractLineItems:false,extractTime:true,incognito:true})});
    else response=await fetch('https://api.ocr.space/parse/image',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',apikey:key},body:'base64Image='+encodeURIComponent('data:'+contentType+';base64,'+base64)+'&OCREngine=2&scale=true&isOverlayRequired=false'});
    if(!response.ok)throw Error('OCR provider did not complete this scan.');
    const result=await response.json();
    const rawText=String(provider==='taggun'?result?.text?.text||'':(result?.ParsedResults||[]).map(row=>row.ParsedText||'').join('\n')).slice(0,40000);
    if(!rawText.trim())throw Error('No readable receipt text was returned.');
    const paymentEvidence=extractReceiptEvidence(rawText);
    const analysis={receiptScanId:id,receiptImageSha256:hash,receiptOcrVerified:true,ocrProvider:provider,ocrStatus:'complete',paymentEvidence,rawSummary:rawText,analyzedAt:new Date().toISOString(),requiresManualReview:true};
    await db.run(`UPDATE payment_receipt_scans SET status='complete',analysis=:analysis,updated_at=unixepoch() WHERE id=:id`,{':id':id,':analysis':JSON.stringify(analysis)});
    return analysis;
  } catch(error) {
    await db.run(`UPDATE payment_receipt_scans SET status='failed',updated_at=unixepoch() WHERE id=:id`,{':id':id});
    throw new EndpointError('Receipt text extraction could not complete. Keep the image for staff review and retry later.',{code:'OCR_FAILED'});
  }
}
export async function bindReceiptAnalysis(data,customerId,client) {
  const base=client&&typeof client==='object'&&!Array.isArray(client)?{...client}:{};
  delete base.paymentEvidence;delete base.smsMatch;delete base.smsEvidence;delete base.receiptOcrVerified;delete base.receiptImageSha256;
  const id=typeof base.receiptScanId==='string'?base.receiptScanId:'';delete base.receiptScanId;Object.assign(base,{paymentEvidence:null,smsEvidence:null,receiptScanId:null,receiptImageSha256:null});
  if(!id)return {...base,receiptOcrVerified:false};
  await ensureReceiptScans();
  const hash=await imageHash(data);
  const row=await db.get(`SELECT analysis FROM payment_receipt_scans WHERE id=:id AND customer_id=:customer AND image_sha256=:hash AND status='complete'`,{':id':id,':customer':String(customerId),':hash':hash});
  if(!row)return {...base,receiptOcrVerified:false};
  let saved;try{saved=JSON.parse(row.analysis)}catch{return {...base,receiptOcrVerified:false}}
  return {...base,...saved};
}
