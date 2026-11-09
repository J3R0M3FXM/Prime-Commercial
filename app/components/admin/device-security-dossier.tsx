'use client';

import { useState } from 'react';
import { callServerless } from '@/lib/telegram-serverless-client';
import type { DeviceSecurityData } from '@/lib/device-security-types';
import { DeviceSecurityHistory } from '../device-security-panel';

export default function DeviceSecurityDossier({ customerId }: { customerId: string }) {
  const [data, setData] = useState<DeviceSecurityData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [capabilities, setCapabilities] = useState<{ contextKeys: string[]; requestKeys: string[]; metadataKeys: string[]; ipStatus: string } | null>(null);
  const load = async () => {
    setBusy(true); setError('');
    try { setData(await callServerless<DeviceSecurityData>('manageDeviceSecurity', { action: 'staffDetail', customerId }, 20_000)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Device security history is unavailable.'); }
    finally { setBusy(false); }
  };
  const inspect = async () => {
    setBusy(true); setError('');
    try { setCapabilities(await callServerless('manageDeviceSecurity', { action: 'capabilities' })); }
    catch (err) { setError(err instanceof Error ? err.message : 'Runtime information is unavailable.'); }
    finally { setBusy(false); }
  };
  return <details className="prime-device-security" onToggle={event => { if (event.currentTarget.open && !data && !busy) void load(); }}>
    <summary>Device Recognition &amp; Security Events</summary><div className="prime-device-security__body">
      <div className="prime-device-security__actions"><button type="button" disabled={busy} onClick={() => void load()}>Refresh History</button><button type="button" disabled={busy} onClick={() => void inspect()}>Inspect Runtime</button></div>
      {busy && <p role="status">Loading…</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
      {capabilities && <article><h4>Serverless Runtime Capabilities</h4><p>Context Fields: {capabilities.contextKeys.join(', ') || 'None'}</p><p>Request Fields: {capabilities.requestKeys.join(', ') || 'None'}</p><p>Metadata Fields: {capabilities.metadataKeys.join(', ') || 'None'}</p><p>{capabilities.ipStatus}</p></article>}
      {data && <DeviceSecurityHistory data={data} staff />}
    </div>
  </details>;
}
