"use client";

import { useEffect, useState } from "react";
import { retrieveLaunchParams } from "@telegram-apps/sdk";
import { getClientFingerprint, getClientLocation } from "./components/fingerprint-collector";
import ProductModal from "./components/product-modal";

export default function Shopfront() {
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const { initDataRaw } = retrieveLaunchParams();
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
        }
      } catch (e) {
        console.error("Auth check failed", e);
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

  if (checking) return <div>Loading...</div>;

  if (!authorized) {
    return (
      <div className="p-4 text-center">
        <h1>Access Denied</h1>
        <p>This shopfront is exclusively for use inside the Telegram environment.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">PRIME Shop</h1>
      <input 
        type="text" 
        placeholder="Search..." 
        className="w-full p-2 mb-2 border rounded"
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <select className="w-full p-2 mb-4 border rounded" onChange={(e) => setSelectedCategory(e.target.value)}>
        {categories.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      
      <div className="grid grid-cols-3 gap-4">
        {filteredProducts.map(p => (
            <div key={p.id} className="border p-2 rounded relative cursor-pointer" onClick={() => setSelectedProduct(p)}>
                {p.stock === 0 && <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] p-1">Out of Stock</span>}
                <img src={p.imageUrl} alt={p.name} className="w-full h-24 object-cover" />
                <p className="font-semibold mt-1">{p.name}</p>
                <p className="text-sm">${p.price}</p>
            </div>
        ))}
      </div>
      {selectedProduct && <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />}
    </div>
  );
}
