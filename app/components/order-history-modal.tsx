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

      // Fetch from API
      const url = customerId ? `/api/orders?customerId=${encodeURIComponent(customerId)}&_t=${Date.now()}` : `/api/orders?_t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      
      let serverOrders: any[] = [];
      if (res.ok) {
        serverOrders = await res.json();
      }

      // Merge with locally persisted orders from localStorage
      let localOrders: any[] = [];
      if (typeof window !== "undefined") {
        try {
          localOrders = JSON.parse(localStorage.getItem("prime_customer_orders") || "[]");
        } catch (e) {}
      }

      // Map by ID/orderNumber to avoid duplicates, with server data taking precedence
      const orderMap = new Map<string, any>();
      
      // Add local first
      localOrders.forEach(o => {
        const key = o.id || o.orderNumber;
        if (key) orderMap.set(key, o);
      });

      // Add/overwrite with server
      serverOrders.forEach(o => {
        const key = o.id || o.orderNumber;
        if (key) orderMap.set(key, o);
      });

      const combined = Array.from(orderMap.values());
      // Sort newest first
      combined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      setOrders(combined);
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

    if (file.size > 5 * 1024 * 1024) {
      setProofError("Image file size must be less than 5MB.");
      return;
    }

    setIsUploadingProof(true);
    setProofError("");

    const reader = new FileReader();
    reader.onload = () => {
      setProofImage(reader.result as string);
      setIsUploadingProof(false);
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
    if (!proofImage) {
      setProofError("Please upload a screenshot or photo of your payment receipt.");
      return;
    }

    setIsSubmittingProof(true);
    setProofError("");
    setProofSuccess(false);

    try {
      const res = await authenticatedFetch("/api/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          paymentMethodId: selectedPaymentMethod?.id || "",
          paymentMethodName: selectedPaymentMethod?.name || "Manual Payment",
          paymentProofImage: proofImage
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
            paymentProofImage: proofImage,
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
              paymentProofImage: proofImage,
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

  // Filtered orders for compact list
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
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
    <div className="w-full bg-gray-50 flex justify-center py-3 sm:py-5">
      <div 
        className="bg-white w-full max-w-[760px] rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col"
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
                  setProofSuccess(false);
                  setProofImage("");
                  setProofError("");
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
                  {(["ALL", "PENDING", "PROCESSING", "COMPLETED"] as const).map(tab => (
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
                                isPending
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
                            <span className="text-[10px] font-mono text-slate-500 group-hover:text-black flex items-center justify-end gap-0.5 mt-0.5">
                              <span>Details</span>
                              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </span>
                          </div>
                        </div>

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
                                {item.selectedVariant && (
                                  <span className="text-gray-400"> • {item.selectedVariant.name || item.selectedVariant}</span>
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

                  {/* If proof already exists, show it */}
                  {selectedOrder.paymentProofImage ? (
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                      <span className="text-[10px] font-mono text-gray-400 uppercase font-bold block">
                        Uploaded Payment Receipt
                      </span>
                      <a
                        href={selectedOrder.paymentProofImage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block relative group rounded-lg overflow-hidden border border-gray-300"
                      >
                        <img
                          src={selectedOrder.paymentProofImage}
                          alt="Payment Proof"
                          className="w-32 h-32 object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-mono">
                          View Full
                        </div>
                      </a>
                    </div>
                  ) : selectedOrder.status === "Pending" ? (
                    /* If order is still Pending and no proof uploaded, allow customer to upload receipt */
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
                          {/* Payment Method Selector if multiple */}
                          {paymentMethods.length > 0 && (
                            <div className="space-y-1">
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-heading">
                                Payment Method Used
                              </label>
                              <select
                                value={selectedPaymentMethod?.id || ""}
                                onChange={(e) => {
                                  const m = paymentMethods.find(p => p.id === e.target.value);
                                  setSelectedPaymentMethod(m || null);
                                }}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-black"
                              >
                                <option value="" disabled>-- Select Payment Method --</option>
                                {paymentMethods.map(m => (
                                  <option key={m.id} value={m.id} disabled={m.isActive === false}>
                                    {m.name} {m.isActive === false ? "(OFFLINE)" : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Selected Method Details if Manual Transfer */}
                          {selectedPaymentMethod && selectedPaymentMethod.paymentType === "manual_transfer" && (
                            <div className="p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl space-y-2 text-left">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 font-heading block">
                                Transfer Account Details
                              </span>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div className="p-2 bg-white rounded-lg border border-amber-200/50 flex items-center justify-between">
                                  <div className="min-w-0 flex-1 mr-2">
                                    <span className="text-[9px] uppercase text-gray-400 font-bold block">Account Name</span>
                                    <span className="font-heading font-bold text-gray-900 truncate block text-xs">
                                      {selectedPaymentMethod.accountName || "Official Account"}
                                    </span>
                                  </div>
                                  {selectedPaymentMethod.accountName && (
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(selectedPaymentMethod.accountName, "acc_name")}
                                      className="px-2 py-1 bg-amber-100/70 hover:bg-amber-200/70 text-amber-900 rounded text-[10px] font-mono font-bold shrink-0 transition-colors"
                                    >
                                      {copiedKey === "acc_name" ? "Copied!" : "Copy"}
                                    </button>
                                  )}
                                </div>

                                <div className="p-2 bg-white rounded-lg border border-amber-200/50 flex items-center justify-between">
                                  <div className="min-w-0 flex-1 mr-2">
                                    <span className="text-[9px] uppercase text-gray-400 font-bold block">Account / Mobile Number</span>
                                    <span className="font-mono font-bold text-gray-900 truncate block text-xs">
                                      {selectedPaymentMethod.accountNumber || "—"}
                                    </span>
                                  </div>
                                  {selectedPaymentMethod.accountNumber && (
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(selectedPaymentMethod.accountNumber, "acc_num")}
                                      className="px-2 py-1 bg-amber-100/70 hover:bg-amber-200/70 text-amber-900 rounded text-[10px] font-mono font-bold shrink-0 transition-colors"
                                    >
                                      {copiedKey === "acc_num" ? "Copied!" : "Copy"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* File input for proof */}
                          <div className="space-y-2">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-heading">
                              Upload Proof of Payment (Receipt / Screenshot)
                            </label>
                            
                            <label className="border-2 border-dashed border-gray-300 hover:border-black rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer bg-gray-50 transition-colors">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleProofFileChange}
                                className="hidden"
                              />
                              {proofImage ? (
                                <div className="flex flex-col items-center gap-2">
                                  <img
                                    src={proofImage}
                                    alt="Selected Proof"
                                    className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                                  />
                                  <span className="text-[11px] font-mono text-emerald-700 font-bold">
                                    ✓ Image Selected (Click to change)
                                  </span>
                                </div>
                              ) : (
                                <>
                                  <Upload className="w-6 h-6 text-gray-400" />
                                  <span className="text-xs font-mono text-gray-600 font-medium">
                                    Click or drag to select receipt image
                                  </span>
                                  <span className="text-[10px] font-mono text-gray-400">
                                    Supports JPG, PNG up to 5MB
                                  </span>
                                </>
                              )}
                            </label>

                            {proofImage && (
                              <button
                                type="button"
                                onClick={handleSubmitProof}
                                disabled={isSubmittingProof}
                                className="w-full py-2.5 bg-black hover:bg-neutral-800 text-white font-heading font-bold uppercase tracking-wider text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                              >
                                {isSubmittingProof ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Submitting Receipt...</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-4 h-4" />
                                    <span>Submit Receipt for Verification</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          )}
        </div>

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
