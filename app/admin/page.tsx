"use client";
import { useEffect, useState } from "react";
import { Users, Package, Sliders, ChevronDown, Lock, Loader2, ArrowRight, Trash2, Edit2, Eye, EyeOff, Plus, ClipboardList } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(false);
  const [code, setCode] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [activeModule, setActiveModule] = useState<string | null>(null);

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
        {[
          { name: 'Customers', icon: Users }, 
          { name: 'Orders', icon: ClipboardList }, 
          { name: 'Products', icon: Package }, 
          { name: 'Inventory', icon: Sliders }, 
          { name: 'Settings', icon: Lock }, 
          { name: 'Analytics', icon: Users }
        ].map((item) => (
          <button key={item.name} onClick={() => setActiveModule(item.name)} className="h-24 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg transition-all flex flex-col items-center justify-center gap-2 relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-white/50 opacity-0 hover:opacity-100 transition-opacity"></div>
             <item.icon className="w-5 h-5 text-gray-400" />
             <span className="font-bold text-[10px] uppercase tracking-widest relative z-10">{item.name}</span>
          </button>
        ))}
      </div>

      {/* Dynamic Content Area */}
      <AnimatePresence mode="wait">
        {activeModule && (
          <motion.section 
            key={activeModule}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
          >
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="font-heading font-bold uppercase tracking-wide text-gray-900">{activeModule}</h2>
              <button onClick={() => setActiveModule(null)} className="text-xs font-bold uppercase">Close</button>
            </div>
            
            <div className="p-4">
               {activeModule === 'Customers' && (
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
               )}

               {activeModule === 'Products' && (
                  <div>
                     <button className="mb-4 bg-black text-white px-3 py-1.5 rounded-md font-bold uppercase text-[10px] flex items-center gap-1.5">
                        <Plus className="w-3 h-3" /> Add Product
                     </button>
                     <div className="divide-y divide-gray-100">
                      {products.map(p => (
                        <div key={p.id} className="p-3 flex justify-between items-center">
                            <span className="text-sm font-bold text-gray-900">{p.name}</span>
                            <div className="flex gap-2">
                               <button className="text-gray-400 hover:text-black"><Edit2 className="w-4 h-4" /></button>
                               <button className="text-gray-400 hover:text-black">{p.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
                               <button onClick={() => deleteProduct(p.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>
                      ))}
                    </div>
                  </div>
               )}
               
               {activeModule === 'Inventory' && (
                   <div className="divide-y divide-gray-100">
                      {products.map(p => (
                        <div key={p.id} className="p-3 flex justify-between items-center">
                            <span className="text-sm font-bold text-gray-900">{p.name}</span>
                            <span className="text-xs font-mono">Stock: {p.stock}</span>
                        </div>
                      ))}
                   </div>
               )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
