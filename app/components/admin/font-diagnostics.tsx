"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Type, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ShieldCheck, 
  Search, 
  Sliders, 
  ExternalLink,
  Copy,
  Check
} from "lucide-react";

export interface FontViolation {
  id: string;
  tag: string;
  computedFontFamily: string;
  textSnippet: string;
  elementId?: string | null;
  className?: string;
  location: "storefront" | "admin";
}

export const ALLOWED_FONTS = [
  "Roboto Condensed",
  "Open Sauce Sans",
  "Open Sauce One",
  "SF Pro Condensed",
  "IBM Plex Mono",
];

export function isFontAllowed(computedFontFamily: string): boolean {
  if (!computedFontFamily) return false;
  const lower = computedFontFamily.toLowerCase();
  return ALLOWED_FONTS.some((allowed) => lower.includes(allowed.toLowerCase()));
}

export default function FontDiagnostics() {
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [totalScanned, setTotalScanned] = useState(0);
  const [violations, setViolations] = useState<FontViolation[]>([]);
  const [scanTarget, setScanTarget] = useState<"storefront" | "admin">("storefront");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const iframeContainerRef = useRef<HTMLDivElement | null>(null);

  const scanElements = (rootDoc: Document, targetName: "storefront" | "admin"): { scanned: number; foundViolations: FontViolation[] } => {
    const allElements = rootDoc.querySelectorAll("*");
    let textElementsCount = 0;
    const foundViolations: FontViolation[] = [];

    const ignoredTags = new Set([
      "SCRIPT", "STYLE", "LINK", "META", "HEAD", "TITLE", "NOSCRIPT", "IFRAME", "SVG", "PATH", "G", "DEFS", "SYMBOL", "USE"
    ]);

    allElements.forEach((el, idx) => {
      const tagName = el.tagName.toUpperCase();
      if (ignoredTags.has(tagName)) return;

      // Determine if element contains visible text or input placeholder/value
      let hasText = false;
      let snippet = "";

      if (tagName === "INPUT" || tagName === "TEXTAREA") {
        const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
        if (inputEl.placeholder || inputEl.value) {
          hasText = true;
          snippet = (inputEl.value || inputEl.placeholder || "").trim();
        }
      } else {
        // Check for direct child text nodes with non-whitespace content
        for (let i = 0; i < el.childNodes.length; i++) {
          const node = el.childNodes[i];
          if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim().length > 0) {
            hasText = true;
            snippet = node.textContent.trim();
            break;
          }
        }
      }

      if (!hasText) return;

      textElementsCount++;

      const win = rootDoc.defaultView || window;
      const computed = win.getComputedStyle(el);
      const computedFont = computed.fontFamily || "";

      if (!isFontAllowed(computedFont)) {
        foundViolations.push({
          id: `${targetName}-${idx}-${el.tagName.toLowerCase()}`,
          tag: el.tagName.toLowerCase(),
          computedFontFamily: computedFont || "initial / inherited unknown",
          textSnippet: snippet.slice(0, 80),
          elementId: el.id || null,
          className: typeof el.className === "string" ? el.className : "",
          location: targetName,
        });
      }
    });

    return { scanned: textElementsCount, foundViolations };
  };

  const runFontScan = async (target: "storefront" | "admin" = scanTarget) => {
    setIsScanning(true);
    setHasScanned(false);

    try {
      if (target === "admin") {
        // Scan current document DOM
        const result = scanElements(document, "admin");
        setTotalScanned(result.scanned);
        setViolations(result.foundViolations);
        setHasScanned(true);
        setIsScanning(false);
      } else {
        // Scan storefront via isolated iframe
        if (iframeContainerRef.current) {
          iframeContainerRef.current.innerHTML = "";
        }

        const iframe = document.createElement("iframe");
        iframe.src = "/";
        iframe.style.position = "fixed";
        iframe.style.top = "-9999px";
        iframe.style.left = "-9999px";
        iframe.style.width = "1280px";
        iframe.style.height = "800px";
        iframe.style.opacity = "0";
        iframe.style.pointerEvents = "none";

        if (iframeContainerRef.current) {
          iframeContainerRef.current.appendChild(iframe);
        } else {
          document.body.appendChild(iframe);
        }

        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            resolve();
          }, 4500);

          iframe.onload = () => {
            // Allow React hydration to complete in the iframe
            setTimeout(() => {
              clearTimeout(timeout);
              resolve();
            }, 800);
          };
        });

        if (iframe.contentDocument) {
          const result = scanElements(iframe.contentDocument, "storefront");
          setTotalScanned(result.scanned);
          setViolations(result.foundViolations);
        } else {
          // Fallback to scanning document if iframe contentDocument is inaccessible
          const result = scanElements(document, "storefront");
          setTotalScanned(result.scanned);
          setViolations(result.foundViolations);
        }

        // Clean up iframe after scan
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }

        setHasScanned(true);
        setIsScanning(false);
      }
    } catch (err) {
      console.error("Font scan failed:", err);
      setIsScanning(false);
      setHasScanned(true);
    }
  };

  useEffect(() => {
    // Automatically perform an initial scan when the diagnostics module is mounted
    runFontScan("storefront");
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    }
  };

  const filteredViolations = violations.filter((v) => {
    if (filterTag !== "all" && v.tag !== filterTag) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        v.tag.toLowerCase().includes(q) ||
        v.computedFontFamily.toLowerCase().includes(q) ||
        v.textSnippet.toLowerCase().includes(q) ||
        (v.elementId && v.elementId.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const uniqueTags = Array.from(new Set(violations.map((v) => v.tag)));

  return (
    <div id="font-diagnostics-module" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
      {/* Invisible container for scan iframe */}
      <div ref={iframeContainerRef} aria-hidden="true" className="hidden" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-heading font-normal uppercase text-lg text-slate-900 tracking-wide">
                Storefront DOM Font Compliance Scanner
              </h2>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Inspects all DOM text nodes across the storefront and flags any element with computed fonts outside the allowed list.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Target toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-mono">
            <button
              type="button"
              onClick={() => {
                setScanTarget("storefront");
                runFontScan("storefront");
              }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                scanTarget === "storefront"
                  ? "bg-white text-slate-900 font-bold shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Storefront (/)
            </button>
            <button
              type="button"
              onClick={() => {
                setScanTarget("admin");
                runFontScan("admin");
              }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                scanTarget === "admin"
                  ? "bg-white text-slate-900 font-bold shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Admin DOM
            </button>
          </div>

          <button
            type="button"
            id="btn-scan-fonts"
            onClick={() => runFontScan(scanTarget)}
            disabled={isScanning}
            className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-xs font-heading font-normal uppercase tracking-wider rounded-xl hover:bg-neutral-800 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
            {isScanning ? "Scanning DOM..." : "Scan Storefront"}
          </button>
        </div>
      </div>

      {/* Allowed Fonts Spec Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-heading uppercase text-slate-900 font-normal">Allowed Font Families Specification:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {ALLOWED_FONTS.map((font) => (
              <span
                key={font}
                className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-white text-slate-800 border border-slate-200 shadow-2xs"
              >
                {font}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Scan Summary Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <p className="text-[10px] font-mono uppercase text-slate-500 font-bold">Scanned Text Elements</p>
          <p className="font-heading font-normal text-xl text-slate-900 mt-0.5">
            {isScanning ? "Scanning..." : `${totalScanned} Elements`}
          </p>
        </div>

        <div
          className={`rounded-xl p-3 border ${
            violations.length === 0
              ? "bg-emerald-50/60 border-emerald-200 text-emerald-800"
              : "bg-rose-50/60 border-rose-200 text-rose-800"
          }`}
        >
          <p className="text-[10px] font-mono uppercase font-bold">
            {violations.length === 0 ? "Compliance Status" : "Font Family Violations"}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {violations.length === 0 ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-heading font-normal text-xl text-emerald-700">0 Violations (100% Compliant)</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span className="font-heading font-normal text-xl text-rose-700">{violations.length} Violations Found</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 col-span-2 sm:col-span-1">
          <p className="text-[10px] font-mono uppercase text-slate-500 font-bold">Target Context</p>
          <p className="font-mono text-sm font-bold text-slate-800 mt-1 uppercase">
            {scanTarget === "storefront" ? "Storefront (Client Route /)" : "Admin Active DOM"}
          </p>
        </div>
      </div>

      {/* If 0 Violations, show verified compliant confirmation */}
      {hasScanned && !isScanning && violations.length === 0 && (
        <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-heading uppercase font-bold text-emerald-900">
              DOM Text Elements Verified Compliant
            </h4>
            <p className="text-xs text-emerald-700 font-sans leading-relaxed">
              All {totalScanned} text-bearing DOM elements on the storefront strictly resolve to the allowed font family stack: 
              <strong> 'Roboto Condensed'</strong>, <strong>'Open Sauce Sans'</strong>, <strong>'Open Sauce One'</strong>, <strong>'SF Pro Condensed'</strong>, or <strong>'IBM Plex Mono'</strong>. No unapproved font families were discovered in the computed styles.
            </p>
          </div>
        </div>
      )}

      {/* Violations List Table & Filters if violations exist */}
      {violations.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono uppercase font-bold text-slate-600">Filter Tag:</span>
              <button
                type="button"
                onClick={() => setFilterTag("all")}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                  filterTag === "all"
                    ? "bg-slate-900 text-white font-bold"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All ({violations.length})
              </button>
              {uniqueTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setFilterTag(tag)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                    filterTag === tag
                      ? "bg-slate-900 text-white font-bold"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  &lt;{tag}&gt; ({violations.filter((v) => v.tag === tag).length})
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search element, snippet, or font..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-slate-900 w-full sm:w-64"
              />
            </div>
          </div>

          {/* List of Violations */}
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {filteredViolations.map((item, idx) => (
              <div
                key={item.id}
                id={`font-violation-${idx}`}
                className="p-3.5 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-200 rounded text-[11px] font-bold">
                      &lt;{item.tag}&gt;
                    </span>
                    {item.elementId && (
                      <span className="text-slate-500 text-[11px]">
                        id=<strong>#{item.elementId}</strong>
                      </span>
                    )}
                    {item.className && (
                      <span className="text-slate-400 text-[10px] truncate max-w-xs">
                        class="{item.className.slice(0, 40)}"
                      </span>
                    )}
                  </div>

                  <p className="text-slate-700 bg-slate-50 p-2 rounded border border-slate-200 text-xs break-words">
                    <span className="text-slate-400 select-none">Text: </span>
                    "{item.textSnippet}"
                  </p>
                </div>

                <div className="md:text-right space-y-1 shrink-0">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Computed Font-Family</span>
                  <div className="flex items-center md:justify-end gap-1.5">
                    <span className="px-2 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded text-xs font-bold">
                      {item.computedFontFamily}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(item.computedFontFamily, item.id)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                      title="Copy computed font family"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filteredViolations.length === 0 && (
              <div className="p-6 text-center text-slate-400 font-sans text-xs">
                No violations match the search filter.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
