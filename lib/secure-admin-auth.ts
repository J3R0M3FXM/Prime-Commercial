import { registerPlugin } from '@capacitor/core';

type SecureAdminAuthPlugin = {
  store(options: { value: string }): Promise<void>;
  read(): Promise<{ value?: string }>;
  clear(): Promise<void>;
  unlock(): Promise<void>;
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

