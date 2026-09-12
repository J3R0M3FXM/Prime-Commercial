"use client";

export async function getClientFingerprint() {
  // Simple hardware/browser fingerprinting
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl");
  const debugInfo = gl ? gl.getExtension("WEBGL_debug_renderer_info") : null;
  const renderer = debugInfo ? gl!.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "Unknown";

  return {
    appId: "PRIME_MINI_APP_V1",
    browser: navigator.userAgent,
    graphics: renderer,
    deviceId: "TEMP_ID_" + Math.random().toString(36).substring(7), // In production, generate a persistent device ID
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
