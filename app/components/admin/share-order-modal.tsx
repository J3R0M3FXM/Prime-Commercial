"use client";
import React, { useState } from "react";
import { 
  X, 
  Share2, 
  Copy, 
  Check, 
  Send, 
  Link as LinkIcon, 
  ExternalLink,
  MessageSquare,
  FileText,
  User,
  ShoppingBag,
  Truck,
  CreditCard
} from "lucide-react";
import { formatPHP } from "@/lib/currency";

interface ShareOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  deliveryAddressText?: string;
  gpsStreetAddressText?: string;
}

export default function ShareOrderModal({
  isOpen,
  onClose,
  order,
  deliveryAddressText = "",
  gpsStreetAddressText = ""
}: ShareOrderModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const trackingLink = `${origin}/?order=${encodeURIComponent(order.orderNumber || order.id)}`;

  // Construct formatted Telegram / WhatsApp summary text
  const itemsText = (order.items || [])
    .map((it: any) => `• ${it.name} x${it.quantity} — ${Number(it.price) === 0 ? "FREE" : formatPHP(Number(it.price) * (Number(it.quantity) || 1))}`)
    .join("\n");

  const addressText = deliveryAddressText || order.deliveryAddress?.formatted || order.deliveryAddress?.address || "None specified";

  const telegramSummaryText = `📦 PRIME ORDER DETAILS — #${order.orderNumber}
━━━━━━━━━━━━━━━━━━━━
👤 Customer: ${order.customerName || "Customer"} ${order.customerUsername ? `(@${order.customerUsername})` : ""}
🆔 Telegram UID: ${order.customerId || order.tgUserId || "N/A"}
⭐ Prime MID: ${order.primeMemberId || "N/A"}

📍 Delivery Address: ${addressText}
${order.receiverPhone ? `📞 Contact: ${order.receiverPhone}` : ""}
${order.receiverName ? `🏷️ Receiver: ${order.receiverName}` : ""}
🚚 Courier: ${order.courier?.name || "Standard Courier"}
🔗 Tracking URL: ${order.trackingUrl || "Not yet assigned"}

🛒 Purchased Items:
${itemsText || "• No items"}

💳 Payment Method: ${order.paymentMethodName || "COD / Direct"}
📊 Payment Status: ${order.paymentStatus || "Pending Submission"}
📦 Order Status: ${order.status || "Pending"}
━━━━━━━━━━━━━━━━━━━━
💰 Grand Total: ${formatPHP(order.totalAmount || 0)}
🌐 Customer Live Tracker: ${trackingLink}`;

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey(prev => prev === key ? null : prev);
      }, 2500);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  const handleShareToTelegram = () => {
    const encodedText = encodeURIComponent(telegramSummaryText);
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(trackingLink)}&text=${encodedText}`;
    window.open(tgUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-heading font-normal text-base text-slate-900 leading-tight">
                Share Order Summary
              </h3>
              <p className="text-[11px] font-mono text-slate-500">
                Order #{order.orderNumber} &bull; Telegram &amp; Deep Link Generator
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Quick Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleShareToTelegram}
              className="px-4 py-2.5 bg-[#229ED9] hover:bg-[#1e8ec3] text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer active:scale-98"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send via Telegram</span>
            </button>

            <button
              type="button"
              onClick={() => copyToClipboard(telegramSummaryText, "summary")}
              className="px-4 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer active:scale-98"
            >
              {copiedKey === "summary" ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied Summary!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Text Summary</span>
                </>
              )}
            </button>
          </div>

          {/* Deep Link Tracker Field */}
          <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-slate-500" />
                Customer Direct Tracking Link
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(trackingLink, "link")}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer"
              >
                {copiedKey === "link" ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-700">Copied Link</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-slate-400" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs font-mono text-slate-600 truncate select-all bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
              {trackingLink}
            </p>
          </div>

          {/* Formatted Text Preview */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono font-bold uppercase text-slate-500 tracking-wider flex items-center justify-between">
              <span>Formatted Message Preview</span>
              <span className="text-[10px] font-normal text-slate-400">Ready to paste into chat or dispatch to rider</span>
            </label>
            <div className="relative">
              <pre className="w-full bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto border border-slate-800 selection:bg-blue-600 selection:text-white">
                {telegramSummaryText}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-400">
            Total: <strong className="text-slate-900 font-bold">{formatPHP(order.totalAmount || 0)}</strong> &bull; {order.status}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-mono font-bold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
