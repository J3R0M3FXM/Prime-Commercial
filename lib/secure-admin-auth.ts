import { registerPlugin } from '@capacitor/core';

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
  const result = await SecureAdminAuth.read();
  return String(result?.value || '');
}

export async function storeNativeAdminSession(value: string) {
  if (!value) throw new Error('Cannot store an empty Admin session.');
  await SecureAdminAuth.store({ value });
}

export async function clearNativeAdminSession() {
  await SecureAdminAuth.clear();
}

export const nativeSmsBridge = {
  status: () => SecureAdminAuth.smsStatus(),
  pair: (code: string) => SecureAdminAuth.pairSms({ code }),
  pause: () => SecureAdminAuth.pauseSms(),
  sync: () => SecureAdminAuth.syncSms(),
  enable: () => SecureAdminAuth.enableSms(),
};

