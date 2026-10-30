"use client";

import { useEffect, useState } from "react";
import { 
  ArrowLeft, 
  RefreshCw, 
  Trash2, 
  RotateCcw, 
  Bell, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ShieldAlert,
  Loader2,
  Calendar
} from "lucide-react";
import { callServerless } from "@/lib/telegram-serverless-client";
import { 
  AdminBadge, 
  AdminPageHeader, 
  AdminStat, 
  AdminSurface,
  AdminEmptyState 
} from "./admin-ui";

interface NotificationRow {
  id: string;
  eventKey: string;
  chatId: string;
  messageText: string;
  orderNumber: string;
  buttonLabel: string;
  status: 'inline' | 'retry' | 'sending' | 'sent' | 'failed';
  attemptCount: number;
  nextAttemptAt: string;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export default function TelegramServerlessNotificationsPanel({ onBack }: { onBack: () => void }) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const fetchNotifications = async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await callServerless<{ notifications: NotificationRow[] }>("manageNotifications", { action: "list" });
      setNotifications(result?.notifications || []);
    } catch (error: any) {
      setMessage(error?.message || "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchNotifications(); }, []);

  const handleRetry = async (id: string) => {
    setProcessingId(id);
    try {
      await callServerless("manageNotifications", { action: "retry", id });
      await fetchNotifications();
      setMessage("Notification queued for retry.");
    } catch (error: any) {
      setMessage(error?.message || "Retry failed.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this notification record?")) return;
    setProcessingId(id);
    try {
      await callServerless("manageNotifications", { action: "delete", id });
      setNotifications(prev => prev.filter(n => n.id !== id));
      setMessage("Notification deleted.");
    } catch (error: any) {
      setMessage(error?.message || "Delete failed.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCleanup = async () => {
    if (!confirm("Are you sure you want to delete all sent and failed notifications older than 30 days?")) return;
    setLoading(true);
    try {
      const result = await callServerless<{ deletedCount: number }>("manageNotifications", { action: "cleanup", days: 30 });
      await fetchNotifications();
      setMessage(`Cleanup completed. Deleted ${result?.deletedCount || 0} old records.`);
    } catch (error: any) {
      setMessage(error?.message || "Cleanup failed.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent': return <AdminBadge tone="success">Sent</AdminBadge>;
      case 'failed': return <AdminBadge tone="danger">Failed</AdminBadge>;
      case 'retry': return <AdminBadge tone="warning">Retrying</AdminBadge>;
      case 'sending': return <AdminBadge tone="accent">Sending</AdminBadge>;
      default: return <AdminBadge tone="neutral">{status}</AdminBadge>;
    }
  };

  const stats = {
    total: notifications.length,
    failed: notifications.filter(n => n.status === 'failed').length,
    pending: notifications.filter(n => n.status === 'retry' || n.status === 'inline').length,
    sent: notifications.filter(n => n.status === 'sent').length,
  };

  return (
    <main className="min-h-screen bg-slate-50 px-3 pb-8 pt-20 text-slate-900">
      <div className="mx-auto max-w-[500px] space-y-4">
        <header className="flex items-center gap-3 border bg-white p-4">
          <button type="button" onClick={onBack} className="border p-2" aria-label="Back to Admin">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Serverless Outbox</p>
            <h1 className="text-xl font-bold">Notifications</h1>
          </div>
          <button 
            type="button" 
            onClick={fetchNotifications} 
            disabled={loading}
            className="p-2 border hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-2">
          <AdminStat label="Total Records" value={stats.total} icon={Bell} />
          <AdminStat label="Failed" value={stats.failed} tone={stats.failed > 0 ? "danger" : "neutral"} icon={ShieldAlert} />
          <AdminStat label="Pending/Retry" value={stats.pending} tone={stats.pending > 0 ? "warning" : "neutral"} icon={Clock} />
          <AdminStat label="Sent (Recent)" value={stats.sent} tone="success" icon={CheckCircle2} />
        </div>

        <AdminSurface className="p-0 overflow-hidden">
          <div className="border-b p-3 flex items-center justify-between bg-slate-50/50">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Outbox History</h2>
            <button 
              type="button" 
              onClick={handleCleanup}
              className="text-[10px] font-bold text-red-700 uppercase tracking-wider hover:underline"
            >
              Cleanup Old Records
            </button>
          </div>

          {loading && notifications.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-xs font-medium">Loading outbox...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8">
              <AdminEmptyState 
                title="Outbox is empty" 
                description="No transactional notifications have been queued yet."
                icon={Bell}
              />
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div key={n.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusBadge(n.status)}
                        <span className="text-[10px] font-mono text-slate-400">#{n.orderNumber}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-800 truncate">{n.eventKey}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {(n.status === 'failed' || n.status === 'retry') && (
                        <button 
                          type="button"
                          onClick={() => handleRetry(n.id)}
                          disabled={processingId === n.id}
                          className="p-1.5 border hover:bg-emerald-50 text-emerald-700 disabled:opacity-50"
                          title="Retry now"
                        >
                          <RotateCcw className={`h-3.5 w-3.5 ${processingId === n.id ? "animate-spin" : ""}`} />
                        </button>
                      )}
                      <button 
                        type="button"
                        onClick={() => handleDelete(n.id)}
                        disabled={processingId === n.id}
                        className="p-1.5 border hover:bg-red-50 text-red-700 disabled:opacity-50"
                        title="Delete record"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-50 border p-2 text-[10px] font-mono text-slate-600 max-h-20 overflow-y-auto whitespace-pre-wrap break-words">
                    {n.messageText || "(Content cleared after send)"}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-slate-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Created: {new Date(n.createdAt).toLocaleString()}
                    </div>
                    {n.sentAt && (
                      <div className="flex items-center gap-1 text-emerald-600 font-bold">
                        <CheckCircle2 className="h-3 w-3" />
                        Sent: {new Date(n.sentAt).toLocaleString()}
                      </div>
                    )}
                    {n.attemptCount > 0 && (
                      <div className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        Attempts: {n.attemptCount}
                      </div>
                    )}
                  </div>
                  
                  {n.lastError && (
                    <div className="flex items-start gap-1.5 p-1.5 bg-red-50 border border-red-100 text-red-700 text-[9px]">
                      <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                      <span className="font-mono break-all">{n.lastError}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </AdminSurface>

        {message && (
          <div className="p-3 bg-white border border-slate-200 text-xs font-bold text-center animate-in fade-in slide-in-from-bottom-2">
            {message}
          </div>
        )}

        <footer className="text-center space-y-1">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">PRIME™ Notification Scheduler</p>
          <p className="text-[9px] text-slate-400 px-4 leading-relaxed">
            Transactional outbox for order creation, payments, and lifecycle updates.
            Sent messages have their content cleared to protect customer privacy.
          </p>
        </footer>
      </div>
    </main>
  );
}
