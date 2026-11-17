'use client';

// Recognition signals are telemetry. Telegram's verified initData remains the authority.
type DeviceStorage = {
  getItem(key: string, callback: (error: unknown, value?: string | null) => void): void;
  setItem(key: string, value: string, callback: (error: unknown, saved?: boolean) => void): void;
};
type Identity = { installationId: string; deviceId: string; storageSource: string };
const INSTALLATION_KEY = 'prime_installation_id_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let identityPromise: Promise<Identity> | undefined;
const memorySessions = new Map<string, string>();

function read(storage: 'localStorage' | 'sessionStorage', key: string): string {
  try { return window[storage].getItem(key) || ''; } catch { return ''; }
}
function write(storage: 'localStorage' | 'sessionStorage', key: string, value: string): boolean {
  try { window[storage].setItem(key, value); return true; } catch { return false; }
}
function uuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function nativeRead(storage: DeviceStorage): Promise<{ ok: boolean; value: string }> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ ok: false, value: '' }), 700);
    try { storage.getItem(INSTALLATION_KEY, (error, value) => { clearTimeout(timer); resolve({ ok: !error, value: value || '' }); }); }
    catch { clearTimeout(timer); resolve({ ok: false, value: '' }); }
  });
}
function nativeWrite(storage: DeviceStorage, value: string): Promise<boolean> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), 700);
    try { storage.setItem(INSTALLATION_KEY, value, (error, saved) => { clearTimeout(timer); resolve(!error && saved === true); }); }
    catch { clearTimeout(timer); resolve(false); }
  });
}

export function getInstallationIdentity(): Promise<Identity> {
  if (identityPromise) return identityPromise;
  identityPromise = (async () => {
    const webApp = (window as any).Telegram?.WebApp;
    const native = webApp?.DeviceStorage as DeviceStorage | undefined;
    const supported = native && typeof native.getItem === 'function' && typeof native.setItem === 'function' && (!webApp.isVersionAtLeast || webApp.isVersionAtLeast('9.0'));
    const remote = supported ? await nativeRead(native!) : { ok: false, value: '' };
    const local = read('localStorage', INSTALLATION_KEY) || read('sessionStorage', INSTALLATION_KEY);
    const installationId = UUID.test(remote.value) ? remote.value : UUID.test(local) ? local : uuid();
    let storageSource = 'Memory';
    if (write('localStorage', INSTALLATION_KEY, installationId)) storageSource = 'Local Storage';
    else if (write('sessionStorage', INSTALLATION_KEY, installationId)) storageSource = 'Session Storage';
    if (remote.ok && (UUID.test(remote.value) || await nativeWrite(native!, installationId))) storageSource = 'Telegram DeviceStorage';
    // A failed native read must not overwrite an installation we could not read.
    const previous = read('localStorage', 'prime_device_id') || read('sessionStorage', 'prime_device_id');
    const deviceId = /^[A-Za-z0-9_-]{4,160}$/.test(previous) ? previous : `DEV_${installationId}`;
    write('localStorage', 'prime_device_id', deviceId); write('sessionStorage', 'prime_device_id', deviceId);
    return { installationId, deviceId, storageSource };
  })().catch(error => { identityPromise = undefined; throw error; });
  return identityPromise;
}

export function getRecognitionSessionToken(deviceId = '', customerId = ''): string {
  if (typeof window === 'undefined') return '';
  // Client-side account scoping only. The server derives identity independently.
  const account = customerId || String((window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id || read('localStorage', 'prime_customer_id') || 'pending');
  const key = `prime_recognition_session_v1:${account}:${deviceId}`;
  const previous = read('sessionStorage', key) || memorySessions.get(key) || '';
  if (/^SESS_[0-9a-f-]{36}$/i.test(previous)) return previous;
  const token = `SESS_${uuid()}`;
  write('sessionStorage', key, token); memorySessions.set(key, token);
  return token;
}

export function collectDeviceEnvironment() {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string; downlink?: number; rtt?: number } };
  const webApp = (window as any).Telegram?.WebApp;
  const ua = nav.userAgent || '';
  const os = /Android\s+([\d.]+)/i.exec(ua) || /(?:iPhone OS|CPU OS)\s+([\d_]+)/i.exec(ua) || /Windows NT\s+([\d.]+)/i.exec(ua) || /Mac OS X\s+([\d_]+)/i.exec(ua);
  const browser = /(?:Edg|Chrome|CriOS|Firefox|FxiOS|Version)\/([\d.]+)/.exec(ua);
  const osName = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '';
  const browserName = /Edg\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chromium' : /Safari/.test(ua) ? 'Safari' : '';
  let graphics = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (gl) {
      try { const extension = gl.getExtension('WEBGL_debug_renderer_info'); if (extension) graphics = String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) || ''); }
      finally { gl.getExtension('WEBGL_lose_context')?.loseContext(); }
    }
  } catch { /* Restricted graphics signals remain unavailable. */ }
  const supports = (name: string) => { try { return Boolean(window.matchMedia?.(name).matches); } catch { return false; } };
  const storageAvailable = (name: 'localStorage' | 'sessionStorage') => { try { const key = 'prime_storage_probe'; window[name].setItem(key, '1'); window[name].removeItem(key); return true; } catch { return false; } };
  return {
    telegramPlatform: String(webApp?.platform || ''), telegramApiVersion: String(webApp?.version || ''),
    colorScheme: String(webApp?.colorScheme || ''), browser: ua, platform: webApp?.platform ? `Telegram (${webApp.platform})` : nav.platform || '',
    osName, osVersion: os?.[1]?.replaceAll('_', '.') || '', browserName, browserVersion: browser?.[1] || '',
    deviceType: /iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobile|iPhone|Android/i.test(ua) ? 'Mobile' : 'Desktop',
    screenResolution: `${screen.width}x${screen.height}`, availScreen: `${screen.availWidth}x${screen.availHeight}`,
    pixelRatio: window.devicePixelRatio || 1, colorDepth: screen.colorDepth || 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '', utcOffset: new Date().getTimezoneOffset(),
    language: nav.language || '', languages: Array.from(nav.languages || []), graphics,
    hardwareConcurrency: nav.hardwareConcurrency || 0, deviceMemory: nav.deviceMemory ? `${nav.deviceMemory} GB` : '',
    touchSupport: `${nav.maxTouchPoints || 0} Touch Points`, cookiesEnabled: nav.cookieEnabled,
    localStorageAvailable: storageAvailable('localStorage'), sessionStorageAvailable: storageAvailable('sessionStorage'),
    indexedDbAvailable: Boolean(window.indexedDB), reducedMotion: supports('(prefers-reduced-motion: reduce)'),
    colorGamut: supports('(color-gamut: rec2020)') ? 'rec2020' : supports('(color-gamut: p3)') ? 'p3' : supports('(color-gamut: srgb)') ? 'srgb' : '',
    connectionType: String(nav.connection?.effectiveType || ''), online: nav.onLine,
  };
}

let advancedPromise: Promise<Record<string, unknown>> | undefined;
async function advancedFingerprint(): Promise<Record<string, unknown>> {
  if (!advancedPromise) advancedPromise = import('@fingerprintjs/fingerprintjs').then(async module => {
    const agent = await module.load({ monitoring: false });
    const result = await agent.get();
    return { fingerprintId: result.visitorId, fingerprintProvider: 'FingerprintJS', fingerprintVersion: result.version, fingerprintStatus: 'Available' };
  }).catch(() => {
    advancedPromise = undefined;
    return { fingerprintId: '', fingerprintProvider: 'FingerprintJS', fingerprintStatus: 'Unavailable' };
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([advancedPromise, new Promise<Record<string, unknown>>(resolve => { timer = setTimeout(() => resolve({ fingerprintStatus: 'Unavailable' }), 10_000); })]); }
  finally { if (timer) clearTimeout(timer); }
}

export async function collectRecognitionSignals(advanced = true) {
  const identity = await getInstallationIdentity();
  const environment = collectDeviceEnvironment();
  const fingerprint = advanced ? await advancedFingerprint() : { fingerprintStatus: 'Pending' };
  return { ...identity, ...environment, ...fingerprint };
}
