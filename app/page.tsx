"use client";

import { useEffect, useState } from "react";
import { getClientFingerprint, getClientLocation } from "./components/fingerprint-collector";
import ProductModal from "./components/product-modal";
import CartDrawer from "./components/cart-drawer";
import { useCart } from "./components/cart-context";
import { ShoppingBag, Search, Filter, AlertCircle, Loader2 } from "lucide-react";

export default function Shopfront() {
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);

  const { cartCount, addToCart } = useCart();

  useEffect(() => {
    async function checkAuth() {
      try {
        let initDataRaw = "";
        
        // Wait for the next tick to ensure Telegram has injected the data
        await new Promise(resolve => setTimeout(resolve, 100));

        // Absolute fallback: read directly from the URL hash
        if (typeof window !== 'undefined' && window.location.hash) {
          const hashStr = window.location.hash.substring(1);
          const params = new URLSearchParams(hashStr);
          const tgData = params.get('tgWebAppData');
          
          if (tgData) {
            initDataRaw = tgData;
          } else {
             if (hashStr.includes('user=') || hashStr.includes('hash=')) {
               initDataRaw = hashStr;
             }
          }
        }
        
        // Final fallback: try window object
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
          setAuthorized(true);
          const productsRes = await fetch('/api/products');
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
  }, []);

  const categories = ["All", ...Array.from(new Set(products.map(p => p.category || "General")))];

  const filteredProducts = products.filter(p => 
    (selectedCategory === "All" || (p.category || "General") === selectedCategory) &&
    (p.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
        {errorMsg && (
          <div className="bg-red-50 text-red-800 p-4 rounded-lg w-full max-w-sm text-left border border-red-100">
            <p className="text-xs font-mono break-all font-medium">Debug: {errorMsg}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative pb-20">
      
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-2xl font-heading font-black tracking-widest uppercase">PRIME</h1>
        <button 
          onClick={() => setIsCartOpen(true)}
          className="relative p-2 text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ShoppingBag className="w-6 h-6" />
          {cartCount > 0 && (
            <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
              {cartCount}
            </span>
          )}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
        
        {/* Search & Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search products..." 
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="relative sm:w-48">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select 
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent appearance-none cursor-pointer" 
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
            {filteredProducts.map(p => {
              const isOutOfStock = p.stock === 0;
              return (
                <div 
                  key={p.id} 
                  className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col cursor-pointer"
                  onClick={() => setSelectedProduct(p)}
                >
                  <div className="relative aspect-square overflow-hidden bg-gray-50">
                    <img 
                      src={p.imageUrl || "https://picsum.photos/seed/prime/400"} 
                      alt={p.name} 
                      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${isOutOfStock ? 'opacity-50 grayscale' : ''}`}
                    />
                    {isOutOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-black/80 backdrop-blur-sm text-white px-3 py-1.5 font-bold uppercase tracking-widest text-xs rounded">
                          Sold Out
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-3 sm:p-4 flex flex-col flex-1">
                    <h3 className="font-bold text-gray-900 line-clamp-2 leading-tight mb-1">{p.name}</h3>
                    <p className="text-sm text-gray-500 mb-3">{p.category || "General"}</p>
                    
                    <div className="mt-auto flex items-center justify-between">
                      <span className="font-heading font-bold text-lg text-gray-900">${Number(p.price).toFixed(2)}</span>
                      {!isOutOfStock && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation(); // prevent modal opening
                            addToCart(p, 1);
                          }}
                          className="bg-black text-white px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-gray-800 transition-colors"
                        >
                          Add
                        </button>
                      )}
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
    </div>
  );
}
