"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Clock3, Download, ExternalLink, Loader2, Minus, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { formatPHP, formatPHPWhole } from "@/lib/currency";
import { callServerless, getTelegramServerlessSession, resolveTelegramMedia } from "@/lib/telegram-serverless-client";
import OrderWorkflowController,{type OrderWorkflow} from './order-workflow-controller';

type ServerlessOrder = {
  workflow?: OrderWorkflow;
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerId: string;
  tgUserId: string;
  telegramName: string;
  telegramUsername: string;
  primeMemberId: string;
  tierLevel: string;
  matchingIdentifiers: { orderNumber: string; signals: string[] }[];
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
type OrderDetailTab = "items" | "fulfillment" | "snapshot" | "flags";

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
    workflow:row.workflow,
    id: String(field(row, "id", "id")),
    orderNumber: String(field(row, "orderNumber", "order_number")),
    customerName: String(field(row, "customerName", "customer_name", "Customer")),
    customerPhone: String(field(row, "customerPhone", "customer_phone")),
    customerId: String(field(row, "customerId", "customer_id")),
    tgUserId: String(field(row, "tgUserId", "tg_user_id")),
    telegramName: String(field(row, "telegramName", "telegram_name")),
    telegramUsername: String(field(row, "telegramUsername", "telegram_username")),
    primeMemberId: String(field(row, "primeMemberId", "prime_member_id")),
    tierLevel: String(field(row, "tierLevel", "tier_level")),
    matchingIdentifiers: Array.isArray(row.matchingIdentifiers) ? row.matchingIdentifiers : [],
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
  if (["completed", "delivered"].includes(status)) return {
    tone: "complete", title: "Order completed",
    message: "Delivery or fulfillment has been recorded. No further staff action is available for this order.",
  };
  if (status === "dispatched") return {
    tone: "active", title: "With courier",
    message: "The order remains with the courier until delivery is confirmed. Record completion when the customer confirms receipt or staff verifies delivery.",
  };
  if (status === "pending" && (payment === "pending review" || (payment === "unpaid" && Boolean(order.paymentProofImage)))) return {
    tone: "review", title: "Payment needs manual review",
    message: order.staffEditVersion > 0
      ? `The order was edited before payment approval. Verify the provider transaction for the revised amount of ${formatPHP(order.payableNow)}. Do not include any delivery fee payable to the courier. Approval moves the order to Processing.`
      : `Compare the receipt with the provider transaction for ${formatPHP(order.payableNow)} before approving payment. Approval moves the order to Processing.`,
  };
  if (status === "pending" && order.payableNow <= 0) return {
    tone: "review", title: "Staff review required · no upfront payment",
    message: order.payableOnDelivery > 0
      ? `Approve the zero upfront balance after checking the order. It will be marked Paid for processing; ${formatPHP(order.payableOnDelivery)} remains due to the courier.`
      : "Approve the zero balance after checking the order; no receipt is expected, and it will be marked Paid for processing.",
  };
  if (status === "pending") return {
    tone: "waiting", title: "Waiting for payment review",
    message: "The customer submitted payment proof before order submission. Staff must verify the provider transaction before approving.",
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
  const [detailOrder, setDetailOrder] = useState<ServerlessOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailRetry, setDetailRetry] = useState(0);
  const panelRef = useRef<HTMLElement | null>(null);
  const [publicQueueStats, setPublicQueueStats] = useState<{ ordersInQueue: number; ordersInProcessing: number; averageReadyMinutes: number | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [busyAction, setBusyAction] = useState("");
  const actionInFlight = useRef(false);
  const [error, setError] = useState("");
  const [reconciliationWarning, setReconciliationWarning] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(initialOrderId || null);
  const [orderDetailTab, setOrderDetailTab] = useState<OrderDetailTab>("items");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptZoom, setReceiptZoom] = useState(1);
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
    if (!authorized || selectedId || busyAction) return;
    const timer = window.setInterval(() => { void loadOrders(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [authorized, loadOrders, selectedId, busyAction]);

  useEffect(() => {
    if (initialOrderId) setSelectedId(initialOrderId);
  }, [initialOrderId]);

  useEffect(() => {
    setReceiptOpen(false);
    setOrderDetailTab("items");
    setEditing(false);setEditingItemIndex(null);setItemDraft(null);
    if(panelRef.current) panelRef.current.scrollTop=0;
  }, [selectedId]);

  useEffect(() => {
    if (!authorized || !selectedId) {setDetailOrder(null);setDetailError('');setDetailLoading(false);return;}
    let active=true;
    setDetailLoading(true);setDetailError('');
    callServerless<unknown>('manageOrders',{action:'get',orderId:selectedId},30_000)
      .then(response=>{const unpacked=unpackOrderList(response);if(!unpacked || unpacked.rows.length!==1)throw new Error('The order details could not be read.');if(active)setDetailOrder(normalizeOrder(unpacked.rows[0]));})
      .catch((err:any)=>{if(active)setDetailError(err?.message || 'Could not load this order.');})
      .finally(()=>{if(active)setDetailLoading(false);});
    return ()=>{active=false;};
  },[authorized,selectedId,detailRetry]);
  const selectedOrder = detailOrder && (detailOrder.id===selectedId || detailOrder.orderNumber===selectedId) ? detailOrder : null;
  const identifierMatches = selectedOrder?.matchingIdentifiers || [];

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
      const matchesStatus = statusFilter === "all" || (order.workflow?.stage||order.status).toLowerCase() === statusFilter;
      const status = order.status.toLowerCase();
      const payment = order.paymentStatus.toLowerCase();
      const matchesSearch = !needle || [order.orderNumber, order.telegramName, order.telegramUsername, order.customerName, order.customerPhone,
        order.tgUserId, order.primeMemberId, order.paymentMethodName, order.status]
        .some((value) => String(value || "").toLowerCase().includes(needle));
      return matchesStatus && matchesSearch;
    });
  }, [orders, search, statusFilter]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / 15));
  const currentPage = Math.min(page, pageCount);
  const pageOrders = filteredOrders.slice((currentPage - 1) * 15, currentPage * 15);

  const runAction = async (order: ServerlessOrder, action: string, extra: Record<string, any> = {}) => {
    if(actionInFlight.current || busyAction || detailLoading || detailError)return false;
    actionInFlight.current = true;
    setBusyAction(`${order.id}:${action}`);
    setError("");
    try {
      await callServerless("manageOrders", { action, orderId: order.id, ...extra });
      // Keep the action locked until fresh workflow permissions arrive.
      try {
        const response = await callServerless<unknown>("manageOrders", { action: "get", orderId: order.id }, 30_000);
        const unpacked = unpackOrderList(response);
        if (!unpacked || unpacked.rows.length !== 1) throw new Error("The updated order details could not be read.");
        setDetailOrder(normalizeOrder(unpacked.rows[0]));
      } catch (err: any) {
        setDetailError(err?.message || "Refresh this order to confirm the completed action.");
      }
      await loadOrders();
      return true;
    } catch (err: any) {
      setError(err?.message || "The order action could not be completed.");
      return false;
    } finally {
      actionInFlight.current = false;
      setBusyAction("");
    }
  };

  const beginEdit = (order: ServerlessOrder) => {
    setEditItems(order.items.map((item: any) => ({ ...item, reservedQuantity: Number(item.quantity) || 1, price: Number(item.originalPrice ?? item.price) || 0, offerMode: item.offerMode || "none", offerValue: Number(item.offerValue) || 0 })));
    setEditDiscountMode(order.staffDiscountMode === "percentage" ? "percent" : String(order.staffDiscountMode || "none"));
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
  const canVerifyPayment = Boolean(selectedOrder && status === "pending"
    && ["pending review", "unpaid"].includes(payment) && selectedOrder.paymentProofImage);
  const canApproveZeroDue = Boolean(selectedOrder && status === "pending" && payment === "unpaid"
    && selectedOrder.payableNow <= 0 && !selectedOrder.paymentProofImage);
  const canReady = Boolean(selectedOrder && status === "processing" && payment === "paid"
    && (selectedOrder.adjustmentDue <= 0 || selectedOrder.adjustmentStatus.toLowerCase() === "paid"));
  const canDispatch = Boolean(selectedOrder && ["ready", "packed"].includes(status)
    && (["paid", "completed"].includes(payment) || selectedOrder.payableNow <= 0)
    && (selectedOrder.adjustmentDue <= 0 || selectedOrder.adjustmentStatus.toLowerCase() === "paid"));
  const canComplete = status === "dispatched";
  const lifecycle = selectedOrder ? lifecycleInfo(selectedOrder) : null;
  const receiverName = String(selectedOrder?.deliveryAddress?.receiverName || selectedOrder?.customerName || "");
  const receiverPhone = String(selectedOrder?.deliveryAddress?.receiverPhone || selectedOrder?.customerPhone || "");
  const deliveryNotes = String(selectedOrder?.deliveryAddress?.deliveryNotes || selectedOrder?.deliveryAddress?.notes || selectedOrder?.notes || "");
  const copyField = (label: string, value: string, key: string) => <div className={`serverless-order-copy-field ${['delivery-address', 'delivery-notes'].includes(key) ? 'om-field-wide' : ''}`}><span>{label}</span>{value ? <div className="om-copy-line"><strong className="serverless-order-copy-value">{value}</strong><button type="button" className="om-copy-action" onClick={() => void copyValue(value, key)} aria-label={`Copy ${label}`} title={copiedKey === key ? "Copied" : "Copy"}>{copiedKey === key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}</button></div> : <strong>—</strong>}</div>;
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
  const stageIndex = status === "completed" || status === "delivered" ? 4
    : status === "dispatched" ? 3
    : ["ready", "packed"].includes(status) ? 2
    : status === "processing" ? 1 : 0;

  return (
    <section ref={panelRef} className="serverless-admin-panel serverless-orders-panel orders-register mx-auto w-full max-w-[430px] text-slate-900" aria-label="Telegram Serverless order management">
      <div className="space-y-2">
        <header className="serverless-panel-header sticky top-0 z-20 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <button type="button" onClick={selectedId ? () => setSelectedId(null) : onBack} disabled={busyAction!==""}
              className="p-2 border border-slate-200 hover:bg-slate-100" aria-label={selectedId ? "Back to orders" : "Back to dashboard"}>
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="font-heading font-normal text-base sm:text-lg truncate">Orders</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Refresh orders" onClick={() => {void loadOrders();setDetailRetry(value=>value+1);}} disabled={!authorized || loading || busyAction !== ""}
              className="p-2 border border-slate-200 hover:bg-slate-100 disabled:opacity-50" title="Refresh Serverless orders">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        {error && <div role="alert" className="border border-red-200 bg-red-50 text-red-800 p-3 text-sm">{error}</div>}
        {reconciliationWarning && <div role="status" className="border border-amber-200 bg-amber-50 text-amber-900 p-3 text-sm">{reconciliationWarning} The order list is still available.</div>}
        {(authLoading || loading) && orders.length === 0 && (
          <div className="bg-white border border-slate-200 p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
        )}

        {!authLoading && !authorized && !error && (
          <div className="bg-white border border-slate-200 p-5 text-sm text-slate-600">Open the Admin Panel from the PRIME Telegram Mini App using the configured staff Telegram account.</div>
        )}

        {authorized && selectedId && detailLoading && !selectedOrder && <div className="om-empty" role="status"><Loader2 className="animate-spin"/><p>Opening transaction…</p></div>}
        {authorized && selectedId && detailError && <div className="om-load-error" role="alert"><h2>Could not open this order</h2><p>{detailError}</p><button type="button" onClick={()=>setDetailRetry(value=>value+1)}>Retry order</button></div>}
        {authorized && !selectedId && error && !orders.length && <div className="om-load-error"><h2>Orders could not be loaded</h2><p>Retry to reconnect to the order queue.</p><button type="button" disabled={loading} onClick={()=>void loadOrders()}>Retry orders</button></div>}

        {authorized && selectedOrder && (
          <div className="serverless-record-list serverless-order-detail">
            <section className="prime-order-summary om-ticket" aria-label="Order summary">
              <div className="om-ticket-heading"><div><small>Transaction</small><strong className="font-mono">#{selectedOrder.orderNumber || selectedOrder.id}</strong></div><span className="om-status" data-status={String(selectedOrder.workflow?.stage || selectedOrder.status).toLowerCase()}>{selectedOrder.workflow?.stage || selectedOrder.status}</span></div>
              <div className="om-ticket-customer"><h2>{selectedOrder.customerName || selectedOrder.telegramName || 'Customer'}</h2><small>{displayDate(selectedOrder.createdAt)}</small></div>
              <div className="om-ticket-total"><span>Order Total</span><strong>{formatPHP(selectedOrder.totalAmount)}</strong></div>
              <div className="om-payment-state"><span>{selectedOrder.paymentMethodName || 'Payment'}</span><strong>{selectedOrder.paymentStatus}</strong></div>
              {selectedOrder.payableOnDelivery>0 && <div className="om-courier-due"><span>Pay Courier on Delivery</span><strong>{formatPHP(selectedOrder.payableOnDelivery)}</strong></div>}
              <small className="om-action-feedback" role="status" aria-live="polite">{busyAction ? "Saving action…" : detailLoading ? "Refreshing transaction…" : ""}</small>
            </section>
            <OrderWorkflowController key={selectedOrder.id} order={selectedOrder} busy={busyAction!=='' || detailLoading || Boolean(detailError)} receiptReady={Boolean(receiptUrl)} onAction={(action,extra)=>runAction(selectedOrder,action,extra)} onModify={()=>{beginEdit(selectedOrder);setOrderDetailTab('items');}} onReceipt={()=>{setReceiptZoom(1);setReceiptOpen(true);}}/>
            <nav className="prime-order-tabs" role="tablist" aria-label="Order details">
              {(["items", "fulfillment", "snapshot", "flags"] as const).map((tab) => <button key={tab} type="button" role="tab"
                aria-selected={orderDetailTab === tab} onClick={() => setOrderDetailTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}
            </nav>
            <section hidden={orderDetailTab !== "flags"}>
            {identifierMatches.map((match, index) => <div key={`${match.orderNumber}-${index}`} className="border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">{match.signals.join(', ')} match · Order #{match.orderNumber}</div>)}
            {(selectedOrder.fingerprintSnapshot?.ipLocation?.privacy?.isVpn || selectedOrder.fingerprintSnapshot?.ipLocation?.privacy?.isProxy) && <div className="border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">Network privacy signal: {[selectedOrder.fingerprintSnapshot.ipLocation.privacy.isVpn && 'VPN', selectedOrder.fingerprintSnapshot.ipLocation.privacy.isProxy && 'Proxy'].filter(Boolean).join(', ')}</div>}
            {(selectedOrder.reviewStatus === "Flagged for Forensics Review" || (Array.isArray(selectedOrder.ocrAnalysis?.forensicsFlags) && selectedOrder.ocrAnalysis.forensicsFlags.length > 0)) && <section role="alert" className="border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950">
              <b className="block uppercase tracking-wide">Extra Receipt Checks Needed</b>
              <span>A receipt image may have been reused or changed. This is a review signal, not proof of fraud. Check the payment in the provider account before approving it.</span>
            </section>}
            </section>
            <section hidden={orderDetailTab !== "flags"}>{identifierMatches.length === 0 && !selectedOrder.ocrAnalysis?.forensicsFlags?.length && !selectedOrder.fingerprintSnapshot?.ipLocation?.privacy?.isVpn && !selectedOrder.fingerprintSnapshot?.ipLocation?.privacy?.isProxy && <p className="p-3 text-xs text-slate-500">No matching identifiers or receipt flags found.</p>}</section>
            <section hidden={orderDetailTab !== "items"}>
            {selectedOrder.workflow?.actions?.includes("modify") && <details className="serverless-disclosure" open={editing || undefined}>
              <summary>Change Order Items, Discount, or Delivery Fee</summary>
              <div className="serverless-disclosure__body space-y-2">
                <strong className="text-xs uppercase">Staff Changes · {selectedOrder.status} / {selectedOrder.paymentStatus}</strong>
                {!editing ? <button type="button" onClick={() => beginEdit(selectedOrder)} className="px-3 py-2 bg-slate-900 text-white text-xs font-bold uppercase">Edit Items and Charges</button> : <div className="space-y-3">
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
                  <div className="border-l-4 border-sky-600 bg-sky-50 p-3"><b className="text-xs uppercase">Revised Total Preview</b><dl className="mt-2 space-y-1 text-xs"><div className="flex justify-between"><dt>Items After Item Offers</dt><dd>{formatPHP(editItemSubtotal)}</dd></div>{editOrderDiscount > 0 && <div className="flex justify-between"><dt>Order Discount</dt><dd>−{formatPHP(editOrderDiscount)}</dd></div>}<div className="flex justify-between"><dt>Charges and Delivery</dt><dd>{formatPHP(editChargesTotal + (Number(editDeliveryFee) || 0))}</dd></div><div className="flex justify-between border-t pt-1 font-bold"><dt>Revised Order Total</dt><dd>{formatPHP(editGrandTotal)}</dd></div><div className="flex justify-between font-bold"><dt>Due Before Delivery</dt><dd>{formatPHP(editPayableNow)}</dd></div></dl></div>
                  <div className="om-edit-fields"><label className="text-[11px]">Order Discount<select className="w-full border p-2" value={editDiscountMode} onChange={(e) => setEditDiscountMode(e.target.value)}><option value="none">No Discount</option><option value="fixed">Fixed PHP</option><option value="percent">Percent</option></select></label>{editDiscountMode !== "none" && <label className="text-[11px]">Discount Value<input className="w-full border p-2" type="number" min="0" step="0.01" value={editDiscountValue} onChange={(e) => setEditDiscountValue(e.target.value)} /></label>}<label className="text-[11px]">Delivery Fee<input className="w-full border p-2" type="number" min="0" step="0.01" value={editDeliveryFee} onChange={(e) => setEditDeliveryFee(e.target.value)} /></label></div>
                  <div className="space-y-2"><b className="text-xs">Current and Additional Charges</b><p className="text-[11px] text-slate-600">The saved charge lines are prefilled below. Edit their name/amount, remove a line, or add tax and other charges.</p>{editCharges.map((charge, index) => <div key={index} className="admin-charge-editor"><input aria-label="Charge name" className="border p-2 text-xs" value={charge.name} onChange={(e) => setEditCharges((rows) => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} /><select aria-label="Charge type" className="border p-1 text-xs" value={charge.type} onChange={(e) => setEditCharges((rows) => rows.map((row, i) => i === index ? { ...row, type: e.target.value } : row))}><option value="fixed">Fixed PHP</option><option value="percentage">Percent</option></select><input aria-label="Charge amount" className="border p-2 text-xs" type="number" min="0" step="0.01" value={charge.value} onChange={(e) => setEditCharges((rows) => rows.map((row, i) => i === index ? { ...row, value: e.target.value } : row))} /><button type="button" aria-label="Remove charge" onClick={() => setEditCharges((rows) => rows.filter((_, i) => i !== index))}>×</button></div>)}<button type="button" className="border px-2 py-1 text-xs" onClick={() => setEditCharges((rows) => [...rows, { name: "", type: "fixed", value: "0" }])}>+ Add a charge</button></div>
                  <p className="text-[11px] text-amber-900">Only reductions are allowed. A higher bill requires a new order. Verify any remaining payment before processing.</p>
                  <div className="flex gap-2"><button type="button" disabled={busyAction !== "" || editItems.length === 0} onClick={() => void runAction(selectedOrder, "edit", { expectedVersion: selectedOrder.staffEditVersion, items: editItems, discountMode: editDiscountMode, discountValue: editDiscountValue, deliveryFee: editDeliveryFee, charges: editCharges }).then((saved) => { if (saved) setEditing(false); })} className="px-3 py-2 bg-emerald-700 text-white text-xs font-bold uppercase disabled:opacity-50">Save Order Changes</button><button type="button" onClick={() => setEditing(false)} className="px-3 py-2 border text-xs font-bold uppercase">Cancel</button></div>
                </div>}
              </div>
            </details>}

            </section>

            <section hidden={orderDetailTab !== "snapshot"}>
            <details className="serverless-disclosure" open>
              <summary>Device and Location</summary>
              <div className="serverless-disclosure__body space-y-3 text-xs">
                <p className="text-slate-600">Use these details only when an order needs extra review. Device and location signals can be incomplete or inaccurate; they do not prove fraud.</p>
                {(() => {
                  const fp = selectedOrder.fingerprintSnapshot || {};
                  const ip = fp.ipLocation || {};
                  const gps = fp.deviceGps || {};
                  const observation = fp.deviceLocationObservation || {};
                  const coords = (lat: unknown, lon: unknown) => lat != null && lon != null && lat !== '' && lon !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) ? `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}` : "Not captured";
                  return <>
                    <div><b className="block uppercase text-slate-700">Device Fingerprint</b><div className="mt-1 grid grid-cols-2 gap-2"><div><span>Fingerprint ID</span><strong className="block break-all">{fp.deviceFingerprintId || "Not captured"}</strong></div><div><span>Device / Hardware ID</span><strong className="block break-all">{[fp.deviceId, fp.hardwareId].filter(Boolean).join(" · ") || "Not captured"}</strong></div><div><span>Platform / Browser</span><strong className="block break-words">{[fp.platform, fp.browser || fp.userAgent].filter(Boolean).join(" · ") || "Not captured"}</strong></div><div><span>Graphics</span><strong className="block break-words">{fp.graphics || "Not captured"}</strong></div><div><span>Driver</span><strong className="block break-words">{fp.driver || "Not captured"}</strong></div></div></div>
                    <div className="border-t border-slate-200 pt-2"><b className="block uppercase text-slate-700">IP and Approximate Network Location</b><p className="mt-1 break-all"><b>Browser-Observed IP:</b> {ip.ip || fp.clientObservedIp || "Not captured"}</p><p className="mt-0.5 text-[10px] text-amber-800">Client-reported IP; network location is approximate and not independently verified.</p><p className="mt-1 break-words"><b>Provider / Precision:</b> {[ip.provider === "IPLocate" ? "IPLocate" : ip.provider ? "Previous snapshot" : "", ip.precision].filter(Boolean).join(" · ") || "Not available"}</p><p className="break-words"><b>Approximate IP Area:</b> {[ip.city, ip.subdivision, ip.country, ip.postalCode].filter(Boolean).join(", ") || "Not available"}</p><p className="break-words"><b>Network:</b> {[ip.isp, ip.asn, ip.ispDomain].filter(Boolean).join(" · ") || "Not available"}</p><p><b>IP Coordinates:</b> {coords(ip.latitude, ip.longitude)} · approximate</p><p><b>TomTom approximate address:</b> {ip.reverseGeocodingProvider === "TomTom" ? ip.reverseGeocodedAddress : "Not available"}</p><p><b>VPN / Proxy:</b> {ip.privacy ? `${ip.privacy.isVpn ? "VPN" : "No VPN reported"} · ${ip.privacy.isProxy ? "Proxy" : "No proxy reported"}` : "Not available"}</p></div>
                    <div className="border-t border-slate-200 pt-2"><b className="block uppercase text-slate-700">App-Open Device Location · Client-Reported</b><p className="mt-1"><b>Coordinates:</b> {coords(observation.lat, observation.lon)}</p><p><b>Accuracy:</b> {Number.isFinite(Number(observation.accuracy)) ? `±${Math.round(Number(observation.accuracy))} m` : "Not captured"} · <b>Captured:</b> {observation.capturedAt ? displayDate(observation.capturedAt) : "Not recorded"}</p><p className="break-words"><b>TomTom address:</b> {observation.reverseGeocodingProvider === "TomTom" ? observation.reverseGeocodedAddress : "Not available"}</p><p className="text-[10px] text-amber-800">The app requests permission at launch and attaches a fresh reading to an order if available. Location and address are client-reported evidence; neither proves who placed the order or guarantees house-level accuracy.</p></div>
                    <div className="border-t border-slate-200 pt-2"><b className="block uppercase text-slate-700">Checkout-Selected Device GPS</b><p className="mt-1"><b>Coordinates:</b> {coords(gps.lat, gps.lon)}</p><p><b>Accuracy:</b> {Number.isFinite(Number(gps.accuracy)) ? `±${Math.round(Number(gps.accuracy))} m` : "Not captured"} · <b>Captured:</b> {gps.capturedAt ? displayDate(gps.capturedAt) : "Not recorded"}</p><p className="break-words"><b>TomTom address:</b> {gps.reverseGeocodingProvider === "TomTom" ? gps.reverseGeocodedAddress : "Not available"}</p></div>
                    <div className="border-t border-slate-200 pt-2"><b className="block uppercase text-slate-700">Delivery Pin Address</b><p className="mt-1 break-words">{selectedOrder.deliveryAddress?.geocodingProvider === "TomTom" ? selectedOrder.deliveryAddress.geocodedAddress : selectedOrder.deliveryAddress?.formatted || "Not available"}</p><p className="break-words text-slate-500">{selectedOrder.deliveryAddress?.unitDetails || "No unit or landmark details"}</p></div>
                  </>;
                })()}
              </div>
            </details>
            </section>

            <section hidden={orderDetailTab !== "snapshot"}>
            <details className="serverless-disclosure" open>
              <summary>Customer Identity</summary>
              <div className="serverless-disclosure__body"><div className="serverless-fields text-xs">
                <div><span>Telegram Name</span><strong>{selectedOrder.telegramName || "Name unavailable"}</strong></div>
                <div><span>Telegram Handle</span>{/^[A-Za-z0-9_]{5,32}$/.test(selectedOrder.telegramUsername) ? <a href={`https://t.me/${encodeURIComponent(selectedOrder.telegramUsername)}`} target="_blank" rel="noreferrer" className="font-bold text-sky-700 underline">@{selectedOrder.telegramUsername}</a> : <strong>No Public Handle</strong>}</div>
                <div><span>Telegram ID</span><strong>{selectedOrder.tgUserId || "—"}</strong></div>
                <div><span>PRIME ID</span><strong>{selectedOrder.primeMemberId || "—"}</strong></div>
                <div><span>Tier Status</span><strong>{selectedOrder.tierLevel || "—"}</strong></div>
              </div></div>
            </details>

            {selectedOrder.paymentStatus.toLowerCase() === "paid" && status === "processing" && <section className="serverless-disclosure">
              <div className="serverless-disclosure__body space-y-2">
                <strong className="text-xs uppercase">Payment Adjustment</strong>
                {selectedOrder.adjustmentDue > 0 ? <>
                  <p className="text-xs">Additional amount: {formatPHP(selectedOrder.adjustmentDue)} · {selectedOrder.adjustmentStatus.replace(/_/g, " ")}</p>
                  {selectedOrder.adjustmentRevisedTotal != null && <p className="text-xs">Revised total: {formatPHP(selectedOrder.adjustmentRevisedTotal)}</p>}
                  {selectedOrder.adjustmentPaymentMethodName && <p className="text-xs">Customer payment method: {selectedOrder.adjustmentPaymentMethodName}</p>}
                  {selectedOrder.adjustmentProofImage && <button type="button" className="px-3 py-2 border text-xs font-bold" onClick={async () => { try { setReceiptUrl(await resolveTelegramMedia(selectedOrder.adjustmentProofImage)); setReceiptOpen(true); } catch (err: any) { setError(err?.message || "Could not open the adjustment receipt."); } }}>View Adjustment Receipt</button>}
                  {selectedOrder.adjustmentStatus.toLowerCase() === "pending_review" && <button type="button" disabled={busyAction !== ""} onClick={() => void runAction(selectedOrder, "approveAdjustmentPayment")} className="block px-3 py-2 bg-emerald-700 text-white text-xs font-bold uppercase disabled:opacity-50">Approve Verified Extra Payment</button>}
                </> : <>
                  <p className="text-xs">Edit the order and save it to recalculate any top-up from the updated items and charges. Verify the customer’s separate receipt before marking the order Ready.</p>
                </>}
                {selectedOrder.adjustmentDue > 0 && selectedOrder.adjustmentStatus.toLowerCase() !== "paid" && <p className="text-xs text-amber-800">Dispatch stays blocked until staff verifies the extra payment.</p>}
              </div>
            </section>}
            </section>

            <section hidden={orderDetailTab !== "fulfillment"}>
            <details className="serverless-disclosure" open>
              <summary>Delivery Details</summary>
              <div className="serverless-disclosure__body"><div className="serverless-fields text-xs">
                {copyField("Telegram Name", selectedOrder.telegramName, "telegram-name")}
                {copyField("Telegram Handle", selectedOrder.telegramUsername ? `@${selectedOrder.telegramUsername}` : "", "telegram-handle")}
                {copyField("PRIME™ Member ID", selectedOrder.primeMemberId, "member-id")}
                <div><span>Tier</span><strong>{selectedOrder.tierLevel || "—"}</strong></div>
                {copyField("Receiver Name", receiverName, "receiver-name")}
                {copyField("Receiver Phone", receiverPhone, "receiver-phone")}
                {copyField("Delivery Address", [addressText(selectedOrder.deliveryAddress), selectedOrder.deliveryAddress?.unitDetails].filter(Boolean).join(" · "), "delivery-address")}
                {copyField("Delivery Notes / Instructions", deliveryNotes, "delivery-notes")}
                <div><span>Courier</span><strong>{selectedOrder.courierName || "—"}</strong></div>
                <div><span>Courier Payment</span><strong>{selectedOrder.deliveryAddress?.courierPaymentMode === "upon_delivery" || (!selectedOrder.deliveryAddress?.courierPaymentMode && selectedOrder.payableOnDelivery > 0) ? "PUD · pay on arrival" : "PUC · paid at checkout"}</strong></div>
                <div className="om-route-metrics om-field-wide">
                <div><span>Travel Time</span><strong>{selectedOrder.deliveryAddress?.estimatedTravelMinutes != null ? `${selectedOrder.deliveryAddress.estimatedTravelMinutes} min` : "—"}</strong></div>
                <div><span>Distance</span><strong>{selectedOrder.deliveryAddress?.distanceKm != null ? `${selectedOrder.deliveryAddress.distanceKm} km` : "—"}</strong></div>
                <div><span>Tracking Number</span><strong>{selectedOrder.trackingNumber || "—"}</strong></div>
                </div>
                {selectedOrder.trackingUrl && <div className="serverless-order-tracking om-field-wide"><span>Customer Tracking Link</span><a href={selectedOrder.trackingUrl} target="_blank" rel="noreferrer"><ExternalLink /> Open tracking URL</a></div>}
                <div><span>Dispatched</span><strong>{displayDate(selectedOrder.dispatchedAt)}</strong></div>
                <div><span>Completed</span><strong>{displayDate(selectedOrder.deliveredAt)}</strong></div>
              </div></div>
            </details>
            </section>

            <section hidden={orderDetailTab !== "items"}>
            <details className="serverless-disclosure" open>
              <summary>Items and Totals</summary>
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
                  <div><dt>Items Subtotal</dt><dd>{formatPHP(itemSubtotal)}</dd></div>
                  {discountsTotal > 0 && <div><dt>Discounts</dt><dd>−{formatPHP(discountsTotal)}</dd></div>}
                  {selectedOrder.storeCreditsUsed > 0 && <div><dt>Store Credits Used</dt><dd>−{formatPHP(selectedOrder.storeCreditsUsed)}</dd></div>}
                  {(chargesTotal + selectedOrder.deliveryFee) > 0 && <div><dt>Fees &amp; delivery</dt><dd>{formatPHP(chargesTotal + selectedOrder.deliveryFee)}</dd></div>}
                  <div className="is-total"><dt>Order Total</dt><dd>{formatPHP(selectedOrder.totalAmount ?? selectedOrder.subtotal)}</dd></div>
                  <div><dt>Payable Now</dt><dd>{formatPHP(selectedOrder.payableNow)}</dd></div>
                  {selectedOrder.payableOnDelivery > 0 && <div><dt>Due on Delivery</dt><dd>{formatPHP(selectedOrder.payableOnDelivery)}</dd></div>}
                  {selectedOrder.readyCreditDue > 0 && <div><dt>Store Credits at Ready</dt><dd>{formatPHP(selectedOrder.readyCreditDue)}</dd></div>}
                </dl>
                {(selectedOrder.chargesBreakdown.length > 0 || selectedOrder.deliveryFee > 0 || discountsTotal > 0 || selectedOrder.storeCreditsUsed > 0) && <details className="serverless-order-breakdown">
                  <summary>View Fee and Discount Breakdown</summary>
                  <div>
                    {selectedOrder.chargesBreakdown.map((charge: any, index) => <p key={`${charge.id || charge.name || "charge"}-${index}`}><span>{charge.name || "Additional charge"}</span><b>{formatPHP(Number(charge.computedAmount ?? charge.amount) || 0)}</b></p>)}
                    {selectedOrder.deliveryFee > 0 && <p><span>Delivery Fee</span><b>{formatPHPWhole(selectedOrder.deliveryFee)}</b></p>}
                    {selectedOrder.discountAmount > 0 && <p><span>Promo Discount{selectedOrder.appliedPromoCode ? ` · ${selectedOrder.appliedPromoCode}` : ""}</span><b>−{formatPHP(selectedOrder.discountAmount)}</b></p>}
                    {selectedOrder.staffDiscountAmount > 0 && <p><span>Staff Discount · {["percent","percentage"].includes(selectedOrder.staffDiscountMode) ? `${selectedOrder.staffDiscountValue}%` : selectedOrder.staffDiscountMode === "fixed" ? formatPHP(selectedOrder.staffDiscountValue) : "manual"}</span><b>−{formatPHP(selectedOrder.staffDiscountAmount)}</b></p>}
                    {selectedOrder.pointsDiscount > 0 && <p><span>Points Discount</span><b>−{formatPHP(selectedOrder.pointsDiscount)}</b></p>}
                    {selectedOrder.promoShippingSubsidy > 0 && <p><span>Shipping Promo</span><b>−{formatPHP(selectedOrder.promoShippingSubsidy)}</b></p>}
                    {selectedOrder.storeCreditsUsed > 0 && <p><span>Store Credits Used</span><b>−{formatPHP(selectedOrder.storeCreditsUsed)}</b></p>}
                  </div>
                </details>}
              </div>
            </details>
            </section>

            <section hidden={orderDetailTab !== "flags"}>
            {selectedOrder.ocrAnalysis && <details className="serverless-disclosure"><summary>Receipt Check Details</summary><div className="serverless-disclosure__body space-y-1 text-xs">
              <b>Automated image checks · staff payment verification still required</b>
              {selectedOrder.ocrAnalysis.forensicsResult && <p>{selectedOrder.ocrAnalysis.forensicsResult}</p>}
              {Array.isArray(selectedOrder.ocrAnalysis.forensicsFlags) && selectedOrder.ocrAnalysis.forensicsFlags.length > 0 && <div className="rounded border border-rose-200 bg-rose-50 p-2 text-rose-950"><b>Reuse Indicators</b><ul className="mt-1 list-disc pl-4">{selectedOrder.ocrAnalysis.forensicsFlags.map((flag: any, index: number) => <li key={`${flag.kind}-${flag.orderId || index}`}>{flag.kind === "REFERENCE_REUSE" ? "Reference number seen on another order" : flag.kind === "EXACT_SCAN_IMAGE_REUSE" || flag.kind === "EXACT_UPLOADED_IMAGE_REUSE" ? "Exact image fingerprint seen on another order" : flag.kind === "RECEIPT_IMAGE_CHANGED_ON_ORDER" ? "Receipt image changed after an earlier scan or submission" : "Receipt reuse indicator"}{flag.orderNumber ? ` · Order #${flag.orderNumber}` : ""}</li>)}</ul></div>}
              {selectedOrder.ocrAnalysis.rawImageSha256 && <p className="break-all"><b>File Fingerprint:</b> {selectedOrder.ocrAnalysis.rawImageSha256}</p>}
              {selectedOrder.ocrAnalysis.pixelFingerprintSha256 && <p className="break-all"><b>Pixel Sample Fingerprint:</b> {selectedOrder.ocrAnalysis.pixelFingerprintSha256}</p>}
              {selectedOrder.ocrAnalysis.rawSummary && <details className="mt-2 border bg-white"><summary className="cursor-pointer p-2 font-bold">Older Text-Scan Result</summary><div className="max-h-64 space-y-1 overflow-y-auto border-t p-2">{selectedOrder.ocrAnalysis.rawSummary}<p>Detected amount: {formatPHP(Number(selectedOrder.ocrAnalysis.amountPaid) || 0)} · Reference: {selectedOrder.ocrAnalysis.referenceNumber || "Unreadable"}</p>{selectedOrder.ocrAnalysis.providerResponse && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t p-2 text-[10px]">{selectedOrder.ocrAnalysis.providerResponse}</pre>}{Array.isArray(selectedOrder.ocrAnalysis.extractedFields) && selectedOrder.ocrAnalysis.extractedFields.map((field: any, index: number) => <p key={`${field.label}-${index}`} className="break-words border-b py-1"><b>{field.label}: </b>{field.value}</p>)}</div></details>}
              <p className="font-bold text-amber-800">Image matches are review clues only. They do not prove payment or image tampering. Verify the transaction directly with the payment provider.</p>
            </div></details>}
            </section>
            <section hidden={orderDetailTab !== "fulfillment"}>
            {selectedOrder.notes && <details className="serverless-disclosure"><summary>Order Notes</summary><div className="serverless-disclosure__body text-xs">{selectedOrder.notes}</div></details>}
            </section>


          </div>
        )}

        {editing && editingItemIndex !== null && itemDraft && editItems[editingItemIndex] && <div className="serverless-item-edit-backdrop" role="presentation">
          <section className="serverless-item-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="serverless-item-edit-title">
            <header className="serverless-item-edit-sheet__header">
              <div className="min-w-0"><span>Order Item</span><h2 id="serverless-item-edit-title">Edit {editItems[editingItemIndex].name}</h2></div>
              <button type="button" onClick={() => { setEditingItemIndex(null); setItemDraft(null); }} aria-label="Close item editor"><X /></button>
            </header>
            <div className="serverless-item-edit-sheet__body">
              <label className="serverless-item-edit-price">Selling Price Per Item<input autoFocus type="number" min="0" step="0.01" inputMode="decimal" value={itemDraft.price} onChange={(event) => setItemDraft((draft: any) => ({ ...draft, price: event.target.value }))} /><small>Before any item offer</small></label>
              <div className="serverless-item-edit-quantity"><span>Quantity <small>Up to {Number(itemDraft.reservedQuantity) || 1} reserved</small></span><div>
                <button type="button" aria-label="Decrease quantity" disabled={Number(itemDraft.quantity) <= 1} onClick={() => setItemDraft((draft: any) => ({ ...draft, quantity: String(Math.max(1, (Number(draft.quantity) || 1) - 1)) }))}><Minus /></button>
                <input aria-label="Quantity" type="number" min="1" max={Number(itemDraft.reservedQuantity) || 1} step="1" inputMode="numeric" value={itemDraft.quantity} onChange={(event) => setItemDraft((draft: any) => ({ ...draft, quantity: event.target.value }))} />
                <button type="button" aria-label="Increase quantity" disabled={Number(itemDraft.quantity) >= (Number(itemDraft.reservedQuantity) || 1)} onClick={() => setItemDraft((draft: any) => ({ ...draft, quantity: String(Math.min(Number(draft.reservedQuantity) || 1, (Number(draft.quantity) || 1) + 1)) }))}><Plus /></button>
              </div></div>
              <div className="serverless-item-edit-offer">
                <button type="button" role="switch" aria-checked={Boolean(itemDraft.offerEnabled)} onClick={() => setItemDraft((draft: any) => ({ ...draft, offerEnabled: !draft.offerEnabled, offerMode: draft.offerMode === "none" ? "percent" : draft.offerMode }))}>
                  <span><b>Apply Offer</b><small>Discount this item or give it free</small></span><span className="serverless-item-edit-switch" aria-hidden="true" />
                </button>
                {itemDraft.offerEnabled && <div className="serverless-item-edit-offer__options">
                  <div className="serverless-item-edit-choice"><label><input type="radio" name="item-offer-mode" checked={itemDraft.offerMode !== "free"} onChange={() => setItemDraft((draft: any) => ({ ...draft, offerMode: "percent" }))} /> Give Discount</label><label><input type="radio" name="item-offer-mode" checked={itemDraft.offerMode === "free"} onChange={() => setItemDraft((draft: any) => ({ ...draft, offerMode: "free", offerValue: "0" }))} /> Give as Free</label></div>
                  {itemDraft.offerMode !== "free" && <div className="serverless-item-edit-discount"><label>Discount Type<select value={itemDraft.offerMode === "fixed" ? "fixed" : "percent"} onChange={(event) => setItemDraft((draft: any) => ({ ...draft, offerMode: event.target.value }))}><option value="percent">By Percentage</option><option value="fixed">PHP Off Per Item</option></select></label><label>{itemDraft.offerMode === "fixed" ? "Amount Off Each" : "Percentage Off"}<span>{itemDraft.offerMode === "fixed" ? "₱" : "%"}<input type="number" min="0" max={itemDraft.offerMode === "fixed" ? undefined : "100"} step="0.01" inputMode="decimal" value={itemDraft.offerValue} onChange={(event) => setItemDraft((draft: any) => ({ ...draft, offerValue: event.target.value }))} /></span></label></div>}
                </div>}
              </div>
              {(() => {
                const price = Math.max(0, Number(itemDraft.price) || 0);
                const mode = itemDraft.offerEnabled ? itemDraft.offerMode : "none";
                const value = Math.max(0, Number(itemDraft.offerValue) || 0);
                const unit = mode === "free" ? 0 : mode === "percent" ? price * (100 - Math.min(100, value)) / 100 : mode === "fixed" ? Math.max(0, price - value) : price;
                const quantity = Math.min(Number(itemDraft.reservedQuantity) || 1, Math.max(1, Number(itemDraft.quantity) || 1));
                return <div className="serverless-item-edit-total"><span>Updated Line Total</span><strong>{formatPHP(unit * quantity)}</strong><small>{quantity} × {formatPHP(unit)} each</small></div>;
              })()}
              <button type="button" className="serverless-item-edit-remove" onClick={() => { setEditItems((rows) => rows.filter((_, index) => index !== editingItemIndex)); setEditingItemIndex(null); setItemDraft(null); }}><Trash2 /> Remove This Item from the Order</button>
            </div>
            <footer className="serverless-item-edit-sheet__footer"><button type="button" onClick={() => { setEditingItemIndex(null); setItemDraft(null); }}>Cancel</button><button type="button" onClick={saveItemDraft}>Update Item</button></footer>
          </section>
        </div>}

        {receiptOpen && receiptUrl && <div className="serverless-receipt-modal" role="dialog" aria-modal="true" aria-label="Payment receipt viewer" onClick={() => setReceiptOpen(false)}>
          <div className="serverless-receipt-modal__panel" onClick={(event) => event.stopPropagation()}>
            <header><strong>Payment Receipt</strong><a href={receiptUrl} download={`receipt-${selectedOrder?.orderNumber || "order"}`}><Download /> Download</a><button type="button" onClick={() => setReceiptOpen(false)} aria-label="Close receipt viewer"><X /></button></header>
            <div className="serverless-receipt-modal__tools"><button type="button" onClick={() => setReceiptZoom((zoom) => Math.max(0.5, zoom - 0.25))}>−</button><span>{Math.round(receiptZoom * 100)}%</span><button type="button" onClick={() => setReceiptZoom((zoom) => Math.min(4, zoom + 0.25))}>+</button><button type="button" onClick={() => setReceiptZoom(1)}>Reset</button></div>
            <div className="serverless-receipt-modal__scroll"><img src={receiptUrl} alt="Uploaded payment receipt" style={{ width: `${receiptZoom * 100}%`, maxWidth: "none" }} /></div>
          </div>
        </div>}

        {authorized && !selectedId && (
          <div className="space-y-2">
            <div className="serverless-panel-toolbar grid grid-cols-2 gap-1.5">
              <label className="serverless-search min-w-0"><Search aria-hidden="true" className="w-4 h-4 shrink-0" /><input aria-label="Search orders" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" /></label>
              <select aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full min-w-0 border border-slate-200 px-2 py-2 text-xs font-mono">
                <option value="all">All Statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="failed">Failed</option><option value="held">Held</option><option value="processing">Processing</option><option value="ready">Ready</option><option value="packed">Packed</option><option value="dispatched">Dispatched</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option>
              </select>
            </div>
            {!error && <div className="om-list-caption"><span>{statusFilter==='all'?'All Orders':statusFilter[0].toUpperCase()+statusFilter.slice(1)}</span><small>{filteredOrders.length ? `${(currentPage-1)*15+1}–${Math.min(currentPage*15,filteredOrders.length)} of ${filteredOrders.length}` : '0 orders'}</small></div>}
            {filteredOrders.length === 0 && !loading && !error ? (
              <div className="bg-white border border-slate-200 p-8 text-center text-sm text-slate-500"><Clock3 className="w-6 h-6 mx-auto mb-2 text-slate-300" />No orders match this filter.</div>
            ) : pageOrders.map((order) => (
              <article key={order.id} className="serverless-record serverless-order-compact om-order" data-status={String(order.workflow?.stage || order.status).toLowerCase()}>
                <button type="button" onClick={()=>setSelectedId(order.id)} className="om-order-button" aria-label={`Open order ${order.orderNumber || order.id}`}>
                  <div className="om-order-top"><span className="font-mono">#{order.orderNumber || order.id}</span><span className="om-status" data-status={String(order.workflow?.stage || order.status).toLowerCase()}>{order.workflow?.stage || order.status}</span></div>
                  <div className="om-order-main"><strong>{order.customerName || order.telegramName || 'Customer'}</strong><span className="font-mono">{formatPHP(order.totalAmount)}</span></div>
                  <div className="om-order-bottom"><span>{order.courierName ? `${order.courierName} · ${order.deliveryAddress?.courierPaymentMode==='upon_delivery' || order.payableOnDelivery>0?'PUD':'PUC'}` : 'Store sale'} · {order.paymentStatus}</span><small>{timestampMs(order.createdAt)!==null ? new Date(timestampMs(order.createdAt)!).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric'}) : '—'}</small></div>
                </button>
              </article>
            ))}
            {filteredOrders.length > 15 && <nav className="om-pagination font-mono" aria-label="Order pages"><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage}/{pageCount}</span><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
          </div>
        )}
      </div>
    </section>
  );
}
