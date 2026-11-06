import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/roboto-condensed/600.css';
import '@fontsource/roboto-condensed/400.css';
import './globals.css';
import CartProvider from './components/cart-context';
import SystemFooter from './components/system-footer';
import Shopfront from './page';
import AdminPage from './admin/page';
import MayaResultPage from './payment/maya/result/page';
import { getTelegramServerlessSession } from '../lib/telegram-serverless-client';
import { startPhysicalGpsTelemetry } from './components/fingerprint-collector';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

function MiniApp() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    startPhysicalGpsTelemetry();
    let stopped = false;
    const heartbeat = async () => {
      if (stopped || !window.Telegram?.WebApp?.initData) return;
      try {
        await getTelegramServerlessSession({ heartbeat: true });
      } catch (error) {
        console.warn('[PRIME session] Serverless heartbeat skipped:', error);
      }
    };
    const timer = window.setInterval(() => void heartbeat(), 60_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listener: { remove: () => Promise<void> } | null = null;
    void App.addListener('appUrlOpen', ({ url }) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'prime:' || parsed.hostname !== 'auth' || parsed.pathname !== '/callback') return;
        const handoff = parsed.searchParams.get('code');
        if (!handoff || handoff.length > 4096) return;
        sessionStorage.setItem('prime_native_auth_handoff', handoff);
        window.dispatchEvent(new CustomEvent('prime-native-auth', { detail: { handoff } }));
      } catch (error) {
        console.warn('[PRIME native auth] callback ignored:', error);
      }
    }).then(value => { listener = value; });
    return () => { if (listener) void listener.remove(); };
  }, []);

  useEffect(() => {
    const syncPath = () => setPath(window.location.pathname);
    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);

  let screen = <Shopfront />;
  if (path.startsWith('/admin')) screen = <AdminPage />;
  else if (path.startsWith('/payment/maya/result')) screen = <MayaResultPage />;

  return (
    <div id="mobile-portrait-viewport" className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-gray-50 shadow-2xl sm:border-x sm:border-slate-800/80">
      <CartProvider>
        {screen}
      </CartProvider>
      <SystemFooter />
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Mini App root element is missing.');
createRoot(root).render(<MiniApp />);
