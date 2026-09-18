"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getClientFingerprint, getClientLocation } from "./components/fingerprint-collector";
import ProductModal from "./components/product-modal";
import CartDrawer from "./components/cart-drawer";
import OrderHistoryModal from "./components/order-history-modal";
import AccountModal from "./components/account-modal";
import { useCart } from "./components/cart-context";
import { ShoppingBag, Search, Filter, AlertCircle, Loader2, ShoppingCart, Plus, Minus, Receipt, Menu, X, Home, User } from "lucide-react";
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBackToShopfrontModalOpen, setIsBackToShopfrontModalOpen] = useState(false);

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
           const currentHash = typeof window !== 'undefined' ? window.location.hash : "Server-side";
           throw new Error(`Missing initData. Hash: ${currentHash}`);
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

          // If connection is from authorized Telegram Admin (ID: 1085949511)
          if (authData.isAdmin) {
            if (typeof window !== 'undefined' && (localStorage.getItem("skip_admin_redirect") === "true" || sessionStorage.getItem("skip_admin_redirect") === "true")) {
              setAuthorized(true);
              setIsAdmin(true);
              const productsRes = await fetch(`/api/products?_t=${Date.now()}`, { cache: "no-store" });
              const pData = await productsRes.json();
              setProducts(pData);
              return;
            }

            setRoutingToAdmin(true);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem("prime_admin_authorized", "true");
              sessionStorage.setItem("prime_admin_user_id", authData.tgUserId || "1085949511");
              localStorage.setItem("prime_admin_authorized", "true");
              localStorage.setItem("prime_admin_user_id", authData.tgUserId || "1085949511");
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
          setProducts(pData);
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
        <p className="text-xs font-mono text-gray-400">Telegram ID: 1085949511</p>
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
              src="/prime-logo-metallic.png" 
              alt="PRIME" 
              className="h-7 sm:h-[28px] w-auto object-contain shrink-0 drop-shadow-xs" 
            />
          </div>
          
          <div className="relative flex items-center">
            {/* Plain Hamburger Menu Icon matching Prime logo height */}
            <button 
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-0 text-gray-900 hover:text-black transition-colors cursor-pointer flex items-center justify-center relative bg-transparent border-0"
              title="Menu"
              aria-label="Toggle navigation menu"
            >
              {isMenuOpen ? (
                <X className="h-7 w-7 sm:h-[28px] sm:w-[28px]" />
              ) : (
                <Menu className="h-7 w-7 sm:h-[28px] sm:w-[28px]" />
              )}
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full font-mono shadow-xs">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Hamburger Dropdown Pop-up Menu */}
            {isMenuOpen && (
              <>
                {/* Backdrop overlay */}
                <div 
                  className="fixed inset-0 z-40 bg-black/5" 
                  onClick={() => setIsMenuOpen(false)}
                />
                
                {/* Dropdown Box */}
                <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-50">
                  <div className="px-3.5 py-1.5 border-b border-gray-100 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400 font-mono">Navigation Menu</span>
                  </div>
                  
                  {/* Cart Option */}
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsCartOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-heading font-bold uppercase tracking-wider text-gray-700 hover:text-black hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-slate-700" />
                      <span>Shopping Bag</span>
                    </div>
                    {cartCount > 0 ? (
                      <span className="bg-slate-900 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                        {cartCount}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-gray-400">Empty</span>
                    )}
                  </button>

                  {/* Orders Option */}
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsOrderHistoryOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-heading font-bold uppercase tracking-wider text-gray-700 hover:text-black hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Receipt className="w-4 h-4 text-slate-700" />
                    <span>Your Orders</span>
                  </button>

                  {/* Account Option */}
                  <button
                    id="menu-your-account-btn"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsAccountOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-heading font-bold uppercase tracking-wider text-gray-700 hover:text-black hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <User className="w-4 h-4 text-slate-700" />
                    <span>Your Account</span>
                  </button>

                  {/* Back to Shopfront Option */}
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsBackToShopfrontModalOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-heading font-bold uppercase tracking-wider text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50/50 transition-colors flex items-center gap-2 border-t border-gray-100 cursor-pointer pt-3 mt-1"
                  >
                    <Home className="w-4 h-4 text-emerald-600" />
                    <span>Back to Shopfront</span>
                  </button>
                </div>
              </>
            )}
          </div>
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
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            {filteredProducts.map(p => {
              const variants = p.variants && p.variants.length > 0 ? p.variants : [];
              const isOutOfStock = variants.length > 0 
                ? variants.every((v: any) => (v.stock ?? 0) <= 0)
                : (p.stock ?? 0) <= 0;

              // Price range logic
              let priceDisplay = formatPHP(p.price || 0);
              if (variants.length > 0) {
                const prices = variants.map((v: any) => Number(v.price) || 0);
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                if (minPrice === maxPrice) {
                  priceDisplay = formatPHP(minPrice);
                } else {
                  priceDisplay = `${formatPHP(minPrice)} - ${formatPHP(maxPrice)}`;
                }
              }

              // Ratings logic
              const rating = p.rating || "4.5";

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
                        <span className="bg-black/80 backdrop-blur-sm text-white px-3 py-1.5 font-bold uppercase tracking-widest text-[10px] sm:text-xs rounded-lg">
                          Sold Out
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-3 sm:p-5 flex flex-col flex-1 justify-between">
                    <div>
                      {/* Category - Enlarged font size */}
                      <p className="text-xs sm:text-sm font-mono font-bold text-gray-500 uppercase tracking-wider mb-1">
                        {p.category || "General"}
                      </p>
                      
                      {/* Product Name */}
                      <h3 className="font-heading font-bold text-gray-900 line-clamp-2 leading-tight mb-1 text-sm sm:text-lg">
                        {p.name}
                      </h3>

                      {/* 5 Stars Rating placed right below product name */}
                      <div className="flex items-center gap-1.5 my-1.5">
                        <div className="flex items-center text-amber-400">
                          {[1, 2, 3, 4, 5].map((starIndex) => {
                            const ratingNum = Math.min(5, Math.max(0, Number(rating) || 4.5));
                            const fillPercent = Math.max(0, Math.min(100, (ratingNum - (starIndex - 1)) * 100));
                            return (
                              <span key={starIndex} className="relative inline-block text-xs sm:text-sm leading-none">
                                <span className="text-gray-200">★</span>
                                {fillPercent > 0 && (
                                  <span 
                                    className="absolute top-0 left-0 overflow-hidden text-amber-400 select-none"
                                    style={{ width: `${fillPercent}%` }}
                                  >
                                    ★
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                        <span className="text-[11px] sm:text-xs font-mono font-bold text-gray-600">
                          {Number(rating).toFixed(1)}
                        </span>
                      </div>

                      {/* Price Range right below ratings, enlarged & aligned to the right */}
                      <div className="text-right mt-1 mb-2.5">
                        <span className="font-mono font-bold text-base sm:text-xl text-gray-950">
                          {priceDisplay}
                        </span>
                      </div>
                    </div>
                    
                    {/* Repositioned button replacing the previous line separator position */}
                    <div className="pt-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProduct(p);
                        }}
                        className="w-full px-3.5 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs text-center"
                      >
                        {isOutOfStock ? "SOLD OUT" : "VIEW OPTIONS"}
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
    </div>
  );
}
