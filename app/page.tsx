"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getClientFingerprint } from "./components/fingerprint-collector";
import ProductModal from "./components/product-modal";
import CartDrawer from "./components/cart-drawer";
import OrderHistoryModal from "./components/order-history-modal";
import AccountModal from "./components/account-modal";
import VideoGalleryModal from "./components/video-gallery-modal";
import { useCart } from "./components/cart-context";
import LiveHeaderClock from "./components/live-header-clock";
import SplashScreen from "./components/splash-screen";
import { ShoppingBag, Search, Filter, AlertCircle, Loader2, ShoppingCart, Plus, Minus, Receipt, Home, User, Store, Bell, Film, Headphones, Info } from "lucide-react";
import { formatPHP } from "@/lib/currency";
import { authenticatedFetch } from "./components/telegram-auth-client";
import { getSupabaseClient } from "@/lib/supabase";

export default function Shopfront() {


  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [routingToAdmin, setRoutingToAdmin] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isVideoGalleryOpen, setIsVideoGalleryOpen] = useState(false);
  const [initialOrderIdFromLink, setInitialOrderIdFromLink] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("shop");

  const { cart, cartCount, addToCart, updateQuantity } = useCart();

  const normalizeProductRow = (row: any) => {
    const bundleConfig = row?.bundle_config && typeof row.bundle_config === "object" ? row.bundle_config : {};
    return {
      id: row.id,
      name: row.name,
      price: Number(row.price) || 0,
      stock: Number(row.stock) || 0,
      category: row.category,
      imageUrl: row.image_url || "",
      description: row.description || "",
      isActive: row.is_active !== false,
      active: row.is_active !== false,
      isFeatured: Boolean(row.is_featured),
      sortOrder: Number(row.sort_order) || 0,
      bundleConfig,
      variants: Array.isArray(bundleConfig.variants) ? bundleConfig.variants : [],
      lowStockThreshold: Number(bundleConfig.lowStockThreshold ?? 10),
      tags: row.tags || [],
      gallery: row.gallery || [],
      updatedAt: row.updated_at,
    };
  };

  // Stream product configuration and stock changes directly from Postgres.
  // The REST route is still the canonical snapshot; Realtime keeps the UI current.
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel("prime-products-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = String((payload.old as any)?.id || "");
            if (!deletedId) return;
            setProducts(prev => prev.filter(p => String(p.id) !== deletedId));
            setSelectedProduct((prev: any) => String(prev?.id || "") === deletedId ? null : prev);
            return;
          }

          const incoming = normalizeProductRow(payload.new);
          if (!incoming.id) return;

          setProducts(prev => {
            const found = prev.some(p => String(p.id) === String(incoming.id));
            const next = found
              ? prev.map(p => String(p.id) === String(incoming.id) ? { ...p, ...incoming } : p)
              : [...prev, incoming];
            return next.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
          });

          setSelectedProduct((prev: any) => {
            if (String(prev?.id || "") !== String(incoming.id)) return prev;
            return { ...prev, ...incoming };
          });
        }
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") console.warn("Product realtime status:", status);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    async function checkAuth() {
      const startTime = Date.now();
      const ensure10Sec = async () => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 10000 - elapsed);
        if (remaining > 0) {
          await new Promise(r => setTimeout(r, remaining));
        }
      };

      try {
        let initDataRaw = "";
        
        // Wait for the next tick to ensure Telegram has injected the data
        await new Promise(resolve => setTimeout(resolve, 100));

        // PRIME Shopfront is Telegram-only. Do not accept copied/pasted initData
        // from URL hashes or query strings: a native browser must not authenticate
        // as a shop session. The Telegram WebApp object is the required entry point.
        if (typeof window === 'undefined') {
          throw new Error("Telegram WebApp is required. Open PRIME from Telegram.");
        }

        const telegramWebApp = (window as any).Telegram?.WebApp;
        if (!telegramWebApp) {
          throw new Error("Telegram WebApp is required. Open PRIME from Telegram.");
        }

        try {
          telegramWebApp.ready?.();
          telegramWebApp.expand?.();
        } catch {}

        // Wait briefly for Telegram's WebApp bridge to populate initData.
        for (let attempt = 0; attempt < 20 && !telegramWebApp.initData; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        initDataRaw = typeof telegramWebApp.initData === "string"
          ? telegramWebApp.initData.trim()
          : "";

        if (!initDataRaw) {
          throw new Error("Valid Telegram WebApp session is required. Open PRIME from Telegram.");
        }

        // Media routing may use Telegram start_param, but referral codes are never
        // written into customer referral state automatically.
        if (telegramWebApp.initDataUnsafe?.start_param === "media") {
          setIsVideoGalleryOpen(true);
          setActiveTab("media");
        }

        const fingerprintData = await getClientFingerprint();
        
        const response = await fetch("/api/auth/telegram/validate", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initData: initDataRaw,
            fingerprint: fingerprintData
          }),
        });

        if (response.ok) {
          const authData = await response.json();

          // Protected storefront APIs send live Telegram initData directly; the HttpOnly cookie is only a fallback.

          // If connection is from authorized Telegram Admin
          if (authData.isAdmin) {
            const shopMode = typeof window !== "undefined"
              && new URLSearchParams(window.location.search).get("mode") === "shop";

            if (shopMode) {
              setAuthorized(true);
              setIsAdmin(true);
              const productsRes = await authenticatedFetch(`/api/products?_t=${Date.now()}`, { cache: "no-store" });
              const pData = await productsRes.json();
              setProducts(Array.isArray(pData) ? pData : []);
              await ensure10Sec();
              return;
            }

            setRoutingToAdmin(true);
            if (typeof window !== 'undefined') {
              const hash = window.location.hash;
              await ensure10Sec();
              router.replace(`/admin${hash ? hash : ''}`);
            }
            return;
          }

          if (typeof window !== 'undefined') {
            const customerId = authData.tgUserId || authData.user?.id || "";
            const customerName = authData.tgName || authData.user?.name || "";
            const customerUsername = authData.tgUsername || authData.user?.username || "";
            const memberId = authData.primeMemberId || authData.user?.primeMemberId || "";

            const params = new URLSearchParams(window.location.search);
            const queryOrderId = params.get("openOrder");
            const telegramStartParam =
              telegramWebApp?.initDataUnsafe?.start_param ||
              params.get("tgWebAppStartParam") ||
              "";

            const rawOrderLink = queryOrderId || telegramStartParam;
            const openOrderId = String(rawOrderLink || "").replace(/^order[_:-]?/i, "").trim();

            if (openOrderId) {
              setInitialOrderIdFromLink(openOrderId);
              setActiveTab("orders");
            }

            sessionStorage.setItem("prime_customer_id", customerId);
            sessionStorage.setItem("prime_customer_name", customerName);
            sessionStorage.setItem("prime_customer_username", customerUsername);
            sessionStorage.setItem("prime_member_id", memberId);

            localStorage.setItem("prime_customer_id", customerId);
            localStorage.setItem("prime_customer_name", customerName);
            localStorage.setItem("prime_customer_username", customerUsername);
            localStorage.setItem("prime_member_id", memberId);
          }

          setAuthorized(true);
          const productsRes = await authenticatedFetch(`/api/products?_t=${Date.now()}`, { cache: "no-store" });
          const pData = await productsRes.json();
          setProducts(Array.isArray(pData) ? pData : []);
        } else {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server responded with ${response.status}`);
        }
      } catch (e: any) {
        console.error("Auth check failed", e);
        setErrorMsg(e.message || String(e));
      } finally {
        await ensure10Sec();
        setChecking(false);
      }
    }

    checkAuth();
  }, [router]);

  // Keep the customer's active Telegram session fresh in Supabase.
  // Heartbeats only touch the current fingerprint session; they do not trigger external geolocation lookups.
  useEffect(() => {
    if (!authorized || isAdmin) return;
    let stopped = false;

    const sendHeartbeat = async () => {
      if (stopped || typeof window === "undefined") return;
      try {
        const webApp = (window as any).Telegram?.WebApp;
        const initData = typeof webApp?.initData === "string" ? webApp.initData.trim() : "";
        if (!initData) return;

        const fingerprint = await getClientFingerprint();
        if (stopped) return;

        const response = await fetch("/api/auth/telegram/validate", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData, fingerprint, heartbeat: true }),
        });

        if (!response.ok && response.status !== 401) {
          console.warn("Telegram session heartbeat returned", response.status);
        }
      } catch (err) {
        console.warn("Telegram session heartbeat skipped:", err);
      }
    };

    void sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 60000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [authorized, isAdmin]);

  const safeProducts = Array.isArray(products) ? products : [];
  const categories = ["All", ...Array.from(new Set(safeProducts.map(p => p?.category || "General")))];

  const filteredProducts = safeProducts.filter(p => 
    p && (selectedCategory === "All" || (p?.category || "General") === selectedCategory) &&
    ((p?.name || "").toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (routingToAdmin) {
    return <SplashScreen title="ADMIN CREDENTIALS VERIFIED" subtitle="ROUTING TO SECURE ADMIN CONSOLE..." />;
  }

  if (checking) return <SplashScreen title="VERIFYING SECURE SESSION" subtitle="ESTABLISHING ENCRYPTED TELEGRAM LINK..." />;

  if (!authorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-6" />
        <h1 className="text-2xl font-heading font-bold text-gray-900 mb-2 uppercase tracking-wide">Access Denied</h1>
        <p className="text-gray-600 mb-6 max-w-sm">This shopfront is exclusively secured for use within the Telegram environment.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative pb-20">
      {isAdmin && (
        <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between text-[11px] font-mono shrink-0">
          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Admin mode active
          </span>
          <button
            onClick={() => {
              router.push("/admin");
            }}
            className="bg-white hover:bg-slate-100 text-black px-2 py-1 rounded font-bold uppercase text-[9px] tracking-wider transition-all cursor-pointer font-sans"
          >
            Back to Admin Panel
          </button>
        </div>
      )}
      
      {/* Sticky Header */}
      <header className="sticky top-0 z-45 bg-white border-b border-gray-100 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center">
            <img 
              src="/primefinal.png" 
              alt="PRIME" 
              className="h-7 sm:h-[28px] w-auto object-contain shrink-0 drop-shadow-xs" 
            />
          </div>
          <div className="flex items-center gap-3">
            <LiveHeaderClock />
            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    router.push("/admin");
                  }}
                  className="bg-slate-900 hover:bg-black text-white px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  Admin Panel
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Search & Filter Controls (Below Header, matching the thin footer style/height) */}
      <div className={`${activeTab !== "shop" ? "hidden" : ""} px-4 py-1.5 bg-gray-50 border-b border-gray-200/80 flex flex-row gap-2 max-w-[430px] mx-auto w-full items-center select-none z-30 sticky top-[53px]`}>
        <div className="relative flex-[5] flex items-center">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input 
            type="text" 
            placeholder="SEARCH PRODUCTS..." 
            className="w-full h-[26px] pl-8 pr-2 py-0 bg-white border border-gray-200 rounded shadow-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition-all font-heading font-normal uppercase text-[10px]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
          />
        </div>
        <div className="relative flex-[3] flex items-center">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <select 
            className="w-full h-[26px] pl-8 pr-2 py-0 bg-white border border-gray-200 rounded shadow-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black appearance-none cursor-pointer font-heading font-normal uppercase text-[10px]" 
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Main Content */}
      <main className={`${activeTab !== "shop" ? "hidden" : ""} flex-1 p-3 sm:p-3.5 w-full`}>
        
        {/* Product Grid */}
        {products.length === 0 ? (
          <div className="py-20 text-center">
            <ShoppingBag className="w-16 h-16 mx-auto text-gray-200 mb-4" />
            <h2 className="text-xl font-heading font-bold text-gray-900 mb-2">No Products Available</h2>
            <p className="text-gray-500">Check back later for exclusive drops.</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-20 text-center">
            <Search className="w-16 h-16 mx-auto text-gray-200 mb-4" />
            <h2 className="text-xl font-heading font-bold text-gray-900 mb-2">No matches found</h2>
            <p className="text-gray-500">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filteredProducts.map(p => {
              const variants = p.variants && p.variants.length > 0 ? p.variants : [];
              const isOutOfStock = variants.length > 0 
                ? variants.every((v: any) => (v.stock ?? 0) <= 0)
                : (p.stock ?? 0) <= 0;

              // Lowest price logic
              let lowestPrice = Number(p.price) || 0;
              if (variants.length > 0) {
                const prices = variants.map((v: any) => Number(v.price) || 0).filter((pr: number) => pr > 0);
                if (prices.length > 0) {
                  lowestPrice = Math.min(...prices);
                }
              }

              return (
                <div 
                  key={p.id} 
                  className="bg-white border border-gray-200/60 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all group flex flex-col cursor-pointer active:scale-[0.98]"
                  onClick={() => setSelectedProduct(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedProduct(p);
                    }
                  }}
                >
                  <div className="relative aspect-[8/7] overflow-hidden bg-gray-50 border-b border-gray-100">
                    <img 
                      src={p.imageUrl || "https://picsum.photos/seed/prime/400"} 
                      alt={p.name} 
                      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${isOutOfStock ? 'opacity-50 grayscale' : ''}`}
                    />
                    {isOutOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                        <span className="bg-black/80 backdrop-blur-sm text-white px-2 py-1 font-bold uppercase tracking-widest text-[9px] sm:text-xs rounded-lg">
                          Sold Out
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-2 sm:p-2.5 flex flex-col flex-1 justify-between gap-0.5 sm:gap-1">
                    {/* Category */}
                    {p.category && (
                      <p className="text-[8px] sm:text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400 truncate leading-none mb-0.5">
                        {p.category}
                      </p>
                    )}

                    {/* Product Name */}
                    <h3 className="font-heading font-bold text-gray-900 line-clamp-2 leading-[1.05] text-[11px] sm:text-[12.5px] tracking-tight">
                      {p.name}
                    </h3>

                    {/* Horizontally Aligned Lowest Price (Left) & Cart Icon (Right) */}
                    <div className="flex items-center justify-between pt-1 sm:pt-1.5 border-t border-gray-100 mt-auto gap-1">
                      <div className="text-left font-mono font-bold text-xs sm:text-base text-gray-950 truncate">
                        {formatPHP(lowestPrice)}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProduct(p);
                        }}
                        disabled={isOutOfStock}
                        className="p-1 sm:p-1.5 bg-slate-900 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-md transition-all cursor-pointer shadow-2xs flex items-center justify-center shrink-0"
                        title={isOutOfStock ? "Sold Out" : "Select Options / Add to Cart"}
                        aria-label="Select Options"
                      >
                        <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {activeTab === "notifications" && (
        <section className="w-full max-w-[760px] mx-auto bg-white border-x border-slate-200 min-h-[calc(100vh-120px)] p-4 sm:p-6">
          <div className="border-b border-gray-100 pb-4 mb-5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Customer Center</p>
            <h1 className="mt-1 text-xl font-heading font-black uppercase tracking-tight text-slate-900">Notifications</h1>
            <p className="mt-1 text-xs text-slate-500">Order updates are delivered directly through your Telegram chat.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-800">Telegram order notifications are enabled.</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">You will receive updates when an order is received, its status changes, payment information is updated, or tracking information is added.</p>
          </div>
        </section>
      )}
      {activeTab === "support" && (
        <section className="w-full max-w-[760px] mx-auto bg-white border-x border-slate-200 min-h-[calc(100vh-120px)] p-4 sm:p-6">
          <div className="border-b border-gray-100 pb-4 mb-5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Customer Center</p>
            <h1 className="mt-1 text-xl font-heading font-black uppercase tracking-tight text-slate-900">Support</h1>
            <p className="mt-1 text-xs text-slate-500">Customer assistance and order support.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-800">Need help with an order?</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Open MY ORDERS to review your purchase details and current order status. Telegram notifications will keep you informed as your order progresses.</p>
          </div>
        </section>
      )}

      {activeTab === "cart" && (
        <CartDrawer isOpen={true} onClose={() => { setIsCartOpen(false); setActiveTab("shop"); }} />
      )}
      {activeTab === "shop" && selectedProduct && <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />}
      {activeTab === "orders" && (
        <OrderHistoryModal
          isOpen={true}
          initialSelectedOrderId={initialOrderIdFromLink}
          onClose={() => {
            setInitialOrderIdFromLink(null);
            setActiveTab("shop");
          }}
        />
      )}

      {/* Customer Account & Points Modal */}
      {activeTab === "account" && <AccountModal
        isOpen={true}
        onClose={() => setActiveTab("shop")}
        onSelectOrder={(ord) => {
          setIsAccountOpen(false);
          setIsOrderHistoryOpen(true);
        }}
      />}

      {/* Free Video Gallery Modal (Telegram Cloud) */}
      {activeTab === "media" && <VideoGalleryModal
        isOpen={true}
        onClose={() => {
          setIsVideoGalleryOpen(false);
          setActiveTab("shop");
        }}
      />}

      {/* Fixed Non-Scrolling Bottom Navigation Bar (sitting right above system footer) */}
      <nav className="fixed bottom-[20px] left-0 right-0 max-w-[430px] mx-auto z-40 bg-white/95 backdrop-blur-md border-t border-gray-200/90 shadow-lg px-0.5 py-1.5 flex items-center justify-between font-['Roboto_Condensed'] select-none">
        {/* 1. SHOP */}
        <button
          type="button"
          onClick={() => {
            setActiveTab("shop");
            setSearchTerm("");
            setSelectedCategory("All");
            if (typeof window !== "undefined") {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
          className={`flex-1 flex flex-col items-center justify-center py-0.5 px-0.5 text-center transition-colors cursor-pointer ${
            activeTab === "shop" ? "text-slate-950 font-normal" : "text-gray-500 hover:text-gray-900 font-light"
          }`}
        >
          <Store className="w-4 h-4 mb-0.5 shrink-0" />
          <span className="text-[9px] uppercase tracking-tighter leading-none font-['Roboto_Condensed'] font-light">SHOP</span>
        </button>

        {/* 2. CART */}
        <button
          type="button"
          onClick={() => {
            setActiveTab("cart");
            setIsCartOpen(true);
          }}
          className="flex-1 flex flex-col items-center justify-center py-0.5 px-0.5 text-center transition-colors text-gray-500 hover:text-gray-900 cursor-pointer relative"
        >
          <div className="relative">
            <ShoppingCart className="w-4 h-4 mb-0.5 shrink-0" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[8px] font-bold px-1 rounded-full font-mono shadow-2xs">
                {cartCount}
              </span>
            )}
          </div>
          <span className="text-[9px] uppercase tracking-tighter leading-none font-['Roboto_Condensed'] font-light">CART</span>
        </button>

        {/* 3. ORDERS */}
        <button
          type="button"
          onClick={() => {
            setInitialOrderIdFromLink(null);
            setActiveTab("orders");
            setIsOrderHistoryOpen(true);
          }}
          className="flex-1 flex flex-col items-center justify-center py-0.5 px-0.5 text-center transition-colors text-gray-500 hover:text-gray-900 cursor-pointer"
        >
          <Receipt className="w-4 h-4 mb-0.5 shrink-0" />
          <span className="text-[9px] uppercase tracking-tighter leading-none font-['Roboto_Condensed'] font-light">ORDERS</span>
        </button>

        {/* 4. NOTIFICATIONS */}
        <button
          type="button"
          onClick={() => {
            setActiveTab("notifications");
          }}
          className="flex-1 flex flex-col items-center justify-center py-0.5 px-0.5 text-center transition-colors text-gray-400 hover:text-gray-800 cursor-pointer"
        >
          <Bell className="w-4 h-4 mb-0.5 shrink-0" />
          <span className="text-[9px] uppercase tracking-tighter leading-none font-['Roboto_Condensed'] font-light">NOTIFICATIONS</span>
        </button>

        {/* 5. MEDIA */}
        <button
          type="button"
          onClick={() => {
            setActiveTab("media");
            setIsVideoGalleryOpen(true);
          }}
          className={`flex-1 flex flex-col items-center justify-center py-0.5 px-0.5 text-center transition-colors cursor-pointer ${
            activeTab === "media" || isVideoGalleryOpen
              ? "text-emerald-700 font-normal"
              : "text-gray-500 hover:text-gray-900 font-light"
          }`}
        >
          <Film className="w-4 h-4 mb-0.5 shrink-0" />
          <span className="text-[9px] uppercase tracking-tighter leading-none font-['Roboto_Condensed'] font-light">MEDIA</span>
        </button>

        {/* 6. ACCOUNT */}
        <button
          type="button"
          onClick={() => {
            setActiveTab("account");
            setIsAccountOpen(true);
          }}
          className="flex-1 flex flex-col items-center justify-center py-0.5 px-0.5 text-center transition-colors text-gray-500 hover:text-gray-900 cursor-pointer"
        >
          <User className="w-4 h-4 mb-0.5 shrink-0" />
          <span className="text-[9px] uppercase tracking-tighter leading-none font-['Roboto_Condensed'] font-light">ACCOUNT</span>
        </button>

        {/* 7. SUPPORT */}
        <button
          type="button"
          onClick={() => {
            setActiveTab("support");
          }}
          className="flex-1 flex flex-col items-center justify-center py-0.5 px-0.5 text-center transition-colors text-gray-400 hover:text-gray-800 cursor-pointer"
        >
          <Headphones className="w-4 h-4 mb-0.5 shrink-0" />
          <span className="text-[9px] uppercase tracking-tighter leading-none font-['Roboto_Condensed'] font-light">SUPPORT</span>
        </button>
      </nav>
    </div>
  );
}
