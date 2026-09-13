"use client";
import { useEffect, useState } from "react";
import { Users, Package, Sliders, ChevronDown, Lock, Loader2, ArrowRight, Trash2, Edit2, Eye, EyeOff, Plus } from "lucide-react";

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(false);
  const [code, setCode] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showProductForm, setShowProductForm] = useState(false);

  const fetchData = async () => {
    try {
      const [custRes, prodRes] = await Promise.all([
        fetch("/api/admin/customers"),
        fetch("/api/products")
      ]);
      setCustomers(await custRes.json());
      setProducts(await prodRes.json());
    } catch (e) {
      console.error("Failed to load data", e);
    }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Are you sure?")) return;
    await fetch('/api/admin/products', { method: 'DELETE', body: JSON.stringify({ id }) });
    fetchData();
  };

  const handleLogin = async (e: React.FormEvent) => {
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
        setAuthorized(true);
        fetchData();
      } else {
        setErrorMsg(data.error || "Invalid Access Code");
      }
    } catch (err) {
      setErrorMsg("Connection Error");
    } finally {
      setLoading(false);
    }
  };

  if (!authorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-gray-100 p-6">
        <div className="w-full max-w-sm bg-black border border-gray-800 p-8 rounded-xl shadow-2xl">
          <Lock className="w-12 h-12 text-white mb-6 mx-auto" />
          <h1 className="text-2xl font-heading font-black text-center mb-2 tracking-widest uppercase">Prime Admin</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ENTER ACCESS CODE"
              className="w-full p-4 bg-gray-900 border border-gray-800 rounded-lg text-center font-mono focus:border-white focus:outline-none transition-colors"
            />
            {errorMsg && <p className="text-red-500 text-xs text-center">{errorMsg}</p>}
            <button type="submit" disabled={loading} className="w-full p-4 bg-white text-black font-bold uppercase tracking-widest rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Authenticate"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (selectedCustomer) {
    return (
      <div className="min-h-screen bg-white p-6 font-sans">
        <button onClick={() => setSelectedCustomer(null)} className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-black">
          &larr; Back to Dashboard
        </button>
        <div className="max-w-2xl border border-gray-200 rounded-xl p-8 shadow-sm">
           <h2 className="text-3xl font-heading font-black mb-1 uppercase">{selectedCustomer.tgName || 'Unknown User'}</h2>
           <p className="font-mono text-sm text-gray-500 mb-8">{selectedCustomer.primeMemberId}</p>
           <div className="space-y-6 text-sm">
             <div className="grid grid-cols-2 gap-4">
               <div><p className="text-gray-500 uppercase text-[10px] tracking-widest font-bold">Telegram ID</p><p className="font-mono">{selectedCustomer.tgUserId}</p></div>
               <div><p className="text-gray-500 uppercase text-[10px] tracking-widest font-bold">Handle</p><p>@{selectedCustomer.tgUsername || 'none'}</p></div>
             </div>
             {selectedCustomer.latestFingerprint && (
               <div className="pt-6 border-t border-gray-100">
                 <p className="font-bold text-[10px] uppercase tracking-widest text-gray-400 mb-4">Security Snapshot</p>
                 <pre className="text-[10px] bg-gray-50 p-4 rounded-lg overflow-auto">{JSON.stringify(selectedCustomer.latestFingerprint, null, 2)}</pre>
               </div>
             )}
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans pb-20">
      <header className="mb-8 flex justify-between items-end">
        <h1 className="text-2xl font-heading font-black tracking-widest uppercase">Prime Admin</h1>
        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-widest flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>Live</span>
      </header>

      {/* Glossy Dashboard Tiles */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {['Customers', 'Orders', 'Products', 'Inventory', 'Settings', 'Analytics'].map((item) => (
          <button key={item} className="h-24 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg transition-all flex flex-col items-center justify-center gap-2 relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-white/50 opacity-0 hover:opacity-100 transition-opacity"></div>
             <span className="font-bold text-[10px] uppercase tracking-widest relative z-10">{item}</span>
          </button>
        ))}
      </div>

      <div className="space-y-8">
        {/* Module 1: Customers */}
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center gap-3">
            <Users className="w-5 h-5 text-gray-700" />
            <h2 className="font-heading font-bold uppercase tracking-wide text-gray-900">Customer Management</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {customers.map((c) => (
              <div key={c.tgUserId} onClick={() => setSelectedCustomer(c)} className="p-4 cursor-pointer hover:bg-gray-50 flex justify-between items-center group">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-900 group-hover:underline">{c.tgName || 'Unknown User'}</span>
                    <span className="text-[10px] text-gray-500 font-mono">{c.primeMemberId}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-black transition-colors" />
              </div>
            ))}
          </div>
        </section>

        {/* Module 2: Products/Inventory */}
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
             <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-gray-700" />
                <h2 className="font-heading font-bold uppercase tracking-wide text-gray-900">Products & Inventory</h2>
             </div>
             <button onClick={() => setShowProductForm(!showProductForm)} className="bg-white border border-gray-200 text-black px-3 py-1.5 rounded-md font-bold uppercase text-[10px] hover:bg-gray-50 flex items-center gap-1.5">
                <Plus className="w-3 h-3" /> Add Product
             </button>
          </div>
          
          {showProductForm && (
            <form className="p-4 border-b border-gray-200 bg-gray-50 space-y-3" onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const newProduct = {
                  name: (form[0] as HTMLInputElement).value,
                  price: parseFloat((form[1] as HTMLInputElement).value),
                  stock: parseInt((form[2] as HTMLInputElement).value),
                  description: (form[3] as HTMLTextAreaElement).value,
                  bundleConfig: { enabled: (form[4] as HTMLInputElement).checked, discount: 15 },
                  category: 'General'
                };
                await fetch('/api/admin/products', { method: 'POST', body: JSON.stringify(newProduct) });
                form.reset();
                setShowProductForm(false);
                fetchData();
              }}>
              <input type="text" placeholder="Product Name" className="w-full p-2 border rounded text-sm" required />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Price" className="p-2 border rounded text-sm" required />
                <input type="number" placeholder="Stock" className="p-2 border rounded text-sm" required />
              </div>
              <textarea placeholder="Description" className="w-full p-2 border rounded text-sm" required />
              <button type="submit" className="w-full bg-black text-white px-4 py-2 rounded text-sm font-bold">Publish Product</button>
            </form>
          )}

          <div className="divide-y divide-gray-100">
            {products.map(p => (
              <div key={p.id} className="p-3 flex justify-between items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-gray-900 truncate block">{p.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono">Stock: {p.stock} | ${p.price}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button className="text-gray-400 hover:text-black"><Edit2 className="w-4 h-4" /></button>
                    <button className="text-gray-400 hover:text-black">{p.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
                    <button onClick={() => deleteProduct(p.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}