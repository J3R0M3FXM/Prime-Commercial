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
          {/* Original rotating circle animation + static mobile device */}
          <div className="relative w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center mb-6">
            {/* Outer Ring 1 - Rotating clockwise */}
            <div className="absolute inset-0 rounded-full border border-sky-500/20 animate-[spin_10s_linear_infinite]" />
            {/* Outer Ring 2 - Rotating counter-clockwise with dash */}
            <div className="absolute inset-2 rounded-full border-2 border-dashed border-indigo-500/30 animate-[spin_15s_linear_infinite_reverse]" />
            {/* Middle Pulse Ring */}
            <div className="absolute inset-6 rounded-full bg-gradient-to-tr from-sky-400/15 via-indigo-400/15 to-purple-400/15 animate-pulse blur-sm" />
            {/* Inner Ring 3 */}
            <div className="absolute inset-10 rounded-full border border-sky-500/40 animate-[spin_8s_linear_infinite]" />

            {/* Center Mobile Device Container — static */}
            <div className="relative z-10 w-16 h-28 sm:w-20 sm:h-36 bg-slate-900 border-2 border-sky-400/80 rounded-2xl shadow-xl shadow-sky-500/20 flex flex-col items-center p-2">
              <div className="w-5 h-1 bg-slate-700 rounded-full mb-1.5" />
              <div className="flex-1 w-full bg-slate-950 rounded-lg flex flex-col items-center justify-center p-1 overflow-hidden relative">
                <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-sky-400 to-transparent animate-[pulse_1.5s_ease-in-out_infinite]" />
                <div className="w-7 h-7 rounded-full bg-sky-500/20 flex items-center justify-center mb-1 border border-sky-400/40">
                  <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <div className="w-8 h-1 bg-sky-400/80 rounded-full mb-1 animate-pulse" />
                <div className="w-5 h-1 bg-slate-700 rounded-full" />
              </div>
              <div className="w-6 h-0.5 bg-slate-600 rounded-full mt-1.5" />
            </div>

            {/* Original orbiting dots + 2 additional circling elements */}
            <div className="absolute inset-0 animate-[spin_6s_linear_infinite]">
              <div className="w-2.5 h-2.5 bg-sky-500 rounded-full shadow-[0_0_10px_#0ea5e9] absolute -top-1 left-1/2 -translate-x-1/2" />
            </div>
            <div className="absolute inset-0 animate-[spin_9s_linear_infinite_reverse]">
              <div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_#6366f1] absolute bottom-0 left-1/4" />
            </div>
            <div className="absolute inset-3 animate-[spin_12s_linear_infinite]">
              <div className="w-2 h-2 bg-violet-500 rounded-full shadow-[0_0_8px_#8b5cf6] absolute top-1/2 -left-1 -translate-y-1/2" />
            </div>
            <div className="absolute inset-6 animate-[spin_14s_linear_infinite_reverse]">
              <div className="w-1.5 h-1.5 bg-sky-400 rounded-full shadow-[0_0_7px_#38bdf8] absolute top-1 -right-0.5" />
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
