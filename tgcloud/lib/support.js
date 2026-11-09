import { db, EndpointError } from 'sdk';

const text = (value, max) => String(value ?? '').trim().slice(0, max);
const fail = (message, code='INVALID_INPUT') => { throw new EndpointError(message,{code}); };
const statuses=['open','waiting_customer','resolved','closed'];
function present(row, admin, detail=false) {
  let messages=[];try { messages=typeof row.messages==='string'?JSON.parse(row.messages):row.messages||[]; } catch {}
  return {id:row.id,subject:row.subject,category:row.category,orderId:row.order_id||'',status:row.status,version:Number(row.version),lastMessage:row.last_message,createdAt:Number(row.created_at)*1000,updatedAt:Number(row.updated_at)*1000,unread:Number(row.version)>Number(admin?row.staff_seen_version:row.customer_seen_version),...(admin?{customerName:row.customer_name}:{}),...(detail?{messages}: {})};
}
export async function handleSupport(input, actor, admin=false) {
  const action=text(input?.action,30),id=text(input?.id,100);
  const owner=String(actor.id);
  if(action==='list') {
    const status=text(input.status,30);if(status&&!statuses.includes(status))fail('Invalid ticket status.');
    const cursor=input.cursor;
    const params={':owner':owner,':admin':admin?1:0,':status':status,':cursorTime':Math.floor(Number(cursor?.updatedAt||0)/1000),':cursorId':text(cursor?.id,100)};
    const rows=await db.all(`SELECT * FROM support_tickets WHERE (:admin=1 OR owner_telegram_id=:owner) AND (:status='' OR status=:status)
      AND (:cursorTime=0 OR updated_at<:cursorTime OR (updated_at=:cursorTime AND id<:cursorId)) ORDER BY updated_at DESC,id DESC LIMIT 31`,params);
    const totals=await db.get(`SELECT count(*) AS total,coalesce(sum(CASE WHEN version>CASE WHEN :admin=1 THEN staff_seen_version ELSE customer_seen_version END THEN 1 ELSE 0 END),0) AS unread FROM support_tickets WHERE (:admin=1 OR owner_telegram_id=:owner) AND (:status='' OR status=:status)`,{':owner':owner,':admin':admin?1:0,':status':status});
    const page=rows.slice(0,30),last=page.at(-1);
    return {tickets:page.map(row=>present(row,admin)),total:Number(totals.total),unread:Number(totals.unread),nextCursor:rows.length>30?{updatedAt:Number(last.updated_at)*1000,id:last.id}:null};
  }
  if(action==='create') {
    if(admin)fail('Customer tickets must be created from the customer account.');
    const request=text(input.requestId,100),subject=text(input.subject,160),body=text(input.body,4000),category=text(input.category,30),orderId=text(input.orderId,100);
    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(request)||subject.length<3||body.length<3||!['general','order','payment','delivery','product','account'].includes(category))fail('Enter a question and message.');
    if(orderId&&!await db.get('SELECT id FROM orders WHERE id=:id AND tg_user_id=:owner',{':id':orderId,':owner':owner}))fail('Linked order not found.','NOT_FOUND');
    const ticketId='ticket-'+owner+'-'+request;
    const existing=await db.get('SELECT * FROM support_tickets WHERE id=:id',{':id':ticketId});
    if(existing) {if(existing.subject!==subject||existing.category!==category||(existing.order_id||'')!==orderId||present(existing,false,true).messages[0]?.body!==body)fail('This request ID was already used.','REQUEST_CONFLICT');return {ticket:present(existing,false,true)};}
    const messages=JSON.stringify([{id:request,role:'customer',type:'message',body,createdAt:Date.now()}]);
    await db.run(`INSERT INTO support_tickets(id,owner_telegram_id,customer_name,request_key,subject,category,order_id,status,messages,version,customer_seen_version,staff_seen_version,last_message,created_at,updated_at)
      VALUES (:id,:owner,:name,:request,:subject,:category,:order,'open',:messages,1,1,0,:body,unixepoch(),unixepoch()) ON CONFLICT(id) DO NOTHING`,{':id':ticketId,':owner':owner,':name':text(actor.first_name||actor.username||'PRIME Member',100),':request':request,':subject':subject,':category':category,':order':orderId||null,':messages':messages,':body':body});
    return {ticket:present(await db.get('SELECT * FROM support_tickets WHERE id=:id',{':id':ticketId}),false,true)};
  }
  const row=await db.get('SELECT * FROM support_tickets WHERE id=:id AND (:admin=1 OR owner_telegram_id=:owner)',{':id':id,':owner':owner,':admin':admin?1:0});
  if(!row)fail('Ticket not found.','NOT_FOUND');
  if(action==='detail') {
    await db.run(`UPDATE support_tickets SET ${admin?'staff_seen_version':'customer_seen_version'}=:version WHERE id=:id AND version=:version`,{':id':id,':version':Number(row.version)});
    const ticket=present(row,admin,true);ticket.unread=false;return {ticket};
  }
  if(!['reply','status'].includes(action))fail('Unsupported ticket action.');
  const request=text(input.requestId,100),body=text(input.body,4000),next=action==='status'?text(input.status,30):(admin?'waiting_customer':'open');
  if(action==='status'&&!admin&&!['open','closed'].includes(next))fail('Customers may only close or reopen their own tickets.','INVALID_STATUS');
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(request)||!statuses.includes(next)||(action==='reply'&&body.length<1))fail('Enter a valid message or status.');
  const ticket=present(row,admin,true),prior=ticket.messages.find(message=>message.id===request);
  if(prior){if(prior.body!==(action==='status'?next:body)||prior.role!==(admin?'staff':'customer'))fail('Request ID conflict.','REQUEST_CONFLICT');return {ticket};}
  if(action==='reply'&&row.status==='closed')fail('This ticket is closed. Open a new ticket.','TICKET_CLOSED');
  if(ticket.messages.length>=500)fail('This conversation is full. Open a new ticket.','TICKET_FULL');
  ticket.messages.push({id:request,role:admin?'staff':'customer',type:action==='status'?'status':'message',body:action==='status'?next:body,createdAt:Date.now()});
  const version=Number(row.version)+1;
  await db.run(`UPDATE support_tickets SET messages=:messages,status=:status,version=:next,last_message=:body,updated_at=unixepoch(),${admin?'staff_seen_version':'customer_seen_version'}=:next WHERE id=:id AND version=:before`,{':messages':JSON.stringify(ticket.messages),':status':next,':next':version,':body':action==='status'?'Status: '+next:body,':id':id,':before':Number(row.version)});
  const saved=await db.get('SELECT * FROM support_tickets WHERE id=:id',{':id':id});
  const savedTicket=present(saved,admin,true);
  if(!savedTicket.messages.some(message=>message.id===request))fail('Ticket changed. Retry your message.','TICKET_CHANGED');
  return {ticket:savedTicket};
}
