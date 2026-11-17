"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CreditCard, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { AssetPickerButton } from "./asset-library-panel";
import { isReusableImageReference } from "@/lib/asset-library";
import { callServerless, getTelegramServerlessSession, resolveTelegramMedia, uploadPaymentImage } from "@/lib/telegram-serverless-client";

type Method = {
  id: string; name: string; paymentType: "manual_transfer" | "qr_code" | "secured_payment_link" | "api" | "crypto"; logo?: string;
  accountName?: string; accountNumber?: string; qrCodeImage?: string; paymentLinkUrl?: string; webhookUrl?: string; publicKey?: string; secretKeyConfigured?: boolean; walletAddress?: string;
  isActive: boolean; sortOrder: number;
};
type Form = Omit<Method, "id" | "isActive" | "sortOrder"> & { secretKey?: string };
const emptyForm: Form = { name: "", paymentType: "manual_transfer", logo: "", accountName: "", accountNumber: "", qrCodeImage: "", paymentLinkUrl: "", webhookUrl: "", publicKey: "", secretKey: "", walletAddress: "" };
export default function TelegramServerlessPaymentsPanel({ onBack }: { onBack: () => void }) {
  const [authorized, setAuthorized] = useState(false);
  const [methods, setMethods] = useState<Method[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setBusy(true); setError("");
    try { const rows = await callServerless<Method[]>("managePaymentMethods", { action: "list" }); setMethods(Array.isArray(rows) ? rows : []); }
    catch (err: any) { setError(err?.message || "Could not load payment methods."); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let current = true;
    getTelegramServerlessSession().then((session) => {
      if (!current) return;
      if (!session?.authenticated || !session?.isAdmin) { setError(session?.error || "Verified Telegram admin access is required."); return; }
      setAuthorized(true);
    }).catch((err: any) => { if (current) setError(err?.message || "Open Admin from the Telegram Mini App."); });
    return () => { current = false; };
  }, []);
  useEffect(() => { if (authorized) void load(); }, [authorized]);

  const resetForm = () => { setForm(emptyForm); setEditingId(""); setFormOpen(false); };
  const startAdd = () => { setForm(emptyForm); setEditingId(""); setError(""); setMessage(""); setFormOpen(true); };
  const edit = (method: Method) => {
    setFormOpen(true);
    setEditingId(method.id);
    setForm({ name: method.name || "", paymentType: method.paymentType, logo: method.logo || "", accountName: method.accountName || "", accountNumber: method.accountNumber || "", qrCodeImage: method.qrCodeImage || "", paymentLinkUrl: method.paymentLinkUrl || (method.paymentType === "secured_payment_link" ? method.publicKey || "" : ""), webhookUrl: method.webhookUrl || "", publicKey: method.paymentType === "secured_payment_link" ? "" : method.publicKey || "", secretKey: "", secretKeyConfigured: method.secretKeyConfigured, walletAddress: method.walletAddress || "" });
    setError(""); setMessage("");
  };
  const upload = async (file: File | undefined, bucket: "payment-method-logos" | "payment-qr-codes") => {
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (bucket === "payment-qr-codes" && !isReusableImageReference(form.logo)) throw new Error("Upload a payment provider logo before the QR image.");
      const reference = await uploadPaymentImage(file, bucket);
      setForm((current) => ({ ...current, ...(bucket === "payment-method-logos" ? { logo: reference } : { qrCodeImage: reference }) }));
      setMessage(bucket === "payment-method-logos" ? "Logo uploaded." : "QR image uploaded.");
    } catch (err: any) { setError(err?.message || "Could not upload payment image."); }
    finally { setBusy(false); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (form.paymentType === "manual_transfer" && !(form.accountName?.trim() && form.accountNumber?.trim())) throw new Error("Add the recipient account name and account/mobile number.");
      if (form.paymentType === "qr_code" && !isReusableImageReference(form.qrCodeImage)) throw new Error("Upload a QR image before saving this method.");
      if (form.paymentType === "secured_payment_link") {
        let link: URL; try { link = new URL(form.paymentLinkUrl || ""); } catch { throw new Error("Enter a valid HTTPS payment link."); }
        if (link.protocol !== "https:") throw new Error("Payment links must use HTTPS.");
      }
      if (form.paymentType === "api") {
        if (!form.webhookUrl?.trim() || !form.publicKey?.trim()) throw new Error("Add the webhook endpoint and public API key.");
        try { if (new URL(form.webhookUrl).protocol !== "https:") throw new Error(); } catch { throw new Error("Webhook endpoint must be a valid HTTPS URL."); }
      }
      if (form.paymentType === "crypto" && !form.walletAddress?.trim()) throw new Error("Add the receiving wallet address.");
      const configOnly = form.paymentType === "api" || form.paymentType === "crypto";
      const { secretKeyConfigured: ignoredSecretStatus, ...formPayload } = form;
      if (form.paymentType === "secured_payment_link") formPayload.publicKey = form.paymentLinkUrl || "";
      if (form.paymentType !== "secured_payment_link") formPayload.paymentLinkUrl = "";
      if (form.paymentType !== "qr_code") formPayload.qrCodeImage = "";
      const payload = { ...formPayload, action: editingId ? "update" : "create", ...(editingId ? { id: editingId } : {}), isActive: configOnly ? false : editingId ? methods.find((m) => m.id === editingId)?.isActive ?? false : true, sortOrder: editingId ? methods.find((m) => m.id === editingId)?.sortOrder ?? methods.length : methods.length };
      await callServerless("managePaymentMethods", payload);
      resetForm(); setMessage(configOnly ? "Configuration saved inactive; settlement is not enabled." : "Payment method saved.");
      setMethods(await callServerless<Method[]>("managePaymentMethods", { action: "list" }));
    } catch (err: any) { setError(err?.message || "Could not save payment method."); }
    finally { setBusy(false); }
  };
  const toggle = async (method: Method) => {
    if (method.paymentType === "api" || method.paymentType === "crypto") {
      setError("API and crypto methods are configuration-only until a verified Serverless settlement flow is implemented.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try { await callServerless("managePaymentMethods", { action: "update", id: method.id, isActive: !method.isActive }); setMethods(await callServerless<Method[]>("managePaymentMethods", { action: "list" })); setMessage(method.isActive ? "Payment method disabled." : "Payment method activated."); }
    catch (err: any) { setError(err?.message || "Could not update payment method."); } finally { setBusy(false); }
  };
  const remove = async (method: Method) => {
    if (!window.confirm(`Delete ${method.name}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try { await callServerless("managePaymentMethods", { action: "delete", id: method.id }); setMethods(await callServerless<Method[]>("managePaymentMethods", { action: "list" })); if (editingId === method.id) resetForm(); setMessage("Payment method deleted."); }
    catch (err: any) { setError(err?.message || "Could not delete payment method."); } finally { setBusy(false); }
  };

  return <main className="serverless-admin-panel prime-payments-panel" aria-label="Telegram Serverless payment methods">
    <header className="serverless-panel-header"><button onClick={onBack} className="serverless-action" aria-label="Back to Admin modules"><ArrowLeft className="h-4 w-4"/></button><div className="serverless-panel-header__copy"><h1>Payments</h1><p>Checkout payment options</p></div>{authorized&&<button onClick={startAdd} className="serverless-action serverless-action--primary"><Plus className="h-4 w-4"/>Add</button>}<button disabled={busy} onClick={()=>void load()} className="serverless-action" aria-label="Refresh list"><RefreshCw className="h-4 w-4"/></button></header>
    <p className="my-2 border bg-white p-2 text-[10px] leading-snug text-slate-600">API and crypto are configuration only. A payment link return never confirms payment; staff must review proof.</p>
    {error&&<div role="alert" className="my-2 border border-red-300 bg-red-50 p-2 text-xs text-red-800">{error}</div>}{message&&<div role="status" className="my-2 border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">{message}</div>}
    {!authorized?<div className="border bg-white p-5 text-center text-xs">Checking verified Telegram admin access…</div>:<>
      <div className="serverless-panel-toolbar"><strong className="flex-1 text-xs uppercase">Saved Methods · {methods.length}</strong>{busy&&<Loader2 className="h-4 w-4 animate-spin"/>}</div>
      {methods.length===0?<p className="border bg-white p-4 text-center text-xs text-slate-600">No payment methods configured.</p>:<div className="serverless-record-list prime-payments-list">{methods.map((method)=><article key={method.id} className="serverless-record prime-payment-method">
        <div className="serverless-record__summary prime-payment-method__summary">{method.logo?<UploadedPreview reference={method.logo} label={`${method.name} logo`} brand compact/>:<span className="prime-payment-preview prime-payment-preview--compact"><CreditCard className="h-5 w-5 text-slate-400"/></span>}<div className="serverless-record__copy"><strong>{method.name}</strong><small>{method.paymentType==="qr_code"?"Static QR":method.paymentType==="secured_payment_link"?"Secured Payment Link":method.paymentType==="api"?"API · Configuration Only":method.paymentType==="crypto"?"Crypto · Configuration Only":"Manual Transfer"}{method.accountNumber?` · ${method.accountNumber}`:""}</small></div><button type="button" disabled={busy} onClick={()=>edit(method)} className="serverless-action" aria-label={`Edit ${method.name}`}><Pencil className="h-4 w-4"/></button></div>
        <div className="serverless-record__summary prime-payment-method__controls"><label className="serverless-switch flex-1"><span>{method.isActive?"Active in Checkout":"Inactive"}</span><input type="checkbox" checked={method.isActive} disabled={busy||method.paymentType==="api"||method.paymentType==="crypto"} onChange={()=>void toggle(method)}/><span className="serverless-switch__track"/></label><button type="button" disabled={busy} onClick={()=>void remove(method)} className="serverless-action serverless-action--danger" aria-label={`Delete ${method.name}`}><Trash2 className="h-4 w-4"/></button></div>
        <details className="serverless-disclosure border-x-0 border-b-0"><summary>Saved Details</summary><div className="serverless-disclosure__body serverless-fields">{(method.paymentLinkUrl || (method.paymentType === "secured_payment_link" ? method.publicKey : ""))&&<p className="break-all text-[10px]">Link: {method.paymentLinkUrl || method.publicKey}</p>}{method.walletAddress&&<p className="break-all text-[10px]">Wallet: {method.walletAddress}</p>}{method.qrCodeImage&&<UploadedPreview reference={method.qrCodeImage} label={`${method.name} QR`}/>}<span className="text-[10px] text-slate-600">{method.paymentType==="api"&&method.secretKeyConfigured?"Secret key saved server-side":""}</span></div></details>
      </article>)}</div>}
    </>}
    {formOpen&&<div className="serverless-dialog-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy)resetForm();}}><section className="serverless-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-dialog-title">
      <header className="serverless-dialog__header"><h2 id="payment-dialog-title">{editingId?"Edit Payment Method":"Add Payment Method"}</h2><button type="button" disabled={busy} onClick={resetForm} className="serverless-action" aria-label="Close"><X className="h-4 w-4"/></button></header>
      <form onSubmit={save} className="serverless-dialog__form"><div className="serverless-dialog__body space-y-2">
        <div className="serverless-fields"><label className="serverless-field">Display Name<input required maxLength={160} placeholder="GCash, bank, etc." value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></label><label className="serverless-field">Method Type<select value={form.paymentType} onChange={(e)=>setForm({...form,paymentType:e.target.value as Form["paymentType"]})}><option value="manual_transfer">Manual Transfer</option><option value="qr_code">Static QR</option><option value="secured_payment_link">Secured Link</option><option value="api">Payment API</option><option value="crypto">Crypto Wallet</option></select></label></div>
        <details className="serverless-disclosure" open><summary>Provider Logo</summary><div className="serverless-disclosure__body flex items-center gap-2"><UploadedPreview reference={form.logo||""} label="Provider logo" brand/><label className="serverless-action flex-1 cursor-pointer justify-center">{busy?"Uploading…":form.logo?"Replace Logo":"Upload Logo"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e)=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";void upload(file,"payment-method-logos");}}/></label><AssetPickerButton disabled={busy} onSelect={logo=>setForm(current=>({...current,logo}))}/></div></details>
        {form.paymentType==="manual_transfer"&&<div className="serverless-fields"><label className="serverless-field">Recipient Name<input required value={form.accountName||""} onChange={(e)=>setForm({...form,accountName:e.target.value})}/></label><label className="serverless-field">Account / Mobile<input required value={form.accountNumber||""} onChange={(e)=>setForm({...form,accountNumber:e.target.value})}/></label></div>}
        {form.paymentType==="qr_code"&&<details className="serverless-disclosure" open><summary>QR Image</summary><div className="serverless-disclosure__body flex items-center gap-2"><UploadedPreview reference={form.qrCodeImage||""} label="Payment QR"/><label className="serverless-action flex-1 cursor-pointer justify-center">{form.qrCodeImage?"Replace QR":"Upload QR"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e)=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";void upload(file,"payment-qr-codes");}}/></label><AssetPickerButton disabled={busy} onSelect={qrCodeImage=>setForm(current=>({...current,qrCodeImage}))}/></div></details>}
        {form.paymentType==="secured_payment_link"&&<label className="serverless-field">Provider HTTPS Link<input type="url" inputMode="url" placeholder="https://…" required value={form.paymentLinkUrl||""} onChange={(e)=>setForm({...form,paymentLinkUrl:e.target.value})}/></label>}
        {form.paymentType==="crypto"&&<label className="serverless-field">Wallet Address<input required value={form.walletAddress||""} onChange={(e)=>setForm({...form,walletAddress:e.target.value})}/></label>}
        {form.paymentType==="api"&&<div className="serverless-fields"><label className="serverless-field col-span-2">Webhook Endpoint<input type="url" required value={form.webhookUrl||""} onChange={(e)=>setForm({...form,webhookUrl:e.target.value})}/></label><label className="serverless-field">Public API Key<input required value={form.publicKey||""} onChange={(e)=>setForm({...form,publicKey:e.target.value})}/></label><label className="serverless-field">Secret API Key<input type="password" autoComplete="new-password" value={form.secretKey||""} onChange={(e)=>setForm({...form,secretKey:e.target.value})} placeholder={form.secretKeyConfigured?"Blank keeps saved key":"Provider secret"}/></label><p className="col-span-2 text-[10px] text-slate-500">Stored server-side. API settlement is not implemented; this option saves inactive.</p></div>}
        {form.paymentType!=="manual_transfer"&&<div className="serverless-fields"><label className="serverless-field">Account Name<input value={form.accountName||""} onChange={(e)=>setForm({...form,accountName:e.target.value})}/></label><label className="serverless-field">Account / Mobile<input value={form.accountNumber||""} onChange={(e)=>setForm({...form,accountNumber:e.target.value})}/></label></div>}
        <p className="prime-payment-editor-status">{form.paymentType==="api"||form.paymentType==="crypto"?"Settlement Unavailable · Saved Inactive":editingId?"Checkout availability is controlled in the method list.":"New methods are active in checkout."}</p>
      </div><footer className="serverless-dialog__footer"><button type="button" disabled={busy} onClick={resetForm} className="serverless-action">Cancel</button><button disabled={busy||!isReusableImageReference(form.logo)||(form.paymentType==="qr_code"&&!isReusableImageReference(form.qrCodeImage))} className="serverless-action serverless-action--primary">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:editingId?<Save className="h-4 w-4"/>:<Plus className="h-4 w-4"/>}{editingId?"Save Changes":"Save Method"}</button></footer></form>
    </section></div>}
  </main>;
}

function UploadedPreview({ reference, label, brand = false, compact = false }: { reference: string; label: string; brand?: boolean; compact?: boolean }) {
  const [src, setSrc] = useState("");
  useEffect(() => { let objectUrl = ""; let active = true; setSrc(""); resolveTelegramMedia(reference).then((url) => { if (!active) { if (url.startsWith("blob:")) URL.revokeObjectURL(url); return; } objectUrl = url.startsWith("blob:") ? url : ""; setSrc(url); }).catch(() => { if (active) setSrc(""); }); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [reference]);
  if (!reference) return <span className="grid h-10 w-10 shrink-0 place-items-center border bg-white text-[8px] text-slate-500">No Image</span>;
  return src ? <span className={`prime-payment-preview ${compact ? "prime-payment-preview--compact" : ""} ${brand ? "prime-payment-preview--brand" : ""}`}><img src={src} alt={label}/></span> : <span className={`prime-payment-preview ${compact ? "prime-payment-preview--compact" : ""}`} aria-label={`${label} loading`}>…</span>;
}
