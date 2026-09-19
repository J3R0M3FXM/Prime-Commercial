"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getClientFingerprint, getClientLocation } from "./components/fingerprint-collector";
import ProductModal from "./components/product-modal";
import CartDrawer from "./components/cart-drawer";
import OrderHistoryModal from "./components/order-history-modal";
import AccountModal from "./components/account-modal";
import VideoGalleryModal from "./components/video-gallery-modal";
import { useCart } from "./components/cart-context";
import { ShoppingBag, Search, Filter, AlertCircle, Loader2, ShoppingCart, Plus, Minus, Receipt, Home, User, Store, Bell, Film, Headphones, Info } from "lucide-react";
import { formatPHP } from "@/lib/currency";

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
  const [isBackToShopfrontModalOpen, setIsBackToShopfrontModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("shop");
  const [noticeToast, setNoticeToast] = useState<string | null>(null);

  const showFeatureToast = (featureName: string) => {
    setNoticeToast(`${featureName} module is under development`);
    setTimeout(() => {
      setNoticeToast(null);
    }, 2800);
  };

  const { cart, cartCount, addToCart, updateQuantity } = useCart();

  useEffect(() => {
    async function checkAuth() {
      try {
        let initDataRaw = "";
        
        // Wait for the next tick to ensure Telegram has injected the data
        await new Promise(resolve => setTimeout(resolve, 100));

        // 1. Read directly from URL hash or query params
        if (typeof window !== 'undefined') {
          // Capture referral code if provided via link (?ref=..., ?referral=..., ?startapp=...)
          try {
            const searchParams = new URLSearchParams(window.location.search);
            const hashStr = window.location.hash.substring(1);
            const hashParams = new URLSearchParams(hashStr);
            const tgStartParam = (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param;
            const refCandidate = (
              searchParams.get('ref') ||
              searchParams.get('referral') ||
              searchParams.get('startapp') ||
              hashParams.get('tgWebAppStartParam') ||
              hashParams.get('startapp') ||
              tgStartParam ||
              ''
            ).trim().toUpperCase();
            if (refCandidate) {
              localStorage.setItem('prime_referred_by', refCandidate);
            }
            if (searchParams.get('tab') === 'media' || searchParams.get('media') === '1') {
              setIsVideoGalleryOpen(true);
              setActiveTab('media');
            }
          } catch (refErr) {
            console.warn('Could not parse referral param:', refErr);
          }

          if (window.location.hash) {
            const hashStr = window.location.hash.substring(1);
            const params = new URLSearchParams(hashStr);
            const tgData = params.get('tgWebAppData');
            
            if (tgData) {
              initDataRaw = tgData;
            } else if (hashStr.includes('user=') || hashStr.includes('hash=')) {
              initDataRaw = hashStr;
            }
          }

          if (!initDataRaw && window.location.search) {
            const searchParams = new URLSearchParams(window.location.search);
            const tgData = searchParams.get('tgWebAppData') || searchParams.get('initData');
            if (tgData) {
              initDataRaw = tgData;
            }
          }
        }
        
        // 2. Fallback to Telegram WebApp object
        if (!initDataRaw && typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initData) {
          initDataRaw = (window as any).Telegram.WebApp.initData;
        }

        if (!initDataRaw) {
          // Clear legacy dummy account if stored
          if (typeof window !== 'undefined') {
            if (sessionStorage.getItem("prime_customer_id") === "1085949511") {
              sessionStorage.removeItem("prime_customer_id");
              sessionStorage.removeItem("prime_customer_name");
              sessionStorage.removeItem("prime_customer_username");
              sessionStorage.removeItem("prime_member_id");
            }
            if (localStorage.getItem("prime_customer_id") === "1085949511") {
              localStorage.removeItem("prime_customer_id");
              localStorage.removeItem("prime_customer_name");
              localStorage.removeItem("prime_customer_username");
              localStorage.removeItem("prime_member_id");
            }
          }

          const storedCustId = typeof window !== 'undefined' ? (sessionStorage.getItem("prime_customer_id") || localStorage.getItem("prime_customer_id")) : null;
          const storedCustName = typeof window !== 'undefined' ? (sessionStorage.getItem("prime_customer_name") || localStorage.getItem("prime_customer_name")) : null;
          
          let effectiveId = storedCustId;
          if (!effectiveId || effectiveId === "1085949511") {
            effectiveId = "cust_" + Math.floor(100000 + Math.random() * 900000);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem("prime_customer_id", effectiveId);
              localStorage.setItem("prime_customer_id", effectiveId);
            }
          }

          const webUser = {
            id: effectiveId,
            first_name: (storedCustName && storedCustName !== "Jerome") ? storedCustName : "Tester",
            last_name: "Customer",
            username: `tester_${effectiveId.replace(/[^a-zA-Z0-9]/g, '').slice(-4)}`,
            language_code: "en"
          };
          initDataRaw = `user=${encodeURIComponent(JSON.stringify(webUser))}&auth_date=${Math.floor(Date.now() / 1000)}`;
        }

        const fingerprintData = await getClientFingerprint();
        const locationData = await getClientLocation();
        
        const response = await fetch("/api/auth/telegram/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            initData: initDataRaw,
            fingerprint: {
              ...fingerprintData,
              location: locationData
            }
          }),
        });

        if (response.ok) {
          const authData = await response.json();

          // If connection is from authorized Telegram Admin
          if (authData.isAdmin) {
            if (typeof window !== 'undefined' && (localStorage.getItem("skip_admin_redirect") === "true" || sessionStorage.getItem("skip_admin_redirect") === "true")) {
              setAuthorized(true);
              setIsAdmin(true);
              const productsRes = await fetch(`/api/products?_t=${Date.now()}`, { cache: "no-store" });
              const pData = await productsRes.json();
              setProducts(Array.isArray(pData) ? pData : []);
              return;
            }

            setRoutingToAdmin(true);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem("prime_admin_authorized", "true");
              sessionStorage.setItem("prime_admin_user_id", authData.tgUserId || "admin");
              localStorage.setItem("prime_admin_authorized", "true");
              localStorage.setItem("prime_admin_user_id", authData.tgUserId || "admin");
              if (authData.token) {
                sessionStorage.setItem("prime_admin_token", authData.token);
              }
              const hash = window.location.hash;
              router.replace(`/admin${hash ? hash : ''}`);
            }
            return;
          }

          if (typeof window !== 'undefined') {
            const customerId = authData.tgUserId || authData.user?.id || "";
            const customerName = authData.tgName || authData.user?.name || "";
            const customerUsername = authData.tgUsername || authData.user?.username || "";
            const memberId = authData.primeMemberId || authData.user?.primeMemberId || "";

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
          const productsRes = await fetch(`/api/products?_t=${Date.now()}`, { cache: "no-store" });
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
        setChecking(false);
      }
    }

    checkAuth();
  }, [router]);

  const safeProducts = Array.isArray(products) ? products : [];
  const categories = ["All", ...Array.from(new Set(safeProducts.map(p => p?.category || "General")))];

  const filteredProducts = safeProducts.filter(p => 
    p && (selectedCategory === "All" || (p?.category || "General") === selectedCategory) &&
    ((p?.name || "").toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (routingToAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-6 text-center font-sans">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-white" />
        <h1 className="text-xl font-heading font-black uppercase tracking-widest mb-1">Telegram Admin Verified</h1>
        <p className="text-xs text-gray-400 mt-2">Routing directly to Admin Panel...</p>
      </div>
    );
  }

  if (checking) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-900">
      <Loader2 className="w-10 h-10 animate-spin mb-4 text-black" />
      <p className="font-heading font-bold uppercase tracking-widest text-sm text-gray-500">Verifying Secure Session</p>
    </div>
  );

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
              if (typeof window !== "undefined") {
                localStorage.removeItem("skip_admin_redirect");
                sessionStorage.removeItem("skip_admin_redirect");
              }
              router.push("/admin");
            }}
            className="bg-white hover:bg-slate-100 text-black px-2 py-1 rounded font-bold uppercase text-[9px] tracking-wider transition-all cursor-pointer font-sans"
          >
            Back to Admin Panel
          </button>
        </div>
      )}
      
      {/* Sticky Header & Search */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center">
            <img 
              src="/primefinal.png" 
              alt="PRIME" 
              className="h-7 sm:h-[28px] w-auto object-contain shrink-0 drop-shadow-xs" 
            />
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (typeof window !== "undefined") {
                    localStorage.removeItem("skip_admin_redirect");
                    sessionStorage.removeItem("skip_admin_redirect");
                  }
                  router.push("/admin");
                }}
                className="bg-slate-900 hover:bg-black text-white px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Admin Panel
              </button>
            </div>
          )}
        </div>

        {/* Search & Filter Controls */}
        <div className="px-4 pb-3 flex flex-row gap-2 max-w-5xl mx-auto w-full">
          <div className="relative flex-[5]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input 
              type="text" 
              placeholder="SEARCH PRODUCTS..." 
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition-all font-heading font-normal uppercase text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
            />
          </div>
          <div className="relative flex-[3]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <select 
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black appearance-none cursor-pointer font-heading font-normal uppercase text-sm" 
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
        
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
          <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6">
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
                  
                  <div className="p-2 sm:p-4 flex flex-col flex-1 justify-between gap-1.5 sm:gap-2">
                    {/* Category */}
                    {p.category && (
                      <p className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 truncate">
                        {p.category}
                      </p>
                    )}

                    {/* Product Name */}
                    <h3 className="font-heading font-bold text-gray-900 line-clamp-2 leading-tight text-xs sm:text-base">
                      {p.name}
                    </h3>

                    {/* Horizontally Aligned Lowest Price (Left) & Cart Icon (Right) */}
                    <div className="flex items-center justify-between pt-1.5 sm:pt-2 border-t border-gray-100 mt-auto gap-1">
                      <div className="text-left font-mono font-bold text-xs sm:text-lg text-gray-950 truncate">
                        {formatPHP(lowestPrice)}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProduct(p);
                        }}
                        disabled={isOutOfStock}
                        className="p-1.5 sm:p-2.5 bg-slate-900 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg transition-all cursor-pointer shadow-2xs flex items-center justify-center shrink-0"
                        title={isOutOfStock ? "Sold Out" : "Select Options / Add to Cart"}
                        aria-label="Select Options"
                      >
                        <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      {selectedProduct && <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />}
      <OrderHistoryModal isOpen={isOrderHistoryOpen} onClose={() => setIsOrderHistoryOpen(false)} />

      {/* Back to Shopfront Confirmation Modal */}
      {isBackToShopfrontModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
            onClick={() => setIsBackToShopfrontModalOpen(false)}
          />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl border border-gray-100 animate-in zoom-in-95 duration-150">
            <h3 className="font-heading font-bold text-lg text-slate-950 uppercase tracking-widest mb-2">
              Back to Shopfront
            </h3>
            <p className="text-xs text-slate-600 font-mono leading-relaxed mb-6">
              Would you like to return to the main catalog page and reset all of your search queries and filter settings?
            </p>
            
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setIsBackToShopfrontModalOpen(false)}
                className="px-4 py-2 text-xs font-heading font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("All");
                  setIsBackToShopfrontModalOpen(false);
                  if (typeof window !== "undefined") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                className="px-5 py-2 text-xs font-heading font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg transition-colors cursor-pointer"
              >
                Confirm & Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Account & Points Modal */}
      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        onSelectOrder={(ord) => {
          setIsAccountOpen(false);
          setIsOrderHistoryOpen(true);
        }}
      />

      {/* Free Video Gallery Modal (Telegram Cloud) */}
      <VideoGalleryModal
        isOpen={isVideoGalleryOpen}
        onClose={() => {
          setIsVideoGalleryOpen(false);
          setActiveTab("shop");
        }}
      />

      {/* Feature Notification Toast */}
      {noticeToast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-4 py-2 rounded-xl shadow-xl border border-slate-800 text-xs font-mono flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Info className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{noticeToast}</span>
        </div>
      )}

      {/* Fixed Non-Scrolling Bottom Navigation Bar (sitting right above system footer) */}
      <nav className="fixed bottom-[20px] left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200/90 shadow-lg px-0.5 py-1.5 flex items-center justify-between font-['Roboto_Condensed'] select-none">
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
            showFeatureToast("NOTIFICATIONS");
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
            showFeatureToast("SUPPORT");
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
