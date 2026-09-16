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
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { formatPHP } from "@/lib/currency";
import DiagnosticsModule from "@/app/components/admin/diagnostics-module";
import ModifyOrderModal from "@/app/components/admin/modify-order-modal";
import OrderPrintView from "@/app/components/admin/order-print-view";
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

type AdminView = 
  | "dashboard" 
  | "customers" 
  | "customer-detail" 
  | "orders" 
  | "order-detail" 
  | "products" 
  | "inventory" 
  | "settings" 
  | "analytics"
  | "diagnostics"
  | "logistics"
  | "charges"
  | "payments";

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
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          onChange(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
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
      <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-widest mb-1">
        {label}
      </label>
      
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
            onClick={() => onChange("")}
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
            dragActive
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
            className="w-6 h-6 text-slate-400"
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
            <p className="text-[9px] text-slate-400 mt-0.5">Drag & drop or click to browse</p>
          </div>
        </div>
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
  const [customerDetail, setCustomerDetail] = useState<{ customer: any; fingerprints: any[]; orders: any[] } | null>(null);
  const [loadingCustomerDetail, setLoadingCustomerDetail] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Data Collections
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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

  // Copied feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [zoomedProofImage, setZoomedProofImage] = useState<string | null>(null);

  // Modify Order state
  const [modifyingOrder, setModifyingOrder] = useState<any | null>(null);
  const [isModifyModalOpen, setIsModifyModalOpen] = useState<boolean>(false);

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
  const [soundEnabled, setSoundEnabled] = useState(true);
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

  // Pleasant Web Audio notification chime (no external audio assets required)
  const playChime = useCallback((type: "proof" | "order" = "proof") => {
    if (!soundEnabled) return;
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
        // Warm notification tone
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
  }, [soundEnabled]);

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

  const copyToClipboard = (text: string, key: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
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

  // Inventory Stock Adjustment
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

  // Order status update
  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    try {
      await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status })
      });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      if (selectedCustomerId) {
        fetchCustomerDetail(selectedCustomerId);
      }
    } catch (e) {
      console.error(e);
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
      "GPS Address / Delivery Address",
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
      const address = ord.gpsStreetAddress || ord.deviceSnapshot?.location?.address || "N/A";
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
        `"${String(address).replace(/"/g, '""')}"`,
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
      const matchSearch = 
        (o.orderNumber || "").toLowerCase().includes(orderSearch.toLowerCase()) ||
        (o.customerName || "").toLowerCase().includes(orderSearch.toLowerCase()) ||
        (o.primeMemberId || "").toLowerCase().includes(orderSearch.toLowerCase()) ||
        (o.status || "").toLowerCase().includes(orderSearch.toLowerCase());

      if (!matchSearch) return false;
      if (orderFilter !== "all") return o.status === orderFilter;
      return true;
    });
  }, [orders, orderSearch, orderFilter]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      (p.name || "").toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.category || "").toLowerCase().includes(productSearch.toLowerCase())
    );
  }, [products, productSearch]);

  const filteredInventory = useMemo(() => {
    return products.filter(p => {
      const matchSearch = 
        (p.name || "").toLowerCase().includes(inventorySearch.toLowerCase()) ||
        (p.category || "").toLowerCase().includes(inventorySearch.toLowerCase());
      if (!matchSearch) return false;
      if (inventoryFilter === "low") return (p.stock ?? 0) > 0 && (p.stock ?? 0) <= (p.lowStockThreshold ?? 10);
      if (inventoryFilter === "out") return (p.stock ?? 0) === 0;
      return true;
    });
  }, [products, inventorySearch, inventoryFilter]);

  // Products with stock <= their defined lowStockThreshold
  const lowStockProducts = useMemo(() => {
    return products.filter(p => {
      const threshold = p.lowStockThreshold !== undefined ? Number(p.lowStockThreshold) : 10;
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

  // Reverse geocoding for GPS street-level address in order details
  const [resolvedGpsAddresses, setResolvedGpsAddresses] = useState<Record<string, string>>({});
  const [loadingGpsOrderId, setLoadingGpsOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOrder) return;
    const orderId = selectedOrder.id;
    if (selectedOrder.gpsStreetAddress) {
      setResolvedGpsAddresses(prev => ({ ...prev, [orderId]: selectedOrder.gpsStreetAddress }));
      return;
    }
    const loc = selectedOrder.deviceSnapshot?.location;
    if (loc && loc.lat && loc.lon && !resolvedGpsAddresses[orderId]) {
      setLoadingGpsOrderId(orderId);
      fetch(`/api/geoapify/reverse?lat=${loc.lat}&lon=${loc.lon}`)
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
  }, [selectedOrder?.id, selectedOrder?.gpsStreetAddress, selectedOrder?.deviceSnapshot?.location?.lat, selectedOrder?.deviceSnapshot?.location?.lon, resolvedGpsAddresses]);

  const deliveryAddressText = useMemo(() => {
    if (!selectedOrder?.deliveryAddress) return "";
    const addr = selectedOrder.deliveryAddress;
    if (typeof addr === "string") return addr;
    const parts = [addr.formatted || addr.address || ""];
    if (addr.unitDetails) parts.push(`(${addr.unitDetails})`);
    return parts.filter(Boolean).join(" ").trim();
  }, [selectedOrder?.deliveryAddress]);

  const gpsStreetAddressText = useMemo(() => {
    if (!selectedOrder) return "Not captured";
    if (selectedOrder.gpsStreetAddress) return selectedOrder.gpsStreetAddress;
    if (selectedOrder.id && resolvedGpsAddresses[selectedOrder.id]) {
      return resolvedGpsAddresses[selectedOrder.id];
    }
    const loc = selectedOrder.deviceSnapshot?.location;
    if (loc && loc.lat && loc.lon) {
      if (loadingGpsOrderId === selectedOrder.id) return "Resolving GPS street address...";
      return `${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)}`;
    }
    if (selectedOrder.deliveryAddress?.formatted) {
      return selectedOrder.deliveryAddress.formatted;
    }
    return "Not captured";
  }, [selectedOrder, resolvedGpsAddresses, loadingGpsOrderId]);

  // Auth checking screen
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center sm:py-6 font-sans antialiased">
        <div className="w-full max-w-[430px] h-screen sm:h-[880px] sm:rounded-[40px] bg-gray-950 text-gray-100 flex flex-col items-center justify-center p-6 overflow-hidden relative shadow-2xl border-0 sm:border-[10px] border-slate-900">
          <div className="hidden sm:block absolute top-0 left-1/2 -translate-x-1/2 w-32 h-5 bg-slate-900 rounded-b-2xl z-50"></div>
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-2xl backdrop-blur-xl">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
          <h2 className="text-xl font-heading font-black tracking-widest uppercase mb-1">Authenticating</h2>
          <p className="font-mono text-xs text-gray-400">Verifying Telegram Security Credentials (ID: 1085949511)...</p>
        </div>
      </div>
    );
  }

  // Login Gate
  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center sm:py-6 font-sans antialiased">
        <div className="w-full max-w-[430px] h-screen sm:h-[880px] sm:rounded-[40px] bg-gray-950 text-gray-100 flex flex-col items-center justify-center p-6 overflow-hidden relative shadow-2xl border-0 sm:border-[10px] border-slate-900">
          <div className="hidden sm:block absolute top-0 left-1/2 -translate-x-1/2 w-32 h-5 bg-slate-900 rounded-b-2xl z-50"></div>
          <div className="w-full max-w-sm bg-gray-900/80 border border-gray-800 p-8 rounded-2xl shadow-2xl backdrop-blur-xl">
            <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-heading font-black text-center mb-1 tracking-widest uppercase text-white">Prime Admin</h1>
            <p className="text-[11px] text-gray-400 text-center mb-6 font-mono">
              Authorized Account: ID 1085949511
            </p>
            <form onSubmit={handleManualLogin} className="space-y-4">
              <input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ENTER ADMIN ACCESS CODE"
                className="w-full p-4 bg-gray-950 border border-gray-800 rounded-xl text-center font-mono focus:border-white focus:outline-none transition-colors text-white text-sm"
              />
              {errorMsg && <p className="text-red-400 text-xs text-center font-mono">{errorMsg}</p>}
              <button 
                type="submit" 
                disabled={loading} 
                className="w-full p-4 bg-white text-black font-bold uppercase tracking-widest rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center text-xs cursor-pointer shadow-lg"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Access Dashboard"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center sm:py-6 font-sans antialiased">
      {/* Mobile Device Mockup Wrap */}
      <div className="w-full max-w-[430px] h-screen sm:h-[880px] sm:rounded-[40px] bg-slate-50 text-slate-900 flex flex-col overflow-hidden relative shadow-2xl border-0 sm:border-[10px] border-slate-900">
        
        {/* Device Notch */}
        <div className="hidden sm:block absolute top-0 left-1/2 -translate-x-1/2 w-32 h-5 bg-slate-900 rounded-b-2xl z-50"></div>
        
        {/* Scrollable Container Inside Phone Mockup */}
        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden pt-0 sm:pt-4">
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
            className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8"
          >
            {/* Header */}
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
              <div className="flex items-center gap-4">
                {adminUser?.photoUrl ? (
                  <img src={adminUser.photoUrl} alt="Admin" className="w-14 h-14 rounded-2xl object-cover shadow-sm border border-slate-200 shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-heading font-black text-xl uppercase shadow-sm shrink-0">
                    A
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-2xl sm:text-3xl font-heading font-black tracking-widest uppercase text-slate-900">
                      Prime Admin
                    </h1>
                    <span className="text-[10px] font-mono bg-black text-white px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
                      Telegram ID: {adminUser?.id || "1085949511"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Direct Access Active
                    </span>
                    <span className="text-slate-300">&bull;</span>
                    <button 
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          localStorage.setItem("skip_admin_redirect", "true");
                          sessionStorage.setItem("skip_admin_redirect", "true");
                          window.location.href = "/";
                        }
                      }}
                      className="text-slate-700 hover:text-black font-medium underline cursor-pointer bg-transparent border-none p-0 align-baseline font-mono text-xs"
                    >
                      Open Storefront
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded-lg text-xs font-mono">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isSilentSyncing ? "bg-emerald-500 opacity-75" : "bg-emerald-400 opacity-50"}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${isSilentSyncing ? "bg-emerald-600" : "bg-emerald-500"}`}></span>
                  </span>
                  <span className="text-slate-700 font-bold hidden sm:inline">
                    {isSilentSyncing ? "Syncing..." : "Live Sync"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    title={soundEnabled ? "Mute notification sounds" : "Enable notification sounds"}
                    className="ml-1 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-600" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                </div>

                <button
                  onClick={fetchAllData}
                  disabled={refreshing}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium hover:bg-slate-100 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-slate-900" : "text-slate-500"}`} />
                  Refresh
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
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium text-red-600 hover:bg-red-50 transition-colors shadow-sm cursor-pointer"
                >
                  Lock
                </button>
              </div>
            </header>

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

            {/* Low-Stock Notification Banner */}
            {lowStockProducts.length > 0 && (
              <div className="mb-6 bg-amber-50 border border-amber-200/90 rounded-2xl p-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200/60">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5 text-amber-700" />
                    </div>
                    <div>
                      <h4 className="font-heading font-black text-xs sm:text-sm uppercase tracking-wider text-amber-950 flex items-center gap-2">
                        <span>Low Stock Notification</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 text-[10px] font-mono font-bold">
                          {lowStockProducts.length} {lowStockProducts.length === 1 ? "Product" : "Products"} Affected
                        </span>
                      </h4>
                      <p className="text-[11px] text-amber-800 font-sans mt-0.5">
                        The items below have fallen below their defined low stock threshold. Replenish inventory to prevent sales interruption.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setInventoryFilter("low");
                      setView("inventory");
                    }}
                    className="px-3.5 py-1.5 bg-amber-900 hover:bg-amber-950 text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 self-start sm:self-center shrink-0 cursor-pointer shadow-xs"
                  >
                    <Boxes className="w-3.5 h-3.5" />
                    <span>Manage Inventory &rarr;</span>
                  </button>
                </div>

                {/* Horizontal scrollable pills of affected products */}
                <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 text-xs font-mono">
                  {lowStockProducts.map((p: any) => {
                    const threshold = p.lowStockThreshold !== undefined ? Number(p.lowStockThreshold) : 10;
                    const stock = Number(p.stock) || 0;
                    const isOut = stock === 0;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          setInventorySearch(p.name || "");
                          setView("inventory");
                        }}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 shadow-2xs ${
                          isOut
                            ? "bg-red-50 border-red-200 hover:border-red-300 text-red-950"
                            : "bg-white border-amber-200 hover:border-amber-400 text-amber-950"
                        }`}
                        title={`Click to manage ${p.name}`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isOut ? "bg-red-600 animate-pulse" : "bg-amber-500"}`} />
                        <span className="font-bold truncate max-w-[140px] sm:max-w-[200px]">{p.name}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isOut ? "bg-red-200/80 text-red-900" : "bg-amber-100 text-amber-900"}`}>
                          {isOut ? "OUT OF STOCK" : `${stock} left (≤${threshold})`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Customers</p>
                <p className="text-2xl font-heading font-black text-slate-900">{customers.length}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-1">Registered accounts</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Orders</p>
                <p className="text-2xl font-heading font-normal text-slate-900">{orders.length}</p>
                <p className="text-[10px] text-emerald-600 font-mono mt-1">
                  {formatPHP(orders.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0))} volume
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Products</p>
                <p className="text-2xl font-heading font-black text-slate-900">{products.length}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-1">
                  {products.filter(p => (p.stock ?? 0) > 0).length} in stock
                </p>
              </div>
              <button 
                onClick={() => setView("diagnostics")}
                className="bg-white border border-slate-200 hover:border-emerald-500 rounded-xl p-4 shadow-sm text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Diagnostics & Health</p>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 transition-colors" />
                </div>
                <p className="text-2xl font-heading font-normal text-emerald-600 flex items-center gap-1.5">
                  <Activity className="w-5 h-5 text-emerald-600 animate-pulse" /> 9 Systems
                </p>
                <p className="text-[10px] text-slate-500 font-mono mt-1 group-hover:text-emerald-700">Check APIs & Infrastructure &rarr;</p>
              </button>
            </div>

            {/* Glossy Tiles (3 per row) */}
            <div className="mb-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 font-mono">
                Management Sections
              </h3>
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
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
                  { id: "payments", name: "Payments", icon: CreditCard, desc: "Config Payment Methods", count: "Active Methods" }
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
              <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
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
            <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-2.5">
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
              <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
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
              <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
                
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
              <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
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
            <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-2.5">
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
                            {formatPHP(ord.totalAmount)}
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
          const deliveryAddressText = [
            selectedOrder.deliveryAddress?.street,
            selectedOrder.deliveryAddress?.barangay,
            selectedOrder.deliveryAddress?.city,
            selectedOrder.deliveryAddress?.province,
            selectedOrder.deliveryAddress?.zipCode
          ].filter(Boolean).join(", ") || (typeof selectedOrder.deliveryAddress === "string" ? selectedOrder.deliveryAddress : "") || selectedOrder.address || "";

          const gpsStreetAddressText = selectedOrder.deviceSnapshot?.location?.streetAddress 
            || selectedOrder.deviceSnapshot?.location?.display_name 
            || (selectedOrder.deviceSnapshot?.location?.latitude ? `${selectedOrder.deviceSnapshot.location.latitude}, ${selectedOrder.deviceSnapshot.location.longitude}` : "") 
            || "Not captured";

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
              <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
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
            <div className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 screen-only">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">Order Identifier</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <h2 className="text-2xl font-heading font-normal text-slate-900 tracking-tight">{selectedOrder.orderNumber}</h2>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedOrder.orderNumber, "orderNumber")}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-colors border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                        title="Copy Order Number"
                      >
                        {copiedKey === "orderNumber" ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700 font-bold text-[9px]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-500" />
                            <span className="text-[9px]">Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs font-mono text-slate-500 mt-1">
                      Placed {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString() : "Recent"}
                    </p>
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
                    {(["Processing", "Completed", "Pending"] as const).map(st => (
                      <button
                        key={st}
                        onClick={() => handleUpdateOrderStatus(selectedOrder.id, st)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider font-mono transition-all cursor-pointer ${
                          selectedOrder.status === st
                            ? "bg-slate-900 text-white shadow-sm"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {st}
                      </button>
                    ))}
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
                <div className="py-5 space-y-6 border-b border-slate-200">
                  
                  {/* 1. CUSTOMER & ACCOUNT IDENTITY */}
                  <div className="space-y-3">
                    <h3 className="font-heading font-normal text-xs uppercase tracking-wider text-slate-900 pb-1.5 border-b border-slate-200">
                      CUSTOMER &amp; ACCOUNT IDENTITY
                    </h3>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-3.5">
                      {/* TELEGRAM NAME */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-500">
                            TELEGRAM NAME
                          </span>
                          {selectedOrder.customerName && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(selectedOrder.customerName, "customerName")}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                              title="Copy Telegram Name"
                            >
                              {copiedKey === "customerName" ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5 text-slate-400" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="font-ibm-condensed font-bold text-slate-950 text-sm tracking-normal">
                          {selectedOrder.customerName || "Customer"}
                        </div>
                      </div>

                      {/* TELEGRAM HANDLE */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-500">
                            TELEGRAM HANDLE
                          </span>
                          {selectedOrder.customerUsername && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(selectedOrder.customerUsername, "customerUsername")}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                              title="Copy Telegram Handle"
                            >
                              {copiedKey === "customerUsername" ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5 text-slate-400" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="font-ibm-condensed font-bold text-slate-950 text-sm tracking-normal">
                          {selectedOrder.customerUsername 
                            ? (selectedOrder.customerUsername.startsWith('@') ? selectedOrder.customerUsername : `@${selectedOrder.customerUsername}`) 
                            : "None"}
                        </div>
                      </div>

                      {/* TELEGRAM UID */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-500">
                            TELEGRAM UID
                          </span>
                          {(selectedOrder.customerId || selectedOrder.tgUserId) && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(String(selectedOrder.customerId || selectedOrder.tgUserId), "customerId")}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                              title="Copy Telegram UID"
                            >
                              {copiedKey === "customerId" ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5 text-slate-400" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="font-ibm-condensed font-bold text-slate-950 text-sm tracking-normal">
                          {selectedOrder.customerId || selectedOrder.tgUserId || "None"}
                        </div>
                      </div>

                      {/* PRIME MID */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-500">
                            PRIME MID
                          </span>
                          {selectedOrder.primeMemberId && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(selectedOrder.primeMemberId, "primeMemberId")}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                              title="Copy PRIME MID"
                            >
                              {copiedKey === "primeMemberId" ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5 text-slate-400" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="font-ibm-condensed font-bold text-slate-950 text-sm tracking-normal">
                          {selectedOrder.primeMemberId || "Unassigned"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. TRANSACTION & DEVICE FINGERPRINT */}
                  <div className="space-y-3">
                    <h3 className="font-heading font-normal text-xs uppercase tracking-wider text-slate-900 pb-1.5 border-b border-slate-200">
                      TRANSACTION &amp; DEVICE FINGERPRINT
                    </h3>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-3.5">
                      {/* IP ADDRESS */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-500">
                            IP ADDRESS
                          </span>
                          {(selectedOrder.ip || selectedOrder.deviceSnapshot?.ip) && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(selectedOrder.ip || selectedOrder.deviceSnapshot?.ip, "ipAddress")}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                              title="Copy IP Address"
                            >
                              {copiedKey === "ipAddress" ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5 text-slate-400" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="font-ibm-condensed font-bold text-slate-950 text-sm tracking-normal">
                          {selectedOrder.ip || selectedOrder.deviceSnapshot?.ip || "000.00.000.000"}
                        </div>
                      </div>

                      {/* COORDINATES */}
                      {(() => {
                        const coords = (selectedOrder.deviceSnapshot?.location?.latitude && selectedOrder.deviceSnapshot?.location?.longitude)
                          ? `${selectedOrder.deviceSnapshot.location.latitude}, ${selectedOrder.deviceSnapshot.location.longitude}`
                          : (selectedOrder.coordinates || selectedOrder.deviceSnapshot?.coordinates || "Not captured");

                        return (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-500">
                                COORDINATES
                              </span>
                              {coords !== "Not captured" && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(coords, "coordinates")}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                                  title="Copy Coordinates"
                                >
                                  {copiedKey === "coordinates" ? (
                                    <>
                                      <Check className="w-2.5 h-2.5 text-emerald-600" />
                                      <span className="text-emerald-700 font-bold">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-2.5 h-2.5 text-slate-400" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                            <div className="font-ibm-condensed font-bold text-slate-950 text-sm tracking-normal">
                              {coords}
                            </div>
                          </div>
                        );
                      })()}

                      {/* DEVICE IDENTIFIER */}
                      {(() => {
                        const devId = selectedOrder.deviceSnapshot?.deviceFingerprint 
                          || selectedOrder.deviceSnapshot?.device_id 
                          || selectedOrder.deviceFingerprint 
                          || selectedOrder.deviceId 
                          || selectedOrder.deviceSnapshot?.userAgentSummary 
                          || selectedOrder.deviceSnapshot?.platform 
                          || "Not captured";

                        return (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-500">
                                DEVICE IDENTIFIER
                              </span>
                              {devId !== "Not captured" && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(devId, "deviceIdentifier")}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                                  title="Copy Device Identifier"
                                >
                                  {copiedKey === "deviceIdentifier" ? (
                                    <>
                                      <Check className="w-2.5 h-2.5 text-emerald-600" />
                                      <span className="text-emerald-700 font-bold">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-2.5 h-2.5 text-slate-400" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                            <div className="font-ibm-condensed font-bold text-slate-950 text-sm tracking-normal break-all">
                              {devId}
                            </div>
                          </div>
                        );
                      })()}

                      {/* SESSION TOKEN */}
                      {(() => {
                        const sessToken = selectedOrder.sessionToken 
                          || selectedOrder.deviceSnapshot?.sessionId 
                          || selectedOrder.deviceSnapshot?.sessionToken 
                          || selectedOrder.sessionId 
                          || selectedOrder.cartToken 
                          || "Not captured";

                        return (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-500">
                                SESSION TOKEN
                              </span>
                              {sessToken !== "Not captured" && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(sessToken, "sessionToken")}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                                  title="Copy Session Token"
                                >
                                  {copiedKey === "sessionToken" ? (
                                    <>
                                      <Check className="w-2.5 h-2.5 text-emerald-600" />
                                      <span className="text-emerald-700 font-bold">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-2.5 h-2.5 text-slate-400" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                            <div className="font-ibm-condensed font-bold text-slate-950 text-sm tracking-normal break-all">
                              {sessToken}
                            </div>
                          </div>
                        );
                      })()}

                      {/* PRECISE GPS ADDRESS */}
                      <div className="col-span-2 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-500">
                            PRECISE GPS ADDRESS
                          </span>
                          {gpsStreetAddressText && gpsStreetAddressText !== "Not captured" && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(gpsStreetAddressText, "gpsAddress")}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                              title="Copy Precise GPS Address"
                            >
                              {copiedKey === "gpsAddress" ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5 text-slate-400" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="font-ibm-condensed font-bold text-slate-950 text-sm tracking-normal leading-relaxed break-words">
                          {gpsStreetAddressText}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. RECIPIENT & DELIVERY INFORMATION */}
                  <div className="space-y-3">
                    <h3 className="font-heading font-normal text-xs uppercase tracking-wider text-slate-900 pb-1.5 border-b border-slate-200">
                      RECIPIENT &amp; DELIVERY INFORMATION
                    </h3>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-3.5">
                      {/* RECEIVER'S NAME */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-500">
                            RECEIVER'S NAME
                          </span>
                          {selectedOrder.receiverName && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(selectedOrder.receiverName, "receiverName")}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                              title="Copy Receiver's Name"
                            >
                              {copiedKey === "receiverName" ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5 text-slate-400" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="font-ibm-condensed font-bold text-slate-950 text-sm tracking-normal">
                          {selectedOrder.receiverName || "None"}
                        </div>
                      </div>

                      {/* RECEIVER'S PHONE */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-500">
                            RECEIVER'S PHONE
                          </span>
                          {selectedOrder.receiverPhone && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(selectedOrder.receiverPhone, "receiverPhone")}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                              title="Copy Receiver's Phone"
                            >
                              {copiedKey === "receiverPhone" ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5 text-slate-400" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="font-ibm-condensed font-bold text-slate-950 text-sm tracking-normal">
                          {selectedOrder.receiverPhone || "None"}
                        </div>
                      </div>

                      {/* DELIVERY ADDRESS */}
                      <div className="col-span-2 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-500">
                            DELIVERY ADDRESS
                          </span>
                          {deliveryAddressText && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(deliveryAddressText, "deliveryAddress")}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                              title="Copy Delivery Address"
                            >
                              {copiedKey === "deliveryAddress" ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5 text-slate-400" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="font-ibm-condensed font-bold text-slate-950 text-sm tracking-normal leading-relaxed break-words">
                          {deliveryAddressText || "None"}
                        </div>
                      </div>

                      {/* DELIVERY NOTES */}
                      <div className="col-span-2 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-500">
                            DELIVERY NOTES
                          </span>
                          {selectedOrder.notes && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(selectedOrder.notes, "notes")}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                              title="Copy Delivery Notes"
                            >
                              {copiedKey === "notes" ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5 text-slate-400" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="font-ibm-condensed font-medium text-slate-800 text-sm tracking-normal leading-relaxed break-words">
                          {selectedOrder.notes || "None"}
                        </div>
                      </div>

                      {/* COURIER TRACKING URL */}
                      <div className="col-span-2 pt-3 border-t border-slate-100 space-y-2">
                        <div className="flex items-center justify-between gap-1">
                          <label htmlFor={`tracking-url-input-${selectedOrder.id}`} className="font-heading font-normal text-[11px] uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                            <Truck className="w-3.5 h-3.5 text-slate-500" />
                            <span>COURIER TRACKING URL</span>
                          </label>
                          {selectedOrder.trackingUrl && (
                            <a
                              href={selectedOrder.trackingUrl.startsWith('http') ? selectedOrder.trackingUrl : `https://${selectedOrder.trackingUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer"
                              title="Open tracking link in new tab"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span>Open URL</span>
                            </a>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            id={`tracking-url-input-${selectedOrder.id}`}
                            type="url"
                            value={trackingUrlInput}
                            onChange={(e) => setTrackingUrlInput(e.target.value)}
                            placeholder="e.g. https://www.lalamove.com/order/... or courier tracking link"
                            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveTrackingUrl(selectedOrder.id, trackingUrlInput)}
                            disabled={isSavingTrackingUrl}
                            className="px-4 py-2 bg-slate-900 hover:bg-black disabled:opacity-50 text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-xs"
                          >
                            {isSavingTrackingUrl ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Saving...</span>
                              </>
                            ) : trackingSavedSuccess ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Saved</span>
                              </>
                            ) : (
                              <>
                                <Link2 className="w-3.5 h-3.5" />
                                <span>Save Tracking</span>
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-[10px] font-mono text-slate-400">
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
                    <button
                      type="button"
                      onClick={() => {
                        setModifyingOrder(selectedOrder);
                        setIsModifyModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Sliders className="w-3.5 h-3.5 text-amber-400" />
                      <span>Modify Items & Pricing</span>
                    </button>
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
                              Qty {it.quantity} &bull; Unit {isFreeItem ? <span className="text-emerald-600 font-bold">FREE</span> : formatPHP(it.price)}
                              {it.originalPrice && it.originalPrice !== it.price && (
                                <span className="text-slate-400 line-through ml-1.5">
                                  {formatPHP(it.originalPrice)}
                                </span>
                              )}
                            </p>
                          </div>
                          <p className={`font-bold text-sm ${isFreeItem ? "text-emerald-600 font-black" : "text-slate-900"}`}>
                            {isFreeItem ? "FREE" : formatPHP(Number(it.price) * (Number(it.quantity) || 1))}
                          </p>
                        </div>
                      );
                    })}

                    {/* Order Financial Breakdown */}
                    <div className="p-3 bg-slate-50/70 border-t border-slate-100 space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between items-center text-slate-600">
                        <span>Items Subtotal</span>
                        <span className="font-bold text-slate-900">
                          {formatPHP(selectedOrder.subTotal || selectedOrder.items?.reduce((s: number, it: any) => s + (Number(it.price) * (Number(it.quantity) || 1)), 0) || 0)}
                        </span>
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
                            <span className={`font-semibold ${isChFree ? "text-emerald-600 font-bold" : "text-slate-800"}`}>
                              {isChFree ? "FREE" : formatPHP(ch.amount || 0)}
                            </span>
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
                          <span className={`font-semibold ${selectedOrder.isDeliveryFeeFree ? "text-emerald-600 font-bold" : "text-slate-800"}`}>
                            {selectedOrder.isDeliveryFeeFree ? "FREE" : formatPHP(selectedOrder.deliveryFee)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-3 bg-slate-100 flex items-center justify-between font-mono font-bold text-slate-900 border-t border-slate-200">
                      <span>Total Amount</span>
                      <span className="text-base">{formatPHP(selectedOrder.totalAmount)}</span>
                    </div>
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
                            className="flex-1 sm:flex-none px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold font-mono uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95"
                          >
                            <Eye className="w-3.5 h-3.5" />
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
              </div>
            </div>

            {/* Native Printable Document (Hidden on screen, actively rendered when window.print() triggers) */}
            <OrderPrintView
              order={selectedOrder}
              deliveryAddressText={deliveryAddressText}
              gpsStreetAddressText={gpsStreetAddressText}
              format={printPaperFormat}
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
              <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
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
            <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-2.5">
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
                filteredProducts.map((prod) => (
                  <div
                    key={prod.id}
                    className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-sm flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={prod.imageUrl || "https://picsum.photos/seed/prime/100"}
                        alt={prod.name}
                        className="w-12 h-12 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-heading font-black text-sm text-slate-900">
                            {prod.name}
                          </h4>
                          <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            {prod.category || "General"}
                          </span>
                          {prod.active === false && (
                            <span className="text-[9px] font-mono bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase">
                              Hidden
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-slate-500 mt-0.5">
                          Price: <span className="font-bold text-slate-900">{formatPHP(prod.price)}</span> &bull; Stock: {prod.stock ?? 0}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
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
                ))
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

                    <div className="grid grid-cols-2 gap-3">
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
                          Product Rating (1-5)
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
              <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
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

            {/* Compact Stock Adjustment Rows */}
            <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-2.5">
              {filteredInventory.map((item) => {
                const stock = item.stock ?? 0;
                return (
                  <div
                    key={item.id}
                    className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-heading font-black text-sm text-slate-900">
                          {item.name}
                        </h4>
                        <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {item.category || "General"}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">
                        Unit Price: {formatPHP(item.price)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      {/* Stock Badge */}
                      <div className="text-right font-mono pr-2">
                        <span className={`text-sm font-black px-2.5 py-1 rounded-lg ${
                          stock === 0
                            ? "bg-red-100 text-red-700"
                            : stock <= 10
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}>
                          {stock} in stock
                        </span>
                      </div>

                      {/* Stock Adjustment Controls */}
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <button
                          onClick={() => handleAdjustStock(item.id, stock, -10)}
                          disabled={stock < 10}
                          className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg text-slate-700 font-bold transition-colors cursor-pointer"
                        >
                          -10
                        </button>
                        <button
                          onClick={() => handleAdjustStock(item.id, stock, -1)}
                          disabled={stock <= 0}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg text-slate-700 font-bold transition-colors cursor-pointer"
                        >
                          -1
                        </button>
                        <button
                          onClick={() => handleAdjustStock(item.id, stock, +1)}
                          className="px-2.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg font-bold transition-colors cursor-pointer"
                        >
                          +1
                        </button>
                        <button
                          onClick={() => handleAdjustStock(item.id, stock, +10)}
                          className="px-2 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg font-bold transition-colors cursor-pointer"
                        >
                          +10
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
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
              <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
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

            <div className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
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
              <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
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

            <div className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
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
              <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
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

            <div className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8">
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
              <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
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

            <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8">
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
              <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
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

            <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8">
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
              <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
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

            <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8">
              <PaymentsModule />
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

        const modalGpsStreetAddressText = selectedOrder.deviceSnapshot?.location?.streetAddress 
          || selectedOrder.deviceSnapshot?.location?.display_name 
          || (selectedOrder.deviceSnapshot?.location?.latitude ? `${selectedOrder.deviceSnapshot.location.latitude}, ${selectedOrder.deviceSnapshot.location.longitude}` : "") 
          || "Not captured";

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
    </div>
  );
}
