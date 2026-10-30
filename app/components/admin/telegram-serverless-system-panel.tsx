"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, Loader2, Play, RefreshCw, Save, ShieldCheck, Unplug } from "lucide-react";
import { callServerless } from "@/lib/telegram-serverless-client";

export default function TelegramServerlessSystemPanel({ onBack }: { onBack: () => void }) {
  const [activeSection, setActiveSection] = useState<"diagnostics" | "api">("diagnostics");
  const [diagnostics, setDiagnostics] = useState<Array<{ name: string; status: "ok" | "error"; ms: number; detail: string }> | null>(null);
  const [checkingSystem, setCheckingSystem] = useState(false);
  const [ocrSpaceConfigured, setOcrSpaceConfigured] = useState(false);
  const [googleVisionConfigured, setGoogleVisionConfigured] = useState(false);
  const [taggunConfigured, setTaggunConfigured] = useState(false);
  const [activeOcrProvider, setActiveOcrProvider] = useState("ocr_space");
  const [apiKey, setApiKey] = useState("");
  const [taggunApiKey, setTaggunApiKey] = useState("");
  const [iplocationConfigured, setIplocationConfigured] = useState(false);
  const [iplocationApiKey, setIplocationApiKey] = useState("");
  const [tomtomConfigured, setTomtomConfigured] = useState(false);
  const [tomtomApiKey, setTomtomApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const [result, iplocate, tomtom] = await Promise.all([
        callServerless<{ taggunConfigured: boolean; googleVisionConfigured: boolean; ocrSpaceConfigured: boolean; provider: string }>("manageOcrSettings", { action: "status" }),
        callServerless<{ configured: boolean }>("manageIplocateSettings", { action: "status" }),
        callServerless<{ configured: boolean }>("manageTomtomSettings", { action: "status" }),
      ]);
      setTaggunConfigured(Boolean(result?.taggunConfigured));
      setGoogleVisionConfigured(Boolean(result?.googleVisionConfigured));
      setOcrSpaceConfigured(Boolean(result?.ocrSpaceConfigured));
      setActiveOcrProvider(result?.provider === "taggun" ? "taggun" : "ocr_space");
      setIplocationConfigured(Boolean(iplocate?.configured));
      setTomtomConfigured(Boolean(tomtom?.configured));
    } catch (error: any) {
      setMessage(error?.message || "Could not load API configuration status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (activeSection === "api") void refresh(); }, [activeSection]);

  const checkSystem = async () => {
    setCheckingSystem(true);
    const probes: Array<{ name: string; endpoint: string; input?: Record<string, unknown>; summarize: (value: any) => string }> = [
      { name: "Backend and database", endpoint: "health", summarize: (value) => value?.ok && value?.database === "ok" ? "Service and database responded" : "Service or database check failed" },
      { name: "Receipt OCR settings", endpoint: "manageOcrSettings", input: { action: "status" }, summarize: (value) => value?.provider ? `${value.provider}; configuration status received` : "Unexpected response" },
      { name: "Address service settings", endpoint: "manageGeoapifySettings", input: { action: "status" }, summarize: (value) => value && typeof value.configured === "boolean" ? (value.configured ? "Provider key configured" : "Provider key not configured") : "Unexpected response" },
      { name: "IP location settings", endpoint: "manageIplocateSettings", input: { action: "status" }, summarize: (value) => value && typeof value.configured === "boolean" ? (value.configured ? "Provider key configured" : "Provider key not configured") : "Unexpected response" },
      { name: "Product catalog", endpoint: "getCatalog", summarize: (value) => Array.isArray(value) ? `${value.length} active product${value.length === 1 ? "" : "s"}` : "Unexpected response" },
      { name: "Delivery options", endpoint: "getPublicCouriers", summarize: (value) => Array.isArray(value) ? `${value.length} active option${value.length === 1 ? "" : "s"}` : "Unexpected response" },
      { name: "Payment methods", endpoint: "getPublicPaymentMethods", summarize: (value) => Array.isArray(value) ? `${value.length} active method${value.length === 1 ? "" : "s"}` : "Unexpected response" },
      { name: "Checkout charges", endpoint: "getPublicCharges", summarize: (value) => Array.isArray(value) ? `${value.length} active charge${value.length === 1 ? "" : "s"}` : "Unexpected response" },
      { name: "Promotions", endpoint: "getActivePromos", summarize: (value) => Array.isArray(value) ? `${value.length} active promotion${value.length === 1 ? "" : "s"}` : "Unexpected response" },
      { name: "Order queue", endpoint: "getPublicOrderQueue", summarize: (value) => value && typeof value === "object" ? "Aggregate status available" : "Unexpected response" },
    ];
    const results: NonNullable<typeof diagnostics> = [];
    setDiagnostics([]);
    for (let offset = 0; offset < probes.length; offset += 3) {
      const batch = await Promise.all(probes.slice(offset, offset + 3).map(async (probe) => {
        const started = performance.now();
        try {
          const value = await callServerless<any>(probe.endpoint, probe.input || {}, 15_000);
          const detail = probe.summarize(value);
          if (detail === "Service or database check failed" || detail === "Unexpected response") throw new Error(detail);
          return { name: probe.name, status: "ok" as const, ms: Math.round(performance.now() - started), detail };
        } catch (error: any) {
          return { name: probe.name, status: "error" as const, ms: Math.round(performance.now() - started), detail: error?.message || "Request failed" };
        }
      }));
      results.push(...batch);
      setDiagnostics([...results]);
    }
    setCheckingSystem(false);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      await callServerless("manageOcrSettings", { action: "set", provider: "ocr_space", apiKey: apiKey.trim() });
      setApiKey("");
      setOcrSpaceConfigured(true);
      setActiveOcrProvider("ocr_space");
      setMessage("OCR.space key saved. Receipt scanning now uses OCR.space.");
    } catch (error: any) {
      setMessage(error?.message || "Could not save the OCR.space API key.");
    } finally {
      setSaving(false);
    }
  };

  const saveTaggun = async (event: FormEvent) => {
    event.preventDefault();
    if (!taggunApiKey.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      await callServerless("manageOcrSettings", { action: "setTaggun", apiKey: taggunApiKey.trim() });
      setTaggunApiKey("");
      setTaggunConfigured(true);
      setActiveOcrProvider("taggun");
      setMessage("Taggun key saved securely and selected for receipt scans.");
    } catch (error: any) {
      setMessage(error?.message || "Could not save the Taggun API key.");
    } finally {
      setSaving(false);
    }
  };

  const selectTaggun = async () => {
    setSaving(true);
    setMessage("");
    try {
      await callServerless("manageOcrSettings", { action: "selectTaggun" });
      setActiveOcrProvider("taggun");
      setMessage("Taggun selected for receipt scans.");
    } catch (error: any) {
      setMessage(error?.message || "Could not select Taggun.");
    } finally {
      setSaving(false);
    }
  };

  const disconnectTaggun = async () => {
    setSaving(true);
    setMessage("");
    try {
      await callServerless("manageOcrSettings", { action: "disconnectTaggun" });
      setTaggunConfigured(false);
      setActiveOcrProvider("ocr_space");
      setMessage("Taggun has been disconnected and its saved API key deleted. OCR.space is selected.");
    } catch (error: any) {
      setMessage(error?.message || "Could not disconnect Taggun.");
    } finally {
      setSaving(false);
    }
  };

  const disconnectGoogleVision = async () => {
    setSaving(true);
    setMessage("");
    try {
      await callServerless("manageOcrSettings", { action: "disconnectGoogleVision" });
      setGoogleVisionConfigured(false);
      setMessage("The saved Google Cloud Vision key has been deleted. OCR.space remains the active scanner.");
    } catch (error: any) {
      setMessage(error?.message || "Could not delete the saved Google Cloud Vision key.");
    } finally {
      setSaving(false);
    }
  };

  const saveIplocationKey = async (event: FormEvent) => {
    event.preventDefault();
    if (!iplocationApiKey.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      await callServerless("manageIplocateSettings", { action: "set", apiKey: iplocationApiKey.trim() });
      setIplocationApiKey("");
      setIplocationConfigured(true);
      setMessage("IPLocate.io key saved securely for order network and privacy investigation signals.");
    } catch (error: any) {
      setMessage(error?.message || "Could not save the IPLocate.io key.");
    } finally {
      setSaving(false);
    }
  };

  const saveTomtomKey = async (event: FormEvent) => {
    event.preventDefault();
    if (!tomtomApiKey.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      await callServerless("manageTomtomSettings", { action: "set", apiKey: tomtomApiKey.trim() });
      setTomtomApiKey("");
      setTomtomConfigured(true);
      setMessage("TomTom key saved securely. The key is not shown again.");
    } catch (error: any) {
      setMessage(error?.message || "Could not save the TomTom API key.");
    } finally {
      setSaving(false);
    }
  };

  const disconnectTomtom = async () => {
    setSaving(true);
    setMessage("");
    try {
      await callServerless("manageTomtomSettings", { action: "disconnect" });
      setTomtomConfigured(false);
      setMessage("TomTom key removed. Warehouse address lookup and delivery estimates require a configured key.");
    } catch (error: any) {
      setMessage(error?.message || "Could not remove the TomTom API key.");
    } finally {
      setSaving(false);
    }
  };

  return <main className="min-h-screen bg-slate-50 px-3 pb-8 pt-20 text-slate-900">
    <div className="mx-auto max-w-[430px] space-y-4">
      <header className="flex items-center gap-3 border bg-white p-4">
        <button type="button" onClick={onBack} className="border p-2" aria-label="Back to Admin"><ArrowLeft className="h-5 w-5" /></button>
        <div><p className="text-xs font-bold uppercase tracking-wider text-emerald-800">System module</p><h1 className="text-xl font-bold">{activeSection === "diagnostics" ? "Diagnostics" : "API"}</h1></div>
      </header>
      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="System submodules">
        <button type="button" role="tab" aria-selected={activeSection === "diagnostics"} onClick={() => { setActiveSection("diagnostics"); setMessage(""); }} className={`border px-3 py-3 text-sm font-bold ${activeSection === "diagnostics" ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-700"}`}>Diagnostics</button>
        <button type="button" role="tab" aria-selected={activeSection === "api"} onClick={() => { setActiveSection("api"); setMessage(""); }} className={`border px-3 py-3 text-sm font-bold ${activeSection === "api" ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-700"}`}>API</button>
      </div>
      {activeSection === "diagnostics" && <section className="space-y-3 border bg-white p-4" aria-labelledby="serverless-status-heading">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Read-only diagnostics</p><h2 id="serverless-status-heading" className="text-lg font-bold">Serverless system status</h2><p className="mt-1 text-xs text-slate-600">Checks the live Telegram bridge and core storefront read endpoints. No records are changed; response contents are summarized only.</p></div>
          <button type="button" onClick={() => void checkSystem()} disabled={checkingSystem} className="inline-flex shrink-0 items-center gap-2 bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" aria-label="Run read-only system checks">
            {checkingSystem ? <Loader2 className="h-4 w-4 animate-spin" /> : diagnostics ? <RefreshCw className="h-4 w-4" /> : <Play className="h-4 w-4" />}{checkingSystem ? "Checking" : diagnostics ? "Run again" : "Check now"}
          </button>
        </div>
        {!diagnostics && <p className="border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">No live checks have run yet. Tap “Check now” to test each endpoint from this Telegram session.</p>}
        {diagnostics && <div className="divide-y border border-slate-200">{diagnostics.map((item) => <div key={item.name} className="flex items-start gap-2 p-2.5 text-xs">
          {item.status === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />}
          <div className="min-w-0 flex-1"><p className="font-bold">{item.name} · {item.status === "ok" ? "OK" : "FAILED"}</p><p className="break-words text-slate-600">{item.detail}</p></div><span className="shrink-0 font-mono text-slate-500">{item.ms} ms</span>
        </div>)}</div>}
        {diagnostics && <p className="text-[11px] text-slate-500">Settings checks read configuration status only; keys are never returned. No receipts, addresses, payments, or other data are sent to providers. Order/account detail reads, uploads, approvals, and settings changes are not run here.</p>}
      </section>}
      {activeSection === "api" && <section className="space-y-4 border bg-white p-4">
        <div className="space-y-3 border-b pb-4">
          <div><h2 className="font-bold">TomTom address and traffic services</h2><p className="mt-1 text-sm text-slate-600">Used for warehouse address search and dropped-pin reverse lookup, checkout addresses, motorcycle routes, and traffic estimates. The key is stored on the Serverless backend and never shown here.</p></div>
          <p className="text-sm">TomTom key: {loading ? "Checking…" : tomtomConfigured ? <span className="font-bold text-emerald-700">Configured</span> : <span className="font-bold text-amber-700">Not configured</span>}</p>
          <form onSubmit={saveTomtomKey} className="space-y-3">
            <label className="block text-sm font-semibold">TomTom API key<input type="password" autoComplete="new-password" minLength={16} value={tomtomApiKey} onChange={(event) => setTomtomApiKey(event.target.value)} placeholder={tomtomConfigured ? "Enter a new key to replace the saved key" : "Paste TomTom API key"} className="mt-1 w-full border px-3 py-2 font-mono text-sm" /></label>
            <button type="submit" disabled={saving || !tomtomApiKey.trim()} className="inline-flex items-center gap-2 bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{tomtomConfigured ? "Replace TomTom key" : "Save TomTom key"}</button>
          </form>
          {tomtomConfigured && <button type="button" onClick={() => void disconnectTomtom()} disabled={saving} className="inline-flex items-center gap-2 border border-red-300 px-4 py-2 text-sm font-bold text-red-800 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}Remove TomTom key</button>}
        </div>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
          <div><h2 className="font-bold">Receipt scanner: {activeOcrProvider === "taggun" ? "Taggun" : "OCR.space"}</h2><p className="mt-1 text-sm text-slate-600">Scans show a suggested amount, reference and transaction date/time. OCR remains advisory; staff must verify each payment with the provider before approval.</p></div>
        </div>
        <p className="text-sm">OCR.space key: {loading ? "Checking…" : ocrSpaceConfigured ? <span className="font-bold text-emerald-700">Configured</span> : <span className="font-bold text-amber-700">Not configured</span>}</p>
        <form onSubmit={save} className="space-y-3">
          <p className="border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">OCR.space offers a free API key without Google Cloud billing setup. Its free endpoint has rate limits and a 1 MB per-image limit; Engine 3 has a separate smaller quota and runs only if Engine 2 returns no text. Checkout compresses the scan copy while retaining the original for staff review. The key is write-only here. OCR never confirms or marks a payment as Paid.</p>
          <label className="block text-sm font-semibold">OCR.space API key<input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={ocrSpaceConfigured ? "Enter a new key to replace the saved key" : "Paste OCR.space API key"} className="mt-1 w-full border px-3 py-2 font-mono text-sm" /></label>
          <button type="submit" disabled={saving || !apiKey.trim()} className="inline-flex items-center gap-2 bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save OCR.space key</button>
        </form>
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm text-slate-700">Taggun key: {loading ? "Checking…" : taggunConfigured ? <span className="font-semibold text-emerald-700">Configured</span> : <span className="font-semibold text-slate-500">Not configured</span>}</p>
          <p className="text-xs text-slate-500">Taggun uses its encoded-receipt endpoint. Its API key is write-only and stays on the Serverless backend.</p>
          <form onSubmit={saveTaggun} className="space-y-3">
            <label className="block text-sm font-semibold">Taggun API key<input type="password" autoComplete="new-password" value={taggunApiKey} onChange={(event) => setTaggunApiKey(event.target.value)} placeholder={taggunConfigured ? "Enter a new key to replace the saved key" : "Paste Taggun API key"} className="mt-1 w-full border px-3 py-2 font-mono text-sm" /></label>
            <button type="submit" disabled={saving || !taggunApiKey.trim()} className="inline-flex items-center gap-2 border border-slate-400 px-4 py-2 text-sm font-bold disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save key and use Taggun</button>
          </form>
          {taggunConfigured && activeOcrProvider !== "taggun" && <button type="button" onClick={() => void selectTaggun()} disabled={saving} className="border border-emerald-700 px-4 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">Use saved Taggun key</button>}
          {taggunConfigured && <button type="button" onClick={() => void disconnectTaggun()} disabled={saving} className="mt-3 inline-flex items-center gap-2 border border-red-300 px-4 py-2 text-sm font-bold text-red-800 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}Disconnect Taggun and delete key</button>}
        </div>
        {googleVisionConfigured && <div className="border-t pt-4"><p className="text-sm text-slate-700">Legacy Google Cloud Vision key: <span className="font-semibold text-amber-700">Present but unused</span></p><button type="button" onClick={() => void disconnectGoogleVision()} disabled={saving} className="mt-3 inline-flex items-center gap-2 border border-red-300 px-4 py-2 text-sm font-bold text-red-800 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}Delete Google key</button></div>}
        <div className="border-t pt-4 space-y-3">
          <div><h2 className="font-bold">IPLocate.io</h2><p className="mt-1 text-sm text-slate-600">Used for network and privacy indicators on order investigation, and as an approximate IP-area fallback when the primary lookup is unavailable.</p></div>
          <p className="text-sm">Key: {loading ? "Checking…" : iplocationConfigured ? <span className="font-bold text-emerald-700">Configured</span> : <span className="font-bold text-slate-500">Not configured</span>}</p>
          <form onSubmit={saveIplocationKey} className="space-y-3">
            <label className="block text-sm font-semibold">IPLocate.io API key<input type="password" autoComplete="new-password" value={iplocationApiKey} onChange={(event) => setIplocationApiKey(event.target.value)} placeholder={iplocationConfigured ? "Enter a new key to replace the saved key" : "Enter key to enable network investigation signals"} className="mt-1 w-full border px-3 py-2 font-mono text-sm" /></label>
            <button type="submit" disabled={saving || !iplocationApiKey.trim()} className="inline-flex items-center gap-2 border px-4 py-2 text-sm font-bold text-slate-800 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save IPLocate.io key</button>
          </form>
        </div>
        {message && <p role="status" className="border bg-slate-50 p-3 text-sm">{message}</p>}
      </section>}
    </div>
  </main>;
}
