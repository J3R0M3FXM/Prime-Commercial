"use client";

import { authenticatedFetch } from "./telegram-auth-client";

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
    paymentMethodId: raw.paymentMethodId || raw.payment_method_id || "",
    paymentMethodName: raw.paymentMethodName || raw.payment_method_name || "",
    storeCreditsUsed: Number(raw.storeCreditsUsed ?? raw.store_credits_used ?? 0) || 0,
    paymentProofImage: raw.paymentProofImage || raw.payment_proof_image || "",
    paymentProofSubmittedAt: raw.paymentProofSubmittedAt || raw.payment_proof_submitted_at || null,
    paymentDeadlineAt: raw.paymentDeadlineAt || raw.payment_deadline_at || null,
    expiredAt: raw.expiredAt || raw.expired_at || null,
    items: Array.isArray(raw.items) ? raw.items : [],
    notes: raw.notes || "",
  };
}

function getPaymentDeadlineMs(order: any): number | null {
  const raw = order?.paymentDeadlineAt || order?.payment_deadline_at;
  if (!raw) return null;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
}

function canUploadPaymentProof(order: any): boolean {
  if (!order) return false;
  if (String(order.status || '').toLowerCase() !== 'pending') return false;
  if (String(order.paymentStatus || order.payment_status || '').toLowerCase() !== 'unpaid') return false;
  if (String(order.paymentProofImage || order.payment_proof_image || '').trim()) return false;

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



  const selectedOrder = useMemo(() => {
    return orders.find(o => o.id === selectedOrderId || o.orderNumber === selectedOrderId) || null;
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
      let customerId = "";
      if (typeof window !== "undefined") {
        customerId = sessionStorage.getItem("prime_customer_id") || 
                     localStorage.getItem("prime_customer_id") || 
                     sessionStorage.getItem("prime_member_id") || 
                     localStorage.getItem("prime_member_id") || "";
      }

      // The authenticated server response is the source of truth for Order History.
      // Local storage is only used as an offline fallback when the API cannot be reached.
      const url = customerId ? `/api/orders?customerId=${encodeURIComponent(customerId)}&_t=${Date.now()}` : `/api/orders?_t=${Date.now()}`;
      const res = await authenticatedFetch(url, { cache: "no-store" });

      if (res.ok) {
        const serverOrders = await res.json();
        const authoritativeOrders = (Array.isArray(serverOrders) ? serverOrders : [])
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
        throw new Error("Order history request failed (" + res.status + ")");
      }
    } catch (err: any) {
      console.error("Failed to load customer orders:", err);
      setErrorMsg("Failed to retrieve order history. Please pull to refresh.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load payment methods for proof submission
  const loadPaymentMethods = async () => {
    try {
      const res = await authenticatedFetch(`/api/payment-methods?_t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setPaymentMethods(list);
        // Do not pre-select any payment method
      }
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

  const uploadProofToStorage = async (image: string, order: any) => {
    const storageRes = await authenticatedFetch("/api/storage/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image,
        bucket: "receipt-proofs",
        filename: `order-${order?.orderNumber || order?.id || Date.now()}.jpg`,
        contentType: "image/jpeg",
      }),
    });

    const storageData = await storageRes.json().catch(() => ({}));
    if (!storageRes.ok || !storageData.url) {
      throw new Error(storageData.error || "Failed to upload payment receipt.");
    }

    return String(storageData.url);
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
      const finalProofUrl = await uploadProofToStorage(proofImage, selectedOrder);

      const res = await authenticatedFetch("/api/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          paymentMethodId: selectedPaymentMethod?.id || "",
          paymentMethodName: selectedPaymentMethod?.name || "Manual Payment",
          paymentProofImage: finalProofUrl,
          totalAmount: Number(selectedOrder.totalAmount || 0),
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit payment proof.");
      }

      setProofSuccess(true);
      // Update local state
      setOrders(prev => prev.map(o => {
        if (o.id === selectedOrder.id) {
          return {
            ...o,
            paymentMethodId: selectedPaymentMethod?.id || "",
            paymentMethodName: selectedPaymentMethod?.name || "Manual Payment",
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
              paymentMethodId: selectedPaymentMethod?.id || "",
              paymentMethodName: selectedPaymentMethod?.name || "Manual Payment",
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
      const finalProofUrl = await uploadProofToStorage(proofImage, order);
      const paymentMethodId = selectedPaymentMethod?.id || order.paymentMethodId || "";
      const paymentMethodName = selectedPaymentMethod?.name || order.paymentMethodName || "Manual Payment";

      const res = await authenticatedFetch("/api/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          paymentMethodId,
          paymentMethodName,
          paymentProofImage: finalProofUrl,
          totalAmount: Number(order.totalAmount || 0),
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit payment receipt.");
      }

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

  // Filtered orders for compact list
  const filteredOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime())
      .filter(order => {
      const status = (order.status || "Pending").toUpperCase();
      const matchesFilter = 
        statusFilter === "ALL" ||
        (statusFilter === "PENDING" && status === "PENDING") ||
        (statusFilter === "PROCESSING" && status === "PROCESSING") ||
        (statusFilter === "COMPLETED" && status === "COMPLETED");

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
    <div className="w-full bg-gray-50 flex justify-center py-[4.8px]">
      <div 
        className="w-full max-w-[760px] min-h-[calc(100vh-120px)] bg-white shadow-sm border-x border-slate-200 overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* ================= MODAL HEADER ================= */}
        <div className="border-b border-gray-100 bg-white px-5 py-4 sticky top-0 z-30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedOrderId && (
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
              <div className="text-xs text-gray-500 font-mono">
                {selectedOrderId ? "ORDER DETAILS" : "MY PURCHASES"}
              </div>
              <h2 className="text-lg font-heading font-bold text-gray-900 tracking-wide uppercase mt-0.5">
                {selectedOrderId ? `ORDER #${selectedOrder?.orderNumber || selectedOrder?.id}` : "ORDER HISTORY"}
              </h2>
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
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* ----------------- VIEW 1: COMPACT ORDER LIST ----------------- */}
          {!selectedOrderId ? (
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
                  {(["ALL", "PENDING", "PROCESSING", "COMPLETED", "EXPIRED"] as const).map(tab => (
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
                        : "You haven't placed any orders yet. Add items to your cart to checkout."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredOrders.map((order) => {
                    const status = order.status || "Pending";
                    const isPending = status === "Pending";
                    const isProcessing = status === "Processing";
                    const isCompleted = status === "Completed";
                    const isExpired = String(status).toUpperCase() === "EXPIRED";
                    const canUpload = canUploadPaymentProof(order);
                    const itemCount = Array.isArray(order.items) ? order.items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0) : 0;
                    const itemsSummary = Array.isArray(order.items) ? order.items.map((it: any) => it.name).filter(Boolean).join(", ") : "Items";

                    return (
                      <div
                        key={order.id || order.orderNumber}
                        onClick={() => setSelectedOrderId(order.id || order.orderNumber)}
                        className="p-3.5 bg-white border border-gray-200 hover:border-slate-900 rounded-xl transition-all cursor-pointer shadow-xs hover:shadow-sm active:scale-[0.99] flex flex-col gap-2.5 group"
                      >
                        {/* Row 1: Order Identifier & Status */}
                        <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-slate-950">
                              #{order.orderNumber || order.id}
                            </span>
                            <span className="text-[10px] font-mono text-gray-400">
                              {order.createdAt ? new Date(order.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : "Recent"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border ${
                                                isExpired
                                  ? "bg-slate-100 text-slate-600 border-slate-200"
                                  : isPending
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : isProcessing
                                  ? "bg-blue-50 text-blue-800 border-blue-200"
                                  : "bg-emerald-50 text-emerald-800 border-emerald-200"
                              }`}
                            >
                              {status}
                            </span>
                          </div>
                        </div>

                        {/* Row 2: Items Preview & Thumbnails */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {/* Thumbnails preview */}
                            <div className="flex -space-x-2 shrink-0">
                              {Array.isArray(order.items) && order.items.slice(0, 3).map((it: any, i: number) => (
                                <img
                                  key={i}
                                  src={it.imageUrl || "https://picsum.photos/seed/prime/80"}
                                  alt={it.name || "Item"}
                                  className="w-8 h-8 rounded-lg object-cover bg-gray-100 border border-white shadow-2xs"
                                />
                              ))}
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs font-heading font-medium text-gray-900 truncate">
                                {itemsSummary}
                              </p>
                              <p className="text-[10px] font-mono text-gray-500">
                                {itemCount} {itemCount === 1 ? "item" : "items"} • {order.courier?.name ? order.courier.name : "Courier Delivery"}
                              </p>
                            </div>
                          </div>

                          {/* Row 3: Amount and Action indicator */}
                          <div className="text-right shrink-0">
                            {Number(order.storeCreditsUsed || 0) > 0 && (
                              <span className="mb-1 inline-flex items-center justify-end gap-1 px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-[9px] font-mono font-bold uppercase text-emerald-700">
                                Credits Applied
                              </span>
                            )}
                            <span className="font-mono font-bold text-sm text-slate-950 block">
                              {formatPHP(
                                order.deliveryFeePaymentMethod === "upon_delivery"
                                  ? (order.payableNow !== undefined 
                                      ? Number(order.payableNow) 
                                      : (Number(order.totalAmount || 0) > Number(order.deliveryFee || 0) 
                                          ? Number(order.totalAmount || 0) - Number(order.deliveryFee || 0) 
                                          : Number(order.totalAmount || 0)))
                                  : (order.totalAmount || order.payableNow || 0)
                              )}
                            </span>
                            {canUpload && directReceiptOrderId !== (order.id || order.orderNumber) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDirectReceiptUploader(order);
                                }}
                                className="mb-1 text-[9px] font-mono font-bold uppercase tracking-wider text-slate-700 hover:text-black flex items-center justify-end gap-1"
                              >
                                <Upload className="w-3 h-3" />
                                <span>Upload Receipt</span>
                              </button>
                            )}
                            <span className="text-[10px] font-mono text-slate-500 group-hover:text-black flex items-center justify-end gap-0.5 mt-0.5">
                              <span>Details</span>
                              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </span>
                          </div>
                        </div>

                        {/* Direct receipt uploader from order history */}
                        {directReceiptOrderId === (order.id || order.orderNumber) && canUpload && (
                          <div
                            className="pt-2 border-t border-dashed border-slate-200 space-y-2.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {proofError && (
                              <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-[10px] font-mono text-red-700 flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>{proofError}</span>
                              </div>
                            )}

                            {proofSuccess ? (
                              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <div>
                                  <p className="text-[10px] font-mono font-bold text-emerald-900 uppercase">Receipt Submitted</p>
                                  <p className="text-[9px] font-mono text-emerald-700">Pending manual payment review.</p>
                                </div>
                              </div>
                            ) : (
                              <>
                                {paymentMethods.length > 0 && !order.paymentMethodId && !order.paymentMethodName && (
                                  <select
                                    value={selectedPaymentMethod?.id || ""}
                                    onChange={(e) => {
                                      const m = paymentMethods.find((item: any) => String(item.id) === String(e.target.value));
                                      setSelectedPaymentMethod(m || null);
                                    }}
                                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono text-slate-900 focus:outline-none focus:border-slate-900"
                                  >
                                    <option value="">SELECT PAYMENT METHOD</option>
                                    {paymentMethods.map((m: any) => (
                                      <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                  </select>
                                )}

                                <label className="flex items-center justify-center gap-2 w-full px-3 py-2 border border-dashed border-slate-300 hover:border-slate-900 rounded-lg bg-slate-50 hover:bg-white cursor-pointer transition-colors">
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/heic"
                                    onChange={handleProofFileChange}
                                    className="hidden"
                                    disabled={isDirectReceiptUploading}
                                  />
                                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                                  <span className="text-[10px] font-mono font-bold uppercase text-slate-600">
                                    {proofImage ? "Receipt Selected — Click to Change" : "Upload Payment Receipt"}
                                  </span>
                                </label>

                                {proofImage && (
                                  <div className="flex items-center gap-2">
                                    <img src={proofImage} alt="Receipt preview" className="w-12 h-12 object-cover rounded-md border border-slate-200 bg-white" />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const targetOrder = orders.find((o: any) => o.id === directReceiptOrderId || o.orderNumber === directReceiptOrderId);
                                        submitDirectReceipt(targetOrder);
                                      }}
                                      disabled={isDirectReceiptUploading || !proofImage || (paymentMethods.length > 0 && !selectedPaymentMethod && !order.paymentMethodId && !order.paymentMethodName)}
                                      className="flex-1 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-[10px] font-heading font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                                    >
                                      {isDirectReceiptUploading ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Check className="w-3.5 h-3.5" />
                                      )}
                                      {isDirectReceiptUploading ? "Uploading..." : "Submit Receipt"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDirectReceiptOrderId(null);
                                        setProofImage("");
                                        setProofError("");
                                      }}
                                      className="px-2.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[10px] font-mono font-bold"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}

                        {/* Live Tracking Indicator Pill if present */}
                        {order.trackingUrl && (
                          <div className="pt-1.5 border-t border-dashed border-blue-100 flex items-center justify-between text-[10px] font-mono text-blue-700 bg-blue-50/50 -mx-3.5 -mb-3.5 px-3.5 py-1.5 rounded-b-xl">
                            <span className="flex items-center gap-1 font-bold">
                              <Truck className="w-3 h-3 text-blue-600" />
                              <span>Live Courier Tracking Active</span>
                            </span>
                            <span className="text-blue-900 font-bold uppercase underline">
                              Track &rarr;
                            </span>
                          </div>
                        )}
                      </div>
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                    <div>
                      <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400 font-bold">
                        Order Identifier
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <h3 className="text-lg font-heading font-bold text-slate-900">
                          #{selectedOrder.orderNumber || selectedOrder.id}
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
                      <p className="text-[11px] font-mono text-slate-500">
                        Placed on {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString() : "Recent"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <span
                        className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider border ${
                          selectedOrder.status === "Pending"
                            ? "bg-amber-100 text-amber-900 border-amber-300"
                            : selectedOrder.status === "Processing"
                            ? "bg-blue-100 text-blue-900 border-blue-300"
                            : "bg-emerald-100 text-emerald-900 border-emerald-300"
                        }`}
                      >
                        {selectedOrder.status || "Pending"}
                      </span>
                    </div>
                  </div>

                  {/* 3-Step Lifecycle Visual Progress */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase text-slate-500">
                      <span>Order Placed</span>
                      <span>Processing &amp; Pack</span>
                      <span>Completed / Delivered</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {(() => {
                        const status = selectedOrder.status || "Pending";
                        const stepIndex = status === "Completed" ? 2 : status === "Processing" ? 1 : 0;

                        return [0, 1, 2].map((idx) => {
                          const isDone = idx <= stepIndex;
                          const isCurrent = idx === stepIndex;
                          return (
                            <div
                              key={idx}
                              className={`h-2 rounded-full transition-colors ${
                                isDone
                                  ? idx === 2
                                    ? "bg-emerald-600"
                                    : idx === 1
                                    ? "bg-blue-600"
                                    : "bg-amber-500"
                                  : "bg-slate-200"
                              }`}
                            />
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>

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
                          Live tracking link from courier is ready
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
                      <span>Track Live Shipment</span>
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
                        <div key={idx} className="p-2 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={item.imageUrl || "https://picsum.photos/seed/prime/100"}
                              alt={item.name}
                              className="w-10 h-10 object-cover rounded-lg bg-white border border-gray-200 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-heading font-medium uppercase text-gray-900 truncate">
                                  {item.name}
                                </p>
                                {isFree && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                                    FREE
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-mono text-gray-500">
                                {item.quantity || 1} × {isFree ? "FREE" : formatPHP(item.price || 0)}
                                {(item.selectedVariant?.name || item.variantName || (item.variantId && item.variantId !== "default")) && (
                                  <span className="text-gray-400"> • {item.selectedVariant?.name || item.variantName || item.variantId}</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <span className={`font-mono font-semibold shrink-0 ${isFree ? "text-emerald-600 font-bold" : "text-gray-900"}`}>
                            {isFree ? "FREE" : formatPHP((Number(item.price) || 0) * (Number(item.quantity) || 1))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Financial Breakdown & Charges */}
                <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-2 font-mono text-xs">
                  <h4 className="font-heading font-bold uppercase tracking-wider text-gray-900 border-b border-gray-100 pb-2">
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
                    <span className="font-semibold text-gray-900 font-ibm-condensed">
                      {formatPHP(selectedOrder.subTotal || selectedOrder.subtotal || selectedOrder.itemsSubtotal || selectedOrder.items?.reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0) || 0)}
                    </span>
                  </div>

                  {/* Charges list if present */}
                  {Array.isArray(selectedOrder.appliedCharges || selectedOrder.charges) && (selectedOrder.appliedCharges || selectedOrder.charges).map((ch: any, i: number) => {
                    const isChFree = Boolean(ch.isFree || Number(ch.computedAmount || ch.amount) === 0);
                    return (
                      <div key={i} className="flex justify-between items-center text-gray-600">
                        <span>{ch.name}:</span>
                        <span className={`font-semibold font-ibm-condensed ${isChFree ? "text-emerald-600 font-bold" : "text-gray-900"}`}>
                          {isChFree ? "WAIVED / FREE" : formatPHP(ch.computedAmount || ch.amount || 0)}
                        </span>
                      </div>
                    );
                  })}

                  {/* Store Credits Applied */}
                  {Number(selectedOrder.storeCreditsUsed || 0) > 0 && (
                    <div className="flex justify-between items-center text-gray-600">
                      <span>Store Credits Applied:</span>
                      <span className="font-semibold text-emerald-700 font-ibm-condensed">
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
                      <span className="font-bold text-emerald-600 font-ibm-condensed">WAIVED / FREE</span>
                    ) : (
                      <span className="font-semibold text-gray-900 font-ibm-condensed">
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
                <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-3">
                  {selectedOrder.paymentDeadlineAt && selectedOrder.status === "Pending" && !selectedOrder.paymentProofImage && (
                    <p className="text-[10px] font-mono text-amber-700">
                      Payment proof deadline: {formatPaymentDeadline(selectedOrder)}
                    </p>
                  )}

                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <div>
                      <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-gray-900">
                        Payment Status &amp; Receipt Proof
                      </h4>
                      <p className="text-[11px] font-mono text-gray-500">
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
                        onClick={() => setReceiptViewerUrl(String(selectedOrder.paymentProofImage))}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-lg text-[11px] font-heading font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        <Receipt className="w-4 h-4" />
                        View Uploaded Receipt
                      </button>
                    </div>
                  ) : canUploadPaymentProof(selectedOrder) ? (
                    /* If order is still Pending, unpaid, and within the payment window, allow customer to upload receipt */
                    <div className="space-y-3 pt-1">
                      <p className="text-xs font-mono text-gray-600">
                        Please upload your payment screenshot or receipt to speed up order verification:
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
                                  <button
                                    key={method.id}
                                    type="button"
                                    disabled={isOffline}
                                    onClick={() => {
                                      if (isOffline) return;
                                      setSelectedPaymentMethod(method);
                                      setProofSuccess(false);
                                      setProofError("");
                                      setProofImage("");
                                    }}
                                    className={`group w-full aspect-video border transition-all flex items-center justify-center p-0 relative overflow-hidden bg-white select-none rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-8px_18px_rgba(15,23,42,0.05),0_2px_6px_rgba(15,23,42,0.08)] ${isOffline ? "border-red-200/70 bg-slate-100 cursor-not-allowed opacity-90" : isSelected ? "border-slate-900 shadow-sm ring-1 ring-slate-900 cursor-pointer" : "border-gray-200 bg-white hover:border-gray-300 cursor-pointer"}`}
                                    title={isOffline ? `${method.name} is currently offline` : method.name}
                                  >
                                    {method.logo ? (
                                      <img
                                        src={method.logo}
                                        alt={method.name}
                                        className={`absolute inset-0 z-[2] w-full h-full object-fill transition-transform duration-200 ${isOffline ? "filter blur-[1px] opacity-40 grayscale-[30%]" : ""}`}
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <CreditCard className={`relative z-[2] w-5 h-5 text-gray-400 ${isOffline ? "filter blur-[1px] opacity-40" : ""}`} />
                                    )}
                                    {!isOffline && (
                                      <div className="absolute inset-0 z-[5] pointer-events-none bg-gradient-to-br from-white/75 via-white/15 to-transparent opacity-90" />
                                    )}
                                    {!isOffline && (
                                      <div className="absolute inset-x-3 top-1.5 z-[6] h-1/3 rounded-t-xl pointer-events-none bg-gradient-to-b from-white/70 to-transparent" />
                                    )}
                                    {isOffline && (
                                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[0.5px]">
                                        <span className="font-heading font-black text-[9px] text-red-500 uppercase tracking-widest bg-red-950/90 border border-red-500/70 px-1.5 py-0.5 rounded leading-none">
                                          OFFLINE
                                        </span>
                                      </div>
                                    )}
                                    <span className="absolute inset-x-1 bottom-1 z-[8] px-1 text-[8px] font-heading font-bold uppercase truncate text-center text-slate-900 bg-white/85">
                                      {method.name}
                                    </span>
                                  </button>
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

                              {(selectedPaymentMethod.qrCodeImage || selectedPaymentMethod.qrCode || selectedPaymentMethod.qrImage || selectedPaymentMethod.qr_code_image) && (
                                <div className="border border-slate-200 p-2 text-center">
                                  <span className="block text-[8px] uppercase text-slate-400 font-bold mb-2">Payment QR</span>
                                  <img
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
                              <button
                                type="button"
                                onClick={handleSubmitProof}
                                disabled={isSubmittingProof || !selectedPaymentMethod}
                                className="w-full py-2.5 bg-black hover:bg-neutral-800 text-white font-heading font-bold uppercase tracking-wider text-xs rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                              >
                                {isSubmittingProof ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Submitting Receipt...</span></> : <><Check className="w-4 h-4" /><span>Submit Receipt for Verification</span></>}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
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
