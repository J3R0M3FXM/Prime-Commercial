"use client";
import React, { useState, useEffect } from 'react';

function StableLiveTime({ value }: { value: string }) {
  const parts = /^(\d{2}):(\d{2}):(\d{2})\s([AP]M)$/.exec(value);
  if (!parts) return value;
  const digits = (group: string, label: string) => (
    <span className="prime-live-clock__digits" aria-label={label}>
      {Array.from(group).map((digit, index) => (
        <span className="prime-live-clock__digit" aria-hidden="true" key={index}>{digit}</span>
      ))}
    </span>
  );
  return (
    <>
      {digits(parts[1], "hour")}
      <span className="prime-live-clock__punctuation" aria-hidden="true">:</span>
      {digits(parts[2], "minute")}
      <span className="prime-live-clock__punctuation" aria-hidden="true">:</span>
      {digits(parts[3], "second")}
      <span className="prime-live-clock__meridiem" aria-hidden="true">{parts[4]}</span>
    </>
  );
}

export default function LiveHeaderClock() {
  const [mounted, setMounted] = useState(false);
  const [dateStr, setDateStr] = useState("");
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
      setDateStr(date);
      setTimeStr(time);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted) {
    return (
      <div className="prime-live-clock" id="live-clock-placeholder">
        <div className="prime-live-clock__time prime-live-clock__placeholder" />
      </div>
    );
  }

  return (
    <div className="prime-live-clock" id="live-clock-container">
      <div className="prime-live-clock__time">
        <span className="prime-live-clock__time-text prime-live-clock__date">{dateStr}</span>
        <span className="prime-live-clock__time-text prime-live-clock__separator" aria-hidden="true">•</span>
        <span className="prime-live-clock__time-text prime-live-clock__time-value" aria-label={timeStr}>
          <StableLiveTime value={timeStr} />
        </span>
      </div>
    </div>
  );
}
