'use client';

import { getClientFingerprint, getLatestPhysicalGpsLocation, startPhysicalGpsTelemetry, stopPhysicalGpsTelemetry, waitForPhysicalGps } from '@/app/components/fingerprint-collector';

export const STARTUP_DURATION_MS = 12_000;
export const CAPTURE_DEADLINE_MS = 11_000;
export const startupProgress = (elapsed: number) => Math.min(100, Math.max(0, Math.floor(elapsed / STARTUP_DURATION_MS * 100)));
let startedAt = 0;
let capture: Promise<Record<string, unknown>> | undefined;
let snapshot: Record<string, unknown> = {};

export function getStartupSnapshot() { return snapshot; }
export function startupElapsed() { return startedAt ? Date.now() - startedAt : 0; }

/** One launch-wide capture: no route change or heartbeat restarts the clock. */
export function startStartupCapture(): Promise<Record<string, unknown>> {
  if (capture) return capture;
  startedAt = Date.now();
  snapshot = { startupCapture: true, startupCapturedAt: new Date(startedAt).toISOString(), fingerprintStatus: 'Unavailable', publicIpStatus: 'Unavailable', gpsStatus: 'Unavailable' };
  capture = new Promise(resolve => {
    let finished = false;
    const controller = new AbortController();
    const update = (values: Record<string, unknown>) => { if (!finished) snapshot = { ...snapshot, ...values }; };
    const finish = () => {
      if (finished) return;
      const location = getLatestPhysicalGpsLocation();
      if (location) update({ deviceLocationObservation: location, gpsStatus: 'Available' });
      finished = true;
      clearTimeout(timer);
      controller.abort();
      stopPhysicalGpsTelemetry();
      snapshot = { ...snapshot, startupCaptureCompletedAt: new Date().toISOString() };
      resolve(snapshot);
    };
    const timer = setTimeout(finish, CAPTURE_DEADLINE_MS);
    // Keep basic information even if the advanced collector times out.
    const basic = getClientFingerprint({ advanced: false }).then(({ fingerprintStatus: _status, ...signals }) => update(signals)).catch(() => undefined);
    const advanced = getClientFingerprint().then(update).catch(() => undefined);
    const ip = fetch('https://api.ipify.org?format=json', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const data = await response.json();
        const value = String(data?.ip || '').trim();
        if (value && value.length <= 64 && /^[0-9a-fA-F:.]+$/.test(value)) update({ clientObservedIp: value, publicIpStatus: 'Available' });
      }).catch(() => undefined);
    startPhysicalGpsTelemetry(CAPTURE_DEADLINE_MS);
    const gps = waitForPhysicalGps(CAPTURE_DEADLINE_MS).then(location => {
      if (location) update({ deviceLocationObservation: location, gpsStatus: 'Available' });
    }).catch(() => undefined);
    void Promise.allSettled([basic, advanced, ip, gps]).then(finish);
  });
  return capture;
}
