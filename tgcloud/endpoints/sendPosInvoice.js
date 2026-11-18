import { api, db, EndpointError, InputFile } from 'sdk';
import { ensureOrderWorkflow } from '../lib/order-workflow.js';
import { notifyOrderStatusChanged } from '../lib/order-notifications.js';
import { requireAdmin } from '../lib/auth.js';
import { publicMediaReference } from '../lib/media.js';
import { getAutomationSettings, getAutomationChatState } from '../lib/telegram-automation.js';

const CHUNK_SIZE = 256 * 1024;
const fail = (message, code = 'POS_INVOICE_INVALID') => { throw new EndpointError(message, { code }); };
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const amount = value => Math.round((Number(value) || 0) * 100) / 100;
const milliseconds = value => value instanceof Date ? value.getTime() : Number(value) < 1e12 ? Number(value) * 1000 : Number(value);

function decode(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  if (typeof value !== 'string' || !value || value.length > 350000 || value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(value)) fail('Invalid invoice image part.');
  const bytes = new Uint8Array(Math.floor(value.length * 3 / 4));
  let bits = 0, buffer = 0, offset = 0;
  for (const character of value) {
    buffer = (buffer << 6) | alphabet.indexOf(character); bits += 6;
    if (bits >= 8) { bits -= 8; bytes[offset++] = (buffer >> bits) & 255; buffer &= (1 << bits) - 1; }
  }
  if (bits && buffer) fail('Invalid invoice image encoding.');
  return bytes.subarray(0, offset);
}

function invoiceCaption(invoice) {
  const paid=String(invoice.paymentStatus).toLowerCase()==='paid';
  const value=Number(invoice.payableNow || 0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const lines=[`PRIME Invoice ${invoice.reference}`,`Payment Status: ${paid?'Paid':'Awaiting Payment'}`,
    `${paid?'Amount Paid':'Amount Due'}: P${value}`,`Payment Method: ${invoice.payment.name}`];
  if(!paid&&invoice.validUntil){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
      timeZone:'Asia/Manila',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h12',
    }).formatToParts(new Date(invoice.validUntil)).map(part=>[part.type,part.value]));
    lines.push(`Payment Due: ${parts.day}-${parts.month.toUpperCase()}-${parts.year} ${parts.hour}:${parts.minute} ${parts.dayPeriod.toUpperCase()}`);
  }
  return lines.join('\n\n');
}

async function deliveryTarget(chatId) {
  const settings = await getAutomationSettings();
  if (settings.businessConnectionId) {
    const state = await getAutomationChatState(settings.businessConnectionId, Number(chatId));
    if (milliseconds(state?.lastCustomerMessageAt) > Date.now() - 24 * 60 * 60 * 1000) {
      const connection = await api.getBusinessConnection({ business_connection_id: settings.businessConnectionId });
      if (connection?.is_enabled && connection?.rights?.can_reply) return settings.businessConnectionId;
    }
  }
  return '';
}

export default async function (input = {}, ctx) {
  const staff = await requireAdmin(ctx);
  const owner = String(staff.id);
  await db.run(`CREATE TABLE IF NOT EXISTS pos_invoice_sessions (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, order_id TEXT NOT NULL, payment_method_id TEXT NOT NULL,
    chat_id TEXT NOT NULL, connection_id TEXT NOT NULL, snapshot TEXT NOT NULL,
    file_size INTEGER, chunk_count INTEGER, status TEXT NOT NULL DEFAULT 'prepared',
    message_id INTEGER, expires_at INTEGER NOT NULL, UNIQUE(order_id,payment_method_id))`);
  await db.run(`CREATE TABLE IF NOT EXISTS pos_invoice_parts (
    session_id TEXT NOT NULL, part_index INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(session_id,part_index))`);
  await db.run(`DELETE FROM pos_invoice_parts WHERE session_id IN (SELECT id FROM pos_invoice_sessions WHERE expires_at<=unixepoch())`);
  await db.run(`DELETE FROM pos_invoice_sessions WHERE expires_at<=unixepoch()`);
  const action = String(input.action || '');
  if (action === 'list') {
    return await db.all(`SELECT order_number AS orderNumber,customer_name AS customerName,
      payable_now AS amountDue,payment_method_id AS paymentMethodId,payment_deadline_at AS deadline
      FROM orders WHERE notes LIKE 'POS ·%' AND lower(status)='pending' AND lower(payment_status)='unpaid'
      ORDER BY created_at DESC LIMIT 100`);
  }
  if (action === 'confirmPayment') {
    if (input.paymentVerified !== true) fail('Verify the transfer before confirming payment.');
    await ensureOrderWorkflow();
    const reference = String(input.orderNumber || '');
    const order = await db.get(`SELECT id,order_number,tg_user_id,status,payment_status,payable_now,payable_on_delivery,
      total_amount,payment_deadline_at,staff_edit_version,notes FROM orders WHERE order_number=:reference`, {':reference':reference});
    if (!order || !String(order.notes || '').startsWith('POS ·')) fail('Choose a saved POS invoice.');
    const received = Number(input.confirmedAmount), due = amount(order.payable_now ?? order.total_amount);
    if (!Number.isFinite(received) || amount(received)!==due) fail('Confirm the exact invoice amount after checking payment.');
    if (['cancelled','expired','rejected'].includes(String(order.status).toLowerCase())) fail('This order is no longer payable.');
    if (String(order.payment_status).toLowerCase()==='paid') return {success:true,alreadyPaid:true};
    if (String(order.status).toLowerCase()!=='pending' || String(order.payment_status).toLowerCase()!=='unpaid') fail('Refresh the order before confirming payment.');
    if (Number(order.payment_deadline_at)<=Math.floor(Date.now()/1000)) fail('This invoice expired. Cancel it in Orders and create a new invoice.');
    const changed=await db.run(`UPDATE orders SET status='Confirmed',payment_status='Paid',confirmed_paid_amount=:amount,
      payment_received_amount=:amount,requires_manual_review=0,review_status=:review,payment_deadline_at=NULL,updated_at=unixepoch()
      WHERE id=:id AND status=:status AND payment_status=:payment AND payable_now=:amount
        AND coalesce(staff_edit_version,0)=:version AND payment_deadline_at>unixepoch()
        AND lower(coalesce(control_state,'normal')) IN ('normal','resubmitted')
        AND NOT EXISTS(SELECT 1 FROM order_workflow WHERE order_id=:id AND (edit_state='pending' OR cancellation_requested=1))
      RETURNING id`,{':id':order.id,':status':order.status,':payment':order.payment_status,':amount':due,
        ':version':Number(order.staff_edit_version)||0,':review':'POS invoice payment verified by staff '+owner});
    if (!Number(changed?.rowsAffected)) fail('The order changed. Refresh before confirming payment.');
    await notifyOrderStatusChanged({chatId:order.tg_user_id,orderNumber:order.order_number,status:'Confirmed',paymentStatus:'Paid',totalAmount:order.total_amount,payableNow:due});
    return {success:true};
  }
  if (action === 'prepare') {
    const reference = String(input.orderNumber || '').trim();
    if (!/^[0-9]{12}$/.test(reference)) fail('Choose a saved POS order.');
    const order = await db.get(`SELECT id,order_number,customer_name,customer_phone,tg_user_id,items,subtotal,
      charges_breakdown,discount_amount,staff_discount_amount,promo_shipping_subsidy,store_credits_used,
      delivery_fee,total_amount,payable_now,payable_on_delivery,payment_status,payment_method_name,
      delivery_address,created_at,notes,status,staff_edit_version,payment_deadline_at FROM orders WHERE order_number=:reference`, { ':reference': reference });
    if (!order || !String(order.notes || '').startsWith('POS ·')) fail('Choose a saved POS order.', 'NOT_FOUND');
    if (['cancelled','expired','rejected'].includes(String(order.status).toLowerCase())) fail('This order is no longer payable.');
    if (!/^[0-9]{1,20}$/.test(String(order.tg_user_id || ''))) fail('Add the customer Telegram ID before saving the POS order.');
    const methodId = String(input.paymentMethodId || '').trim();
    const methodKey = methodId + ':' + String(order.payment_status) + ':' + String(Number(order.staff_edit_version)||0);
    if (String(order.payment_status).toLowerCase()==='unpaid' && Number(order.payment_deadline_at)<=Math.floor(Date.now()/1000)) fail('This invoice expired. Cancel it in Orders and create a new invoice.');
    const payment = methodId ? await db.get(`SELECT id,name,qr_code_image,account_name,account_number,is_active
      FROM payment_methods WHERE id=:id`, { ':id': methodId }) : null;
    if (methodId && (!payment || !payment.is_active)) fail('Choose an active payment method.');
    if (!payment && order.payment_method_name !== 'Cash') fail('Choose the configured payment method to include its payment instructions.');
    const qrReference=payment?await publicMediaReference(payment.qr_code_image || ''):'';
    let previous = await db.get(`SELECT * FROM pos_invoice_sessions WHERE order_id=:order AND payment_method_id=:method`, { ':order': order.id, ':method': methodKey });
    if (previous && ['prepared','uploading'].includes(previous.status)) {
      const old=json(previous.snapshot).payment;
      if (String(old.qrCodeImage || '')!==qrReference || String(old.accountNumber || '')!==String(payment?.account_number || '') || String(old.accountName || '')!==String(payment?.account_name || '')) {
        await db.run('DELETE FROM pos_invoice_parts WHERE session_id=:id',{':id':previous.id});
        await db.run("DELETE FROM pos_invoice_sessions WHERE id=:id AND status IN ('prepared','uploading')",{':id':previous.id});
        previous=null;
      }
    }
    if (previous) {
      if (previous.owner !== owner) fail('Another staff member prepared this invoice. Ask them to finish sending it.');
      if (previous.status === 'uncertain' || previous.status === 'sending') fail('Check the customer chat before attempting another send.', 'POS_INVOICE_UNCERTAIN');
      return { sessionId: previous.id, invoice: json(previous.snapshot), route: previous.connection_id ? 'business' : 'bot', sent: previous.status === 'complete', messageId: previous.message_id };
    }
    const items = json(order.items) || [];
    const address = json(order.delivery_address) || {};
    const invoice = {
      reference: order.order_number, customerName: order.customer_name, customerPhone: order.customer_phone || '',
      address: address.formatted || '', createdAt: new Date(Number(order.created_at) * 1000).toISOString(),
      paymentStatus: order.payment_status, ...(order.payment_deadline_at?{validUntil:new Date(Number(order.payment_deadline_at)*1000).toISOString()}:{}), orderVersion: Number(order.staff_edit_version)||0,
      items: items.map(item => ({ name: String(item.name || item.productName || 'Item'), quantity: Number(item.quantity) || 0,
        price: item.isFree ? 0 : amount(item.price), total: item.isFree ? 0 : amount(Number(item.price) * Number(item.quantity)) })),
      subtotal: amount(order.subtotal),
      charges: (json(order.charges_breakdown) || []).map(charge => ({name:String(charge.name || 'Charge'),amount:amount(charge.computedAmount)})),
      discounts: [['Voucher',order.discount_amount],['Staff discount',order.staff_discount_amount],['Delivery voucher',order.promo_shipping_subsidy],['Store Credits',order.store_credits_used]]
        .filter(([,value]) => Number(value) > 0).map(([name,value]) => ({name,amount:amount(value)})),
      deliveryFee: amount(order.delivery_fee), total: amount(order.total_amount), payableNow: amount(order.payable_now ?? order.total_amount),
      payableOnDelivery: amount(order.payable_on_delivery),
      payment: payment ? {id:payment.id,name:payment.name,qrCodeImage:qrReference,accountName:payment.account_name || '',accountNumber:payment.account_number || ''} : {id:'',name:'Cash'},
    };
    const connectionId = await deliveryTarget(order.tg_user_id);
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join('');
    await db.run(`INSERT INTO pos_invoice_sessions(id,owner,order_id,payment_method_id,chat_id,connection_id,snapshot,expires_at)
      VALUES(:id,:owner,:order,:method,:chat,:connection,:snapshot,unixepoch()+86400)
      ON CONFLICT(order_id,payment_method_id) DO NOTHING`,
      { ':id':id, ':owner':owner, ':order':order.id, ':method':methodKey, ':chat':String(order.tg_user_id), ':connection':connectionId, ':snapshot':JSON.stringify(invoice) });
    const saved = await db.get(`SELECT * FROM pos_invoice_sessions WHERE order_id=:order AND payment_method_id=:method`,{':order':order.id,':method':methodKey});
    if (saved.owner !== owner) fail('Another staff member prepared this invoice.');
    return {sessionId:saved.id,invoice:json(saved.snapshot),route:saved.connection_id?'business':'bot',sent:saved.status==='complete',messageId:saved.message_id};
  }
  const id = String(input.sessionId || '');
  if (!/^[a-f0-9]{32}$/.test(id)) fail('Invalid invoice session.');
  const session = await db.get(`SELECT * FROM pos_invoice_sessions WHERE id=:id AND owner=:owner`, {':id':id,':owner':owner});
  if (!session) fail('Invoice session expired. Open the invoice again.');
  if (session.status === 'complete') return {success:true,messageId:session.message_id};
  if (['sending','uncertain'].includes(session.status)) fail('Check the customer chat before attempting another send.', 'POS_INVOICE_UNCERTAIN');
  if (action === 'start') {
    const size = Number(input.fileSize), count = Number(input.chunkCount);
    if (!Number.isSafeInteger(size) || size < 8 || size > 8*1024*1024 || count !== Math.ceil(size/CHUNK_SIZE)) fail('Invalid invoice image size.');
    if (session.status === 'uploading' && (Number(session.file_size)!==size || Number(session.chunk_count)!==count)) fail('Finish the original invoice upload before changing its image.');
    await db.run(`UPDATE pos_invoice_sessions SET file_size=:size,chunk_count=:count,status='uploading'
      WHERE id=:id AND owner=:owner AND status IN ('prepared','uploading')`, {':size':size,':count':count,':id':id,':owner':owner});
    return {success:true};
  }
  if (session.status !== 'uploading') fail('Prepare the invoice image first.');
  if (action === 'chunk') {
    const index = Number(input.index), bytes = decode(input.data);
    if (!Number.isInteger(index) || index<0 || index>=Number(session.chunk_count) || bytes.length!==Math.min(CHUNK_SIZE,Number(session.file_size)-index*CHUNK_SIZE)) fail('Invalid invoice image part.');
    await db.run(`INSERT INTO pos_invoice_parts(session_id,part_index,data) VALUES(:id,:index,:data)
      ON CONFLICT(session_id,part_index) DO UPDATE SET data=excluded.data`,{':id':id,':index':index,':data':input.data});
    return {success:true};
  }
  if (action !== 'send') fail('Unsupported invoice action.');
  const order = await db.get(`SELECT status,payment_status,staff_edit_version,payable_now,payment_deadline_at,tg_user_id FROM orders WHERE id=:id`,{':id':session.order_id});
  if (!order || ['cancelled','expired','rejected'].includes(String(order.status).toLowerCase())) fail('This order is no longer payable.');
  const snapshot = json(session.snapshot);
  if (Number(order.staff_edit_version||0)!==Number(snapshot.orderVersion||0) || amount(order.payable_now)!==amount(snapshot.payableNow) || String(order.tg_user_id)!==String(session.chat_id)) fail('The order changed. Prepare a new invoice.');
  if (String(order.payment_status).toLowerCase()==='unpaid' && Number(order.payment_deadline_at)<=Math.floor(Date.now()/1000)) fail('This invoice has expired.');
  if (String(order.payment_status)!==String(snapshot.paymentStatus)) fail('Payment status changed. Refresh the invoice before sending.');
  if (snapshot.payment.id) {
    const method=await db.get('SELECT is_active,qr_code_image,account_name,account_number FROM payment_methods WHERE id=:id',{':id':snapshot.payment.id});
    if (!method?.is_active || await publicMediaReference(method.qr_code_image || '')!==String(snapshot.payment.qrCodeImage || '') || String(method.account_name || '')!==String(snapshot.payment.accountName || '') || String(method.account_number || '')!==String(snapshot.payment.accountNumber || '')) fail('Payment instructions changed. Close and reopen the invoice to use the current QR.');
  }
  const bytes = new Uint8Array(Number(session.file_size));
  for (let index=0;index<Number(session.chunk_count);index++) {
    const part=await db.get(`SELECT data FROM pos_invoice_parts WHERE session_id=:id AND part_index=:index`,{':id':id,':index':index});
    if (!part) fail('Some invoice image parts are missing.');
    const data=decode(part.data);
    if (data.length!==Math.min(CHUNK_SIZE,bytes.length-index*CHUNK_SIZE)) fail('Invalid invoice image part size.');
    bytes.set(data,index*CHUNK_SIZE);
  }
  if (![137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte)) fail('The invoice image is not a PNG.');
  if (session.connection_id && await deliveryTarget(session.chat_id)!==session.connection_id) fail('The business reply window has closed. Ask the customer to message you again.');
  const claim=await db.run(`UPDATE pos_invoice_sessions SET status='sending' WHERE id=:id AND owner=:owner AND status='uploading' RETURNING id`,{':id':id,':owner':owner});
  if (!Number(claim?.rowsAffected)) fail('Invoice delivery is already in progress.','POS_INVOICE_UNCERTAIN');
  try {
    const message=await api.sendPhoto({chat_id:session.chat_id,...(session.connection_id?{business_connection_id:session.connection_id}:{}),
      photo:new InputFile(bytes,`PRIME-Invoice-${snapshot.reference}.png`,{type:'image/png'}),
      caption:invoiceCaption(snapshot)});
    if (!message?.message_id) throw new Error('No delivery confirmation.');
    await db.run(`UPDATE pos_invoice_sessions SET status='complete',message_id=:message WHERE id=:id`,{':id':id,':message':message.message_id});
    await db.run(`DELETE FROM pos_invoice_parts WHERE session_id=:id`,{':id':id});
    return {success:true,messageId:message.message_id};
  } catch (error) {
    if ([400,403].includes(Number(error?.code || error?.error_code))) {
      await db.run(`UPDATE pos_invoice_sessions SET status='uploading' WHERE id=:id AND status='sending'`,{':id':id});
      fail('Telegram rejected this invoice. Check the customer Telegram ID and ask them to start or unblock the PRIME bot before retrying.','POS_INVOICE_REJECTED');
    }
    await db.run(`UPDATE pos_invoice_sessions SET status='uncertain' WHERE id=:id AND status='sending'`,{':id':id});
    await db.run(`DELETE FROM pos_invoice_parts WHERE session_id=:id`,{':id':id});
    fail('Delivery could not be confirmed. Check the customer chat before trying again.','POS_INVOICE_UNCERTAIN');
  }
}
