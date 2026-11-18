export type PosInvoice = {
  reference: string;
  customerName: string;
  customerPhone?: string;
  address?: string;
  createdAt: string;
  paymentStatus: string;
  validUntil?: string;
  items: Array<{ name: string; quantity: number; price: number; total: number }>;
  subtotal: number;
  charges: Array<{ name: string; amount: number }>;
  discounts: Array<{ name: string; amount: number }>;
  deliveryFee: number;
  total: number;
  payableNow: number;
  payableOnDelivery: number;
  payment: { id: string; name: string; qrCodeImage?: string; accountName?: string; accountNumber?: string };
};

const WIDTH = 900;
const money = (value: number) => `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function paymentDeadline(value: string) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Asia/Manila',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h12',
  }).formatToParts(new Date(value)).map(part=>[part.type,part.value]));
  return `${parts.day}-${parts.month.toUpperCase()}-${parts.year} ${parts.hour}:${parts.minute} ${parts.dayPeriod.toUpperCase()}`;
}

function wrapped(ctx: CanvasRenderingContext2D, value: string, width: number) {
  const lines: string[] = [];
  let line = '';
  for (const character of Array.from(String(value || ''))) {
    if (character === '\n' || (line && ctx.measureText(line + character).width > width)) {
      lines.push(line); line = character === '\n' ? '' : character;
    } else line += character;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

type ArtworkImage = CanvasImageSource & { width?: number; height?: number };
export const POS_INVOICE_ARTWORK = {
  logo: '/prime-header-brand-refined.png',
  backgroundTop: '#f5f8fc',
};
export type PosInvoiceArtwork = { logo: ArtworkImage };

/** Use the shopfront's official artwork; keep payment QR pixels on a white panel. */
export function drawPosInvoice(canvas: HTMLCanvasElement, invoice: PosInvoice, qr: ArtworkImage | undefined, artwork: PosInvoiceArtwork) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Invoice image generation is unavailable on this device.');
  if (!invoice.items.length || invoice.items.length > 100) throw new Error('An invoice must contain between 1 and 100 items.');
  if (!artwork?.logo) throw new Error('The official PRIME invoice artwork could not be loaded.');
  const paid = invoice.paymentStatus.toLowerCase() === 'paid';
  const navy = '#011830', blue = '#176dc2', muted = '#526578';
  const date = (value: string) => new Date(value).toLocaleString('en-PH', {timeZone:'Asia/Manila'});
  const render = (draw: boolean) => {
    let y = 44;
    const font = (size: number, bold = false, heading = false) => {
      ctx.font = heading ? `400 ${size}px 'Roboto Condensed', sans-serif` : `${bold ? 700 : 400} ${size}px 'Lato Condensed', 'Lato', sans-serif`;
    };
    const box = (x: number, top: number, width: number, height: number, color: string) => {
      if (draw) {ctx.fillStyle=color;ctx.fillRect(x,top,width,height);}
    };
    const textAt = (value: string, x: number, top: number, size = 28, bold = false, color = navy, align: CanvasTextAlign = 'left', heading = false) => {
      font(size,bold,heading);
      if(draw){ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(value,x,top);}
    };
    const text = (value: string, size = 28, color = navy, centered = false, heading = false) => {
      font(size,false,heading);
      for(const line of wrapped(ctx,value,788)){
        textAt(line,centered?450:56,y,size,false,color,centered?'center':'left',heading);y+=size+8;
      }
    };
    const rule = () => {y+=8;box(56,y,788,1,'#dce4ee');y+=22;};
    const heading = (value: string) => {y+=12;text(value,28,navy,false,true);y+=8;};
    const labelValue = (label: string, value: string) => {
      font(25);
      const lines=wrapped(ctx,value,500);
      textAt(label,56,y,24,false,muted);
      lines.forEach((line,index)=>textAt(line,844,y+index*33,25,false,navy,'right'));
      y+=lines.length*33+8;
    };
    const row = (label: string, value: number, emphasized = false) => {
      font(emphasized?32:28,emphasized);
      const lines=wrapped(ctx,label,470),height=Math.max(44,lines.length*34+8);
      if(emphasized)box(44,y-10,812,height+10,'#eaf2fc');
      lines.forEach((line,index)=>textAt(line,56,y+index*34,emphasized?32:28,emphasized));
      textAt(money(value),844,y,emphasized?32:28,emphasized,navy,'right');y+=height;
    };
    if(draw){
      const scale=Math.min(310/(Number(artwork.logo.width)||1740),66/(Number(artwork.logo.height)||342));
      ctx.drawImage(artwork.logo,56,y,(Number(artwork.logo.width)||1740)*scale,(Number(artwork.logo.height)||342)*scale);
    }
    textAt('Order Invoice',844,46,34,false,navy,'right',true);
    textAt(invoice.reference,844,90,25,true,blue,'right');
    y=138;rule();
    labelValue('Issued',date(invoice.createdAt));
    labelValue('Payment Status',paid?'Paid':'Awaiting Payment');
    if(invoice.validUntil)labelValue('Payment Due',date(invoice.validUntil));
    heading('Billed To');
    [invoice.customerName,invoice.customerPhone,invoice.address].filter(Boolean).forEach(value=>text(String(value)));
    rule();
    box(44,y-8,812,44,navy);
    textAt('Item',56,y,24,false,'#fff');textAt('Qty',568,y,24,false,'#fff','center');textAt('Amount',844,y,24,false,'#fff','right');y+=52;
    invoice.items.forEach(item=>{
      font(28);const lines=wrapped(ctx,item.name,440),top=y;
      lines.forEach(line=>{textAt(line,56,y);y+=34;});
      textAt(String(item.quantity),568,top,26,false,navy,'center');
      textAt(money(item.total),844,top,28,false,navy,'right');
      textAt(`${money(item.price)} Each`,56,y,23,false,muted);y+=34;rule();
    });
    heading('Order Summary');row('Items Subtotal',invoice.subtotal);
    invoice.charges.forEach(charge=>row(charge.name,charge.amount));
    if(invoice.deliveryFee)row('Delivery',invoice.deliveryFee);
    invoice.discounts.forEach(discount=>row(discount.name,-discount.amount));
    y+=12;row('Order Total',invoice.total,true);y+=20;
    row(paid?'Paid At Checkout':'Amount Due Now',invoice.payableNow,true);
    if(invoice.payableOnDelivery){y+=12;row('Pay Courier On Delivery',invoice.payableOnDelivery);}
    rule();heading(paid?'Payment Details':'Payment Instructions');
    labelValue('Payment Method',invoice.payment.name);
    if(invoice.payment.accountName)labelValue('Account Name',invoice.payment.accountName);
    if(invoice.payment.accountNumber)labelValue('Account Number',invoice.payment.accountNumber);
    if(qr){
      const reminder=(value:string)=>{
        font(24,true);
        const lines:string[]=[];let line='';
        for(const word of value.split(' ')){
          const next=line?`${line} ${word}`:word;
          if(line&&ctx.measureText(next).width>788){lines.push(line);line=word;}else line=next;
        }
        if(line)lines.push(line);
        for(const value of lines){textAt(value,450,y,24,true,navy,'center');y+=38;}
        y+=20;
      };
      y+=18;
      if(!paid){
        textAt('TOTAL AMOUNT DUE',450,y,28,true,navy,'center');y+=46;
        const amount=`P${Number(invoice.payableNow || 0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
        font(64,true);
        const amountSize=Math.min(64,64*788/Math.max(1,ctx.measureText(amount).width));
        textAt(amount,450,y,amountSize,true,navy,'center');y+=amountSize+32;
      }
      const qrWidth=WIDTH*.7,qrHeight=qrWidth*(Number(qr.height)||1)/(Number(qr.width)||1),left=WIDTH*.15;
      box(left-24,y,qrWidth+48,qrHeight+48,'#dce4ee');box(left-23,y+1,qrWidth+46,qrHeight+46,'#fff');
      if(draw){ctx.imageSmoothingEnabled=false;ctx.drawImage(qr,left,y+24,qrWidth,qrHeight);}
      y+=qrHeight+70;
      if(!paid&&invoice.validUntil)reminder(`PAYMENT MUST BE MADE BEFORE ${paymentDeadline(invoice.validUntil)} TO AVOID CANCELLATION.`);
      if(paid)text('Payment Method QR',24,muted,true);
    }
    rule();text('Thank You For Choosing PRIME',30,navy,true,true);
    text(paid?'Payment Has Been Recorded':'Please Send Payment Confirmation In This Chat',23,muted,true);
    return y+44;
  };
  const height=Math.ceil(render(false));
  if(height>8800)throw new Error('This invoice is too long for one image. Shorten item names or split the order.');
  canvas.width=WIDTH;canvas.height=height;ctx.textBaseline='top';
  const background=ctx.createLinearGradient(0,0,0,height);
  background.addColorStop(0,POS_INVOICE_ARTWORK.backgroundTop);
  background.addColorStop(1,'#ffffff');
  ctx.fillStyle=background;ctx.fillRect(0,0,WIDTH,height);
  ctx.fillStyle=navy;ctx.fillRect(0,0,WIDTH,6);ctx.fillRect(0,height-6,WIDTH,6);
  render(true);
  return canvas;
}

export async function createPosInvoiceImage(invoice: PosInvoice, qrUrl?: string): Promise<Blob> {
  if(invoice.payment.qrCodeImage&&!qrUrl)throw new Error('The configured payment QR could not be loaded.');
  const load = (url: string, label: string) => new Promise<HTMLImageElement>((resolve,reject)=>{
    const image=new Image();image.crossOrigin='anonymous';
    image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`${label} could not be loaded.`));image.src=url;
  });
  const [,logo,qr]=await Promise.all([
    document.fonts?.ready,
    load(POS_INVOICE_ARTWORK.logo,'The official PRIME logo'),
    invoice.payment.qrCodeImage?load(qrUrl!,'The configured payment QR'):Promise.resolve(undefined),
  ]);
  const canvas=drawPosInvoice(document.createElement('canvas'),invoice,qr,{logo});
  return await new Promise<Blob>((resolve,reject)=>{
    try{canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not generate the invoice image.')),'image/png');}
    catch{reject(new Error('The invoice artwork cannot be included in an image. Re-upload the payment QR through Payment Methods.'));}
  });
}
