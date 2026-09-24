"use client";
import React from 'react';
import { Smartphone } from 'lucide-react';
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
          {/* Four-circle configuration animation + static mobile device */}
          <div className="relative w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center mb-6">
            <div
              className="absolute w-40 h-40 sm:w-48 sm:h-48 rounded-full border border-sky-500/20 animate-pulse"
              style={{ animationDelay: "0s" }}
            />
            <div
              className="absolute w-32 h-32 sm:w-40 sm:h-40 rounded-full border-2 border-indigo-500/25 animate-pulse"
              style={{ animationDelay: "0.25s" }}
            />
            <div
              className="absolute w-24 h-24 sm:w-32 sm:h-32 rounded-full border border-violet-500/30 animate-pulse"
              style={{ animationDelay: "0.5s" }}
            />
            <div
              className="absolute w-16 h-16 sm:w-24 sm:h-24 rounded-full border-2 border-sky-500/35 animate-pulse"
              style={{ animationDelay: "0.75s" }}
            />

            {/* Center Mobile Device Container — static */}
            <div className="relative z-10 w-16 h-28 sm:w-20 sm:h-36 bg-slate-900 border-2 border-sky-400/80 rounded-2xl shadow-xl shadow-sky-500/20 flex flex-col items-center p-2">
              {/* Speaker / Notch */}
              <div className="w-5 h-1 bg-slate-700 rounded-full mb-1.5" />

              {/* Screen Content */}
              <div className="flex-1 w-full bg-slate-950 rounded-lg flex flex-col items-center justify-center p-1 overflow-hidden relative">
                <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-sky-400 to-transparent animate-pulse" />
                <div className="w-7 h-7 rounded-full bg-sky-500/20 flex items-center justify-center mb-1 border border-sky-400/40">
                  <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <div className="w-8 h-1 bg-sky-400/80 rounded-full mb-1 animate-pulse" />
                <div className="w-5 h-1 bg-slate-700 rounded-full" />
              </div>

              {/* Home indicator bar */}
              <div className="w-6 h-0.5 bg-slate-600 rounded-full mt-1.5" />
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
            <div>© 2026 | PRIME HOLDINGS PTY. LTD.</div>
            <div>All Rights Reserved</div>
            <div>DEVELOPED AND MAINTAINED BY</div>
            <div>P R I M O</div>
          </div>
        </div>

      </div>
    </div>
  );
}
