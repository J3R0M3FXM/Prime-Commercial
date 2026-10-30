"use client";
import React, { useState, useEffect } from 'react';

export default function LiveHeaderClock({ caption = "SECURE CUSTOMER ACCESS" }: { caption?: string }) {
  const [mounted, setMounted] = useState(false);
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    setMounted(true);
    const updateTime = () => {
      const now = new Date();
      const date = new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila", day: "2-digit", month: "short", year: "numeric",
      }).format(now).toUpperCase();
      const time = new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
      }).format(now).toUpperCase();
      setTimeStr(`${date} | ${time}`);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted) {
    return (
      <div className="prime-live-clock" id="live-clock-placeholder">
        <div className="prime-live-clock__time prime-live-clock__placeholder" />
        <div className="prime-live-clock__caption">{caption}</div>
      </div>
    );
  }

  return (
    <div className="prime-live-clock" id="live-clock-container">
      <div className="prime-live-clock__time">
        {timeStr}
      </div>
      <div className="prime-live-clock__caption">{caption}</div>
    </div>
  );
}
