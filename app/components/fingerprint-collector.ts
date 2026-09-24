"use client";

export interface DeviceData {
  appId: string;
  deviceId: string;
  hardwareId: string;
  sessionToken?: string;
  browser: string;
  platform: string;
  screenResolution: string;
  availScreen: string;
  pixelRatio: number;
  timezone: string;
  language: string;
  languages: string[];
  graphics: string;
  hardwareConcurrency: number;
  deviceMemory: string;
  touchSupport: string;
  timestamp: string;
}

export function getOrCreateSessionToken(deviceId?: string, customerId?: string): string {
  if (typeof window === "undefined") return "SESS_HMAC_SERVER";
  try {
    let token = sessionStorage.getItem("prime_session_token");
    if (!token) {
      const dev = deviceId || "DEV_GUEST";
      const ts = Date.now().toString();
      const cid = customerId || "GUEST";
      const raw = `${dev}:${ts}:${cid}:${Math.random().toString()}`;

      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        const char = raw.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
      }
      const hashHex = Math.abs(hash).toString(16).toUpperCase().padStart(8, "0");
      const randomBits = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).toUpperCase().padStart(8, "0");
      token = `SESS_HMAC_${hashHex}${randomBits}`;
      sessionStorage.setItem("prime_session_token", token);
    }
    return token;
  } catch {
    return `SESS_HMAC_${Date.now().toString(16).toUpperCase()}00000000`;
  }
}

export async function getClientFingerprint(): Promise<DeviceData> {
  if (typeof window === "undefined") {
    return {
      appId: "PRIME_SHOP_APP",
      deviceId: "SERVER",
      hardwareId: "SERVER",
      browser: "Server-side",
      platform: "Server",
      screenResolution: "0x0",
      availScreen: "0x0",
      pixelRatio: 1,
      timezone: "UTC",
      language: "en",
      languages: ["en"],
      graphics: "Standard",
      hardwareConcurrency: 4,
      deviceMemory: "Standard",
      touchSupport: "None",
      timestamp: new Date().toISOString()
    };
  }

  // 1. App ID detection (Telegram WebApp platform or browser client)
  const tgPlatform = (window as any).Telegram?.WebApp?.platform || "web";
  const appId = `PRIME_SHOP_${tgPlatform.toUpperCase()}`;

  // 2. Persistent Device ID (stored in localStorage & sessionStorage)
  let deviceId = "";
  try {
    deviceId = localStorage.getItem("prime_device_id") || sessionStorage.getItem("prime_device_id") || "";
    if (!deviceId) {
      deviceId = "DEV_" + Math.random().toString(36).substring(2, 8).toUpperCase() + "_" + Date.now().toString(36).toUpperCase();
      localStorage.setItem("prime_device_id", deviceId);
      sessionStorage.setItem("prime_device_id", deviceId);
    }
  } catch {
    deviceId = "DEV_" + Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  // 3. Hardware details & GPU
  let graphics = "Standard Graphics";
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        graphics = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || graphics;
      }
    }
  } catch {
    graphics = "Standard Graphics";
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const screenResolution = `${window.screen.width}x${window.screen.height}`;
  const availScreen = `${window.screen.availWidth}x${window.screen.availHeight}`;
  const pixelRatio = window.devicePixelRatio || 1;
  const platform = (window as any).Telegram?.WebApp?.platform ? `Telegram (${(window as any).Telegram.WebApp.platform})` : (navigator.platform || "Unknown");
  const userAgent = navigator.userAgent;
  const language = navigator.language || "en";
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const deviceMemory = (navigator as any).deviceMemory ? `${(navigator as any).deviceMemory} GB` : "Standard";
  const touchSupport = navigator.maxTouchPoints > 0 ? `Touch (${navigator.maxTouchPoints} pts)` : "Mouse/Keyboard";

  // 4. Stable Hardware Device Signature (acts like an IMEI/Hardware ID even if storage is cleared)
  const hardwareString = `${platform}|${screenResolution}|${hardwareConcurrency}|${graphics}|${timezone}`;
  let hash = 0;
  for (let i = 0; i < hardwareString.length; i++) {
    const chr = hardwareString.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  const hardwareId = "HW_" + Math.abs(hash).toString(16).toUpperCase().padStart(8, "0");

  const sessionToken = getOrCreateSessionToken(deviceId);

  return {
    appId,
    deviceId,
    hardwareId,
    sessionToken,
    browser: userAgent,
    platform,
    screenResolution,
    availScreen,
    pixelRatio,
    timezone,
    language,
    languages: navigator.languages ? Array.from(navigator.languages) : [language],
    graphics,
    hardwareConcurrency,
    deviceMemory,
    touchSupport,
    timestamp: new Date().toISOString()
  };
}

export interface LocationResult {
  lat: number;
  lon: number;
  accuracy?: number; // meters
  altitude?: number | null;
  source: "Precise GPS" | "Approximate Location" | "Unavailable";
}

/**
 * Calibrated high-accuracy GPS position getter.
 * Uses high accuracy mode, no cache, and proper timeout.
 * Checks Telegram LocationManager if available, with HTML5 Geolocation fallback.
 * The browser path uses watchPosition + clearWatch so a timed-out request is cleaned up.
 */
export let telegramSdkInitialized = false;

let telegramSdkModulePromise: Promise<any> | null = null;

async function getTelegramSdkModule(): Promise<any | null> {
  if (typeof window === "undefined") return null;
  if (!(window as any)?.Telegram?.WebApp) return null;

  if (!telegramSdkModulePromise) {
    telegramSdkModulePromise = import("@telegram-apps/sdk")
      .then((module) => module as any)
      .catch((error) => {
        telegramSdkModulePromise = null;
        console.warn("Telegram Mini App SDK loading failed:", error);
        return null;
      });
  }

  return telegramSdkModulePromise;
}

async function ensureTelegramSdkInitialized(): Promise<any | null> {
  const sdk = await getTelegramSdkModule();
  if (!sdk) return null;
  if (telegramSdkInitialized) return sdk;

  try {
    sdk.init({ acceptCustomStyles: false });
    telegramSdkInitialized = true;
    return sdk;
  } catch (error) {
    console.warn("Telegram Mini App SDK initialization failed:", error);
    return null;
  }
}

async function getTelegramSdkLocation(
  timeoutMs: number,
  allowPermissionPrompt: boolean,
): Promise<LocationResult | null> {
  const sdk = await ensureTelegramSdkInitialized();
  if (!sdk) return null;

  try {
    if (typeof sdk.isLocationManagerSupported !== "function" || !sdk.isLocationManagerSupported()) {
      return null;
    }

    await Promise.race([
      sdk.mountLocationManager(),
      new Promise((_, reject) => {
        window.setTimeout(
          () => reject(new Error("Telegram LocationManager mount timed out")),
          timeoutMs,
        );
      }),
    ]);

    if (!sdk.isLocationManagerAvailable()) {
      return { lat: 0, lon: 0, source: "Unavailable" };
    }

    const accessGranted = sdk.isLocationManagerAccessGranted();
    if (!allowPermissionPrompt && !accessGranted) {
      return { lat: 0, lon: 0, source: "Unavailable" };
    }

    // requestLocation() uses Telegram's web_app_request_location bridge.
    // Telegram does not show another permission prompt when the Mini App
    // already has an allowed or denied location state.
    if (sdk.isLocationManagerAccessRequested() && !accessGranted && !allowPermissionPrompt) {
      return { lat: 0, lon: 0, source: "Unavailable" };
    }

    const location = await Promise.race([
      sdk.requestLocation(),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);

    const lat = Number((location as any)?.latitude);
    const lon = Number((location as any)?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
      return { lat: 0, lon: 0, source: "Unavailable" };
    }

    const accuracy = Number((location as any)?.horizontal_accuracy);
    return {
      lat,
      lon,
      accuracy: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : undefined,
      altitude: (location as any)?.altitude ?? null,
      source: "Precise GPS",
    };
  } catch (error) {
    console.warn("Telegram SDK location request failed:", error);
    return { lat: 0, lon: 0, source: "Unavailable" };
  }
}

async function getClientLocation(
  timeoutMs = 10000,
  allowPermissionPrompt = true,
): Promise<LocationResult> {
  if (typeof window === "undefined") {
    return { lat: 0, lon: 0, source: "Unavailable" };
  }

  // Primary path inside Telegram: use the installed Telegram Mini App SDK
  // location bridge rather than directly invoking WebApp.LocationManager.
  if ((window as any)?.Telegram?.WebApp) {
    const telegramLocation = await getTelegramSdkLocation(
      timeoutMs,
      allowPermissionPrompt,
    );
    if (telegramLocation) return telegramLocation;
  }

  if (!navigator.geolocation) {
    return { lat: 0, lon: 0, source: "Unavailable" };
  }

  // Browser fallback is only used when the Telegram location bridge is
  // unavailable on the current client.
  try {
    if (navigator.permissions?.query) {
      const permission = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });
      if (
        permission.state === "denied" ||
        (!allowPermissionPrompt && permission.state !== "granted")
      ) {
        return { lat: 0, lon: 0, source: "Unavailable" };
      }
    } else if (!allowPermissionPrompt) {
      return { lat: 0, lon: 0, source: "Unavailable" };
    }
  } catch {
    if (!allowPermissionPrompt) {
      return { lat: 0, lon: 0, source: "Unavailable" };
    }
  }

  return new Promise((resolve) => {
    let settled = false;
    let watchId: number | null = null;

    const finish = (result: LocationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (watchId !== null) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {
          // ignore cleanup failures
        }
      }
      resolve(result);
    };

    const timer = window.setTimeout(() => {
      finish({ lat: 0, lon: 0, source: "Unavailable" });
    }, timeoutMs);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          finish({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            altitude: pos.coords.altitude ?? null,
            source: "Precise GPS",
          });
        },
        (err) => {
          console.warn("Browser GPS request denied or timed out:", err.message);
          finish({ lat: 0, lon: 0, source: "Unavailable" });
        },
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0,
        },
      );
    } catch (error) {
      console.warn("Browser GPS request could not start:", error);
      finish({ lat: 0, lon: 0, source: "Unavailable" });
    }
  });
}

