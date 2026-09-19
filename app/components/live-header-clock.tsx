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
      <div className="flex flex-col items-end text-right select-none shrink-0" id="live-clock-placeholder">
        <div className="text-[10px] sm:text-[11px] font-mono font-bold text-gray-300 tracking-tight leading-none h-3.5 bg-gray-100 rounded animate-pulse w-32" />
        <div className="text-[7px] sm:text-[8px] font-mono font-bold text-slate-400 tracking-wider uppercase mt-1 leading-none">
          SECURED CUSTOMER ACCESS
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end text-right select-none shrink-0" id="live-clock-container">
      <div className="text-[10px] sm:text-[11px] font-mono font-bold text-slate-700 tracking-tight leading-none">
        {timeStr}
      </div>
      <div className="text-[7px] sm:text-[8px] font-mono font-bold text-slate-400 tracking-wider uppercase mt-1 leading-none">
        SECURED CUSTOMER ACCESS
      </div>
    </div>
  );
}
