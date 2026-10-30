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
  capturedAt?: string;
  source: "Precise GPS" | "Approximate Location" | "Unavailable";
}
let physicalGpsWatchId: number | null = null;
let latestPhysicalGpsLocation: LocationResult | null = null;
let physicalGpsWaiters: Array<(location: LocationResult | null) => void> = [];
let physicalGpsRefreshInFlight: Promise<LocationResult | null> | null = null;
let physicalGpsGeneration = 0;
let physicalGpsTelemetryStarted = false;

function publishPhysicalGpsLocation(location: LocationResult | null): void {
  if (!location) return;

  const lat = Number(location.lat);
  const lon = Number(location.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return;
  }

  latestPhysicalGpsLocation = {
    ...location,
    capturedAt: location.capturedAt || new Date().toISOString(),
    source: "Precise GPS",
  };

  const waiters = physicalGpsWaiters;
  physicalGpsWaiters = [];
  for (const resolve of waiters) {
    resolve(latestPhysicalGpsLocation);
  }
}

function startBrowserPhysicalGpsWatcher(): void {
  if (
    typeof window === "undefined" ||
    !navigator.geolocation ||
    physicalGpsWatchId !== null
  ) {
    return;
  }

  try {
    physicalGpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        publishPhysicalGpsLocation({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          altitude: pos.coords.altitude ?? null,
          source: "Precise GPS",
        });
      },
      (err) => {
        console.warn("[PRIME GPS] browser physical location watcher failed:", err.message);
        if (physicalGpsWatchId !== null) {
          try {
            navigator.geolocation.clearWatch(physicalGpsWatchId);
          } catch {
            // ignore cleanup failures
          }
          physicalGpsWatchId = null;
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      },
    );
  } catch (error) {
    console.warn("[PRIME GPS] browser physical location watcher could not start:", error);
    physicalGpsWatchId = null;
  }
}

async function requestPhysicalGpsFromAvailableChannels(
  allowPermissionPrompt: boolean,
): Promise<LocationResult | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const telegramWebApp = (window as any)?.Telegram?.WebApp;
  const telegramLocationManager = telegramWebApp?.LocationManager;
  const hasTelegramLocationManager =
    !!telegramLocationManager &&
    typeof telegramLocationManager.init === "function" &&
    typeof telegramLocationManager.getLocation === "function";

  // Telegram's native LocationManager is the primary channel inside a Mini App.
  // This is the path that can already be authorized at the Telegram level even
  // when navigator.geolocation is unavailable inside Telegram's WebView.
  if (hasTelegramLocationManager) {
    const telegramLocation = await getTelegramPreciseLocation(
      25000,
      allowPermissionPrompt,
    );

    if (telegramLocation?.source === "Precise GPS") {
      return telegramLocation;
    }

    // Do not create a second permission prompt after Telegram has handled the
    // location permission. The browser channel is only a silent fallback here.
    const browserLocation = await getBrowserPreciseLocation(
      10000,
      false,
    );

    if (browserLocation?.source === "Precise GPS") {
      return browserLocation;
    }

    return null;
  }

  // Non-Telegram/browser deployments still get a normal browser geolocation
  // request. This branch is the only browser path allowed to prompt.
  return getBrowserPreciseLocation(
    30000,
    allowPermissionPrompt,
  );
}

export function refreshPhysicalGpsTelemetry(
  allowPermissionPrompt = false,
): Promise<LocationResult | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  if (physicalGpsRefreshInFlight) {
    return physicalGpsRefreshInFlight;
  }

  const generationAtStart = physicalGpsGeneration;

  const refresh = (async () => {
    const location = await requestPhysicalGpsFromAvailableChannels(
      allowPermissionPrompt,
    );

    if (generationAtStart !== physicalGpsGeneration) {
      return null;
    }

    if (location?.source === "Precise GPS") {
      publishPhysicalGpsLocation(location);
      return latestPhysicalGpsLocation;
    }

    // Never start browser geolocation in the background. A silent lookup can
    // still trigger a platform prompt in embedded WebViews.
    return latestPhysicalGpsLocation;
  })();

  let trackedRefresh!: Promise<LocationResult | null>;
  trackedRefresh = refresh.then(
    (value) => {
      if (physicalGpsRefreshInFlight === trackedRefresh) {
        physicalGpsRefreshInFlight = null;
      }
      return value;
    },
    (error) => {
      if (physicalGpsRefreshInFlight === trackedRefresh) {
        physicalGpsRefreshInFlight = null;
      }
      throw error;
    },
  );

  physicalGpsRefreshInFlight = trackedRefresh;
  return trackedRefresh;
}

export function startPhysicalGpsTelemetry(): void {
  if (
    typeof window === "undefined" ||
    physicalGpsTelemetryStarted
  ) {
    return;
  }

  physicalGpsTelemetryStarted = true;

  try {
    const telegramWebApp = (window as any)?.Telegram?.WebApp;
    if (typeof telegramWebApp?.ready === "function") {
      try {
        telegramWebApp.ready();
      } catch {
        // Best effort.
      }
    }
  } catch {
    // Ignore Telegram initialization issues.
  }

  // Location is requested only after a customer taps the location action in
  // checkout. App startup and Telegram resume must never prompt for GPS.
}

export function stopPhysicalGpsTelemetry(): void {
  if (typeof window === "undefined") return;

  physicalGpsGeneration += 1;
  physicalGpsTelemetryStarted = false;

  if (physicalGpsWatchId !== null) {
    try {
      navigator.geolocation.clearWatch(physicalGpsWatchId);
    } catch {
      // ignore cleanup failures
    }
    physicalGpsWatchId = null;
  }

  const waiters = physicalGpsWaiters;
  physicalGpsWaiters = [];
  for (const resolve of waiters) {
    resolve(null);
  }
}

export function getLatestPhysicalGpsLocation(): LocationResult | null {
  return latestPhysicalGpsLocation;
}

export function waitForPhysicalGps(timeoutMs = 15000): Promise<LocationResult | null> {
  if (latestPhysicalGpsLocation) {
    return Promise.resolve(latestPhysicalGpsLocation);
  }

  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }


  return new Promise((resolve) => {
    let settled = false;

    const finish = (location: LocationResult | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(location);
    };

    const timer = window.setTimeout(() => {
      const index = physicalGpsWaiters.indexOf(finish);
      if (index >= 0) physicalGpsWaiters.splice(index, 1);
      finish(null);
    }, timeoutMs);

    physicalGpsWaiters.push(finish);
  });
}

async function requestTelegramLocationOnce(
  manager: any,
  webApp: any,
  timeoutMs: number,
): Promise<LocationResult | null> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: number | null = null;
    let onLocationRequested = (_event: any) => {};

    const cleanup = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      try {
        if (typeof webApp.offEvent === "function") {
          webApp.offEvent("locationRequested", onLocationRequested);
        }
      } catch {
        // ignore cleanup failures
      }
    };

    const finish = (data: any) => {
      if (settled) return;
      settled = true;
      cleanup();

      const lat = Number(data?.latitude);
      const lon = Number(data?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        resolve(null);
        return;
      }

      const accuracy = Number(data?.horizontal_accuracy ?? data?.accuracy);
      resolve({
        lat,
        lon,
        accuracy: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : undefined,
        altitude: data?.altitude ?? null,
        source: "Precise GPS",
      });
    };

    onLocationRequested = (event: any) => {
      finish(event?.locationData ?? event);
    };

    timer = window.setTimeout(() => finish(null), timeoutMs);

    try {
      if (typeof webApp.onEvent === "function") {
        webApp.onEvent("locationRequested", onLocationRequested);
      }
    } catch {
      // getLocation callback remains authoritative.
    }

    try {
      manager.getLocation((data: any) => finish(data));
    } catch (error) {
      console.warn("Telegram getLocation() failed:", error);
      finish(null);
    }
  });
}

async function getTelegramPreciseLocation(
  timeoutMs: number,
  allowPermissionPrompt: boolean,
  initTimeoutMs = 5000,
  refineForMs = 5000,
  targetAccuracyMeters = 25,
): Promise<LocationResult | null> {
  const webApp = (window as any)?.Telegram?.WebApp;
  const manager = webApp?.LocationManager;

  if (
    !webApp ||
    !manager ||
    typeof manager.init !== "function" ||
    typeof manager.getLocation !== "function"
  ) {
    return null;
  }

  try {
    if (typeof webApp.ready === "function") {
      try {
        webApp.ready();
      } catch {
        // Best effort.
      }
    }

    await new Promise<void>((resolve) => {
      if (manager.isInited === true) {
        resolve();
        return;
      }

      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve();
      }, initTimeoutMs);

      try {
        manager.init(() => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve();
        });
      } catch (error) {
        window.clearTimeout(timer);
        console.warn("Telegram LocationManager initialization failed:", error);
        resolve();
      }
    });

    const startedAt = Date.now();
    let lastState = "";
    let bestResult: LocationResult | null = null;

    while (Date.now() - startedAt < timeoutMs) {
      const available = manager.isLocationAvailable !== false;
      const accessRequested = manager.isAccessRequested === true;
      const accessGranted = manager.isAccessGranted === true;
      const stateKey = `${available}:${accessRequested}:${accessGranted}`;

      if (stateKey !== lastState) {
        lastState = stateKey;
        console.info("[PRIME GPS] Telegram location state", {
          available,
          accessRequested,
          accessGranted,
        });
      }

      if (!allowPermissionPrompt && !accessGranted) {
        return bestResult || { lat: 0, lon: 0, source: "Unavailable" };
      }
      // Telegram reports accessRequested after the first permission decision.
      // If it was denied, do not call getLocation repeatedly in later sessions.
      if (allowPermissionPrompt && accessRequested && !accessGranted) {
        return bestResult || { lat: 0, lon: 0, source: "Unavailable" };
      }
      if (!available) {
        return bestResult || { lat: 0, lon: 0, source: "Unavailable" };
      }

      const slice = Math.min(3000, timeoutMs - (Date.now() - startedAt));
      if (slice <= 0) break;

      const result = await requestTelegramLocationOnce(manager, webApp, slice);
      if (result) {
        if (!bestResult || (result.accuracy ?? Infinity) <= (bestResult.accuracy ?? Infinity)) {
          bestResult = result;
        }
        if ((bestResult.accuracy ?? Infinity) <= targetAccuracyMeters || (Date.now() - startedAt) >= refineForMs) {
          return bestResult;
        }
      }

      if (Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    }

    return bestResult || { lat: 0, lon: 0, source: "Unavailable" };
  } catch (error) {
    console.warn("Telegram precise GPS acquisition failed:", error);
    return { lat: 0, lon: 0, source: "Unavailable" };
  }
}

async function getBrowserPreciseLocation(
  timeoutMs: number,
  allowPermissionPrompt: boolean,
  refineForMs = 0,
): Promise<LocationResult | null> {
  if (!navigator.geolocation) return null;

  // On a silent retry, only use the browser channel when the browser explicitly
  // reports an already-granted permission. This prevents Step 4 from creating a
  // second Android/WebView prompt.
  if (!allowPermissionPrompt) {
    try {
      if (!navigator.permissions?.query) {
        return { lat: 0, lon: 0, source: "Unavailable" };
      }

      const permission = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });
      if (permission.state !== "granted") {
        return { lat: 0, lon: 0, source: "Unavailable" };
      }
    } catch {
      return { lat: 0, lon: 0, source: "Unavailable" };
    }
  }

  return new Promise((resolve) => {
    let settled = false;
    let watchId: number | null = null;
    let refinementTimer: number | null = null;
    let best: LocationResult | null = null;

    const finish = (result: LocationResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (watchId !== null) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {
          // ignore cleanup failures
        }
      }
      if (refinementTimer !== null) window.clearTimeout(refinementTimer);
      resolve(result);
    };

    const finishBest = () => finish(best || { lat: 0, lon: 0, source: "Unavailable" });

    const timer = window.setTimeout(() => {
      finishBest();
    }, timeoutMs);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const positionAgeMs = Date.now() - pos.timestamp;
          if (
            !Number.isFinite(pos.timestamp) ||
            pos.timestamp <= 0 ||
            positionAgeMs < -5000 ||
            positionAgeMs > 30000
          ) {
            console.info("[PRIME GPS] Ignoring a stale browser location reading.");
            return;
          }
          const candidate: LocationResult = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            altitude: pos.coords.altitude ?? null,
            capturedAt: new Date(pos.timestamp).toISOString(),
            source: "Precise GPS",
          };
          if ((candidate.accuracy ?? Infinity) <= (best?.accuracy ?? Infinity)) {
            best = candidate;
          }
          if (refineForMs <= 0) {
            finish(candidate);
          } else if (refinementTimer === null) {
            // Let Android's fused provider replace an initial stale/coarse fix
            // before centering the delivery map, even when it reports a small
            // accuracy radius on its first callback.
            refinementTimer = window.setTimeout(finishBest, Math.min(refineForMs, 5000));
          }
        },
        (err) => {
          console.warn("Browser GPS request failed:", err.message);
          finishBest();
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

export async function getClientLocation(
  timeoutMs = 60000,
  allowPermissionPrompt = true,
): Promise<LocationResult> {
  if (typeof window === "undefined") {
    return { lat: 0, lon: 0, source: "Unavailable" };
  }

  // In Telegram, use its native location permission/provider first. Telegram
  // persists an allowed decision, so subsequent sessions can read location
  // without showing the permission prompt again. Browser geolocation remains
  // a silent fallback there, avoiding a second independent permission prompt.
  const webApp = (window as any)?.Telegram?.WebApp;
  const hasTelegramManager = typeof webApp?.LocationManager?.getLocation === "function";
  if (hasTelegramManager) {
    const browserFirst = await getBrowserPreciseLocation(
      Math.min(timeoutMs, 30000),
      false,
      10000,
    );
    if (browserFirst?.source === "Precise GPS") return browserFirst;
    const telegramLocation = await getTelegramPreciseLocation(timeoutMs, allowPermissionPrompt);
    if (telegramLocation?.source === "Precise GPS") return telegramLocation;
    const browserFallback = await getBrowserPreciseLocation(Math.min(timeoutMs, 15000), false, 5000);
    if (browserFallback?.source === "Precise GPS") return browserFallback;
    return { lat: 0, lon: 0, source: "Unavailable" };
  }

  // Browser GPS is refined for up to 8 seconds; return the best accuracy fix
  // received, or finish sooner when the sensor reports <=15m accuracy.
  const browserLocation = await getBrowserPreciseLocation(Math.min(timeoutMs, 30000), allowPermissionPrompt, 8000);
  if (browserLocation?.source === "Precise GPS") return browserLocation;

  return { lat: 0, lon: 0, source: "Unavailable" };
}

/**
 * Use a very recent high-accuracy reading immediately, then request one fresh
 * provider fix without waiting through an extended refinement window.
 */
export async function getFreshClientLocation(
  timeoutMs = 60000,
  allowPermissionPrompt = true,
): Promise<LocationResult> {
  if (typeof window === "undefined") {
    return { lat: 0, lon: 0, source: "Unavailable" };
  }

  const recentFix = getLatestPhysicalGpsLocation();
  const recentFixAge = Date.now() - Date.parse(String(recentFix?.capturedAt || ""));
  if (
    recentFix &&
    Number(recentFix.accuracy) > 0 &&
    Number(recentFix.accuracy) <= 20 &&
    Number.isFinite(recentFixAge) &&
    recentFixAge >= 0 &&
    recentFixAge <= 15_000
  ) {
    return recentFix;
  }

  // Try Telegram's native provider first inside a Mini App, then fall back to
  // a fresh timestamped WebView fix. Some Android Telegram WebViews expose
  // navigator.geolocation even when it cannot return a position; treating
  // that as final used to skip the working Telegram LocationManager channel.
  const webApp = (window as any)?.Telegram?.WebApp;
  if (typeof webApp?.LocationManager?.getLocation === "function") {
    const telegramLocation = await getTelegramPreciseLocation(
      Math.min(timeoutMs, 1200),
      allowPermissionPrompt,
      500,
      0,
      20,
    ).catch(() => null);
    if (telegramLocation?.source === "Precise GPS") return telegramLocation;
  }

  if (navigator.geolocation) {
    const browserLocation = await getBrowserPreciseLocation(
      Math.min(timeoutMs, 4500),
      allowPermissionPrompt,
      0,
    ).catch(() => null);
    if (browserLocation?.source === "Precise GPS") return browserLocation;
  }

  return { lat: 0, lon: 0, source: "Unavailable" };
}

