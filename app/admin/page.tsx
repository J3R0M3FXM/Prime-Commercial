"use client";
import { useEffect, useState } from "react";
import { Users, Package, Sliders, ChevronDown, Lock, Loader2 } from "lucide-react";

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(false);
  const [code, setCode] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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

  if (!authorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-gray-100 p-6">
        <div className="w-full max-w-sm bg-black border border-gray-800 p-8 rounded-xl shadow-2xl">
          <Lock className="w-12 h-12 text-white mb-6 mx-auto" />
          <h1 className="text-2xl font-heading font-black text-center mb-2 tracking-widest uppercase">Prime Admin</h1>
          <p className="text-gray-400 text-xs text-center mb-6 uppercase tracking-wider">Restricted Access</p>
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

  return (
    <div className="min-h-screen bg-gray-100 p-2 sm:p-4 font-sans pb-20">
      <header className="mb-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex justify-between items-center">
        <h1 className="text-xl font-heading font-black tracking-widest uppercase">Prime Admin</h1>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Live</span>
        </div>
      </header>

      <div className="space-y-4 max-w-3xl mx-auto">
        {/* Module 1: Customers */}
        <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
            <Users className="w-5 h-5 text-gray-700" />
            <h2 className="font-heading font-bold uppercase tracking-wide text-gray-900">Customer Management</h2>
          </div>
          <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
            {customers.map((c) => (
              <details key={c.tgUserId} className="group">
                <summary className="p-3 font-semibold cursor-pointer flex justify-between items-center hover:bg-gray-50 transition-colors list-none">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-900">{c.tgName || 'Unknown User'}</span>
                    <span className="text-[10px] text-gray-500 font-mono">{c.primeMemberId}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-3 bg-gray-50 text-xs text-gray-700 space-y-2 border-t border-gray-100">
                  <div className="flex justify-between"><span className="text-gray-500">Telegram ID:</span> <span className="font-mono font-medium">{c.tgUserId}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Handle:</span> <span className="font-medium">@{c.tgUsername || 'none'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Joined:</span> <span className="font-medium">{c.createdAt ? new Date(c.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown'}</span></div>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Module 2: Inventory */}
        <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
            <Package className="w-5 h-5 text-gray-700" />
            <h2 className="font-heading font-bold uppercase tracking-wide text-gray-900">Inventory Management</h2>
          </div>
          <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
            {products.map(p => (
              <details key={p.id} className="group">
                <summary className="p-3 font-semibold cursor-pointer flex justify-between items-center hover:bg-gray-50 transition-colors list-none">
                  <div className="flex flex-col flex-1 pr-4">
                    <span className="text-sm font-bold text-gray-900 truncate">{p.name}</span>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[10px] font-bold uppercase bg-gray-200 px-1.5 py-0.5 rounded text-gray-700">{p.category}</span>
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${p.stock > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                        Stock: {p.stock}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform shrink-0" />
                </summary>
                <div className="p-3 bg-gray-50 text-xs border-t border-gray-100">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-gray-500 font-bold">Update Stock Count:</label>
                    <div className="flex gap-2">
                      <input type="number" defaultValue={p.stock} className="w-20 p-2 border border-gray-300 rounded font-mono text-center focus:outline-none focus:border-black" />
                      <button className="bg-black text-white px-3 rounded font-bold uppercase text-[10px] hover:bg-gray-800">Save</button>
                    </div>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Module 3: Product Configurator */}
        <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
            <Sliders className="w-5 h-5 text-gray-700" />
            <h2 className="font-heading font-bold uppercase tracking-wide text-gray-900">Product Configurator</h2>
          </div>
          <div className="p-4 bg-white">
            <p className="text-xs text-gray-500 mb-4 uppercase tracking-wider font-bold">Add New Product</p>
            <div className="space-y-3">
              <input type="text" placeholder="Product Name" className="w-full p-3 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-black transition-colors" />
              <div className="flex gap-3">
                <input type="number" placeholder="Price ($)" className="w-1/2 p-3 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-black transition-colors" />
                <input type="number" placeholder="Init Stock" className="w-1/2 p-3 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-black transition-colors" />
              </div>
              <textarea placeholder="Description" rows={3} className="w-full p-3 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-black transition-colors resize-none"></textarea>
              <div className="flex items-center gap-2 p-3 border border-gray-200 rounded bg-gray-50">
                <input type="checkbox" id="bundle" className="w-4 h-4 accent-black" />
                <label htmlFor="bundle" className="text-sm font-bold text-gray-700 cursor-pointer">Enable 'Buy More, Save More' Bundle (15% off)</label>
              </div>
              <button className="w-full bg-black text-white p-3 rounded font-bold uppercase tracking-widest text-sm hover:bg-gray-800 transition-colors">
                Publish Product
              </button>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
