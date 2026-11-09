"use client";
import React, { useEffect } from 'react';

interface SplashScreenProps { title?: string; subtitle?: string; }

const lights = [
  ...[78, 120, 162, 204, 246, 288, 330].flatMap((y, row) =>
    [438, 449, 460, 472].map((x, column) => ({ x, y, color: ['green', 'green', 'yellow', 'blue', 'green', 'red'][(row + column * 2) % 6] }))),
  ...[109, 139, 169, 199, 229, 259].flatMap((y, row) =>
    [305, 315, 325].map((x, column) => ({ x, y, color: ['green', 'green', 'yellow', 'blue', 'red'][(row + column * 2) % 5] }))),
  ...[109, 139, 169, 199, 229, 259].flatMap((y, row) =>
    [570, 580, 590].map((x, column) => ({ x, y, color: ['green', 'green', 'blue', 'yellow', 'red'][(row + column * 2) % 5] }))),
];

export default function SplashScreen({ title = 'INITIALIZING SECURE SESSION', subtitle = 'ESTABLISHING ENCRYPTED TELEGRAM LINK...' }: SplashScreenProps) {
  useEffect(() => {
    document.body.classList.add('splash-active');
    return () => document.body.classList.remove('splash-active');
  }, []);

  return <div className="relative z-[9999] min-h-screen w-full bg-white flex flex-col items-center justify-between p-6 text-slate-950 font-sans antialiased select-none">
    <div className="w-full max-w-[430px] mx-auto flex flex-col items-center justify-between flex-1 py-8 relative">
      <div className="flex flex-col items-center justify-center pt-4">
        <div className="prime-splash-network" role="img" aria-label="Server racks with blinking lights and gently moving blue clouds">
          <svg viewBox="0 0 800 396" className="prime-splash-server-art" aria-hidden="true">
            <defs>
              <filter id="prime-splash-cloud-tint" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0.60 0 0 0 0.08  0 0.82 0 0 0.08  0 0 1 0 0.12  0 0 0 1 0" /></filter>
              <clipPath id="prime-splash-cloud-left"><path d="M0 95H237V265H0Z" /></clipPath>
              <clipPath id="prime-splash-cloud-right"><path d="M633 130H800V267H633Z" /></clipPath>
              <clipPath id="prime-splash-cloud-front"><path d="M146 292C146 277 156 265 176 265C180 247 201 235 221 236C240 221 269 231 282 251C295 243 312 245 323 257C343 252 357 263 359 278C379 277 393 288 394 308L394 362H146Z" /></clipPath>
            </defs>
            <image href="/prime-splash-servers.png" width="800" height="396" />
            <g filter="url(#prime-splash-cloud-tint)">
              <g className="prime-splash-cloud prime-splash-cloud--left" clipPath="url(#prime-splash-cloud-left)"><image href="/prime-splash-servers.png" width="800" height="396" /></g>
              <g className="prime-splash-cloud prime-splash-cloud--right" clipPath="url(#prime-splash-cloud-right)"><image href="/prime-splash-servers.png" width="800" height="396" /></g>
              <g className="prime-splash-cloud prime-splash-cloud--front" clipPath="url(#prime-splash-cloud-front)"><image href="/prime-splash-servers.png" width="800" height="396" /></g>
            </g>
            <g className="prime-splash-lights">{lights.map((light, index) => <circle key={index} className={`prime-splash-light prime-splash-light--${light.color}`} cx={light.x} cy={light.y} r="2.2" style={{ animationDelay: `${-(index % 9) * 0.21}s` }} />)}</g>
          </svg>
        </div>
        <div className="text-center space-y-1.5 z-10 px-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono tracking-[0.2em] uppercase mb-1 animate-pulse">AUTHENTICATING</div>
          <h1 className="font-heading text-base sm:text-lg font-bold uppercase tracking-wider text-slate-900 break-words">{title}</h1>
          <p className="font-mono text-[11px] text-slate-500 tracking-wider" aria-label={subtitle}>{subtitle.replace(/\.\.\.$/, '')}{subtitle.endsWith('...') && <><span className="animate-pulse" style={{ animationDelay: '0s' }}>.</span><span className="animate-pulse" style={{ animationDelay: '0.3s' }}>.</span><span className="animate-pulse" style={{ animationDelay: '0.6s' }}>.</span></>}</p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center w-full pb-4">
        <div className="flex items-center justify-center mb-4"><img src="/prime-brand-logo.png" alt="PRIME Logo" className="h-20 max-w-full w-auto object-contain" /></div>
        <div className="prime-splash-copyright text-center uppercase tracking-[0.14em] text-[9.5px] sm:text-[10.5px] leading-relaxed text-slate-600"><div>© 2026 PRIME BUSINESS VENTURES, LLC.</div><div>All rights reserved.</div><div>DEVELOPED, MANAGED, AND MAINTAINED BY</div><div>PRIMO</div></div>
      </div>
    </div>
  </div>;
}
