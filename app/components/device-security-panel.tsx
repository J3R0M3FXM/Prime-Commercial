'use client';

import { useState } from 'react';
import { callServerless, getClientObservedPublicIp, recordCurrentDeviceSession } from '@/lib/telegram-serverless-client';
import type { DeviceSecurityData } from '@/lib/device-security-types';
import { getConsentedDeviceLocation } from './fingerprint-collector';
import './device-security.css';

function date(seconds?: number | null) { return seconds ? new Date(seconds * 1000).toLocaleString() : 'Unavailable'; }

export function DeviceSecurityHistory({ data, staff = false }: { data: DeviceSecurityData; staff?: boolean }) {
  return <div className="prime-device-security__history">
    <details><summary>Recognized Installations ({data.devices.length})</summary><div className="prime-device-security__list">
      {data.devices.map(device => <article key={device.id}>
        <h4>{[device.metadata.osName, device.metadata.deviceType].filter(Boolean).join(' · ') || 'Device'}</h4>
        <dl><dt>First Seen</dt><dd>{date(device.firstSeenAt)}</dd><dt>Last Seen</dt><dd>{date(device.lastSeenAt)}</dd>
          <dt>Browser</dt><dd>{[device.metadata.browserName, device.metadata.browserVersion].filter(Boolean).join(' ') || 'Unavailable'}</dd>
          <dt>Telegram Platform</dt><dd>{device.metadata.telegramPlatform || 'Unavailable'}</dd>
          <dt>Storage</dt><dd>{device.metadata.storageSource || 'Unavailable'}</dd>
          <dt>Fingerprint</dt><dd>{device.metadata.fingerprintStatus || 'Unavailable'}</dd>
          {staff && <><dt>Review Score</dt><dd>{device.riskScore}/100 · Review Only</dd></>}
        </dl>
        {staff && <details><summary>Technical Details</summary><p>Installation ID: {device.installationId}</p><p>Browser Fingerprint: {device.fingerprintId || 'Unavailable'}</p><p>OS Version: {device.metadata.osVersion || 'Unavailable'}</p><p>Time Zone: {device.metadata.timezone || 'Unavailable'}</p><p>Screen: {device.metadata.screenResolution || 'Unavailable'}</p></details>}
      </article>)}
      {!data.devices.length && <p>No device registrations have been saved yet.</p>}
    </div></details>
    <details><summary>Recent Sessions ({data.sessions.length})</summary><div className="prime-device-security__list">
      {data.sessions.slice(0, 20).map(session => <article key={session.id}><dl>
        <dt>Started</dt><dd>{date(session.firstSeenAt)}</dd><dt>Last Seen</dt><dd>{date(session.lastSeenAt)}</dd>
        <dt>Reported IP</dt><dd>{session.reportedIp || 'Not Checked'}{session.reportedIp && <small>{session.ipSource}</small>}</dd>
        <dt>Location Check</dt><dd>{session.locationCheckedAt ? date(session.locationCheckedAt) : 'Not Shared'}</dd>
        {session.locationCheckedAt && <><dt>Accuracy</dt><dd>{session.locationAccuracy == null ? 'Unavailable' : `${session.locationAccuracy} m`}</dd></>}
      </dl>{session.riskReasons.length > 0 && <p>{session.riskReasons.join(' · ')}</p>}</article>)}
      {!data.sessions.length && <p>No security sessions have been saved yet.</p>}
      {data.sessions.length > 20 && <p>Showing the 20 most recently active sessions.</p>}
    </div></details>
    <details><summary>Recent Security Events ({data.events.length})</summary><div className="prime-device-security__list">{data.events.map(event => <article key={event.id}><h4>{event.eventType}</h4><p>{date(event.createdAt)}</p></article>)}</div></details>
    {staff && <details><summary>Shared Installation Signals ({data.sharedAccounts?.length || 0})</summary><div className="prime-device-security__list">{data.sharedAccounts?.map(account => <article key={account.customerId}><h4>{account.name || 'Telegram Customer'}</h4><p>{account.memberId || account.customerId}{account.username ? ` · @${account.username}` : ''}</p></article>)}</div><p>Shared installations are review signals, not proof of the same person. Browser fingerprints alone do not link customers.</p></details>}
    <p>Session and event history is retained for up to {data.retentionDays} days. Precise location coordinates are not retained. Recognition signals can change or be shared.</p>
  </div>;
}

export default function DeviceSecurityPanel() {
  const [data, setData] = useState<DeviceSecurityData | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = async () => setData(await callServerless<DeviceSecurityData>('manageDeviceSecurity', { action: 'list' }));
  const run = async (action: 'refresh' | 'network' | 'location') => {
    if (busy) return;
    setBusy(action); setError(''); setMessage('');
    try {
      const session = await recordCurrentDeviceSession();
      if (action === 'network') {
        const reportedIp = await getClientObservedPublicIp();
        if (!reportedIp) throw new Error('Your public IP could not be checked. Try again later.');
        await callServerless('manageDeviceSecurity', { action: 'network', sessionId: session.sessionId, consent: true, reportedIp });
        setMessage('Public IP saved as browser-reported information.');
      }
      if (action === 'location') {
        const location = await getConsentedDeviceLocation();
        if (location.source !== 'Precise GPS') throw new Error('Location is unavailable or permission was not granted.');
        await callServerless('manageDeviceSecurity', { action: 'location', sessionId: session.sessionId, consent: true, latitude: location.lat, longitude: location.lon, accuracy: location.accuracy ?? null });
        setMessage('Location check completed. Precise coordinates were not retained.');
      }
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Device information is unavailable.'); }
    finally { setBusy(''); }
  };
  return <details className="prime-device-security" onToggle={event => { if (event.currentTarget.open && !data && !busy) void run('refresh'); }}>
    <summary>Device &amp; Session Security</summary>
    <div className="prime-device-security__body">
      <p>We use device and browser signals to recognize sessions and review unusual activity. Telegram verifies your account.</p>
      <button type="button" disabled={Boolean(busy)} onClick={() => void run('refresh')}>Refresh Device History</button>
      <div className="prime-device-security__actions"><button type="button" disabled={Boolean(busy)} onClick={() => void run('network')}>Check Public IP</button><button type="button" disabled={Boolean(busy)} onClick={() => void run('location')}>Verify My Location</button></div>
      <p>IP checks contact ipify and are browser reported. Location is requested only when you select Verify My Location; we keep the check time and accuracy, without precise coordinates.</p>
      {busy && <p role="status">{busy === 'location' ? 'Waiting for the location reading…' : 'Checking device information…'}</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status">{message}</p>}
      {data && <DeviceSecurityHistory data={data} />}
    </div>
  </details>;
}
