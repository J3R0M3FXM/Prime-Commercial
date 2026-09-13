"use client";
import { useEffect, useState } from "react";
import { Users, Package, Sliders, ChevronDown, Lock, Loader2, ArrowRight } from "lucide-react";

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
      <div className="min-h-screen bg-gray-100 p-4">
        <button onClick={() => setSelectedCustomer(null)} className="mb-4 text-xs font-bold uppercase underline tracking-widest text-gray-600">Back to Dashboard</button>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
           <h2 className="text-2xl font-bold mb-4">{selectedCustomer.tgName || 'Unknown User'}</h2>
           <p className="font-mono text-sm text-gray-600 mb-6">{selectedCustomer.primeMemberId}</p>
           <pre className="text-[10px] bg-gray-50 p-4 rounded overflow-auto">{JSON.stringify(selectedCustomer, null, 2)}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-2 sm:p-4 font-sans pb-20">
      <header className="mb-8 bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex justify-between items-center">
        <h1 className="text-xl font-heading font-black tracking-widest uppercase">Prime Admin</h1>
        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Live</span>
      </header>

      {/* Glossy Grid Dashboard */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {['Customers', 'Orders', 'Products', 'Inventory', 'Settings', 'Analytics'].map((item) => (
          <button key={item} className="h-24 bg-gradient-to-br from-white to-gray-100 border border-gray-200 rounded-xl shadow-sm flex flex-col items-center justify-center gap-2 hover:shadow-md transition-shadow">
            <span className="font-bold text-xs uppercase tracking-widest">{item}</span>
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {/* Module 1: Customers */}
        <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
            <Users className="w-5 h-5 text-gray-700" />
            <h2 className="font-heading font-bold uppercase tracking-wide text-gray-900">Customer Management</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {customers.map((c) => (
              <div key={c.tgUserId} onClick={() => setSelectedCustomer(c)} className="p-4 cursor-pointer hover:bg-gray-50 flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-900">{c.tgName || 'Unknown User'}</span>
                    <span className="text-[10px] text-gray-500 font-mono">{c.primeMemberId}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
              </div>
            ))}
          </div>
        </section>

        {/* Module 2: Products/Inventory */}
        <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
             <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-gray-700" />
                <h2 className="font-heading font-bold uppercase tracking-wide text-gray-900">Products & Inventory</h2>
             </div>
             <button onClick={() => setShowProductForm(!showProductForm)} className="bg-black text-white px-3 py-1.5 rounded font-bold uppercase text-[10px] hover:bg-gray-800">Add Product</button>
          </div>
          {showProductForm && (
            <form className="p-4 border-b border-gray-200 bg-white space-y-3" onSubmit={async (e) => {
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
                await fetch('/api/admin/products', {
                  method: 'POST',
                  body: JSON.stringify(newProduct)
                });
                form.reset();
                setShowProductForm(false);
                fetchData();
              }}>
              <input type="text" placeholder="Product Name" className="w-full p-2 border rounded" required />
              <input type="number" placeholder="Price" className="w-full p-2 border rounded" required />
              <input type="number" placeholder="Stock" className="w-full p-2 border rounded" required />
              <textarea placeholder="Description" className="w-full p-2 border rounded" required />
              <button type="submit" className="bg-black text-white px-4 py-2 rounded">Publish</button>
            </form>
          )}
          <div className="divide-y divide-gray-100">
            {products.map(p => (
              <div key={p.id} className="p-3 flex justify-between items-center gap-4">
                  <span className="text-sm font-bold text-gray-900 truncate flex-1">{p.name}</span>
                  <div className="flex gap-2 items-center">
                    <button className="bg-gray-200 px-2 py-1 rounded text-[10px] font-bold">Edit</button>
                    <div className="w-8 h-4 bg-gray-300 rounded-full"></div>
                    <div className="w-8 h-4 bg-gray-300 rounded-full"></div>
                  </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

