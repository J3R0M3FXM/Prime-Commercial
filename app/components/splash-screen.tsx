"use client";
import React, { useEffect } from 'react';
import { Fingerprint } from 'lucide-react';

interface SplashScreenProps { title?: string; subtitle?: string; progress?: number; }

export default function SplashScreen({ title = 'INITIALIZING SECURE SESSION', subtitle = 'ESTABLISHING ENCRYPTED TELEGRAM LINK...', progress = 0 }: SplashScreenProps) {
  const displayedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  useEffect(() => {
    document.body.classList.add('splash-active');
    return () => document.body.classList.remove('splash-active');
  }, []);

  return <div className="relative z-[9999] min-h-screen w-full bg-white flex flex-col items-center justify-between p-6 text-slate-950 font-sans antialiased select-none">
    <div className="w-full max-w-[430px] mx-auto flex flex-col items-center justify-between flex-1 py-8 relative">
      <div className="flex flex-col items-center justify-center pt-4">
        <div className="prime-splash-network" aria-label="Secure connection loading illustration">
          <div className="prime-splash-artwork">
            <img src="/prime-splash-connection.png" alt="Phone securely connecting to PRIME servers" />
            <div className="prime-splash-phone-auth" aria-label="Fingerprint scan in progress">
              <Fingerprint aria-hidden="true" />
              <span className="prime-splash-fingerprint-scan" aria-hidden="true" />
              <span className="prime-splash-fingerprint-dots" aria-hidden="true"><i /><i /><i /></span>
            </div>
            <div className="prime-splash-connection-flow" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div className="prime-splash-server-lights" aria-hidden="true">
              {['green','green','blue','green','orange','green','red','green','green','blue','green','orange'].map((color, index) => <i key={index} className={`prime-splash-server-light prime-splash-server-light--${color}`} />)}
            </div>
          </div>
        </div>
        <div className="prime-splash-progress" aria-label={`Loading ${displayedProgress}%`}>
          <div className="prime-splash-progress__fill" style={{ width: `${displayedProgress}%` }}><span>{displayedProgress}%</span></div>
        </div>
        <div className="text-center space-y-1.5 z-10 px-4">
          <h1 className="font-heading text-base sm:text-lg font-bold uppercase tracking-wider text-slate-900 break-words">{title}</h1>
          <p className="font-mono text-[11px] text-slate-500 tracking-wider" aria-label={subtitle}>{subtitle.replace(/\.\.\.$/, '')}{subtitle.endsWith('...') && <><span className="animate-pulse" style={{ animationDelay: '0s' }}>.</span><span className="animate-pulse" style={{ animationDelay: '0.3s' }}>.</span><span className="animate-pulse" style={{ animationDelay: '0.6s' }}>.</span></>}</p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center w-full pb-4">
        <div className="flex items-center justify-center mb-4"><img src="/prime-header-brand-refined.png" alt="PRIME" className="prime-splash-footer-brand" /></div>
        <div className="prime-splash-copyright text-center uppercase tracking-[0.14em] text-[9.5px] sm:text-[10.5px] leading-relaxed text-slate-600"><div>© 2026 PRIME BUSINESS VENTURES, LLC.</div><div>All rights reserved.</div><div>DEVELOPED, MANAGED, AND MAINTAINED BY</div><div>PRIMO</div></div>
      </div>
    </div>
  </div>;
}
