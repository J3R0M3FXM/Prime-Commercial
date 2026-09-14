"use client";

export async function getClientFingerprint() {
  if (typeof window === "undefined") {
    return { appId: "PRIME_MINI_APP_V1", browser: "Server-side", deviceId: "SERVER" };
  }

  // Persistent device identifier across sessions
  let deviceId = "";
  try {
    deviceId = localStorage.getItem("prime_device_id") || "";
    if (!deviceId) {
      deviceId = "DEV_" + Math.random().toString(36).substring(2, 10).toUpperCase() + "_" + Date.now().toString(36).toUpperCase();
      localStorage.setItem("prime_device_id", deviceId);
    }
  } catch {
    deviceId = "DEV_" + Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  // WebGL GPU & Renderer details
  let renderer = "Standard GPU";
  let vendor = "Standard Vendor";
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || renderer;
        vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || vendor;
      }
    }
  } catch (e) {
    console.warn("WebGL fingerprinting error:", e);
  }

  // Canvas 2D Fingerprint Hash
  let canvasHash = "";
  try {
    const canvas2d = document.createElement("canvas");
    canvas2d.width = 200;
    canvas2d.height = 50;
    const ctx = canvas2d.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("PRIME-SECURITY-HASH-2026", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("PRIME-SECURITY-HASH-2026", 4, 17);
      canvasHash = canvas2d.toDataURL().slice(-32);
    }
  } catch (e) {
    canvasHash = "canvas-unavailable";
  }

  // Audio Context check
  let audioSupport = false;
  try {
    audioSupport = !!(window.AudioContext || (window as any).webkitAudioContext);
  } catch {
    audioSupport = false;
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const screenResolution = `${window.screen.width}x${window.screen.height}`;
  const availScreen = `${window.screen.availWidth}x${window.screen.availHeight}`;
  const colorDepth = `${window.screen.colorDepth}-bit`;
  const pixelRatio = window.devicePixelRatio || 1;
  const platform = navigator.platform || "Unknown";
  const userAgent = navigator.userAgent;
  const language = navigator.language || "en";
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const deviceMemory = (navigator as any).deviceMemory ? `${(navigator as any).deviceMemory} GB` : "Standard";
  const touchSupport = navigator.maxTouchPoints > 0 ? `Yes (${navigator.maxTouchPoints} pts)` : "None";

  return {
    appId: "PRIME_MINI_APP_V1",
    deviceId,
    browser: userAgent,
    platform,
    screenResolution,
    availScreen,
    colorDepth,
    pixelRatio,
    timezone,
    language,
    languages: navigator.languages ? Array.from(navigator.languages) : [language],
    graphics: renderer,
    vendor,
    canvasHash,
    audioSupport,
    hardwareConcurrency,
    deviceMemory,
    touchSupport,
    cookiesEnabled: navigator.cookieEnabled,
    timestamp: new Date().toISOString()
  };
}

export async function getClientLocation(): Promise<{lat: number, lon: number}> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: 0, lon: 0 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        console.warn("Geolocation failed/denied", err);
        resolve({ lat: 0, lon: 0 }); // Fail gracefully
      },
      { timeout: 5000 } // Prevent hanging forever
    );
  });
}
