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
      const hour24 = now.getHours();
      const period = hour24 >= 12 ? "PM" : "AM";
      const hours = String(hour24 % 12 || 12).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      
      setTimeStr(`${day}-${month}-${year} | ${hours}:${minutes}:${seconds} ${period}`);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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
      <div className="w-full text-center text-[12.5px] sm:text-[13.5px] font-mono font-bold text-slate-800 tracking-tight leading-none mb-0.5 whitespace-nowrap underline decoration-[1px] underline-offset-2">
        {timeStr}
      </div>
      <div className="w-full text-center text-[8.5px] sm:text-[9px] font-mono font-bold text-emerald-600 tracking-[0.14em] leading-none whitespace-nowrap">
        SECURED CUSTOMER ACCESS
      </div>
    </div>
  );
}
