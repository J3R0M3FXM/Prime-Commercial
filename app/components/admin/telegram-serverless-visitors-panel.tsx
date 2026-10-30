"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Loader2, RefreshCw, Search, ShieldCheck, UserRound } from "lucide-react";
import { callServerless, getTelegramServerlessSession } from "@/lib/telegram-serverless-client";
import { formatPHP } from "@/lib/currency";

type Visitor = {
  id: string; tgUserId?: string; tgName?: string; tgUsername?: string; phoneNumber?: string;
  primeMemberId?: string; visitorBadgeNo?: string; isVisitor?: boolean;
  totalOrders?: number; lifetimeSpent?: number; createdAt?: string;
  fingerprintCount?: number; latestFingerprint?: any;
};

function date(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

export default function TelegramServerlessVisitorsPanel({ onBack }: { onBack: () => void }) {
  const [authorized, setAuthorized] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadVisitors = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const rows = await callServerless<Visitor[]>("manageCustomers", { action: "list" }, 30_000);
      if (!Array.isArray(rows)) throw new Error("The visitor list response was invalid.");
      // Filter for visitors (isVisitor === true or no primeMemberId)
      setVisitors(rows.filter(r => r.isVisitor || !r.primeMemberId));
    } catch (err: any) { setError(err?.message || "Could not load visitors."); }
    finally { setLoading(false); }
  }, []);

  const openVisitor = async (visitor: Visitor) => {
    setLoading(true); setError("");
    try {
      const dossier = await callServerless<any>("manageCustomers", { action: "detail", id: visitor.id }, 30_000);
      setSelected(dossier);
    } catch (err: any) { setError(err?.message || "Could not load this visitor."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    let current = true;
    getTelegramServerlessSession().then(session => {
      if (!current) return;
      if (!session?.authenticated || !session?.isAdmin) { setError(session?.error || "Verified Telegram admin access is required."); return; }
      setAuthorized(true);
    }).catch((err: any) => { if (current) setError(err?.message || "Open PRIME from Telegram to manage visitors."); })
      .finally(() => { if (current) setAuthLoading(false); });
    return () => { current = false; };
  }, []);
  useEffect(() => { if (authorized) void loadVisitors(); }, [authorized, loadVisitors]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return visitors;
    return visitors.filter(row => `${row.tgName || ""} ${row.tgUsername || ""} ${row.phoneNumber || ""} ${row.visitorBadgeNo || ""} ${row.tgUserId || ""}`.toLowerCase().includes(needle));
  }, [visitors, search]);

  return <main className="serverless-admin-panel" aria-label="Telegram Serverless visitor management">
    <header className="serverless-panel-header">
      <button type="button" onClick={selected ? () => setSelected(null) : onBack} className="serverless-action" aria-label={selected ? "Back to visitors" : "Back to Admin modules"}><ArrowLeft className="h-4 w-4"/></button>
      <div className="serverless-panel-header__copy"><h1>{selected ? "Visitor dossier" : "Visitors"}</h1><p><ShieldCheck className="mr-1 inline h-3 w-3 text-emerald-700"/>Verified Telegram staff</p></div>
      {!selected && <div className="flex gap-1"><button type="button" onClick={() => void loadVisitors()} disabled={!authorized || loading} className="serverless-action" aria-label="Refresh visitors"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/></button></div>}
    </header>
    {error && <div role="alert" className="my-2 border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</div>}
    {(authLoading || loading) && <div className="my-2 flex justify-center border bg-white p-5"><Loader2 className="h-5 w-5 animate-spin"/></div>}
    {authorized && !selected && <>
      <label className="serverless-search my-2"><Search aria-hidden="true" className="h-4 w-4"/><input aria-label="Search visitors" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search visitors, phone, or badge no."/>{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear visitor search" className="serverless-search__clear">×</button>}</label>
      <div className="serverless-record-list">
        {visible.map(visitor => <button type="button" key={visitor.id} className="serverless-record text-left" onClick={() => void openVisitor(visitor)}>
          <span className="serverless-record__summary"><span className="rounded-full bg-slate-100 p-2"><UserRound className="h-4 w-4 text-slate-600"/></span><span className="serverless-record__copy"><strong>{visitor.tgName || "Telegram visitor"}{visitor.tgUsername ? ` · @${visitor.tgUsername}` : ""}</strong><small>{visitor.visitorBadgeNo || `VIS-${visitor.tgUserId || visitor.id.slice(0, 6)}`} · {visitor.totalOrders || 0} orders · {formatPHP(Number(visitor.lifetimeSpent || 0))} · Enrolled {date(visitor.createdAt)}</small></span><ChevronDown className="h-4 w-4 -rotate-90 text-slate-400"/></span>
        </button>)}
        {!loading && visible.length === 0 && <div className="border border-dashed bg-white p-6 text-center text-xs text-slate-500">{visitors.length ? "No visitors match this search." : "No active app visitors yet."}</div>}
      </div>
    </>}
    {authorized && selected && <div className="serverless-record-list">
      <section className="serverless-record p-3"><h2 className="text-sm font-bold">{selected.tgName || "Telegram visitor"}{selected.tgUsername ? ` · @${selected.tgUsername}` : ""}</h2><p className="mt-1 text-xs text-slate-500">{selected.visitorBadgeNo || `VIS-${selected.tgUserId || selected.id}`}</p>
        <div className="serverless-fields mt-3 text-xs">
          <div><b>Badge No.</b><p className="font-mono font-bold text-amber-700">{selected.visitorBadgeNo || `VIS-${selected.tgUserId || selected.id}`}</p></div><div><b>Phone</b><p>{selected.phoneNumber || "—"}</p></div>
          <div><b>Enrolled</b><p>{date(selected.createdAt)}</p></div><div><b>Orders</b><p>{selected.totalOrders || 0} (0 completed)</p></div>
          <div><b>Status</b><p className="text-amber-600 font-bold">Visitor (Pending First Successful Order for PRIME ID & Referral Bonus Eligibility)</p></div>
        </div>
      </section>
      <details className="serverless-disclosure" open={Boolean(selected.orders?.length)}><summary>Order history ({selected.orders?.length || 0})</summary><div className="serverless-disclosure__body serverless-record-list">
        {(selected.orders || []).map((order: any) => <article key={order.id} className="serverless-record p-2"><strong className="text-xs">#{order.orderNumber || order.id} · {order.status}</strong><p className="text-[10px] text-slate-500">{date(order.createdAt)} · {order.paymentStatus} · {formatPHP(Number(order.totalAmount || 0))}</p><p className="mt-1 text-[10px]">{(order.items || []).map((item: any) => `${item.quantity || 1}× ${item.name || "Item"}`).join(", ") || "No item details"}</p></article>)}
        {!selected.orders?.length && <p className="text-xs text-slate-500">No linked orders yet. Once an order is completed, this visitor will automatically migrate to Customers and receive a permanent PRIME Member ID.</p>}
      </div></details>
    </div>}
  </main>;
}
