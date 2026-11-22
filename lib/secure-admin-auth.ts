import { registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

type SecureAdminAuthPlugin = {
  store(options: { value: string }): Promise<void>;
  read(): Promise<{ value?: string }>;
  clear(): Promise<void>;
  unlock(): Promise<void>;
  smsStatus(): Promise<{ paired: boolean; enabled: boolean; status: string; counts: string }>;
  pairSms(options: { code: string }): Promise<void>;
  pauseSms(): Promise<void>;
  syncSms(): Promise<void>;
  enableSms(): Promise<void>;
};

const SecureAdminAuth = registerPlugin<SecureAdminAuthPlugin>('SecureAdminAuth');

export async function unlockAdminDevice() {
  if (!SecureAdminAuth) throw new Error('Secure Admin authentication is unavailable.');
  await SecureAdminAuth.unlock();
}

export async function readNativeAdminSession() {
  try {
    const result = await SecureAdminAuth.read();
    const value = String(result?.value || '');
    if (value) return value;
  } catch {}
  return String(localStorage.getItem('prime_native_admin_session') || '');
}

export async function storeNativeAdminSession(value: string) {
  if (!value) throw new Error('Cannot store an empty Admin session.');
  localStorage.setItem('prime_native_admin_session', value);
  try { await SecureAdminAuth.store({ value }); } catch {}
}

export async function clearNativeAdminSession() {
  localStorage.removeItem('prime_native_admin_session');
  await SecureAdminAuth.clear().catch(() => undefined);
}

async function completeNativeAdminCallback(authBaseUrl: string, url: string) {
  const callback = new URL(url);
  if (callback.protocol !== 'prime:' || callback.hostname !== 'auth' || callback.pathname !== '/callback') return false;
  const code = callback.searchParams.get('code') || '';
  if (!/^[a-f0-9]{32}$/.test(code)) throw new Error('The Admin login callback was invalid.');
  const response = await fetch(`${authBaseUrl.replace(/\/$/, '')}/exchange?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.authenticated !== true || typeof body.session !== 'string') throw new Error('Admin authentication failed.');
  await storeNativeAdminSession(body.session);
  return true;
}

export async function resumeNativeAdminLogin(authBaseUrl: string) {
  if (!Capacitor.isNativePlatform()) return false;
  const launch = await App.getLaunchUrl();
  if (!launch?.url) return false;
  const completed = await completeNativeAdminCallback(authBaseUrl, launch.url);
  if (completed) await Browser.close().catch(() => undefined);
  return completed;
}

async function completeNativeAdminCallback(authBaseUrl: string, url: string) {
  const callback = new URL(url);
  if (callback.protocol !== 'prime:' || callback.hostname !== 'auth' || callback.pathname !== '/callback') return false;
  const code = callback.searchParams.get('code') || '';
  if (!/^[a-f0-9]{32}$/.test(code)) throw new Error('The Admin login callback was invalid.');
  const response = await fetch(`${authBaseUrl.replace(/\/$/, '')}/exchange?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.authenticated !== true || typeof body.session !== 'string') throw new Error('Admin authentication failed.');
  await storeNativeAdminSession(body.session);
  return true;
}

export async function resumeNativeAdminLogin(authBaseUrl: string) {
  if (!Capacitor.isNativePlatform()) return false;
  const launch = await App.getLaunchUrl();
  if (!launch?.url) return false;
  const completed = await completeNativeAdminCallback(authBaseUrl, launch.url);
  if (completed) await Browser.close().catch(() => undefined);
  return completed;
}

async function completeNativeAdminCallback(authBaseUrl: string, url: string) {
  const callback = new URL(url);
  if (callback.protocol !== 'prime:' || callback.hostname !== 'auth' || callback.pathname !== '/callback') return false;
  const code = callback.searchParams.get('code') || '';
  if (!/^[a-f0-9]{32}$/.test(code)) throw new Error('The Admin login callback was invalid.');
  const response = await fetch(`${authBaseUrl.replace(/\/$/, '')}/exchange?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.authenticated !== true || typeof body.session !== 'string') throw new Error('Admin authentication failed.');
  await storeNativeAdminSession(body.session);
  return true;
}

export async function resumeNativeAdminLogin(authBaseUrl: string) {
  if (!Capacitor.isNativePlatform()) return false;
  const launch = await App.getLaunchUrl();
  if (!launch?.url) return false;
  const completed = await completeNativeAdminCallback(authBaseUrl, launch.url);
  if (completed) await Browser.close().catch(() => undefined);
  return completed;
}

export async function startNativeAdminLogin(authBaseUrl: string) {
  if (!Capacitor.isNativePlatform()) throw new Error('Native Admin login is only available in the APK.');
  const base = authBaseUrl.replace(/\/$/, '');
  return new Promise<void>(async (resolve, reject) => {
    let settled = false;
    const finish = async (error?: Error) => {
      if (settled) return;
      settled = true;
      await listener.remove();
      if (error) reject(error); else resolve();
    };
    const listener = await App.addListener('appUrlOpen', async ({ url }) => {
      try {
        if (!(await completeNativeAdminCallback(base, url))) return;
        await Browser.close().catch(() => undefined);
        await finish();
      } catch (error) {
        await Browser.close().catch(() => undefined);
        await finish(error instanceof Error ? error : new Error('Admin authentication failed.'));
      }
    });
    try { await Browser.open({ url: `${base}/login?native=1` }); }
    catch (error) { await finish(error instanceof Error ? error : new Error('Could not open Admin login.')); }
  });
}

export const nativeSmsBridge = {
  status: () => SecureAdminAuth.smsStatus(),
  pair: (code: string) => SecureAdminAuth.pairSms({ code }),
  pause: () => SecureAdminAuth.pauseSms(),
  sync: () => SecureAdminAuth.syncSms(),
  enable: () => SecureAdminAuth.enableSms(),
};

