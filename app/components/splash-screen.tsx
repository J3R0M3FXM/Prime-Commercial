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
          <div className="prime-splash-network" role="img" aria-label="A rotating globe connected by internet highways with data travelling along them">
            <svg viewBox="0 0 340 220" fill="none" aria-hidden="true" className="prime-splash-globe-art">
              <defs>
                <radialGradient id="prime-globe-ocean" cx="32%" cy="25%" r="75%"><stop stopColor="#c5efff"/><stop offset=".58" stopColor="#64b6de"/><stop offset="1" stopColor="#176896"/></radialGradient>
                <linearGradient id="prime-globe-land" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#8ce6c3"/><stop offset="1" stopColor="#18a078"/></linearGradient>
                <clipPath id="prime-globe-clip"><circle cx="170" cy="110" r="74"/></clipPath>
              </defs>
              <circle className="prime-splash-halo" cx="170" cy="110" r="91"/>
              <circle className="prime-splash-halo prime-splash-halo-outer" cx="170" cy="110" r="103"/>
              <circle cx="170" cy="110" r="74" fill="url(#prime-globe-ocean)"/>
              <g clipPath="url(#prime-globe-clip)">
                <g className="prime-splash-globe-rotation">
                  <g id="prime-globe-map" fill="url(#prime-globe-land)" stroke="#0b8c76" strokeWidth="1.2" strokeLinejoin="round">
                    <path d="M96 58l15-8 19 3 8 9-6 7-12 1-3 9-9 2-7 12-10-2-4-10-9-5 2-9z"/>
                    <path d="M121 101l10 3 7 10-1 10-7 9-3 13-7 11-5-4 1-12-7-11 2-12-5-8z"/>
                    <path d="M157 59l13-6 13 3 6 6 12-2 14 7 12-1 12 8-3 9-12 1-5 7-9-4-4 8-9-2-3-8-11-1-5-8-11 3-7-6-8-2z"/>
                    <path d="M166 87l14 3 10 8 1 12-7 9-2 13-10 12-7-4-1-11-7-9-4-14 4-11z"/>
                    <path d="M218 127l15-4 12 5 5 10-7 9-15 2-10-6-6-8z"/>
                    <path d="M245 91l4 5-2 8-3 4-2-8zM203 103l4 4-1 9-4-3z"/>
                  </g>
                  <use href="#prime-globe-map" x="200"/>
                  <g className="prime-splash-meridians"><path d="M100 38C130 78 130 142 100 182M150 35C180 78 180 142 150 185M200 35C230 78 230 142 200 185M250 38C280 78 280 142 250 182"/><path d="M300 38C330 78 330 142 300 182M350 35C380 78 380 142 350 185M400 35C430 78 430 142 400 185M450 38C480 78 480 142 450 182"/></g>
                </g>
                <g className="prime-splash-parallels"><path d="M96 110h148M104 76c39 13 93 13 132 0M104 144c39-13 93-13 132 0"/></g>
              </g>
              <circle className="prime-splash-globe-outline" cx="170" cy="110" r="74"/>
              <g className="prime-splash-highways">
                <path d="M20 83C77 83 95 32 164 44S257 91 320 60"/>
                <path d="M17 133C74 133 104 185 176 168S263 120 323 143"/>
                <path d="M33 169C94 172 115 93 175 99S257 177 308 178"/>
              </g>
              <g className="prime-splash-points"><circle cx="20" cy="83" r="3"/><circle cx="320" cy="60" r="3"/><circle cx="17" cy="133" r="3"/><circle cx="323" cy="143" r="3"/><circle cx="33" cy="169" r="3"/><circle cx="308" cy="178" r="3"/></g>
              <g className="prime-splash-packets">
                <circle r="3.5"><animateMotion dur="3.2s" repeatCount="indefinite" path="M20 83C77 83 95 32 164 44S257 91 320 60"/></circle>
                <circle r="3" className="prime-splash-packet-blue"><animateMotion dur="3.2s" begin="-1.6s" repeatCount="indefinite" path="M20 83C77 83 95 32 164 44S257 91 320 60"/></circle>
                <circle r="3.5" className="prime-splash-packet-blue"><animateMotion dur="3.8s" begin="-1s" repeatCount="indefinite" path="M323 143C263 120 248 151 176 168S74 133 17 133"/></circle>
                <circle r="3"><animateMotion dur="4s" begin="-2s" repeatCount="indefinite" path="M33 169C94 172 115 93 175 99S257 177 308 178"/></circle>
              </g>
            </svg>
          </div>

          {/* Branding & Title */}
          <div className="text-center space-y-1.5 z-10 px-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono tracking-[0.2em] uppercase mb-1 animate-pulse">
              AUTHENTICATING
            </div>
            <h1 className="font-heading text-base sm:text-lg font-bold uppercase tracking-wider text-slate-900 break-words">
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
