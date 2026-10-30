"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Clock3, Download, ExternalLink, Eye, Loader2, Minus, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, Truck, X } from "lucide-react";
import { formatPHP } from "@/lib/currency";
import { callServerless, getTelegramServerlessSession, resolveTelegramMedia } from "@/lib/telegram-serverless-client";

type ServerlessOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerId: string;
  tgUserId: string;
  telegramName: string;
  telegramUsername: string;
  primeMemberId: string;
  items: any[];
  subtotal: number;
  discountAmount: number;
  staffDiscountAmount: number;
  staffDiscountMode: string;
  staffDiscountValue: number;
  staffEditVersion: number;
  pointsDiscount: number;
  storeCreditsUsed: number;
  promoShippingSubsidy: number;
  appliedPromoCode: string;
  chargesBreakdown: any[];
  totalAmount: number;
  payableNow: number;
  payableOnDelivery: number;
  deliveryFee: number;
  status: string;
  paymentStatus: string;
  confirmedPaidAmount: number | null;
  paymentReceivedAmount: number | null;
  paymentMethodName: string;
  paymentProofImage: string;
  ocrAnalysis: any;
  adjustmentDue: number;
  adjustmentRevisedTotal: number | null;
  adjustmentStatus: string;
  readyCreditDue: number;
  readyCreditIssuedAmount: number;
  adjustmentPaymentMethodName: string;
  adjustmentProofImage: string;
  reviewStatus: string;
  deliveryAddress: any;
  courierName: string;
  trackingNumber: string;
  trackingUrl: string;
  notes: string;
  fingerprintSnapshot: Record<string, any>;
  createdAt: any;
  readyAt: any;
  paymentDeadlineAt: any;
  expiredAt: any;
  dispatchedAt: any;
  deliveredAt: any;
};

type RawOrder = Record<string, any>;

function field(row: RawOrder, camel: string, snake: string, fallback: any = "") {
  return row[camel] ?? row[snake] ?? fallback;
}

function normalizeOrder(row: RawOrder): ServerlessOrder {
  let items = field(row, "items", "items", []);
  if (typeof items === "string") {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  let fingerprintSnapshot = field(row, "fingerprintSnapshot", "fingerprint_snapshot", {});
  if (typeof fingerprintSnapshot === "string") { try { fingerprintSnapshot = JSON.parse(fingerprintSnapshot); } catch { fingerprintSnapshot = {}; } }
  return {
    id: String(field(row, "id", "id")),
    orderNumber: String(field(row, "orderNumber", "order_number")),
    customerName: String(field(row, "customerName", "customer_name", "Customer")),
    customerPhone: String(field(row, "customerPhone", "customer_phone")),
    customerId: String(field(row, "customerId", "customer_id")),
    tgUserId: String(field(row, "tgUserId", "tg_user_id")),
    telegramName: String(field(row, "telegramName", "telegram_name")),
    telegramUsername: String(field(row, "telegramUsername", "telegram_username")),
    primeMemberId: String(field(row, "primeMemberId", "prime_member_id")),
    items: Array.isArray(items) ? items : [],
    subtotal: Number(field(row, "subtotal", "subtotal", 0)) || 0,
    discountAmount: Number(field(row, "discountAmount", "discount_amount", 0)) || 0,
    staffDiscountAmount: Number(field(row, "staffDiscountAmount", "staff_discount_amount", 0)) || 0,
    staffDiscountMode: String(field(row, "staffDiscountMode", "staff_discount_mode", "none")),
    staffDiscountValue: Number(field(row, "staffDiscountValue", "staff_discount_value", 0)) || 0,
    staffEditVersion: Number(field(row, "staffEditVersion", "staff_edit_version", 0)) || 0,
    pointsDiscount: Number(field(row, "pointsDiscount", "points_discount", 0)) || 0,
    storeCreditsUsed: Number(field(row, "storeCreditsUsed", "store_credits_used", 0)) || 0,
    promoShippingSubsidy: Number(field(row, "promoShippingSubsidy", "promo_shipping_subsidy", 0)) || 0,
    appliedPromoCode: String(field(row, "appliedPromoCode", "applied_promo_code")),
    chargesBreakdown: (() => {
      const value = field(row, "chargesBreakdown", "charges_breakdown", []);
      if (Array.isArray(value)) return value;
      if (typeof value === "string") { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
      return [];
    })(),
    totalAmount: Number(field(row, "totalAmount", "total_amount", 0)) || 0,
    payableNow: Number(field(row, "payableNow", "payable_now", 0)) || 0,
    payableOnDelivery: Number(field(row, "payableOnDelivery", "payable_on_delivery", 0)) || 0,
    deliveryFee: Number(field(row, "deliveryFee", "delivery_fee", 0)) || 0,
    status: String(field(row, "status", "status", "Pending")),
    paymentStatus: String(field(row, "paymentStatus", "payment_status", "Unpaid")),
    confirmedPaidAmount: field(row, "confirmedPaidAmount", "confirmed_paid_amount", null) == null ? null : Number(field(row, "confirmedPaidAmount", "confirmed_paid_amount", null)),
    paymentReceivedAmount: field(row, "paymentReceivedAmount", "payment_received_amount", null) == null ? null : Number(field(row, "paymentReceivedAmount", "payment_received_amount", null)),
    paymentMethodName: String(field(row, "paymentMethodName", "payment_method_name")),
    paymentProofImage: String(field(row, "paymentProofImage", "payment_proof_image")),
    ocrAnalysis: (() => { const value = field(row, "ocrAnalysis", "ocr_analysis", null); if (typeof value === "string") { try { return JSON.parse(value); } catch { return null; } } return value && typeof value === "object" ? value : null; })(),
    adjustmentDue: Number(field(row, "adjustmentDue", "adjustment_due", 0)) || 0,
    adjustmentRevisedTotal: Number(field(row, "adjustmentRevisedTotal", "adjustment_revised_total", 0)) || null,
    adjustmentStatus: String(field(row, "adjustmentStatus", "adjustment_status", "none")),
    readyCreditDue: Number(field(row, "readyCreditDue", "ready_credit_due", 0)) || 0,
    readyCreditIssuedAmount: Number(field(row, "readyCreditIssuedAmount", "ready_credit_issued_amount", 0)) || 0,
    adjustmentPaymentMethodName: String(field(row, "adjustmentPaymentMethodName", "adjustment_payment_method_name")),
    adjustmentProofImage: String(field(row, "adjustmentProofImage", "adjustment_proof_image")),
    reviewStatus: String(field(row, "reviewStatus", "review_status")),
    deliveryAddress: field(row, "deliveryAddress", "delivery_address", {}),
    courierName: String(field(row, "courierName", "courier_name")),
    trackingNumber: String(field(row, "trackingNumber", "tracking_number")),
    trackingUrl: String(field(row, "trackingUrl", "tracking_url")),
    notes: String(field(row, "notes", "notes")),
    fingerprintSnapshot: fingerprintSnapshot && typeof fingerprintSnapshot === "object" ? fingerprintSnapshot : {},
    createdAt: field(row, "createdAt", "created_at", null),
    readyAt: field(row, "readyAt", "ready_at", null),
    paymentDeadlineAt: field(row, "paymentDeadlineAt", "payment_deadline_at", null),
    expiredAt: field(row, "expiredAt", "expired_at", null),
    dispatchedAt: field(row, "dispatchedAt", "dispatched_at", null),
    deliveredAt: field(row, "deliveredAt", "delivered_at", null),
  };
}

function unpackOrderList(response: unknown): { rows: RawOrder[]; warning: string } | null {
  let current: any = response;
  for (let depth = 0; depth < 5; depth += 1) {
    if (Array.isArray(current)) {
      return current.every((row) => row && typeof row === "object" && !Array.isArray(row))
        ? { rows: current, warning: "" }
        : null;
    }
    if (!current || typeof current !== "object") return null;
    const warning = String(current.reconciliationWarning || current.warning || "");
    if (Array.isArray(current.orders)) {
      return current.orders.every((row: unknown) => row && typeof row === "object" && !Array.isArray(row))
        ? { rows: current.orders, warning }
        : null;
    }
    const nested = current.data ?? current.result ?? current.payload ?? current.response;
    if (nested === undefined) return null;
    current = nested;
  }
  return null;
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

function displayDate(value: any) {
  const ms = timestampMs(value);
  return ms === null ? "—" : new Date(ms).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
}

function paymentDeadlineMs(order: ServerlessOrder): number | null {
  const explicit = timestampMs(order.paymentDeadlineAt);
  if (explicit !== null) return explicit;
  const created = timestampMs(order.createdAt);
  if (created !== null) return created + 60 * 60 * 1000;
  return timestampMs(order.expiredAt);
}

function addressText(value: any) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "Address not provided";
  return String(value.formatted || value.fullAddress || value.address || [
    value.unitDetails || value.unit || value.houseNumber,
    value.street || value.streetAddress,
    value.barangay || value.subdivision,
    value.city,
    value.province || value.region,
    value.zipCode || value.postalCode,
  ].filter(Boolean).join(", ") || "Address not provided");
}

function lifecycleInfo(order: ServerlessOrder) {
  const status = order.status.toLowerCase();
  const payment = order.paymentStatus.toLowerCase();
  if (status === "expired") return {
    tone: "expired", title: "Payment window expired",
    message: "No receipt was submitted before the one-hour payment deadline. The order cannot proceed; inventory and eligible promo holds are released.",
  };
  if (["completed", "delivered"].includes(status)) return {
    tone: "complete", title: "Order completed",
    message: "Delivery or fulfillment has been recorded. No further staff action is available for this order.",
  };
  if (status === "dispatched") return {
    tone: "active", title: "With courier",
    message: "The order remains with the courier until delivery is confirmed. Record completion when the customer confirms receipt or staff verifies delivery.",
  };
  if (status === "pending" && payment === "pending review") return {
    tone: "review", title: "Payment needs manual review",
    message: order.staffEditVersion > 0
      ? `The order was edited before payment approval. Check the attached receipt against the provider transaction and the revised amount of ${formatPHP(order.payableNow)}. Approve only if the verified payment covers the amount due; any excess is issued as Store Credits. Approval moves the order to Processing.`
      : `Compare the receipt with the provider transaction for ${formatPHP(order.payableNow)} before approving payment. Approval moves the order to Processing.`,
  };
  if (status === "pending" && payment === "unpaid" && order.staffEditVersion > 0) return {
    tone: "waiting", title: "Edited order · waiting for payment",
    message: `The revised amount due is ${formatPHP(order.payableNow)}. No receipt is attached yet, so the order stays Pending. Ask the customer to pay this amount and submit proof. After it arrives, verify the provider payment and approve it to move the order into Processing.`,
  };
  if (status === "pending" && order.payableNow <= 0) return {
    tone: "review", title: "Staff review required · no upfront payment",
    message: order.payableOnDelivery > 0
      ? `Approve the zero upfront balance after checking the order. It will be marked Paid for processing; ${formatPHP(order.payableOnDelivery)} remains due to the courier.`
      : "Approve the zero balance after checking the order; no receipt is expected, and it will be marked Paid for processing.",
  };
  if (status === "pending") return {
    tone: "waiting", title: "Waiting for customer payment",
    message: `A receipt is due by ${displayDate(paymentDeadlineMs(order))}. When submitted, staff must verify the provider transaction before approving.`,
  };
  if (["processing", "ready", "packed"].includes(status)) return {
    tone: "active", title: "In fulfillment",
    message: order.payableOnDelivery > 0 && order.paymentStatus.toLowerCase() === "unpaid"
      ? `Prepare the order and dispatch when handed to the courier. ${formatPHP(order.payableOnDelivery)} remains due on delivery.`
      : "Prepare the order and mark it dispatched when it is handed to the courier.",
  };
  return {
    tone: "waiting", title: order.status || "Order status",
    message: "Review the order details and current payment state before taking further action.",
  };
}

export default function TelegramServerlessOrdersPanel({
  onBack,
  initialOrderId,
}: {
  onBack: () => void;
  initialOrderId?: string | null;
}) {
  const [authorized, setAuthorized] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [orders, setOrders] = useState<ServerlessOrder[]>([]);
  const [publicQueueStats, setPublicQueueStats] = useState<{ ordersInQueue: number; ordersInProcessing: number; averageReadyMinutes: number | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [reconciliationWarning, setReconciliationWarning] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [queueFilter, setQueueFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialOrderId || null);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptZoom, setReceiptZoom] = useState(1);
  const [trackingUrl, setTrackingUrl] = useState("");
  const [verifiedPaidAmount, setVerifiedPaidAmount] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editDiscountMode, setEditDiscountMode] = useState("none");
  const [editDiscountValue, setEditDiscountValue] = useState("0");
  const [editDeliveryFee, setEditDeliveryFee] = useState("0");
  const [editCharges, setEditCharges] = useState<any[]>([]);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [itemDraft, setItemDraft] = useState<any | null>(null);

  const loadOrders = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    setReconciliationWarning("");
    try {
      const [response, queueStats] = await Promise.all([
        callServerless<unknown>("manageOrders", { action: "list" }, 30_000),
        callServerless<{ ordersInQueue?: number; ordersInProcessing?: number; averageReadyMinutes?: number | null }>("getPublicOrderQueue", {}, 10_000).catch(() => null),
      ]);
      const unpacked = unpackOrderList(response);
      if (!unpacked) {
        const shape = response && typeof response === "object" && !Array.isArray(response)
          ? ` Received object fields: ${Object.keys(response).slice(0, 8).join(", ") || "none"}.`
          : ` Received ${Array.isArray(response) ? "an array with invalid rows" : typeof response}.`;
        throw new Error(`The Serverless order list response could not be read.${shape}`);
      }
      setOrders(unpacked.rows.map(normalizeOrder));
      if (queueStats) setPublicQueueStats({
        ordersInQueue: Math.max(0, Number(queueStats.ordersInQueue) || 0),
        ordersInProcessing: Math.max(0, Number(queueStats.ordersInProcessing) || 0),
        averageReadyMinutes: queueStats.averageReadyMinutes == null ? null : Math.max(0, Number(queueStats.averageReadyMinutes) || 0),
      });
      setReconciliationWarning(unpacked.warning);
    } catch (err: any) {
      setError(err?.message || "Could not load Serverless orders.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let current = true;
    getTelegramServerlessSession()
      .then((session) => {
        if (!current) return;
        if (!session?.authenticated || !session?.isAdmin) {
          setError(session?.error || "Verified Telegram admin access is required to manage these orders.");
          return;
        }
        setAuthorized(true);
      })
      .catch((err: any) => {
        if (current) setError(err?.message || "Open the Admin Panel from the PRIME Telegram Mini App.");
      })
      .finally(() => { if (current) setAuthLoading(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (authorized) void loadOrders();
  }, [authorized, loadOrders]);

  useEffect(() => {
    if (!authorized) return;
    const timer = window.setInterval(() => { void loadOrders(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [authorized, loadOrders]);

  useEffect(() => {
    if (initialOrderId) setSelectedId(initialOrderId);
  }, [initialOrderId]);

  useEffect(() => {
    setTrackingUrl("");
    setVerifiedPaidAmount("");
    setReceiptOpen(false);
  }, [selectedId]);

  const selectedOrder = orders.find((order) => order.id === selectedId || order.orderNumber === selectedId) || null;

  useEffect(() => {
    if (selectedOrder?.trackingUrl) setTrackingUrl(selectedOrder.trackingUrl);
  }, [selectedOrder?.id, selectedOrder?.trackingUrl]);

  useEffect(() => {
    if (selectedOrder) setVerifiedPaidAmount(selectedOrder.confirmedPaidAmount == null ? "" : String(selectedOrder.confirmedPaidAmount));
  }, [selectedOrder?.id, selectedOrder?.confirmedPaidAmount, selectedOrder?.payableNow]);

  useEffect(() => {
    let current = true;
    let objectUrl = "";
    setReceiptUrl("");
    if (!selectedOrder?.paymentProofImage) return;
    resolveTelegramMedia(selectedOrder.paymentProofImage)
      .then((url) => {
        if (!current) {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url.startsWith("blob:") ? url : "";
        setReceiptUrl(url);
      })
      .catch(() => { if (current) setReceiptUrl(selectedOrder.paymentProofImage); });
    return () => {
      current = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedOrder?.id, selectedOrder?.paymentProofImage]);

  const queueCounts = useMemo(() => {
    const counts = { queued: 0, review: 0, awaitingPayment: 0, fulfillment: 0, courier: 0, completed: 0 };
    for (const order of orders) {
      const status = order.status.toLowerCase();
      const payment = order.paymentStatus.toLowerCase();
      if (status === "pending" && ["unpaid", "pending review"].includes(payment)) {
        counts.queued += 1;
        if (payment === "pending review" || order.payableNow <= 0) counts.review += 1;
        else if (payment === "unpaid" && order.payableNow > 0 && !order.paymentProofImage) counts.awaitingPayment += 1;
      } else if (status === "processing" && payment === "paid") counts.fulfillment += 1;
      else if (status === "dispatched") counts.courier += 1;
      else if (["completed", "delivered"].includes(status)) counts.completed += 1;
    }
    return counts;
  }, [orders]);
  const totalActiveOrders = (publicQueueStats?.ordersInQueue ?? queueCounts.queued)
    + (publicQueueStats?.ordersInProcessing ?? queueCounts.fulfillment);
  const trafficFlowStatus = totalActiveOrders < 5 ? "LIGHT" : totalActiveOrders < 10 ? "MODERATE" : "HEAVY";
  const trafficFlowClass = trafficFlowStatus === "LIGHT" ? "text-emerald-700"
    : trafficFlowStatus === "MODERATE" ? "text-orange-600" : "text-red-700";

  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus = statusFilter === "all" || order.status.toLowerCase() === statusFilter;
      const status = order.status.toLowerCase();
      const payment = order.paymentStatus.toLowerCase();
      const matchesQueue = queueFilter === "all"
        || (queueFilter === "queue" && status === "pending" && ["unpaid", "pending review"].includes(payment))
        || (queueFilter === "review" && status === "pending" && (payment === "pending review" || order.payableNow <= 0))
        || (queueFilter === "awaiting_payment" && status === "pending" && payment === "unpaid" && order.payableNow > 0 && !order.paymentProofImage)
        || (queueFilter === "fulfillment" && ["processing", "ready", "packed"].includes(status))
        || (queueFilter === "courier" && status === "dispatched")
        || (queueFilter === "completed" && ["completed", "delivered"].includes(status));
      const matchesSearch = !needle || [order.orderNumber, order.telegramName, order.telegramUsername, order.customerName, order.customerPhone,
        order.tgUserId, order.primeMemberId, order.paymentMethodName, order.status]
        .some((value) => String(value || "").toLowerCase().includes(needle));
      return matchesStatus && matchesQueue && matchesSearch;
    });
  }, [orders, search, statusFilter, queueFilter]);

  const runAction = async (order: ServerlessOrder, action: "markPaid" | "approveZeroDue" | "markReady" | "dispatch" | "complete" | "expireUnpaid" | "approveAdjustmentPayment" | "edit", extra: Record<string, any> = {}) => {
    setBusyAction(`${order.id}:${action}`);
    setError("");
    try {
      await callServerless("manageOrders", { action, orderId: order.id, ...extra });
      await loadOrders();
      return true;
    } catch (err: any) {
      setError(err?.message || "The order action could not be completed.");
      return false;
    } finally {
      setBusyAction("");
    }
  };

  const beginEdit = (order: ServerlessOrder) => {
    setEditItems(order.items.map((item: any) => ({ ...item, reservedQuantity: Number(item.quantity) || 1, price: Number(item.originalPrice ?? item.price) || 0, offerMode: item.offerMode || "none", offerValue: Number(item.offerValue) || 0 })));
    setEditDiscountMode(String(order.staffDiscountMode || "none"));
    setEditDiscountValue(String(Number(order.staffDiscountValue) || 0));
    setEditDeliveryFee(String(order.deliveryFee));
    setEditCharges(order.chargesBreakdown.map((charge: any) => ({ name: charge.name, type: charge.type || "fixed", value: Number(charge.rate ?? charge.value) || 0 })));
    setEditingItemIndex(null);
    setItemDraft(null);
    setEditing(true);
  };

  const openItemEditor = (index: number) => {
    const item = editItems[index];
    if (!item) return;
    setEditingItemIndex(index);
    setItemDraft({
      ...item,
      price: String(Number(item.price) || 0),
      quantity: String(Number(item.quantity) || 1),
      offerEnabled: String(item.offerMode || "none") !== "none",
      offerMode: item.offerMode === "fixed" ? "fixed" : item.offerMode === "free" ? "free" : "percent",
      offerValue: String(Number(item.offerValue) || 0),
    });
  };

  const saveItemDraft = () => {
    if (editingItemIndex == null || !itemDraft) return;
    const price = Math.max(0, Number(itemDraft.price) || 0);
    const reservedQuantity = Math.max(1, Number(itemDraft.reservedQuantity) || 1);
    const quantity = Math.min(reservedQuantity, Math.max(1, Math.floor(Number(itemDraft.quantity) || 1)));
    const offerMode = itemDraft.offerEnabled ? String(itemDraft.offerMode || "percent") : "none";
    setEditItems((rows) => rows.map((row, index) => index === editingItemIndex ? {
      ...row,
      price,
      quantity,
      offerMode,
      offerValue: offerMode === "free" || offerMode === "none" ? 0 : Math.max(0, Number(itemDraft.offerValue) || 0),
    } : row));
    setEditingItemIndex(null);
    setItemDraft(null);
  };

  const copyValue = async (value: string, key: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 1800);
    } catch {
      setError("Copy failed. Select and copy the text manually.");
    }
  };

  const payment = selectedOrder?.paymentStatus.toLowerCase() || "";
  const status = selectedOrder?.status.toLowerCase() || "";
  const canVerifyPayment = Boolean(selectedOrder && status === "pending" && payment === "pending review" && selectedOrder.paymentProofImage);
  const canApproveZeroDue = Boolean(selectedOrder && status === "pending" && payment === "unpaid"
    && selectedOrder.payableNow <= 0 && !selectedOrder.paymentProofImage);
  const canReady = Boolean(selectedOrder && status === "processing" && payment === "paid"
    && (selectedOrder.adjustmentDue <= 0 || selectedOrder.adjustmentStatus.toLowerCase() === "paid"));
  const canDispatch = Boolean(selectedOrder && ["ready", "packed"].includes(status)
    && (["paid", "completed"].includes(payment) || selectedOrder.payableNow <= 0)
    && (selectedOrder.adjustmentDue <= 0 || selectedOrder.adjustmentStatus.toLowerCase() === "paid"));
  const canComplete = status === "dispatched";
  const unpaidDeadline = selectedOrder ? paymentDeadlineMs(selectedOrder) : null;
  const canExpireUnpaid = Boolean(selectedOrder && status === "pending" && payment === "unpaid"
    && !selectedOrder.paymentProofImage && unpaidDeadline !== null && unpaidDeadline <= Date.now());
  const lifecycle = selectedOrder ? lifecycleInfo(selectedOrder) : null;
  const receiverName = String(selectedOrder?.deliveryAddress?.receiverName || selectedOrder?.customerName || "");
  const receiverPhone = String(selectedOrder?.deliveryAddress?.receiverPhone || selectedOrder?.customerPhone || "");
  const deliveryNotes = String(selectedOrder?.deliveryAddress?.deliveryNotes || selectedOrder?.deliveryAddress?.notes || selectedOrder?.notes || "");
  const copyField = (label: string, value: string, key: string) => <div className="serverless-order-copy-field"><span>{label}</span>{value ? <button type="button" className="serverless-order-copy-value" onClick={() => void copyValue(value, key)} aria-label={`Copy ${label}`} title="Tap to copy this value">{value}</button> : <strong>—</strong>}{copiedKey === key && <small role="status">Copied</small>}</div>;
  const itemSubtotal = selectedOrder?.subtotal || selectedOrder?.items.reduce((sum, item) =>
    sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0) || 0;
  const chargesTotal = selectedOrder?.chargesBreakdown.reduce((sum, charge) =>
    sum + (Number(charge?.computedAmount ?? charge?.amount) || 0), 0) || 0;
  const editItemSubtotal = editItems.reduce((sum, item) => {
    const price = Number(item.price) || 0;
    const quantity = Number(item.quantity) || 0;
    const mode = String(item.offerMode || "none");
    const value = Number(item.offerValue) || 0;
    const net = mode === "free" ? 0 : mode === "percent" ? price * (100 - value) / 100 : mode === "fixed" ? Math.max(0, price - value) : price;
    return sum + net * quantity;
  }, 0);
  const editOrderDiscount = Math.min(editItemSubtotal, editDiscountMode === "percent"
    ? editItemSubtotal * (Number(editDiscountValue) || 0) / 100
    : editDiscountMode === "fixed" ? Number(editDiscountValue) || 0 : 0);
  const editChargesTotal = editCharges.reduce((sum, charge) => sum + (String(charge.type) === "percentage"
    ? editItemSubtotal * (Number(charge.value) || 0) / 100 : Number(charge.value) || 0), 0);
  const editGrandTotal = Math.max(0, editItemSubtotal - editOrderDiscount - (selectedOrder?.discountAmount || 0)
    - (selectedOrder?.pointsDiscount || 0) + editChargesTotal + (Number(editDeliveryFee) || 0)
    - (selectedOrder?.promoShippingSubsidy || 0));
  const editPayableNow = Math.max(0, editGrandTotal - (selectedOrder?.payableOnDelivery ? Number(editDeliveryFee) || 0 : 0)
    - (selectedOrder?.storeCreditsUsed || 0));
  const discountsTotal = selectedOrder
    ? selectedOrder.discountAmount + selectedOrder.staffDiscountAmount + selectedOrder.pointsDiscount + selectedOrder.promoShippingSubsidy
    : 0;
  const stageIndex = status === "completed" || status === "delivered" ? 3
    : status === "dispatched" ? 2
    : ["processing", "ready", "packed"].includes(status) ? 1 : 0;

  return (
    <section className="serverless-admin-panel serverless-orders-panel text-slate-900" aria-label="Telegram Serverless order management">
      <div className="space-y-2">
        <header className="serverless-panel-header">
          <div className="flex items-center gap-2 min-w-0">
            <button type="button" onClick={selectedOrder ? () => setSelectedId(null) : onBack}
              className="p-2 border border-slate-200 hover:bg-slate-100" aria-label={selectedOrder ? "Back to orders" : "Back to dashboard"}>
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-700 font-bold">
                <ShieldCheck className="w-3.5 h-3.5" /> Verified Telegram staff
              </div>
              <h1 className="font-heading font-black uppercase text-base sm:text-lg truncate">
                {selectedOrder ? `Order #${selectedOrder.orderNumber || selectedOrder.id}` : "Orders"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void loadOrders()} disabled={!authorized || loading || busyAction !== ""}
              className="p-2 border border-slate-200 hover:bg-slate-100 disabled:opacity-50" title="Refresh Serverless orders">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        {authorized && <section aria-label="Orders needing staff attention" className="border-b border-slate-200 bg-slate-50 p-2">
          <h2 className="mb-1.5 font-heading text-xs font-bold uppercase tracking-wider text-slate-700">Work queue</h2>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { key: "review", label: "Check payment", count: queueCounts.review, description: "Receipt or no upfront payment" },
              { key: "awaiting_payment", label: "Waiting for payment", count: queueCounts.awaitingPayment, description: "Customer has not sent a receipt" },
              { key: "fulfillment", label: "Prepare order", count: queueCounts.fulfillment, description: "Payment confirmed" },
              { key: "courier", label: "With courier", count: queueCounts.courier, description: "Delivery in progress" },
            ].map((tile) => <button key={tile.key} type="button"
              onClick={() => { setQueueFilter(queueFilter === tile.key ? "all" : tile.key); setStatusFilter("all"); }}
              aria-pressed={queueFilter === tile.key}
              className={`flex min-h-[68px] min-w-0 flex-col justify-center border px-2.5 py-2 text-left ${queueFilter === tile.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}>
              <span className="flex items-center justify-between gap-2 text-[11px] font-bold leading-tight"><span>{tile.label}</span><strong className="font-mono text-base">{tile.count}</strong></span>
              <small className={`mt-1 text-[10px] leading-tight ${queueFilter === tile.key ? "text-slate-200" : "text-slate-500"}`}>{tile.description}</small>
            </button>)}
          </div>
        </section>}

        {error && <div role="alert" className="border border-red-200 bg-red-50 text-red-800 p-3 text-sm">{error}</div>}
        {reconciliationWarning && <div role="status" className="border border-amber-200 bg-amber-50 text-amber-900 p-3 text-sm">{reconciliationWarning} The order list is still available.</div>}
        {(authLoading || loading) && orders.length === 0 && (
          <div className="bg-white border border-slate-200 p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
        )}

        {!authLoading && !authorized && !error && (
          <div className="bg-white border border-slate-200 p-5 text-sm text-slate-600">Open the Admin Panel from the PRIME Telegram Mini App using the configured staff Telegram account.</div>
        )}

        {authorized && selectedOrder && (
          <div className="serverless-record-list serverless-order-detail">
            <section className={`serverless-order-guidance serverless-order-guidance--${lifecycle?.tone || "waiting"}`}>
              <div className="serverless-order-guidance__badges"><span>Order status: {selectedOrder.status}</span><span>Payment: {selectedOrder.paymentStatus}</span></div>
              <strong>{lifecycle?.title}</strong><p>{lifecycle?.message}</p>
            </section>
            {(selectedOrder.reviewStatus === "Flagged for Forensics Review" || (Array.isArray(selectedOrder.ocrAnalysis?.forensicsFlags) && selectedOrder.ocrAnalysis.forensicsFlags.length > 0)) && <section role="alert" className="border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950">
              <b className="block uppercase tracking-wide">Extra receipt checks needed</b>
              <span>A receipt image may have been reused or changed. This is a review signal, not proof of fraud. Check the payment in the provider account before approving it.</span>
            </section>}
            {(["pending", "processing"].includes(status)) && <details className="serverless-disclosure">
              <summary>Change order items, discount, or delivery fee</summary>
              <div className="serverless-disclosure__body space-y-2">
                <strong className="text-xs uppercase">Staff changes · {selectedOrder.status} / {selectedOrder.paymentStatus}</strong>
                {!editing ? <button type="button" onClick={() => beginEdit(selectedOrder)} className="px-3 py-2 bg-slate-900 text-white text-xs font-bold uppercase">Edit items and charges</button> : <div className="space-y-3">
                  <p className="text-[11px] text-slate-600">Tap the edit button beside an item to change its unit price, reserved quantity, or offer. Item edits stay in this draft until you save the order.</p>
                  <div className="divide-y border border-slate-200 bg-white">
                    {editItems.map((item, index) => {
                      const mode = String(item.offerMode || "none");
                      const unitPrice = Number(item.price) || 0;
                      const offerValue = Number(item.offerValue) || 0;
                      const netPrice = mode === "free" ? 0 : mode === "percent" ? unitPrice * (100 - offerValue) / 100 : mode === "fixed" ? Math.max(0, unitPrice - offerValue) : unitPrice;
                      const quantity = Number(item.quantity) || 1;
                      return <div key={`${item.productId || item.id}-${index}`} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0"><b className="block text-xs text-slate-900">{item.name}</b><small className="mt-1 block text-[10px] text-slate-500">{quantity} × {formatPHP(netPrice)}{mode !== "none" && <span className="ml-1 font-semibold text-emerald-700">· {mode === "free" ? "Free" : mode === "percent" ? `${offerValue}% off` : `${formatPHP(offerValue)} off each`}</span>}</small></div>
                        <div className="flex shrink-0 items-center gap-2"><b className="text-xs">{formatPHP(netPrice * quantity)}</b><button type="button" onClick={() => openItemEditor(index)} className="grid h-9 w-9 place-items-center border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" aria-label={`Edit ${item.name}`}><Pencil className="h-4 w-4" /></button></div>
                      </div>;
                    })}
                  </div>
                  {editItems.length === 0 && <p className="border border-red-200 bg-red-50 p-2 text-xs text-red-800">An order needs at least one item. Cancel or keep an item before saving.</p>}
                  <div className="border-l-4 border-sky-600 bg-sky-50 p-3"><b className="text-xs uppercase">Revised total preview</b><dl className="mt-2 space-y-1 text-xs"><div className="flex justify-between"><dt>Items after item offers</dt><dd>{formatPHP(editItemSubtotal)}</dd></div>{editOrderDiscount > 0 && <div className="flex justify-between"><dt>Order discount</dt><dd>−{formatPHP(editOrderDiscount)}</dd></div>}<div className="flex justify-between"><dt>Charges and delivery</dt><dd>{formatPHP(editChargesTotal + (Number(editDeliveryFee) || 0))}</dd></div><div className="flex justify-between border-t pt-1 font-bold"><dt>Revised order total</dt><dd>{formatPHP(editGrandTotal)}</dd></div><div className="flex justify-between font-bold"><dt>Due before delivery</dt><dd>{formatPHP(editPayableNow)}</dd></div></dl></div>
                  <div className="grid grid-cols-2 gap-2"><label className="text-[11px]">Order discount<select className="w-full border p-2" value={editDiscountMode} onChange={(e) => setEditDiscountMode(e.target.value)}><option value="none">No discount</option><option value="fixed">Fixed PHP</option><option value="percent">Percent</option></select></label>{editDiscountMode !== "none" && <label className="text-[11px]">Discount value<input className="w-full border p-2" type="number" min="0" step="0.01" value={editDiscountValue} onChange={(e) => setEditDiscountValue(e.target.value)} /></label>}<label className="text-[11px]">Delivery fee<input className="w-full border p-2" type="number" min="0" step="0.01" value={editDeliveryFee} onChange={(e) => setEditDeliveryFee(e.target.value)} /></label></div>
                  <div className="space-y-2"><b className="text-xs">Current and additional charges</b><p className="text-[11px] text-slate-600">The saved charge lines are prefilled below. Edit their name/amount, remove a line, or add tax and other charges.</p>{editCharges.map((charge, index) => <div key={index} className="grid grid-cols-[1fr_100px_90px_32px] gap-1"><input aria-label="Charge name" className="border p-2 text-xs" value={charge.name} onChange={(e) => setEditCharges((rows) => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} /><select aria-label="Charge type" className="border p-1 text-xs" value={charge.type} onChange={(e) => setEditCharges((rows) => rows.map((row, i) => i === index ? { ...row, type: e.target.value } : row))}><option value="fixed">Fixed PHP</option><option value="percentage">Percent</option></select><input aria-label="Charge amount" className="border p-2 text-xs" type="number" min="0" step="0.01" value={charge.value} onChange={(e) => setEditCharges((rows) => rows.map((row, i) => i === index ? { ...row, value: e.target.value } : row))} /><button type="button" aria-label="Remove charge" onClick={() => setEditCharges((rows) => rows.filter((_, i) => i !== index))}>×</button></div>)}<button type="button" className="border px-2 py-1 text-xs" onClick={() => setEditCharges((rows) => [...rows, { name: "", type: "fixed", value: "0" }])}>+ Add a charge</button></div>
                  <p className="text-[11px] text-amber-900">Pending: customer must pay the revised due and staff approves it. Processing: verify any top-up before Ready; refund a lower total as Store Credits at Ready.</p>
                  <div className="flex gap-2"><button type="button" disabled={busyAction !== "" || editItems.length === 0} onClick={() => void runAction(selectedOrder, "edit", { expectedVersion: selectedOrder.staffEditVersion, items: editItems, discountMode: editDiscountMode, discountValue: editDiscountValue, deliveryFee: editDeliveryFee, charges: editCharges }).then((saved) => { if (saved) setEditing(false); })} className="px-3 py-2 bg-emerald-700 text-white text-xs font-bold uppercase disabled:opacity-50">Save order changes</button><button type="button" onClick={() => setEditing(false)} className="px-3 py-2 border text-xs font-bold uppercase">Cancel</button></div>
                </div>}
              </div>
            </details>}

            <details className="serverless-disclosure">
              <summary>Optional technical details · device and location</summary>
              <div className="serverless-disclosure__body space-y-3 text-xs">
                <p className="text-slate-600">Use these details only when an order needs extra review. Device and location signals can be incomplete or inaccurate; they do not prove fraud.</p>
                {(() => {
                  const fp = selectedOrder.fingerprintSnapshot || {};
                  const ip = fp.ipLocation || {};
                  const gps = fp.deviceGps || {};
                  const observation = fp.deviceLocationObservation || {};
                  const observationGeo = observation.reverseGeocodingDetails || {};
                  const privacy = ip.privacy || {};
                  const flags = Object.entries(privacy).filter(([, active]) => active === true).map(([name]) => name.replace(/^is/, "").replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).trim());
                  const coords = (lat: unknown, lon: unknown) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) ? `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}` : "Not captured";
                  return <>
                    <div><b className="block uppercase text-slate-700">Device fingerprint</b><div className="mt-1 grid grid-cols-2 gap-2"><div><span>Fingerprint ID</span><strong className="block break-all">{fp.deviceFingerprintId || "Not captured"}</strong></div><div><span>Device / hardware ID</span><strong className="block break-all">{[fp.deviceId, fp.hardwareId].filter(Boolean).join(" · ") || "Not captured"}</strong></div><div><span>Platform / browser</span><strong className="block break-words">{[fp.platform, fp.browser || fp.userAgent].filter(Boolean).join(" · ") || "Not captured"}</strong></div><div><span>Screen / timezone</span><strong className="block break-words">{[fp.screenResolution, fp.timezone].filter(Boolean).join(" · ") || "Not captured"}</strong></div></div></div>
                    <div className="border-t border-slate-200 pt-2"><b className="block uppercase text-slate-700">IP and approximate network location</b><p className="mt-1 break-all"><b>Browser-observed IP:</b> {ip.ip || fp.clientObservedIp || "Not captured"}</p><p className="mt-0.5 text-[10px] text-amber-800">Client-reported IP; network location is approximate and not independently verified.</p><p className="mt-1 break-words"><b>Provider / precision:</b> {[ip.provider, ip.precision].filter(Boolean).join(" · ") || ip.status || "Not available"}</p><p className="break-words"><b>Approximate IP area:</b> {[ip.city, ip.subdivision, ip.country, ip.postalCode].filter(Boolean).join(", ") || "Not available"}</p><p className="break-words"><b>Network:</b> {[ip.isp, ip.asn, ip.ispDomain].filter(Boolean).join(" · ") || "Not available"}</p><p><b>IP coordinates:</b> {coords(ip.latitude, ip.longitude)} · approximate</p><p><b>Privacy flags:</b> {flags.length ? flags.join(", ") : ip.status === "complete" ? "No flags reported" : ip.status || "Not available"}</p></div>
                    <div className="border-t border-slate-200 pt-2"><b className="block uppercase text-slate-700">App-open device location · client-reported</b><p className="mt-1"><b>Coordinates:</b> {coords(observation.lat, observation.lon)}</p><p><b>Accuracy:</b> {Number.isFinite(Number(observation.accuracy)) ? `±${Math.round(Number(observation.accuracy))} m` : "Not captured"} · <b>Captured:</b> {observation.capturedAt ? displayDate(observation.capturedAt) : "Not recorded"}</p><p className="break-words"><b>Geoapify reverse-geocoded result:</b> {observation.reverseGeocodedAddress || "Not available"}</p><p><b>Geoapify result level:</b> {observationGeo.resultType || "Not reported"} · <b>House-level:</b> {observationGeo.houseLevelResult === true ? "Building + house number found" : "Not confirmed"}</p><p><b>Building confidence:</b> {Number.isFinite(Number(observationGeo.buildingConfidence)) ? `${Math.round(Number(observationGeo.buildingConfidence) * 100)}%` : "Not reported"}</p><p className="text-[10px] text-amber-800">The app requests permission at launch and attaches a fresh reading to an order if available. Location and address are client-reported evidence; neither proves who placed the order or guarantees house-level accuracy.</p></div>
                    <div className="border-t border-slate-200 pt-2"><b className="block uppercase text-slate-700">Checkout-selected device GPS</b><p className="mt-1"><b>Coordinates:</b> {coords(gps.lat, gps.lon)}</p><p><b>Accuracy:</b> {Number.isFinite(Number(gps.accuracy)) ? `±${Math.round(Number(gps.accuracy))} m` : "Not captured"} · <b>Captured:</b> {gps.capturedAt ? displayDate(gps.capturedAt) : "Not recorded"}</p><p className="break-words"><b>Geoapify reverse-geocoded result:</b> {gps.reverseGeocodedAddress || "Not available"}</p></div>
                    <div className="border-t border-slate-200 pt-2"><b className="block uppercase text-slate-700">Delivery pin address</b><p className="mt-1 break-words">{selectedOrder.deliveryAddress?.geocodedAddress || selectedOrder.deliveryAddress?.formatted || "Not available"}</p><p className="break-words text-slate-500">{selectedOrder.deliveryAddress?.unitDetails || "No unit or landmark details"}</p></div>
                  </>;
                })()}
              </div>
            </details>

            <details className="serverless-disclosure">
              <summary>Customer and payment details</summary>
              <div className="serverless-disclosure__body"><div className="serverless-fields text-xs">
                <div><span>Telegram name</span><strong>{selectedOrder.telegramName || "Name unavailable"}</strong></div>
                <div><span>Telegram handle</span>{/^[A-Za-z0-9_]{5,32}$/.test(selectedOrder.telegramUsername) ? <a href={`https://t.me/${encodeURIComponent(selectedOrder.telegramUsername)}`} target="_blank" rel="noreferrer" className="font-bold text-sky-700 underline">@{selectedOrder.telegramUsername}</a> : <strong>No public handle</strong>}</div>
                <div><span>Telegram ID</span><strong>{selectedOrder.tgUserId || "—"}</strong></div>
                <div><span>PRIME ID</span><strong>{selectedOrder.primeMemberId || "—"}</strong></div>
                <div><span>Order status</span><strong>{selectedOrder.status}</strong></div>
                <div><span>Payment status</span><strong>{selectedOrder.paymentStatus}</strong></div>
                {selectedOrder.paymentReceivedAmount != null && <div><span>Provider verified</span><strong>{formatPHP(selectedOrder.paymentReceivedAmount)}</strong></div>}
                {selectedOrder.confirmedPaidAmount != null && <div><span>Applied to order</span><strong>{formatPHP(selectedOrder.confirmedPaidAmount)}</strong></div>}
                <div><span>Placed</span><strong>{displayDate(selectedOrder.createdAt)}</strong></div>
                <div><span>Payment method</span><strong>{selectedOrder.paymentMethodName || "—"}</strong></div>
                {status === "pending" && selectedOrder.payableNow > 0 && paymentDeadlineMs(selectedOrder) !== null && <div><span>Payment deadline</span><strong className="text-amber-700">{displayDate(paymentDeadlineMs(selectedOrder))}</strong></div>}
                {status === "expired" && <div><span>Payment window ended</span><strong>{paymentDeadlineMs(selectedOrder) === null ? "time unavailable" : displayDate(paymentDeadlineMs(selectedOrder))}</strong></div>}
              </div></div>
            </details>

            {selectedOrder.paymentStatus.toLowerCase() === "paid" && status === "processing" && <section className="serverless-disclosure">
              <div className="serverless-disclosure__body space-y-2">
                <strong className="text-xs uppercase">Payment adjustment</strong>
                {selectedOrder.adjustmentDue > 0 ? <>
                  <p className="text-xs">Additional amount: {formatPHP(selectedOrder.adjustmentDue)} · {selectedOrder.adjustmentStatus.replace(/_/g, " ")}</p>
                  {selectedOrder.adjustmentRevisedTotal != null && <p className="text-xs">Revised total: {formatPHP(selectedOrder.adjustmentRevisedTotal)}</p>}
                  {selectedOrder.adjustmentPaymentMethodName && <p className="text-xs">Customer payment method: {selectedOrder.adjustmentPaymentMethodName}</p>}
                  {selectedOrder.adjustmentProofImage && <button type="button" className="px-3 py-2 border text-xs font-bold" onClick={async () => { try { setReceiptUrl(await resolveTelegramMedia(selectedOrder.adjustmentProofImage)); setReceiptOpen(true); } catch (err: any) { setError(err?.message || "Could not open the adjustment receipt."); } }}>View adjustment receipt</button>}
                  {selectedOrder.adjustmentStatus.toLowerCase() === "pending_review" && <button type="button" disabled={busyAction !== ""} onClick={() => void runAction(selectedOrder, "approveAdjustmentPayment")} className="block px-3 py-2 bg-emerald-700 text-white text-xs font-bold uppercase disabled:opacity-50">Approve verified extra payment</button>}
                </> : <>
                  <p className="text-xs">Edit the order and save it to recalculate any top-up from the updated items and charges. Verify the customer’s separate receipt before marking the order Ready.</p>
                </>}
                {selectedOrder.adjustmentDue > 0 && selectedOrder.adjustmentStatus.toLowerCase() !== "paid" && <p className="text-xs text-amber-800">Dispatch stays blocked until staff verifies the extra payment.</p>}
              </div>
            </section>}

            <details className="serverless-disclosure">
              <summary>DISPATCH DETAILS</summary>
              <div className="serverless-disclosure__body"><div className="serverless-fields text-xs">
                {copyField("Receiver name", receiverName, "receiver-name")}
                {copyField("Receiver phone", receiverPhone, "receiver-phone")}
                {copyField("Delivery address", [addressText(selectedOrder.deliveryAddress), selectedOrder.deliveryAddress?.unitDetails].filter(Boolean).join(" · "), "delivery-address")}
                {copyField("Delivery notes / instructions", deliveryNotes, "delivery-notes")}
                <div><span>Courier</span><strong>{selectedOrder.courierName || "—"}</strong></div>
                <div><span>Tracking number</span><strong>{selectedOrder.trackingNumber || "—"}</strong></div>
                {selectedOrder.trackingUrl && <div className="serverless-order-tracking"><span>Customer tracking link</span><a href={selectedOrder.trackingUrl} target="_blank" rel="noreferrer"><ExternalLink /> Open tracking URL</a></div>}
                <div><span>Dispatched</span><strong>{displayDate(selectedOrder.dispatchedAt)}</strong></div>
                <div><span>Completed</span><strong>{displayDate(selectedOrder.deliveredAt)}</strong></div>
              </div></div>
            </details>

            <details className="serverless-disclosure" open>
              <summary>Items and totals</summary>
              <div className="serverless-disclosure__body">
                <div className="serverless-order-items">
                  {selectedOrder.items.map((item: any, index) => (
                    <div key={`${item.id || item.productId || "item"}-${index}`} className="serverless-order-item">
                      <div><b>{item.name || item.productName || "Item"}</b><small>{[item.variantName || item.variant, `${Number(item.quantity) || 1} × ${formatPHP(Number(item.price) || 0)}`].filter(Boolean).join(" · ")}</small></div>
                      <strong>{formatPHP((Number(item.price) || 0) * (Number(item.quantity) || 1))}</strong>
                    </div>
                  ))}
                </div>
                {selectedOrder.items.length === 0 && <p className="text-xs text-slate-500">No item details saved.</p>}
                <dl className="serverless-order-totals">
                  <div><dt>Items subtotal</dt><dd>{formatPHP(itemSubtotal)}</dd></div>
                  {discountsTotal > 0 && <div><dt>Discounts</dt><dd>−{formatPHP(discountsTotal)}</dd></div>}
                  {selectedOrder.storeCreditsUsed > 0 && <div><dt>Store Credits used</dt><dd>−{formatPHP(selectedOrder.storeCreditsUsed)}</dd></div>}
                  {(chargesTotal + selectedOrder.deliveryFee) > 0 && <div><dt>Fees &amp; delivery</dt><dd>{formatPHP(chargesTotal + selectedOrder.deliveryFee)}</dd></div>}
                  <div className="is-total"><dt>Order total</dt><dd>{formatPHP(selectedOrder.totalAmount ?? selectedOrder.subtotal)}</dd></div>
                  <div><dt>Payable now</dt><dd>{formatPHP(selectedOrder.payableNow)}</dd></div>
                  {selectedOrder.payableOnDelivery > 0 && <div><dt>Due on delivery</dt><dd>{formatPHP(selectedOrder.payableOnDelivery)}</dd></div>}
                  {selectedOrder.readyCreditDue > 0 && <div><dt>Store Credits at Ready</dt><dd>{formatPHP(selectedOrder.readyCreditDue)}</dd></div>}
                </dl>
                {(selectedOrder.chargesBreakdown.length > 0 || selectedOrder.deliveryFee > 0 || discountsTotal > 0 || selectedOrder.storeCreditsUsed > 0) && <details className="serverless-order-breakdown">
                  <summary>View fee and discount breakdown</summary>
                  <div>
                    {selectedOrder.chargesBreakdown.map((charge: any, index) => <p key={`${charge.id || charge.name || "charge"}-${index}`}><span>{charge.name || "Additional charge"}</span><b>{formatPHP(Number(charge.computedAmount ?? charge.amount) || 0)}</b></p>)}
                    {selectedOrder.deliveryFee > 0 && <p><span>Delivery fee</span><b>{formatPHP(selectedOrder.deliveryFee)}</b></p>}
                    {selectedOrder.discountAmount > 0 && <p><span>Promo discount{selectedOrder.appliedPromoCode ? ` · ${selectedOrder.appliedPromoCode}` : ""}</span><b>−{formatPHP(selectedOrder.discountAmount)}</b></p>}
                    {selectedOrder.staffDiscountAmount > 0 && <p><span>Staff discount · {selectedOrder.staffDiscountMode === "percent" ? `${selectedOrder.staffDiscountValue}%` : selectedOrder.staffDiscountMode === "fixed" ? formatPHP(selectedOrder.staffDiscountValue) : "manual"}</span><b>−{formatPHP(selectedOrder.staffDiscountAmount)}</b></p>}
                    {selectedOrder.pointsDiscount > 0 && <p><span>Points discount</span><b>−{formatPHP(selectedOrder.pointsDiscount)}</b></p>}
                    {selectedOrder.promoShippingSubsidy > 0 && <p><span>Shipping promo</span><b>−{formatPHP(selectedOrder.promoShippingSubsidy)}</b></p>}
                    {selectedOrder.storeCreditsUsed > 0 && <p><span>Store Credits used</span><b>−{formatPHP(selectedOrder.storeCreditsUsed)}</b></p>}
                  </div>
                </details>}
              </div>
            </details>

            {selectedOrder.paymentProofImage && (
              <section className="serverless-disclosure"><div className="serverless-disclosure__body serverless-order-receipt-row">
                <div><b>Payment receipt attached</b><small>Open only when you need to inspect the proof.</small></div>
                <button type="button" disabled={!receiptUrl} onClick={() => { setReceiptZoom(1); setReceiptOpen(true); }}><Eye /> View receipt</button>
              </div></section>
            )}
            {selectedOrder.ocrAnalysis && <details className="serverless-disclosure"><summary>Receipt check details</summary><div className="serverless-disclosure__body space-y-1 text-xs">
              <b>Automated image checks · staff payment verification still required</b>
              {selectedOrder.ocrAnalysis.forensicsResult && <p>{selectedOrder.ocrAnalysis.forensicsResult}</p>}
              {Array.isArray(selectedOrder.ocrAnalysis.forensicsFlags) && selectedOrder.ocrAnalysis.forensicsFlags.length > 0 && <div className="rounded border border-rose-200 bg-rose-50 p-2 text-rose-950"><b>Reuse indicators</b><ul className="mt-1 list-disc pl-4">{selectedOrder.ocrAnalysis.forensicsFlags.map((flag: any, index: number) => <li key={`${flag.kind}-${flag.orderId || index}`}>{flag.kind === "REFERENCE_REUSE" ? "Reference number seen on another order" : flag.kind === "EXACT_SCAN_IMAGE_REUSE" || flag.kind === "EXACT_UPLOADED_IMAGE_REUSE" ? "Exact image fingerprint seen on another order" : flag.kind === "RECEIPT_IMAGE_CHANGED_ON_ORDER" ? "Receipt image changed after an earlier scan or submission" : "Receipt reuse indicator"}{flag.orderNumber ? ` · Order #${flag.orderNumber}` : ""}</li>)}</ul></div>}
              {selectedOrder.ocrAnalysis.rawImageSha256 && <p className="break-all"><b>File fingerprint:</b> {selectedOrder.ocrAnalysis.rawImageSha256}</p>}
              {selectedOrder.ocrAnalysis.pixelFingerprintSha256 && <p className="break-all"><b>Pixel sample fingerprint:</b> {selectedOrder.ocrAnalysis.pixelFingerprintSha256}</p>}
              {selectedOrder.ocrAnalysis.rawSummary && <details className="mt-2 border bg-white"><summary className="cursor-pointer p-2 font-bold">Older text-scan result</summary><div className="max-h-64 space-y-1 overflow-y-auto border-t p-2">{selectedOrder.ocrAnalysis.rawSummary}<p>Detected amount: {formatPHP(Number(selectedOrder.ocrAnalysis.amountPaid) || 0)} · Reference: {selectedOrder.ocrAnalysis.referenceNumber || "Unreadable"}</p>{selectedOrder.ocrAnalysis.providerResponse && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t p-2 text-[10px]">{selectedOrder.ocrAnalysis.providerResponse}</pre>}{Array.isArray(selectedOrder.ocrAnalysis.extractedFields) && selectedOrder.ocrAnalysis.extractedFields.map((field: any, index: number) => <p key={`${field.label}-${index}`} className="break-words border-b py-1"><b>{field.label}: </b>{field.value}</p>)}</div></details>}
              <p className="font-bold text-amber-800">Image matches are review clues only. They do not prove payment or image tampering. Verify the transaction directly with the payment provider.</p>
            </div></details>}
            {selectedOrder.notes && <details className="serverless-disclosure"><summary>Order notes</summary><div className="serverless-disclosure__body text-xs">{selectedOrder.notes}</div></details>}

            {(canVerifyPayment || canApproveZeroDue || canReady || canDispatch || canComplete || canExpireUnpaid) && <details className="serverless-disclosure">
              <summary>{canVerifyPayment ? "Next step · check payment" : canApproveZeroDue ? "Next step · confirm no upfront payment is due" : canReady ? "Next step · prepare order" : canDispatch ? "Next step · add courier tracking" : canComplete ? "Next step · confirm delivery" : "More order actions"}</summary>
              <div className="serverless-disclosure__body"><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {canVerifyPayment && <div className="space-y-2"><label className="block text-xs text-emerald-900">Amount confirmed in the payment provider<input type="number" min={selectedOrder.payableNow} step="0.01" placeholder="Enter the amount received" value={verifiedPaidAmount} onChange={(event) => setVerifiedPaidAmount(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm" /></label><p className="text-xs text-slate-600">Compare the provider transaction with the order due. Any verified excess is issued as Store Credits.</p><button type="button" disabled={busyAction !== "" || !verifiedPaidAmount || Number(verifiedPaidAmount) < selectedOrder.payableNow} onClick={() => void runAction(selectedOrder, "markPaid", { confirmedAmount: verifiedPaidAmount })} className="px-3 py-2 bg-emerald-700 text-white text-xs font-bold uppercase disabled:opacity-50">{busyAction.endsWith(":markPaid") ? <Loader2 className="inline w-3 h-3 animate-spin mr-1" /> : <Check className="inline w-3 h-3 mr-1" />} Confirm verified payment and continue</button></div>}
                {canApproveZeroDue && <button type="button" disabled={busyAction !== ""} onClick={() => void runAction(selectedOrder, "approveZeroDue")} className="px-3 py-2 bg-emerald-700 text-white text-xs font-bold uppercase disabled:opacity-50">{busyAction.endsWith(":approveZeroDue") ? <Loader2 className="inline w-3 h-3 animate-spin mr-1" /> : <Check className="inline w-3 h-3 mr-1" />} Approve zero upfront due · mark Paid</button>}
                {canReady && <button type="button" disabled={busyAction !== ""} onClick={() => void runAction(selectedOrder, "markReady")} className="px-3 py-2 bg-emerald-700 text-white text-xs font-bold uppercase disabled:opacity-50">{busyAction.endsWith(":markReady") ? <Loader2 className="inline w-3 h-3 animate-spin mr-1" /> : <Check className="inline w-3 h-3 mr-1" />} Mark Ready{selectedOrder.readyCreditDue > 0 ? ` · issue ${formatPHP(selectedOrder.readyCreditDue)} Store Credits` : ""}</button>}
                {canDispatch && <div className="serverless-order-dispatch"><label htmlFor="order-tracking-url">Live tracking URL <span>Required</span></label><input id="order-tracking-url" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://courier.example/track/..." value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} /><small>This URL will appear as “Track Location” in the customer’s order details.</small><button type="button" disabled={busyAction !== "" || !/^https:\/\//i.test(trackingUrl.trim())} onClick={() => void runAction(selectedOrder, "dispatch", { trackingUrl: trackingUrl.trim() })} className="px-3 py-2 bg-sky-700 text-white text-xs font-bold uppercase disabled:opacity-50">{busyAction.endsWith(":dispatch") ? <Loader2 className="inline w-3 h-3 animate-spin mr-1" /> : <Truck className="inline w-3 h-3 mr-1" />} Save tracking &amp; mark dispatched</button></div>}
                {canComplete && <button type="button" disabled={busyAction !== ""} onClick={() => void runAction(selectedOrder, "complete")} className="px-3 py-2 bg-indigo-700 text-white text-xs font-bold uppercase disabled:opacity-50">{busyAction.endsWith(":complete") ? <Loader2 className="inline w-3 h-3 animate-spin mr-1" /> : <Check className="inline w-3 h-3 mr-1" />} Mark delivered / completed</button>}
                {canExpireUnpaid && <div className="space-y-2 border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-950">The one-hour payment window ended at {displayDate(unpaidDeadline)}. Expiring this order releases its inventory and promo holds and returns eligible Store Credits.</p><button type="button" disabled={busyAction !== ""} onClick={() => { if (window.confirm("Expire this overdue unpaid order? This releases its inventory and promo holds and returns eligible Store Credits.")) void runAction(selectedOrder, "expireUnpaid"); }} className="px-3 py-2 bg-amber-800 text-white text-xs font-bold uppercase disabled:opacity-50">{busyAction.endsWith(":expireUnpaid") ? <Loader2 className="inline w-3 h-3 animate-spin mr-1" /> : <Clock3 className="inline w-3 h-3 mr-1" />} Expire overdue unpaid order</button></div>}
              </div>
              {canVerifyPayment && <p className="mt-2 text-xs text-amber-700">Enter the exact total received from the provider. For an edited order, compare that amount with the revised due above. Any excess is issued as Store Credits when you approve.</p>}
              {canApproveZeroDue && <p className="mt-2 text-xs text-amber-700">Confirm no upfront amount is due. The order will be marked Paid for processing; any pay-on-delivery amount remains due to the courier.</p>}
              </div>
            </details>}
          </div>
        )}

        {editing && editingItemIndex !== null && itemDraft && editItems[editingItemIndex] && <div className="serverless-item-edit-backdrop" role="presentation">
          <section className="serverless-item-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="serverless-item-edit-title">
            <header className="serverless-item-edit-sheet__header">
              <div className="min-w-0"><span>Order item</span><h2 id="serverless-item-edit-title">Edit {editItems[editingItemIndex].name}</h2></div>
              <button type="button" onClick={() => { setEditingItemIndex(null); setItemDraft(null); }} aria-label="Close item editor"><X /></button>
            </header>
            <div className="serverless-item-edit-sheet__body">
              <label className="serverless-item-edit-price">Selling price per item<input autoFocus type="number" min="0" step="0.01" inputMode="decimal" value={itemDraft.price} onChange={(event) => setItemDraft((draft: any) => ({ ...draft, price: event.target.value }))} /><small>Before any item offer</small></label>
              <div className="serverless-item-edit-quantity"><span>Quantity <small>Up to {Number(itemDraft.reservedQuantity) || 1} reserved</small></span><div>
                <button type="button" aria-label="Decrease quantity" disabled={Number(itemDraft.quantity) <= 1} onClick={() => setItemDraft((draft: any) => ({ ...draft, quantity: String(Math.max(1, (Number(draft.quantity) || 1) - 1)) }))}><Minus /></button>
                <input aria-label="Quantity" type="number" min="1" max={Number(itemDraft.reservedQuantity) || 1} step="1" inputMode="numeric" value={itemDraft.quantity} onChange={(event) => setItemDraft((draft: any) => ({ ...draft, quantity: event.target.value }))} />
                <button type="button" aria-label="Increase quantity" disabled={Number(itemDraft.quantity) >= (Number(itemDraft.reservedQuantity) || 1)} onClick={() => setItemDraft((draft: any) => ({ ...draft, quantity: String(Math.min(Number(draft.reservedQuantity) || 1, (Number(draft.quantity) || 1) + 1)) }))}><Plus /></button>
              </div></div>
              <div className="serverless-item-edit-offer">
                <button type="button" role="switch" aria-checked={Boolean(itemDraft.offerEnabled)} onClick={() => setItemDraft((draft: any) => ({ ...draft, offerEnabled: !draft.offerEnabled, offerMode: draft.offerMode === "none" ? "percent" : draft.offerMode }))}>
                  <span><b>Apply offer</b><small>Discount this item or give it free</small></span><span className="serverless-item-edit-switch" aria-hidden="true" />
                </button>
                {itemDraft.offerEnabled && <div className="serverless-item-edit-offer__options">
                  <div className="serverless-item-edit-choice"><label><input type="radio" name="item-offer-mode" checked={itemDraft.offerMode !== "free"} onChange={() => setItemDraft((draft: any) => ({ ...draft, offerMode: "percent" }))} /> Give discount</label><label><input type="radio" name="item-offer-mode" checked={itemDraft.offerMode === "free"} onChange={() => setItemDraft((draft: any) => ({ ...draft, offerMode: "free", offerValue: "0" }))} /> Give as free</label></div>
                  {itemDraft.offerMode !== "free" && <div className="serverless-item-edit-discount"><label>Discount type<select value={itemDraft.offerMode === "fixed" ? "fixed" : "percent"} onChange={(event) => setItemDraft((draft: any) => ({ ...draft, offerMode: event.target.value }))}><option value="percent">By percentage</option><option value="fixed">PHP off per item</option></select></label><label>{itemDraft.offerMode === "fixed" ? "Amount off each" : "Percentage off"}<span>{itemDraft.offerMode === "fixed" ? "₱" : "%"}<input type="number" min="0" max={itemDraft.offerMode === "fixed" ? undefined : "100"} step="0.01" inputMode="decimal" value={itemDraft.offerValue} onChange={(event) => setItemDraft((draft: any) => ({ ...draft, offerValue: event.target.value }))} /></span></label></div>}
                </div>}
              </div>
              {(() => {
                const price = Math.max(0, Number(itemDraft.price) || 0);
                const mode = itemDraft.offerEnabled ? itemDraft.offerMode : "none";
                const value = Math.max(0, Number(itemDraft.offerValue) || 0);
                const unit = mode === "free" ? 0 : mode === "percent" ? price * (100 - Math.min(100, value)) / 100 : mode === "fixed" ? Math.max(0, price - value) : price;
                const quantity = Math.min(Number(itemDraft.reservedQuantity) || 1, Math.max(1, Number(itemDraft.quantity) || 1));
                return <div className="serverless-item-edit-total"><span>Updated line total</span><strong>{formatPHP(unit * quantity)}</strong><small>{quantity} × {formatPHP(unit)} each</small></div>;
              })()}
              <button type="button" className="serverless-item-edit-remove" onClick={() => { setEditItems((rows) => rows.filter((_, index) => index !== editingItemIndex)); setEditingItemIndex(null); setItemDraft(null); }}><Trash2 /> Remove this item from the order</button>
            </div>
            <footer className="serverless-item-edit-sheet__footer"><button type="button" onClick={() => { setEditingItemIndex(null); setItemDraft(null); }}>Cancel</button><button type="button" onClick={saveItemDraft}>Update item</button></footer>
          </section>
        </div>}

        {receiptOpen && receiptUrl && <div className="serverless-receipt-modal" role="dialog" aria-modal="true" aria-label="Payment receipt viewer" onClick={() => setReceiptOpen(false)}>
          <div className="serverless-receipt-modal__panel" onClick={(event) => event.stopPropagation()}>
            <header><strong>Payment receipt</strong><a href={receiptUrl} download={`receipt-${selectedOrder?.orderNumber || "order"}`}><Download /> Download</a><button type="button" onClick={() => setReceiptOpen(false)} aria-label="Close receipt viewer"><X /></button></header>
            <div className="serverless-receipt-modal__tools"><button type="button" onClick={() => setReceiptZoom((zoom) => Math.max(0.5, zoom - 0.25))}>−</button><span>{Math.round(receiptZoom * 100)}%</span><button type="button" onClick={() => setReceiptZoom((zoom) => Math.min(4, zoom + 0.25))}>+</button><button type="button" onClick={() => setReceiptZoom(1)}>Reset</button></div>
            <div className="serverless-receipt-modal__scroll"><img src={receiptUrl} alt="Uploaded payment receipt" style={{ width: `${receiptZoom * 100}%`, maxWidth: "none" }} /></div>
          </div>
        </div>}

        {authorized && !selectedOrder && (
          <div className="space-y-2">
            <div className="serverless-panel-toolbar grid grid-cols-1 sm:grid-cols-2">
              <label className="relative min-w-0"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, Telegram ID" className="w-full min-w-0 border border-slate-200 pl-9 pr-3 py-2 text-xs" /></label>
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setQueueFilter("all"); }} className="w-full min-w-0 border border-slate-200 px-3 py-2 text-xs">
                <option value="all">All statuses</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="ready">Ready</option><option value="packed">Packed</option><option value="dispatched">Dispatched</option><option value="completed">Completed</option><option value="expired">Expired</option>
              </select>
            </div>
            {filteredOrders.length === 0 && !loading ? (
              <div className="bg-white border border-slate-200 p-8 text-center text-sm text-slate-500"><Clock3 className="w-6 h-6 mx-auto mb-2 text-slate-300" />No Serverless orders match this filter.</div>
            ) : filteredOrders.map((order) => (
              <article key={order.id} className="serverless-record">
                <button type="button" onClick={() => setSelectedId(order.id)} className="serverless-record__summary w-full text-left">
              <span className="serverless-record__copy"><strong>#{order.orderNumber || order.id} · {formatPHP(order.totalAmount ?? order.subtotal)}</strong><small>{order.telegramName || "Telegram user"} · {order.status} / {order.paymentStatus}</small><small>{displayDate(order.createdAt)} · {order.items.map((item: any) => item.name || item.productName || "Item").join(", ") || "No item details"}</small></span>
                  {order.paymentProofImage && <span className="text-[9px] text-emerald-700 font-bold uppercase">Receipt</span>}
                </button>
                <details className="serverless-disclosure serverless-record__details"><summary>Order overview</summary><div className="serverless-disclosure__body"><div className="serverless-fields text-xs"><div><span>Payment method</span><strong>{order.paymentMethodName || "—"}</strong></div><div><span>Payment deadline</span><strong>{paymentDeadlineMs(order) === null ? "—" : displayDate(paymentDeadlineMs(order))}</strong></div><div><span>Delivery address</span><strong>{addressText(order.deliveryAddress)}</strong></div><div><span>Total</span><strong>{formatPHP(order.totalAmount ?? order.subtotal)}</strong></div></div></div></details>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
