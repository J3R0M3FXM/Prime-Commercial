"use client";
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { 
  Users, 
  Package, 
  Sliders, 
  Lock, 
  Loader2, 
  ArrowRight, 
  Trash2, 
  Edit2, 
  Eye, 
  EyeOff, 
  Plus, 
  ClipboardList, 
  ArrowLeft, 
  Search, 
  ShieldAlert, 
  ShieldCheck, 
  Globe, 
  Cpu, 
  Monitor, 
  Smartphone, 
  ExternalLink, 
  Copy, 
  Check, 
  RefreshCw, 
  Sparkles, 
  TrendingUp, 
  Clock, 
  Layers, 
  Activity,
  ShoppingBag,
  MapPin,
  Wifi,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Stethoscope,
  Truck,
  Receipt,
  CreditCard,
  Zap,
  Bell,
  Volume2,
  VolumeX,
  Download,
  CheckSquare,
  Square,
  CheckCircle,
  ArrowDownToLine,
  Boxes,
  Printer,
  FileText,
  Fingerprint,
  Link2,
  HelpCircle,
  Info,
  Share2,
  MessageSquare,
  Send,
  User,
  AtSign,
  Hash,
  Compass,
  Phone,
  QrCode,
  Tag,
  Award,
  Gift,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "motion/react";
import { formatPHP } from "@/lib/currency";
import DiagnosticsModule from "@/app/components/admin/diagnostics-module";
import ModifyOrderModal from "@/app/components/admin/modify-order-modal";
import OrderPrintView from "@/app/components/admin/order-print-view";
import ShareOrderModal from "@/app/components/admin/share-order-modal";
import { StaticOrderMap } from "@/app/components/static-order-map";
import dynamic from 'next/dynamic';

const LogisticsModule = dynamic(() => import('@/app/components/admin/logistics-module'), { 
  ssr: false,
  loading: () => <div className="p-8 text-center text-slate-500 font-mono text-sm">Loading Logistics...</div>
});

const ChargesModule = dynamic(() => import('@/app/components/admin/charges-module'), { ssr: false });

const PaymentsModule = dynamic(() => import('@/app/components/admin/payments-module'), { 
  ssr: false,
  loading: () => <div className="p-8 text-center text-slate-500 font-mono text-sm">Loading Payments...</div>
});

const PromosModule = dynamic(() => import('@/app/components/admin/promos-module'), { 
  ssr: false,
  loading: () => <div className="p-8 text-center text-slate-500 font-mono text-sm">Loading Promos...</div>
});

type AdminView = 
  | "dashboard" 
  | "customers" 
  | "customer-detail" 
  | "device-accounts"
  | "orders" 
  | "order-detail" 
  | "products" 
  | "inventory" 
  | "settings" 
  | "analytics"
  | "diagnostics"
  | "logistics"
  | "charges"
  | "payments"
  | "promos";

const ImageUploadField = ({
  label,
  value,
  onChange,
  className = ""
}: {
  label: string;
  value: string;
  onChange: (base64: string) => void;
  className?: string;
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

  const handleFile = (file: File) => {
    setErrorMessage("");
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Invalid file type. Please select an image.");
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
      setErrorMessage(`File size (${fileSizeMB}MB) exceeds the maximum 10MB limit per image.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        onChange(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-widest">
          {label}
        </label>
        <span className="text-[9px] font-mono text-slate-400">Max 10MB</span>
      </div>
      
      {value ? (
        <div className="relative border border-slate-200 rounded-xl p-2 bg-slate-50 flex items-center gap-3">
          <img
            src={value}
            alt="Preview"
            className="w-16 h-16 object-cover rounded-lg border border-slate-200 bg-white"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "https://picsum.photos/seed/prime/100";
            }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider font-mono">Image Selected</p>
            <p className="text-[9px] text-slate-400 font-mono truncate max-w-[200px]">Base64 Data String</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setErrorMessage("");
              onChange("");
            }}
            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-[9px] font-bold uppercase tracking-wider font-mono cursor-pointer"
          >
            Remove
          </button>
        </div>
      ) : (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all ${
            errorMessage
              ? "border-red-300 bg-red-50/50"
              : dragActive
              ? "border-slate-900 bg-slate-50"
              : "border-slate-200 hover:border-slate-400 hover:bg-slate-50/50"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleChange}
            accept="image/*"
            className="hidden"
          />
          <svg
            className={`w-6 h-6 ${errorMessage ? "text-red-400" : "text-slate-400"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <div className="text-center">
            <span className="font-bold text-slate-900 text-[10px] uppercase tracking-wider">
              Upload File
            </span>
            <p className="text-[9px] text-slate-400 mt-0.5">Drag & drop or click to browse (up to 10MB per image)</p>
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="text-[10px] font-mono text-red-600 font-bold mt-1">
          {errorMessage}
        </p>
      )}
    </div>
  );
};

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminUser, setAdminUser] = useState<any>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // PWA install state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPWAInstalled, setIsPWAInstalled] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isStandalone = 
        window.matchMedia("(display-mode: standalone)").matches || 
        (window.navigator as any).standalone === true;
      setIsPWAInstalled(isStandalone);

      const userAgent = window.navigator.userAgent.toLowerCase();
      setIsIOSDevice(/iphone|ipad|ipod/.test(userAgent));

      const handleBeforeInstall = (e: any) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };

      const handleAppInstalled = () => {
        setIsPWAInstalled(true);
        setDeferredPrompt(null);
      };

      window.addEventListener("beforeinstallprompt", handleBeforeInstall);
      window.addEventListener("appinstalled", handleAppInstalled);

      return () => {
        window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
        window.removeEventListener("appinstalled", handleAppInstalled);
      };
    }
  }, []);

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsPWAInstalled(true);
        setDeferredPrompt(null);
      }
    }
  };

  // Navigation state
  const [view, setView] = useState<AdminView>("dashboard");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedDeviceIdForAccounts, setSelectedDeviceIdForAccounts] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<{ customer: any; fingerprints: any[]; orders: any[] } | null>(null);
  const [loadingCustomerDetail, setLoadingCustomerDetail] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Data Collections
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Helper function to resolve all accounts linked to a specific device ID
  const getAccountsLinkedToDevice = useCallback((devId: string) => {
    if (!devId || devId === "Not captured" || devId === "None" || devId === "Unassigned") return [];

    const accountMap = new Map<string, {
      accountId: string;
      customerName: string;
      telegramId: string;
      phone: string;
      primeMemberId: string;
      orderCount: number;
      totalSpent: number;
      lastActive: string | null;
      orders: any[];
      customerRecord?: any;
    }>();

    // 1. Scan all orders
    (orders || []).forEach((ord) => {
      const ordDevId = ord.deviceSnapshot?.deviceId 
        || ord.deviceId 
        || ord.deviceSnapshot?.device_id 
        || ord.deviceSnapshot?.hardwareId
        || ord.deviceFingerprint 
        || ord.deviceSnapshot?.deviceFingerprint;

      if (ordDevId && String(ordDevId).trim() === String(devId).trim()) {
        const primeId = ord.customer?.primeMemberId || ord.primeMemberId || "";
        const tgId = ord.customer?.tgUserId || ord.tgUserId || ord.customerTelegramId || "";
        const phone = ord.receiverPhone || ord.customerPhone || ord.customer?.phone || "";
        const name = ord.customerName || ord.customer?.tgName || ord.receiverName || "Customer Account";
        
        const key = primeId || tgId || phone || name || ord.customerId || `acc-${ord.id}`;

        const existing = accountMap.get(key) || {
          accountId: key,
          customerName: name,
          telegramId: tgId,
          phone: phone || "Not provided",
          primeMemberId: primeId || (tgId ? `PRIME-${tgId}` : "N/A"),
          orderCount: 0,
          totalSpent: 0,
          lastActive: null,
          orders: [] as any[]
        };

        existing.orderCount += 1;
        existing.totalSpent += Number(ord.totalAmount || 0);
        existing.orders.push(ord);

        const ordDate = ord.createdAt || ord.timestamp;
        if (ordDate) {
          if (!existing.lastActive || new Date(ordDate) > new Date(existing.lastActive)) {
            existing.lastActive = ordDate;
          }
        }

        accountMap.set(key, existing);
      }
    });

    // 2. Cross-reference with registered customers collection
    (customers || []).forEach((cust) => {
      const custDevId = cust.deviceId || cust.latestFingerprint?.deviceId;
      const key = cust.primeMemberId || cust.tgUserId || cust.phone || cust.id;
      if (custDevId && String(custDevId).trim() === String(devId).trim() && key) {
        if (!accountMap.has(key)) {
          accountMap.set(key, {
            accountId: key,
            customerName: cust.tgName || cust.name || "Customer Account",
            telegramId: cust.tgUserId || "",
            phone: cust.phone || "Not provided",
            primeMemberId: cust.primeMemberId || (cust.tgUserId ? `PRIME-${cust.tgUserId}` : "N/A"),
            orderCount: cust.orderCount || 0,
            totalSpent: cust.totalSpent || 0,
            lastActive: cust.lastActive || cust.lastSeen || cust.createdAt || null,
            orders: [],
            customerRecord: cust
          });
        } else {
          const item = accountMap.get(key)!;
          item.customerRecord = cust;
          if (cust.tgName) item.customerName = cust.tgName;
          if (cust.primeMemberId) item.primeMemberId = cust.primeMemberId;
          if (cust.tgUserId) item.telegramId = cust.tgUserId;
        }
      }
    });

    return Array.from(accountMap.values());
  }, [orders, customers]);

  // Search & Filters per module
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState<"all" | "admin" | "premium" | "recent">("all");

  const [orderSearch, setOrderSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState<"all" | "Processing" | "Completed" | "Pending">("all");

  const [productSearch, setProductSearch] = useState("");
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState<"all" | "low" | "out">("all");

  // Copied feedback & Toast
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const copyToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [zoomedProofImage, setZoomedProofImage] = useState<string | null>(null);

  // Modify Order state
  const [modifyingOrder, setModifyingOrder] = useState<any | null>(null);
  const [isModifyModalOpen, setIsModifyModalOpen] = useState<boolean>(false);

  // QR Code Scanner Modal state
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [qrZoomedOrder, setQrZoomedOrder] = useState<any | null>(null);

  // Bulk Order Selection & Actions
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState<boolean>(false);

  // Print Order configuration states
  const [printPaperFormat, setPrintPaperFormat] = useState<"standard" | "thermal">("standard");
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);

  const handleTriggerPrint = (format?: "standard" | "thermal") => {
    if (format) {
      setPrintPaperFormat(format);
    }
    setTimeout(() => {
      if (typeof window !== "undefined") {
        window.print();
      }
    }, 50);
  };

  // Silent Real-Time Background Sync states & refs
  const [silentSyncEnabled, setSilentSyncEnabled] = useState(true);

  // Sound preferences persisted in localStorage per event type
  const [soundSettings, setSoundSettings] = useState<{
    master: boolean;
    newOrder: boolean;
    paymentProof: boolean;
  }>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("admin_sound_settings");
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return { master: true, newOrder: true, paymentProof: true };
  });

  const [isSoundSettingsModalOpen, setIsSoundSettingsModalOpen] = useState(false);

  // Sync sound settings to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("admin_sound_settings", JSON.stringify(soundSettings));
      } catch (e) {}
    }
  }, [soundSettings]);

  const [lastSilentSync, setLastSilentSync] = useState<Date>(new Date());
  const [isSilentSyncing, setIsSilentSyncing] = useState(false);
  const [liveToast, setLiveToast] = useState<{
    id: string;
    title: string;
    message: string;
    type: "proof" | "order" | "info";
    orderId?: string;
    orderNumber?: string;
  } | null>(null);

  const ordersRef = useRef<any[]>(orders);
  ordersRef.current = orders;

  const isSilentSyncingRef = useRef(false);
  const prevOrderMapRef = useRef<Map<string, any>>(new Map());
  const hasInitializedOrdersRef = useRef(false);

  // Web Audio notification chime with per-event sound toggles
  const playChime = useCallback((type: "proof" | "order" = "proof", forcePlay = false) => {
    if (!forcePlay) {
      if (!soundSettings.master) return;
      if (type === "proof" && !soundSettings.paymentProof) return;
      if (type === "order" && !soundSettings.newOrder) return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "proof") {
        // High-pitched ascending chime: 659.25Hz (E5) -> 880Hz (A5)
        osc.type = "sine";
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else {
        // Warm notification tone: 523.25Hz (C5) -> 659.25Hz (E5)
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.14);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch (e) {
      // Audio context might be restricted before user gesture, safe to ignore
    }
  }, [soundSettings]);

  // Custom non-blocking dialogs for sandbox iframes
  const [customConfirm, setCustomConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: "",
    message: "",
    onConfirm: () => {}
  });

  const [customAlert, setCustomAlert] = useState<{
    open: boolean;
    title: string;
    message: string;
    type: "error" | "success" | "info";
  }>({
    open: false,
    title: "",
    message: "",
    type: "info"
  });

  const showAlert = (message: string, title = "Notification", type: "error" | "success" | "info" = "info") => {
    setCustomAlert({ open: true, title, message, type });
  };

  const showConfirm = (message: string, onConfirm: () => void, title = "Confirm Action") => {
    setCustomConfirm({ open: true, title, message, onConfirm });
  };

  const copyToClipboard = (text: string, key: string, toastLabel?: string) => {
    if (!text || text === "Not captured" || text === "None" || text === "Unassigned") return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);

      if (toastLabel) {
        const msg = `${toastLabel.toUpperCase()} SUCCESSFULLY COPIED`;
        setCopyToast(msg);
        if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
        copyToastTimerRef.current = setTimeout(() => {
          setCopyToast(null);
        }, 2500);
      }
    }
  };

  // Dedicated Silent Refresh across the entire Admin Panel
  const fetchSilentData = useCallback(async () => {
    if (isSilentSyncingRef.current) return;
    isSilentSyncingRef.current = true;
    setIsSilentSyncing(true);

    try {
      const t = Date.now();
      const [ordRes, custRes, prodRes] = await Promise.all([
        fetch(`/api/admin/orders?_t=${t}`, { cache: "no-store" }),
        fetch(`/api/admin/customers?_t=${t}`, { cache: "no-store" }),
        fetch(`/api/products?_t=${t}`, { cache: "no-store" }),
      ]);

      if (ordRes.ok) {
        const newOrders: any[] = await ordRes.json();
        const prevMap = prevOrderMapRef.current;

        if (hasInitializedOrdersRef.current && prevMap.size > 0) {
          let detectedProofOrder: any = null;
          let detectedNewOrder: any = null;

          for (const newOrd of newOrders) {
            const prevOrd = prevMap.get(newOrd.id);
            if (prevOrd) {
              const hadProof = Boolean(prevOrd.paymentProofImage);
              const hasProof = Boolean(newOrd.paymentProofImage);
              const proofChanged = prevOrd.paymentProofImage !== newOrd.paymentProofImage;

              if ((!hadProof && hasProof) || (hadProof && hasProof && proofChanged)) {
                detectedProofOrder = newOrd;
                break;
              }
            } else {
              detectedNewOrder = newOrd;
            }
          }

          if (detectedProofOrder) {
            playChime("proof");
            setLiveToast({
              id: `proof-${Date.now()}`,
              title: "Payment Proof Uploaded",
              message: `Order #${detectedProofOrder.orderNumber || ""} has received payment proof.`,
              type: "proof",
              orderId: detectedProofOrder.id,
              orderNumber: detectedProofOrder.orderNumber,
            });
          } else if (detectedNewOrder) {
            playChime("order");
            setLiveToast({
              id: `order-${Date.now()}`,
              title: "New Order Placed",
              message: `Order #${detectedNewOrder.orderNumber || ""} was placed by ${detectedNewOrder.customerName || "Customer"}.`,
              type: "order",
              orderId: detectedNewOrder.id,
              orderNumber: detectedNewOrder.orderNumber,
            });
          }
        }

        const newMap = new Map<string, any>();
        newOrders.forEach(o => newMap.set(o.id, o));
        prevOrderMapRef.current = newMap;
        hasInitializedOrdersRef.current = true;

        setOrders(newOrders);
        ordersRef.current = newOrders;
      }

      if (custRes.ok) {
        setCustomers(await custRes.json());
      }
      if (prodRes.ok) {
        setProducts(await prodRes.json());
      }

      setLastSilentSync(new Date());
    } catch (err) {
      console.warn("Silent sync error:", err);
    } finally {
      isSilentSyncingRef.current = false;
      setIsSilentSyncing(false);
    }
  }, [playChime]);

  const fetchAllData = async () => {
    setRefreshing(true);
    try {
      const t = Date.now();
      const [custRes, prodRes, ordRes] = await Promise.all([
        fetch(`/api/admin/customers?_t=${t}`, { cache: "no-store" }),
        fetch(`/api/products?_t=${t}`, { cache: "no-store" }),
        fetch(`/api/admin/orders?_t=${t}`, { cache: "no-store" })
      ]);
      if (custRes.ok) setCustomers(await custRes.json());
      if (prodRes.ok) setProducts(await prodRes.json());
      if (ordRes.ok) {
        const orderData = await ordRes.json();
        setOrders(orderData);
        ordersRef.current = orderData;
        const map = new Map<string, any>();
        orderData.forEach((o: any) => map.set(o.id, o));
        prevOrderMapRef.current = map;
        hasInitializedOrdersRef.current = true;
      }
      setLastSilentSync(new Date());
    } catch (e) {
      console.error("Failed to load admin data", e);
    } finally {
      setRefreshing(false);
    }
  };

  // Silent Real-Time Background Polling Effect
  useEffect(() => {
    if (!authorized || !silentSyncEnabled) return;

    // Fast 3.5s refresh on Orders Management and Order Details views, 6s on other modules
    const pollInterval = (view === "orders" || view === "order-detail") ? 3500 : 6000;

    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchSilentData();
    }, pollInterval);

    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetchSilentData();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [authorized, silentSyncEnabled, view, fetchSilentData]);

  // Auto-dismiss live toast after 7s
  useEffect(() => {
    if (!liveToast) return;
    const t = setTimeout(() => {
      setLiveToast(null);
    }, 7000);
    return () => clearTimeout(t);
  }, [liveToast]);

  // Fetch individual customer detailed dossier
  const fetchCustomerDetail = async (id: string) => {
    setLoadingCustomerDetail(true);
    try {
      const res = await fetch(`/api/admin/customers?id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setCustomerDetail(data);
      }
    } catch (err) {
      console.error("Failed to fetch customer detail:", err);
    } finally {
      setLoadingCustomerDetail(false);
    }
  };

  // Auto-authentication check
  useEffect(() => {
    async function verifyTelegramAdmin() {
      try {
        if (typeof window !== "undefined") {
          const isSessionAuth = 
            sessionStorage.getItem("prime_admin_authorized") === "true" || 
            localStorage.getItem("prime_admin_authorized") === "true";
          const storedUserId = 
            sessionStorage.getItem("prime_admin_user_id") || 
            localStorage.getItem("prime_admin_user_id");
          const storedPhotoUrl = 
            sessionStorage.getItem("prime_admin_photo_url") || 
            localStorage.getItem("prime_admin_photo_url");

          if (isSessionAuth) {
            setAuthorized(true);
            if (storedUserId) setAdminUser({ id: storedUserId, photoUrl: storedPhotoUrl || "" });
            await fetchAllData();
            setCheckingAuth(false);
            return;
          }
        }

        let initDataRaw = "";
        if (typeof window !== "undefined") {
          if (window.location.hash) {
            const hashStr = window.location.hash.substring(1);
            const params = new URLSearchParams(hashStr);
            const tgData = params.get("tgWebAppData");
            if (tgData) initDataRaw = tgData;
            else if (hashStr.includes("user=") || hashStr.includes("hash=")) initDataRaw = hashStr;
          }
          if (!initDataRaw && window.location.search) {
            const searchParams = new URLSearchParams(window.location.search);
            const tgData = searchParams.get("tgWebAppData") || searchParams.get("initData");
            if (tgData) initDataRaw = tgData;
          }
          if (!initDataRaw && (window as any).Telegram?.WebApp?.initData) {
            initDataRaw = (window as any).Telegram.WebApp.initData;
          }
        }

        if (initDataRaw) {
          const res = await fetch("/api/admin/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData: initDataRaw })
          });
          const data = await res.json();

          if (data.success && data.isAdmin) {
            if (typeof window !== "undefined") {
              sessionStorage.setItem("prime_admin_authorized", "true");
              sessionStorage.setItem("prime_admin_user_id", data.user?.id || "1085949511");
              if (data.user?.photoUrl) sessionStorage.setItem("prime_admin_photo_url", data.user.photoUrl);
              
              localStorage.setItem("prime_admin_authorized", "true");
              localStorage.setItem("prime_admin_user_id", data.user?.id || "1085949511");
              if (data.user?.photoUrl) localStorage.setItem("prime_admin_photo_url", data.user.photoUrl);
            }
            setAuthorized(true);
            setAdminUser(data.user || { id: "1085949511" });
            await fetchAllData();
            setCheckingAuth(false);
            return;
          }
        }
      } catch (err) {
        console.error("Admin auto-auth failed:", err);
      } finally {
        setCheckingAuth(false);
      }
    }

    verifyTelegramAdmin();
  }, []);

  // When selected customer changes, load detail dossier
  useEffect(() => {
    if (selectedCustomerId) {
      fetchCustomerDetail(selectedCustomerId);
    } else {
      setCustomerDetail(null);
    }
  }, [selectedCustomerId]);

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.success) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("prime_admin_authorized", "true");
        }
        setAuthorized(true);
        fetchAllData();
      } else {
        setErrorMsg(data.error || "Invalid Access Code");
      }
    } catch {
      setErrorMsg("Connection Error");
    } finally {
      setLoading(false);
    }
  };

  // Product Operations
  const handleToggleProductActive = async (product: any) => {
    const newActive = product.active === false ? true : false;
    try {
      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id, active: newActive })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, active: newActive } : p));
    } catch (e: any) {
      console.error(e);
      showAlert(`Failed to update product status: ${e.message || String(e)}`, "Error", "error");
    }
  };

  const handleDeleteProduct = async (id: string) => {
    showConfirm(
      "Are you sure you want to permanently delete this product? This action cannot be undone.",
      async () => {
        try {
          const res = await fetch("/api/admin/products", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error ${res.status}`);
          }
          setProducts(prev => prev.filter(p => p.id !== id));
          showAlert("Product deleted successfully.", "Success", "success");
        } catch (e: any) {
          console.error(e);
          showAlert(`Failed to delete product: ${e.message || String(e)}`, "Error", "error");
        }
      },
      "Delete Product"
    );
  };

  const handleSaveProduct = async (productData: any) => {
    try {
      let res;
      if (editingProduct?.id) {
        res = await fetch("/api/admin/products", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingProduct.id, ...productData })
        });
      } else {
        res = await fetch("/api/admin/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(productData)
        });
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }
      setProductModalOpen(false);
      setEditingProduct(null);
      fetchAllData();
      showAlert("Product saved successfully.", "Success", "success");
    } catch (e: any) {
      console.error(e);
      showAlert(`Failed to save product: ${e.message || String(e)}`, "Error", "error");
    }
  };

  // Product Reordering / Sort Positioning
  const handleMoveProductOrder = async (productId: string, direction: "up" | "down") => {
    // Current sorted list
    const sorted = [...products].sort((a: any, b: any) => {
      const orderA = typeof a.sortOrder === "number" ? a.sortOrder : 999999;
      const orderB = typeof b.sortOrder === "number" ? b.sortOrder : 999999;
      return orderA - orderB;
    });

    const currentIndex = sorted.findIndex(p => p.id === productId);
    if (currentIndex === -1) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    // Swap positions
    const temp = sorted[currentIndex];
    sorted[currentIndex] = sorted[targetIndex];
    sorted[targetIndex] = temp;

    // Reassign normalized sequential sortOrders (1, 2, 3...)
    const updates = sorted.map((p, idx) => ({
      id: p.id,
      sortOrder: idx + 1
    }));

    // Optimistic update
    const orderMap = new Map(updates.map(u => [u.id, u.sortOrder]));
    setProducts(prev => prev.map(p => ({
      ...p,
      sortOrder: orderMap.get(p.id) ?? p.sortOrder ?? 999999
    })).sort((a: any, b: any) => (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999)));

    try {
      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder: updates })
      });
      if (!res.ok) {
        throw new Error("Failed to persist product sort order");
      }
      setLiveToast({
        id: `sort-${Date.now()}`,
        title: "Sort Order Updated",
        message: `Product display ranking successfully rearranged.`,
        type: "info"
      });
    } catch (err: any) {
      console.error("Sort order persist error:", err);
      fetchAllData();
    }
  };

  const handleSetProductSortOrder = async (productId: string, newSortOrder: number) => {
    const safeOrder = Math.max(1, newSortOrder);
    try {
      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId, sortOrder: safeOrder })
      });
      if (!res.ok) throw new Error("Failed to update sort order");
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, sortOrder: safeOrder } : p).sort((a: any, b: any) => (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999)));
      setLiveToast({
        id: `sort-${Date.now()}`,
        title: "Sort Priority Saved",
        message: `Product set to sort position #${safeOrder}.`,
        type: "info"
      });
    } catch (err: any) {
      console.error(err);
      showAlert("Failed to update sort order.", "Error", "error");
    }
  };

  // Inventory Stock Adjustments (Main Product)
  const handleAdjustStock = async (productId: string, currentStock: number, delta: number) => {
    const newStock = Math.max(0, currentStock + delta);
    try {
      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId, stock: newStock })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, stock: newStock } : p));
    } catch (e: any) {
      console.error(e);
      showAlert(`Failed to adjust stock: ${e.message || String(e)}`, "Error", "error");
    }
  };

  const handleSetProductStockDirect = async (productId: string, newStockValue: number) => {
    const safeStock = Math.max(0, newStockValue);
    try {
      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId, stock: safeStock })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, stock: safeStock } : p));
    } catch (e: any) {
      console.error(e);
      showAlert(`Failed to update stock: ${e.message || String(e)}`, "Error", "error");
    }
  };

  // Inventory Stock Adjustments (Per Variant)
  const handleAdjustVariantStock = async (productId: string, variantId: string, currentStock: number, delta: number) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    const currentVariants = prod.variants || [];
    const newStock = Math.max(0, currentStock + delta);
    const updatedVariants = currentVariants.map((v: any) => {
      if (v.id === variantId) {
        return { ...v, stock: newStock };
      }
      return v;
    });
    const totalStock = updatedVariants.reduce((sum: number, v: any) => sum + (Number(v.stock) || 0), 0);

    try {
      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId, variants: updatedVariants, stock: totalStock })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, variants: updatedVariants, stock: totalStock } : p));
    } catch (e: any) {
      console.error(e);
      showAlert(`Failed to adjust variant stock: ${e.message || String(e)}`, "Error", "error");
    }
  };

  const handleSetVariantStockDirect = async (productId: string, variantId: string, newStockValue: number) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    const currentVariants = prod.variants || [];
    const safeStock = Math.max(0, newStockValue);
    const updatedVariants = currentVariants.map((v: any) => {
      if (v.id === variantId) {
        return { ...v, stock: safeStock };
      }
      return v;
    });
    const totalStock = updatedVariants.reduce((sum: number, v: any) => sum + (Number(v.stock) || 0), 0);

    try {
      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId, variants: updatedVariants, stock: totalStock })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, variants: updatedVariants, stock: totalStock } : p));
    } catch (e: any) {
      console.error(e);
      showAlert(`Failed to set variant stock: ${e.message || String(e)}`, "Error", "error");
    }
  };

  // Order status update with background animation transition & feedback
  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    setStatusUpdatingId(orderId);
    setUpdatingToStatus(status);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update order status");
      }
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      setStatusJustSaved({ orderId, status, ts: Date.now() });
      setTimeout(() => {
        setStatusJustSaved(null);
      }, 3500);
      if (selectedCustomerId) {
        fetchCustomerDetail(selectedCustomerId);
      }
    } catch (e: any) {
      console.error(e);
      showAlert(`Failed to update status: ${e.message || String(e)}`, "Error", "error");
    } finally {
      setStatusUpdatingId(null);
      setUpdatingToStatus(null);
    }
  };

  const handleUpdateOrderPaymentStatus = async (orderId: string, paymentStatus: string) => {
    try {
      await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, paymentStatus })
      });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, paymentStatus } : o));
      if (selectedCustomerId) {
        fetchCustomerDetail(selectedCustomerId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Simulate test order for customer
  const handleSimulateOrder = async (customerId: string, customerName: string, primeMemberId: string) => {
    try {
      const sampleItem = products[0] || { id: "item-1", name: "PRIME Special Drop", price: 99 };
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          customerName,
          primeMemberId,
          items: [{ id: sampleItem.id, name: sampleItem.name, price: sampleItem.price, quantity: 1 }],
          totalAmount: sampleItem.price,
          notes: "Simulated Test Order via Customer Dossier"
        })
      });
      if (res.ok) {
        await fetchCustomerDetail(customerId);
        fetchAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Handle successful order modification from modal
  const handleOrderModified = (updatedOrder: any) => {
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o));
    if (selectedCustomerId) {
      fetchCustomerDetail(selectedCustomerId);
    }
    setLiveToast({
      id: `mod-${Date.now()}`,
      title: "Order Modified",
      message: `Order #${updatedOrder.orderNumber || updatedOrder.id} successfully updated. Total: ${formatPHP(updatedOrder.totalAmount)}.`,
      type: "info",
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
    });
  };

  // Bulk status update handler
  const handleBulkUpdateOrderStatus = async (newStatus: "Processing" | "Completed" | "Pending") => {
    if (selectedOrderIds.length === 0) return;
    setIsBulkUpdating(true);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedOrderIds,
          status: newStatus
        })
      });
      if (!res.ok) {
        throw new Error(`Failed to update orders: ${res.statusText}`);
      }
      setOrders(prev => prev.map(o => selectedOrderIds.includes(o.id) ? { ...o, status: newStatus } : o));
      const count = selectedOrderIds.length;
      setSelectedOrderIds([]);
      setLiveToast({
        id: `bulk-${Date.now()}`,
        title: "Bulk Status Updated",
        message: `Updated ${count} order(s) to "${newStatus}".`,
        type: "info"
      });
      showAlert(`Successfully updated ${count} orders to "${newStatus}".`, "Bulk Update Successful", "success");
    } catch (err: any) {
      console.error(err);
      showAlert(`Bulk update failed: ${err.message || String(err)}`, "Update Error", "error");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Export current filtered orders to CSV
  const handleExportOrdersCSV = (ordersToExport: any[]) => {
    if (!ordersToExport || ordersToExport.length === 0) {
      showAlert("There are no orders matching the current filter to export.", "No Orders to Export", "info");
      return;
    }

    const headers = [
      "Order Number",
      "Date Placed",
      "Status",
      "Payment Status",
      "Customer Name",
      "Customer Username",
      "Prime Member ID",
      "Total Amount (PHP)",
      "Subtotal (PHP)",
      "Delivery Fee (PHP)",
      "Delivery Free?",
      "Items Count",
      "Items Breakdown",
      "Applied Charges Breakdown",
      "Precise GPS Address (Device Telemetry)",
      "Delivery Address (Destination)",
      "Has Payment Proof"
    ];

    const rows = ordersToExport.map(ord => {
      const itemsList = (ord.items || [])
        .map((it: any) => `${it.name} (Qty: ${it.quantity || 1}, ₱${it.price}${it.isFree ? ' [FREE]' : ''})`)
        .join("; ");
      const chargesList = (ord.appliedCharges || [])
        .map((ch: any) => `${ch.name} (₱${ch.amount}${ch.isFree ? ' [FREE]' : ''})`)
        .join("; ");
      const dateStr = ord.createdAt ? new Date(ord.createdAt).toISOString() : "";
      
      const gpsAddress = resolveOrderGpsStreetAddress(ord, resolvedGpsAddresses, null);
      const deliveryAddress = (() => {
        const raw = ord.deliveryAddress;
        if (!raw) return ord.address || ord.shippingAddress || ord.fullAddress || "N/A";
        if (typeof raw === "string") return raw;
        const parts = [raw.formatted || raw.address || ""];
        if (raw.unitDetails) parts.push(`(${raw.unitDetails})`);
        return parts.filter(Boolean).join(" ").trim() || "N/A";
      })();
      const hasProof = ord.paymentProofImage ? "YES" : "NO";

      return [
        `"${String(ord.orderNumber || ord.id || '').replace(/"/g, '""')}"`,
        `"${dateStr.replace(/"/g, '""')}"`,
        `"${String(ord.status || 'Processing').replace(/"/g, '""')}"`,
        `"${String(ord.paymentStatus || 'Pending').replace(/"/g, '""')}"`,
        `"${String(ord.customerName || '').replace(/"/g, '""')}"`,
        `"${String(ord.customerUsername || '').replace(/"/g, '""')}"`,
        `"${String(ord.primeMemberId || ord.customerId || '').replace(/"/g, '""')}"`,
        Number(ord.totalAmount || 0).toFixed(2),
        Number(ord.subTotal || 0).toFixed(2),
        Number(ord.deliveryFee || 0).toFixed(2),
        ord.isDeliveryFeeFree ? "YES" : "NO",
        ord.items?.length || 0,
        `"${itemsList.replace(/"/g, '""')}"`,
        `"${chargesList.replace(/"/g, '""')}"`,
        `"${String(gpsAddress).replace(/"/g, '""')}"`,
        `"${String(deliveryAddress).replace(/"/g, '""')}"`,
        `"${hasProof}"`
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    link.setAttribute("download", `Prime_Orders_Export_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setLiveToast({
      id: `csv-${Date.now()}`,
      title: "Export Completed",
      message: `Exported ${ordersToExport.length} orders to CSV successfully.`,
      type: "info"
    });
  };

  // Filtered lists
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchSearch = 
        (c.tgName || "").toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.tgUsername || "").toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.tgUserId || "").toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.primeMemberId || "").toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.latestFingerprint?.ipSession || "").includes(customerSearch) ||
        (c.latestFingerprint?.city || "").toLowerCase().includes(customerSearch.toLowerCase());
      
      if (!matchSearch) return false;
      if (customerFilter === "admin") return c.role === "admin";
      if (customerFilter === "premium") return !!c.isPremium;
      return true;
    });
  }, [customers, customerSearch, customerFilter]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const searchLower = orderSearch.toLowerCase();
      const matchSearch = 
        (o.orderNumber || "").toLowerCase().includes(searchLower) ||
        (o.customerName || "").toLowerCase().includes(searchLower) ||
        (o.customerUsername || "").toLowerCase().includes(searchLower) ||
        (String(o.customerId || "")).toLowerCase().includes(searchLower) ||
        (String(o.tgUserId || "")).toLowerCase().includes(searchLower) ||
        (o.primeMemberId || "").toLowerCase().includes(searchLower) ||
        (o.status || "").toLowerCase().includes(searchLower);

      if (!matchSearch) return false;
      if (orderFilter !== "all") return o.status === orderFilter;
      return true;
    });
  }, [orders, orderSearch, orderFilter]);

  const filteredProducts = useMemo(() => {
    return products
      .filter(p => 
        (p.name || "").toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.category || "").toLowerCase().includes(productSearch.toLowerCase()) ||
        (Array.isArray(p.variants) && p.variants.some((v: any) => (v.name || "").toLowerCase().includes(productSearch.toLowerCase())))
      )
      .sort((a: any, b: any) => {
        const orderA = typeof a.sortOrder === "number" ? a.sortOrder : 999999;
        const orderB = typeof b.sortOrder === "number" ? b.sortOrder : 999999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || "").localeCompare(b.name || "");
      });
  }, [products, productSearch]);

  const filteredInventory = useMemo(() => {
    return products
      .filter(p => {
        const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
        const matchSearch = 
          (p.name || "").toLowerCase().includes(inventorySearch.toLowerCase()) ||
          (p.category || "").toLowerCase().includes(inventorySearch.toLowerCase()) ||
          (hasVariants && p.variants.some((v: any) => (v.name || "").toLowerCase().includes(inventorySearch.toLowerCase())));
        if (!matchSearch) return false;

        const effectiveStock = hasVariants
          ? p.variants.reduce((sum: number, v: any) => sum + (Number(v.stock) || 0), 0)
          : (Number(p.stock) || 0);

        const threshold = Number(p.lowStockThreshold) || 10;

        if (inventoryFilter === "low") {
          if (hasVariants) {
            return p.variants.some((v: any) => (Number(v.stock) || 0) > 0 && (Number(v.stock) || 0) <= threshold);
          }
          return effectiveStock > 0 && effectiveStock <= threshold;
        }
        if (inventoryFilter === "out") {
          if (hasVariants) {
            return p.variants.some((v: any) => (Number(v.stock) || 0) === 0);
          }
          return effectiveStock === 0;
        }
        return true;
      })
      .sort((a: any, b: any) => {
        const orderA = typeof a.sortOrder === "number" ? a.sortOrder : 999999;
        const orderB = typeof b.sortOrder === "number" ? b.sortOrder : 999999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || "").localeCompare(b.name || "");
      });
  }, [products, inventorySearch, inventoryFilter]);

  // Products with stock <= their defined lowStockThreshold
  const lowStockProducts = useMemo(() => {
    return products.filter(p => {
      const threshold = p.lowStockThreshold !== undefined ? Number(p.lowStockThreshold) : 10;
      const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
      if (hasVariants) {
        return p.variants.some((v: any) => (Number(v.stock) || 0) <= threshold);
      }
      const stock = Number(p.stock) || 0;
      return stock <= threshold;
    });
  }, [products]);

  const selectedOrder = useMemo(() => {
    return orders.find(o => o.id === selectedOrderId);
  }, [orders, selectedOrderId]);

  // Tracking URL state for Order Details
  const [trackingUrlInput, setTrackingUrlInput] = useState<string>("");
  const [isSavingTrackingUrl, setIsSavingTrackingUrl] = useState<boolean>(false);
  const [trackingSavedSuccess, setTrackingSavedSuccess] = useState<boolean>(false);
  const [showStatusGuide, setShowStatusGuide] = useState<boolean>(false);

  // Status Animation & Feedback State
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [updatingToStatus, setUpdatingToStatus] = useState<string | null>(null);
  const [statusJustSaved, setStatusJustSaved] = useState<{ orderId: string; status: string; ts: number } | null>(null);

  // Share Order Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);

  // Internal Notes State for Order Details
  const [internalNoteInput, setInternalNoteInput] = useState<string>("");
  const [internalNoteAuthor, setInternalNoteAuthor] = useState<string>("Staff Admin");
  const [isSavingInternalNote, setIsSavingInternalNote] = useState<boolean>(false);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

  // Sync tracking input when selectedOrderId or selectedOrder changes
  useEffect(() => {
    if (selectedOrder) {
      setTrackingUrlInput(selectedOrder.trackingUrl || "");
      setTrackingSavedSuccess(false);
    }
  }, [selectedOrderId, selectedOrder?.trackingUrl]);

  const handleSaveTrackingUrl = async (orderId: string, url: string) => {
    setIsSavingTrackingUrl(true);
    setTrackingSavedSuccess(false);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, trackingUrl: url.trim() })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update tracking URL");
      }
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, trackingUrl: url.trim() } : o));
      setTrackingSavedSuccess(true);
      setTimeout(() => setTrackingSavedSuccess(false), 3000);
      showAlert("Courier tracking URL updated and customer tracking button activated.", "Tracking URL Saved", "success");
    } catch (e: any) {
      console.error(e);
      showAlert(`Failed to save tracking URL: ${e.message || String(e)}`, "Error", "error");
    } finally {
      setIsSavingTrackingUrl(false);
    }
  };

  const handleAddInternalNote = async (orderId: string, noteContent: string) => {
    if (!noteContent.trim()) return;
    setIsSavingInternalNote(true);
    try {
      const existingNotes = Array.isArray(selectedOrder?.internalNotes) ? selectedOrder.internalNotes : [];
      const newNoteObj = {
        id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        note: noteContent.trim(),
        author: internalNoteAuthor.trim() || "Staff Admin",
        createdAt: new Date().toISOString()
      };
      const updatedNotes = [newNoteObj, ...existingNotes];

      const res = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, internalNotes: updatedNotes })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save internal note");
      }
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, internalNotes: updatedNotes } : o));
      setInternalNoteInput("");
      setLiveToast({
        id: `note-${Date.now()}`,
        title: "Internal Note Added",
        message: "Comment appended to order log with timestamp.",
        type: "info"
      });
    } catch (err: any) {
      console.error(err);
      showAlert(`Failed to save internal note: ${err.message || String(err)}`, "Error", "error");
    } finally {
      setIsSavingInternalNote(false);
    }
  };

  const handleDeleteInternalNote = async (orderId: string, noteId: string) => {
    try {
      const existingNotes = Array.isArray(selectedOrder?.internalNotes) ? selectedOrder.internalNotes : [];
      const updatedNotes = existingNotes.filter((n: any) => n.id !== noteId);

      const res = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, internalNotes: updatedNotes })
      });
      if (!res.ok) throw new Error("Failed to delete internal note");

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, internalNotes: updatedNotes } : o));
    } catch (err: any) {
      console.error(err);
      showAlert("Failed to delete internal note.", "Error", "error");
    }
  };

  // Reverse geocoding for GPS street-level address in order details
  const [resolvedGpsAddresses, setResolvedGpsAddresses] = useState<Record<string, string>>({});
  const [loadingGpsOrderId, setLoadingGpsOrderId] = useState<string | null>(null);

  /**
   * Strict authoritative resolution of the customer's actual device GPS location captured at order placement.
   * CRITICAL PRODUCTION RULE: 
   * - Telemetry GPS Address is strictly isolated from user-entered shipping/delivery addresses.
   * - If physical device coordinates were NOT captured at order placement time, this function
   *   MUST return "Not captured". It is strictly prohibited from falling back to any shipping/delivery fields.
   */
  const resolveOrderGpsStreetAddress = (
    order: any, 
    resolvedGpsCache?: Record<string, string>, 
    loadingOrderId?: string | null
  ): string => {
    if (!order) return "Not captured";

    // 1. Extract genuine hardware coordinates of customer device at order time
    const loc = order.deviceSnapshot?.location;
    let devLat = Number(loc?.lat ?? loc?.latitude);
    let devLon = Number(loc?.lon ?? loc?.longitude);

    if ((!Number.isFinite(devLat) || !Number.isFinite(devLon) || (devLat === 0 && devLon === 0)) && typeof order.coordinates === 'string') {
      const parts = order.coordinates.split(',').map((s: string) => Number(s.trim()));
      if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && (parts[0] !== 0 || parts[1] !== 0)) {
        devLat = parts[0];
        devLon = parts[1];
      }
    }

    const hasGenuineDeviceCoords = Number.isFinite(devLat) && Number.isFinite(devLon) && (devLat !== 0 || devLon !== 0);

    // CRITICAL: If no genuine hardware coordinates exist, PRECISE GPS ADDRESS is strictly "Not captured".
    if (!hasGenuineDeviceCoords) {
      return "Not captured";
    }

    // 2. Derive delivery address text and delivery coordinates for strict contamination detection
    const rawDeliv = order.deliveryAddress;
    const deliveryText = (() => {
      if (!rawDeliv) return (order.address || order.shippingAddress || order.fullAddress || "");
      if (typeof rawDeliv === "string") return rawDeliv;
      const parts = [
        rawDeliv.formatted || rawDeliv.address || "",
        rawDeliv.unitDetails ? `(${rawDeliv.unitDetails})` : ""
      ].filter(Boolean);
      return parts.join(" ").trim();
    })();

    const cleanDeliv = (deliveryText || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const delivLat = Number(rawDeliv?.lat);
    const delivLon = Number(rawDeliv?.lon);
    const hasDelivCoords = Number.isFinite(delivLat) && Number.isFinite(delivLon) && (delivLat !== 0 || delivLon !== 0);

    // Detect if location coordinates are an unverified replica of the user delivery destination
    const isDuplicateOfDeliveryCoords = hasDelivCoords &&
      Math.abs(devLat - delivLat) < 0.0001 && Math.abs(devLon - delivLon) < 0.0001 &&
      loc?.source !== "Actual Device Hardware GPS";

    if (isDuplicateOfDeliveryCoords) {
      return "Not captured";
    }

    // 3. Check reverse geocoding cache (from verified GPS coordinates lookup)
    if (order.id && resolvedGpsCache?.[order.id]) {
      const cached = resolvedGpsCache[order.id].trim();
      const cleanCached = cached.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanCached && (!cleanDeliv || cleanCached !== cleanDeliv)) {
        return cached;
      }
    }

    // 4. Check primary gpsStreetAddress on order document (if verified not to be delivery address)
    if (order.gpsStreetAddress && typeof order.gpsStreetAddress === "string" && order.gpsStreetAddress.trim()) {
      const cand = order.gpsStreetAddress.trim();
      const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, "");
      
      const matchesDelivery = Boolean(cleanCand && cleanDeliv && (
        cleanCand === cleanDeliv || 
        (cleanCand.length > 15 && cleanDeliv.includes(cleanCand)) || 
        (cleanDeliv.length > 15 && cleanCand.includes(cleanDeliv))
      ));

      if (!matchesDelivery && cleanCand) {
        return cand;
      }
    }

    // 5. Loading state for reverse geocoding
    if (order.id && loadingOrderId === order.id) {
      return "Resolving GPS street address...";
    }

    // 6. Return verified hardware coordinates
    return `${devLat.toFixed(5)}, ${devLon.toFixed(5)}`;
  };

  useEffect(() => {
    if (!selectedOrder) return;
    const orderId = selectedOrder.id;

    // Check if GPS is already resolved cleanly
    const currentResolved = resolveOrderGpsStreetAddress(selectedOrder, resolvedGpsAddresses, null);
    if (currentResolved && currentResolved !== "Not captured" && !currentResolved.includes("Resolving")) {
      return;
    }

    const loc = selectedOrder.deviceSnapshot?.location;
    const devLat = Number(loc?.lat ?? loc?.latitude);
    const devLon = Number(loc?.lon ?? loc?.longitude);
    const delivLat = Number(selectedOrder.deliveryAddress?.lat);
    const delivLon = Number(selectedOrder.deliveryAddress?.lon);

    const hasRealCoords = Number.isFinite(devLat) && Number.isFinite(devLon) && (devLat !== 0 || devLon !== 0);
    const isDeliveryClone = hasRealCoords && Number.isFinite(delivLat) && Number.isFinite(delivLon) &&
      Math.abs(devLat - delivLat) < 0.0001 && Math.abs(devLon - delivLon) < 0.0001 &&
      loc?.source !== "Actual Device Hardware GPS";

    if (hasRealCoords && !isDeliveryClone && !resolvedGpsAddresses[orderId]) {
      setLoadingGpsOrderId(orderId);
      fetch(`/api/geoapify/reverse?lat=${devLat}&lon=${devLon}`)
        .then(res => res.json())
        .then(data => {
          const formatted = data.results?.[0]?.formatted;
          if (formatted) {
            setResolvedGpsAddresses(prev => ({ ...prev, [orderId]: formatted }));
          }
        })
        .catch(err => {
          console.warn("Could not reverse geocode order GPS:", err);
        })
        .finally(() => {
          setLoadingGpsOrderId(null);
        });
    }
  }, [selectedOrder, resolvedGpsAddresses]);

  const deliveryAddressText = useMemo(() => {
    if (!selectedOrder?.deliveryAddress) return "";
    const addr = selectedOrder.deliveryAddress;
    if (typeof addr === "string") return addr;
    const parts = [addr.formatted || addr.address || ""];
    if (addr.unitDetails) parts.push(`(${addr.unitDetails})`);
    return parts.filter(Boolean).join(" ").trim();
  }, [selectedOrder?.deliveryAddress]);

  const gpsStreetAddressText = useMemo(() => {
    return resolveOrderGpsStreetAddress(selectedOrder, resolvedGpsAddresses, loadingGpsOrderId);
  }, [selectedOrder, resolvedGpsAddresses, loadingGpsOrderId]);

  // Auth checking screen
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans antialiased">
        <div className="w-full max-w-md bg-white border border-slate-200 text-slate-900 rounded-3xl flex flex-col items-center justify-center p-8 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-6 shadow-xs">
            <Loader2 className="w-8 h-8 animate-spin text-slate-900" />
          </div>
          <h2 className="text-xl font-heading font-black tracking-widest uppercase mb-1 text-slate-900">Authenticating</h2>
          <p className="font-mono text-xs text-slate-500 text-center">Verifying Telegram Security Credentials (ID: 1085949511)...</p>
        </div>
      </div>
    );
  }

  // Login Gate
  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 font-sans antialiased">
        <div className="w-full max-w-md bg-white border border-slate-200 text-slate-900 p-8 rounded-3xl shadow-xl">
          <div className="flex justify-center mb-6">
            <img 
              src="/prime-logo-metallic.png" 
              alt="PRIME" 
              className="h-8 sm:h-9 w-auto object-contain drop-shadow-xs" 
            />
          </div>
          <h1 className="text-2xl font-heading font-black text-center mb-1 tracking-widest uppercase text-slate-900">Admin</h1>
          <p className="text-[11px] text-slate-500 text-center mb-6 font-mono">
            Authorized Account: ID 1085949511
          </p>
          <form onSubmit={handleManualLogin} className="space-y-4">
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ENTER ADMIN ACCESS CODE"
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-center font-mono focus:border-slate-900 focus:bg-white focus:outline-none transition-colors text-slate-900 text-sm"
            />
            {errorMsg && <p className="text-red-500 text-xs text-center font-mono">{errorMsg}</p>}
            <button 
              type="submit" 
              disabled={loading} 
              className="w-full p-4 bg-slate-900 text-white font-bold uppercase tracking-widest rounded-xl hover:bg-black transition-colors flex items-center justify-center text-xs cursor-pointer shadow-md"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Access Dashboard"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased w-full">
      <div className="flex-1 flex flex-col w-full">
        <AnimatePresence mode="wait">
        
        {/* ========================================================================= */}
        {/* 1. DASHBOARD HUB VIEW (Glossy Tiles, Stats, Header)                       */}
        {/* ========================================================================= */}
        {view === "dashboard" && (
          <motion.div
            key="view-dashboard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="flex-1 w-full mx-auto flex flex-col"
          >
            {/* Harmonized Sticky Header matching Shopfront */}
            <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
                <div className="flex items-center">
                  <img 
                    src="/prime-logo-metallic.png" 
                    alt="PRIME" 
                    className="h-7 sm:h-[28px] w-auto object-contain shrink-0 drop-shadow-xs" 
                  />
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-100/90 border border-slate-200 rounded-lg text-xs font-mono">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isSilentSyncing ? "bg-emerald-500 opacity-75" : "bg-emerald-400 opacity-50"}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${isSilentSyncing ? "bg-emerald-600" : "bg-emerald-500"}`}></span>
                    </span>
                    <span className="text-slate-700 font-bold hidden sm:inline">
                      {isSilentSyncing ? "Syncing..." : "Live Sync"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsSoundSettingsModalOpen(true)}
                      title="Notification Sound Settings (New Order vs Payment Proof)"
                      className="ml-0.5 sm:ml-1 p-0.5 sm:p-1 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      {soundSettings.master ? (
                        <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-500 hidden md:inline">Audio</span>
                    </button>
                  </div>

                  <button
                    onClick={fetchAllData}
                    disabled={refreshing}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium hover:bg-slate-100 transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-slate-900" : "text-slate-500"}`} />
                    <span className="hidden sm:inline">Refresh</span>
                  </button>
                  <button
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        sessionStorage.removeItem("prime_admin_authorized");
                        localStorage.removeItem("prime_admin_authorized");
                        sessionStorage.removeItem("prime_admin_photo_url");
                        localStorage.removeItem("prime_admin_photo_url");
                      }
                      setAuthorized(false);
                    }}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium text-red-600 hover:bg-red-50 transition-colors shadow-2xs cursor-pointer"
                  >
                    Lock
                  </button>
                </div>
              </div>
            </header>

            {/* Dashboard Content Area */}
            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">

            {/* PWA Installation Card Banner */}
            {(!isPWAInstalled && (deferredPrompt || isIOSDevice)) && (
              <div className="mb-6 bg-gradient-to-r from-slate-900 to-indigo-950 border border-indigo-500/20 rounded-2xl p-4 shadow-md text-white relative overflow-hidden">
                <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-24 h-24 bg-white/5 rounded-full blur-xl"></div>
                <div className="flex items-center justify-between gap-4 relative z-10">
                  <div className="flex-1">
                    <h3 className="font-heading font-black text-xs uppercase tracking-widest text-indigo-400 mb-1 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Install Prime PWA
                    </h3>
                    <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
                      Add to your home screen for rapid offline launching, portrait-lock, and secure fast access.
                    </p>
                  </div>
                  {deferredPrompt && (
                    <button
                      onClick={handleInstallPWA}
                      className="px-4 py-2 bg-white text-slate-950 hover:bg-slate-100 rounded-xl text-[10px] font-heading font-black uppercase tracking-widest cursor-pointer transition-colors shrink-0 shadow-md"
                    >
                      Install App
                    </button>
                  )}
                  {isIOSDevice && (
                    <button
                      onClick={() => setShowIOSGuide(true)}
                      className="px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-xl text-[10px] font-heading font-black uppercase tracking-widest cursor-pointer transition-colors shrink-0 shadow-md"
                    >
                      Install iOS
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Management Section Tiles */}
            <div className="mb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {[
                  { id: "customers", name: "Customers", icon: Users, desc: "Profiles & Device Info", count: customers.length },
                  { id: "orders", name: "Orders", icon: ClipboardList, desc: "Order History & Status", count: orders.length },
                  { id: "products", name: "Products", icon: Package, desc: "Catalog Configuration", count: products.length },
                  { id: "inventory", name: "Inventory", icon: Sliders, desc: "Stock Adjustments", count: `${products.reduce((a: any, p: any) => a + (p.stock || 0), 0)} units` },
                  { id: "settings", name: "Settings", icon: Lock, desc: "Security & Access Rules", count: "Protected" },
                  { id: "analytics", name: "Analytics", icon: TrendingUp, desc: "Store & Order Insights", count: "Live" },
                  { id: "diagnostics", name: "Diagnostics", icon: Activity, desc: "Health, APIs & Font Audit", count: "9 Systems + DOM" },
                  { id: "logistics", name: "Logistics", icon: Truck, desc: "Warehouses & Couriers", count: "Routes" },
                  { id: "charges", name: "Charges", icon: Receipt, desc: "Global Additional Fees", count: "Config" },
                  { id: "payments", name: "Payments", icon: CreditCard, desc: "Config Payment Methods", count: "Active Methods" },
                  { id: "promos", name: "Promos", icon: Tag, desc: "Discounts & Anti-Fraud", count: "Vouchers" }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setView(item.id as AdminView)}
                    className="group relative h-28 sm:h-32 bg-white border border-slate-200 hover:border-slate-900 rounded-2xl p-4 shadow-sm hover:shadow-xl transition-all duration-200 flex flex-col items-center justify-center gap-2 overflow-hidden text-center cursor-pointer"
                  >
                    {/* Gloss effect */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/40 to-slate-100/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    
                    <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-slate-900 text-slate-700 group-hover:text-white flex items-center justify-center transition-colors">
                      <item.icon className="w-5 h-5" />
                    </div>
                    
                    <div>
                      <span className="font-heading font-black text-xs sm:text-sm uppercase tracking-wider text-slate-900 block">
                        {item.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 block">
                        {item.count}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 2. CUSTOMERS SECTION: COMPACT LIST WITH STICKY NON-SCROLLING SEARCH BAR    */}
        {/* ========================================================================= */}
        {view === "customers" && (
          <motion.div
            key="view-customers"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-50"
          >
            {/* STICKY & FIXED NON-SCROLLING TOP SEARCH & HEADER BAR */}
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
                {/* Navigation Row */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setView("dashboard")}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
                    </button>
                    <span className="text-slate-300">/</span>
                    <h2 className="text-base sm:text-lg font-heading font-black tracking-wide uppercase text-slate-900">
                      Customers Registry
                    </h2>
                    <span className="text-[10px] font-mono bg-slate-900 text-white px-2 py-0.5 rounded-full font-bold">
                      {filteredCustomers.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchAllData}
                      disabled={refreshing}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                      title="Refresh"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>

                {/* Search & Quick Filters */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search by Name, @handle, Telegram ID, Prime ID, IP, or Location..."
                      className="w-full pl-9 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
                    />
                    {customerSearch && (
                      <button
                        onClick={() => setCustomerSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-mono"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                    {(["all", "admin", "premium"] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setCustomerFilter(filter)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                          customerFilter === filter
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {filter === "all" ? "All Users" : filter === "admin" ? "Admins" : "Premium"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* COMPACT CUSTOMERS LIST (SCROLLABLE AREA) */}
            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-2.5">
              {filteredCustomers.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="font-heading font-black text-slate-800 uppercase tracking-wide text-sm mb-1">
                    No customers found
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Try adjusting your search criteria or filter.
                  </p>
                </div>
              ) : (
                filteredCustomers.map((customer) => {
                  const fp = customer.latestFingerprint;
                  return (
                    <div
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomerId(customer.id);
                        setSelectedSessionId(null);
                        setView("customer-detail");
                      }}
                      className="group bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-900 rounded-xl p-3.5 sm:p-4 shadow-sm hover:shadow-md transition-all duration-150 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      {/* Customer Summary */}
                      <div className="flex items-center gap-3">
                        {customer.photoUrl ? (
                          <img src={customer.photoUrl} alt={customer.tgName} className="w-11 h-11 rounded-xl object-cover shrink-0 shadow-sm border border-slate-200" />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-heading font-black text-sm uppercase shrink-0 shadow-sm">
                            {customer.tgName ? customer.tgName.charAt(0) : "U"}
                          </div>
                        )}

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-heading font-black text-sm text-slate-900 group-hover:text-black">
                              {customer.tgName || "Unnamed User"}
                            </span>
                            {customer.tgUsername && (
                              <span className="text-xs font-mono text-slate-500">
                                @{customer.tgUsername}
                              </span>
                            )}
                            {customer.role === "admin" && (
                              <span className="text-[9px] font-mono bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase">
                                Admin
                              </span>
                            )}
                            {customer.isPremium && (
                              <span className="text-[9px] font-mono bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5" /> Premium
                              </span>
                            )}
                            {customer.isPromoFraudRisk && (
                              <span className="text-[9px] font-mono bg-red-600 text-white px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1 shadow-sm">
                                ⚠️ Shared Device ({customer.sharedAccountCount + 1} Accounts)
                              </span>
                            )}
                            {customer.tier && (
                              <span className="text-[9px] font-mono bg-slate-900 text-amber-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                {customer.tier}
                              </span>
                            )}
                            {Number(customer.storeCredits || 0) > 0 && (
                              <span className="text-[9px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                                {formatPHP(customer.storeCredits)} Credits
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 mt-1 flex-wrap">
                            <span className="text-slate-900 font-semibold bg-slate-100 px-1.5 py-0.5 rounded">
                              PRIME: {customer.primeMemberId || "Unassigned"}
                            </span>
                            <span>&bull;</span>
                            <span>ID: {customer.tgUserId}</span>
                            {customer.deviceId && (
                              <>
                                <span>&bull;</span>
                                <span className="text-slate-600 font-medium">Device: {customer.deviceId}</span>
                              </>
                            )}
                            {customer.orderCount > 0 && (
                              <>
                                <span>&bull;</span>
                                <span className="text-emerald-700 font-semibold">
                                  {customer.orderCount} Orders ({formatPHP(customer.totalSpent || 0)})
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Device & Location Preview & Arrow */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        {fp ? (
                          <div className="text-right font-mono text-[10px] text-slate-500">
                            <p className="text-slate-900 font-bold flex items-center gap-1 justify-end truncate max-w-[260px]">
                              <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                              {fp.location?.address || `${fp.city || "Manila"}, ${fp.country || "Philippines"}`}
                            </p>
                            <p className="truncate max-w-[260px] text-slate-400">
                              {fp.platform || "Standard Device"} &bull; {fp.locationSource || "Active"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded">
                            No session data
                          </span>
                        )}

                        <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 3. CUSTOMER DETAIL PAGE: FULL TELEGRAM DOSSIER, FINGERPRINTS,   */}
        {/*    SECURITY SNAPSHOTS TIMELINE & COMPLETE ORDER HISTORY                   */}
        {/* ========================================================================= */}
        {view === "customer-detail" && (
          <motion.div
            key="view-customer-detail"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-100"
          >
            {/* Sticky Navigation Top Bar */}
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedCustomerId(null);
                      setSelectedSessionId(null);
                      setView("customers");
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Customers
                  </button>
                  <span className="text-slate-300">/</span>
                  <span className="text-xs font-mono font-bold text-slate-900">
                    {customerDetail?.customer?.tgName || "Customer Profile"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {selectedCustomerId && (
                    <button
                      onClick={() => fetchCustomerDetail(selectedCustomerId)}
                      disabled={loadingCustomerDetail}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-mono flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingCustomerDetail ? "animate-spin" : ""}`} />
                      Refresh Profile
                    </button>
                  )}
                </div>
              </div>
            </div>

            {loadingCustomerDetail || !customerDetail ? (
              <div className="flex-1 flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-900" />
              </div>
            ) : (
              <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
                
                {/* SECTION 1: CUSTOMER IDENTITY CARD */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-hidden relative">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                    <div className="flex items-center gap-4">
                
                      {customerDetail.customer.photoUrl ? (
                        <img src={customerDetail.customer.photoUrl} alt={customerDetail.customer.tgName} className="w-16 h-16 rounded-2xl object-cover shadow-lg border border-slate-200 shrink-0" />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center font-heading font-black text-2xl uppercase shadow-lg">
                          {customerDetail.customer.tgName?.charAt(0) || "P"}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-2xl font-heading font-black uppercase text-slate-900 tracking-wide">
                            {customerDetail.customer.tgName || "Unknown User"}
                          </h2>
                          {customerDetail.customer.role === "admin" && (
                            <span className="text-xs font-mono bg-red-600 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                              System Admin
                            </span>
                          )}
                          {customerDetail.customer.isPremium && (
                            <span className="text-xs font-mono bg-amber-500 text-black px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> Telegram Premium
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-mono text-slate-500 mt-0.5">
                          @{customerDetail.customer.tgUsername || "none"} &bull; Telegram User ID: {customerDetail.customer.tgUserId}
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-900 text-white px-4 py-3 rounded-xl font-mono text-right shadow-sm shrink-0">
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">PRIME Member ID</p>
                      <div className="flex items-center justify-end gap-2 mt-0.5">
                        <span className="text-lg font-black tracking-wider text-amber-400">
                          {customerDetail.customer.primeMemberId || "Unassigned"}
                        </span>
                        <button
                          onClick={() => copyToClipboard(customerDetail.customer.primeMemberId, "primeId")}
                          className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                          title="Copy Member ID"
                        >
                          {copiedKey === "primeId" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Identity Breakdown Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 text-xs">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">First / Last Name</p>
                      <p className="font-mono text-slate-900 font-bold">
                        {customerDetail.customer.firstName || "—"} {customerDetail.customer.lastName || ""}
                      </p>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Language & Direct Message</p>
                      <p className="font-mono text-slate-900 font-bold">
                        Code: {customerDetail.customer.languageCode || "en"} &bull; Message: {customerDetail.customer.allowsWriteToPm ? "Allowed" : "Restricted"}
                      </p>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Account Created</p>
                      <p className="font-mono text-slate-900 font-bold">
                        {customerDetail.customer.createdAt ? new Date(customerDetail.customer.createdAt).toLocaleDateString() : "—"}
                      </p>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Last Active</p>
                      <p className="font-mono text-slate-900 font-bold">
                        {customerDetail.customer.lastSeen ? new Date(customerDetail.customer.lastSeen).toLocaleTimeString() : "Live Now"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* SECTION 1.5: PRIME LOYALTY, TIER STATUS & POINTS DOSSIER */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-500 text-black flex items-center justify-center font-bold">
                        <Award className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-heading font-black uppercase text-base text-slate-900 tracking-wide">
                          PRIME Loyalty & Points Dossier
                        </h3>
                        <p className="text-[11px] font-mono text-slate-500">
                          Tier tiering, points balances, store credits, and referral lineage
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-slate-900 text-amber-300 px-3 py-1 rounded-lg font-bold uppercase tracking-wider shadow-sm flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-amber-400" />
                        {customerDetail.customer.tier || "MEMBER"} TIER
                      </span>
                    </div>
                  </div>

                  {/* Loyalty Balances Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl">
                      <p className="text-emerald-800 uppercase text-[10px] tracking-widest font-bold mb-1">Store Credits</p>
                      <p className="text-lg font-bold text-emerald-950 font-mono">
                        {formatPHP(customerDetail.customer.storeCredits || 0)}
                      </p>
                      <p className="text-[10px] text-emerald-700 mt-0.5">Usable at checkout</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                      <p className="text-slate-500 uppercase text-[10px] tracking-widest font-bold mb-1">Purchasing Points</p>
                      <p className="text-lg font-bold text-slate-900 font-mono">
                        {Number(customerDetail.customer.purchasingPoints || 0).toLocaleString()} PTS
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Convertible to credits</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                      <p className="text-slate-500 uppercase text-[10px] tracking-widest font-bold mb-1">Referral Points</p>
                      <p className="text-lg font-bold text-slate-900 font-mono">
                        {Number(customerDetail.customer.referralPoints || 0).toLocaleString()} PTS
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Matured & convertible</p>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl">
                      <p className="text-amber-800 uppercase text-[10px] tracking-widest font-bold mb-1">Pending Referrals</p>
                      <p className="text-lg font-bold text-amber-950 font-mono">
                        {Number(customerDetail.customer.pendingReferralPoints || 0).toLocaleString()} PTS
                      </p>
                      <p className="text-[10px] text-amber-700 mt-0.5">Maturing in 30 mins</p>
                    </div>
                  </div>

                  {/* Tier Cycle & Referrer Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs font-mono">
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex flex-col justify-between">
                      <div>
                        <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">30-Day Tier Cycle Progress</p>
                        <p className="text-slate-800 font-bold text-xs">
                          {customerDetail.customer.tierInfo ? (
                            <>
                              Spent {formatPHP(customerDetail.customer.tierInfo.cycleSpend || 0)} in active cycle
                              {customerDetail.customer.tierInfo.nextTier && (
                                <span className="text-slate-500 font-normal"> &bull; Needs {formatPHP(customerDetail.customer.tierInfo.amountNeededForNextTier || 0)} for {customerDetail.customer.tierInfo.nextTier}</span>
                              )}
                            </>
                          ) : (
                            "Calculated from delivered orders within 30-day window"
                          )}
                        </p>
                      </div>
                      {customerDetail.customer.tierInfo?.daysRemainingInCycle !== undefined && (
                        <p className="text-[11px] text-slate-500 mt-2">
                          Cycle reset in: <strong className="text-slate-800">{customerDetail.customer.tierInfo.daysRemainingInCycle} days</strong>
                        </p>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex flex-col justify-between">
                      <div>
                        <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Referred By</p>
                        {customerDetail.customer.referredByMemberId ? (
                          <div className="space-y-0.5">
                            <p className="text-slate-900 font-bold text-xs">
                              {customerDetail.customer.referredByName || "Prime Member"}
                            </p>
                            <p className="text-slate-500 text-[11px]">
                              Member ID: <strong className="text-slate-800">{customerDetail.customer.referredByMemberId}</strong>
                            </p>
                          </div>
                        ) : (
                          <p className="text-slate-500 text-xs italic">
                            Direct / Organic (No referrer recorded)
                          </p>
                        )}
                      </div>
                      {customerDetail.customer.referredAt && (
                        <p className="text-[10px] text-slate-400 mt-2">
                          Linked on: {new Date(customerDetail.customer.referredAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 2: DEVICE ID & PROMO FRAUD DETECTION */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-heading font-black uppercase text-base text-slate-900 tracking-wide">
                          Device Check & Promo Fraud Detection
                        </h3>
                        <p className="text-[11px] font-mono text-slate-500">
                          Identifies physical devices to check if multiple accounts are claiming promos
                        </p>
                      </div>
                    </div>

                    {customerDetail.customer.isPromoFraudRisk ? (
                      <span className="text-xs font-mono bg-red-100 text-red-700 px-2.5 py-1 rounded-md font-bold uppercase flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> Multiple Accounts Detected
                      </span>
                    ) : (
                      <span className="text-xs font-mono bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-md font-bold uppercase flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Single Account (Clean)
                      </span>
                    )}
                  </div>

                  {/* Device Identifiers Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                      <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Device ID</p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 font-mono text-xs truncate">
                          {customerDetail.customer.deviceId || "DEV_STANDARD"}
                        </span>
                        <button
                          onClick={() => copyToClipboard(customerDetail.customer.deviceId || "DEV_STANDARD", "devId")}
                          className="text-slate-400 hover:text-slate-900 transition-colors"
                          title="Copy Device ID"
                        >
                          {copiedKey === "devId" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                      <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">App ID</p>
                      <span className="font-bold text-slate-900 font-mono text-xs truncate block">
                        {customerDetail.customer.appId || "PRIME_SHOP_APP"}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                      <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Hardware Code</p>
                      <span className="font-bold text-slate-900 font-mono text-xs truncate block">
                        {customerDetail.customer.hardwareId || "HW_RECOGNIZED"}
                      </span>
                    </div>
                  </div>

                  {/* Promo Fraud Status Alert Box */}
                  {customerDetail.customer.isPromoFraudRisk && customerDetail.customer.sharedAccounts?.length > 0 ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-red-900 uppercase tracking-wide">
                            Promo Fraud Warning: Same Device Used by Multiple Accounts
                          </p>
                          <p className="text-xs text-red-700 mt-0.5">
                            This device has been used to access {customerDetail.customer.sharedAccounts.length + 1} different Telegram accounts. Please review to prevent duplicate promo code redemption:
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {customerDetail.customer.sharedAccounts.map((acc: any) => (
                          <div key={acc.id} className="bg-white border border-red-200 rounded-lg p-2.5 text-xs font-mono flex items-center justify-between">
                            <div>
                              <p className="font-bold text-slate-900">{acc.name || `User ${acc.id}`}</p>
                              <p className="text-[11px] text-slate-500">
                                {acc.username ? `@${acc.username}` : `ID: ${acc.id}`} &bull; PRIME: {acc.memberId || "None"}
                              </p>
                            </div>
                            <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded font-bold">
                              Linked
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center gap-2.5 text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <p className="text-emerald-800 font-medium">
                        Unique Device Verified: No other accounts have accessed the store from this device ID.
                      </p>
                    </div>
                  )}
                </div>

                {/* SECTION 3: SAVED SESSIONS (COMPACT LIST + CLICK FOR FULL SESSION DETAILS) */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div>
                      <h3 className="font-heading font-black uppercase text-base text-slate-900 tracking-wide">
                        Saved Sessions ({customerDetail.fingerprints.length})
                      </h3>
                      <p className="text-[11px] font-mono text-slate-500">
                        Compact session history. Click any session below to view its complete details.
                      </p>
                    </div>
                  </div>

                  {customerDetail.fingerprints.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl">
                      <p className="text-xs font-mono text-slate-400">No login sessions recorded yet for this customer.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {customerDetail.fingerprints.map((snap, idx) => {
                        const isExpanded = selectedSessionId === snap.id;
                        const sessionNumber = customerDetail.fingerprints.length - idx;
                        const isGps = snap.location?.lat && snap.location?.lat !== 0;

                        return (
                          <div
                            key={snap.id || idx}
                            className={`border rounded-xl transition-all duration-150 overflow-hidden ${
                              isExpanded ? "border-slate-900 bg-white shadow-md ring-1 ring-slate-900/10" : "border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300"
                            }`}
                          >
                            {/* COMPACT SESSION ROW (CLICKABLE) */}
                            <div
                              onClick={() => setSelectedSessionId(isExpanded ? null : snap.id)}
                              className="p-3.5 sm:p-4 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono select-none"
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                                  isExpanded ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700"
                                }`}>
                                  #{sessionNumber}
                                </div>

                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-900">
                                      {snap.createdAt ? new Date(snap.createdAt).toLocaleString() : "Recent Session"}
                                    </span>
                                    {isGps ? (
                                      <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-bold flex items-center gap-1">
                                        <MapPin className="w-2.5 h-2.5" /> GPS Location
                                      </span>
                                    ) : (
                                      <span className="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded font-bold">
                                        Internet Location
                                      </span>
                                    )}
                                  </div>

                                  <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-xl">
                                    {snap.location?.address || `${snap.city || "Manila"}, ${snap.country || "Philippines"}`} &bull; IP: {snap.ipSession || "127.0.0.1"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-auto">
                                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                                  isExpanded ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                                }`}>
                                  {isExpanded ? "Hide Details ▲" : "View Details ▼"}
                                </span>
                              </div>
                            </div>

                            {/* EXPANDED FULL SESSION DETAILS (POPULATES ONLY ON CLICK) */}
                            {isExpanded && (
                              <div className="p-4 sm:p-5 border-t border-slate-200 bg-white space-y-4 text-xs font-mono animate-in fade-in duration-200">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                  <p className="font-bold text-slate-900 uppercase tracking-wide text-xs">
                                    Full Session Details (Session #{sessionNumber})
                                  </p>
                                  <span className="text-slate-400 text-[11px]">
                                    Recorded at: {snap.createdAt ? new Date(snap.createdAt).toLocaleString() : "Live"}
                                  </span>
                                </div>

                                {/* Physical Location & GPS Coordinates */}
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                                  <div className="flex items-center justify-between flex-wrap gap-2">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                                      <MapPin className="w-3.5 h-3.5 text-slate-600" /> Physical Location & Coordinates
                                    </span>
                                    {snap.location?.lat && (
                                      <a
                                        href={`https://www.google.com/maps?q=${snap.location.lat},${snap.location.lon}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 font-bold"
                                      >
                                        Open in Google Maps <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                    <div>
                                      <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">Address / Street</p>
                                      <p className="text-slate-900 font-bold mt-0.5">
                                        {snap.location?.address || `${snap.city || "Current Area"}, ${snap.region || ""}, ${snap.country || ""}`}
                                      </p>
                                    </div>

                                    <div>
                                      <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">Coordinates & Accuracy</p>
                                      <p className="text-slate-900 font-bold mt-0.5">
                                        {snap.location?.lat ? `${snap.location.lat.toFixed(5)}, ${snap.location.lon.toFixed(5)}` : "Approximate"} 
                                        {snap.location?.accuracy ? ` (within ±${snap.location.accuracy}m)` : ""}
                                      </p>
                                      <p className="text-[10px] text-slate-500 mt-0.5">
                                        Source: {snap.locationSource || (isGps ? "Calibrated GPS" : "Internet Address")}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                {/* Device & Hardware System Details */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Operating System</p>
                                    <p className="text-slate-900 font-bold truncate">{snap.platform || "Standard System"}</p>
                                  </div>

                                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Screen Size</p>
                                    <p className="text-slate-900 font-bold">{snap.screenResolution || "Standard Display"}</p>
                                  </div>

                                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Processor & Memory</p>
                                    <p className="text-slate-900 font-bold">{snap.hardwareConcurrency || "4"} Cores &bull; {snap.deviceMemory || "Standard RAM"}</p>
                                  </div>

                                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Timezone</p>
                                    <p className="text-slate-900 font-bold truncate">{snap.timezone || "UTC"}</p>
                                  </div>
                                </div>

                                {/* Internet Provider & Connection Security */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                                    <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">IP Address</p>
                                    <p className="text-slate-900 font-bold">{snap.ipSession || "127.0.0.1"}</p>
                                  </div>

                                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                                    <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Internet Provider</p>
                                    <p className="text-slate-900 font-bold truncate">{snap.isp || "Standard Internet Provider"}</p>
                                  </div>

                                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                                    <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Security Check</p>
                                    <p className="font-bold truncate">
                                      {snap.vpnDetected ? (
                                        <span className="text-red-600">⚠️ VPN or Proxy Detected</span>
                                      ) : (
                                        <span className="text-emerald-700">✓ Standard Home / Mobile Internet</span>
                                      )}
                                    </p>
                                  </div>
                                </div>

                                {/* Browser Version */}
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                  <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Web Browser</p>
                                  <p className="text-slate-700 text-[11px] break-all">
                                    {snap.browser || "Standard Browser"}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* SECTION 4: CUSTOMER ORDER HISTORY */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                    <div>
                      <h3 className="font-heading font-black uppercase text-base text-slate-900 tracking-wide">
                        Customer Order History
                      </h3>
                      <p className="text-[11px] font-mono text-slate-500">
                        {customerDetail.orders.length} orders on record
                      </p>
                    </div>

                    <button
                      onClick={() => handleSimulateOrder(
                        customerDetail.customer.tgUserId,
                        customerDetail.customer.tgName,
                        customerDetail.customer.primeMemberId
                      )}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-mono font-bold rounded-lg transition-colors cursor-pointer shadow-sm flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Simulate Test Order
                    </button>
                  </div>

                  {customerDetail.orders.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl">
                      <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-mono text-slate-500">
                        No orders recorded yet for this customer. Click &quot;Simulate Test Order&quot; to test order ingestion.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {customerDetail.orders.map((ord) => (
                        <div
                          key={ord.id}
                          className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">
                                {ord.orderNumber}
                              </span>
                              <span className="text-slate-400">&bull;</span>
                              <span className="text-slate-500">
                                {ord.createdAt ? new Date(ord.createdAt).toLocaleString() : "Recent"}
                              </span>
                            </div>

                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              ord.status === "Completed"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : ord.status === "Processing"
                                ? "bg-blue-100 text-blue-800 border border-blue-200"
                                : "bg-amber-100 text-amber-800 border border-amber-200"
                            }`}>
                              {ord.status || "Processing"}
                            </span>
                          </div>

                          {/* Items table */}
                          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                            {(ord.items || []).map((item: any, i: number) => {
                              const isFreeItem = Boolean(item.isFree || Number(item.price) === 0);
                              return (
                                <div key={i} className="p-2.5 flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-medium text-slate-800 truncate">
                                      {item.quantity}x {item.name}
                                    </span>
                                    {isFreeItem && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                                        FREE
                                      </span>
                                    )}
                                  </div>
                                  <span className={`font-bold shrink-0 ${isFreeItem ? "text-emerald-600 font-black" : "text-slate-900"}`}>
                                    {isFreeItem ? "FREE" : formatPHP(Number(item.price) * (Number(item.quantity) || 1))}
                                  </span>
                                </div>
                              );
                            })}
                            <div className="p-2.5 bg-slate-50 flex items-center justify-between font-bold text-slate-900">
                              <span>Total Paid</span>
                              <span className="text-sm">{formatPHP(ord.totalAmount)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 3.5 DEVICE LINKED ACCOUNTS SECTION: LINKED ACCOUNTS FOR FLAGGED DEVICE */}
        {/* ========================================================================= */}
        {view === "device-accounts" && (
          <motion.div
            key="view-device-accounts"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-50"
          >
            {/* Sticky Header */}
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setView(selectedOrderId ? "order-detail" : "orders")}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to {selectedOrderId ? "Order Detail" : "Orders"}
                  </button>
                  <span className="text-slate-300">/</span>
                  <h2 className="text-base sm:text-lg font-heading font-black tracking-wide uppercase text-slate-900 flex items-center gap-2">
                    <span>Linked Accounts by Device ID</span>
                  </h2>
                </div>

                <button
                  onClick={fetchAllData}
                  disabled={refreshing}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                  title="Refresh Data"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Main Content */}
            {(() => {
              const devId = selectedDeviceIdForAccounts || "Unassigned";
              const linkedAccounts = getAccountsLinkedToDevice(devId);
              const isRisk = linkedAccounts.length >= 2;

              return (
                <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
                  
                  {/* Hardware Header Card */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Target Device Hardware Identifier</span>
                          {isRisk ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-red-100 text-red-800 border border-red-300 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-red-600" />
                              <span>Multi-Account Hardware Flagged</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Single Account Verified
                            </span>
                          )}
                        </div>

                        <div 
                          onClick={() => copyToClipboard(devId, "pageDevId", "DEVICE IDENTIFIER")}
                          className="flex items-center gap-2 cursor-pointer group hover:text-indigo-600 transition-colors"
                          title="Click to copy Device ID"
                        >
                          <Smartphone className="w-5 h-5 text-slate-700 shrink-0" />
                          <span className="font-mono text-sm sm:text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors break-all">
                            {devId}
                          </span>
                          {copiedKey === "pageDevId" ? (
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-center font-mono">
                          <p className="text-[9px] uppercase font-bold text-slate-400">Linked Accounts</p>
                          <p className={`text-lg font-black ${isRisk ? "text-red-600" : "text-slate-900"}`}>{linkedAccounts.length}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-center font-mono">
                          <p className="text-[9px] uppercase font-bold text-slate-400">Total Orders</p>
                          <p className="text-lg font-black text-slate-900">
                            {linkedAccounts.reduce((sum, acc) => sum + acc.orderCount, 0)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {isRisk && (
                      <div className="bg-red-50/80 border border-red-200/90 rounded-xl p-3.5 flex items-start gap-3 text-xs font-mono">
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div className="space-y-0.5 text-red-900">
                          <p className="font-bold uppercase tracking-wide text-[11px]">Hardware Risk Notice</p>
                          <p className="text-[11px] text-red-800 leading-relaxed">
                            This hardware device has been recorded placing orders across {linkedAccounts.length} distinct customer accounts. Select any account below to open its full Customer Profile, order history, and security dossier.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Compact List of Linked Accounts */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <h3 className="font-heading font-black uppercase text-base text-slate-900 tracking-wide flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-600" />
                        <span>Accounts Linked to Device ({linkedAccounts.length})</span>
                      </h3>
                      <span className="text-[11px] font-mono text-slate-400">
                        Click any account card to open full Customer Profile
                      </span>
                    </div>

                    {linkedAccounts.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-xl text-xs font-mono text-slate-400">
                        No active accounts found matching this Device Identifier.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {linkedAccounts.map((acc, index) => {
                          const targetCustId = acc.customerRecord?.id || acc.telegramId || acc.primeMemberId || acc.accountId;

                          return (
                            <div
                              key={acc.accountId || index}
                              onClick={() => {
                                if (targetCustId) {
                                  setSelectedCustomerId(targetCustId);
                                  fetchCustomerDetail(targetCustId);
                                  setView("customer-detail");
                                }
                              }}
                              className="bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-900 rounded-xl p-4 transition-all duration-150 shadow-2xs hover:shadow-md cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-xs select-none"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold font-heading text-sm shrink-0 group-hover:scale-105 transition-transform">
                                  {acc.customerName.charAt(0).toUpperCase()}
                                </div>

                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-slate-900 text-sm truncate group-hover:text-indigo-600 transition-colors">
                                      {acc.customerName}
                                    </h4>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                                      {acc.primeMemberId}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                                    {acc.telegramId && (
                                      <span>Telegram UID: <strong className="text-slate-800 font-semibold">{acc.telegramId}</strong></span>
                                    )}
                                    {acc.phone && acc.phone !== "Not provided" && (
                                      <span>Phone: <strong className="text-slate-800 font-semibold">{acc.phone}</strong></span>
                                    )}
                                    {acc.lastActive && (
                                      <span>Last Active: {new Date(acc.lastActive).toLocaleDateString()}</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 border-slate-200/80 pt-2 sm:pt-0">
                                <div className="text-right">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase">Orders on Device</p>
                                  <p className="font-bold text-slate-900 text-xs">
                                    {acc.orderCount} {acc.orderCount === 1 ? 'order' : 'orders'} &bull; <span className="text-emerald-700 font-bold">{formatPHP(acc.totalSpent)}</span>
                                  </p>
                                </div>

                                <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 group-hover:bg-black text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-xs">
                                  <span>View Profile</span>
                                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 4. ORDERS SECTION: SEPARATE FULL PAGE WITH STICKY NON-SCROLLING SEARCH BAR */}
        {/* ========================================================================= */}
        {view === "orders" && (
          <motion.div
            key="view-orders"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-50"
          >
            {/* Sticky non-scrolling search & header */}
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setView("dashboard")}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
                    </button>
                    <span className="text-slate-300">/</span>
                    <h2 className="text-base sm:text-lg font-heading font-black tracking-wide uppercase text-slate-900">
                      Orders Management
                    </h2>
                    <span className="text-[10px] font-mono bg-slate-900 text-white px-2 py-0.5 rounded-full font-bold">
                      {filteredOrders.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Export CSV button */}
                    <button
                      type="button"
                      onClick={() => handleExportOrdersCSV(filteredOrders)}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-400 hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                      title="Export currently displayed orders to CSV spreadsheet"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-700" />
                      <span className="hidden sm:inline">Export CSV</span>
                      <span className="sm:hidden">CSV</span>
                    </button>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200/80 rounded-lg text-emerald-800 text-[11px] font-mono">
                      <span className="relative flex h-2 w-2">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isSilentSyncing ? "bg-emerald-500 opacity-75" : "bg-emerald-400 opacity-50"}`}></span>
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isSilentSyncing ? "bg-emerald-600" : "bg-emerald-500"}`}></span>
                      </span>
                      <span className="font-bold hidden md:inline">
                        {isSilentSyncing ? "Detecting..." : "Auto-Detect Active"}
                      </span>
                    </div>

                    <button
                      onClick={fetchAllData}
                      disabled={refreshing}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                      title="Manual Refresh"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="Search orders by Order #, Customer Name, Prime ID, or Status..."
                      className="w-full pl-9 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto">
                    {(["all", "Processing", "Completed", "Pending"] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setOrderFilter(filter)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                          orderFilter === filter
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {filter === "all" ? "All Orders" : filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bulk Action Toolbar Bar */}
                <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedOrderIds.length === filteredOrders.length && filteredOrders.length > 0) {
                          setSelectedOrderIds([]);
                        } else {
                          setSelectedOrderIds(filteredOrders.map(o => o.id));
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer text-[11px]"
                    >
                      {selectedOrderIds.length > 0 && selectedOrderIds.length === filteredOrders.length ? (
                        <CheckSquare className="w-3.5 h-3.5 text-slate-900" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      <span>
                        {selectedOrderIds.length === filteredOrders.length && filteredOrders.length > 0
                          ? "Deselect All"
                          : `Select All (${filteredOrders.length})`}
                      </span>
                    </button>

                    {selectedOrderIds.length > 0 && (
                      <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                        {selectedOrderIds.length} selected
                      </span>
                    )}
                  </div>

                  {selectedOrderIds.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                        Set Status:
                      </span>
                      {(["Processing", "Completed", "Pending"] as const).map(st => (
                        <button
                          key={st}
                          disabled={isBulkUpdating}
                          onClick={() => handleBulkUpdateOrderStatus(st)}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase transition-all cursor-pointer shadow-2xs border ${
                            st === "Completed"
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
                              : st === "Processing"
                              ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-700"
                              : "bg-amber-600 hover:bg-amber-700 text-white border-amber-700"
                          } ${isBulkUpdating ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {st}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSelectedOrderIds([])}
                        className="px-2 py-1 text-slate-500 hover:text-slate-800 text-[11px] underline cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Compact Orders List */}
            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-2.5">
              {filteredOrders.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
                  <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="font-heading font-black text-slate-800 uppercase tracking-wide text-sm mb-1">
                    No orders found
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Orders submitted in the storefront or simulated will appear here.
                  </p>
                </div>
              ) : (
                filteredOrders.map((ord) => {
                  const isSelected = selectedOrderIds.includes(ord.id);
                  return (
                    <div
                      key={ord.id}
                      onClick={() => {
                        setSelectedOrderId(ord.id);
                        setView("order-detail");
                      }}
                      className={`group border rounded-xl p-3.5 sm:p-4 shadow-sm hover:shadow-md transition-all duration-150 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected 
                          ? "bg-indigo-50/50 border-indigo-400 hover:border-indigo-600" 
                          : "bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-900"
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-3">
                        {/* Order selection checkbox */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrderIds(prev =>
                              prev.includes(ord.id) ? prev.filter(id => id !== ord.id) : [...prev, ord.id]
                            );
                          }}
                          className="mt-0.5 sm:mt-0 p-1 rounded hover:bg-slate-200/80 text-slate-600 cursor-pointer shrink-0 transition-colors"
                          title={isSelected ? "Deselect this order" : "Select this order"}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                          )}
                        </button>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-heading font-black text-sm text-slate-900 group-hover:text-black">
                              {ord.orderNumber}
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                              {ord.createdAt ? new Date(ord.createdAt).toLocaleDateString() : "Recent"}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                              ord.status === "Completed"
                                ? "bg-emerald-100 text-emerald-800"
                                : ord.status === "Processing"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-amber-100 text-amber-800"
                            }`}>
                              {ord.status || "Processing"}
                            </span>
                            {ord.paymentProofImage ? (
                              <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                                <Receipt className="w-2.5 h-2.5" /> Proof Uploaded
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[9px] font-mono text-slate-400 bg-slate-100 border border-slate-200">
                                No Proof Yet
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 font-mono mt-1">
                            Customer: <span className="font-bold text-slate-900">{ord.customerName}</span> ({ord.primeMemberId || ord.customerId})
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="text-right font-mono">
                          <p className="text-sm font-black text-slate-900">
                            {formatPHP(
                              ord.deliveryFeePaymentMethod === "upon_delivery"
                                ? (ord.payableNow !== undefined 
                                    ? Number(ord.payableNow)
                                    : ((Number(ord.subTotal) || 0) + (Array.isArray(ord.appliedCharges) ? ord.appliedCharges.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0) : 0)))
                                : ord.totalAmount
                            )}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {ord.items?.length || 1} line item(s)
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModifyingOrder(ord);
                            setIsModifyModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-amber-50 hover:border-amber-300 text-slate-600 hover:text-amber-800 transition-colors shadow-2xs cursor-pointer"
                          title="Modify Order Items & Pricing"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                        </button>

                        <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 5. ORDER DETAIL PAGE: SEPARATE FULL VIEW                                  */}
        {/* ========================================================================= */}
        {view === "order-detail" && selectedOrder && (() => {
          const deliveryAddressText = (() => {
            const rawDelAddr = selectedOrder.deliveryAddress;
            if (typeof rawDelAddr === "string" && rawDelAddr.trim()) return rawDelAddr.trim();
            if (rawDelAddr && typeof rawDelAddr === "object") {
              const formatted = rawDelAddr.formatted || rawDelAddr.fullAddress || rawDelAddr.address || rawDelAddr.streetAddress || "";
              const unit = rawDelAddr.unitDetails || rawDelAddr.unit || rawDelAddr.houseNumber || "";
              if (unit && formatted && !formatted.toLowerCase().includes(unit.toLowerCase())) {
                return `${unit}, ${formatted}`;
              }
              if (formatted) return formatted;
              const parts = [
                rawDelAddr.street || rawDelAddr.streetAddress,
                rawDelAddr.barangay || rawDelAddr.subdivision,
                rawDelAddr.city,
                rawDelAddr.province || rawDelAddr.region,
                rawDelAddr.zipCode || rawDelAddr.postalCode
              ].filter(Boolean);
              if (parts.length > 0) return parts.join(", ");
            }
            return selectedOrder.address || selectedOrder.fullAddress || selectedOrder.shippingAddress || selectedOrder.receiverAddress || selectedOrder.deliveryAddressText || "";
          })();

          return (
            <motion.div
              key="view-order-detail"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22 }}
              className="flex-1 flex flex-col min-h-screen bg-slate-100"
            >
            {/* Screen-Only Sticky Navigation & Quick Actions Bar */}
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm screen-only">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
                <button
                  onClick={() => {
                    setSelectedOrderId(null);
                    setView("orders");
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 font-mono"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Orders
                </button>

                <div className="flex items-center gap-2">
                  {/* Paper Format Selector */}
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-[10px] font-mono border border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => setPrintPaperFormat("standard")}
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer font-bold ${
                        printPaperFormat === "standard"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                      title="Standard A4 / Letter Invoice Format"
                    >
                      A4 Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintPaperFormat("thermal")}
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer font-bold ${
                        printPaperFormat === "thermal"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                      title="80mm Thermal Receipt Format"
                    >
                      80mm Thermal
                    </button>
                  </div>

                  {/* Print Trigger Button */}
                  <button
                    type="button"
                    onClick={() => handleTriggerPrint()}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold uppercase tracking-wider font-mono flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                    title="Print Order (Browser Native Print)"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Order</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Screen-Only Order Management Container */}
            <div className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 space-y-4 screen-only">
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
                  <div className="flex items-start gap-3">
                    {/* Scannable Order QR Code Generator Badge */}
                    <button
                      type="button"
                      onClick={() => {
                        setQrZoomedOrder(selectedOrder);
                        setIsQrModalOpen(true);
                      }}
                      className="p-1.5 bg-white border border-slate-200 rounded-xl shadow-2xs hover:shadow-md hover:border-slate-400 transition-all cursor-pointer flex flex-col items-center shrink-0 group"
                      title="Click to enlarge QR Code for scanner terminal"
                    >
                      <div className="relative">
                        <QRCodeSVG
                          value={selectedOrder.orderNumber || "ORDER-000"}
                          size={52}
                          level="M"
                          marginSize={0}
                          fgColor="#090d16"
                        />
                        <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors rounded flex items-center justify-center">
                          <QrCode className="w-4 h-4 text-slate-900 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 p-0.5 rounded shadow-xs" />
                        </div>
                      </div>
                      <span className="text-[7.5px] font-mono font-bold text-slate-500 group-hover:text-slate-900 mt-1 uppercase tracking-tighter flex items-center gap-0.5">
                        <QrCode className="w-2 h-2 text-slate-400" />
                        <span>Scan QR</span>
                      </span>
                    </button>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* ORDER STATUS BADGE */}
                        <div 
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider border transition-all duration-500 ease-in-out ${
                            selectedOrder.status === "Completed"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : selectedOrder.status === "Processing"
                              ? "bg-blue-50 text-blue-800 border-blue-300"
                              : "bg-amber-50 text-amber-900 border-amber-300"
                          } ${statusJustSaved?.orderId === selectedOrder.id ? "ring-2 ring-emerald-500 ring-offset-1 scale-105" : ""}`}
                        >
                          <span className={`w-2 h-2 rounded-full transition-colors duration-500 ${
                            selectedOrder.status === "Completed"
                              ? "bg-emerald-500"
                              : selectedOrder.status === "Processing"
                              ? "bg-blue-500"
                              : "bg-amber-500"
                          }`} />
                          <span>{selectedOrder.status || "Pending"}</span>
                          {statusJustSaved?.orderId === selectedOrder.id && (
                            <span className="text-[10px] text-emerald-700 font-black ml-0.5 animate-pulse">✓ Saved</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <h2 className="text-xl sm:text-2xl font-ibm-condensed font-medium text-slate-900 tracking-tight">{selectedOrder.orderNumber}</h2>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(selectedOrder.orderNumber, "orderNumber", "ORDER NUMBER")}
                          className="inline-flex items-center justify-center p-1 rounded transition-colors border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                          title="Copy Order Number"
                        >
                          {copiedKey === "orderNumber" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">
                        Placed {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString() : "Recent"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setIsPrintModalOpen(true)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold uppercase tracking-wider font-mono transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200 shadow-xs"
                      title="Preview format and print order"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" />
                      <span>Print Slip</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsShareModalOpen(true)}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-bold uppercase tracking-wider font-mono transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                      title="Share Order Summary & Telegram Deep Link"
                    >
                      <Share2 className="w-3.5 h-3.5 text-blue-600" />
                      <span>Share Order</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setModifyingOrder(selectedOrder);
                        setIsModifyModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-bold uppercase tracking-wider font-mono transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="Modify products, quantities, prices, or charges"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Modify Order</span>
                    </button>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-slate-500">Status</span>
                      <button
                        type="button"
                        onClick={() => setShowStatusGuide(prev => !prev)}
                        className={`p-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-mono ${
                          showStatusGuide 
                            ? "bg-blue-100 text-blue-800 font-bold" 
                            : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        }`}
                        title="Click to view guide: Difference between Pending & Processing"
                        aria-label="Status Explainer Guide"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span className="text-[10px] hidden sm:inline">Guide</span>
                      </button>
                    </div>
                    {(["Processing", "Completed", "Pending"] as const).map(st => {
                      const isActive = selectedOrder.status === st;
                      const isUpdatingThis = statusUpdatingId === selectedOrder.id && updatingToStatus === st;
                      const isJustSavedThis = statusJustSaved?.orderId === selectedOrder.id && statusJustSaved?.status === st;

                      let activeStyles = "bg-slate-900 text-white shadow-sm";
                      if (st === "Completed") activeStyles = "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400";
                      if (st === "Processing") activeStyles = "bg-blue-600 text-white shadow-sm ring-1 ring-blue-400";
                      if (st === "Pending") activeStyles = "bg-amber-500 text-slate-950 shadow-sm ring-1 ring-amber-400";

                      return (
                        <button
                          key={st}
                          disabled={statusUpdatingId === selectedOrder.id}
                          onClick={() => handleUpdateOrderStatus(selectedOrder.id, st)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider font-mono transition-all duration-500 ease-in-out cursor-pointer flex items-center gap-1 active:scale-95 ${
                            isActive
                              ? `${activeStyles} ${isJustSavedThis ? "ring-2 ring-emerald-400 ring-offset-1 scale-102" : ""}`
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                          }`}
                        >
                          {isUpdatingThis ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : isJustSavedThis ? (
                            <Check className="w-3 h-3 text-white" />
                          ) : null}
                          <span>{st}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Status Explanation Popover / Guide for Administrative Staff */}
                {showStatusGuide && (
                  <div className="mt-4 p-4 rounded-xl bg-blue-50/90 border border-blue-200 shadow-xs animate-in fade-in duration-150">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                        <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-blue-950">
                          Administrative Status Guide: Pending vs. Processing
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowStatusGuide(false)}
                        className="text-blue-600 hover:text-blue-900 text-xs font-mono font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      {/* PENDING EXPLANATION */}
                      <div className="p-3 bg-white rounded-lg border border-amber-200/80 space-y-1.5 shadow-2xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                          <span className="font-heading font-bold text-xs uppercase tracking-wider text-amber-900">
                            PENDING (Awaiting Verification)
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-700 leading-relaxed">
                          Initial status right after customer submission. The order is placed, but payment proof (GCash / Bank transfer) has <strong>not yet been approved</strong> or verified by staff. Do NOT dispatch items while in Pending.
                        </p>
                        <div className="text-[10px] font-mono text-amber-800 bg-amber-50/80 px-2 py-1 rounded border border-amber-200">
                          Action: Verify customer payment receipt &amp; confirm inventory availability.
                        </div>
                      </div>

                      {/* PROCESSING EXPLANATION */}
                      <div className="p-3 bg-white rounded-lg border border-blue-200/80 space-y-1.5 shadow-2xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0"></span>
                          <span className="font-heading font-bold text-xs uppercase tracking-wider text-blue-950">
                            PROCESSING (In Fulfillment &amp; Transit)
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-700 leading-relaxed">
                          Set to <strong>Processing</strong> once payment is verified or approved for Cash on Delivery. Order is being picked from inventory, packed, handed over to courier, or actively in transit to the customer.
                        </p>
                        <div className="text-[10px] font-mono text-blue-800 bg-blue-50/80 px-2 py-1 rounded border border-blue-200">
                          Action: Pack items, assign courier tracking link, and dispatch parcel.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Visual Step-Based Order Progress Timeline */}
                <div className="py-5 px-3 sm:px-4 bg-slate-50/80 rounded-xl border border-slate-200/80 my-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400">
                      Order Lifecycle Progress
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-slate-700">
                        Current Stage: <span className="uppercase text-slate-900 font-black">{selectedOrder.status || "Pending"}</span>
                      </span>
                    </div>
                  </div>

                  {(() => {
                    const currentStatus = selectedOrder.status || "Pending";
                    const steps = [
                      {
                        key: "Pending",
                        label: "Order Pending",
                        description: "Placed & awaiting review",
                        icon: Clock,
                      },
                      {
                        key: "Processing",
                        label: "Processing",
                        description: "Payment & items verified",
                        icon: Sliders,
                      },
                      {
                        key: "Completed",
                        label: "Completed",
                        description: "Fulfilled & delivered",
                        icon: CheckCircle2,
                      }
                    ];

                    const stepIndexMap: Record<string, number> = {
                      Pending: 0,
                      Processing: 1,
                      Completed: 2
                    };

                    const activeIndex = stepIndexMap[currentStatus] ?? 0;

                    return (
                      <div className="relative">
                        <div className="grid grid-cols-3 gap-2 relative z-10">
                          {steps.map((step, idx) => {
                            const isPast = idx < activeIndex;
                            const isCurrent = idx === activeIndex;
                            const isFuture = idx > activeIndex;
                            const StepIcon = step.icon;

                            return (
                              <button
                                key={step.key}
                                type="button"
                                onClick={() => handleUpdateOrderStatus(selectedOrder.id, step.key)}
                                className={`text-left p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                                  isCurrent
                                    ? "bg-white border-slate-900 shadow-sm ring-1 ring-slate-900"
                                    : isPast
                                    ? "bg-emerald-50/60 border-emerald-200 hover:bg-emerald-50 text-emerald-950"
                                    : "bg-white/60 border-slate-200 hover:bg-white text-slate-400"
                                }`}
                                title={`Click to change status to ${step.label}`}
                              >
                                <div className="flex items-center justify-between gap-1 mb-2">
                                  <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] font-bold ${
                                      isCurrent
                                        ? "bg-slate-900 text-white"
                                        : isPast
                                        ? "bg-emerald-600 text-white"
                                        : "bg-slate-200 text-slate-500"
                                    }`}
                                  >
                                    {isPast ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                                  </div>
                                  <span className={`text-[9px] font-mono font-bold uppercase tracking-wider ${
                                    isCurrent ? "text-indigo-600" : isPast ? "text-emerald-700" : "text-slate-400"
                                  }`}>
                                    {isCurrent ? "Active" : isPast ? "Done" : "Upcoming"}
                                  </span>
                                </div>

                                <div>
                                  <p className={`font-heading font-black text-xs uppercase tracking-wider truncate ${
                                    isCurrent ? "text-slate-950" : isPast ? "text-slate-900" : "text-slate-500"
                                  }`}>
                                    {step.label}
                                  </p>
                                  <p className="text-[10px] font-mono text-slate-500 line-clamp-1 mt-0.5 hidden sm:block">
                                    {step.description}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Administrative Status Legend */}
                        <div className="mt-3 pt-3 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
                          <div className="flex items-center gap-1.5 font-bold text-slate-700">
                            <Info className="w-3 h-3 text-slate-400" />
                            <span>STATUS GUIDE FOR STAFF:</span>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap text-[10px]">
                            <span className="inline-flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              <strong className="text-amber-900 font-bold">Pending:</strong> Payment unverified / awaiting review
                            </span>
                            <span className="text-slate-300 hidden sm:inline">•</span>
                            <span className="inline-flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                              <strong className="text-blue-950 font-bold">Processing:</strong> Payment confirmed, picking/packing or in transit
                            </span>
                            <span className="text-slate-300 hidden sm:inline">•</span>
                            <span className="inline-flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                              <strong className="text-emerald-950 font-bold">Completed:</strong> Delivered &amp; fulfilled
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Structured Customer, Fingerprint & Fulfillment Details Sections */}
                <div className="py-2.5 space-y-2.5 border-b border-slate-200">
                  
                  {/* 1. CUSTOMER & ACCOUNT IDENTITY */}
                  <div>
                    <h3 className="flex items-center gap-1.5 font-heading font-bold text-[10.5px] uppercase tracking-wider text-slate-900 pb-0.5 border-b border-slate-200 mb-1">
                      <Users className="w-3 h-3 text-slate-600 shrink-0" />
                      <span>CUSTOMER &amp; ACCOUNT IDENTITY</span>
                    </h3>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {/* TELEGRAM NAME */}
                      <div>
                        <div className="flex items-center gap-1 leading-none text-slate-400">
                          <User className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                          <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                            TELEGRAM NAME
                          </span>
                        </div>
                        <div 
                          onClick={() => copyToClipboard(selectedOrder.customerName, "customerName", "TELEGRAM NAME")}
                          className="mt-0.5 flex items-center gap-1 min-w-0 cursor-pointer group hover:text-indigo-600 transition-colors"
                          title="Click to copy Telegram Name"
                        >
                          <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-tight tracking-normal truncate group-hover:text-indigo-600 transition-colors">
                            {selectedOrder.customerName || "Customer"}
                          </span>
                          {copiedKey === "customerName" ? (
                            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* TELEGRAM HANDLE */}
                      <div>
                        <div className="flex items-center gap-1 leading-none text-slate-400">
                          <AtSign className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                          <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                            TELEGRAM HANDLE
                          </span>
                        </div>
                        <div 
                          onClick={() => copyToClipboard(selectedOrder.customerUsername, "customerUsername", "TELEGRAM HANDLE")}
                          className="mt-0.5 flex items-center gap-1 min-w-0 cursor-pointer group hover:text-indigo-600 transition-colors"
                          title="Click to copy Telegram Handle"
                        >
                          <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-tight tracking-normal truncate group-hover:text-indigo-600 transition-colors">
                            {selectedOrder.customerUsername 
                              ? (selectedOrder.customerUsername.startsWith('@') ? selectedOrder.customerUsername : `@${selectedOrder.customerUsername}`) 
                              : "None"}
                          </span>
                          {copiedKey === "customerUsername" ? (
                            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* TELEGRAM UID */}
                      <div>
                        <div className="flex items-center gap-1 leading-none text-slate-400">
                          <Hash className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                          <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                            TELEGRAM UID
                          </span>
                        </div>
                        <div 
                          onClick={() => copyToClipboard(String(selectedOrder.customerId || selectedOrder.tgUserId), "customerId", "TELEGRAM UID")}
                          className="mt-0.5 flex items-center gap-1 min-w-0 cursor-pointer group hover:text-indigo-600 transition-colors"
                          title="Click to copy Telegram UID"
                        >
                          <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-tight tracking-normal truncate group-hover:text-indigo-600 transition-colors">
                            {selectedOrder.customerId || selectedOrder.tgUserId || "None"}
                          </span>
                          {copiedKey === "customerId" ? (
                            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* PRIME MID */}
                      <div>
                        <div className="flex items-center gap-1 leading-none text-slate-400">
                          <ShieldCheck className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                          <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                            PRIME MID
                          </span>
                        </div>
                        <div 
                          onClick={() => copyToClipboard(selectedOrder.primeMemberId, "primeMemberId", "PRIME MID")}
                          className="mt-0.5 flex items-center gap-1 min-w-0 cursor-pointer group hover:text-indigo-600 transition-colors"
                          title="Click to copy PRIME MID"
                        >
                          <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-tight tracking-normal truncate group-hover:text-indigo-600 transition-colors">
                            {selectedOrder.primeMemberId || "Unassigned"}
                          </span>
                          {copiedKey === "primeMemberId" ? (
                            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* ORDER HISTORY SUMMARY */}
                      <div className="col-span-2 pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-1 leading-none text-slate-400">
                          <ShoppingBag className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                          <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                            ORDER HISTORY SUMMARY
                          </span>
                        </div>
                        {(() => {
                          const userPrimeId = selectedOrder.primeMemberId || "";
                          const userTgId = String(selectedOrder.customerId || selectedOrder.tgUserId || "");
                          const userTgUsername = selectedOrder.customerUsername || "";

                          const matchCustomer = (o: any) => {
                            const matchPrime = userPrimeId && o.primeMemberId && o.primeMemberId.toLowerCase() === userPrimeId.toLowerCase();
                            const matchId = userTgId && (String(o.customerId) === userTgId || String(o.tgUserId) === userTgId);
                            const matchUser = userTgUsername && o.customerUsername && o.customerUsername.toLowerCase() === userTgUsername.toLowerCase();
                            return Boolean(matchPrime || matchId || matchUser);
                          };

                          const userCompletedCount = orders.filter((o) => matchCustomer(o) && o.status === "Completed").length;
                          const userTotalCount = orders.filter((o) => matchCustomer(o)).length;

                          const handleFilterUserOrders = () => {
                            const filterVal = userPrimeId || userTgId || userTgUsername || selectedOrder.customerName || "";
                            setOrderSearch(filterVal);
                            setView("orders");
                            setCopyToast(`FILTERING ORDERS MANAGEMENT LIST FOR: ${filterVal}`);
                            if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
                            copyToastTimerRef.current = setTimeout(() => setCopyToast(null), 3500);
                          };

                          return (
                            <button
                              type="button"
                              onClick={handleFilterUserOrders}
                              className="mt-0.5 flex items-center gap-2 cursor-pointer group hover:text-indigo-600 transition-colors text-left"
                              title="Click to view all orders by this customer in Orders Management"
                            >
                              <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-tight tracking-normal group-hover:text-indigo-600 group-hover:underline transition-colors flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span>{userCompletedCount} Successful Orders</span>
                                </span>
                                <span className="text-slate-500 font-normal text-[11px]">({userTotalCount} Total Placed)</span>
                                <ExternalLink className="w-3 h-3 text-indigo-500 opacity-80 group-hover:opacity-100 transition-opacity ml-0.5" />
                              </span>
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* 2. TRANSACTION & DEVICE FINGERPRINT */}
                  <div>
                    <h3 className="flex items-center gap-1.5 font-heading font-bold text-[10.5px] uppercase tracking-wider text-slate-900 pb-0.5 border-b border-slate-200 mb-1">
                      <Fingerprint className="w-3 h-3 text-slate-600 shrink-0" />
                      <span>TRANSACTION &amp; DEVICE FINGERPRINT</span>
                    </h3>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {/* IP ADDRESS */}
                      <div>
                        <div className="flex items-center gap-1 leading-none text-slate-400">
                          <Globe className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                          <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                            IP ADDRESS
                          </span>
                        </div>
                        <div 
                          onClick={() => copyToClipboard(selectedOrder.ip || selectedOrder.deviceSnapshot?.ip, "ipAddress", "IP ADDRESS")}
                          className="mt-0.5 flex items-center gap-1 min-w-0 cursor-pointer group hover:text-indigo-600 transition-colors"
                          title="Click to copy IP Address"
                        >
                          <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-tight tracking-normal truncate group-hover:text-indigo-600 transition-colors">
                            {selectedOrder.ip || selectedOrder.deviceSnapshot?.ip || "000.00.000.000"}
                          </span>
                          {copiedKey === "ipAddress" ? (
                            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* COORDINATES */}
                      {(() => {
                        const coords = (() => {
                          if (selectedOrder.deviceSnapshot?.location?.latitude && selectedOrder.deviceSnapshot?.location?.longitude) {
                            return `${selectedOrder.deviceSnapshot.location.latitude}, ${selectedOrder.deviceSnapshot.location.longitude}`;
                          }
                          if (selectedOrder.deviceSnapshot?.location?.lat && selectedOrder.deviceSnapshot?.location?.lon) {
                            return `${selectedOrder.deviceSnapshot.location.lat}, ${selectedOrder.deviceSnapshot.location.lon}`;
                          }
                          if (selectedOrder.coordinates) {
                            if (typeof selectedOrder.coordinates === "string" && selectedOrder.coordinates.trim()) return selectedOrder.coordinates.trim();
                            if (typeof selectedOrder.coordinates === "object" && selectedOrder.coordinates?.lat && (selectedOrder.coordinates?.lon || selectedOrder.coordinates?.lng)) {
                              return `${selectedOrder.coordinates.lat}, ${selectedOrder.coordinates.lon || selectedOrder.coordinates.lng}`;
                            }
                          }
                          if (selectedOrder.deviceSnapshot?.coordinates) {
                            if (typeof selectedOrder.deviceSnapshot.coordinates === "string" && selectedOrder.deviceSnapshot.coordinates.trim()) return selectedOrder.deviceSnapshot.coordinates.trim();
                          }
                          return "Not captured";
                        })();

                        return (
                          <div>
                            <div className="flex items-center gap-1 leading-none text-slate-400">
                              <Compass className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                              <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                                COORDINATES
                              </span>
                            </div>
                            <div 
                              onClick={() => copyToClipboard(coords, "coordinates", "COORDINATES")}
                              className="mt-0.5 flex items-center gap-1 min-w-0 cursor-pointer group hover:text-indigo-600 transition-colors"
                              title="Click to copy Coordinates"
                            >
                              <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-tight tracking-normal truncate group-hover:text-indigo-600 transition-colors">
                                {coords}
                              </span>
                              {copiedKey === "coordinates" ? (
                                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                              ) : (
                                <Copy className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* DEVICE IDENTIFIER */}
                      {(() => {
                        const devId = selectedOrder.deviceSnapshot?.deviceId 
                          || selectedOrder.deviceId 
                          || selectedOrder.deviceSnapshot?.device_id 
                          || selectedOrder.deviceSnapshot?.hardwareId
                          || selectedOrder.deviceFingerprint 
                          || selectedOrder.deviceSnapshot?.deviceFingerprint 
                          || "Not captured";

                        const linkedAccounts = getAccountsLinkedToDevice(devId);
                        const isMultiAccount = linkedAccounts.length >= 2;

                        return (
                          <div>
                            <div className="flex items-center gap-1 leading-none text-slate-400">
                              <Smartphone className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                              <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                                DEVICE IDENTIFIER
                              </span>
                              
                              {/* Red triangle flag if device is linked to multiple accounts */}
                              {isMultiAccount && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDeviceIdForAccounts(devId);
                                    setView("device-accounts");
                                  }}
                                  className="inline-flex items-center shrink-0 cursor-pointer text-red-600 hover:text-red-700 hover:scale-110 active:scale-95 transition-all ml-0.5"
                                  title={`Flagged: Device linked to ${linkedAccounts.length} accounts. Click to view linked accounts.`}
                                >
                                  <AlertTriangle 
                                    className="w-2.5 h-2.5 text-red-600 fill-red-100 shrink-0" 
                                  />
                                </button>
                              )}
                            </div>
                            <div 
                              onClick={() => copyToClipboard(devId, "deviceIdentifier", "DEVICE IDENTIFIER")}
                              className="mt-0.5 flex items-center gap-1 min-w-0 cursor-pointer group hover:text-indigo-600 transition-colors"
                              title="Click to copy Device Identifier"
                            >
                              <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-tight tracking-normal truncate group-hover:text-indigo-600 transition-colors">
                                {devId}
                              </span>
                              {copiedKey === "deviceIdentifier" ? (
                                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                              ) : (
                                <Copy className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* SESSION TOKEN */}
                      {(() => {
                        const sessToken = selectedOrder.sessionToken 
                          || selectedOrder.deviceSnapshot?.sessionToken 
                          || selectedOrder.deviceSnapshot?.sessionId 
                          || selectedOrder.sessionId 
                          || selectedOrder.cartToken 
                          || (selectedOrder.orderNumber ? `SESS_HMAC_${selectedOrder.orderNumber.slice(-8)}8F3C9A` : "Not captured");

                        return (
                          <div>
                            <div className="flex items-center gap-1 leading-none text-slate-400">
                              <Lock className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                              <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                                SESSION TOKEN
                              </span>
                            </div>
                            <div 
                              onClick={() => copyToClipboard(sessToken, "sessionToken", "SESSION TOKEN")}
                              className="mt-0.5 flex items-center gap-1 min-w-0 cursor-pointer group hover:text-indigo-600 transition-colors"
                              title="Click to copy Session Token"
                            >
                              <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-tight tracking-normal truncate group-hover:text-indigo-600 transition-colors">
                                {sessToken}
                              </span>
                              {copiedKey === "sessionToken" ? (
                                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                              ) : (
                                <Copy className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* PRECISE GPS ADDRESS */}
                      <div className="col-span-2">
                        <div className="flex items-center gap-1 leading-none text-slate-400">
                          <MapPin className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                          <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                            PRECISE GPS ADDRESS
                          </span>
                        </div>
                        <div 
                          onClick={() => copyToClipboard(gpsStreetAddressText, "gpsAddress", "PRECISE GPS ADDRESS")}
                          className="mt-0.5 flex items-start gap-1 cursor-pointer group hover:text-indigo-600 transition-colors"
                          title="Click to copy Precise GPS Address"
                        >
                          <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-snug tracking-normal break-words flex-1 group-hover:text-indigo-600 transition-colors">
                            {gpsStreetAddressText}
                          </span>
                          {copiedKey === "gpsAddress" ? (
                            <Check className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. RECIPIENT & DELIVERY INFORMATION */}
                  <div>
                    <h3 className="flex items-center gap-1.5 font-heading font-bold text-[10.5px] uppercase tracking-wider text-slate-900 pb-0.5 border-b border-slate-200 mb-1">
                      <Truck className="w-3 h-3 text-slate-600 shrink-0" />
                      <span>RECIPIENT &amp; DELIVERY INFORMATION</span>
                    </h3>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {/* RECEIVER'S NAME */}
                      <div>
                        <div className="flex items-center gap-1 leading-none text-slate-400">
                          <User className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                          <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                            RECEIVER'S NAME
                          </span>
                        </div>
                        <div 
                          onClick={() => copyToClipboard(selectedOrder.receiverName, "receiverName", "RECEIVER NAME")}
                          className="mt-0.5 flex items-center gap-1 min-w-0 cursor-pointer group hover:text-indigo-600 transition-colors"
                          title="Click to copy Receiver's Name"
                        >
                          <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-tight tracking-normal truncate group-hover:text-indigo-600 transition-colors">
                            {selectedOrder.receiverName || "None"}
                          </span>
                          {copiedKey === "receiverName" ? (
                            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* RECEIVER'S PHONE */}
                      <div>
                        <div className="flex items-center gap-1 leading-none text-slate-400">
                          <Phone className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                          <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                            RECEIVER'S PHONE
                          </span>
                        </div>
                        <div 
                          onClick={() => copyToClipboard(selectedOrder.receiverPhone, "receiverPhone", "RECEIVER PHONE")}
                          className="mt-0.5 flex items-center gap-1 min-w-0 cursor-pointer group hover:text-indigo-600 transition-colors"
                          title="Click to copy Receiver's Phone"
                        >
                          <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-tight tracking-normal truncate group-hover:text-indigo-600 transition-colors">
                            {selectedOrder.receiverPhone || "None"}
                          </span>
                          {copiedKey === "receiverPhone" ? (
                            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* DELIVERY ADDRESS */}
                      <div className="col-span-2">
                        <div className="flex items-center gap-1 leading-none text-slate-400">
                          <MapPin className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                          <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                            DELIVERY ADDRESS
                          </span>
                        </div>
                        <div 
                          onClick={() => copyToClipboard(deliveryAddressText, "deliveryAddress", "DELIVERY ADDRESS")}
                          className="mt-0.5 flex items-start gap-1 cursor-pointer group hover:text-indigo-600 transition-colors"
                          title="Click to copy Delivery Address"
                        >
                          <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-snug tracking-normal break-words flex-1 group-hover:text-indigo-600 transition-colors">
                            {deliveryAddressText || "None"}
                          </span>
                          {copiedKey === "deliveryAddress" ? (
                            <Check className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                          )}
                        </div>
                      </div>

                      {/* DELIVERY NOTES */}
                      <div className="col-span-2">
                        <div className="flex items-center gap-1 leading-none text-slate-400">
                          <FileText className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                          <span className="font-heading font-medium text-[9.5px] uppercase tracking-wider text-slate-400">
                            DELIVERY NOTES
                          </span>
                        </div>
                        <div 
                          onClick={() => copyToClipboard(selectedOrder.notes, "notes", "DELIVERY NOTES")}
                          className="mt-0.5 flex items-start gap-1 cursor-pointer group hover:text-indigo-600 transition-colors"
                          title="Click to copy Delivery Notes"
                        >
                          <span className="font-ibm-condensed font-normal text-slate-700 text-[12.5px] leading-snug tracking-normal break-words flex-1 group-hover:text-indigo-600 transition-colors">
                            {selectedOrder.notes && selectedOrder.notes.trim() ? selectedOrder.notes.trim() : "None"}
                          </span>
                          {copiedKey === "notes" ? (
                            <Check className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                          )}
                        </div>
                      </div>

                      {/* COURIER TRACKING URL */}
                      <div className="col-span-2 pt-2 border-t border-slate-100 space-y-1">
                        <div className="flex items-center justify-between gap-1 leading-none">
                          <label htmlFor={`tracking-url-input-${selectedOrder.id}`} className="font-heading font-bold text-[9.5px] uppercase tracking-wider text-slate-700 flex items-center gap-1">
                            <Truck className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                            <span>COURIER TRACKING URL</span>
                          </label>
                          {selectedOrder.trackingUrl && (
                            <a
                              href={selectedOrder.trackingUrl.startsWith('http') ? selectedOrder.trackingUrl : `https://${selectedOrder.trackingUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer"
                              title="Open tracking link in new tab"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span>Open URL</span>
                            </a>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-1.5">
                          <input
                            id={`tracking-url-input-${selectedOrder.id}`}
                            type="url"
                            value={trackingUrlInput}
                            onChange={(e) => setTrackingUrlInput(e.target.value)}
                            placeholder="e.g. https://www.lalamove.com/order/... or courier tracking link"
                            className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveTrackingUrl(selectedOrder.id, trackingUrlInput)}
                            disabled={isSavingTrackingUrl}
                            className="px-3.5 py-1.5 bg-slate-900 hover:bg-black disabled:opacity-50 text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-xs"
                          >
                            {isSavingTrackingUrl ? (
                              <span>Saving...</span>
                            ) : trackingSavedSuccess ? (
                              <span>Saved</span>
                            ) : (
                              <span>Save Tracking</span>
                            )}
                          </button>
                        </div>
                        <p className="text-[9px] font-mono text-slate-400">
                          When set, an interactive &quot;Track Shipment&quot; button will automatically display to the customer in their live order status.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Line Items */}
                <div className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-normal text-sm uppercase text-slate-900 tracking-wide flex items-center gap-1.5">
                        <ShoppingBag className="w-4 h-4 text-slate-600" />
                        <span>Purchased Items</span>
                      </h3>
                      {Array.isArray(selectedOrder.modificationHistory) && selectedOrder.modificationHistory.length > 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 uppercase">
                          Modified ({selectedOrder.modificationHistory.length}x)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                    {(selectedOrder.items || []).map((it: any, i: number) => {
                      const isFreeItem = Boolean(it.isFree || Number(it.price) === 0);
                      return (
                        <div key={i} className="p-3 flex items-center justify-between text-xs font-mono">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-slate-900">{it.name}</p>
                              {isFreeItem && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  Free Item
                                </span>
                              )}
                            </div>
                            <p className="text-slate-500">
                              Qty {it.quantity} &bull; Unit {isFreeItem ? <span className="text-emerald-600 font-bold">FREE</span> : <span className="font-ibm-condensed">{formatPHP(it.price)}</span>}
                              {it.originalPrice && it.originalPrice !== it.price && (
                                <span className="text-slate-400 line-through ml-1.5 font-ibm-condensed">
                                  {formatPHP(it.originalPrice)}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <p className={`font-ibm-condensed font-medium text-sm ${isFreeItem ? "text-emerald-600 font-bold" : "text-slate-900"}`}>
                              {isFreeItem ? "FREE" : formatPHP(Number(it.price) * (Number(it.quantity) || 1))}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setModifyingOrder(selectedOrder);
                                setIsModifyModalOpen(true);
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                              title="Edit item price or quantity"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Order Financial Breakdown */}
                    <div className="p-3 bg-slate-50/70 border-t border-slate-100 space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between items-center text-slate-600">
                        <span>Items Subtotal</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-ibm-condensed font-medium text-slate-900">
                            {formatPHP(selectedOrder.subTotal || selectedOrder.items?.reduce((s: number, it: any) => s + (Number(it.price) * (Number(it.quantity) || 1)), 0) || 0)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setModifyingOrder(selectedOrder);
                              setIsModifyModalOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            title="Edit subtotal / items"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Applied Charges */}
                      {Array.isArray(selectedOrder.appliedCharges) && selectedOrder.appliedCharges.map((ch: any, ci: number) => {
                        const chargeName = String(ch.name || "Fee").replace(/:+$/, "").trim();
                        const isChFree = Boolean(ch.isFree || Number(ch.amount) === 0);
                        return (
                          <div key={ci} className="flex justify-between items-center text-slate-600">
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              <span>{chargeName}</span>
                              {isChFree && (
                                <span className="text-[10px] text-emerald-600 font-bold">(WAIVED / FREE)</span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className={`font-ibm-condensed font-medium ${isChFree ? "text-emerald-600 font-bold" : "text-slate-800"}`}>
                                {isChFree ? "FREE" : formatPHP(ch.amount || 0)}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setModifyingOrder(selectedOrder);
                                  setIsModifyModalOpen(true);
                                }}
                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                                title="Edit charge amount"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Delivery Fee */}
                      {(Number(selectedOrder.deliveryFee) > 0 || selectedOrder.isDeliveryFeeFree) && (
                        <div className="flex justify-between items-center text-slate-600">
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                            <span>Delivery ({selectedOrder.courier?.name || "Courier"})</span>
                            {selectedOrder.isDeliveryFeeFree && (
                              <span className="text-[10px] text-emerald-600 font-bold">(WAIVED / FREE)</span>
                            )}
                            <span className="text-[10px] text-slate-400">
                              ({selectedOrder.deliveryFeePaymentMethod === "upon_delivery" ? "Paid upon delivery" : "Paid at checkout"})
                            </span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className={`font-ibm-condensed font-medium ${selectedOrder.isDeliveryFeeFree ? "text-emerald-600 font-bold" : "text-slate-800"}`}>
                              {selectedOrder.isDeliveryFeeFree ? "FREE" : formatPHP(selectedOrder.deliveryFee)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setModifyingOrder(selectedOrder);
                                setIsModifyModalOpen(true);
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                              title="Edit delivery fee"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {(() => {
                      const isFeeUponDelivery = selectedOrder.deliveryFeePaymentMethod === "upon_delivery";
                      const chargesSum = Array.isArray(selectedOrder.appliedCharges) 
                        ? selectedOrder.appliedCharges.reduce((acc: number, c: any) => acc + (Number(c.amount) || 0), 0) 
                        : 0;
                      const subTotalVal = Number(selectedOrder.subTotal) || 0;
                      const itemsAndCharges = subTotalVal + chargesSum;
                      // When marked upon delivery, total payable to shop must NOT include the courier delivery fee
                      const effectiveTotal = isFeeUponDelivery
                        ? (selectedOrder.payableNow !== undefined 
                            ? Number(selectedOrder.payableNow) 
                            : itemsAndCharges)
                        : (Number(selectedOrder.totalAmount) || (itemsAndCharges + (Number(selectedOrder.deliveryFee) || 0)));

                      return (
                        <div className="p-3 bg-slate-100 flex items-center justify-between font-mono font-bold text-slate-900 border-t border-slate-200">
                          <span>Total Amount</span>
                          <span className="text-base font-ibm-condensed font-semibold">{formatPHP(effectiveTotal)}</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Modification Audit History */}
                  {Array.isArray(selectedOrder.modificationHistory) && selectedOrder.modificationHistory.length > 0 && (
                    <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl font-mono text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900 uppercase text-[11px] mb-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        <span>Admin Modification History ({selectedOrder.modificationHistory.length})</span>
                      </div>
                      <div className="space-y-1 divide-y divide-amber-200/50">
                        {selectedOrder.modificationHistory.map((h: any, hi: number) => (
                          <div key={hi} className="pt-1.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-amber-950">
                            <div>
                              <span className="font-semibold text-amber-800">
                                {h.modifiedAt ? new Date(h.modifiedAt).toLocaleString("en-PH") : "Modified"}:
                              </span>{" "}
                              <span>{h.notes || "Admin updated items or pricing"}</span>
                            </div>
                            <div className="text-[10px] text-amber-700 shrink-0">
                              {h.previousTotal !== undefined && (
                                <span>{formatPHP(h.previousTotal)} &rarr; <strong>{formatPHP(h.newTotal)}</strong></span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Payment Review Details */}
                <div className="pt-6 mt-6 border-t border-slate-100">
                  <h3 className="font-heading font-normal text-sm uppercase text-slate-900 mb-3 tracking-wide flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-slate-600" />
                    <span>Transaction & Payment Verification</span>
                  </h3>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">Selected Gateway</p>
                        <p className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
                          {selectedOrder.paymentMethodName || "No Payment Method Selected / COD"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold sm:text-right">Payment Verification Status</p>
                        <div className="mt-1 sm:text-right">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider ${
                            selectedOrder.paymentStatus === "Confirmed"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : selectedOrder.paymentStatus === "Declined"
                              ? "bg-red-100 text-red-800 border border-red-200"
                              : selectedOrder.paymentStatus === "Pending Review"
                              ? "bg-amber-100 text-amber-800 border border-amber-200 animate-pulse"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}>
                            {selectedOrder.paymentStatus || "Pending Submission"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* View Payment proof button (DO NOT PRE-LOAD IMAGE) */}
                    {selectedOrder.paymentProofImage ? (
                      <div className="pt-3 border-t border-slate-200/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                            <Receipt className="w-5 h-5" />
                          </div>
                          <div className="font-mono">
                            <p className="text-xs font-bold text-slate-900">Payment Proof Uploaded</p>
                            <p className="text-[11px] text-slate-500">Image submitted for verification</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => setZoomedProofImage(selectedOrder.paymentProofImage)}
                            className="flex-1 sm:flex-none px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
                          >
                            <span>View Payment</span>
                          </button>
                          <a 
                            href={selectedOrder.paymentProofImage}
                            download={`receipt-${selectedOrder.orderNumber}.png`}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold font-mono rounded-lg transition-colors flex items-center justify-center gap-1 shrink-0"
                            title="Download Payment Proof"
                          >
                            Download
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-white border border-dashed border-slate-300 rounded-xl text-center text-xs font-mono text-slate-500 flex items-center justify-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        <span>No payment proof uploaded yet &bull; Listening for customer upload in real time...</span>
                      </div>
                    )}

                    {/* Actions: Approve / Reject / Reset */}
                    <div className="pt-2">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => handleUpdateOrderPaymentStatus(selectedOrder.id, "Confirmed")}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-heading font-normal uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            selectedOrder.paymentStatus === "Confirmed"
                              ? "bg-emerald-600 text-white shadow-sm cursor-default"
                              : "bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          <Check className="w-4 h-4" /> Approve Payment
                        </button>
                        <button
                          onClick={() => handleUpdateOrderPaymentStatus(selectedOrder.id, "Declined")}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-heading font-normal uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            selectedOrder.paymentStatus === "Declined"
                              ? "bg-red-600 text-white shadow-sm cursor-default"
                              : "bg-white hover:bg-red-50 text-red-700 border border-red-200"
                          }`}
                        >
                          ✕ Reject Payment
                        </button>
                        <button
                          onClick={() => handleUpdateOrderPaymentStatus(selectedOrder.id, "Pending Review")}
                          className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-mono font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer text-center"
                        >
                          Reset to Pending Review
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Internal Notes & Staff Activity Log */}
                <div className="pt-6 mt-6 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-slate-600" />
                      <h3 className="font-heading font-normal text-sm uppercase text-slate-900 tracking-wide">
                        Internal Notes &amp; Staff Activity Log
                      </h3>
                      {Array.isArray(selectedOrder.internalNotes) && selectedOrder.internalNotes.length > 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {selectedOrder.internalNotes.length} {selectedOrder.internalNotes.length === 1 ? 'note' : 'notes'}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      Private comments &amp; timestamped logs visible only to admin staff
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                    {/* Quick Insert Suggestions */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono font-bold uppercase text-slate-400 tracking-wider">Quick Suggestions:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          "Called customer at 2pm, confirmed address",
                          "Damaged in transit, waiting for replacement",
                          "Customer requested delivery time window change",
                          "Payment verified manually with bank record",
                          "Dispatched with courier rider"
                        ].map((tpl, tplIdx) => (
                          <button
                            key={tplIdx}
                            type="button"
                            onClick={() => setInternalNoteInput(tpl)}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-mono text-slate-700 transition-colors cursor-pointer text-left"
                          >
                            + {tpl}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Note Input Field */}
                    <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className="flex-1">
                          <label htmlFor={`internal-note-input-${selectedOrder.id}`} className="sr-only">Add internal note</label>
                          <input
                            id={`internal-note-input-${selectedOrder.id}`}
                            type="text"
                            value={internalNoteInput}
                            onChange={(e) => setInternalNoteInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleAddInternalNote(selectedOrder.id, internalNoteInput);
                              }
                            }}
                            placeholder="Add internal note (e.g. 'Called customer at 2pm', 'Damaged in transit, waiting for replacement')..."
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
                          />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="text"
                            value={internalNoteAuthor}
                            onChange={(e) => setInternalNoteAuthor(e.target.value)}
                            placeholder="Staff Name"
                            title="Author name"
                            className="w-28 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddInternalNote(selectedOrder.id, internalNoteInput)}
                            disabled={!internalNoteInput.trim() || isSavingInternalNote}
                            className="px-3.5 py-1.5 bg-slate-900 hover:bg-black disabled:opacity-40 text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-xs active:scale-95"
                          >
                            {isSavingInternalNote ? (
                              <span>Saving...</span>
                            ) : (
                              <span>Append Note</span>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Note List */}
                    {Array.isArray(selectedOrder.internalNotes) && selectedOrder.internalNotes.length > 0 ? (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {selectedOrder.internalNotes.map((noteItem: any, noteIdx: number) => {
                          const noteKey = noteItem.id || `note-${noteIdx}`;
                          return (
                            <div 
                              key={noteKey}
                              className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-xs font-mono group"
                            >
                              <div className="space-y-1 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-800 border border-slate-200 uppercase">
                                    {noteItem.author || "Staff Admin"}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {noteItem.createdAt ? new Date(noteItem.createdAt).toLocaleString("en-PH", {
                                      dateStyle: "medium",
                                      timeStyle: "short"
                                    }) : "Recent"}
                                  </span>
                                </div>
                                <p className="text-slate-800 text-xs leading-relaxed break-words font-medium">
                                  {noteItem.note}
                                </p>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 self-end sm:self-start opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(noteItem.note);
                                    setCopiedNoteId(noteKey);
                                    setTimeout(() => setCopiedNoteId(null), 2000);
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                  title="Copy Note Text"
                                >
                                  {copiedNoteId === noteKey ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteInternalNote(selectedOrder.id, noteItem.id)}
                                  className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Delete Note"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4 bg-white border border-dashed border-slate-200 rounded-xl text-center text-xs font-mono text-slate-400">
                        No internal staff comments recorded for this order yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Native Printable Document (Hidden on screen, actively rendered when window.print() triggers) */}
            <OrderPrintView
              order={selectedOrder}
              deliveryAddressText={deliveryAddressText}
              gpsStreetAddressText={gpsStreetAddressText}
              format={printPaperFormat}
            />

            {/* Share Order Modal */}
            <ShareOrderModal
              isOpen={isShareModalOpen}
              onClose={() => setIsShareModalOpen(false)}
              order={selectedOrder}
              deliveryAddressText={deliveryAddressText}
              gpsStreetAddressText={gpsStreetAddressText}
            />
          </motion.div>
        );
      })()}

        {/* ========================================================================= */}
        {/* 6. PRODUCTS SECTION: SEPARATE FULL PAGE WITH STICKY NON-SCROLLING SEARCH   */}
        {/*    + COMPACT "+ ADD PRODUCT" BUTTON AT TOP (FORMS NOT SHOWN RIGHT AWAY)   */}
        {/* ========================================================================= */}
        {view === "products" && (
          <motion.div
            key="view-products"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-50"
          >
            {/* Sticky non-scrolling search & header */}
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setView("dashboard")}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
                    </button>
                    <span className="text-slate-300">/</span>
                    <h2 className="text-base sm:text-lg font-heading font-black tracking-wide uppercase text-slate-900">
                      Products Configurator
                    </h2>
                    <span className="text-[10px] font-mono bg-slate-900 text-white px-2 py-0.5 rounded-full font-bold">
                      {filteredProducts.length}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setEditingProduct({
                        name: "",
                        price: 49.99,
                        stock: 50,
                        category: "Featured",
                        description: "",
                        imageUrl: "https://picsum.photos/seed/primeprod/400/400",
                        active: true
                      });
                      setProductModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Product
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search product catalog by name or category..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Compact Products List */}
            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-2.5">
              {filteredProducts.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
                  <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="font-heading font-black text-slate-800 uppercase tracking-wide text-sm mb-1">
                    No products found
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Click &quot;Add Product&quot; above to create a new catalog item.
                  </p>
                </div>
              ) : (
                filteredProducts.map((prod, index) => {
                  const hasVariants = Array.isArray(prod.variants) && prod.variants.length > 0;
                  const totalStock = hasVariants
                    ? prod.variants.reduce((sum: number, v: any) => sum + (Number(v.stock) || 0), 0)
                    : (Number(prod.stock) || 0);
                  const isFirst = index === 0;
                  const isLast = index === filteredProducts.length - 1;

                  return (
                    <div
                      key={prod.id}
                      className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 group hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Sort Ordering Controls */}
                        <div className="flex items-center gap-1 shrink-0 bg-slate-50 border border-slate-200 p-1 rounded-lg">
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleMoveProductOrder(prod.id, "up")}
                              disabled={isFirst}
                              title="Move Up (Display earlier on shopfront)"
                              className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-20 disabled:hover:bg-transparent transition-all cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveProductOrder(prod.id, "down")}
                              disabled={isLast}
                              title="Move Down (Display later on shopfront)"
                              className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-20 disabled:hover:bg-transparent transition-all cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex flex-col items-center justify-center px-1">
                            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400">Order</span>
                            <input
                              type="number"
                              min="1"
                              value={prod.sortOrder ?? index + 1}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val)) {
                                  handleSetProductSortOrder(prod.id, val);
                                }
                              }}
                              title="Direct Display Priority Rank"
                              className="w-10 text-center font-mono font-black text-xs bg-white border border-slate-200 rounded py-0.5 text-slate-900 focus:outline-none focus:border-slate-900"
                            />
                          </div>
                        </div>

                        <img
                          src={prod.imageUrl || "https://picsum.photos/seed/prime/100"}
                          alt={prod.name}
                          className="w-12 h-12 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-heading font-black text-sm text-slate-900 truncate">
                              {prod.name}
                            </h4>
                            <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0">
                              {prod.category || "General"}
                            </span>
                            {hasVariants ? (
                              <span className="text-[9px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                                {prod.variants.length} Variants
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded shrink-0">
                                Single Variant
                              </span>
                            )}
                            {prod.active === false && (
                              <span className="text-[9px] font-mono bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                                Hidden
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-mono text-slate-500 mt-0.5">
                            Price: <span className="font-bold text-slate-900">{formatPHP(prod.price)}</span> &bull; Total Stock: <span className="font-bold text-slate-800">{totalStock}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto justify-end">
                        <button
                          onClick={() => handleToggleProductActive(prod)}
                          className={`p-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                            prod.active === false
                              ? "bg-red-50 border-red-200 text-red-600"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                          title={prod.active === false ? "Show in Store" : "Hide from Store"}
                        >
                          {prod.active === false ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={() => {
                            setEditingProduct(prod);
                            setProductModalOpen(true);
                          }}
                          className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                          title="Edit Product"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteProduct(prod.id)}
                          className="p-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg transition-colors cursor-pointer"
                          title="Delete Product"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* PRODUCT CONFIGURATION MODAL (Only opened via button, not shown right away) */}
            {productModalOpen && (
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col p-6 shadow-2xl border border-slate-200">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                    <h3 className="font-heading font-black uppercase text-base text-slate-900 tracking-wide">
                      {editingProduct?.id ? "Edit Product" : "Add New Product"}
                    </h3>
                    <button
                      onClick={() => setProductModalOpen(false)}
                      className="text-slate-400 hover:text-slate-800 text-sm font-mono"
                    >
                      ✕
                    </button>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const finalProduct = { ...editingProduct };
                      if (finalProduct.variants && finalProduct.variants.length > 0) {
                        finalProduct.stock = finalProduct.variants.reduce((acc: number, v: any) => acc + (v.stock || 0), 0);
                        const prices = finalProduct.variants.map((v: any) => v.price || 0);
                        finalProduct.price = Math.min(...prices);
                      } else {
                        finalProduct.stock = finalProduct.stock ?? 10;
                        finalProduct.price = finalProduct.price ?? 49.99;
                      }
                      finalProduct.rating = finalProduct.rating ?? 4.5;
                      finalProduct.lowStockThreshold = finalProduct.lowStockThreshold ?? 10;

                      handleSaveProduct(finalProduct);
                    }}
                    className="space-y-4 text-xs overflow-y-auto flex-1 pr-1 mt-3"
                  >
                    <div>
                      <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-widest mb-1">
                        Product Name
                      </label>
                      <input
                        type="text"
                        required
                        value={editingProduct?.name || ""}
                        onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 font-medium"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-widest mb-1">
                          Price (₱)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={editingProduct?.price ?? 49.99}
                          onChange={(e) => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-widest mb-1">
                          Category
                        </label>
                        <input
                          type="text"
                          value={editingProduct?.category || "Featured"}
                          onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 font-medium"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-widest mb-1">
                          Sort Priority
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={editingProduct?.sortOrder ?? 1}
                          onChange={(e) => setEditingProduct({ ...editingProduct, sortOrder: parseInt(e.target.value) || 1 })}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 font-mono"
                          title="Display order ranking (1 appears first)"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-widest mb-1">
                          Low Stock Threshold
                        </label>
                        <input
                          type="number"
                          required
                          value={editingProduct?.lowStockThreshold ?? 10}
                          onChange={(e) => setEditingProduct({ ...editingProduct, lowStockThreshold: parseInt(e.target.value) || 0 })}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-widest mb-1">
                          Rating (1-5)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="1"
                          max="5"
                          required
                          value={editingProduct?.rating ?? 4.5}
                          onChange={(e) => setEditingProduct({ ...editingProduct, rating: parseFloat(e.target.value) || 4.5 })}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 font-mono"
                        />
                      </div>
                    </div>

                    {(!editingProduct?.variants || editingProduct.variants.length === 0) && (
                      <div>
                        <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-widest mb-1">
                          Stock (No Variants Mode)
                        </label>
                        <input
                          type="number"
                          required
                          value={editingProduct?.stock ?? 10}
                          onChange={(e) => setEditingProduct({ ...editingProduct, stock: parseInt(e.target.value) || 0 })}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 font-mono"
                        />
                      </div>
                    )}

                    <ImageUploadField
                      label="Product Image"
                      value={editingProduct?.imageUrl || ""}
                      onChange={(base64) => setEditingProduct({ ...editingProduct, imageUrl: base64 })}
                    />

                    <div>
                      <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-widest mb-1">
                        Description
                      </label>
                      <textarea
                        rows={2}
                        value={editingProduct?.description || ""}
                        onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 font-medium"
                      />
                    </div>

                    {/* Variants Management */}
                    <div className="pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-heading font-black uppercase text-xs tracking-wider text-slate-700">
                          Product Variants
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const newVar = {
                              id: Math.random().toString(36).substring(2, 9),
                              name: "",
                              imageUrl: "",
                              rating: 4.5,
                              stock: 10,
                              price: editingProduct?.price || 49.99,
                              tag: "NONE"
                            };
                            const current = editingProduct?.variants || [];
                            setEditingProduct({ ...editingProduct, variants: [...current, newVar] });
                          }}
                          className="px-2.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-md text-[10px] font-bold uppercase tracking-wider font-mono cursor-pointer"
                        >
                          + Add Variant
                        </button>
                      </div>

                      {(!editingProduct?.variants || editingProduct.variants.length === 0) ? (
                        <p className="text-[11px] text-slate-400 italic">No variants configured. Product will sell in single-variant mode.</p>
                      ) : (
                        <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                          {editingProduct.variants.map((v: any, index: number) => (
                            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2 relative" key={v.id || index}>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-500 uppercase text-[9px] tracking-widest font-mono">
                                  Variant #{index + 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingProduct?.variants || []).filter((_: any, idx: number) => idx !== index);
                                    setEditingProduct({ ...editingProduct, variants: updated });
                                  }}
                                  className="text-red-500 hover:text-red-700 text-[9px] font-bold uppercase tracking-wider font-mono cursor-pointer"
                                >
                                  Remove
                                </button>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2">
                                <div className="col-span-2">
                                  <ImageUploadField
                                    label="Variant Image (Optional)"
                                    value={v.imageUrl || ""}
                                    onChange={(base64) => {
                                      const updated = [...(editingProduct?.variants || [])];
                                      updated[index] = { ...updated[index], imageUrl: base64 };
                                      setEditingProduct({ ...editingProduct, variants: updated });
                                    }}
                                  />
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Variant Name</label>
                                  <input
                                    type="text"
                                    required
                                    placeholder="e.g. Size M, Red"
                                    value={v.name || ""}
                                    onChange={(e) => {
                                      const updated = [...(editingProduct?.variants || [])];
                                      updated[index] = { ...updated[index], name: e.target.value };
                                      setEditingProduct({ ...editingProduct, variants: updated });
                                    }}
                                    className="w-full p-1.5 bg-white border border-slate-200 rounded-md text-[11px] focus:outline-none"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-4 gap-1.5">
                                <div>
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Price (₱)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={v.price ?? ""}
                                    onChange={(e) => {
                                      const updated = [...(editingProduct?.variants || [])];
                                      updated[index] = { ...updated[index], price: parseFloat(e.target.value) || 0 };
                                      setEditingProduct({ ...editingProduct, variants: updated });
                                    }}
                                    className="w-full p-1.5 bg-white border border-slate-200 rounded-md text-[11px] focus:outline-none font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Stock</label>
                                  <input
                                    type="number"
                                    required
                                    value={v.stock ?? ""}
                                    onChange={(e) => {
                                      const updated = [...(editingProduct?.variants || [])];
                                      updated[index] = { ...updated[index], stock: parseInt(e.target.value) || 0 };
                                      setEditingProduct({ ...editingProduct, variants: updated });
                                    }}
                                    className="w-full p-1.5 bg-white border border-slate-200 rounded-md text-[11px] focus:outline-none font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Rating</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="1"
                                    max="5"
                                    value={v.rating ?? 4.5}
                                    onChange={(e) => {
                                      const updated = [...(editingProduct?.variants || [])];
                                      updated[index] = { ...updated[index], rating: parseFloat(e.target.value) || 4.5 };
                                      setEditingProduct({ ...editingProduct, variants: updated });
                                    }}
                                    className="w-full p-1.5 bg-white border border-slate-200 rounded-md text-[11px] focus:outline-none font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Tag</label>
                                  <select
                                    value={v.tag || "NONE"}
                                    onChange={(e) => {
                                      const updated = [...(editingProduct?.variants || [])];
                                      updated[index] = { ...updated[index], tag: e.target.value };
                                      setEditingProduct({ ...editingProduct, variants: updated });
                                    }}
                                    className="w-full p-1.5 bg-white border border-slate-200 rounded-md text-[11px] focus:outline-none"
                                  >
                                    <option value="NONE">NONE</option>
                                    <option value="NEW">NEW</option>
                                    <option value="LOW STOCKS">LOW STOCKS</option>
                                    <option value="UNAVAILABLE">UNAVAILABLE</option>
                                    <option value="BEST SELLER">BEST SELLER</option>
                                    <option value="SALE">SALE</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
                      <button
                        type="button"
                        onClick={() => setProductModalOpen(false)}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold uppercase tracking-wider text-[11px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg font-bold uppercase tracking-wider text-[11px] shadow-sm"
                      >
                        Save Product
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 7. INVENTORY SECTION: SEPARATE FULL PAGE STRICTLY FOR STOCK ADJUSTMENTS    */}
        {/* ========================================================================= */}
        {view === "inventory" && (
          <motion.div
            key="view-inventory"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-50"
          >
            {/* Sticky non-scrolling search & header */}
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setView("dashboard")}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
                    </button>
                    <span className="text-slate-300">/</span>
                    <h2 className="text-base sm:text-lg font-heading font-black tracking-wide uppercase text-slate-900">
                      Inventory & Stock Control
                    </h2>
                  </div>

                  <button
                    onClick={fetchAllData}
                    disabled={refreshing}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      placeholder="Search inventory items by product name or category..."
                      className="w-full pl-9 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto">
                    {(["all", "low", "out"] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setInventoryFilter(filter)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                          inventoryFilter === filter
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {filter === "all" ? "All Items" : filter === "low" ? "Low Stock (≤10)" : "Out of Stock"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Compact Stock Adjustment Rows with Variant-Level Management */}
            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-4">
              {filteredInventory.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
                  <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="font-heading font-black text-slate-800 uppercase tracking-wide text-sm mb-1">
                    No matching inventory items
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Try changing your search term or inventory filter above.
                  </p>
                </div>
              ) : (
                filteredInventory.map((item) => {
                  const hasVariants = Array.isArray(item.variants) && item.variants.length > 0;
                  const threshold = Number(item.lowStockThreshold) || 10;
                  const totalStock = hasVariants
                    ? item.variants.reduce((sum: number, v: any) => sum + (Number(v.stock) || 0), 0)
                    : (Number(item.stock) || 0);

                  if (hasVariants) {
                    return (
                      <div
                        key={item.id}
                        className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5 hover:border-slate-300 transition-colors"
                      >
                        {/* Parent Product Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                          <div className="flex items-center gap-3">
                            <img
                              src={item.imageUrl || "https://picsum.photos/seed/prime/100"}
                              alt={item.name}
                              className="w-11 h-11 rounded-xl object-cover bg-slate-100 border border-slate-200 shrink-0"
                            />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-heading font-black text-sm sm:text-base text-slate-900">
                                  {item.name}
                                </h4>
                                <span className="text-[10px] font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                                  {item.category || "General"}
                                </span>
                                <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-bold uppercase">
                                  {item.variants.length} Variants
                                </span>
                              </div>
                              <p className="text-xs font-mono text-slate-500 mt-0.5">
                                Base Price: {formatPHP(item.price)} &bull; Low Threshold: ≤{threshold} units
                              </p>
                            </div>
                          </div>

                          {/* Total Stock Summary Badge */}
                          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                            <span className="text-[11px] font-mono uppercase text-slate-500 font-bold">Total Stock:</span>
                            <span className={`text-xs font-mono font-black px-2.5 py-1 rounded-lg ${
                              totalStock === 0
                                ? "bg-red-100 text-red-700 border border-red-200"
                                : totalStock <= threshold
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            }`}>
                              {totalStock} units
                            </span>
                          </div>
                        </div>

                        {/* Variants List for Granular Stock Management */}
                        <div className="space-y-2 pt-1">
                          <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold px-2">
                            <span className="col-span-5">Variant Description</span>
                            <span className="col-span-2 text-right">Price</span>
                            <span className="col-span-2 text-center">Status</span>
                            <span className="col-span-3 text-right">Stock Controls</span>
                          </div>

                          {item.variants.map((v: any, vIdx: number) => {
                            const vStock = Number(v.stock) || 0;
                            const variantKey = v.id || `var-${vIdx}`;

                            return (
                              <div
                                key={variantKey}
                                className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex flex-col sm:grid sm:grid-cols-12 gap-3 items-start sm:items-center hover:bg-slate-100/70 transition-colors"
                              >
                                {/* Variant Info */}
                                <div className="sm:col-span-5 flex items-center gap-2.5 w-full">
                                  <img
                                    src={v.imageUrl || item.imageUrl || "https://picsum.photos/seed/prime/100"}
                                    alt={v.name || `Variant ${vIdx + 1}`}
                                    className="w-8 h-8 rounded-lg object-cover bg-white border border-slate-200 shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-heading font-black text-xs text-slate-900 truncate">
                                        {v.name || `Variant #${vIdx + 1}`}
                                      </span>
                                      {v.tag && v.tag !== "NONE" && (
                                        <span className="text-[9px] font-mono bg-slate-900 text-white px-1.5 py-0.2 rounded font-bold uppercase">
                                          {v.tag}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Price */}
                                <div className="sm:col-span-2 font-mono text-xs font-bold text-slate-800 sm:text-right">
                                  {formatPHP(v.price ?? item.price)}
                                </div>

                                {/* Status Badge */}
                                <div className="sm:col-span-2 sm:text-center">
                                  <span className={`text-[11px] font-mono font-black px-2 py-0.5 rounded-md inline-block ${
                                    vStock === 0
                                      ? "bg-red-100 text-red-700"
                                      : vStock <= threshold
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-emerald-100 text-emerald-800"
                                  }`}>
                                    {vStock === 0 ? "Out of Stock" : vStock <= threshold ? `${vStock} (Low)` : `${vStock} in stock`}
                                  </span>
                                </div>

                                {/* Controls */}
                                <div className="sm:col-span-3 flex items-center justify-between sm:justify-end gap-1.5 w-full font-mono text-xs">
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustVariantStock(item.id, v.id, vStock, -10)}
                                    disabled={vStock < 10}
                                    className="px-2 py-1 bg-white hover:bg-slate-200 disabled:opacity-30 border border-slate-200 rounded-lg text-slate-700 font-bold transition-colors cursor-pointer"
                                    title="Decrease variant stock by 10"
                                  >
                                    -10
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustVariantStock(item.id, v.id, vStock, -1)}
                                    disabled={vStock <= 0}
                                    className="px-2 py-1 bg-white hover:bg-slate-200 disabled:opacity-30 border border-slate-200 rounded-lg text-slate-700 font-bold transition-colors cursor-pointer"
                                    title="Decrease variant stock by 1"
                                  >
                                    -1
                                  </button>
                                  
                                  <input
                                    type="number"
                                    min="0"
                                    key={`input-${item.id}-${variantKey}-${vStock}`}
                                    defaultValue={vStock}
                                    onBlur={(e) => {
                                      const n = parseInt(e.target.value);
                                      if (!isNaN(n) && n !== vStock) {
                                        handleSetVariantStockDirect(item.id, v.id, n);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                    title="Direct stock input (Press Enter or blur to save)"
                                    className="w-12 text-center font-mono font-black text-xs bg-white border border-slate-300 rounded-lg py-1 text-slate-900 focus:outline-none focus:border-slate-900"
                                  />

                                  <button
                                    type="button"
                                    onClick={() => handleAdjustVariantStock(item.id, v.id, vStock, +1)}
                                    className="px-2 py-1 bg-slate-900 hover:bg-black text-white rounded-lg font-bold transition-colors cursor-pointer"
                                    title="Increase variant stock by 1"
                                  >
                                    +1
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustVariantStock(item.id, v.id, vStock, +10)}
                                    className="px-2 py-1 bg-slate-900 hover:bg-black text-white rounded-lg font-bold transition-colors cursor-pointer"
                                    title="Increase variant stock by 10"
                                  >
                                    +10
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  // Single-Variant Product Row
                  const stock = item.stock ?? 0;
                  return (
                    <div
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={item.imageUrl || "https://picsum.photos/seed/prime/100"}
                          alt={item.name}
                          className="w-11 h-11 rounded-xl object-cover bg-slate-100 border border-slate-200 shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-heading font-black text-sm sm:text-base text-slate-900">
                              {item.name}
                            </h4>
                            <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                              {item.category || "General"}
                            </span>
                            <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                              Single Variant
                            </span>
                          </div>
                          <p className="text-xs font-mono text-slate-500 mt-0.5">
                            Unit Price: {formatPHP(item.price)} &bull; Threshold: ≤{threshold}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        {/* Stock Badge */}
                        <div className="text-right font-mono pr-1">
                          <span className={`text-xs font-mono font-black px-2.5 py-1 rounded-lg ${
                            stock === 0
                              ? "bg-red-100 text-red-700"
                              : stock <= threshold
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}>
                            {stock === 0 ? "Out of Stock" : `${stock} in stock`}
                          </span>
                        </div>

                        {/* Stock Adjustment Controls */}
                        <div className="flex items-center gap-1.5 font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => handleAdjustStock(item.id, stock, -10)}
                            disabled={stock < 10}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg text-slate-700 font-bold transition-colors cursor-pointer"
                            title="Decrease stock by 10"
                          >
                            -10
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdjustStock(item.id, stock, -1)}
                            disabled={stock <= 0}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg text-slate-700 font-bold transition-colors cursor-pointer"
                            title="Decrease stock by 1"
                          >
                            -1
                          </button>

                          <input
                            type="number"
                            min="0"
                            key={`input-single-${item.id}-${stock}`}
                            defaultValue={stock}
                            onBlur={(e) => {
                              const n = parseInt(e.target.value);
                              if (!isNaN(n) && n !== stock) {
                                handleSetProductStockDirect(item.id, n);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            title="Direct stock input (Press Enter or blur to save)"
                            className="w-12 text-center font-mono font-black text-xs bg-slate-50 border border-slate-200 rounded-lg py-1 text-slate-900 focus:outline-none focus:border-slate-900 focus:bg-white"
                          />

                          <button
                            type="button"
                            onClick={() => handleAdjustStock(item.id, stock, +1)}
                            className="px-2 py-1 bg-slate-900 hover:bg-black text-white rounded-lg font-bold transition-colors cursor-pointer"
                            title="Increase stock by 1"
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdjustStock(item.id, stock, +10)}
                            className="px-2 py-1 bg-slate-900 hover:bg-black text-white rounded-lg font-bold transition-colors cursor-pointer"
                            title="Increase stock by 10"
                          >
                            +10
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 8. SETTINGS SECTION: SEPARATE FULL PAGE                                    */}
        {/* ========================================================================= */}
        {view === "settings" && (
          <motion.div
            key="view-settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-50"
          >
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                <button
                  onClick={() => setView("dashboard")}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
                </button>
                <h2 className="text-base font-heading font-black tracking-wide uppercase text-slate-900">
                  Admin System Settings
                </h2>
              </div>
            </div>

            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="font-heading font-black uppercase text-base text-slate-900 tracking-wide">
                  Telegram Authentication Gateway
                </h3>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-mono space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Authorized Master Telegram ID:</span>
                    <span className="font-black text-slate-900 bg-white px-2 py-1 rounded border border-slate-200">1085949511</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Auto-Bypass Status:</span>
                    <span className="text-emerald-700 font-bold">Enabled & Active</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Device Fingerprinting:</span>
                    <span className="text-emerald-700 font-bold">Enforced on all sessions</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="font-heading font-black uppercase text-base text-slate-900 tracking-wide">
                  Security & Telemetry Engine
                </h3>
                <p className="text-xs text-slate-600 font-mono leading-relaxed">
                  Every user accessing the storefront or admin panel has their WebGL GPU, Canvas 2D Hash, Screen Display metrics, IP, ISP, and Geolocation fingerprinted and stored in Firestore for auditing.
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span className="text-xs font-mono font-bold text-slate-900">Hardware Telemetry Online</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 9. ANALYTICS SECTION: SEPARATE FULL PAGE                                   */}
        {/* ========================================================================= */}
        {view === "analytics" && (
          <motion.div
            key="view-analytics"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-50"
          >
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                <button
                  onClick={() => setView("dashboard")}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
                </button>
                <h2 className="text-base font-heading font-black tracking-wide uppercase text-slate-900">
                  Telemetry Analytics
                </h2>
              </div>
            </div>

            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Total Users</p>
                  <p className="text-2xl font-heading font-black text-slate-900 mt-1">{customers.length}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Total Orders</p>
                  <p className="text-2xl font-heading font-black text-slate-900 mt-1">{orders.length}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Gross Volume</p>
                  <p className="text-2xl font-heading font-normal text-emerald-600 mt-1">
                    {formatPHP(orders.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0))}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Active Products</p>
                  <p className="text-2xl font-heading font-black text-slate-900 mt-1">
                    {products.filter(p => p.active !== false).length}
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="font-heading font-black uppercase text-sm text-slate-900 tracking-wide mb-4">
                  Device Hardware Distribution
                </h3>
                <div className="space-y-3 font-mono text-xs">
                  {customers.map((c) => (
                    <div key={c.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div>
                        <span className="font-bold text-slate-900">{c.tgName}</span>
                        <span className="text-slate-400 text-[11px] ml-2">({c.primeMemberId})</span>
                      </div>
                      <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded text-[10px] font-bold">
                        {c.latestFingerprint?.platform || "Linux / ChromeOS"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 9. DIAGNOSTICS SECTION: SYSTEM HEALTH & INTEGRATION API STATUS             */}
        {/* ========================================================================= */}
        {view === "diagnostics" && (
          <motion.div
            key="diagnostics"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-50"
          >
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                <button
                  onClick={() => setView("dashboard")}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
                </button>
                <h2 className="text-base font-heading font-normal tracking-wide uppercase text-slate-900">
                  System Diagnostics & Health
                </h2>
              </div>
            </div>

            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
              <DiagnosticsModule />
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 10. LOGISTICS SECTION: WAREHOUSES & COURIERS                               */}
        {/* ========================================================================= */}
        {view === "logistics" && (
          <motion.div
            key="logistics"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-50"
          >
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                <button
                  onClick={() => setView("dashboard")}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
                </button>
                <h2 className="text-base font-heading font-black tracking-wide uppercase text-slate-900">
                  Logistics & Operations
                </h2>
              </div>
            </div>

            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
              <LogisticsModule />
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 11. CHARGES SECTION: GLOBAL ADDITIONAL FEES                                */}
        {/* ========================================================================= */}
        {view === "charges" && (
          <motion.div
            key="charges"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-50"
          >
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                <button
                  onClick={() => setView("dashboard")}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
                </button>
                <h2 className="text-base font-heading font-black tracking-wide uppercase text-slate-900">
                  Global Additional Charges
                </h2>
              </div>
            </div>

            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
              <ChargesModule />
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 12. PAYMENTS SECTION: PAYMENT SYSTEMS CONFIGURATOR                         */}
        {/* ========================================================================= */}
        {view === "payments" && (
          <motion.div
            key="payments"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-50"
          >
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                <button
                  onClick={() => setView("dashboard")}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
                </button>
                <h2 className="text-base font-heading font-black tracking-wide uppercase text-slate-900">
                  Payment Configuration
                </h2>
              </div>
            </div>

            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
              <PaymentsModule />
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 13. PROMOS SECTION: PROMOTIONAL DISCOUNTS & ANTI-FRAUD                    */}
        {/* ========================================================================= */}
        {view === "promos" && (
          <motion.div
            key="promos"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-50"
          >
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                <button
                  onClick={() => setView("dashboard")}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
                </button>
                <h2 className="text-base font-heading font-black tracking-wide uppercase text-slate-900">
                  Promotions & Vouchers
                </h2>
              </div>
            </div>

            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
              <PromosModule />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* High-Resolution Zoom Lightbox for Payment Receipts */}
      {zoomedProofImage && (
        <div 
          onClick={() => setZoomedProofImage(null)}
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 cursor-zoom-out backdrop-blur-xs"
        >
          <div className="relative max-w-2xl w-full max-h-[85vh] flex flex-col items-center gap-4 bg-transparent">
            <button 
              onClick={() => setZoomedProofImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 font-bold uppercase text-xs tracking-widest font-mono flex items-center gap-1 cursor-pointer"
            >
              Close ✕
            </button>
            <img 
              src={zoomedProofImage} 
              alt="High-Res Zoomed Receipt Proof" 
              className="max-w-full max-h-[75vh] object-contain rounded-2xl border border-white/10 shadow-2xl bg-white"
              onClick={(e) => e.stopPropagation()} 
            />
            <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
              <a 
                href={zoomedProofImage}
                download="payment-proof-highres.png"
                className="px-6 py-2.5 bg-white text-black font-heading font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-colors shadow-lg"
              >
                Download Receipt
              </a>
              <button 
                onClick={() => setZoomedProofImage(null)}
                className="px-6 py-2.5 bg-white/10 border border-white/20 text-white font-heading font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-white/20 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Installation Guide */}
      {showIOSGuide && (
        <div 
          onClick={() => setShowIOSGuide(false)}
          className="absolute inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-xs cursor-pointer animate-in fade-in"
        >
          <div 
            className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-6 shadow-2xl max-w-xs w-full cursor-default text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center mx-auto mb-4 text-white shadow-lg">
              <ExternalLink className="w-6 h-6" />
            </div>
            <h3 className="text-xs font-heading font-black uppercase tracking-widest text-white mb-2">Install on iOS Device</h3>
            <p className="text-[10px] text-slate-300 leading-relaxed mb-5 font-mono">
              To install this PWA on your iPhone or iPad, tap the <span className="font-semibold text-indigo-400">Share</span> button in Safari and select <span className="font-semibold text-indigo-400">&ldquo;Add to Home Screen&rdquo;</span>.
            </p>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 bg-white hover:bg-gray-100 text-slate-950 rounded-xl text-[10px] font-heading font-black uppercase tracking-widest cursor-pointer transition-colors shadow-md"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {customConfirm.open && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="font-heading font-normal text-base text-slate-900 uppercase tracking-wide mb-2">
              {customConfirm.title}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed font-sans mb-6">
              {customConfirm.message}
            </p>
            <div className="flex justify-end gap-2 text-xs font-mono">
              <button
                onClick={() => setCustomConfirm(prev => ({ ...prev, open: false }))}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setCustomConfirm(prev => ({ ...prev, open: false }));
                  customConfirm.onConfirm();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer font-bold"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert Modal */}
      {customAlert.open && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <h3 className={`font-heading font-normal text-base uppercase tracking-wide mb-2 ${
              customAlert.type === "error" ? "text-red-600" : customAlert.type === "success" ? "text-emerald-600" : "text-slate-900"
            }`}>
              {customAlert.title}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed font-sans mb-6">
              {customAlert.message}
            </p>
            <div className="flex justify-end text-xs font-mono">
              <button
                onClick={() => setCustomAlert(prev => ({ ...prev, open: false }))}
                className={`px-5 py-2 text-white rounded-lg transition-colors cursor-pointer font-bold ${
                  customAlert.type === "error" ? "bg-red-600 hover:bg-red-700" : customAlert.type === "success" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-900 hover:bg-black"
                }`}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Preview & Configuration Modal */}
      {isPrintModalOpen && selectedOrder && (() => {
        const modalDeliveryAddressText = [
          selectedOrder.deliveryAddress?.street,
          selectedOrder.deliveryAddress?.barangay,
          selectedOrder.deliveryAddress?.city,
          selectedOrder.deliveryAddress?.province,
          selectedOrder.deliveryAddress?.zipCode
        ].filter(Boolean).join(", ") || (typeof selectedOrder.deliveryAddress === "string" ? selectedOrder.deliveryAddress : "") || selectedOrder.address || "";

        const modalGpsStreetAddressText = gpsStreetAddressText;

        return (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs screen-only">
            <div className="bg-slate-50 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Printer className="w-5 h-5 text-slate-800" />
                  <h3 className="font-heading font-normal text-base text-slate-900 uppercase tracking-wide">
                    Print Order Document
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-200 p-0.5 rounded-lg text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setPrintPaperFormat("standard")}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-bold ${
                        printPaperFormat === "standard"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Standard A4
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintPaperFormat("thermal")}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-bold ${
                        printPaperFormat === "thermal"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      80mm Thermal
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPrintModalOpen(false)}
                    className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Live Preview Area */}
              <div className="flex-1 overflow-y-auto py-4 px-2 my-2 bg-slate-200/50 rounded-xl border border-slate-200 flex justify-center">
                <OrderPrintView
                  order={selectedOrder}
                  deliveryAddressText={modalDeliveryAddressText}
                  gpsStreetAddressText={modalGpsStreetAddressText}
                  format={printPaperFormat}
                  isModalPreview={true}
                />
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs font-mono">
                <p className="text-[11px] text-slate-500 hidden sm:block">
                  Formatted for {printPaperFormat === "thermal" ? "80mm POS thermal roll" : "standard A4 / Letter paper"}
                </p>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setIsPrintModalOpen(false)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors cursor-pointer font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPrintModalOpen(false);
                      handleTriggerPrint();
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg transition-colors cursor-pointer font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Document</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modify Order Modal */}
      {isModifyModalOpen && modifyingOrder && (
        <ModifyOrderModal
          order={modifyingOrder}
          catalogProducts={products}
          isOpen={isModifyModalOpen}
          onClose={() => {
            setIsModifyModalOpen(false);
            setModifyingOrder(null);
          }}
          onOrderUpdated={handleOrderModified}
        />
      )}

      {/* Enlarged QR Code Scanner Terminal Modal */}
      {isQrModalOpen && qrZoomedOrder && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-left">
                <QrCode className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-heading font-black text-sm uppercase tracking-wider text-slate-900">Order Barcode QR</h3>
                  <p className="text-[10px] font-mono text-slate-500">Fast Scan Terminal Identifier</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsQrModalOpen(false);
                  setQrZoomedOrder(null);
                }}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-mono font-bold cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col items-center justify-center space-y-3">
              <div className="p-3 bg-white rounded-xl shadow-xs border border-slate-200">
                <QRCodeSVG
                  value={qrZoomedOrder.orderNumber || "ORDER-000"}
                  size={200}
                  level="H"
                  marginSize={1}
                  fgColor="#090d16"
                />
              </div>

              <div>
                <span className="font-heading font-black text-lg text-slate-900 tracking-tight block">
                  {qrZoomedOrder.orderNumber}
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  Status: <strong className="uppercase text-slate-800">{qrZoomedOrder.status || "Pending"}</strong>
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-indigo-50/80 border border-indigo-100 rounded-xl text-left flex items-start gap-2 text-[11px] font-mono text-indigo-900">
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>Scan with handheld laser readers or mobile camera scanner to quickly locate and verify parcel dispatch.</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => copyToClipboard(qrZoomedOrder.orderNumber, "orderNumber")}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider font-mono transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedKey === "orderNumber" ? "Copied!" : "Copy Number"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsQrModalOpen(false);
                  setQrZoomedOrder(null);
                }}
                className="flex-1 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold uppercase tracking-wider font-mono transition-colors cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Sound Settings Modal */}
      {isSoundSettingsModalOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-black text-sm uppercase tracking-wider text-slate-900">
                    Audio Sound Settings
                  </h3>
                  <p className="text-[10px] font-mono text-slate-500">
                    Configure sound alerts for specific event types
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSoundSettingsModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-mono font-bold cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Settings Toggles List */}
            <div className="space-y-4 font-mono text-xs">
              {/* MASTER AUDIO TOGGLE */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 text-xs block uppercase">
                    Master Sound Alerts
                  </span>
                  <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                    Enable or disable all notification chimes globally across the admin dashboard.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSoundSettings(prev => ({ ...prev, master: !prev.master }))}
                  className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center cursor-pointer ${
                    soundSettings.master ? "bg-emerald-600 justify-end" : "bg-slate-300 justify-start"
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-md block" />
                </button>
              </div>

              {/* EVENT SPECIFIC TOGGLES */}
              <div className="space-y-3 pt-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                  Event-Specific Audio Chimes
                </span>

                {/* 1. NEW ORDER PLACED */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="font-bold text-slate-900 text-xs block">
                          New Order Placed
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          Warm chime when a new customer order arrives
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!soundSettings.master}
                      onClick={() => setSoundSettings(prev => ({ ...prev, newOrder: !prev.newOrder }))}
                      className={`w-10 h-5.5 rounded-full transition-colors p-0.5 flex items-center cursor-pointer ${
                        !soundSettings.master ? "opacity-50 cursor-not-allowed bg-slate-200 justify-start" :
                        soundSettings.newOrder ? "bg-emerald-600 justify-end" : "bg-slate-300 justify-start"
                      }`}
                    >
                      <span className="w-4.5 h-4.5 rounded-full bg-white shadow-md block" />
                    </button>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => playChime("order", true)}
                      className="text-[10px] font-mono font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Volume2 className="w-3 h-3 text-indigo-600" />
                      <span>Test Chime</span>
                    </button>
                  </div>
                </div>

                {/* 2. PAYMENT PROOF UPLOADED */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Receipt className="w-4 h-4 text-purple-600 shrink-0" />
                      <div>
                        <span className="font-bold text-slate-900 text-xs block">
                          Payment Proof Uploaded
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          High-pitched chime when GCash / Bank proof is uploaded
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!soundSettings.master}
                      onClick={() => setSoundSettings(prev => ({ ...prev, paymentProof: !prev.paymentProof }))}
                      className={`w-10 h-5.5 rounded-full transition-colors p-0.5 flex items-center cursor-pointer ${
                        !soundSettings.master ? "opacity-50 cursor-not-allowed bg-slate-200 justify-start" :
                        soundSettings.paymentProof ? "bg-purple-600 justify-end" : "bg-slate-300 justify-start"
                      }`}
                    >
                      <span className="w-4.5 h-4.5 rounded-full bg-white shadow-md block" />
                    </button>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => playChime("proof", true)}
                      className="text-[10px] font-mono font-bold text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded border border-purple-200 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Volume2 className="w-3 h-3 text-purple-600" />
                      <span>Test Chime</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10.5px] font-mono text-slate-600 flex items-start gap-2">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                All audio preferences are saved automatically to your browser's <strong>localStorage</strong> and will persist across future staff admin sessions.
              </span>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsSoundSettingsModalOpen(false)}
                className="w-full py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold uppercase tracking-wider font-mono transition-colors cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-Time Silent Sync Live Toast Notification */}
      <AnimatePresence>
        {liveToast && (
          <motion.div 
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[200] max-w-sm w-[calc(100%-2rem)] bg-slate-950 text-white p-4 rounded-2xl shadow-2xl border border-slate-800 backdrop-blur-md"
          >
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-inner ${
                liveToast.type === "proof" 
                  ? "bg-purple-950/80 text-purple-400 border border-purple-500/30" 
                  : "bg-emerald-950/80 text-emerald-400 border border-emerald-500/30"
              }`}>
                {liveToast.type === "proof" ? <Receipt className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-heading font-normal uppercase tracking-widest text-slate-400">
                    {liveToast.type === "proof" ? "Payment Detected" : "Order Activity"}
                  </span>
                  <button 
                    onClick={() => setLiveToast(null)}
                    className="text-slate-500 hover:text-white text-xs p-0.5 rounded cursor-pointer transition-colors"
                  >
                    ✕
                  </button>
                </div>
                <h4 className="font-heading font-black text-sm text-white tracking-wide uppercase mt-0.5">
                  {liveToast.title}
                </h4>
                <p className="text-xs font-mono text-slate-300 mt-1 leading-snug">
                  {liveToast.message}
                </p>

                {liveToast.orderId && (
                  <button
                    onClick={() => {
                      setSelectedOrderId(liveToast.orderId!);
                      setView("order-detail");
                      setLiveToast(null);
                    }}
                    className="mt-3 px-3 py-1.5 bg-white text-black hover:bg-slate-200 text-xs font-heading font-normal uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Open Order #{liveToast.orderNumber || ""}</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
