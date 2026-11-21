'use client';
import { WifiOff } from 'lucide-react';

export default function SessionConnectionError({ onRetry }: { onRetry: () => void }) {
  return <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col items-center justify-center bg-gray-50 p-6 text-center text-slate-900">
    <WifiOff className="mb-6 h-14 w-14 text-slate-500" aria-hidden="true" />
    <h1 className="mb-2 font-heading text-2xl font-normal uppercase">Connection interrupted</h1>
    <p role="alert" className="mb-6 max-w-sm text-sm text-slate-600">PRIME could not reach the server to verify your Telegram session. Check your connection and try again.</p>
    <button type="button" onClick={onRetry} className="min-h-12 w-full max-w-sm rounded-lg bg-slate-900 px-4 py-3 font-heading text-sm font-normal uppercase text-white">Try again</button>
  </main>;
}
