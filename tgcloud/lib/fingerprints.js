const text = (value, max = 240) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

/** Accept bounded browser telemetry, never client-supplied identity or timestamps. */
export function sanitizeFingerprint(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const number = (value, fallback = 0, min = 0, max = 100000) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  };
  const sessionToken = text(source.sessionToken, 160);
  const deviceId = text(source.deviceId, 160);
  const platform = text(source.platform, 120);
  const screenResolution = text(source.screenResolution, 40);
  const graphics = text(source.graphics, 180);
  const timezone = text(source.timezone, 80);
  const hardwareConcurrency = number(source.hardwareConcurrency, 0, 0, 256);
  const stable = [
    deviceId, text(source.hardwareId, 160), text(source.browser || source.userAgent, 320), platform,
    screenResolution, text(source.availScreen, 40), number(source.pixelRatio, 1, 0.1, 10), timezone,
    text(source.language, 40), JSON.stringify(Array.isArray(source.languages) ? source.languages.slice(0, 12) : []),
    graphics, '', '', hardwareConcurrency, text(source.deviceMemory, 40), text(source.touchSupport, 80),
  ].map(value => String(value ?? '').trim().toLowerCase()).join('|');
  let deviceFingerprintId = '';
  // Build the stable identifier on the trusted endpoint; ignore submitted hashes.
  return (async () => {
    if (globalThis.crypto?.subtle && stable.replaceAll('|', '').length) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
      deviceFingerprintId = `DEVFP_${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32).toUpperCase()}`;
    }
    return {
      appId: text(source.appId, 80), deviceId,
      hardwareId: text(source.hardwareId, 160), deviceFingerprintId,
      sessionToken, browser: text(source.browser, 320), userAgent: text(source.browser || source.userAgent, 320),
      platform, screenResolution, availScreen: text(source.availScreen, 40),
      pixelRatio: number(source.pixelRatio, 1, 0.1, 10), timezone,
      language: text(source.language, 40),
      languages: Array.isArray(source.languages) ? source.languages.slice(0, 12).map(value => text(value, 40)).filter(Boolean) : [],
      graphics, hardwareConcurrency, deviceMemory: text(source.deviceMemory, 40),
      touchSupport: text(source.touchSupport, 80),
      installationId: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(source.installationId, 40)) ? source.installationId.toLowerCase() : '',
      fingerprintId: /^[0-9a-f]{32}$/i.test(text(source.fingerprintId, 40)) ? source.fingerprintId.toLowerCase() : '',
      fingerprintProvider: text(source.fingerprintProvider, 40), fingerprintVersion: text(source.fingerprintVersion, 24),
      fingerprintStatus: ['Available', 'Unavailable', 'Pending'].includes(source.fingerprintStatus) ? source.fingerprintStatus : 'Unavailable',
      storageSource: text(source.storageSource, 40), telegramPlatform: text(source.telegramPlatform, 40),
      telegramApiVersion: text(source.telegramApiVersion, 24), colorScheme: text(source.colorScheme, 20),
      osName: text(source.osName, 40), osVersion: text(source.osVersion, 40),
      browserName: text(source.browserName, 40), browserVersion: text(source.browserVersion, 40),
      deviceType: text(source.deviceType, 20), colorDepth: number(source.colorDepth, 0, 0, 64),
      utcOffset: number(source.utcOffset, 0, -840, 840), colorGamut: text(source.colorGamut, 20),
      cookiesEnabled: source.cookiesEnabled === true, localStorageAvailable: source.localStorageAvailable === true,
      sessionStorageAvailable: source.sessionStorageAvailable === true, indexedDbAvailable: source.indexedDbAvailable === true,
      reducedMotion: source.reducedMotion === true, connectionType: text(source.connectionType, 24), online: source.online === true,
    };
  })();
}

export async function saveCustomerFingerprint(customer, input = {}, now = new Date()) {
  const next = await sanitizeFingerprint(input);
  if (!next.sessionToken && !next.deviceId) return { fingerprints: parseList(customer?.fingerprints), latestFingerprint: null };
  const records = parseList(customer?.fingerprints).filter(record => record && typeof record === 'object');
  const index = records.findIndex(record =>
    (next.sessionToken && text(record.sessionToken, 160) === next.sessionToken) ||
    (!next.sessionToken && next.deviceId && text(record.deviceId, 160) === next.deviceId));
  const existing = index >= 0 ? records[index] : {};
  const timestamp = now.toISOString();
  const saved = {
    ...existing, ...next,
    telegramUserId: String(customer?.tgUserId || ''),
    firstSeen: existing.firstSeen || existing.capturedAt || timestamp,
    capturedAt: existing.capturedAt || timestamp,
    lastSeen: timestamp,
    enrollmentDate: existing.enrollmentDate || timestamp,
  };
  // A cheap authentication heartbeat must not erase an earlier advanced result.
  if (!next.fingerprintId && existing.fingerprintId) {
    for (const key of ['fingerprintId', 'fingerprintProvider', 'fingerprintVersion', 'fingerprintStatus']) saved[key] = existing[key];
  }
  if (index >= 0) records.splice(index, 1);
  records.unshift(saved);
  return { fingerprints: records.slice(0, 50), latestFingerprint: saved };
}

export function resolveTrustedFingerprint(customer, submitted = {}) {
  const fingerprints = parseList(customer?.fingerprints);
  const sessionToken = String(submitted.sessionToken || '').trim();
  const submittedDeviceId = String(submitted.deviceId || '').trim();
  const submittedHardwareId = String(submitted.hardwareId || '').trim();
  const submittedFingerprintId = String(submitted.deviceFingerprintId || '').trim();
  let matched = null;

  if (sessionToken) matched = fingerprints.find((fp) => String(fp?.sessionToken || '').trim() === sessionToken) || null;
  if (!matched && submittedDeviceId) matched = fingerprints.find((fp) => String(fp?.deviceId || '').trim() === submittedDeviceId) || null;
  if (!matched && submittedHardwareId) matched = fingerprints.find((fp) => String(fp?.hardwareId || '').trim() === submittedHardwareId) || null;
  if (!matched && submittedFingerprintId) matched = fingerprints.find((fp) => String(fp?.deviceFingerprintId || '').trim() === submittedFingerprintId) || null;

  const source = matched || submitted;
  return {
    sessionToken: String(source?.sessionToken || sessionToken).trim(),
    deviceId: String(source?.deviceId || '').trim(),
    hardwareId: String(source?.hardwareId || '').trim(),
    deviceFingerprintId: String(source?.deviceFingerprintId || '').trim(),
    matched: Boolean(matched),
  };
}
