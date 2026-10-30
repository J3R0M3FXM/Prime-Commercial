"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProductModal from "./components/product-modal";
import CartDrawer from "./components/cart-drawer";
import OrderHistoryModal from "./components/order-history-modal";
import AccountModal from "./components/account-modal";
import { useCart } from "./components/cart-context";
import PrimeIdentityHeader from "./components/prime-identity-header";
import SplashScreen from "./components/splash-screen";
import VideoGalleryModal from "./components/video-gallery-modal";
import { ShoppingBag, Search, Filter, AlertCircle, Loader2, ShoppingCart, Plus, Minus, Receipt, Home, User, Store, Bell, Film, Headphones, Info } from "lucide-react";
import { formatPHP } from "@/lib/currency";
import { authenticatedFetch } from "./components/telegram-auth-client";
import { callServerless, getServerlessCatalog, getTelegramServerlessSession } from "@/lib/telegram-serverless-client";

type PublicOrderQueue = {
  ordersInQueue: number;
  ordersInProcessing: number;
  averageReadyMinutes: number | null;
  trafficFlowStatus: string;
};

export default function Shopfront() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [routingToAdmin, setRoutingToAdmin] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutActive, setIsCheckoutActive] = useState(false);
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [initialOrderIdFromLink, setInitialOrderIdFromLink] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("shop");
  const [publicOrderQueue, setPublicOrderQueue] = useState<PublicOrderQueue | null>(null);
  const queueRequestInFlight = useRef(false);

  const { cart, cartCount, addToCart, updateQuantity } = useCart();

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const latest = await getServerlessCatalog();
      setProducts(latest);
      setCatalogError("");
      setSelectedProduct((selected: any) => selected
        ? latest.find(product => String(product.id) === String(selected.id)) || null
        : null);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Could not load the product catalog.");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadPublicOrderQueue = useCallback(async () => {
    if (queueRequestInFlight.current) return;
    queueRequestInFlight.current = true;
    try {
      const result = await callServerless<Partial<PublicOrderQueue>>("getPublicOrderQueue", {}, 10_000);
      setPublicOrderQueue({
        ordersInQueue: Math.max(0, Number(result?.ordersInQueue) || 0),
        ordersInProcessing: Math.max(0, Number(result?.ordersInProcessing) || 0),
        averageReadyMinutes: result?.averageReadyMinutes == null
          ? null
          : Math.max(0, Number(result.averageReadyMinutes) || 0),
        trafficFlowStatus: String(result?.trafficFlowStatus || "Updating").slice(0, 32),
      });
    } catch {
      setPublicOrderQueue(null);
    } finally {
      queueRequestInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    void loadPublicOrderQueue();
    const interval = window.setInterval(() => { void loadPublicOrderQueue(); }, 15_000);
    return () => window.clearInterval(interval);
  }, [authorized, loadPublicOrderQueue]);

  // Refresh the Serverless catalog periodically in place of the former Supabase Realtime subscription.
  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    const refreshCatalog = () => {
      if (!cancelled) void loadCatalog();
    };
    const interval = window.setInterval(refreshCatalog, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [authorized, loadCatalog]);

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

        // Media remains locked for content access, but the tab and deep-link open the
        // customer-facing availability announcement.
        if (telegramWebApp.initDataUnsafe?.start_param === "media") {
          setActiveTab("media");
        }

        const authData = await getTelegramServerlessSession();

        if (authData?.authenticated) {

          // If connection is from authorized Telegram Admin
          if (authData.isAdmin) {
            setRoutingToAdmin(true);
            if (typeof window !== 'undefined') {
              const hash = window.location.hash;
              const startParam = String(telegramWebApp?.initDataUnsafe?.start_param || '');
              const adminOrder = startParam.match(/^admin_order_(.+)$/i)?.[1] || '';
              await ensure10Sec();
              const adminTarget = adminOrder
                ? `/admin?view=order-detail&order=${encodeURIComponent(adminOrder)}`
                : '/admin';
              router.replace(`${adminTarget}${hash ? hash : ''}`);
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
          await loadCatalog();
        } else {
          throw new Error(authData?.error || 'Telegram session could not be verified.');
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
  }, [loadCatalog, router]);

  const safeProducts = Array.isArray(products) ? products : [];
  const categories = ["All", ...Array.from(new Set(safeProducts.map(p => p?.category || "General")))];

  const filteredProducts = safeProducts.filter(p =>
    p && (selectedCategory === "All" || (p?.category || "General") === selectedCategory) &&
    ((p?.name || "").toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const hasActiveOrders = Boolean(publicOrderQueue && (
    publicOrderQueue.ordersInQueue + publicOrderQueue.ordersInProcessing > 0
  ));
  const trafficFlowClass = !hasActiveOrders ? "text-slate-500"
    : publicOrderQueue?.trafficFlowStatus === "LIGHT" ? "text-emerald-700"
      : publicOrderQueue?.trafficFlowStatus === "MODERATE" ? "text-orange-600"
        : publicOrderQueue?.trafficFlowStatus === "HEAVY" ? "text-red-700" : "text-slate-500";

  if (routingToAdmin) {
    return <SplashScreen title="ADMIN CREDENTIALS VERIFIED" subtitle="ROUTING TO SECURE ADMIN CONSOLE..." />;
  }

  if (checking) return <SplashScreen title="CONNECTING TO PRIME PRIVATE SERVERS" subtitle="Please wait while we are initializing your secure session..." />;

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
      <header className="sticky top-0 z-45 bg-white border-b border-gray-100 shadow-[0_3px_5px_rgba(15,23,42,0.2)]">
        <PrimeIdentityHeader>
          {isAdmin && (
            <button
              onClick={() => router.push("/admin")}
              className="bg-slate-900 hover:bg-black text-white px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
            >Admin Panel</button>
          )}
        </PrimeIdentityHeader>
        <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
        <div aria-label="Live order status" className="grid h-[38.5px] grid-cols-4 border-t border-gray-100 bg-slate-50">
          <div className="flex min-w-0 flex-col items-center justify-center border-r border-gray-200 px-1">
            <span className="truncate text-[9.5px] font-bold uppercase leading-3 tracking-wide text-slate-500">On queue</span><strong className="mt-0.5 min-h-4 font-mono text-[13.5px] leading-4 text-slate-900">{publicOrderQueue?.ordersInQueue ?? "—"}</strong>
          </div>
          <div className="flex min-w-0 flex-col items-center justify-center border-r border-gray-200 px-1">
            <span className="truncate text-[9.5px] font-bold uppercase leading-3 tracking-wide text-slate-500">Processing</span><strong className="mt-0.5 min-h-4 font-mono text-[13.5px] leading-4 text-slate-900">{publicOrderQueue?.ordersInProcessing ?? "—"}</strong>
          </div>
          <div className="flex min-w-0 flex-col items-center justify-center border-r border-gray-200 px-1">
            <span className="truncate text-[9.5px] font-bold uppercase leading-3 tracking-wide text-slate-500">Est. wait (mins)</span><strong className="mt-0.5 min-h-4 font-mono text-[13.5px] leading-4 text-slate-900">{!publicOrderQueue ? "Updating" : !hasActiveOrders ? "--" : publicOrderQueue.averageReadyMinutes == null ? "--" : publicOrderQueue.averageReadyMinutes < 1 ? "<1" : publicOrderQueue.averageReadyMinutes}</strong>
          </div>
          <div className="flex min-w-0 flex-col items-center justify-center px-1">
            <span className="truncate text-[9.5px] font-bold uppercase leading-3 tracking-wide text-slate-500">ORDER FLOW</span><strong className={`mt-0.5 min-h-4 truncate font-mono text-[13.5px] font-bold leading-4 ${trafficFlowClass}`}>{!publicOrderQueue ? "Updating" : hasActiveOrders ? publicOrderQueue.trafficFlowStatus : "--"}</strong>
          </div>
        </div>
        <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </header>

      {/* Search & Filter Controls (Below Header, matching the thin footer style/height) */}
      <div className={`${activeTab !== "shop" ? "hidden" : ""} px-3 py-1.5 bg-gray-50 border-b border-gray-200/80 flex flex-row gap-2 max-w-[430px] mx-auto w-full items-center select-none z-30 sticky top-[83.5px]`}>
        <div className="relative flex-[5] flex items-center">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="SEARCH PRODUCTS..."
            className="w-full h-[32px] pl-8 pr-2 py-0 bg-white border border-gray-200 rounded shadow-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition-all font-heading font-normal uppercase text-[12px]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
          />
        </div>
        <div className="relative flex-[3] flex items-center">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <select
            className="w-full h-[32px] pl-8 pr-2 py-0 bg-white border border-gray-200 rounded shadow-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black appearance-none cursor-pointer font-heading font-normal uppercase text-[12px]"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Main Content */}
      <main className={`${activeTab !== "shop" ? "hidden" : ""} flex-1 px-3 sm:px-3.5 pt-[4.8px] pb-[4.8px] sm:pt-[5.6px] sm:pb-[5.6px] w-full`}>

        {/* Product Grid */}
        {catalogError && products.length === 0 ? (
          <div role="alert" className="py-16 px-4 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-amber-500 mb-4" />
            <h2 className="text-xl font-heading font-bold text-gray-900 mb-2">Could Not Load Products</h2>
            <p className="text-gray-600 mb-4">{catalogError}</p>
            <button type="button" onClick={() => void loadCatalog()} disabled={catalogLoading}
              className="px-4 py-2 border border-gray-300 rounded text-sm font-bold disabled:opacity-50">
              {catalogLoading ? "RETRYING…" : "RETRY"}
            </button>
          </div>
        ) : products.length === 0 ? (
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
                  <div className="relative aspect-square overflow-hidden bg-gray-50 border-b border-gray-100">
                    <img
                      src={p.imageUrl || "https://picsum.photos/seed/prime/600/600"}
                      alt={p.name}
                      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${isOutOfStock ? 'opacity-50 grayscale' : ''}`}
                    />
                    {p.tag && p.tag !== "NONE" && !isOutOfStock && <span className="absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] truncate border border-slate-500/40 bg-slate-900/85 px-2 py-1 text-[8px] font-mono font-bold uppercase tracking-wide text-white shadow-sm">{p.tag}</span>}
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
                      <p className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 truncate leading-none mb-0.5">
                        {p.category}
                      </p>
                    )}

                    {/* Product Name */}
                    <h3 className="font-roboto-condensed-semibold text-gray-900 line-clamp-2 leading-[1.05] text-[12px] sm:text-[13.5px] tracking-tight">
                      {p.name}
                    </h3>
                    <p className="font-mono text-[8px] sm:text-[9px] font-bold uppercase leading-none tracking-wide text-slate-500">
                      {variants.length} {variants.length === 1 ? "variant" : "variants"}
                    </p>

                    {/* Horizontally Aligned Lowest Price (Left) & Cart Icon (Right) */}
                    <div className="flex items-center justify-between pt-1 sm:pt-1.5 border-t border-gray-100 mt-auto gap-1">
                      <div className="prime-product-card__price text-left truncate text-xs sm:text-base text-gray-950">
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
        <div className="w-full bg-gray-50 flex justify-center py-[4.8px]">
          <section className="w-full max-w-[760px] mx-auto bg-white border-x border-slate-200 min-h-[calc(100vh-120px)] p-3 sm:p-3.5">
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
        </div>
      )}
      {activeTab === "support" && (
        <div className="w-full bg-gray-50 flex justify-center py-[4.8px]">
          <section className="w-full max-w-[760px] mx-auto bg-white border-x border-slate-200 min-h-[calc(100vh-120px)] p-3 sm:p-3.5">
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
        </div>
      )}

      {(activeTab === "cart" || isCheckoutActive) && (
        <CartDrawer
          isOpen={activeTab === "cart"}
          onClose={() => { setIsCheckoutActive(false); setIsCartOpen(false); setActiveTab("shop"); }}
          onCheckoutOpenChange={(open) => {
            setIsCheckoutActive(open);
            if (open) window.scrollTo({ top: 0, behavior: "auto" });
          }}
        />
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

      {activeTab === "media" && <VideoGalleryModal isOpen onClose={() => setActiveTab("shop")} />}

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
          <span className="text-[9px] uppercase tracking-tighter leading-none font-roboto-condensed-semibold">SHOP</span>
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
          <span className="text-[9px] uppercase tracking-tighter leading-none font-roboto-condensed-semibold">CART</span>
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
          <span className="text-[9px] uppercase tracking-tighter leading-none font-roboto-condensed-semibold">ORDERS</span>
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
          <span className="text-[9px] uppercase tracking-tighter leading-none font-roboto-condensed-semibold">NOTIFICATIONS</span>
        </button>

        {/* 5. MEDIA — CLICKABLE, CONTENT TEMPORARILY LOCKED */}
        <button
          type="button"
          onClick={() => {
            setActiveTab("media");
          }}
          title="Media availability announcement"
          className={`flex-1 flex flex-col items-center justify-center py-0.5 px-0.5 text-center transition-colors cursor-pointer ${
            activeTab === "media"
              ? "text-emerald-700 font-normal"
              : "text-gray-500 hover:text-gray-900 font-light"
          }`}
        >
          <Film className="w-4 h-4 mb-0.5 shrink-0" />
          <span className="text-[9px] uppercase tracking-tighter leading-none font-roboto-condensed-semibold">MEDIA</span>
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
          <span className="text-[9px] uppercase tracking-tighter leading-none font-roboto-condensed-semibold">ACCOUNT</span>
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
          <span className="text-[9px] uppercase tracking-tighter leading-none font-roboto-condensed-semibold">SUPPORT</span>
        </button>
      </nav>
    </div>
  );
}
