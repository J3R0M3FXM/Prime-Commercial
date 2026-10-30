"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Loader2, RefreshCw, Search, ShieldCheck, UserRound, Wrench } from "lucide-react";
import { callServerless, getTelegramServerlessSession } from "@/lib/telegram-serverless-client";
import { formatPHP } from "@/lib/currency";

type Customer = {
  id: string; tgUserId?: string; tgName?: string; tgUsername?: string; phoneNumber?: string;
  primeMemberId?: string; points?: number; referralPoints?: number; storeCredits?: number;
  totalOrders?: number; lifetimeSpent?: number; isBanned?: boolean; referredByMemberId?: string; createdAt?: string;
  fingerprintCount?: number; latestFingerprint?: any;
};

function date(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function dateRangeValue(values: Array<string | undefined>, mode: "first" | "last") {
  const parsed = values.map(value => value ? new Date(value) : null)
    .filter((value): value is Date => Boolean(value && Number.isFinite(value.getTime())));
  if (!parsed.length) return undefined;
  return (mode === "first"
    ? parsed.reduce((a, b) => a.getTime() <= b.getTime() ? a : b)
    : parsed.reduce((a, b) => a.getTime() >= b.getTime() ? a : b)).toISOString();
}

function compactDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function TelegramServerlessCustomersPanel({ onBack }: { onBack: () => void }) {
  const [authorized, setAuthorized] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [adjustingCredit, setAdjustingCredit] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadCustomers = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const rows = await callServerless<Customer[]>("manageCustomers", { action: "list" }, 30_000);
      if (!Array.isArray(rows)) throw new Error("The customer list response was invalid.");
      setCustomers(rows.filter(r => !r.isVisitor && Boolean(r.primeMemberId)));
    } catch (err: any) { setError(err?.message || "Could not load customers."); }
    finally { setLoading(false); }
  }, []);

  const openCustomer = async (customer: Customer) => {
    setLoading(true); setError("");
    try {
      const dossier = await callServerless<any>("manageCustomers", { action: "detail", id: customer.id }, 30_000);
      setSelected(dossier);
    } catch (err: any) { setError(err?.message || "Could not load this customer."); }
    finally { setLoading(false); }
  };

  const normalizeIdentifiers = async () => {
    if (!window.confirm("Replace malformed PRIME Member IDs and order numbers in the Serverless test records? Customer, referral, order, and checkout references will be updated.")) return;
    setRepairing(true); setError("");
    try {
      const result = await callServerless<{ changedMemberIds: number; changedOrderNumbers: number }>("manageCustomers", { action: "normalizeTestIdentifiers" }, 60_000);
      await loadCustomers();
      window.alert(`Updated ${result.changedMemberIds} member ID(s) and ${result.changedOrderNumbers} order number(s).`);
    } catch (err: any) { setError(err?.message || "Could not normalize the test identifiers."); }
    finally { setRepairing(false); }
  };

  const reverseCredit = async (transaction: any) => {
    const amount = Math.abs(Number(transaction.amount || 0));
    if (!transaction.orderId || amount <= 0 || !String(transaction.description || "").toLowerCase().includes("verified overpayment")) return;
    if (!window.confirm(`Reverse ${formatPHP(amount)} from this Store Credit entry? This is allowed only when it was the pay-on-delivery amount recorded as an overpayment.`)) return;
    setAdjustingCredit(transaction.id); setError("");
    try {
      await callServerless("manageCustomers", {
        action: "reverseErroneousOverpaymentCredit", orderId: transaction.orderId, amount,
        reason: "Reversed: pay-on-delivery delivery fee was incorrectly credited as verified overpayment.",
      }, 30_000);
      await openCustomer({ id: selected.id });
    } catch (err: any) { setError(err?.message || "Could not reverse this Store Credit entry."); }
    finally { setAdjustingCredit(null); }
  };

  useEffect(() => {
    let current = true;
    getTelegramServerlessSession().then(session => {
      if (!current) return;
      if (!session?.authenticated || !session?.isAdmin) { setError(session?.error || "Verified Telegram admin access is required."); return; }
      setAuthorized(true);
    }).catch((err: any) => { if (current) setError(err?.message || "Open PRIME from Telegram to manage customers."); })
      .finally(() => { if (current) setAuthLoading(false); });
    return () => { current = false; };
  }, []);
  useEffect(() => { if (authorized) void loadCustomers(); }, [authorized, loadCustomers]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter(row => `${row.tgName || ""} ${row.tgUsername || ""} ${row.phoneNumber || ""} ${row.primeMemberId || ""} ${row.tgUserId || ""}`.toLowerCase().includes(needle));
  }, [customers, search]);

  const deviceGroups = useMemo(() => {
    const groups = new Map<string, { key: string; sessions: any[] }>();
    (Array.isArray(selected?.fingerprints) ? selected.fingerprints : []).forEach((fingerprint: any, index: number) => {
      const stableId = fingerprint.deviceId || fingerprint.deviceFingerprintId || fingerprint.hardwareId;
      const key = stableId ? `device:${stableId}` : `session:${fingerprint.sessionToken || index}`;
      const group = groups.get(key) || { key, sessions: [] };
      group.sessions.push(fingerprint);
      groups.set(key, group);
    });
    return [...groups.values()].map(group => {
      const sessions = [...group.sessions].sort((a, b) =>
        (Date.parse(b.lastSeen || "") || 0) - (Date.parse(a.lastSeen || "") || 0));
      return {
        key: group.key,
        sessions,
        latest: sessions[0],
        firstSeen: dateRangeValue(sessions.map(item => item.firstSeen), "first"),
        lastSeen: dateRangeValue(sessions.map(item => item.lastSeen), "last"),
      };
    });
  }, [selected]);

  return <main className="serverless-admin-panel" aria-label="Telegram Serverless customer management">
    <header className="serverless-panel-header">
      <button type="button" onClick={selected ? () => setSelected(null) : onBack} className="serverless-action" aria-label={selected ? "Back to customers" : "Back to Admin modules"}><ArrowLeft className="h-4 w-4"/></button>
      <div className="serverless-panel-header__copy"><h1>{selected ? "Customer dossier" : "Customers"}</h1><p><ShieldCheck className="mr-1 inline h-3 w-3 text-emerald-700"/>Verified Telegram staff</p></div>
      {!selected && <div className="flex gap-1"><button type="button" onClick={() => void normalizeIdentifiers()} disabled={!authorized || loading || repairing} className="serverless-action" aria-label="Normalize test identifiers" title="Normalize test identifiers"><Wrench className={`h-4 w-4 ${repairing ? "animate-pulse" : ""}`}/><span className="sr-only">Fix test IDs</span></button><button type="button" onClick={() => void loadCustomers()} disabled={!authorized || loading || repairing} className="serverless-action" aria-label="Refresh customers"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/></button></div>}
    </header>
    {error && <div role="alert" className="my-2 border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</div>}
    {(authLoading || loading) && <div className="my-2 flex justify-center border bg-white p-5"><Loader2 className="h-5 w-5 animate-spin"/></div>}
    {authorized && !selected && <>
      <label className="serverless-search my-2"><Search aria-hidden="true" className="h-4 w-4"/><input aria-label="Search customers" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search customers, phone, or PRIME ID"/>{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear customer search" className="serverless-search__clear">×</button>}</label>
      <div className="serverless-record-list">
        {visible.map(customer => <button type="button" key={customer.id} className="serverless-record text-left" onClick={() => void openCustomer(customer)}>
          <span className="serverless-record__summary"><span className="rounded-full bg-slate-100 p-2"><UserRound className="h-4 w-4 text-slate-600"/></span><span className="serverless-record__copy"><strong>{customer.tgName || "Telegram customer"}{customer.tgUsername ? ` · @${customer.tgUsername}` : ""}</strong><small>{customer.primeMemberId || customer.tgUserId || customer.id} · {customer.totalOrders || 0} orders · {formatPHP(Number(customer.lifetimeSpent || 0))} · {customer.fingerprintCount || 0} device sessions</small></span><ChevronDown className="h-4 w-4 -rotate-90 text-slate-400"/></span>
        </button>)}
        {!loading && visible.length === 0 && <div className="border border-dashed bg-white p-6 text-center text-xs text-slate-500">{customers.length ? "No customers match this search." : "No Serverless customers yet."}</div>}
      </div>
    </>}
    {authorized && selected && <div className="serverless-record-list">
      <section className="serverless-record p-3"><h2 className="text-sm font-bold">{selected.tgName || "Telegram customer"}{selected.tgUsername ? ` · @${selected.tgUsername}` : ""}</h2><p className="mt-1 text-xs text-slate-500">{selected.primeMemberId || selected.tgUserId || selected.id}</p>
        <div className="serverless-fields mt-3 text-xs">
          <div><b>Phone</b><p>{selected.phoneNumber || "—"}</p></div><div><b>Joined</b><p>{date(selected.createdAt)}</p></div>
          <div><b>Orders</b><p>{selected.totalOrders || 0} ({selected.successfulOrders || 0} completed)</p></div><div><b>Lifetime spend</b><p>{formatPHP(Number(selected.lifetimeSpent || 0))}</p></div>
          <div><b>Purchasing points</b><p>{Number(selected.points || 0).toLocaleString()}</p></div><div><b>Referral points</b><p>{Number(selected.referralPoints || 0).toLocaleString()}</p></div>
          <div><b>Store Credits</b><p>{formatPHP(Number(selected.storeCredits || 0))}</p></div><div><b>Account status</b><p>{selected.isBanned ? "Restricted" : "Active"}</p></div>
        </div>
      </section>
      <details className="serverless-disclosure" open><summary>Store Credit history ({selected.storeCreditTransactions?.length || 0})</summary><div className="serverless-disclosure__body serverless-record-list">
        {(selected.storeCreditTransactions || []).map((transaction: any) => {
          const amount = Number(transaction.amount || 0);
          const typeLabel = transaction.type === "store_credit_received" ? "Credit added"
            : transaction.type === "store_credit_usage" ? "Credit used"
              : transaction.type === "store_credit_refund" ? "Credit returned" : transaction.type;
          const order = (selected.orders || []).find((item: any) => item.id === transaction.orderId);
          return <article key={transaction.id} className="serverless-record p-2">
            <div className="flex items-center justify-between gap-2"><strong className="text-xs">{typeLabel}</strong><strong className={`text-xs ${amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>{amount > 0 ? "+" : ""}{formatPHP(amount)}</strong></div>
            <p className="mt-1 text-[10px] text-slate-500">{date(transaction.createdAt)}{order ? ` · Order #${order.orderNumber || order.id}` : ""}</p>
            {transaction.description && <p className="mt-1 break-words text-[11px]">{transaction.description}</p>}
            {transaction.type === "store_credit_received" && String(transaction.description || "").toLowerCase().includes("verified overpayment") && <button type="button" disabled={Boolean(adjustingCredit)} onClick={() => void reverseCredit(transaction)} className="mt-2 border border-rose-300 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-800 disabled:opacity-50">{adjustingCredit === transaction.id ? "Reversing…" : "Reverse erroneous credit"}</button>}
          </article>;
        })}
        {!selected.storeCreditTransactions?.length && <p className="text-xs text-slate-500">No Store Credit transactions were found in the available ledger history.</p>}
        <p className="px-1 text-[10px] text-slate-500">Read-only ledger view. It shows up to the 200 most recent Store Credit entries and does not change the balance.</p>
      </div></details>
      <details className="serverless-disclosure" open={Boolean(selected.orders?.length)}><summary>Order history ({selected.orders?.length || 0})</summary><div className="serverless-disclosure__body serverless-record-list">
        {(selected.orders || []).map((order: any) => <article key={order.id} className="serverless-record p-2"><strong className="text-xs">#{order.orderNumber || order.id} · {order.status}</strong><p className="text-[10px] text-slate-500">{date(order.createdAt)} · {order.paymentStatus} · {formatPHP(Number(order.totalAmount || 0))}</p><p className="mt-1 text-[10px]">{(order.items || []).map((item: any) => `${item.quantity || 1}× ${item.name || "Item"}`).join(", ") || "No item details"}</p></article>)}
        {!selected.orders?.length && <p className="text-xs text-slate-500">No linked orders.</p>}
      </div></details>
      <details className="serverless-disclosure"><summary>Devices &amp; sessions ({deviceGroups.length} {deviceGroups.length === 1 ? "device" : "devices"} · {selected.fingerprints?.length || 0} captures)</summary><div className="serverless-disclosure__body serverless-record-list">
        {deviceGroups.map(group => <article key={group.key} className="serverless-device-card">
          <div className="serverless-device-card__header"><div><b>{group.latest.platform || "Device"}</b><small>Telegram Mini App session</small></div><span>{group.sessions.length} {group.sessions.length === 1 ? "capture" : "captures"}</span></div>
          <div className="serverless-device-card__dates"><p><small>First seen</small><b>{compactDate(group.firstSeen)}</b></p><p><small>Last seen</small><b>{compactDate(group.lastSeen)}</b></p></div>
          <details className="serverless-device-card__technical"><summary>Device identifiers &amp; browser details</summary><div>
            <p className="break-all"><b>Device ID</b><br/>{group.latest.deviceId || "—"}</p>
            <p className="break-all"><b>Hardware ID</b><br/>{group.latest.hardwareId || "—"}</p>
            <p className="break-all"><b>Device fingerprint</b><br/>{group.latest.deviceFingerprintId || "—"}</p>
            <p className="break-all"><b>Browser user agent</b><br/>{group.latest.userAgent || "—"}</p>
          </div></details>
        </article>)}
        {!selected.fingerprints?.length && <p className="text-xs text-slate-500">No saved fingerprint history.</p>}
      </div></details>
      <details className="serverless-disclosure"><summary>Linked accounts ({selected.sharedAccounts?.length || 0})</summary><div className="serverless-disclosure__body serverless-record-list">
        {(selected.sharedAccounts || []).map((account: any) => <article key={account.id} className="serverless-record p-2 text-xs"><b>{account.tgName || "Telegram customer"}{account.tgUsername ? ` · @${account.tgUsername}` : ""}</b><p>{account.primeMemberId || account.id} · {account.matchCount} identifier matches ({(account.matchTypes || []).join(", ")})</p></article>)}
        {!selected.sharedAccounts?.length && <p className="text-xs text-slate-500">No matching device identifiers found in Serverless session history. Fingerprint matches are review signals, not verified identity.</p>}
      </div></details>
      <p className="px-1 text-[10px] text-slate-500">Device fingerprint matches can be spoofed and should only guide staff review.</p>
    </div>}
  </main>;
}
