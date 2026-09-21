"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";
import { authenticatedFetch } from "@/app/components/telegram-auth-client";

type ResultState = "success" | "failure" | "cancel" | "pending";

export default function MayaResultPage() {
  const params = useMemo(() => {
    if (typeof window === "undefined") return { order: "", result: "pending" as ResultState };
    const search = new URLSearchParams(window.location.search);
    const result = search.get("result");
    return {
      order: search.get("order") || "",
      result: (result === "success" || result === "failure" || result === "cancel" ? result : "pending") as ResultState,
    };
  }, []);

  const [order, setOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.order) {
      setIsLoading(false);
      setError("Missing PRIME order reference.");
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;

    const load = async () => {
      try {
        const response = await authenticatedFetch(
          "/api/orders?orderNumber=" + encodeURIComponent(params.order) + "&_t=" + Date.now(),
          { cache: "no-store" }
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok) throw new Error(data?.error || "Unable to retrieve the PRIME order.");

        if (!cancelled) {
          setOrder(data?.id || data?.orderNumber ? data : null);
          setError("");
          setIsLoading(false);
        }

        const status = String(data?.paymentStatus || data?.payment_status || "").toLowerCase();
        const terminal =
          status === "paid" ||
          status === "payment failed" ||
          status === "expired" ||
          status === "cancelled";

        attempts += 1;
        if (!cancelled && !terminal && attempts < maxAttempts) setTimeout(load, 3000);
      } catch (err: any) {
        attempts += 1;
        if (!cancelled) {
          setError(err?.message || "Unable to retrieve payment status.");
          setIsLoading(false);
        }
        if (!cancelled && attempts < maxAttempts) setTimeout(load, 5000);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [params.order]);

  const paymentStatus = String(order?.paymentStatus || order?.payment_status || "Awaiting Maya Payment");
  const normalizedStatus = paymentStatus.toLowerCase();
  const state =
    normalizedStatus === "paid" ? "success" :
    normalizedStatus.includes("failed") ? "failure" :
    normalizedStatus.includes("expired") || normalizedStatus.includes("cancelled") ? "cancel" :
    params.result;

  const title =
    state === "success" ? "Payment Confirmed" :
    state === "failure" ? "Payment Not Completed" :
    state === "cancel" ? "Payment Cancelled or Expired" :
    "Payment Processing";

  const icon =
    state === "success" ? <CheckCircle2 className="w-12 h-12 text-emerald-600" /> :
    state === "failure" ? <AlertCircle className="w-12 h-12 text-red-600" /> :
    state === "cancel" ? <AlertCircle className="w-12 h-12 text-amber-600" /> :
    <Clock3 className="w-12 h-12 text-slate-600" />;

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-5">
      <section className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 space-y-5">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto">
            {icon}
          </div>
          <div>
            <h1 className="text-lg font-heading font-black uppercase tracking-wide text-slate-950">{title}</h1>
            <p className="text-xs font-mono text-slate-500 mt-1">
              PRIME Order <span className="font-bold text-slate-800">{params.order || "—"}</span>
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-mono text-red-700">
            {error}
          </div>
        )}

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 uppercase">Payment status</span>
            <span className="font-bold text-slate-900">{paymentStatus}</span>
          </div>
          {order?.mayaPaymentId && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400 uppercase shrink-0">Maya payment</span>
              <span className="font-bold text-slate-800 truncate">{order.mayaPaymentId}</span>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-xs font-mono text-slate-500">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Waiting for PRIME payment confirmation...</span>
          </div>
        )}

        <p className="text-[10px] leading-relaxed text-center text-slate-500 font-mono">
          This page does not decide whether the payment succeeded. PRIME updates the order only after receiving and validating the Maya webhook.
        </p>

        <button
          type="button"
          onClick={() => window.location.assign("/")}
          className="w-full px-4 py-3 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-heading font-black uppercase tracking-wider flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to PRIME
        </button>
      </section>
    </main>
  );
}
