"use client";
import React from 'react';
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
          <div className="prime-splash-network" role="img" aria-label="A phone securely exchanging data with a blinking PRIME server">
            <div className="prime-splash-phone-rings" aria-hidden="true"><i /><i /><i /></div>
            <div className="prime-splash-phone" aria-hidden="true">
              <span className="prime-splash-phone-speaker" /><span className="prime-splash-phone-screen"><span /></span><span className="prime-splash-phone-home" />
            </div>
            <svg className="prime-splash-data-lines" viewBox="0 0 270 150" fill="none" aria-hidden="true">
              <path d="M58 57 H212" className="prime-splash-line" /><path d="M58 93 H212" className="prime-splash-line" />
              <circle r="3" className="prime-splash-packet prime-splash-packet-one"><animateMotion dur="1.65s" repeatCount="indefinite" path="M58 57 H212" /></circle>
              <circle r="3" className="prime-splash-packet prime-splash-packet-two"><animateMotion dur="1.65s" begin="-.8s" repeatCount="indefinite" path="M212 93 H58" /></circle>
            </svg>
            <div className="prime-splash-server" aria-hidden="true">
              <span className="prime-splash-server-core"><b /><b /><b /><b /><b /><b /></span>
              <span className="prime-splash-server-base" />
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
