import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ph.primenetwork.prime',
  appName: 'PRIME Services',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    App: {
      urlScheme: 'prime',
    },
  },
};

export default config;
