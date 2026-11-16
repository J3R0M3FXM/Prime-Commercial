"use client";
import React, { useEffect } from 'react';

interface SplashScreenProps { title?: string; subtitle?: string; }

export default function SplashScreen({ title = 'INITIALIZING SECURE SESSION', subtitle = 'ESTABLISHING ENCRYPTED TELEGRAM LINK...' }: SplashScreenProps) {
  useEffect(() => {
    document.body.classList.add('splash-active');
    return () => document.body.classList.remove('splash-active');
  }, []);

  return <div className="relative z-[9999] min-h-screen w-full bg-white flex flex-col items-center justify-between p-6 text-slate-950 font-sans antialiased select-none">
    <div className="w-full max-w-[430px] mx-auto flex flex-col items-center justify-between flex-1 py-8 relative">
      <div className="flex flex-col items-center justify-center pt-4">
        <div className="prime-splash-network">
          <img src="/prime-global-brand-transparent.png" alt="PRIME" className="prime-splash-brand" />
        </div>
        <div className="text-center space-y-1.5 z-10 px-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono tracking-[0.2em] uppercase mb-1 animate-pulse">AUTHENTICATING</div>
          <h1 className="font-heading text-base sm:text-lg font-bold uppercase tracking-wider text-slate-900 break-words">{title}</h1>
          <p className="font-mono text-[11px] text-slate-500 tracking-wider" aria-label={subtitle}>{subtitle.replace(/\.\.\.$/, '')}{subtitle.endsWith('...') && <><span className="animate-pulse" style={{ animationDelay: '0s' }}>.</span><span className="animate-pulse" style={{ animationDelay: '0.3s' }}>.</span><span className="animate-pulse" style={{ animationDelay: '0.6s' }}>.</span></>}</p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center w-full pb-4">
        <div className="flex items-center justify-center mb-4"><img src="/prime-global-brand-transparent.png" alt="PRIME Logo" className="prime-splash-footer-brand" /></div>
        <div className="prime-splash-copyright text-center uppercase tracking-[0.14em] text-[9.5px] sm:text-[10.5px] leading-relaxed text-slate-600"><div>© 2026 PRIME BUSINESS VENTURES, LLC.</div><div>All rights reserved.</div><div>DEVELOPED, MANAGED, AND MAINTAINED BY</div><div>PRIMO</div></div>
      </div>
    </div>
  </div>;
}
