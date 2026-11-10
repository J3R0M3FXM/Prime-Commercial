"use client";
import { courierTrackingLink } from '@/lib/order-notification-navigation';

export default function CustomerOrderActions({ order, busy, receiptBusy, preview, onEdit, onCancel, onReceived }: {
  order: any; busy: boolean; receiptBusy: boolean; preview: boolean;
  onEdit: () => void; onCancel: () => void; onReceived: () => void;
}) {
  const status = String(order.status || '').toLowerCase();
  const control = String(order.controlState || '').toLowerCase();
  const dispatched = status === 'dispatched';
  const tracking = courierTrackingLink(order.trackingUrl);
  const button = 'min-h-10 w-full rounded-lg border px-2 font-roboto-condensed-semibold text-xs uppercase disabled:opacity-45';
  return <div className="grid grid-cols-2 gap-2" aria-label="Order Actions">
    <button type="button" className={button + ' border-slate-300 bg-white text-slate-800'} disabled={busy || receiptBusy || !['pending','confirmed'].includes(status) || ['held','failed'].includes(control) || order.workflow?.editState === 'pending'} onClick={onEdit}>EDIT ORDER</button>
    <button type="button" className={button + ' border-rose-300 bg-rose-50 text-rose-800'} disabled={busy || receiptBusy || !['pending','confirmed','approved','processing'].includes(status) || order.workflow?.cancellationRequested} onClick={onCancel}>CANCEL ORDER</button>
    <button type="button" className={button + ' border-blue-300 bg-blue-50 text-blue-800'} disabled={!dispatched || !tracking || busy || receiptBusy} onClick={() => {
      if (!dispatched || !tracking) return;
      const telegram = (window as any).Telegram?.WebApp;
      if (telegram?.openLink) telegram.openLink(tracking); else window.open(tracking, '_blank', 'noopener,noreferrer');
    }}>TRACK COURIER</button>
    <button type="button" className={button + ' border-emerald-300 bg-emerald-50 text-emerald-900'} disabled={!dispatched || preview || busy || receiptBusy} onClick={onReceived}>{receiptBusy ? 'CONFIRMING…' : 'RECEIVED'}</button>
  </div>;
}
