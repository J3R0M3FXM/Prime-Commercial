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
  const button = 'min-h-10 w-full rounded-lg border px-2 font-mono text-xs';
  return <div className="prime-customer-order-actions grid grid-cols-2 gap-2" aria-label="Order Actions">
    <button type="button" className={button + ' order-control--modify border-teal-800 bg-teal-700 text-white'} disabled={busy || receiptBusy || !['pending','confirmed'].includes(status) || ['held','failed'].includes(control) || order.workflow?.editState === 'pending'} onClick={onEdit}>Edit Order</button>
    <button type="button" className={button + ' order-control--danger border-rose-800 bg-rose-700 text-white'} disabled={busy || receiptBusy || !['pending','confirmed','approved','processing'].includes(status) || order.workflow?.cancellationRequested} onClick={onCancel}>Cancel Order</button>
    <button type="button" className={button + ' order-control--primary border-blue-800 bg-blue-700 text-white'} disabled={!dispatched || !tracking || busy || receiptBusy} onClick={() => {
      if (!dispatched || !tracking) return;
      const telegram = (window as any).Telegram?.WebApp;
      if (telegram?.openLink) telegram.openLink(tracking); else window.open(tracking, '_blank', 'noopener,noreferrer');
    }}>Track Courier</button>
    <button type="button" className={button + ' order-control--success border-emerald-800 bg-emerald-700 text-white'} disabled={!dispatched || preview || busy || receiptBusy} onClick={onReceived}>{receiptBusy ? 'Confirming…' : 'Received'}</button>
  </div>;
}
