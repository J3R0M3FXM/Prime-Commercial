"use client";
import React, { useEffect } from 'react';
import connectionArtwork from '@/public/prime-splash-secure-connection.svg?inline';
import brandArtwork from '@/public/prime-header-brand-refined.png?inline';

export const StartupProgressContext = React.createContext<number | null>(null);
let activeSplashes = 0;

interface SplashScreenProps { title?: string; subtitle?: string; progress?: number; }

export default function SplashScreen({ title = 'INITIALIZING SECURE SESSION', subtitle = 'ESTABLISHING ENCRYPTED TELEGRAM LINK...', progress = 0 }: SplashScreenProps) {
  const launchProgress = React.useContext(StartupProgressContext);
  const displayedProgress = Math.max(0, Math.min(100, Math.round(launchProgress ?? progress)));
  useEffect(() => {
    activeSplashes++;
    document.body.classList.add('splash-active');
    return () => { if (--activeSplashes === 0) document.body.classList.remove('splash-active'); };
  }, []);

  return <div className="relative overflow-hidden z-[9999] min-h-screen w-full max-w-[430px] mx-auto bg-white flex flex-col items-center justify-between py-6 text-slate-950 font-sans antialiased select-none">
    <div className="w-full max-w-[430px] mx-auto flex flex-col items-center justify-between flex-1 py-8 relative">
      <div className="flex w-full flex-col items-center justify-center pt-4">
        <div className="prime-splash-network" aria-label="Secure connection loading illustration">
          <img data-splash-artwork className="prime-splash-secure-art" src={connectionArtwork} alt="Animated secure connection between a Telegram phone and PRIME servers" />
        </div>
        <div className="prime-splash-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayedProgress} aria-label="Startup progress">
          <div className="prime-splash-progress__fill" style={{ width: `${displayedProgress}%` }}><span>{displayedProgress}%</span></div>
        </div>
        <div className="text-center space-y-1.5 z-10 px-4">
          <h1 className="font-heading text-base sm:text-lg font-normal uppercase tracking-wider text-slate-900 break-words">{title}</h1>
          <p className="font-mono text-[11px] text-slate-500 tracking-wider" aria-label={subtitle}>{subtitle.replace(/\.\.\.$/, '')}{subtitle.endsWith('...') && <><span className="animate-pulse" style={{ animationDelay: '0s' }}>.</span><span className="animate-pulse" style={{ animationDelay: '0.3s' }}>.</span><span className="animate-pulse" style={{ animationDelay: '0.6s' }}>.</span></>}</p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center w-full px-6 pb-4">
        <div className="flex items-center justify-center mb-4"><img data-splash-brand src={brandArtwork} alt="PRIME" className="prime-splash-footer-brand" /></div>
        <div className="prime-splash-copyright text-center uppercase tracking-[0.14em] text-[9.5px] sm:text-[10.5px] leading-relaxed text-slate-600"><div>© 2026 PRIME BUSINESS VENTURES, LLC.</div><div>All rights reserved.</div><div>DEVELOPED, MANAGED, AND MAINTAINED BY</div><div>PRIMO</div></div>
      </div>
    </div>
  </div>;
}
