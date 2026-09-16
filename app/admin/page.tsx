"use client";
import React, { useEffect, useState, useMemo } from "react";
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
  CreditCard
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { formatPHP } from "@/lib/currency";
import DiagnosticsModule from "@/app/components/admin/diagnostics-module";
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

  const copyToClipboard = (text: string, key: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const fetchAllData = async () => {
    setRefreshing(true);
    try {
      const [custRes, prodRes, ordRes] = await Promise.all([
        fetch("/api/admin/customers"),
        fetch("/api/products"),
        fetch("/api/admin/orders")
      ]);
      if (custRes.ok) setCustomers(await custRes.json());
      if (prodRes.ok) setProducts(await prodRes.json());
      if (ordRes.ok) setOrders(await ordRes.json());
    } catch (e) {
      console.error("Failed to load admin data", e);
    } finally {
      setRefreshing(false);
    }
  };

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
      await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id, active: newActive })
      });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, active: newActive } : p));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      await fetch("/api/admin/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveProduct = async (productData: any) => {
    try {
      if (editingProduct?.id) {
        await fetch("/api/admin/products", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingProduct.id, ...productData })
        });
      } else {
        await fetch("/api/admin/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(productData)
        });
      }
      setProductModalOpen(false);
      setEditingProduct(null);
      fetchAllData();
    } catch (e) {
      console.error(e);
    }
  };

  // Inventory Stock Adjustment
  const handleAdjustStock = async (productId: string, currentStock: number, delta: number) => {
    const newStock = Math.max(0, currentStock + delta);
    try {
      await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId, stock: newStock })
      });
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, stock: newStock } : p));
    } catch (e) {
      console.error(e);
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
      if (inventoryFilter === "low") return (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 10;
      if (inventoryFilter === "out") return (p.stock ?? 0) === 0;
      return true;
    });
  }, [products, inventorySearch, inventoryFilter]);

  const selectedOrder = useMemo(() => {
    return orders.find(o => o.id === selectedOrderId);
  }, [orders, selectedOrderId]);

  // Auth checking screen
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-100 p-6 font-sans">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-2xl backdrop-blur-xl">
          <Loader2 className="w-8 h-8 animate-spin text-white" />
        </div>
        <h2 className="text-xl font-heading font-black tracking-widest uppercase mb-1">Authenticating</h2>
        <p className="font-mono text-xs text-gray-400">Verifying Telegram Security Credentials (ID: 1085949511)...</p>
      </div>
    );
  }

  // Login Gate
  if (!authorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-100 p-6 font-sans">
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
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col">
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
                            {(ord.items || []).map((item: any, i: number) => (
                              <div key={i} className="p-2.5 flex items-center justify-between">
                                <span className="font-medium text-slate-800">
                                  {item.quantity}x {item.name}
                                </span>
                                <span className="font-bold text-slate-900">
                                  {formatPHP(Number(item.price) * (Number(item.quantity) || 1))}
                                </span>
                              </div>
                            ))}
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
                filteredOrders.map((ord) => (
                  <div
                    key={ord.id}
                    onClick={() => {
                      setSelectedOrderId(ord.id);
                      setView("order-detail");
                    }}
                    className="group bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-900 rounded-xl p-3.5 sm:p-4 shadow-sm hover:shadow-md transition-all duration-150 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
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
                      </div>

                      <p className="text-xs text-slate-600 font-mono mt-1">
                        Customer: <span className="font-bold text-slate-900">{ord.customerName}</span> ({ord.primeMemberId || ord.customerId})
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      <div className="text-right font-mono">
                        <p className="text-sm font-black text-slate-900">
                          {formatPHP(ord.totalAmount)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {ord.items?.length || 1} line item(s)
                        </p>
                      </div>

                      <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 5. ORDER DETAIL PAGE: SEPARATE FULL VIEW                                  */}
        {/* ========================================================================= */}
        {view === "order-detail" && selectedOrder && (
          <motion.div
            key="view-order-detail"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col min-h-screen bg-slate-100"
          >
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
              <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                <button
                  onClick={() => {
                    setSelectedOrderId(null);
                    setView("orders");
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Orders
                </button>
                <span className="font-heading font-black text-slate-900 text-sm">
                  Order {selectedOrder.orderNumber}
                </span>
              </div>
            </div>

            <div className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">Order Identifier</span>
                    <h2 className="text-2xl font-heading font-black text-slate-900">{selectedOrder.orderNumber}</h2>
                    <p className="text-xs font-mono text-slate-500 mt-1">
                      Placed: {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString() : "Recent"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500">Status:</span>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-6 border-b border-slate-100 text-xs font-mono">
                  <div>
                    <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Customer</p>
                    <p className="text-slate-900 font-bold text-sm">{selectedOrder.customerName}</p>
                    <p className="text-slate-500">Prime ID: {selectedOrder.primeMemberId || "Unassigned"}</p>
                    <p className="text-slate-500">Telegram ID: {selectedOrder.customerId}</p>
                  </div>

                  <div>
                    <p className="text-slate-400 uppercase text-[10px] tracking-widest font-bold mb-1">Checkout Device Info</p>
                    {selectedOrder.deviceSnapshot ? (
                      <div className="text-slate-600">
                        <p>IP: {selectedOrder.deviceSnapshot.ip || "Captured"}</p>
                        <p>Browser: {selectedOrder.deviceSnapshot.browser || "Telegram Mini App"}</p>
                      </div>
                    ) : (
                      <p className="text-slate-400">Standard Web Mini App Checkout</p>
                    )}
                  </div>
                </div>

                {/* Line Items */}
                <div className="pt-6">
                  <h3 className="font-heading font-black text-sm uppercase text-slate-900 mb-3 tracking-wide">
                    Purchased Items
                  </h3>
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                    {(selectedOrder.items || []).map((it: any, i: number) => (
                      <div key={i} className="p-3 flex items-center justify-between text-xs font-mono">
                        <div>
                          <p className="font-bold text-slate-900">{it.name}</p>
                          <p className="text-slate-500">Qty: {it.quantity} &bull; Unit: {formatPHP(it.price)}</p>
                        </div>
                        <p className="font-bold text-slate-900 text-sm">
                          {formatPHP(Number(it.price) * (Number(it.quantity) || 1))}
                        </p>
                      </div>
                    ))}

                    {/* Order Financial Breakdown */}
                    <div className="p-3 bg-slate-50/70 border-t border-slate-100 space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between items-center text-slate-600">
                        <span className="uppercase">Items Subtotal:</span>
                        <span className="font-bold text-slate-900">
                          {formatPHP(selectedOrder.subTotal || selectedOrder.items?.reduce((s: number, it: any) => s + (Number(it.price) * (Number(it.quantity) || 1)), 0) || 0)}
                        </span>
                      </div>

                      {/* Applied Charges */}
                      {Array.isArray(selectedOrder.appliedCharges) && selectedOrder.appliedCharges.map((ch: any, ci: number) => (
                        <div key={ci} className="flex justify-between items-center text-slate-600">
                          <span className="uppercase flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            {ch.name || "Fee"}:
                          </span>
                          <span className="font-semibold text-slate-800">{formatPHP(ch.amount || 0)}</span>
                        </div>
                      ))}

                      {/* Delivery Fee */}
                      {Number(selectedOrder.deliveryFee) > 0 && (
                        <div className="flex justify-between items-center text-slate-600">
                          <span className="uppercase flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                            Delivery ({selectedOrder.courier?.name || "Courier"}):
                            <span className="text-[10px] text-slate-400">
                              ({selectedOrder.deliveryFeePaymentMethod === "upon_delivery" ? "Paid upon delivery" : "Paid at checkout"})
                            </span>
                          </span>
                          <span className="font-semibold text-slate-800">{formatPHP(selectedOrder.deliveryFee)}</span>
                        </div>
                      )}
                    </div>

                    <div className="p-3 bg-slate-100 flex items-center justify-between font-mono font-black text-slate-900 border-t border-slate-200">
                      <span>Total Amount</span>
                      <span className="text-base">{formatPHP(selectedOrder.totalAmount)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment Review Details */}
                <div className="pt-6 mt-6 border-t border-slate-100">
                  <h3 className="font-heading font-black text-sm uppercase text-slate-900 mb-3 tracking-wide flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-slate-600" />
                    <span>Transaction & Payment Verification</span>
                  </h3>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">Selected Gateway</p>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">
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

                    {/* Image proof and status management */}
                    {selectedOrder.paymentProofImage ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-200/60">
                        {/* Receipt Thumbnail */}
                        <div className="sm:col-span-1">
                          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold mb-1.5">Submitted Proof Receipt</p>
                          <div 
                            onClick={() => setZoomedProofImage(selectedOrder.paymentProofImage)}
                            className="relative group border border-slate-200 rounded-xl overflow-hidden aspect-[4/5] bg-white cursor-zoom-in transition-all hover:border-slate-400 shadow-sm shrink-0"
                          >
                            <img 
                              src={selectedOrder.paymentProofImage} 
                              alt="Payment Proof Receipt" 
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold uppercase gap-1">
                              <Eye className="w-3.5 h-3.5" /> Click to Zoom
                            </div>
                          </div>
                        </div>

                        {/* Verification & Action Pane */}
                        <div className="sm:col-span-2 flex flex-col justify-between space-y-3">
                          <div className="space-y-1.5 font-mono text-[11px] text-slate-600">
                            <p className="font-bold text-slate-900 uppercase">Verification Instructions</p>
                            <p className="leading-relaxed">
                              Inspect the customer's uploaded receipt. Verify the transaction amount matches the total order value of <span className="font-bold text-black">{formatPHP(selectedOrder.totalAmount)}</span>.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUpdateOrderPaymentStatus(selectedOrder.id, "Confirmed")}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                  selectedOrder.paymentStatus === "Confirmed"
                                    ? "bg-emerald-600 text-white shadow-sm cursor-default"
                                    : "bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200"
                                }`}
                              >
                                <Check className="w-4 h-4" /> Approve Payment
                              </button>
                              <button
                                onClick={() => handleUpdateOrderPaymentStatus(selectedOrder.id, "Declined")}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                  selectedOrder.paymentStatus === "Declined"
                                    ? "bg-red-600 text-white shadow-sm cursor-default"
                                    : "bg-white hover:bg-red-50 text-red-700 border border-red-200"
                                }`}
                              >
                                ✕ Reject Payment
                              </button>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUpdateOrderPaymentStatus(selectedOrder.id, "Pending Review")}
                                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer text-center"
                              >
                                Reset to Pending Review
                              </button>
                              <a 
                                href={selectedOrder.paymentProofImage}
                                download={`receipt-${selectedOrder.orderNumber}.png`}
                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all text-center flex items-center justify-center gap-1 shrink-0"
                              >
                                Download
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-white border border-slate-200 rounded-xl text-center text-xs font-mono text-slate-500">
                        No payment proof uploaded yet for this order.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

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
    </div>
  );
}
