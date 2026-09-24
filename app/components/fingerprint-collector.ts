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

async function getBrowserPreciseLocation(
  timeoutMs: number,
  allowPermissionPrompt: boolean,
): Promise<LocationResult | null> {
  if (!navigator.geolocation) return null;

  try {
    if (navigator.permissions?.query) {
      const permission = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });

      if (permission.state === "denied") {
        return { lat: 0, lon: 0, source: "Unavailable" };
      }

      // Silent recovery is only allowed after the browser/WebView permission
      // is explicitly reported as granted. Never trigger a second prompt from
      // Step 4 or another recovery path.
      if (!allowPermissionPrompt && permission.state !== "granted") {
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
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ lat: 0, lon: 0, source: "Unavailable" });
    }, timeoutMs);

    const finish = (result: LocationResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };

    try {
      navigator.geolocation.getCurrentPosition(
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
          console.warn("Browser GPS request failed:", err.message);
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

async function getTelegramPreciseLocation(
  timeoutMs: number,
  allowPermissionPrompt: boolean,
): Promise<LocationResult | null> {
  const webApp = (window as any)?.Telegram?.WebApp;
  const tgLocationManager = webApp?.LocationManager;

  if (
    !tgLocationManager ||
    typeof tgLocationManager.init !== "function" ||
    typeof tgLocationManager.getLocation !== "function"
  ) {
    return null;
  }

  try {
    if (!allowPermissionPrompt) {
      const accessRequested = tgLocationManager.isAccessRequested === true;
      const accessGranted = tgLocationManager.isAccessGranted === true;
      if (!accessGranted || !accessRequested) {
        return { lat: 0, lon: 0, source: "Unavailable" };
      }
    }

    const nativeResult = await new Promise<any>((resolve) => {
      let settled = false;
      let timer: number | null = null;

      const finish = (data: any) => {
        if (settled) return;
        settled = true;
        if (timer !== null) {
          window.clearTimeout(timer);
          timer = null;
        }
        resolve(data);
      };

      timer = window.setTimeout(() => finish(null), timeoutMs);

      try {
        const request = () => {
          try {
            tgLocationManager.getLocation((data: any) => finish(data));
          } catch (error) {
            console.warn("Telegram LocationManager request failed:", error);
            finish(null);
          }
        };

        if (tgLocationManager.isInited === true) {
          request();
        } else {
          tgLocationManager.init(request);
        }
      } catch (error) {
        console.warn("Telegram LocationManager initialization failed:", error);
        finish(null);
      }
    });

    const lat = Number(nativeResult?.latitude);
    const lon = Number(nativeResult?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
      return { lat: 0, lon: 0, source: "Unavailable" };
    }

    const accuracy = Number(
      nativeResult?.horizontal_accuracy ?? nativeResult?.accuracy
    );

    return {
      lat,
      lon,
      accuracy: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : undefined,
      altitude: nativeResult?.altitude ?? null,
      source: "Precise GPS",
    };
  } catch (error) {
    console.warn("Telegram native GPS handling failed:", error);
    return { lat: 0, lon: 0, source: "Unavailable" };
  }
}

export async function getClientLocation(
  timeoutMs = 30000,
  allowPermissionPrompt = true,
): Promise<LocationResult> {
  if (typeof window === "undefined") {
    return { lat: 0, lon: 0, source: "Unavailable" };
  }

  // In embedded Android/WebView environments, use the browser geolocation
  // permission channel first. The host permission shown in the user's device
  // settings is the channel that actually governs this precise GPS request.
  const browserLocation = await getBrowserPreciseLocation(
    timeoutMs,
    allowPermissionPrompt,
  );
  if (
    browserLocation &&
    browserLocation.source === "Precise GPS"
  ) {
    return browserLocation;
  }

  // Telegram-native location remains a fallback for Mini App clients where the
  // browser/WebView geolocation API is unavailable or returns no coordinates.
  const telegramLocation = await getTelegramPreciseLocation(
    timeoutMs,
    allowPermissionPrompt,
  );
  if (telegramLocation && telegramLocation.source === "Precise GPS") {
    return telegramLocation;
  }

  return {
    lat: 0,
    lon: 0,
    source: "Unavailable",
  };
}
