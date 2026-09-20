"use client";
import React from 'react';
import { Smartphone } from 'lucide-react';

interface SplashScreenProps {
  title?: string;
  subtitle?: string;
}

export default function SplashScreen({ 
  title = "INITIALIZING SECURE SESSION", 
  subtitle = "ESTABLISHING ENCRYPTED TELEGRAM LINK..." 
}: SplashScreenProps) {
  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 text-white font-sans antialiased select-none">
      <div className="w-full max-w-[430px] mx-auto flex flex-col items-center justify-center relative min-h-[500px]">
        
        {/* Clean White Background Logo at Upper Center */}
        <div className="mb-6 px-4 py-2 bg-white rounded-2xl shadow-xl border border-white/20 flex items-center justify-center">
          <img 
            src="/primefinal.png" 
            alt="PRIME Logo" 
            className="h-7 sm:h-8 w-auto object-contain"
          />
        </div>

        {/* Moving / Pulsing Concentric Loading Circles */}
        <div className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center mb-8">
          {/* Outer Ring 1 - Rotating clockwise */}
          <div className="absolute inset-0 rounded-full border border-white/10 animate-[spin_10s_linear_infinite]" />
          {/* Outer Ring 2 - Rotating counter-clockwise with dash */}
          <div className="absolute inset-2 rounded-full border-2 border-dashed border-sky-400/30 animate-[spin_15s_linear_infinite_reverse]" />
          {/* Middle Pulse Ring */}
          <div className="absolute inset-6 rounded-full bg-gradient-to-tr from-sky-500/10 via-indigo-500/10 to-purple-500/10 animate-pulse blur-sm" />
          {/* Inner Ring 3 */}
          <div className="absolute inset-10 rounded-full border border-sky-400/40 animate-[spin_8s_linear_infinite]" />
          
          {/* Center Mobile Device Container with Floating Animation */}
          <div className="relative z-10 w-20 h-36 sm:w-24 sm:h-44 bg-slate-900 border-2 border-sky-400/60 rounded-2xl shadow-2xl shadow-sky-500/20 flex flex-col items-center p-2.5 animate-[bounce_3s_ease-in-out_infinite]">
            {/* Speaker / Notch */}
            <div className="w-6 h-1 bg-slate-700 rounded-full mb-2" />
            
            {/* Screen Content */}
            <div className="flex-1 w-full bg-slate-950 rounded-lg flex flex-col items-center justify-center p-1.5 overflow-hidden relative">
              {/* Scanline or glowing loader inside phone screen */}
              <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-sky-400 to-transparent animate-[pulse_1.5s_ease-in-out_infinite]" />
              <div className="w-8 h-8 rounded-full bg-sky-500/20 flex items-center justify-center mb-1 border border-sky-400/40">
                <Smartphone className="w-4 h-4 text-sky-400 animate-pulse" />
              </div>
              <div className="w-10 h-1.5 bg-sky-400/80 rounded-full mb-1 animate-pulse" />
              <div className="w-6 h-1 bg-slate-700 rounded-full" />
            </div>
            
            {/* Home indicator bar */}
            <div className="w-8 h-0.5 bg-slate-600 rounded-full mt-2" />
          </div>

          {/* Orbiting particle dots */}
          <div className="absolute inset-0 animate-[spin_6s_linear_infinite]">
            <div className="w-2.5 h-2.5 bg-sky-400 rounded-full shadow-[0_0_12px_#38bdf8] absolute -top-1 left-1/2 -translate-x-1/2" />
          </div>
          <div className="absolute inset-0 animate-[spin_9s_linear_infinite_reverse]">
            <div className="w-2 h-2 bg-indigo-400 rounded-full shadow-[0_0_10px_#818cf8] absolute bottom-0 left-1/4" />
          </div>
        </div>

        {/* Branding & Title */}
        <div className="text-center space-y-2 z-10 px-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-mono tracking-[0.2em] uppercase mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
            SECURE TELEGRAM GATEWAY
          </div>
          <h1 className="font-heading text-lg sm:text-xl font-normal uppercase tracking-wider text-white">
            {title}
          </h1>
          <p className="font-mono text-xs text-slate-400 tracking-wider">
            {subtitle}
          </p>
        </div>

        {/* Bottom progress bar */}
        <div className="absolute bottom-8 w-48 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div className="w-full h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-400 animate-[pulse_2s_ease-in-out_infinite]" />
        </div>

      </div>
    </div>
  );
}
