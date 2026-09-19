"use client";
import React, { useState, useEffect } from 'react';

export default function LiveHeaderClock() {
  const [mounted, setMounted] = useState(false);
  const [timeStr, setTimeStr] = useState("");

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
      
      setTimeStr(`${month} ${day}, ${year} ${hours}:${minutes}:${seconds}`);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted) {
    return (
      <div className="flex flex-col justify-between h-7 sm:h-[28px] text-right select-none shrink-0" id="live-clock-placeholder" style={{ width: '135px' }}>
        <div className="text-[11px] sm:text-[12px] font-mono font-bold text-gray-300 tracking-tight leading-none h-3 bg-gray-100 rounded animate-pulse w-28 ml-auto" />
        <div className="text-[8px] sm:text-[8.5px] font-mono font-bold text-slate-400 tracking-[0.025em] leading-none whitespace-nowrap">
          SECURED CUSTOMER ACCESS
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between h-7 sm:h-[28px] text-right select-none shrink-0" id="live-clock-container" style={{ width: '135px' }}>
      <div className="text-[11px] sm:text-[12px] font-mono font-bold text-slate-700 tracking-[-0.01em] leading-none whitespace-nowrap">
        {timeStr}
      </div>
      <div className="text-[8px] sm:text-[8.5px] font-mono font-bold text-slate-400 tracking-[0.025em] leading-none whitespace-nowrap">
        SECURED CUSTOMER ACCESS
      </div>
    </div>
  );
}
