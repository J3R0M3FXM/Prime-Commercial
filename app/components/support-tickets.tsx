"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Headphones, Loader2, Plus, RefreshCw, Send, X } from "lucide-react";
import PrimePageHeading from "./prime-page-heading";
import { callServerless } from "@/lib/telegram-serverless-client";
import { newSupportRequestId, requestSupport, supportPreview, ticketStatusLabels, type SupportTicket, type TicketPage, type TicketStatus } from "@/lib/support-client";
import "./support-tickets.css";
import SupportFaqs from './support-faqs';

const categories = ["general", "order", "payment", "delivery", "product", "account"];
function stamp(value: number) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(value));
}
function shortReference(value: string) {
  return value.length > 8 ? value.slice(-8).toUpperCase() : value.toUpperCase();
}
export default function SupportTickets({ admin = false, onBack }: { admin?: boolean; onBack?: () => void }) {
  const [page, setPage] = useState<TicketPage>({ tickets: [], total: 0, unread: 0, nextCursor: null });
  const [selectedId, setSelectedId] = useState("");
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [orderId, setOrderId] = useState("");
  const [orders, setOrders] = useState<Array<{ id: string; orderNumber?: string }>>([]);
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adminTab,setAdminTab]=useState<'tickets'|'faqs'>('tickets');
  const [notice, setNotice] = useState("");
  const [orderError, setOrderError] = useState("");
  const mutation = useRef<{ signature: string; id: string } | null>(null);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async (cursor?: TicketPage["nextCursor"], quiet = false) => {
    const request = ++generation.current;
    if (!quiet) { setLoading(true); setError(""); }
    try {
      if (selectedId) {
        const result = await requestSupport(admin, { action: "detail", id: selectedId });
        if (request === generation.current) setTicket(result.ticket);
      } else if (!creating) {
        const result = await requestSupport<TicketPage>(admin, { action: "list", status: filter || undefined, ...(cursor ? { cursor } : {}) });
        if (request === generation.current) setPage((current) => cursor ? { ...result, tickets: [...current.tickets, ...result.tickets.filter((row) => !current.tickets.some((item) => item.id === row.id))] } : result);
      }
    } catch (err: any) { if (request === generation.current) setError(err?.message || "Support could not be loaded. Please retry."); }
    finally { if (request === generation.current && !quiet) setLoading(false); }
  }, [admin, selectedId, creating, filter]);

  useEffect(() => {
    if (adminTab !== 'tickets') return;
    void load();
    const timer = window.setInterval(() => { if (!busyRef.current && !creating && !document.hidden) void load(undefined, true); }, 15_000);
    return () => { generation.current++; window.clearInterval(timer); };
  }, [load, creating, adminTab]);
  useEffect(() => {
    if (!creating) return;
    let current = true;
    setOrderError("");
    if (supportPreview()) { setOrders([{ id: "preview-order", orderNumber: "PREVIEW-1001" }]); return; }
    callServerless<Array<{ id: string; orderNumber?: string }>>("getMyOrders", {}).then((rows) => { if (current) setOrders(Array.isArray(rows) ? rows : []); }).catch(() => { if (current) setOrderError("Orders could not be loaded. You can still submit a ticket without linking an order."); });
    return () => { current = false; };
  }, [creating]);

  function back() {
    generation.current++; setSelectedId(""); setTicket(null); setCreating(false); setReply(""); setError(""); setNotice("");
  }
  async function mutate(action: "create" | "reply" | "status", values: Record<string, unknown>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    generation.current++;
    const signature = JSON.stringify({ admin, action, id: selectedId, ...values });
    if (mutation.current?.signature !== signature) mutation.current = { signature, id: newSupportRequestId() };
    try {
      const result = await requestSupport(admin, { action, ...(selectedId ? { id: selectedId } : {}), ...values, requestId: mutation.current.id });
      setTicket(result.ticket); setSelectedId(result.ticket.id); setCreating(false); setReply("");
      if (action === "create") { setSubject(""); setBody(""); setOrderId(""); setCategory("general"); }
      mutation.current = null;
      setNotice(action === "create" ? "Ticket created. Our team can now reply here." : action === "reply" ? "Reply sent." : "Ticket status updated.");
    } catch (err: any) { setError(err?.message || "Your request was not confirmed. Retry to check or complete the same request."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const statusLabel = (status: TicketStatus) => admin && status === "waiting_customer" ? "Awaiting Customer" : ticketStatusLabels[status];
  return <section className="prime-page-shell prime-support" data-support-view={admin ? "admin" : "customer"}>
    <PrimePageHeading icon={<Headphones />} title={admin ? "Support Inbox" : "Support"} actions={<>
      {(selectedId || creating) && <button type="button" aria-label="Back" disabled={busy} onClick={back}><ArrowLeft /></button>}
      <button type="button" aria-label="Refresh support" disabled={busy || loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /></button>
      {onBack && <button type="button" aria-label="Close support" disabled={busy} onClick={onBack}><X /></button>}
    </>} />
    <nav className="support-two-fields" aria-label="Support Sections"><button type="button" className="support-secondary" disabled={busy} aria-pressed={adminTab==='faqs'} onClick={()=>setAdminTab('faqs')}>FAQ</button><button type="button" className="support-secondary" disabled={busy} aria-pressed={adminTab==='tickets'} onClick={()=>setAdminTab('tickets')}>Tickets</button></nav>
    {adminTab==='faqs'?<div className="support-body"><SupportFaqs admin={admin}/></div>:<div className="support-body">
      {supportPreview() && <p className="support-preview-note">Preview · sample tickets shared between customer and admin views</p>}
      {error && <div role="alert" className="support-alert">{error}<button type="button" disabled={busy} onClick={() => void load()}>Retry Loading</button></div>}
      {notice && <p role="status" className="support-notice">{notice}</p>}
      {loading && <p className="support-empty"><Loader2 className="animate-spin" />Loading support…</p>}
      {!selectedId && !creating && <>
        <div className="support-toolbar"><div><h3>{admin ? "Customer Tickets" : "Your Tickets"}</h3><p>{page.total} tickets · {page.unread} unread</p></div>{!admin && <button type="button" className="support-primary" onClick={() => { setCreating(true); setError(""); setNotice(""); }}><Plus />New Ticket</button>}</div>
        <label className="support-field">Status<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All tickets</option>{(Object.keys(ticketStatusLabels) as TicketStatus[]).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
        {!loading && !page.tickets.length && <div className="support-empty"><Headphones /><h3>{admin ? "No Tickets Here" : "How Can We Help?"}</h3><p>{admin ? "Customer requests will appear in this inbox." : "Open a ticket for help with an order, payment or your account."}</p></div>}
        <div className="support-list">{page.tickets.map((row) => <button type="button" className="support-ticket-card" key={row.id} onClick={() => { setTicket(null); setSelectedId(row.id); setNotice(""); setError(""); }}>
          <span className="support-ticket-card__top"><strong>{row.subject}</strong><span className={"support-status support-status--" + row.status}>{statusLabel(row.status)}</span></span>
          <small>Ticket #{shortReference(row.id)} · {admin ? row.customerName + " · " : ""}{stamp(row.updatedAt)}{row.unread ? " · New Update" : ""}</small>
          <span className="support-excerpt">{row.lastMessage}</span>
        </button>)}</div>
        {page.nextCursor && <button type="button" className="support-secondary" disabled={loading} onClick={() => void load(page.nextCursor)}>Load More</button>}
      </>}
      {creating && <form className="support-form" onSubmit={(event) => { event.preventDefault(); void mutate("create", { subject, category, orderId, body }); }}>
        <div><h3>New Support Ticket</h3><p>Describe what happened so our team can help.</p></div>
        <label className="support-field">Subject<input required maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What do you need help with?" /></label>
        <div className="support-two-fields"><label className="support-field">Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((value) => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></label><label className="support-field">Related Order<select value={orderId} onChange={(event) => setOrderId(event.target.value)}><option value="">Not order-related</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.orderNumber || order.id}</option>)}</select></label></div>
        {orderError && <p className="support-hint">{orderError}</p>}
        <label className="support-field">Message<textarea required maxLength={4000} rows={5} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Include the details we need to investigate. Never send passwords, OTPs or full card details." /></label>
        <span className="support-hint">{body.length}/4000</span>
        <div className="support-actions"><button type="button" className="support-secondary" disabled={busy} onClick={back}>Cancel</button><button type="submit" className="support-primary" disabled={busy || !subject.trim() || !body.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Submit Ticket</button></div>
      </form>}
      {selectedId && ticket && <>
        <div className="support-detail-heading"><h3>{ticket.subject}</h3><span className={"support-status support-status--" + ticket.status}>{statusLabel(ticket.status)}</span><p className="support-reference">Ticket #{shortReference(ticket.id)} <span>·</span> {ticket.category}{ticket.orderNumber ? <> <span>·</span> Order {ticket.orderNumber}</> : null}</p>{admin && <p>{ticket.customerName}</p>}</div>
        <div className="support-thread" aria-label="Ticket conversation">{ticket.messages?.map((message) => message.type === "status" ? <p className="support-event" key={message.id}>{message.body}<small>{stamp(message.createdAt)}</small></p> : <article key={message.id} className={"support-message support-message--" + message.role}><header><strong>{message.role === "staff" ? "PRIME Support" : admin ? ticket.customerName : "You"}</strong><time>{stamp(message.createdAt)}</time></header><p>{message.body}</p></article>)}</div>
        {ticket.status !== "closed" ? <form className="support-form" onSubmit={(event) => { event.preventDefault(); void mutate("reply", { body: reply }); }}><label className="support-field">{admin ? "Reply to Customer" : "Your Reply"}<textarea required rows={3} maxLength={4000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write your reply…" disabled={busy} /></label><div className="support-actions"><span className="support-hint">{reply.length}/4000</span><button type="submit" className="support-primary" disabled={busy || !reply.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Send Reply</button></div></form> : <p className="support-hint">This ticket is closed. Reopen it if you need more help.</p>}
        <div className="support-ticket-actions">{admin ? <label className="support-field">Ticket Status<select disabled={busy} value={ticket.status} onChange={(event) => void mutate("status", { status: event.target.value })}>{(Object.keys(ticketStatusLabels) as TicketStatus[]).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label> : <button type="button" className="support-secondary" disabled={busy} onClick={() => void mutate("status", { status: ticket.status === "closed" || ticket.status === "resolved" ? "open" : "closed" })}>{ticket.status === "closed" || ticket.status === "resolved" ? "Reopen Ticket" : "Close Ticket"}</button>}</div>
      </>}
    </div>}
  </section>;
}
