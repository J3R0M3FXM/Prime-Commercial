"use client";
import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Send, X } from 'lucide-react';
import { callServerless, resolveTelegramMedia } from '@/lib/telegram-serverless-client';
import { createPosInvoiceImage, type PosInvoice } from '@/lib/pos-invoice-image';

type Prepared = {sessionId:string;invoice:PosInvoice;route:'business'|'bot';sent:boolean;messageId?:number};
export default function PosInvoiceDialog({orderNumber,paymentMethodId,onClose}:{orderNumber:string;paymentMethodId:string;onClose:()=>void}) {
  const [recipient,setRecipient]=useState<'customer'|'admin'|null>(null);
  const [preview,setPreview]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [sent,setSent]=useState<Partial<Record<'customer'|'admin',boolean>>>({});
  const [uncertain,setUncertain]=useState<Partial<Record<'customer'|'admin',boolean>>>({});
  const sending=useRef(false);
  useEffect(()=>{
    let current=true,url='';
    setPreview('');setError('');setSent({});setUncertain({});
    void (async()=>{
      let previewRecipient:'customer'|'admin'='customer';
      let result:Prepared;
      try{result=await callServerless<Prepared>('sendPosInvoice',{action:'prepare',orderNumber,paymentMethodId,recipient:previewRecipient},30000);}
      catch{previewRecipient='admin';result=await callServerless<Prepared>('sendPosInvoice',{action:'prepare',orderNumber,paymentMethodId,recipient:previewRecipient},30000);}
      const qr=result.invoice.payment.qrCodeImage ? await resolveTelegramMedia(result.invoice.payment.qrCodeImage) : '';
      const blob=await createPosInvoiceImage(result.invoice,qr);
      if(!current)return;
      url=URL.createObjectURL(blob);setPreview(url);setSent({[previewRecipient]:result.sent});
    })().catch(err=>{if(current)setError(err?.message||'Could not prepare the invoice.');});
    return()=>{current=false;if(url)URL.revokeObjectURL(url);};
  },[orderNumber,paymentMethodId]);
  const send=async(target:'customer'|'admin')=>{
    if(sending.current||sent[target]||uncertain[target])return;
    sending.current=true;setRecipient(target);setBusy(true);setError('');let deliveryStarted=false;
    try{
      const delivery=await callServerless<Prepared>('sendPosInvoice',{action:'prepare',orderNumber,paymentMethodId,recipient:target},30000);
      if(delivery.sent){setSent(value=>({...value,[target]:true}));return;}
      const qr=delivery.invoice.payment.qrCodeImage?await resolveTelegramMedia(delivery.invoice.payment.qrCodeImage):'';
      const blob=await createPosInvoiceImage(delivery.invoice,qr);
      const bytes=new Uint8Array(await blob.arrayBuffer()),size=256*1024,count=Math.ceil(bytes.length/size);
      await callServerless('sendPosInvoice',{action:'start',sessionId:delivery.sessionId,fileSize:bytes.length,chunkCount:count},30000);
      for(let index=0;index<count;index++){
        const part=bytes.subarray(index*size,Math.min((index+1)*size,bytes.length));let binary='';
        for(let offset=0;offset<part.length;offset+=0x8000)binary+=String.fromCharCode(...part.subarray(offset,offset+0x8000));
        const data=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
        await callServerless('sendPosInvoice',{action:'chunk',sessionId:delivery.sessionId,index,data},30000);
      }
      deliveryStarted=true;
      const result=await callServerless<{success:boolean;messageId?:number}>('sendPosInvoice',{action:'send',sessionId:delivery.sessionId},60000);
      if(!result?.success||!result.messageId)throw new Error('Telegram did not confirm invoice delivery.');
      setSent(value=>({...value,[target]:true}));
    }catch(err:any){
      const code=String(err?.parameters?.code || err?.code || '');
      if(deliveryStarted&&!['POS_INVOICE_INVALID','POS_INVOICE_REJECTED'].includes(code)){setUncertain(value=>({...value,[target]:true}));setError('Delivery could not be confirmed. Check the recipient chat before trying again.');}
      else setError(err?.message||'Could not upload the invoice. Try again.');
    }finally{sending.current=false;setBusy(false);}
  };
  return <div className="pos-dialog-backdrop"><section className="pos-dialog pos-invoice-dialog max-w-[430px]" role="dialog" aria-modal="true" aria-label="Customer invoice">
    <button type="button" className="pos-icon pos-dialog-close" aria-label="Close invoice" disabled={busy} onClick={onClose}><X/></button>
    <h2>Customer invoice</h2><p className="pos-hint">Order {orderNumber}</p>
    {error&&<p role="alert" className="pos-message pos-message--error">{error}</p>}
    {!preview&&!error&&<p role="status"><Loader2 className="animate-spin"/>Preparing invoice…</p>}
    {preview&&<><img className="pos-invoice-preview" src={preview} alt={`Invoice for order ${orderNumber}`}/>
      <a className="pos-text-action" href={preview} download={`PRIME-Invoice-${orderNumber}.png`}><Download/>Save image</a>
      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:6}}>
        {(['customer','admin'] as const).map(target=><button key={target} type="button" className="pos-primary pos-wide" onClick={()=>void send(target)} disabled={busy||sent[target]||uncertain[target]}>{busy&&recipient===target?<Loader2 className="animate-spin"/>:<Send/>}{sent[target]?`Invoice sent to ${target}`:busy&&recipient===target?'Sending invoice…':`Send invoice to ${target}`}</button>)}
      </div>
    </>}
  </section></div>;
}
