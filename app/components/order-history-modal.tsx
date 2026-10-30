"use client";

import { callServerless, resolveTelegramMedia, uploadPaymentReceiptDataUrl } from "@/lib/telegram-serverless-client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  X, 
  ArrowLeft, 
  Clock, 
  CheckCircle2, 
  Truck, 
  Package, 
  Search, 
  ExternalLink, 
  Copy, 
  Check, 
  CreditCard, 
  Upload, 
  RefreshCw, 
  Loader2, 
  Receipt, 
  AlertCircle, 
  ChevronRight, 
  MapPin, 
  Phone, 
  User, 
  Download,
  Info,
  Sliders
} from "lucide-react";
import { formatPHP } from "@/lib/currency";
import TelegramMediaImage from "./telegram-media-image";

interface OrderHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelectedOrderId?: string | null;
}

function normalizeOrder(raw: any) {
  if (!raw || typeof raw !== "object") return raw;

  return {
    ...raw,
    id: raw.id || raw.order_id || raw.orderId,
    orderNumber: raw.orderNumber || raw.order_number || raw.id,
    createdAt: raw.createdAt || raw.created_at || raw.updatedAt || raw.updated_at || null,
    updatedAt: raw.updatedAt || raw.updated_at || null,
    status: raw.status || raw.order_status || "Pending",
    customerName: raw.customerName || raw.customer_name || "",
    receiverName: raw.receiverName || raw.receiver_name || raw.customerName || raw.customer_name || "",
    receiverPhone: raw.receiverPhone || raw.receiver_phone || raw.customerPhone || raw.customer_phone || "",
    deliveryAddress: raw.deliveryAddress || raw.delivery_address || {},
    courierName: raw.courierName || raw.courier_name || "",
    trackingNumber: raw.trackingNumber || raw.tracking_number || "",
    trackingUrl: raw.trackingUrl || raw.tracking_url || "",
    deliveryFee: raw.deliveryFee ?? raw.delivery_fee ?? 0,
    deliveryFeePaymentMethod: raw.deliveryFeePaymentMethod || raw.delivery_fee_payment_method || "",
    payableNow: raw.payableNow ?? raw.payable_now,
    payableOnDelivery: raw.payableOnDelivery ?? raw.payable_on_delivery,
    totalAmount: raw.totalAmount ?? raw.total_amount ?? 0,
    subTotal: raw.subTotal ?? raw.subtotal ?? 0,
    appliedCharges: (raw.appliedCharges || raw.chargesBreakdown || raw.charges_breakdown || raw.charges || []).map((charge: any) => ({
      ...charge,
      amount: Number(charge?.computedAmount ?? charge?.amount ?? 0),
      computedAmount: Number(charge?.computedAmount ?? charge?.amount ?? 0),
    })),
    charges: (raw.charges || raw.appliedCharges || raw.chargesBreakdown || raw.charges_breakdown || []).map((charge: any) => ({
      ...charge,
      amount: Number(charge?.computedAmount ?? charge?.amount ?? 0),
      computedAmount: Number(charge?.computedAmount ?? charge?.amount ?? 0),
    })),
    paymentStatus: raw.paymentStatus || raw.payment_status || "Unpaid",
    staffEditVersion: Number(raw.staffEditVersion ?? raw.staff_edit_version ?? 0) || 0,
    paymentMethodId: raw.paymentMethodId || raw.payment_method_id || "",
    paymentMethodName: raw.paymentMethodName || raw.payment_method_name || "",
    storeCreditsUsed: Number(raw.storeCreditsUsed ?? raw.store_credits_used ?? 0) || 0,
    paymentProofImage: raw.paymentProofImage || raw.payment_proof_image || "",
    receiptAssetId: raw.receiptAssetId || raw.receipt_asset_id || "",
    paymentProofSubmittedAt: raw.paymentProofSubmittedAt || raw.payment_proof_submitted_at || null,
    paymentDeadlineAt: raw.paymentDeadlineAt || raw.payment_deadline_at || null,
    dispatchedAt: raw.dispatchedAt || raw.dispatched_at || null,
    deliveryFallbackAt: raw.deliveryFallbackAt || raw.delivery_fallback_at || null,
    deliveredAt: raw.deliveredAt || raw.delivered_at || null,
    expiredAt: raw.expiredAt || raw.expired_at || null,
    items: Array.isArray(raw.items) ? raw.items : [],
    notes: raw.notes || "",
  };
}

function timestampMs(value: any, depth = 0): number | null {
  if (depth > 3 || value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  if (typeof value === "object") {
    if (typeof value.toDate === "function") return timestampMs(value.toDate(), depth + 1);
    for (const key of ["epochMilliseconds", "epochMillis", "milliseconds", "timestamp", "epochSeconds", "seconds", "_seconds", "$date", "value"]) {
      if (value[key] != null) {
        const parsed = timestampMs(value[key], depth + 1);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? (numeric > 1e12 ? numeric : numeric * 1000) : null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatOrderDate(value: any, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string {
  const ms = timestampMs(value);
  return ms === null ? "Recent" : new Intl.DateTimeFormat("en-PH", { ...options, timeZone: "Asia/Manila" }).format(new Date(ms));
}

function getPaymentDeadlineMs(order: any): number | null {
  const explicit = timestampMs(order?.paymentDeadlineAt || order?.payment_deadline_at);
  if (explicit !== null) return explicit;
  const createdAt = timestampMs(order?.createdAt || order?.created_at);
  if (createdAt !== null) return createdAt + 60 * 60 * 1000;
  return timestampMs(order?.expiredAt || order?.expired_at);
}

function canUploadPaymentProof(order: any): boolean {
  if (!order) return false;
  if (String(order.status || '').toLowerCase() !== 'pending') return false;
  if (String(order.paymentStatus || order.payment_status || '').toLowerCase() !== 'unpaid') return false;
  if (String(order.paymentProofImage || order.payment_proof_image || '').trim()) return false;
  if (Number(order.payableNow ?? order.payable_now ?? order.totalAmount ?? order.total_amount ?? 0) <= 0) return false;

  const deadlineMs = getPaymentDeadlineMs(order);
  return deadlineMs === null || deadlineMs > Date.now();
}

function formatPaymentDeadline(order: any): string {
  const deadlineMs = getPaymentDeadlineMs(order);
  if (deadlineMs === null) return '';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(deadlineMs));
}

export default function OrderHistoryModal({
  isOpen,
  onClose,
  initialSelectedOrderId = null
}: OrderHistoryModalProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialSelectedOrderId);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Payment proof states in details view
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any | null>(null);
  const [proofImage, setProofImage] = useState<string>("");
  const [isUploadingProof, setIsUploadingProof] = useState<boolean>(false);
  const [isSubmittingProof, setIsSubmittingProof] = useState<boolean>(false);
  const [proofSuccess, setProofSuccess] = useState<boolean>(false);
  const [proofError, setProofError] = useState<string>("");
  const [directReceiptOrderId, setDirectReceiptOrderId] = useState<string | null>(null);
  const [isDirectReceiptUploading, setIsDirectReceiptUploading] = useState<boolean>(false);
  const [receiptViewerUrl, setReceiptViewerUrl] = useState<string | null>(null);
  const [confirmingReceiptOrderId, setConfirmingReceiptOrderId] = useState<string | null>(null);
  const [receiptConfirmationError, setReceiptConfirmationError] = useState<string>("");



  const selectedOrder = useMemo(() => {
    return orders.find(o => (o.id === selectedOrderId || o.orderNumber === selectedOrderId) && !["completed", "complete", "delivered", "fulfilled"].includes(String(o.status || "").toLowerCase())) || null;
  }, [orders, selectedOrderId]);

  // Sync initialSelectedOrderId when passed
  useEffect(() => {
    if (initialSelectedOrderId) {
      setSelectedOrderId(initialSelectedOrderId);
    }
  }, [initialSelectedOrderId]);

  // Load customer orders from server + localStorage merge
  const loadOrders = async () => {
    setIsLoading(true);
    setErrorMsg("");
    try {
      // The endpoint scopes results to the verified Telegram user; browser IDs are not trusted for ownership.
      const serverOrders = await callServerless<any[]>('getMyOrders', {}, 20_000);
      if (Array.isArray(serverOrders)) {
        const authoritativeOrders = serverOrders
          .map(normalizeOrder)
          .filter(Boolean)
          .sort((a: any, b: any) => {
            const aTime = Date.parse(String(a.createdAt || ""));
            const bTime = Date.parse(String(b.createdAt || ""));
            if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
            return String(b.orderNumber || b.id || "").localeCompare(String(a.orderNumber || a.id || ""));
          });
        setOrders(authoritativeOrders);
      } else {
        throw new Error("Order history response was invalid.");
      }
    } catch (err: any) {
      console.error("Failed to load customer orders:", err);
      setErrorMsg("Failed to retrieve order history. Please pull to refresh.");
    } finally {
      setIsLoading(false);
    }
  };

  const confirmOrderReceived = async (orderId: string) => {
    setConfirmingReceiptOrderId(orderId);
    setReceiptConfirmationError("");
    try {
      await callServerless('confirmOrderReceived', { orderId }, 20_000);
      await loadOrders();
    } catch (error: any) {
      setReceiptConfirmationError(error?.message || 'Could not confirm receipt. Please try again.');
    } finally {
      setConfirmingReceiptOrderId(null);
    }
  };

  // Load payment methods for proof submission
  const loadPaymentMethods = async () => {
    try {
      const data = await callServerless<any[]>('getPublicPaymentMethods');
      const receiptTypes = new Set(['qr_code', 'manual_transfer', 'crypto', 'secured_payment_link']);
      const list = (Array.isArray(data) ? data : []).filter((method: any) =>
        receiptTypes.has(String(method?.paymentType || method?.type || '').toLowerCase())
      );
      setPaymentMethods(list);
      // Do not pre-select any payment method
    } catch (e) {
      console.warn("Could not fetch payment methods", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadOrders();
      loadPaymentMethods();
    }
  }, [isOpen]);

  // Listen to cross-component updates
  useEffect(() => {
    const handleOrdersUpdated = () => {
      if (isOpen) {
        loadOrders();
      }
    };
    window.addEventListener("prime_orders_updated", handleOrdersUpdated);
    return () => window.removeEventListener("prime_orders_updated", handleOrdersUpdated);
  }, [isOpen]);

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Handle proof image file selection
  const handleProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProofError("Please select an image receipt.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProofError("Image file size must be less than 5MB.");
      return;
    }

    setIsUploadingProof(true);
    setProofError("");

    const reader = new FileReader();
    reader.onload = () => {
      const source = reader.result as string;
      const image = new Image();

      image.onload = () => {
        try {
          const maxDimension = 1600;
          const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
          const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
          const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas unavailable");

          ctx.drawImage(image, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.82);
          setProofImage(compressed);
        } catch {
          setProofImage(source);
        } finally {
          setIsUploadingProof(false);
        }
      };

      image.onerror = () => {
        setProofError("Failed to process receipt image.");
        setIsUploadingProof(false);
      };

      image.src = source;
    };

    reader.onerror = () => {
      setProofError("Failed to read image file.");
      setIsUploadingProof(false);
    };

    reader.readAsDataURL(file);
  };


  // Submit payment proof for the selected order
  const handleSubmitProof = async () => {
    if (!selectedOrder) return;
    if (!canUploadPaymentProof(selectedOrder)) {
      setProofError("This order has expired or is no longer accepting payment proof.");
      return;
    }
    if (!proofImage) {
      setProofError("Please upload a screenshot or photo of your payment receipt.");
      return;
    }

    setIsSubmittingProof(true);
    setProofError("");
    setProofSuccess(false);

    try {
      const paymentMethodId = selectedPaymentMethod?.id || selectedOrder.paymentMethodId || "";
      const paymentMethodName = selectedPaymentMethod?.name || selectedOrder.paymentMethodName || "Manual Payment";
      const finalProofUrl = await uploadPaymentReceiptDataUrl(proofImage, selectedOrder.id, paymentMethodId);
      setProofSuccess(true);
      // Update local state
      setOrders(prev => prev.map(o => {
        if (o.id === selectedOrder.id) {
          return {
            ...o,
            paymentMethodId,
            paymentMethodName,
            paymentProofImage: finalProofUrl,
            paymentProofSubmittedAt: new Date().toISOString(),
            paymentStatus: "Pending Review"
          };
        }
        return o;
      }));

      // Also persist to localStorage
      try {
        const stored = JSON.parse(localStorage.getItem("prime_customer_orders") || "[]");
        const updated = stored.map((o: any) => {
          if (o.id === selectedOrder.id) {
            return {
              ...o,
              paymentMethodId,
              paymentMethodName,
              paymentProofImage: finalProofUrl,
              paymentProofSubmittedAt: new Date().toISOString(),
              paymentStatus: "Pending Review"
            };
          }
          return o;
        });
        localStorage.setItem("prime_customer_orders", JSON.stringify(updated));
      } catch (e) {}

    } catch (err: any) {
      console.error("Proof submission error:", err);
      setProofError(err.message || "Failed to submit receipt proof.");
    } finally {
      setIsSubmittingProof(false);
    }
  };

  const handleSubmitAdjustmentProof = async () => {
    if (!selectedOrder || !proofImage || !selectedPaymentMethod) return;
    if (Number(selectedOrder.adjustmentDue || 0) <= 0 || String(selectedOrder.adjustmentStatus || '').toLowerCase() !== 'awaiting_payment') {
      setProofError('This order is not awaiting an additional payment. Refresh your orders.');
      return;
    }
    setIsSubmittingProof(true);
    setProofError('');
    try {
      const reference = await uploadPaymentReceiptDataUrl(proofImage, selectedOrder.id, selectedPaymentMethod.id, true);
      setOrders((previous) => previous.map((order) => order.id === selectedOrder.id ? {
        ...order,
        adjustmentProofImage: reference,
        adjustmentPaymentMethodId: selectedPaymentMethod.id,
        adjustmentPaymentMethodName: selectedPaymentMethod.name,
        adjustmentStatus: 'pending_review',
        adjustmentProofSubmittedAt: new Date().toISOString(),
      } : order));
      setProofImage('');
      setProofSuccess(true);
    } catch (err: any) {
      setProofError(err?.message || 'Could not submit the additional payment receipt.');
    } finally {
      setIsSubmittingProof(false);
    }
  };

  const openDirectReceiptUploader = (order: any) => {
    setDirectReceiptOrderId(order.id || order.orderNumber || null);
    setProofImage("");
    setProofError("");
    setProofSuccess(false);

    const existingMethodId = order.paymentMethodId || order.payment_method_id || "";
    const existingMethodName = order.paymentMethodName || order.payment_method_name || "";
    const existing = paymentMethods.find((m: any) => String(m.id) === String(existingMethodId));

    setSelectedPaymentMethod(
      existing ||
      (existingMethodId || existingMethodName
        ? { id: existingMethodId, name: existingMethodName || "Manual Payment", paymentType: "manual_transfer" }
        : null)
    );
  };

  const submitDirectReceipt = async (order: any) => {
    if (!order) return;

    if (!canUploadPaymentProof(order)) {
      setProofError("This order has expired or is no longer accepting payment proof.");
      return;
    }

    if (!proofImage) {
      setProofError("Please select a receipt image first.");
      return;
    }

    setIsDirectReceiptUploading(true);
    setProofError("");
    setProofSuccess(false);

    try {
      const paymentMethodId = selectedPaymentMethod?.id || order.paymentMethodId || "";
      const finalProofUrl = await uploadPaymentReceiptDataUrl(proofImage, order.id, paymentMethodId);
      const paymentMethodName = selectedPaymentMethod?.name || order.paymentMethodName || "Manual Payment";
      setProofSuccess(true);
      setOrders(prev => prev.map(o =>
        (o.id === order.id || o.orderNumber === order.orderNumber)
          ? {
              ...o,
              paymentMethodId,
              paymentMethodName,
              paymentProofImage: finalProofUrl,
              paymentProofSubmittedAt: new Date().toISOString(),
              paymentStatus: "Pending Review",
            }
          : o
      ));

      try {
        const stored = JSON.parse(localStorage.getItem("prime_customer_orders") || "[]");
        localStorage.setItem(
          "prime_customer_orders",
          JSON.stringify(
            stored.map((o: any) =>
              (o.id === order.id || o.orderNumber === order.orderNumber)
                ? {
                    ...o,
                    paymentMethodId,
                    paymentMethodName,
                    paymentProofImage: finalProofUrl,
                    paymentProofSubmittedAt: new Date().toISOString(),
                    paymentStatus: "Pending Review",
                  }
                : o
            )
          )
        );
      } catch (e) {}

      window.dispatchEvent(new Event("prime_orders_updated"));
    } catch (err: any) {
      console.error("Direct receipt upload error:", err);
      setProofError(err.message || "Failed to submit payment receipt.");
    } finally {
      setIsDirectReceiptUploading(false);
    }
  };

  const openReceiptImage = async (reference: string) => {
    try {
      setProofError("");
      setReceiptViewerUrl(await resolveTelegramMedia(reference));
    } catch (error: any) {
      setProofError(error?.message || "This receipt could not be opened.");
    }
  };

  // Filtered orders for compact list
  const filteredOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => (timestampMs(b.createdAt || b.updatedAt) || 0) - (timestampMs(a.createdAt || a.updatedAt) || 0))
      .filter(order => {
      const status = (order.status || "Pending").toUpperCase();
      if (["COMPLETED", "COMPLETE", "DELIVERED", "FULFILLED"].includes(status)) return false;
      const matchesFilter = 
        statusFilter === "ALL" ||
        (statusFilter === "PENDING" && status === "PENDING") ||
        (statusFilter === "PROCESSING" && status === "PROCESSING");

      const query = searchTerm.trim().toLowerCase();
      const orderNum = (order.orderNumber || order.id || "").toLowerCase();
      const receiver = (order.receiverName || "").toLowerCase();
      const itemsMatch = Array.isArray(order.items) && order.items.some((it: any) => 
        (it.name || "").toLowerCase().includes(query)
      );

      const matchesSearch = !query || orderNum.includes(query) || receiver.includes(query) || itemsMatch;

      return matchesFilter && matchesSearch;
    });
  }, [orders, statusFilter, searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="prime-order-history w-full bg-gray-50 flex justify-center py-[4.8px]">
      <div 
        className="w-full max-w-[430px] min-h-[calc(100vh-120px)] bg-white shadow-sm border-x border-slate-200 overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* ================= MODAL HEADER ================= */}
        <div className="border-b border-gray-100 bg-white px-3.5 py-2.5 sticky top-0 z-30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedOrder && (
              <button
                type="button"
                onClick={() => {
                  setSelectedOrderId(null);
                  setReceiptViewerUrl(null);
                  setProofSuccess(false);
                  setProofImage("");
                  setProofError("");
                  setDirectReceiptOrderId(null);
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
                title="Back to compact order list"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <div className="text-base leading-5 font-heading font-bold text-gray-900 tracking-wide uppercase">
                {selectedOrder ? "ORDER DETAILS" : "MY PURCHASES"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadOrders}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              title="Refresh Orders"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-black" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================= MODAL BODY ================= */}
        <div className="p-3 sm:p-3.5 overflow-y-auto flex-1 space-y-4">
          {/* ----------------- VIEW 1: COMPACT ORDER LIST ----------------- */}
          {!selectedOrderId || !selectedOrder ? (
            <div className="space-y-4">
              {/* Search and Status Tab Filters */}
              <div className="space-y-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="SEARCH BY ORDER #, ITEM, OR RECEIVER..."
                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-900 placeholder:text-gray-400 uppercase focus:outline-none focus:ring-1 focus:ring-black"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-400 hover:text-gray-700"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
                  {(["ALL", "PENDING", "PROCESSING", "EXPIRED"] as const).map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setStatusFilter(tab)}
                      className={`px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider text-[10px] whitespace-nowrap transition-colors cursor-pointer ${
                        statusFilter === tab
                          ? "bg-slate-900 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                  <span className="ml-auto text-[11px] text-gray-400 font-mono">
                    {filteredOrders.length} {filteredOrders.length === 1 ? "order" : "orders"}
                  </span>
                </div>
              </div>

              {/* Orders List Container */}
              {isLoading && orders.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-900" />
                  <p className="text-xs font-mono text-gray-500 uppercase tracking-wider">
                    Loading your orders...
                  </p>
                </div>
              ) : errorMsg && orders.length === 0 ? (
                <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-2">
                  <AlertCircle className="w-6 h-6 text-red-600 mx-auto" />
                  <p className="text-xs font-mono text-red-700">{errorMsg}</p>
                  <button
                    type="button"
                    onClick={loadOrders}
                    className="px-3 py-1.5 bg-red-600 text-white text-xs font-mono rounded-lg hover:bg-red-700 cursor-pointer"
                  >
                    Try Again
                  </button>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="py-16 text-center space-y-3 bg-gray-50 rounded-2xl border border-gray-100 p-6">
                  <div className="w-12 h-12 rounded-full bg-gray-200/80 flex items-center justify-center mx-auto text-gray-500">
                    <Receipt className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-sm uppercase text-gray-900">
                      No Orders Found
                    </h3>
                    <p className="text-xs font-mono text-gray-500 max-w-xs mx-auto mt-1">
                      {searchTerm || statusFilter !== "ALL"
                        ? "No orders match your active search or filters."
                        : orders.length > 0 ? "No active orders to display." : "You haven't placed any orders yet. Add items to your cart to checkout."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredOrders.map((order) => {
                    const status = order.status || "Pending";
                    const orderNumber = String(order.orderNumber || order.id || "").replace(/^#/, "");
                    const orderKey = order.id || order.orderNumber;
                    const isActive = !["completed", "delivered", "expired", "cancelled"].includes(String(status).toLowerCase());
                    const statusIcon = isActive ? <Clock className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />;

                    return (
                      <button
                        key={orderKey}
                        type="button"
                        onClick={() => setSelectedOrderId(orderKey)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3.5 text-left shadow-xs transition-all hover:border-slate-900 active:scale-[0.99]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-misans-bold text-[17px] leading-tight text-slate-950">{orderNumber}</span>
                          <span className="mt-1 block font-misans-regular text-xs text-gray-500">
                            {formatOrderDate(order.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </span>
                        <span className={`flex shrink-0 items-center gap-1.5 font-misans-bold text-[13px] uppercase ${isActive ? "text-blue-700" : "text-slate-600"} ${isActive ? "order-history__active-status" : ""}`}>
                          {statusIcon}<span>{status}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ----------------- VIEW 2: FULL ORDER DETAILS ----------------- */
            selectedOrder && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-150">
                {/* Status and Summary Hero Box */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-200/80 pb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="truncate font-misans-bold text-[19px] leading-tight text-slate-900">
                          {String(selectedOrder.orderNumber || selectedOrder.id || "").replace(/^#/, "")}
                        </h3>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(selectedOrder.orderNumber || selectedOrder.id, "orderId")}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                          title="Copy Order ID"
                        >
                          {copiedKey === "orderId" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="mt-1 font-misans-regular text-xs text-slate-500">
                        {formatOrderDate(selectedOrder.createdAt)}
                      </p>
                    </div>
                    {(() => {
                      const status = String(selectedOrder.status || "Pending");
                      const isActive = !["completed", "delivered", "expired", "cancelled"].includes(status.toLowerCase());
                      return <span className={`flex shrink-0 items-center gap-1.5 font-misans-bold text-[19px] leading-tight uppercase ${isActive ? "text-blue-700 order-history__active-status" : "text-slate-700"}`}>
                        {isActive ? <Clock className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{status}
                      </span>;
                    })()}
                  </div>
                </div>

                {String(selectedOrder.status || '').toLowerCase() === 'dispatched' && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
                    <p className="text-xs font-mono text-emerald-900">
                      Confirm when the order has arrived. If you do not confirm, the system will mark it completed six hours after dispatch.
                    </p>
                    {receiptConfirmationError && <p className="text-xs text-red-700">{receiptConfirmationError}</p>}
                    <button
                      type="button"
                      disabled={confirmingReceiptOrderId === selectedOrder.id}
                      onClick={() => confirmOrderReceived(selectedOrder.id)}
                      className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-mono font-bold text-white disabled:opacity-60"
                    >
                      {confirmingReceiptOrderId === selectedOrder.id ? 'CONFIRMING…' : 'I RECEIVED MY ORDER'}
                    </button>
                  </div>
                )}

                {/* Live Courier Tracking Interactive Card */}
                {selectedOrder.trackingUrl && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-blue-950">
                          Shipment &amp; Courier Tracking
                        </h4>
                        <p className="text-[11px] font-mono text-blue-700">
                          Live rider location link is ready
                        </p>
                      </div>
                    </div>

                    <a
                      href={selectedOrder.trackingUrl.startsWith("http") ? selectedOrder.trackingUrl : `https://${selectedOrder.trackingUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-heading font-bold uppercase tracking-wider text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Track Location</span>
                    </a>
                  </div>
                )}

                {/* Itemized Order Products Breakdown */}
                <div className="space-y-2">
                  <h4 className="text-xs font-heading font-bold uppercase tracking-wider text-gray-900 border-b border-gray-100 pb-1.5">
                    Purchased Items ({selectedOrder.items?.length || 0})
                  </h4>

                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl bg-gray-50/50 p-2 max-h-60 overflow-y-auto">
                    {Array.isArray(selectedOrder.items) && selectedOrder.items.map((item: any, idx: number) => {
                      const isFree = Boolean(item.isFree || Number(item.price) === 0);
                      return (
                        <div key={idx} className="order-history__item p-2 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <TelegramMediaImage
                              src={item.imageUrl || "https://picsum.photos/seed/prime/100"}
                              fallbackSrc="https://picsum.photos/seed/prime/100"
                              alt={item.name}
                              className="w-10 h-10 object-cover rounded-lg bg-white border border-gray-200 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="order-history__item-name truncate text-gray-900">
                                  {item.name}
                                </p>
                                {isFree && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                                    FREE
                                  </span>
                                )}
                              </div>
                              <p className="order-history__item-meta text-[11px] text-gray-500">
                                {item.quantity || 1} × {isFree ? "FREE" : formatPHP(item.price || 0)}
                                {(item.selectedVariant?.name || item.variantName) && (
                                  <span className="text-gray-400"> • {item.selectedVariant?.name || item.variantName}</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <span className={`order-history__item-amount shrink-0 ${isFree ? "text-emerald-600 font-bold" : "text-gray-900"}`}>
                            {isFree ? "FREE" : formatPHP((Number(item.price) || 0) * (Number(item.quantity) || 1))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Financial Breakdown & Charges */}
                <div className="order-history__payment-breakdown border border-gray-200 rounded-xl p-3 bg-white space-y-1 text-xs">
                  <h4 className="font-heading font-bold uppercase tracking-wider text-gray-900 border-b border-gray-100 pb-1">
                    Payment Breakdown
                  </h4>
                  {(selectedOrder.appliedCharges?.length ?? 0) === 0 && (
                    <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wide">
                      No additional charges applied
                    </div>
                  )}

                  {/* Subtotal */}
                  <div className="flex justify-between items-center text-gray-600">
                    <span>Items Subtotal:</span>
                    <span className="order-history__charge-amount text-gray-900">
                      {formatPHP(selectedOrder.subTotal || selectedOrder.subtotal || selectedOrder.itemsSubtotal || selectedOrder.items?.reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0) || 0)}
                    </span>
                  </div>

                  {/* Charges list if present */}
                  {Array.isArray(selectedOrder.appliedCharges || selectedOrder.charges) && (selectedOrder.appliedCharges || selectedOrder.charges).map((ch: any, i: number) => {
                    const isChFree = Boolean(ch.isFree || Number(ch.computedAmount || ch.amount) === 0);
                    return (
                      <div key={i} className="flex justify-between items-center text-gray-600">
                        <span>{ch.name}:</span>
                        <span className={`order-history__charge-amount ${isChFree ? "text-emerald-600 font-bold" : "text-gray-900"}`}>
                          {isChFree ? "WAIVED / FREE" : formatPHP(ch.computedAmount || ch.amount || 0)}
                        </span>
                      </div>
                    );
                  })}

                  {/* Store Credits Applied */}
                  {Number(selectedOrder.storeCreditsUsed || 0) > 0 && (
                    <div className="flex justify-between items-center text-gray-600">
                      <span>Store Credits Applied:</span>
                      <span className="order-history__charge-amount text-emerald-700">
                        -{formatPHP(Number(selectedOrder.storeCreditsUsed))}
                      </span>
                    </div>
                  )}

                  {/* Delivery Fee */}
                  <div className="flex justify-between items-center text-gray-600">
                    <div>
                      <span>Delivery Fee ({selectedOrder.courier?.name || selectedOrder.courierName || "Courier"}):</span>
                      {selectedOrder.deliveryFeePaymentMethod === "upon_delivery" ? (
                        <span className="block text-[10px] text-amber-700 font-bold uppercase tracking-wider">
                          PAY UPON DELIVERY (COD)
                        </span>
                      ) : (
                        <span className="block text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                          PAY UPON CHECKOUT
                        </span>
                      )}
                    </div>
                    {Boolean(selectedOrder.isDeliveryFeeFree || Number(selectedOrder.deliveryFee) === 0) ? (
                      <span className="order-history__charge-amount text-emerald-600">WAIVED / FREE</span>
                    ) : (
                      <span className="order-history__charge-amount text-gray-900">
                        {formatPHP(selectedOrder.deliveryFee || selectedOrder.courier?.fee || 0)}
                      </span>
                    )}
                  </div>

                  {/* Grand Total */}
                  <div className="pt-2 border-t border-gray-200 flex justify-between items-center text-sm font-heading font-bold text-gray-900">
                    <span>Total Amount:</span>
                    <span className="text-base text-slate-950 font-bold font-mono">
                      {formatPHP(
                        selectedOrder.deliveryFeePaymentMethod === "upon_delivery"
                          ? (selectedOrder.payableNow !== undefined 
                              ? Number(selectedOrder.payableNow) 
                              : (Number(selectedOrder.totalAmount || 0) > Number(selectedOrder.deliveryFee || 0) 
                                  ? Number(selectedOrder.totalAmount || 0) - Number(selectedOrder.deliveryFee || 0) 
                                  : Number(selectedOrder.totalAmount || 0)))
                          : (selectedOrder.totalAmount || selectedOrder.payableNow || 0)
                      )}
                    </span>
                  </div>

                  {/* Payable Splits if COD */}
                  {selectedOrder.deliveryFeePaymentMethod === "upon_delivery" && (
                    <div className="mt-2.5 pt-2 border-t border-dashed border-gray-200 space-y-1.5 text-[11px]">
                      <div className="flex justify-between items-center text-slate-600">
                        <span>Amount Paid Now (Checkout):</span>
                        <span className="font-bold text-slate-900 font-ibm-condensed">
                          {formatPHP(selectedOrder.payableNow ?? (Number(selectedOrder.totalAmount) - Number(selectedOrder.deliveryFee)))}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-amber-800 bg-amber-50 p-1.5 rounded border border-amber-200">
                        <span className="font-bold">Pay to Courier upon delivery:</span>
                        <span className="font-black font-ibm-condensed">
                          {formatPHP(selectedOrder.payableOnDelivery ?? selectedOrder.deliveryFee ?? 0)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Recipient & Delivery Details */}
                <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-2.5 font-mono text-xs">
                  <h4 className="font-heading font-bold uppercase tracking-wider text-gray-900 border-b border-gray-100 pb-2">
                    Recipient &amp; Delivery Info
                  </h4>

                  <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                    <div>
                      <span className="text-[10px] uppercase text-gray-400 block font-bold">Receiver Name</span>
                      <span className="font-ibm-condensed font-medium text-slate-800 uppercase">
                        {selectedOrder.receiverName || "N/A"}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase text-gray-400 block font-bold">Receiver Phone</span>
                      <span className="font-ibm-condensed font-medium text-slate-800">
                        {selectedOrder.receiverPhone || "N/A"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <span className="text-[10px] uppercase text-gray-400 block font-bold">Delivery Address</span>
                      <span className="text-slate-800 leading-relaxed block font-ibm-condensed font-medium">
                        {selectedOrder.deliveryAddress?.formatted || selectedOrder.deliveryAddress?.address || selectedOrder.address || "N/A"}
                        <span className="block text-gray-500 text-[11px] mt-0.5 font-ibm-condensed font-medium">
                          Unit / Landmark: {selectedOrder.deliveryAddress?.unitDetails || "Non"}
                        </span>
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase text-gray-400 block font-bold">Delivery Notes / Instructions</span>
                      <span className="text-slate-700 italic block font-ibm-condensed font-medium">
                        {selectedOrder.notes || "Non"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment Settle & Receipt Proof Upload Section */}
                {Number(selectedOrder.adjustmentDue || 0) > 0 && (
                  <section className="border border-amber-300 rounded-xl p-4 bg-amber-50 space-y-3">
                    <div>
                      <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-amber-950">Additional payment requested</h4>
                      <p className="text-sm font-bold text-amber-950">{formatPHP(Number(selectedOrder.adjustmentDue))}</p>
                      {selectedOrder.adjustmentRevisedTotal != null && <p className="text-[11px] text-amber-900">Revised order total: {formatPHP(Number(selectedOrder.adjustmentRevisedTotal))}</p>}
                      <p className="text-[11px] text-amber-900">Your order is already marked Paid. Please pay this difference using a listed payment method and upload the receipt. Staff will verify it before dispatch.</p>
                    </div>
                    {selectedOrder.adjustmentProofImage ? (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-amber-950">Extra payment receipt · {String(selectedOrder.adjustmentStatus || '').replace(/_/g, ' ')}</p>
                        <button type="button" onClick={() => void openReceiptImage(String(selectedOrder.adjustmentProofImage))} className="px-3 py-2 border border-amber-400 bg-white text-xs font-bold">View uploaded receipt</button>
                      </div>
                    ) : String(selectedOrder.adjustmentStatus || '').toLowerCase() === 'awaiting_payment' ? (
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-900">Payment method</label>
                        <select value={selectedPaymentMethod?.id || ''} onChange={(event) => setSelectedPaymentMethod(paymentMethods.find((method: any) => String(method.id) === event.target.value) || null)} className="w-full border border-amber-300 bg-white px-3 py-2 text-sm">
                          <option value="">Choose a payment method</option>
                          {paymentMethods.map((method: any) => <option key={method.id} value={method.id}>{method.name}</option>)}
                        </select>
                        {selectedPaymentMethod?.paymentLinkUrl && /^https:\/\//i.test(String(selectedPaymentMethod.paymentLinkUrl)) && <a href={selectedPaymentMethod.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className="block bg-slate-900 px-3 py-2 text-center text-xs font-bold uppercase text-white">Open secured payment link</a>}
                        <label className="block text-xs text-amber-950">Upload the receipt for the additional payment<input type="file" accept="image/*" onChange={handleProofFileChange} className="mt-2 block w-full text-xs" /></label>
                        {proofError && <p className="text-xs text-red-700">{proofError}</p>}
                        <button type="button" onClick={() => void handleSubmitAdjustmentProof()} disabled={isSubmittingProof || !proofImage || !selectedPaymentMethod} className="w-full py-2.5 bg-amber-800 text-white text-xs font-bold uppercase disabled:opacity-50">{isSubmittingProof ? 'Submitting…' : 'Submit extra payment receipt'}</button>
                      </div>
                    ) : selectedOrder.adjustmentStatus === 'paid' ? (
                      <p className="text-xs font-bold text-emerald-800">Additional payment verified by staff.</p>
                    ) : (
                      <p className="text-xs font-bold text-amber-950">Receipt submitted. Staff verification is pending.</p>
                    )}
                  </section>
                )}
                <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-3">
                  {String(selectedOrder.status || "").toLowerCase() === "pending" && Number(selectedOrder.payableNow ?? 0) > 0 && getPaymentDeadlineMs(selectedOrder) !== null && (
                    <p className="text-[10px] font-mono text-amber-700">
                      Payment proof deadline: {formatPaymentDeadline(selectedOrder)}
                    </p>
                  )}
                  {(String(selectedOrder.status || "").toLowerCase() === "expired" || (String(selectedOrder.status || "").toLowerCase() === "pending" && !selectedOrder.paymentProofImage && getPaymentDeadlineMs(selectedOrder) !== null && getPaymentDeadlineMs(selectedOrder)! <= Date.now())) && (
                    <p className="text-[10px] font-mono text-red-700">Payment window ended: {formatPaymentDeadline(selectedOrder) || "time unavailable"}</p>
                  )}

                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <div>
                      <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-gray-900">
                        Payment Status &amp; Receipt Proof
                      </h4>
                      <p className="order-history__item-meta text-[11px] text-gray-500">
                        {selectedOrder.paymentStatus || (selectedOrder.status === "Completed" ? "Completed" : "Pending Verification")}
                      </p>
                    </div>

                    {selectedOrder.paymentProofImage && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        Receipt Uploaded
                      </span>
                    )}
                  </div>

                  {/* Receipt already exists: keep the image unloaded until the customer taps the viewer. */}
                  {selectedOrder.paymentProofImage ? (
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                      <span className="text-[10px] font-mono text-gray-400 uppercase font-bold block">
                        Uploaded Payment Receipt
                      </span>
                      <button
                        type="button"
                        onClick={() => void openReceiptImage(String(selectedOrder.paymentProofImage))}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-lg text-[11px] font-heading font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        <Receipt className="w-4 h-4" />
                        View Uploaded Receipt
                      </button>
                      {String(selectedOrder.status || '').toLowerCase() === 'pending' && String(selectedOrder.paymentStatus || '').toLowerCase() === 'pending review' && Number(selectedOrder.staffEditVersion || 0) > 0 && (
                        <p className="border-t border-gray-200 pt-3 text-xs text-gray-600">You do not need to pay again or upload another receipt just because the order was edited. Staff will compare your existing receipt with the revised amount due. Any verified overpayment will be returned as Store Credits. If the payment is short, staff will contact you before processing.</p>
                      )}
                    </div>
                  ) : canUploadPaymentProof(selectedOrder) ? (
                    /* If order is still Pending, unpaid, and within the payment window, allow customer to upload receipt */
                    <div className="space-y-3 pt-1">
                      <p className="text-xs font-mono text-gray-600">
                        Upload your payment receipt for manual staff review. Submitting it does not confirm payment.
                      </p>

                      {proofError && (
                        <div className="text-xs font-mono text-red-600 flex items-center gap-1.5 p-2 bg-red-50 rounded-lg border border-red-200">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{proofError}</span>
                        </div>
                      )}

                      {proofSuccess ? (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-1">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto" />
                          <p className="text-xs font-mono font-bold text-emerald-900">
                            Receipt Proof Submitted Successfully!
                          </p>
                          <p className="text-[11px] font-mono text-emerald-700">
                            Our team will verify your payment and begin processing your order.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-heading mb-1.5">
                              Select Payment Method
                            </label>
                            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                              {paymentMethods.map((method: any) => {
                                const isOffline = method.isActive === false;
                                const isSelected = !isOffline && selectedPaymentMethod?.id === method.id;
                                const pType = String(method.paymentType || method.type || "").toLowerCase();
                                return (
                                  <div key={method.id} className="flex min-w-0 flex-col items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={isOffline}
                                    onClick={() => {
                                      if (isOffline) return;
                                      setSelectedPaymentMethod(method);
                                      setProofSuccess(false);
                                      setProofError("");
                                      setProofImage("");
                                    }}
                                    className={`group w-full aspect-video border transition-colors flex items-center justify-center p-0 relative overflow-hidden bg-slate-950 select-none rounded-md shadow-[0_1px_3px_rgba(15,23,42,0.2)] ${isOffline ? "border-red-200/70 cursor-not-allowed opacity-90" : isSelected ? "border-slate-300 cursor-pointer" : "border-slate-500 hover:border-slate-300 cursor-pointer"}`}
                                    title={isOffline ? `${method.name} is currently offline` : method.name}
                                  >
                                    {method.logo ? (
                                      <TelegramMediaImage
                                        src={method.logo}
                                        alt={method.name}
                                        className={`absolute inset-0 z-[2] w-full h-full object-fill ${isOffline ? "opacity-40 grayscale-[30%]" : ""}`}
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <CreditCard className={`relative z-[2] w-5 h-5 text-gray-400 ${isOffline ? "filter blur-[1px] opacity-40" : ""}`} />
                                    )}
                                    {isOffline && (
                                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[0.5px]">
                                        <span className="font-heading font-black text-[9px] text-red-500 uppercase tracking-widest bg-red-950/90 border border-red-500/70 px-1.5 py-0.5 rounded leading-none">
                                          OFFLINE
                                        </span>
                                      </div>
                                    )}
                                  </button>
                                  <span className={`w-full truncate text-center text-[9px] font-heading font-bold uppercase ${isOffline ? "text-gray-400" : "text-gray-900"}`} title={method.name}>{method.name}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {selectedPaymentMethod && (
                            <div className="border border-slate-200 bg-white rounded-lg p-3 space-y-3">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <strong className="text-[10px] font-heading font-black uppercase tracking-wider text-slate-900">{selectedPaymentMethod.name}</strong>
                                <span className="text-[9px] font-mono uppercase text-slate-400">{String(selectedPaymentMethod.paymentType || selectedPaymentMethod.type || "payment").replace(/_/g, " ")}</span>
                              </div>

                              {(selectedPaymentMethod.accountName || selectedPaymentMethod.accountNumber) && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {selectedPaymentMethod.accountName && (
                                    <div className="border border-slate-200 p-2.5 flex items-center justify-between gap-2">
                                      <div className="min-w-0"><span className="block text-[8px] uppercase text-slate-400 font-bold">Account Name</span><strong className="block text-[11px] truncate">{selectedPaymentMethod.accountName}</strong></div>
                                      <button type="button" onClick={() => copyToClipboard(selectedPaymentMethod.accountName, "acc_name")} className="px-2 py-1 border border-slate-200 bg-slate-50 text-[9px] font-bold uppercase shrink-0">{copiedKey === "acc_name" ? "Copied" : "Copy"}</button>
                                    </div>
                                  )}
                                  {selectedPaymentMethod.accountNumber && (
                                    <div className="border border-slate-200 p-2.5 flex items-center justify-between gap-2">
                                      <div className="min-w-0"><span className="block text-[8px] uppercase text-slate-400 font-bold">Account / Mobile</span><strong className="block text-[11px] truncate">{selectedPaymentMethod.accountNumber}</strong></div>
                                      <button type="button" onClick={() => copyToClipboard(selectedPaymentMethod.accountNumber, "acc_num")} className="px-2 py-1 border border-slate-200 bg-slate-50 text-[9px] font-bold uppercase shrink-0">{copiedKey === "acc_num" ? "Copied" : "Copy"}</button>
                                    </div>
                                  )}
                                </div>
                              )}

                              {String(selectedPaymentMethod.paymentType || selectedPaymentMethod.type || "").toLowerCase() === "secured_payment_link" && (
                                <div className="border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                                  <p className="text-xs text-emerald-900">After payment, return here and upload your receipt for staff review. Link return alone does not confirm payment.</p>
                                  {/^https:\/\//i.test(String(selectedPaymentMethod.paymentLinkUrl || "")) ? (
                                    <a href={selectedPaymentMethod.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className="block bg-slate-900 px-3 py-2 text-center text-xs font-bold uppercase text-white">Open Secured Payment Link</a>
                                  ) : <p className="text-xs text-red-700">This payment link is unavailable. Contact the shop.</p>}
                                </div>
                              )}

                              {(selectedPaymentMethod.qrCodeImage || selectedPaymentMethod.qrCode || selectedPaymentMethod.qrImage || selectedPaymentMethod.qr_code_image) && (
                                <div className="border border-slate-200 p-2 text-center">
                                  <span className="block text-[8px] uppercase text-slate-400 font-bold mb-2">Payment QR</span>
                                  <TelegramMediaImage
                                    src={selectedPaymentMethod.qrCodeImage || selectedPaymentMethod.qrCode || selectedPaymentMethod.qrImage || selectedPaymentMethod.qr_code_image}
                                    alt={`${selectedPaymentMethod.name} QR code`}
                                    className="mx-auto w-44 h-44 object-contain bg-white"
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          <div className="space-y-2">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-heading">
                              Upload Proof of Payment (Receipt / Screenshot)
                            </label>
                            <label className="border-2 border-dashed border-gray-300 hover:border-black rounded-lg p-4 flex flex-col items-center justify-center gap-2 cursor-pointer bg-gray-50 transition-colors">
                              <input type="file" accept="image/*" onChange={handleProofFileChange} className="hidden" />
                              {proofImage ? (
                                <div className="flex flex-col items-center gap-2">
                                  <img src={proofImage} alt="Selected Proof" className="w-24 h-24 object-cover rounded-lg border border-gray-200" />
                                  <span className="text-[11px] font-mono text-emerald-700 font-bold">✓ Image Selected (Click to change)</span>
                                </div>
                              ) : (
                                <>
                                  <Upload className="w-6 h-6 text-gray-400" />
                                  <span className="text-xs font-mono text-gray-600 font-medium">Click or drag to select receipt image</span>
                                  <span className="text-[10px] font-mono text-gray-400">Supports JPG, PNG up to 5MB</span>
                                </>
                              )}
                            </label>
                            {proofImage && (
                              <div className="space-y-2">
                                <button
                                  type="button"
                                  onClick={handleSubmitProof}
                                  disabled={isSubmittingProof || !selectedPaymentMethod}
                                  className="w-full py-2.5 bg-black hover:bg-neutral-800 text-white font-heading font-bold uppercase tracking-wider text-xs rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                                >
                                  {isSubmittingProof ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Submitting Receipt...</span></> : <><Check className="w-4 h-4" /><span>Submit Receipt for Verification</span></>}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : selectedOrder.status === "Pending" && !selectedOrder.paymentProofImage && Number(selectedOrder.payableNow ?? 0) <= 0 ? (
                    <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl">
                      <p className="text-xs font-mono font-bold text-sky-900 uppercase">No Upfront Payment Due</p>
                      <p className="text-[11px] font-mono text-sky-800 mt-1">
                        This order is awaiting staff review. Any delivery amount shown is payable to the courier on arrival.
                      </p>
                    </div>
                  ) : selectedOrder.status === "Pending" && !selectedOrder.paymentProofImage ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-xs font-mono font-bold text-amber-900 uppercase">Payment Window Expired</p>
                      <p className="text-[11px] font-mono text-amber-700 mt-1">
                        No payment proof was submitted before the one-hour deadline. Refresh your orders to see the final expiry status.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          )}
        </div>

        {receiptViewerUrl && (
          <div
            className="fixed inset-0 z-[100] bg-black/80 p-4 sm:p-6 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label="Uploaded payment receipt viewer"
            onClick={() => setReceiptViewerUrl(null)}
          >
            <div
              className="relative w-full max-w-3xl max-h-[90vh] bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                <a
                  href={receiptViewerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-white/90 hover:bg-white text-slate-900 rounded-lg text-[10px] font-heading font-bold uppercase tracking-wider"
                >
                  Open Original
                </a>
                <button
                  type="button"
                  onClick={() => setReceiptViewerUrl(null)}
                  className="p-2 bg-black/70 hover:bg-black text-white rounded-lg border border-white/20"
                  aria-label="Close receipt viewer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="w-full max-h-[90vh] overflow-auto flex items-center justify-center bg-black p-3 sm:p-5">
                <img
                  src={receiptViewerUrl}
                  alt="Uploaded payment receipt"
                  className="max-w-full max-h-[82vh] object-contain"
                />
              </div>
            </div>
          </div>
        )}

        {/* ================= MODAL FOOTER ================= */}
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 flex items-center justify-between">
          <span className="text-[11px] font-mono text-gray-400">
            Orders update automatically
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
