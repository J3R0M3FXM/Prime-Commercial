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
      <div className="flex flex-col justify-center h-7 sm:h-[28px] text-right select-none shrink-0" id="live-clock-placeholder">
        <div className="text-[12.5px] sm:text-[13.5px] font-mono font-bold text-gray-300 h-3.5 bg-gray-100 rounded animate-pulse w-36 ml-auto mb-1" />
        <div className="text-[8.5px] sm:text-[9px] font-mono font-bold text-slate-400 tracking-[0.14em]">
          SECURED CUSTOMER ACCESS
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-center h-7 sm:h-[28px] text-right select-none shrink-0" id="live-clock-container">
      <div className="text-[12.5px] sm:text-[13.5px] font-mono font-bold text-slate-800 tracking-tight leading-none mb-0.5 whitespace-nowrap">
        {timeStr}
      </div>
      <div className="text-[8.5px] sm:text-[9px] font-mono font-bold text-slate-400 tracking-[0.14em] leading-none whitespace-nowrap">
        SECURED CUSTOMER ACCESS
      </div>
    </div>
  );
}
