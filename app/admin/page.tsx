"use client";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(false);
  const [code, setCode] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code === process.env.NEXT_PUBLIC_ADMIN_ACCESS_CODE) { // Using public env for demo, must be server-side in prod
      setAuthorized(true);
      const res = await fetch("/api/admin/customers");
      const data = await res.json();
      setCustomers(data);
    } else {
      alert("Invalid Code");
    }
  };

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4 text-sm">
        <form onSubmit={handleLogin} className="w-full max-w-sm">
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter Access Code"
            className="w-full p-2 border border-gray-300 rounded"
          />
          <button type="submit" className="w-full mt-2 p-2 bg-blue-600 text-white rounded">
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="p-2 text-sm">
      <h1 className="text-lg font-bold mb-2">Customer Management</h1>
      {customers.map((c) => (
        <div key={c.tgUserId} className="border-b border-gray-200 py-2">
          <details>
            <summary className="font-semibold cursor-pointer">{c.tgName || 'Unknown'} ({c.primeMemberId})</summary>
            <div className="p-2 bg-gray-50 mt-1">
              <p>ID: {c.tgUserId}</p>
              <p>Handle: @{c.tgUsername}</p>
              <p>Phone: {c.phoneNumber || 'N/A'}</p>
            </div>
          </details>
        </div>
      ))}
      <h2 className="text-lg font-bold mt-6 mb-2">Inventory Management</h2>
      <div className="border p-2">
         <input type="number" placeholder="Update Stock" className="p-1 border text-sm w-full" />
      </div>
      <h2 className="text-lg font-bold mt-6 mb-2">Product Configurator</h2>
      <div className="border p-2">
        <input type="text" placeholder="Product Name" className="p-1 border text-sm w-full mb-1" />
        <input type="number" placeholder="Price" className="p-1 border text-sm w-full mb-1" />
        <label className="text-sm"><input type="checkbox" className="mr-1"/> Bundle Enabled?</label>
      </div>
    </div>
  );
}
