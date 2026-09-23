"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
  ShieldCheck,
  Server,
  Database,
  HardDrive,
  Send,
  MapPin,
  Globe,
  GitBranch,
  Layers,
  HelpCircle,
  Radio,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Type
} from "lucide-react";
import FontDiagnostics from "./font-diagnostics";

export interface DiagnosticItem {
  id: string;
  name: string;
  category: "telegram" | "location" | "infrastructure" | "deployment";
  status: "operational" | "degraded" | "error" | "pending";
  latencyMs?: number;
  message: string;
  details?: Record<string, any>;
  lastChecked: string;
}

export default function DiagnosticsModule() {
  const [activeSubView, setActiveSubView] = useState<"all" | "fonts" | "infrastructure">("all");
  const [services, setServices] = useState<DiagnosticItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      // 1. Client-side probe for Telegram Mini App environment
      const isTgClient = typeof window !== "undefined" && !!(window as any).Telegram?.WebApp;
      const tgWebAppData = isTgClient ? (window as any).Telegram.WebApp.initData : null;
      const tgPlatform = isTgClient ? (window as any).Telegram.WebApp.platform : null;
      const tgVersion = isTgClient ? (window as any).Telegram.WebApp.version : null;

      const tgMiniAppItem: DiagnosticItem = {
        id: "telegram-mini-app",
        name: "Telegram Mini App",
        category: "telegram",
        status: isTgClient ? (tgWebAppData ? "operational" : "degraded") : "operational",
        latencyMs: 1,
        message: isTgClient
          ? `Telegram WebApp SDK active (v${tgVersion || "unknown"}, platform: ${tgPlatform || "web"})`
          : "Web preview mode (outside Telegram client; telegram-web-app.js SDK loaded)",
        details: {
          isInsideTelegram: isTgClient,
          platform: tgPlatform || "browser",
          version: tgVersion || "external-browser",
          hasInitData: !!tgWebAppData,
        },
        lastChecked: new Date().toISOString(),
      };

      // 2. Fetch server-side diagnostics
      const res = await fetch("/api/admin/diagnostics", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const serverItems: DiagnosticItem[] = data.services || [];

        // Prepend Telegram Mini App so both Telegram items appear together
        const merged: DiagnosticItem[] = [tgMiniAppItem, ...serverItems];
        setServices(merged);
        setLastCheckTime(data.timestamp || new Date().toISOString());
      } else {
        // Handle unexpected API route error gracefully
        setServices([
          tgMiniAppItem,
          {
            id: "diagnostics-api-error",
            name: "Diagnostics API",
            category: "infrastructure",
            status: "error",
            message: `Diagnostics server responded with HTTP ${res.status}`,
            lastChecked: new Date().toISOString(),
          },
        ]);
      }
    } catch (err: any) {
      console.error("Diagnostics check failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyDetail = (id: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    }
  };

  // Status icon and color helper
  const getStatusBadge = (status: DiagnosticItem["status"]) => {
    switch (status) {
      case "operational":
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
          label: "OPERATIONAL",
          bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
          dot: "bg-emerald-500",
        };
      case "degraded":
        return {
          icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
          label: "DEGRADED",
          bg: "bg-amber-50 text-amber-800 border-amber-200",
          dot: "bg-amber-500",
        };
      case "error":
        return {
          icon: <XCircle className="w-4 h-4 text-rose-600" />,
          label: "OFFLINE / ERROR",
          bg: "bg-rose-50 text-rose-800 border-rose-200",
          dot: "bg-rose-500",
        };
      default:
        return {
          icon: <Clock className="w-4 h-4 text-slate-500" />,
          label: "CHECKING",
          bg: "bg-slate-50 text-slate-700 border-slate-200",
          dot: "bg-slate-400",
        };
    }
  };

  const getServiceIcon = (id: string) => {
    switch (id) {
      case "telegram-mini-app":
        return <Radio className="w-5 h-5 text-sky-500" />;
      case "telegram-bot-api":
        return <Send className="w-5 h-5 text-sky-600" />;
      case "geoapify-api":
        return <MapPin className="w-5 h-5 text-amber-600" />;
      case "iplocate-api":
        return <Globe className="w-5 h-5 text-indigo-600" />;
      case "database":
        return <Database className="w-5 h-5 text-amber-500" />;
      case "server":
        return <Server className="w-5 h-5 text-emerald-600" />;
      case "storage":
        return <HardDrive className="w-5 h-5 text-violet-600" />;
      case "vercel":
        return <Layers className="w-5 h-5 text-black" />;
      case "github":
        return <GitBranch className="w-5 h-5 text-slate-900" />;
      default:
        return <Activity className="w-5 h-5 text-slate-600" />;
    }
  };

  const filteredServices = services.filter((s) => {
    if (filterCategory === "all") return true;
    if (filterCategory === "operational") return s.status === "operational";
    if (filterCategory === "issues") return s.status === "degraded" || s.status === "error";
    return s.category === filterCategory;
  });

  const operationalCount = services.filter((s) => s.status === "operational").length;
  const issueCount = services.filter((s) => s.status === "degraded" || s.status === "error").length;

  return (
    <div className="admin-feature-module space-y-3">
      {/* Sub-View Navigation Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-200/80 border border-slate-300 rounded-none text-xs font-heading font-normal uppercase tracking-wider w-fit">
        <button
          type="button"
          onClick={() => setActiveSubView("all")}
          className={`px-3 py-1.5 rounded-none transition-all cursor-pointer ${
            activeSubView === "all"
              ? "bg-black text-white shadow-xs"
              : "text-slate-700 hover:text-black"
          }`}
        >
          All Diagnostics
        </button>
        <button
          type="button"
          id="tab-font-diagnostics"
          onClick={() => setActiveSubView("fonts")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none transition-all cursor-pointer ${
            activeSubView === "fonts"
              ? "bg-black text-white shadow-xs"
              : "text-slate-700 hover:text-black"
          }`}
        >
          <Type className="w-3.5 h-3.5" />
          Storefront Font Scanner
        </button>
        <button
          type="button"
          onClick={() => setActiveSubView("infrastructure")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none transition-all cursor-pointer ${
            activeSubView === "infrastructure"
              ? "bg-black text-white shadow-xs"
              : "text-slate-700 hover:text-black"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Infrastructure & APIs ({services.length || 9})
        </button>
      </div>

      {/* 1. Storefront Font Compliance Scanner Module */}
      {(activeSubView === "all" || activeSubView === "fonts") && (
        <FontDiagnostics />
      )}

      {/* 2. Core Infrastructure & API Diagnostics Module */}
      {(activeSubView === "all" || activeSubView === "infrastructure") && (
        <div className="space-y-3">
          {/* Top High-level Diagnostics Card */}
          <div className="bg-white border border-slate-200 rounded-none p-3 shadow-none">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center w-2.5 h-2.5 rounded-full ${
                      issueCount === 0 ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                    }`}
                  />
                  <h2 className="font-heading font-normal uppercase text-lg text-slate-900 tracking-wide">
                    System Diagnostics & Infrastructure Health
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-sans">
                  Real-time ping, API quota, authentication handshake, and network telemetry for all 9 integrated services.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {lastCheckTime && (
                  <span className="text-[11px] font-mono text-slate-400 hidden sm:inline-block">
                    Checked {new Date(lastCheckTime).toLocaleTimeString()}
                  </span>
                )}
                <button
                  id="btn-rerun-diagnostics"
                  onClick={runDiagnostics}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-black text-white text-xs font-heading font-normal uppercase tracking-wider rounded-none hover:bg-neutral-800 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer shadow-none"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  {loading ? "Testing..." : "Rerun Health Check"}
                </button>
              </div>
            </div>

            {/* Quick Health Summary Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-2 border-t border-slate-100">
              <div className="bg-slate-50 rounded-none p-3 border border-slate-100">
                <p className="text-[10px] font-mono uppercase text-slate-500 font-bold">Total Monitored</p>
                <p className="font-heading font-normal text-xl text-slate-900 mt-0.5">{services.length || 9} Systems</p>
              </div>
              <div className="bg-emerald-50/50 rounded-none p-3 border border-emerald-100">
                <p className="text-[10px] font-mono uppercase text-emerald-700 font-bold">Operational</p>
                <p className="font-heading font-normal text-xl text-emerald-700 mt-0.5">{operationalCount} Active</p>
              </div>
              <div className="bg-amber-50/50 rounded-none p-3 border border-amber-100">
                <p className="text-[10px] font-mono uppercase text-amber-700 font-bold">Degraded / Issues</p>
                <p className="font-heading font-normal text-xl text-amber-700 mt-0.5">{issueCount} Needs Review</p>
              </div>
              <div className="bg-slate-50 rounded-none p-3 border border-slate-100">
                <p className="text-[10px] font-mono uppercase text-slate-500 font-bold">Average Latency</p>
                <p className="font-heading font-normal text-xl text-slate-900 mt-0.5">
                  {services.length > 0
                    ? Math.round(
                        services.reduce((acc, s) => acc + (s.latencyMs || 0), 0) /
                          (services.filter((s) => s.latencyMs !== undefined).length || 1)
                      )
                    : 0}
                  ms
                </p>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "all", label: "All Systems" },
              { id: "operational", label: `Operational (${operationalCount})` },
              { id: "issues", label: `Issues (${issueCount})` },
              { id: "telegram", label: "Telegram Stack" },
              { id: "location", label: "Location APIs" },
              { id: "infrastructure", label: "Core Infrastructure" },
              { id: "deployment", label: "Edge & VCS" },
            ].map((tab) => (
              <button
                key={tab.id}
                id={`filter-diag-${tab.id}`}
                onClick={() => setFilterCategory(tab.id)}
                className={`px-3 py-1.5 rounded-none text-xs font-heading font-normal uppercase tracking-wider transition-all cursor-pointer ${
                  filterCategory === tab.id
                    ? "bg-slate-900 text-white shadow-none"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Services List / Grid */}
          <div className="space-y-3">
            {filteredServices.map((srv) => {
              const badge = getStatusBadge(srv.status);
              const isExpanded = !!expandedDetails[srv.id];

              return (
                <div
                  key={srv.id}
                  id={`service-diag-${srv.id}`}
                  className="bg-white border border-slate-200 hover:border-slate-300 rounded-none p-2.5 sm:p-3 shadow-none transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Icon & Name */}
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-none bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                        {getServiceIcon(srv.id)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-heading font-normal uppercase text-base text-slate-900 tracking-wide">
                            {srv.name}
                          </h3>
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-100 rounded">
                            {srv.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 font-sans">{srv.message}</p>
                      </div>
                    </div>

                    {/* Status Badge & Latency */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      {srv.latencyMs !== undefined && (
                        <span className="font-mono text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                          {srv.latencyMs} ms
                        </span>
                      )}
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-bold tracking-wider ${badge.bg}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        {badge.label}
                      </div>

                      {srv.details && (
                        <button
                          onClick={() => toggleExpand(srv.id)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                          title="Toggle system details"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Collapsible Inspection Details */}
                  {srv.details && isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-100 font-mono text-xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                          Telemetry & Diagnostic Metadata
                        </span>
                        <button
                          onClick={() => copyDetail(srv.id, JSON.stringify(srv.details, null, 2))}
                          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900 cursor-pointer"
                        >
                          {copiedId === srv.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          {copiedId === srv.id ? "Copied" : "Copy JSON"}
                        </button>
                      </div>
                      <pre className="bg-slate-950 text-slate-200 p-3 rounded-none overflow-x-auto text-[11px] leading-relaxed">
                        {JSON.stringify(srv.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredServices.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-none p-3 text-center text-slate-400">
                <p className="font-heading font-normal text-sm uppercase">No services match the selected filter.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Future Services Extension Notice */}
      <div className="p-2.5 bg-slate-50 border border-dashed border-slate-300 rounded-none flex items-center justify-between text-xs text-slate-500 font-sans">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-400" />
          <span>Extensible Diagnostic Registry — includes automated Storefront Font Compliance Scanner and 9 API health telemetry probes.</span>
        </div>
        <span className="font-mono text-[10px] text-slate-400 uppercase font-bold tracking-wider">v2.1 Diagnostics</span>
      </div>
    </div>
  );
}
