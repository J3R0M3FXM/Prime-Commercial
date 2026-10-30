"use client";
import React from 'react';
import { Cloud, Server, Smartphone } from 'lucide-react';
import { useEffect } from 'react';

interface SplashScreenProps {
  title?: string;
  subtitle?: string;
}

export default function SplashScreen({ 
  title = "INITIALIZING SECURE SESSION", 
  subtitle = "ESTABLISHING ENCRYPTED TELEGRAM LINK..." 
}: SplashScreenProps) {
  useEffect(() => {
    document.body.classList.add("splash-active");
    return () => document.body.classList.remove("splash-active");
  }, []);

  return (
    <div className="relative z-[9999] min-h-screen w-full bg-white flex flex-col items-center justify-between p-6 text-slate-950 font-sans antialiased select-none">
      <div className="w-full max-w-[430px] mx-auto flex flex-col items-center justify-between flex-1 py-8 relative">
        
        {/* Top Section: Animation + Title/Subtitle */}
        <div className="flex flex-col items-center justify-center pt-4">
          {/* Phone and cloud/server exchange animated connection packets. */}
          <div className="relative mb-6 h-44 w-64 sm:h-48 sm:w-72" role="img" aria-label="A phone exchanging secure data with a cloud server">
            <div className="absolute inset-5 rounded-full bg-gradient-to-r from-sky-400/10 via-indigo-400/10 to-emerald-400/10 blur-xl" />
            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 256 176" fill="none" aria-hidden="true">
              <path d="M68 73 C104 39 138 31 180 31" stroke="#38bdf8" strokeOpacity=".35" strokeWidth="2" strokeDasharray="4 6" />
              <path d="M68 101 C104 135 138 143 180 143" stroke="#818cf8" strokeOpacity=".35" strokeWidth="2" strokeDasharray="4 6" />
              <circle r="3.5" fill="#0ea5e9">
                <animateMotion dur="1.8s" repeatCount="indefinite" path="M 68 73 C 104 39 138 31 180 31" />
              </circle>
              <circle r="2.5" fill="#6366f1">
                <animateMotion dur="2.2s" repeatCount="indefinite" path="M 180 43 C 138 44 104 54 68 85" />
              </circle>
              <circle r="3.5" fill="#10b981">
                <animateMotion dur="2s" repeatCount="indefinite" path="M 68 101 C 104 135 138 143 180 143" />
              </circle>
              <circle r="2.5" fill="#6366f1">
                <animateMotion dur="2.4s" repeatCount="indefinite" path="M 180 130 C 138 126 104 113 68 91" />
              </circle>
            </svg>

            <div className="absolute left-1 top-1/2 z-10 flex h-[94px] w-[54px] -translate-y-1/2 flex-col items-center rounded-[16px] border-2 border-sky-400 bg-slate-900 p-1.5 shadow-lg shadow-sky-500/20">
              <div className="mb-1 h-1 w-4 rounded-full bg-slate-600" />
              <div className="flex flex-1 items-center justify-center self-stretch rounded-[10px] bg-slate-950">
                <Smartphone className="h-7 w-7 text-sky-300 drop-shadow-[0_0_6px_rgba(56,189,248,0.65)]" />
              </div>
              <div className="mt-1 h-1 w-1 rounded-full bg-slate-500" />
            </div>

            <div className="absolute right-2 top-1 z-10 flex h-14 w-16 items-center justify-center rounded-2xl border border-sky-200 bg-white/90 text-sky-600 shadow-md shadow-sky-500/10 animate-pulse">
              <Cloud className="h-9 w-9" strokeWidth={1.8} />
            </div>

            <div className="absolute bottom-1 right-1 z-10 flex h-[68px] w-[76px] flex-col justify-center gap-1 rounded-xl border border-slate-300 bg-slate-900 px-2.5 shadow-lg shadow-indigo-500/15">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex h-4 items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${row === 1 ? "bg-sky-400" : "bg-emerald-400"} animate-pulse`} style={{ animationDelay: `${row * 0.22}s` }} />
                  <span className="h-0.5 flex-1 rounded-full bg-slate-600" />
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" style={{ animationDelay: `${(2 - row) * 0.25}s` }} />
                </div>
              ))}
            </div>
          </div>

          {/* Branding & Title */}
          <div className="text-center space-y-1.5 z-10 px-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono tracking-[0.2em] uppercase mb-1 animate-pulse">
              AUTHENTICATING
            </div>
            <h1 className="font-heading text-base sm:text-lg font-bold uppercase tracking-wider text-slate-900 whitespace-nowrap">
              {title}
            </h1>
            <p
              className="font-mono text-[11px] text-slate-500 tracking-wider"
              aria-label={subtitle}
            >
              {subtitle.replace(/\.\.\.$/, "")}
              {subtitle.endsWith("...") && (
                <>
                  <span className="animate-pulse" style={{ animationDelay: "0s" }}>.</span>
                  <span className="animate-pulse" style={{ animationDelay: "0.3s" }}>.</span>
                  <span className="animate-pulse" style={{ animationDelay: "0.6s" }}>.</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Bottom Branding Section: PRIME Logo + Legal/Developer Footer */}
        <div className="flex flex-col items-center justify-center w-full pb-4">
          <div className="flex items-center justify-center mb-4">
            <img 
              src="/prime-transparent.png" 
              alt="PRIME Logo" 
              className="h-9 sm:h-10 w-auto object-contain drop-shadow-sm"
            />
          </div>

          <div className="text-center font-mono uppercase tracking-[0.14em] text-[9.5px] sm:text-[10.5px] leading-relaxed text-slate-600">
            <div>© 2026 PRIME BUSINESS VENTURES, LLC.</div>
            <div>All rights reserved.</div>
            <div>DEVELOPED, MANAGED, AND MAINTAINED BY</div>
            <div>PRIMO</div>
          </div>
        </div>

      </div>
    </div>
  );
}
