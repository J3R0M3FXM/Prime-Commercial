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

/** Draw configured QR artwork unchanged, including its original quiet zone. */
export function drawPosInvoice(canvas: HTMLCanvasElement, invoice: PosInvoice, qr?: CanvasImageSource & { width?: number; height?: number }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Invoice image generation is unavailable on this device.');
  if (!invoice.items.length || invoice.items.length > 100) throw new Error('An invoice must contain between 1 and 100 items.');
  ctx.font = "400 28px 'Lato Condensed', 'Lato', sans-serif";
  const itemLines = invoice.items.map(item => wrapped(ctx, item.name, 490));
  const details = [invoice.customerName, invoice.customerPhone, invoice.address].filter(Boolean).flatMap(value => wrapped(ctx, String(value), 780));
  const height = 620 + details.length * 34 + itemLines.reduce((sum, lines) => sum + Math.max(2, lines.length + 1) * 32, 0)
    + (invoice.charges.length + invoice.discounts.length + 5) * 42 + (qr ? 570 : 110);
  if (height > 8800) throw new Error('This invoice is too long for one image. Shorten item names or split the order.');
  canvas.width = WIDTH; canvas.height = height;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, WIDTH, height);
  ctx.textBaseline = 'top';
  let y = 42;
  const text = (value: string, size = 28, bold = false, color = '#0b1f36') => {
    ctx.fillStyle = color; ctx.font = `${bold ? 700 : 400} ${size}px 'Lato Condensed', 'Lato', sans-serif`;
    ctx.textAlign = 'left'; ctx.fillText(value, 48, y); y += size + 10;
  };
  const rule = () => { y += 8; ctx.fillStyle = '#e2e8f0'; ctx.fillRect(48, y, 804, 1); y += 22; };
  const row = (label: string, value: number, bold = false) => {
    ctx.font = `${bold ? 700 : 400} ${bold ? 32 : 28}px 'Lato Condensed', 'Lato', sans-serif`;
    ctx.fillStyle = '#0b1f36'; ctx.textAlign = 'left'; ctx.fillText(label, 48, y);
    ctx.textAlign = 'right'; ctx.fillText(money(value), 852, y); y += 42;
  };
  ctx.font = "400 44px 'Roboto Condensed', sans-serif"; ctx.fillStyle = '#0b1f36'; ctx.fillText('PRIME', 48, y); y += 60;
  ctx.font = "400 32px 'Roboto Condensed', sans-serif"; ctx.fillText('ORDER INVOICE', 48, y); y += 46;
  text(invoice.reference, 26, true);
  text(new Date(invoice.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }), 24, false, '#64748b');
  text(invoice.paymentStatus.toLowerCase() === 'paid' ? 'PAID' : 'AWAITING PAYMENT', 26, true);
  if(invoice.validUntil)text('Payment due: '+new Date(invoice.validUntil).toLocaleString('en-PH',{timeZone:'Asia/Manila'}),22,false,'#64748b');
  rule(); details.forEach(line => text(line)); rule();
  invoice.items.forEach((item, index) => {
    ctx.font = "400 28px 'Lato Condensed', 'Lato', sans-serif"; ctx.fillStyle = '#0b1f36'; ctx.textAlign = 'left';
    itemLines[index].forEach(line => { ctx.fillText(line, 48, y); y += 32; });
    ctx.font = "400 24px 'Lato Condensed', 'Lato', sans-serif"; ctx.fillStyle = '#64748b';
    ctx.fillText(`${item.quantity} × ${money(item.price)}`, 48, y);
    ctx.textAlign = 'right'; ctx.fillStyle = '#0b1f36'; ctx.fillText(money(item.total), 852, y - 32);
    y += 40;
  });
  rule(); row('Items subtotal', invoice.subtotal);
  invoice.charges.forEach(charge => row(charge.name, charge.amount));
  if (invoice.deliveryFee) row('Delivery', invoice.deliveryFee);
  invoice.discounts.forEach(discount => row(discount.name, -discount.amount));
  row('Order total', invoice.total, true); rule();
  row(invoice.paymentStatus.toLowerCase() === 'paid' ? 'Paid at checkout' : 'Amount due now', invoice.payableNow, true);
  if (invoice.payableOnDelivery) row('Pay courier on delivery', invoice.payableOnDelivery);
  y += 16; text(invoice.payment.name, 30, true);
  if (invoice.payment.accountName) text(invoice.payment.accountName, 26);
  if (invoice.payment.accountNumber) text(invoice.payment.accountNumber, 26);
  if (qr) {
    const qrWidth = Number(qr.width) || 1, qrHeight = Number(qr.height) || 1;
    const scale = Math.min(460 / qrWidth, 460 / qrHeight);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, (WIDTH - qrWidth * scale) / 2, y + 14, qrWidth * scale, qrHeight * scale);
    y += 490; text(invoice.paymentStatus.toLowerCase()==='paid'?'Payment method QR':'Scan or save this QR to pay.', 24, false, '#64748b');
  }
  text(invoice.paymentStatus.toLowerCase()==='paid'?'Thank you. Payment has been recorded.':'Please send your payment confirmation in this chat.', 24, false, '#64748b');
  return canvas;
}

export async function createPosInvoiceImage(invoice: PosInvoice, qrUrl?: string): Promise<Blob> {
  await document.fonts?.ready;
  let qr: HTMLImageElement | undefined;
  if (invoice.payment.qrCodeImage) {
    if (!qrUrl) throw new Error('The configured payment QR could not be loaded.');
    qr = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image(); image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The configured payment QR could not be loaded.'));
      image.src = qrUrl;
    });
  }
  const canvas = drawPosInvoice(document.createElement('canvas'), invoice, qr);
  return await new Promise<Blob>((resolve, reject) => {
    try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not generate the invoice image.')), 'image/png'); }
    catch { reject(new Error('The configured QR cannot be included in an image. Re-upload it through Payment Methods.')); }
  });
}
