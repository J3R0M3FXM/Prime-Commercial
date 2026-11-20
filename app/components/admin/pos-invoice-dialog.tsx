"use client";
import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Send, X } from 'lucide-react';
import { callServerless, resolveTelegramMedia } from '@/lib/telegram-serverless-client';
import { createPosInvoiceImage, type PosInvoice } from '@/lib/pos-invoice-image';

type Prepared = {sessionId:string;invoice:PosInvoice;route:'business'|'bot';sent:boolean;messageId?:number};
export default function PosInvoiceDialog({orderNumber,paymentMethodId,onClose}:{orderNumber:string;paymentMethodId:string;onClose:()=>void}) {
  const [recipient,setRecipient]=useState<'customer'|'admin'>('customer');
  const [prepared,setPrepared]=useState<Prepared|null>(null);
  const [preview,setPreview]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [sent,setSent]=useState(false);
  const [uncertain,setUncertain]=useState(false);
  const image=useRef<Blob|null>(null);
  const sending=useRef(false);
  useEffect(()=>{
    let current=true,url='';
    setPrepared(null);setPreview('');setError('');setSent(false);setUncertain(false);
    void (async()=>{
      const result=await callServerless<Prepared>('sendPosInvoice',{action:'prepare',orderNumber,paymentMethodId,recipient},30000);
      const qr=result.invoice.payment.qrCodeImage ? await resolveTelegramMedia(result.invoice.payment.qrCodeImage) : '';
      const blob=await createPosInvoiceImage(result.invoice,qr);
      if(!current)return;
      image.current=blob;url=URL.createObjectURL(blob);setPreview(url);setPrepared(result);setSent(result.sent);
    })().catch(err=>{if(current)setError(err?.message||'Could not prepare the invoice.');});
    return()=>{current=false;image.current=null;if(url)URL.revokeObjectURL(url);};
  },[orderNumber,paymentMethodId,recipient]);
  const send=async()=>{
    if(sending.current||!prepared||!image.current||sent||uncertain)return;
    sending.current=true;setBusy(true);setError('');let deliveryStarted=false;
    try{
      const bytes=new Uint8Array(await image.current.arrayBuffer()),size=256*1024,count=Math.ceil(bytes.length/size);
      await callServerless('sendPosInvoice',{action:'start',sessionId:prepared.sessionId,fileSize:bytes.length,chunkCount:count},30000);
      for(let index=0;index<count;index++){
        const part=bytes.subarray(index*size,Math.min((index+1)*size,bytes.length));let binary='';
        for(let offset=0;offset<part.length;offset+=0x8000)binary+=String.fromCharCode(...part.subarray(offset,offset+0x8000));
        const data=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
        await callServerless('sendPosInvoice',{action:'chunk',sessionId:prepared.sessionId,index,data},30000);
      }
      deliveryStarted=true;
      const result=await callServerless<{success:boolean;messageId?:number}>('sendPosInvoice',{action:'send',sessionId:prepared.sessionId},60000);
      if(!result?.success||!result.messageId)throw new Error('Telegram did not confirm invoice delivery.');
      setSent(true);
    }catch(err:any){
      const code=String(err?.parameters?.code || err?.code || '');
      if(deliveryStarted&&!['POS_INVOICE_INVALID','POS_INVOICE_REJECTED'].includes(code)){setUncertain(true);setError('Delivery could not be confirmed. Check the recipient chat before trying again.');}
      else setError(err?.message||'Could not upload the invoice. Try again.');
    }finally{sending.current=false;setBusy(false);}
  };
  return <div className="pos-dialog-backdrop"><section className="pos-dialog pos-invoice-dialog max-w-[430px]" role="dialog" aria-modal="true" aria-label="Customer invoice">
    <button type="button" className="pos-icon pos-dialog-close" aria-label="Close invoice" disabled={busy} onClick={onClose}><X/></button>
    <h2>Customer invoice</h2><p className="pos-hint">Order {orderNumber}</p>
    <label className="pos-field">Send to<select aria-label="Invoice recipient" value={recipient} disabled={busy} onChange={event=>setRecipient(event.target.value as 'customer'|'admin')}><option value="customer">Customer</option><option value="admin">Admin (me)</option></select></label>
    {error&&<p role="alert" className="pos-message pos-message--error">{error}</p>}
    {!preview&&!error&&<p role="status"><Loader2 className="animate-spin"/>Preparing invoice…</p>}
    {preview&&<><img className="pos-invoice-preview" src={preview} alt={`Invoice for order ${orderNumber}`}/>
      <a className="pos-text-action" href={preview} download={`PRIME-Invoice-${orderNumber}.png`}><Download/>Save image</a>
      <p className="pos-hint">{recipient==='admin'?'Receive in your own PRIME bot chat, then share with the customer. Start the bot first.':prepared?.route==='business'?'Send in your customer’s business chat.':'Send from the PRIME bot.'}</p>
      {sent?<p role="status" className="pos-saving">Invoice sent</p>:<button type="button" className="pos-primary pos-wide" onClick={()=>void send()} disabled={busy||uncertain}>{busy?<Loader2 className="animate-spin"/>:<Send/>}{busy?'Sending invoice…':recipient==='admin'?'Send invoice to admin':'Send invoice to customer'}</button>}
    </>}
  </section></div>;
}
