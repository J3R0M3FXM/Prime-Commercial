"use client";

import { useEffect, useState } from "react";
import { Receipt, CheckCircle2 } from "lucide-react";
import { formatPHP } from "@/lib/currency";
import { RECEIPT_SCAN_PRESENTATION_MS } from "@/lib/receipt-scan-presentation";

export default function ReceiptAnalysisCard({ image, analysis, busy, error, scanVersion, submitting, canSubmit,
  onPreview, onRescan, onReplace, onSubmit, onClose }: {
  image: string;
  analysis: Record<string, any> | null;
  busy: boolean;
  error: string;
  scanVersion: number;
  submitting: boolean;
  canSubmit: boolean;
  onPreview: () => void;
  onRescan: () => void;
  onReplace: () => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const startedAt = Date.now(); setElapsed(0);
    const timer = globalThis.setInterval(() => setElapsed(Date.now() - startedAt), 200);
    return () => globalThis.clearInterval(timer);
  }, [busy, scanVersion]);
  const complete = !busy && !error && analysis?.matchStatus === "ANALYSIS_COMPLETED";
  const progress = complete ? 100 : busy ? Math.min(95, Math.floor(elapsed / RECEIPT_SCAN_PRESENTATION_MS * 95)) : 0;
  const evidence = analysis?.paymentEvidence || {};
  const paidAt = evidence.paidAt ? new Date(evidence.paidAt) : null;
  const date = paidAt && Number.isFinite(paidAt.getTime()) ? paidAt.toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not found";
  const reference = evidence.fullReference || evidence.reference || "Not found";
  return <div className="space-y-3" aria-label="Receipt image analysis">
    <h3 className="font-heading text-base font-normal text-slate-900">FORENSICS IMAGE ANALYSIS</h3>
    {busy ? <p className="text-sm leading-relaxed text-slate-600">Image analysis is in progress. Please do not refresh or close this page. This could take up to 45 seconds.</p>
      : <p role="status" className="text-sm text-slate-600">{error ? "Image analysis could not be completed. Re-scan or replace your receipt." : complete ? "Image analysis completed. Review the extracted details below. Staff will verify your payment." : "This saved receipt needs analysis. Select RE-SCAN to continue."}</p>}
    <div className={`prime-receipt-analysis-scan ${busy ? "is-scanning" : ""}`} aria-hidden="true">
      {image ? <img src={image} alt="" /> : <Receipt className="h-20 w-20 text-slate-400" />}
      {busy && <span className="prime-receipt-analysis-scan__beam" />}
      {complete && <span className="prime-receipt-analysis-scan__complete"><CheckCircle2 className="h-6 w-6" /></span>}
    </div>
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono text-slate-600"><span>{busy ? elapsed >= RECEIPT_SCAN_PRESENTATION_MS ? "Waiting for analysis results" : "Processing receipt" : complete ? "Analysis complete" : error ? "Analysis interrupted" : "Ready to scan"}</span><span>{progress}%</span></div>
      <div role="progressbar" aria-label="Receipt analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600 transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>
    </div>
    <div className="grid grid-cols-3 gap-2" aria-label="Receipt actions">
      <button type="button" disabled={busy || submitting || !image} onClick={onPreview} className="min-h-11 rounded-lg border border-slate-300 px-1 text-xs font-heading disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">PREVIEW</button>
      <button type="button" disabled={busy || submitting || !image} onClick={onRescan} className="min-h-11 rounded-lg border border-slate-300 px-1 text-xs font-heading disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">RE-SCAN</button>
      <button type="button" disabled={busy || submitting} onClick={onReplace} className="min-h-11 rounded-lg border border-slate-300 px-1 text-xs font-heading disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">REPLACE</button>
    </div>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {complete && <>
      <table className="w-full table-fixed border-collapse text-left text-xs font-mono" aria-label="Extracted receipt metadata"><tbody>
        {[["DATE", date], ["AMOUNT", Number.isSafeInteger(evidence.amountCents) ? formatPHP(evidence.amountCents / 100) : "Not found"], ["REFERENCE / TRANSACTION NUMBER", reference]].map(([label, value]) => <tr key={label} className="border-b border-slate-200"><th scope="row" className="w-2/5 py-2 pr-2 font-normal text-slate-500">{label}</th><td className="break-words py-2 text-slate-900">{value}</td></tr>)}
      </tbody></table>
      {(!evidence.paidAt || evidence.amountCents == null || reference === "Not found") && <p className="text-xs text-slate-500">Some details could not be extracted. You may re-scan or replace the receipt. Staff must review the original image.</p>}
    </>}
    <button type="button" disabled={busy || submitting || !complete || !canSubmit} onClick={onSubmit} className="min-h-12 w-full rounded-lg bg-slate-900 px-3 text-xs font-heading text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">{submitting ? "SUBMITTING…" : "SUBMIT"}</button>
    {!busy && !submitting && <button type="button" onClick={onClose} className="min-h-10 w-full text-xs text-slate-600">Back to Payment</button>}
  </div>;
}
