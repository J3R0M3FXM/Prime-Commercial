"use client";

import { useEffect, useState } from "react";
import { retrieveLaunchParams } from "@telegram-apps/sdk";

export default function Shopfront() {
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const { initDataRaw } = retrieveLaunchParams();
        
        const response = await fetch("/api/auth/telegram/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initDataRaw }),
        });

        if (response.ok) {
          setAuthorized(true);
        }
      } catch (e) {
        console.error("Auth check failed", e);
      } finally {
        setChecking(false);
      }
    }

    checkAuth();
  }, []);

  if (checking) return <div>Loading...</div>;

  if (!authorized) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h1>Access Denied</h1>
        <p>This shopfront is exclusively for use inside the Telegram environment.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>Welcome to the Shop</h1>
      <p>Your session is authorized.</p>
    </div>
  );
}
