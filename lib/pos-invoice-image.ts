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
    timeZone:'Asia/Manila',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h12',
  }).formatToParts(new Date(value)).map(part=>[part.type,part.value]));
  return `${parts.hour}:${parts.minute}:${parts.second} ${parts.dayPeriod.toUpperCase()}`;
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
    y+=8;row('Order Total',invoice.total,true);
    if(invoice.payableOnDelivery){y+=8;row('Pay Courier On Delivery',invoice.payableOnDelivery);}
    y+=20;
    box(56,y,788,44,navy);
    textAt(paid?'Payment Details':qr?'Use the QR code to pay':'Payment Details',76,y+8,24,false,'#fff', 'left',true);
    y+=44;
    // Keep the original QR artwork intact, including its quiet zone.
    const cardTop=y,left=56,cardWidth=788;
    const amountLeft=qr?426:80,amountWidth=qr?394:740;
    const lineHeight=(value:string,size:number)=>{font(size);return wrapped(ctx,value,amountWidth).length*(size+7);};
    const detailHeight=lineHeight(invoice.payment.name,24)+(invoice.payment.accountName?lineHeight(invoice.payment.accountName,22):0)+(invoice.payment.accountNumber?lineHeight(invoice.payment.accountNumber,22):0);
    const cardHeight=Math.max(qr?344:180,160+detailHeight);
    box(left,cardTop,cardWidth,cardHeight,'#eaf2fc');
    if(qr){
      const maxSize=296;
      const ratio=Math.min(maxSize/(Number(qr.width)||1),maxSize/(Number(qr.height)||1));
      const qrWidth=(Number(qr.width)||1)*ratio,qrHeight=(Number(qr.height)||1)*ratio;
      box(68,cardTop+12,320,320,'#fff');
      if(draw){ctx.imageSmoothingEnabled=false;ctx.drawImage(qr,80+(296-qrWidth)/2,cardTop+24+(296-qrHeight)/2,qrWidth,qrHeight);}
      box(402,cardTop+24,1,cardHeight-48,'#cdd8e3');
    }
    const cardText=(value:string,top:number,size=24,bold=false,color=navy)=>{
      font(size,bold);
      for(const line of wrapped(ctx,value,amountWidth)){
        textAt(line,amountLeft,top,size,bold,color);top+=size+7;
      }
      return top;
    };
    let detailsY=cardText(paid?'AMOUNT PAID':'TOTAL AMOUNT DUE',cardTop+24,25,true);
    const amount=money(invoice.payableNow);
    font(48,true);
    const amountSize=Math.min(48,48*amountWidth/Math.max(1,ctx.measureText(amount).width));
    detailsY=cardText(amount,detailsY+8,amountSize,true,blue)+12;
    detailsY=cardText(invoice.payment.name,detailsY,24,true);
    if(invoice.payment.accountName)detailsY=cardText(invoice.payment.accountName,detailsY,22);
    if(invoice.payment.accountNumber)detailsY=cardText(invoice.payment.accountNumber,detailsY,22);
    y=Math.max(cardTop+cardHeight,detailsY+24);
    box(56,y,788,8,navy);y+=26;
    if(!paid)text('Send a copy of your payment screenshot in this chat.',23,navy,true);
    if(!paid&&invoice.validUntil)text(`Settle payment before ${paymentDeadline(invoice.validUntil)} today.`,23,muted,true);
    y+=12;text('Thank You For Choosing PRIME',30,navy,true,true);
    if(paid)text('Payment Has Been Recorded',23,muted,true);
    return y+44;
  };
  const contentHeight=Math.ceil(render(false));
  if(contentHeight>8800)throw new Error('This invoice is too long for one image. Shorten item names or split the order.');
  // 3:4 portrait, exported as a high-resolution PNG. Fit long orders without cropping.
  const width=1500,height=2000;
  canvas.width=width;canvas.height=height;ctx.textBaseline='top';
  const background=ctx.createLinearGradient(0,0,0,height);
  background.addColorStop(0,POS_INVOICE_ARTWORK.backgroundTop);
  background.addColorStop(1,'#ffffff');
  ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
  ctx.fillStyle=navy;ctx.fillRect(0,0,width,6);ctx.fillRect(0,height-6,width,6);
  const scale=Math.min(width/WIDTH,(height-24)/contentHeight);
  ctx.save();
  ctx.translate((width-WIDTH*scale)/2,12);
  ctx.scale(scale,scale);
  render(true);
  ctx.restore();
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
