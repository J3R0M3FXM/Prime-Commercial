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
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-between p-6 text-slate-950 font-sans antialiased select-none">
      <div className="w-full max-w-[430px] mx-auto flex flex-col items-center justify-between flex-1 py-8 relative">
        
        {/* Top Section: Animation + Title/Subtitle */}
        <div className="flex flex-col items-center justify-center pt-4">
          {/* Moving / Pulsing Concentric Loading Circles & Mobile Device */}
          <div className="relative w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center mb-6">
            {/* Outer Ring 1 - Rotating clockwise */}
            <div className="absolute inset-0 rounded-full border border-sky-500/20 animate-[spin_10s_linear_infinite]" />
            {/* Outer Ring 2 - Rotating counter-clockwise with dash */}
            <div className="absolute inset-2 rounded-full border-2 border-dashed border-indigo-500/30 animate-[spin_15s_linear_infinite_reverse]" />
            {/* Middle Pulse Ring */}
            <div className="absolute inset-6 rounded-full bg-gradient-to-tr from-sky-400/15 via-indigo-400/15 to-purple-400/15 animate-pulse blur-sm" />
            {/* Inner Ring 3 */}
            <div className="absolute inset-10 rounded-full border border-sky-500/40 animate-[spin_8s_linear_infinite]" />
            
            {/* Center Mobile Device Container with Floating Animation */}
            <div className="relative z-10 w-16 h-28 sm:w-20 sm:h-36 bg-slate-900 border-2 border-sky-400/80 rounded-2xl shadow-xl shadow-sky-500/20 flex flex-col items-center p-2 animate-[bounce_3s_ease-in-out_infinite]">
              {/* Speaker / Notch */}
              <div className="w-5 h-1 bg-slate-700 rounded-full mb-1.5" />
              
              {/* Screen Content */}
              <div className="flex-1 w-full bg-slate-950 rounded-lg flex flex-col items-center justify-center p-1 overflow-hidden relative">
                <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-sky-400 to-transparent animate-[pulse_1.5s_ease-in-out_infinite]" />
                <div className="w-7 h-7 rounded-full bg-sky-500/20 flex items-center justify-center mb-1 border border-sky-400/40">
                  <Smartphone className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                </div>
                <div className="w-8 h-1 bg-sky-400/80 rounded-full mb-1 animate-pulse" />
                <div className="w-5 h-1 bg-slate-700 rounded-full" />
              </div>
              
              {/* Home indicator bar */}
              <div className="w-6 h-0.5 bg-slate-600 rounded-full mt-1.5" />
            </div>

            {/* Orbiting particle dots */}
            <div className="absolute inset-0 animate-[spin_6s_linear_infinite]">
              <div className="w-2.5 h-2.5 bg-sky-500 rounded-full shadow-[0_0_10px_#0ea5e9] absolute -top-1 left-1/2 -translate-x-1/2" />
            </div>
            <div className="absolute inset-0 animate-[spin_9s_linear_infinite_reverse]">
              <div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_#6366f1] absolute bottom-0 left-1/4" />
            </div>
          </div>

          {/* Branding & Title */}
          <div className="text-center space-y-1.5 z-10 px-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-600 text-[10px] font-mono tracking-[0.2em] uppercase mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
              SECURE TELEGRAM GATEWAY
            </div>
            <h1 className="font-heading text-base sm:text-lg font-bold uppercase tracking-wider text-slate-900">
              {title}
            </h1>
            <p className="font-mono text-[11px] text-slate-500 tracking-wider">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Center Bottom Section: Clean PRIME Logo & Progress */}
        <div className="flex flex-col items-center justify-center space-y-4 w-full pb-6">
          <div className="w-40 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="w-full h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-400 animate-[pulse_2s_ease-in-out_infinite]" />
          </div>

          <div className="flex items-center justify-center py-2 px-4 bg-white rounded-xl shadow-sm border border-slate-100">
            <img 
              src="/primefinal.png" 
              alt="PRIME Logo" 
              className="h-7 sm:h-8 w-auto object-contain"
            />
          </div>
        </div>

      </div>
    </div>
  );
}
