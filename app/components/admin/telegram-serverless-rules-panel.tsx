"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, Edit2, Loader2, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { callServerless, getTelegramServerlessSession } from "@/lib/telegram-serverless-client";

type Row = Record<string, any>;
type Props = { mode: "charges" | "promos"; onBack: () => void };
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function blankCharge() { return { name: "", type: "fixed", rate: "0", isActive: true, isDefault: true, date: "", time: "", days: [] as number[], isTemporal: false, isOvernight: false, isRecurring: false }; }
function blankPromo() { return { code: "", title: "", description: "", voucherType: "shop_voucher", discountType: "fixed", discountValue: "0", maxDiscountAmount: "", cappedShippingDiscount: "", cashbackPercentage: "", minSpend: "0", minItemQuantity: "", customerEligibility: "all", eligibleCustomerId: "", minPreviousOrders: "", eligibleTiers: [] as string[], allowedPaymentMethods: ["all"], allowedCourierIds: ["all"], activeDaysOfWeek: [0,1,2,3,4,5,6], isPaydayOnly: false, flashHourStart: "", flashHourEnd: "", totalUsageLimit: "", usageLimitPerCustomer: "1", isActive: true, startDate: "", endDate: "" }; }
function chargeSchedule(row: Row) {
  if (row.schedules && typeof row.schedules === "object") return row.schedules;
  try { const parsed = typeof row.description === "string" ? JSON.parse(row.description) : {}; return parsed && typeof parsed === "object" ? parsed : {}; }
  catch { return {}; }
}

export default function TelegramServerlessRulesPanel({ mode, onBack }: Props) {
  const isCharge = mode === "charges";
  const endpoint = isCharge ? "manageCharges" : "managePromos";
  const [authorized, setAuthorized] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Row>(isCharge ? blankCharge() : blankPromo());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setBusy(true); setError("");
    try {
      const result = await callServerless<Row[]>(endpoint, { action: "list" });
      setRows(Array.isArray(result) ? result : []);
    } catch (err: any) { setError(err?.message || `Could not load ${mode}.`); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let active = true;
    getTelegramServerlessSession().then((session) => {
      if (!active) return;
      if (!session?.authenticated || !session?.isAdmin) { setError(session?.error || "Verified Telegram admin access is required."); return; }
      setAuthorized(true);
    }).catch((err: any) => { if (active) setError(err?.message || "Open the Admin panel from Telegram."); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (authorized) void load(); }, [authorized]);

  const reset = () => { setEditingId(""); setForm(isCharge ? blankCharge() : blankPromo()); setFormOpen(false); };
  const startAdd = () => { setEditingId(""); setForm(isCharge ? blankCharge() : blankPromo()); setError(""); setNotice(""); setFormOpen(true); };
  const edit = (row: Row) => {
    setFormOpen(true);
    setEditingId(String(row.id));
    if (isCharge) {
      let metadata: Row = {};
      const schedule = chargeSchedule(row);
      setForm({ name: row.name || "", type: row.type || "fixed", rate: String(row.rate ?? row.amount ?? 0), isActive: row.isActive !== false, isDefault: typeof schedule.isDefault === "boolean" ? schedule.isDefault : row.isDefault !== false, date: schedule.date || "", time: schedule.time || "", days: Array.isArray(schedule.days) ? schedule.days : Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [], isTemporal: Boolean(schedule.isTemporal ?? schedule.temporal), isOvernight: Boolean(schedule.isOvernight ?? schedule.overnight), isRecurring: Boolean(schedule.isRecurring ?? schedule.recurring) });
    } else setForm({ ...blankPromo(), ...row, discountValue: String(row.discountValue ?? 0), minSpend: String(row.minSpend ?? 0), maxDiscountAmount: row.maxDiscountAmount == null ? "" : String(row.maxDiscountAmount), cappedShippingDiscount: row.cappedShippingDiscount == null ? "" : String(row.cappedShippingDiscount), cashbackPercentage: row.cashbackPercentage == null ? "" : String(row.cashbackPercentage), minItemQuantity: row.minItemQuantity == null ? "" : String(row.minItemQuantity), minPreviousOrders: row.minPreviousOrders == null ? "" : String(row.minPreviousOrders), flashHourStart: row.flashHourStart == null ? "" : String(row.flashHourStart), flashHourEnd: row.flashHourEnd == null ? "" : String(row.flashHourEnd), totalUsageLimit: row.totalUsageLimit == null ? "" : String(row.totalUsageLimit), usageLimitPerCustomer: String(row.usageLimitPerCustomer ?? 1), startDate: dateInput(row.startDate), endDate: dateInput(row.endDate) });
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      let payload: Row;
      if (isCharge) {
        const { date, time, days, isTemporal, isOvernight, isRecurring, isDefault, ...base } = form;
        if (isTemporal && !date) throw new Error("Choose a date for a temporal charge.");
        if (isRecurring && days.length === 0) throw new Error("Select at least one weekday for a recurring charge.");
        const description = JSON.stringify({ isDefault, date, time, days, daysOfWeek: days, isTemporal, temporal: isTemporal, isOvernight, isRecurring });
        payload = { ...base, rate: Number(form.rate), description };
      } else {
        const asNumberOrNull = (value: any) => value === "" || value == null ? null : Number(value);
        if (form.customerEligibility === "specific_customer" && !String(form.eligibleCustomerId || "").trim()) throw new Error("Enter the customer's Prime Member ID or Telegram ID for a customer-specific promo.");
        if (!form.activeDaysOfWeek.length) throw new Error("Select at least one day when this promo can be used.");
        if ((form.flashHourStart === "") !== (form.flashHourEnd === "")) throw new Error("Enter both flash hours or leave both blank.");
        if (form.flashHourStart !== "" && Number(form.flashHourEnd) <= Number(form.flashHourStart)) throw new Error("Flash end hour must be later than the start hour.");
        if (form.startDate && form.endDate && form.endDate < form.startDate) throw new Error("Expiry date must be on or after the start date.");
        payload = { code: String(form.code).trim().toUpperCase(), title: form.title, description: form.description, voucherType: form.voucherType, discountType: form.discountType, discountValue: Number(form.discountValue), maxDiscountAmount: asNumberOrNull(form.maxDiscountAmount), cappedShippingDiscount: asNumberOrNull(form.cappedShippingDiscount), cashbackPercentage: asNumberOrNull(form.cashbackPercentage), minSpend: Number(form.minSpend), minItemQuantity: asNumberOrNull(form.minItemQuantity), customerEligibility: form.customerEligibility, eligibleCustomerId: String(form.eligibleCustomerId || "").trim(), minPreviousOrders: asNumberOrNull(form.minPreviousOrders), eligibleTiers: form.eligibleTiers, allowedPaymentMethods: form.allowedPaymentMethods, allowedCourierIds: form.allowedCourierIds, activeDaysOfWeek: form.activeDaysOfWeek, isPaydayOnly: form.isPaydayOnly, flashHourStart: asNumberOrNull(form.flashHourStart), flashHourEnd: asNumberOrNull(form.flashHourEnd), totalUsageLimit: asNumberOrNull(form.totalUsageLimit), usageLimitPerCustomer: Number(form.usageLimitPerCustomer), isActive: form.isActive, startDate: form.startDate ? new Date(`${form.startDate}T00:00:00+08:00`).toISOString() : null, endDate: form.endDate ? new Date(`${form.endDate}T23:59:59+08:00`).toISOString() : null };
      }
      await callServerless(endpoint, { ...payload, action: editingId ? "update" : "create", ...(editingId ? { id: editingId } : {}) });
      setNotice(editingId ? "Configuration updated." : "Configuration created."); reset(); await load();
    } catch (err: any) { setError(err?.message || `Could not save ${mode}.`); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!window.confirm(`Delete this ${isCharge ? "charge" : "promo"}?`)) return;
    setBusy(true); setError("");
    try { await callServerless(endpoint, { action: "delete", id }); setNotice("Configuration deleted."); if (editingId === id) reset(); await load(); }
    catch (err: any) { setError(err?.message || "Could not delete configuration."); }
    finally { setBusy(false); }
  };
  const toggleActive = async (row: Row) => {
    setBusy(true); setError(""); setNotice("");
    try { await callServerless(endpoint, { action:"update", id:row.id, isActive:!row.isActive }); setNotice(row.isActive ? "Configuration disabled." : "Configuration enabled."); await load(); }
    catch (err:any) { setError(err?.message || "Could not change configuration status."); }
    finally { setBusy(false); }
  };
  const patch = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));

  const setCsv = (key: string, value: string) => patch(key, value.split(",").map((part)=>part.trim()).filter(Boolean));
  const csv = (value: any) => Array.isArray(value) ? value.join(", ") : "";
  const toggleDay = (key: string, days: number[], index: number, checked: boolean) => patch(key, checked ? [...days,index].sort() : days.filter((day)=>day!==index));

  return <main className="serverless-admin-panel" aria-label={`Serverless ${mode} configuration`}>
    <header className="serverless-panel-header"><button type="button" onClick={onBack} className="serverless-action" aria-label="Back to Admin modules"><ArrowLeft className="h-4 w-4"/></button><div className="serverless-panel-header__copy"><h1>{isCharge?"Charges":"Promos"}</h1><p>Saved configuration</p></div><button type="button" disabled={!authorized} onClick={startAdd} className="serverless-action serverless-action--primary"><Plus className="h-4 w-4"/>Add</button><button type="button" disabled={busy} onClick={()=>void load()} className="serverless-action" aria-label="Refresh list"><RefreshCw className="h-4 w-4"/></button></header>
    {error&&!formOpen&&<div role="alert" className="my-2 border border-red-300 bg-red-50 p-2 text-xs text-red-800">{error}</div>}{notice&&<div role="status" className="my-2 border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">{notice}</div>}
    {!authorized?<div className="my-2 border bg-white p-5 text-center text-xs">Verifying Telegram administrator…</div>:<>
      <div className="serverless-panel-toolbar"><strong className="flex-1 text-xs uppercase">{isCharge?"Saved charges":"Saved promotions"} · {rows.length}</strong>{busy&&<Loader2 className="h-4 w-4 animate-spin"/>}</div>
      {rows.length===0?<p className="border bg-white p-4 text-center text-xs text-slate-600">No {isCharge?"charges":"promotions"} configured.</p>:<div className="serverless-record-list">{rows.map((row)=><article key={row.id} className="serverless-record">
        <div className="serverless-record__summary"><div className="serverless-record__copy"><strong>{isCharge?row.name:`${row.code} · ${row.title}`}</strong><small>{isCharge?`${row.type} · ${row.rate} · ${chargeSchedule(row).isDefault===true?"Default":chargeSchedule(row).isTemporal||chargeSchedule(row).temporal?"Temporal":chargeSchedule(row).isRecurring||chargeSchedule(row).recurring?"Recurring":"Scheduled"}`:`${row.voucherType} · ${row.discountType} · ${row.usageLimitPerCustomer || 1} per customer · ${row.totalUsageLimit == null ? "unlimited total" : `${row.totalUsageLimit} total`}`}</small></div><button type="button" disabled={busy} onClick={()=>edit(row)} className="serverless-action" aria-label="Edit configuration"><Edit2 className="h-4 w-4"/></button></div>
        <div className="serverless-record__summary border-t border-slate-100"><label className="serverless-switch flex-1"><span>{row.isActive?"Enabled":"Disabled"}</span><input type="checkbox" checked={row.isActive!==false} disabled={busy} onChange={()=>void toggleActive(row)}/><span className="serverless-switch__track"/></label><button type="button" disabled={busy} onClick={()=>void remove(String(row.id))} className="serverless-action serverless-action--danger" aria-label="Delete"><Trash2 className="h-4 w-4"/></button></div>
        <details className="serverless-disclosure border-x-0 border-b-0"><summary>Configuration details <ChevronDown className="float-right h-4 w-4"/></summary><div className="serverless-disclosure__body text-[10px] text-slate-600">{isCharge?<p>{row.isDefault?"Default checkout charge":"Scheduled charge"} · {row.isActive?"Enabled":"Disabled"}</p>:<p>{row.description||"No internal notes"}</p>}</div></details>
      </article>)}</div>}
    </>}

    {formOpen&&<div className="serverless-dialog-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy)reset();}}><section role="dialog" aria-modal="true" aria-labelledby="rules-dialog-title" className="serverless-dialog">
      <header className="serverless-dialog__header"><h2 id="rules-dialog-title">{editingId?"Edit":"Add"} {isCharge?"charge":"promotion"}</h2><button type="button" disabled={busy} onClick={reset} className="serverless-action" aria-label="Close"><X className="h-4 w-4"/></button></header>
      <form onSubmit={save} className="serverless-dialog__form"><div className="serverless-dialog__body space-y-2">
        {error&&<div role="alert" className="border border-red-300 bg-red-50 p-2 text-xs text-red-800">{error}</div>}
        {isCharge?<>
          <div className="serverless-fields"><label className="serverless-field">Charge name<input required maxLength={120} value={form.name} onChange={(e)=>patch("name",e.target.value)}/></label><label className="serverless-field">Value type<select value={form.type} onChange={(e)=>patch("type",e.target.value)}><option value="fixed">Fixed PHP</option><option value="percentage">Percent</option></select></label><label className="serverless-field">{form.type==="fixed"?"Amount (PHP)":"Rate (%)"}<input required type="number" min="0" step="0.01" value={form.rate} onChange={(e)=>patch("rate",e.target.value)}/></label><label className="serverless-switch"><span>Enabled</span><input type="checkbox" checked={form.isActive} onChange={(e)=>patch("isActive",e.target.checked)}/><span className="serverless-switch__track"/></label><label className="serverless-switch col-span-2"><span>Always add to bill (no schedule)</span><input type="checkbox" checked={form.isDefault} onChange={(e)=>patch("isDefault",e.target.checked)}/><span className="serverless-switch__track"/></label></div>
          {!form.isDefault&&<details className="serverless-disclosure" open><summary>Schedule</summary><div className="serverless-disclosure__body space-y-2"><div className="serverless-fields"><label className="serverless-field">Date · required for temporal<input type="date" disabled={!form.isTemporal} required={form.isTemporal} value={form.date} onChange={(e)=>patch("date",e.target.value)}/></label><label className="serverless-field">Start time<input type="time" value={form.time} onChange={(e)=>patch("time",e.target.value)}/></label></div><div className="serverless-fields"><label className="serverless-switch"><span>Temporal · selected date only</span><input type="checkbox" checked={form.isTemporal} onChange={(e)=>setForm((current)=>({...current,isTemporal:e.target.checked,isRecurring:e.target.checked?false:current.isRecurring,date:e.target.checked?current.date:""}))}/><span className="serverless-switch__track"/></label><label className="serverless-switch"><span>Recurring · selected weekdays</span><input type="checkbox" checked={form.isRecurring} onChange={(e)=>setForm((current)=>({...current,isRecurring:e.target.checked,isTemporal:e.target.checked?false:current.isTemporal,date:e.target.checked?"":current.date}))}/><span className="serverless-switch__track"/></label><label className="serverless-switch"><span>Overnight · 10 PM–6 AM</span><input type="checkbox" checked={form.isOvernight} onChange={(e)=>patch("isOvernight",e.target.checked)}/><span className="serverless-switch__track"/></label></div><div className="serverless-fields">{weekdays.map((day,index)=><label key={day} className="serverless-switch justify-start"><input type="checkbox" checked={form.days.includes(index)} onChange={(e)=>toggleDay("days",form.days,index,e.target.checked)}/><span>{day}</span></label>)}</div><p className="text-[9px] text-slate-500">Temporal applies on the selected date; recurring uses selected weekdays. Overnight is an additional 10:00 PM–6:00 AM Philippine-time restriction.</p></div></details>}
        </>:<>
          <div className="serverless-fields"><label className="serverless-field">Voucher code<input required maxLength={80} className="uppercase" value={form.code} onChange={(e)=>patch("code",e.target.value.toUpperCase())}/><small>Code customers enter at checkout. Must be unique.</small></label><label className="serverless-field">Title<input required value={form.title} onChange={(e)=>patch("title",e.target.value)}/><small>Internal name to identify this promotion in Admin.</small></label><label className="serverless-field">Voucher type<select value={form.voucherType} onChange={(e)=>{patch("voucherType",e.target.value);if(e.target.value==="new_buyer_voucher")patch("customerEligibility","new_customer");}}><option value="shop_voucher">Shop voucher</option><option value="shipping_voucher">Free shipping</option><option value="new_buyer_voucher">New buyer</option><option value="cashback_voucher">Cashback</option></select><small>Category for organizing the offer; Reward below controls what checkout applies.</small></label><label className="serverless-field">Reward<select value={form.discountType} onChange={(e)=>patch("discountType",e.target.value)}><option value="fixed">Fixed PHP</option><option value="percentage">Percent</option><option value="free_shipping">Free shipping</option><option value="shipping_discount">Capped shipping</option><option value="coins_cashback">Points cashback</option></select><small>Choose a cash discount, shipping reduction, or points reward.</small></label><label className="serverless-field">Reward value<input type="number" min="0" step="0.01" value={form.discountValue} onChange={(e)=>patch("discountValue",e.target.value)}/><small>PHP amount or percentage, depending on Reward. For free shipping, this is ignored.</small></label><label className="serverless-field">Minimum spend (PHP)<input type="number" min="0" step="0.01" value={form.minSpend} onChange={(e)=>patch("minSpend",e.target.value)}/><small>Minimum product subtotal required; 0 means no minimum.</small></label></div>
          <details className="serverless-disclosure"><summary>Reward caps and basket rules</summary><div className="serverless-disclosure__body serverless-fields"><label className="serverless-field">Maximum discount (PHP)<input type="number" min="0" value={form.maxDiscountAmount} onChange={(e)=>patch("maxDiscountAmount",e.target.value)}/><small>Caps a percentage discount or points award; blank means no separate cap.</small></label><label className="serverless-field">Shipping subsidy cap (PHP)<input type="number" min="0" value={form.cappedShippingDiscount} onChange={(e)=>patch("cappedShippingDiscount",e.target.value)}/><small>Maximum shipping fee covered for capped-shipping rewards.</small></label><label className="serverless-field">Cashback percentage<input type="number" min="0" max="100" value={form.cashbackPercentage} onChange={(e)=>patch("cashbackPercentage",e.target.value)}/><small>Points returned as a percentage of eligible product spend.</small></label><label className="serverless-field">Minimum item quantity<input type="number" min="0" value={form.minItemQuantity} onChange={(e)=>patch("minItemQuantity",e.target.value)}/><small>Total number of items required; blank or 0 means no quantity minimum.</small></label></div></details>
          <details className="serverless-disclosure"><summary>Audience and checkout restrictions</summary><div className="serverless-disclosure__body space-y-2"><div className="serverless-fields"><label className="serverless-field">Who can use this promo?<select value={form.customerEligibility} onChange={(e)=>patch("customerEligibility",e.target.value)}><option value="all">All customers</option><option value="new_customer">New customers (no completed orders)</option><option value="min_orders">Customers with a minimum order count</option><option value="tier_restricted">Selected loyalty tiers</option><option value="specific_customer">One specific customer</option></select><small>Controls which customer accounts pass checkout validation.</small></label>{form.customerEligibility==="specific_customer"&&<label className="serverless-field">Eligible customer's Prime Member ID or Telegram ID<input required placeholder="e.g. PRIME member ID or Telegram numeric ID" value={form.eligibleCustomerId} onChange={(e)=>patch("eligibleCustomerId",e.target.value.trim())}/><small>Find the customer in Admin → Customers. Use their displayed Prime Member ID or Telegram ID. Only that account can redeem this code.</small></label>}{form.customerEligibility==="min_orders"&&<label className="serverless-field">Minimum completed orders<input type="number" min="1" value={form.minPreviousOrders} onChange={(e)=>patch("minPreviousOrders",e.target.value)}/><small>Counts completed/delivered orders only.</small></label>}{form.customerEligibility==="tier_restricted"&&<label className="serverless-field">Eligible tiers<input placeholder="VIP, Gold" value={csv(form.eligibleTiers)} onChange={(e)=>patch("eligibleTiers",e.target.value.split(",").map((x)=>x.trim()).filter(Boolean))}/><small>Comma-separated loyalty tier names.</small></label>}<label className="serverless-field">Payment method IDs<input placeholder="all or IDs, comma separated" value={csv(form.allowedPaymentMethods)} onChange={(e)=>setCsv("allowedPaymentMethods",e.target.value)}/><small>Use `all` for any payment method, or enter the configured IDs separated by commas.</small></label><label className="serverless-field">Courier IDs<input placeholder="all or IDs, comma separated" value={csv(form.allowedCourierIds)} onChange={(e)=>setCsv("allowedCourierIds",e.target.value)}/><small>Use `all` for any courier, or enter configured courier IDs separated by commas.</small></label></div></div></details>
          <details className="serverless-disclosure"><summary>Schedule, redemption limits and description</summary><div className="serverless-disclosure__body space-y-2"><div className="serverless-fields">{weekdays.map((day,index)=><label key={day} className="serverless-switch justify-start"><input type="checkbox" checked={form.activeDaysOfWeek.includes(index)} onChange={(e)=>toggleDay("activeDaysOfWeek",form.activeDaysOfWeek,index,e.target.checked)}/><span>{day}</span></label>)}<p className="col-span-2 text-[11px] text-slate-500">Select the Philippine weekdays when the code can be used. Leave all selected for every day.</p><label className="serverless-switch col-span-2"><span>Philippine payday only</span><input type="checkbox" checked={form.isPaydayOnly} onChange={(e)=>patch("isPaydayOnly",e.target.checked)}/><span className="serverless-switch__track"/></label><p className="col-span-2 text-[11px] text-slate-500">Restricts use to the 15th and the 28th through month-end.</p><label className="serverless-field">Flash start hour (PHT)<input type="number" min="0" max="23" value={form.flashHourStart} onChange={(e)=>patch("flashHourStart",e.target.value)}/><small>Optional 24-hour start, 0–23. Set together with end hour.</small></label><label className="serverless-field">Flash end hour (PHT)<input type="number" min="0" max="23" value={form.flashHourEnd} onChange={(e)=>patch("flashHourEnd",e.target.value)}/><small>Optional exclusive end hour; e.g. 9 means use ends at 9:00 AM.</small></label><label className="serverless-field">Start date · PHT<input type="date" value={form.startDate} onChange={(e)=>patch("startDate",e.target.value)}/><small>First calendar day the promo is active; blank means no start date.</small></label><label className="serverless-field">Expiry date · PHT<input type="date" value={form.endDate} onChange={(e)=>patch("endDate",e.target.value)}/><small>Last calendar day the promo is active; blank means no expiry.</small></label><label className="serverless-field">Total promo uses<input type="number" min="1" value={form.totalUsageLimit} onChange={(e)=>patch("totalUsageLimit",e.target.value)}/><small>Maximum successful redemptions across all customers. With 1 use per customer, this is also the maximum number of customers. Blank means unlimited.</small></label><label className="serverless-field">Uses allowed per customer<input type="number" min="1" value={form.usageLimitPerCustomer} onChange={(e)=>patch("usageLimitPerCustomer",e.target.value)}/><small>1 = single use by each customer; 2 or more allows repeat use. This does not set the total use count.</small></label></div><label className="serverless-field">Promotion description<textarea value={form.description} onChange={(e)=>patch("description",e.target.value)}/><small>This description can be shown to customers. Do not put private or internal notes here.</small></label></div></details>
          <label className="serverless-switch"><span>Promotion enabled</span><input type="checkbox" checked={form.isActive} onChange={(e)=>patch("isActive",e.target.checked)}/><span className="serverless-switch__track"/></label>
        </>}
      </div><footer className="serverless-dialog__footer"><button type="button" disabled={busy} onClick={reset} className="serverless-action">Cancel</button><button disabled={busy} className="serverless-action serverless-action--primary">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}{editingId?"Save changes":"Save"}</button></footer></form>
    </section></div>}
  </main>;
}

function dateInput(value: any) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}` : "";
}
