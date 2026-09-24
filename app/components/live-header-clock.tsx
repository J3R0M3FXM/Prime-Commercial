"use client";
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';

export default function LiveHeaderClock() {
  const [mounted, setMounted] = useState(false);
  const [timeStr, setTimeStr] = useState("");
  const timeRef = useRef<HTMLDivElement | null>(null);
  const secureRef = useRef<HTMLDivElement | null>(null);
  const [secureLetterSpacing, setSecureLetterSpacing] = useState("0.14em");

  useEffect(() => {
    setMounted(true);
    const updateTime = () => {
      const now = new Date();
      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      const month = months[now.getMonth()];
      const day = String(now.getDate()).padStart(2, '0');
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      
      setTimeStr(`${month} ${day}, ${year} • ${hours}:${minutes}:${seconds}`);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useLayoutEffect(() => {
    const syncSecureWidth = () => {
      const timeEl = timeRef.current;
      const secureEl = secureRef.current;
      if (!timeEl || !secureEl) return;

      const targetWidth = timeEl.getBoundingClientRect().width;
      const secureWidth = secureEl.getBoundingClientRect().width;
      const textLength = secureEl.textContent?.trim().length || 1;
      const extraSpacing = Math.max(0, targetWidth - secureWidth) / Math.max(1, textLength - 1);

      setSecureLetterSpacing(`${0.14 + extraSpacing / 16}px`);
    };

    syncSecureWidth();
    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(syncSecureWidth)
      : null;
    if (observer) {
      if (timeRef.current) observer.observe(timeRef.current);
      if (secureRef.current) observer.observe(secureRef.current);
    }
    window.addEventListener("resize", syncSecureWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncSecureWidth);
    };
  }, [timeStr, mounted]);

  if (!mounted) {
    return (
      <div className="flex flex-col justify-center h-7 sm:h-[28px] text-center select-none shrink-0" id="live-clock-placeholder">
        <div className="text-[12.5px] sm:text-[13.5px] font-mono font-bold text-gray-300 h-3.5 bg-gray-100 rounded animate-pulse w-36 mb-1" />
        <div className="w-full text-center text-[8.5px] sm:text-[9px] font-mono font-bold text-emerald-600 tracking-[0.14em]">
          SECURED CUSTOMER ACCESS
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-center h-7 sm:h-[28px] text-center select-none shrink-0" id="live-clock-container">
      <div ref={timeRef} className="w-full text-center text-[12.5px] sm:text-[13.5px] font-mono font-bold text-slate-800 tracking-tight leading-none mb-0.5 whitespace-nowrap underline decoration-[1px] underline-offset-2">
        {timeStr}
      </div>
      <div ref={secureRef} style={{ letterSpacing: secureLetterSpacing }} className="w-full text-center text-[8.5px] sm:text-[9px] font-mono font-bold text-emerald-600 leading-none whitespace-nowrap">
        SECURED CUSTOMER ACCESS
      </div>
    </div>
  );
}
