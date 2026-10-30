"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Loader2, Minus, Package, Plus, RefreshCw, Search, ShieldCheck, ShoppingCart, Store, Truck, X } from "lucide-react";
import { callServerless, getTelegramServerlessSession } from "@/lib/telegram-serverless-client";
import { formatPHP } from "@/lib/currency";

type Product = { id: string; name: string; price: number; stock: number; category?: string; imageUrl?: string; isActive?: boolean; variants?: Array<Record<string, any>>; bundleConfig?: { variants?: Array<Record<string, any>> } };
type CartLine = { key: string; productId: string; variantId: string; name: string; price: number; quantity: number; stock: number };
type Customer = { id: string; tgUserId?: string; tgName?: string; tgUsername?: string; phoneNumber?: string; primeMemberId?: string; isBanned?: boolean };
type Courier = { id: string; name: string; isActive?: boolean };
type Tender = { id: string; name: string; isActive?: boolean };

function productVariants(product: Product) {
  return Array.isArray(product.variants) ? product.variants : Array.isArray(product.bundleConfig?.variants) ? product.bundleConfig.variants : [];
}

export default function TelegramServerlessPosPanel({ onBack }: { onBack: () => void }) {
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"store" | "delivery">("store");
  const [customerType, setCustomerType] = useState<"guest" | "existing">("guest");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [courierId, setCourierId] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [paymentMethodName, setPaymentMethodName] = useState("Cash");
  const [quoteResult, setQuoteResult] = useState<{ key: string; total: number }>({ key: "", total: 0 });
  const [retryKey, setRetryKey] = useState("");
  const [lastSale, setLastSale] = useState<{ orderNumber: string; totalAmount: number; mode: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [catalog, customerRows, courierRows, paymentRows] = await Promise.all([
        callServerless<Product[]>("manageProducts", { action: "list" }, 30_000),
        callServerless<Customer[]>("manageCustomers", { action: "list" }, 30_000),
        callServerless<Courier[]>("manageCouriers", { action: "list" }, 30_000),
        callServerless<Tender[]>("managePaymentMethods", { action: "list" }, 30_000),
      ]);
      if (!Array.isArray(catalog)) throw new Error("The live product catalog response was invalid.");
      setProducts(catalog.filter((product) => product.isActive !== false));
      setCustomers(Array.isArray(customerRows) ? customerRows : []);
      setCouriers(Array.isArray(courierRows) ? courierRows.filter((courier) => courier.isActive !== false) : []);
      setTenders(Array.isArray(paymentRows) ? paymentRows.filter((method) => method.isActive !== false) : []);
    } catch (err: any) { setError(err?.message || "Could not load the live POS data."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let current = true;
    getTelegramServerlessSession().then((session) => {
      if (!current) return;
      if (!session?.authenticated || !session?.isAdmin) { setError(session?.error || "Verified Telegram admin access is required to use POS."); return; }
      setAuthorized(true);
    }).catch((err: any) => { if (current) setError(err?.message || "Open PRIME from Telegram to use POS."); })
      .finally(() => { if (current) setCheckingAuth(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => { if (authorized) void load(); }, [authorized, load]);

  const quoteRequest = useMemo(() => ({
    action: "quote", mode, deliveryFee: mode === "delivery" ? Number(deliveryFee) : 0,
    items: cart.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })),
  }), [cart, deliveryFee, mode]);
  const quoteKey = JSON.stringify(quoteRequest);

  useEffect(() => {
    if (!authorized || !cart.length) { setQuoteResult({ key: "", total: 0 }); return; }
    let active = true;
    setQuoteResult({ key: "", total: 0 });
    const timer = window.setTimeout(() => {
      void callServerless<{ totalAmount?: number }>("createPosOrder", quoteRequest, 30_000)
        .then((quote) => { if (active) setQuoteResult({ key: quoteKey, total: Number(quote.totalAmount) || 0 }); })
        .catch((err: any) => { if (active) { setQuoteResult({ key: "", total: 0 }); setError(err?.message || "Could not calculate the current POS total."); } });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [authorized, cart.length, quoteKey, quoteRequest]);

  const normalizedSearch = search.trim().toLowerCase();
  const categories = useMemo(() => Array.from(new Set(products.map((product) => String(product.category || "General").trim() || "General")))
    .sort((a, b) => a.localeCompare(b)), [products]);
  const visibleCategories = useMemo(() => categories.filter((category) => !normalizedSearch ||
    category.toLowerCase().includes(normalizedSearch) || products.some((product) =>
      (String(product.category || "General").trim() || "General") === category &&
      `${product.name} ${productVariants(product).map((variant) => variant.name || "").join(" ")}`.toLowerCase().includes(normalizedSearch)
    )), [categories, normalizedSearch, products]);
  const categoryProducts = useMemo(() => products.filter((product) =>
    (String(product.category || "General").trim() || "General") === selectedCategory &&
    (!normalizedSearch || `${product.name} ${productVariants(product).map((variant) => variant.name || "").join(" ")}`.toLowerCase().includes(normalizedSearch))
  ), [products, selectedCategory, normalizedSearch]);
  const selectedProduct = categoryProducts.find((product) => product.id === selectedProductId) || null;
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const total = cart.length && quoteResult.key === quoteKey ? quoteResult.total : 0;

  const addItem = (product: Product, variant: Record<string, any> | null = null) => {
    const variantId = String(variant?.id || "default");
    const key = `${product.id}_${variantId}`;
    const stock = Math.max(0, Number(variant?.stock ?? product.stock) || 0);
    setCart((current) => {
      const found = current.find((line) => line.key === key);
      if ((found?.quantity || 0) >= stock) return current;
      if (found) return current.map((line) => line.key === key ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { key, productId: product.id, variantId, name: product.name + (variant ? ` · ${String(variant.name || variantId)}` : ""), price: Math.max(0, Number(variant?.price ?? product.price) || 0), quantity: 1, stock }];
    });
    setError(""); setNotice(""); setLastSale(null); setRetryKey("");
  };

  const changeQuantity = (key: string, delta: number) => {
    setRetryKey("");
    setCart((current) => current.flatMap((line) => {
      if (line.key !== key) return [line];
      const quantity = Math.min(line.stock, line.quantity + delta);
      return quantity < 1 ? [] : [{ ...line, quantity }];
    }));
  };

  const checkout = async () => {
    if (!cart.length) { setError("Add at least one item to the sale."); return; }
    if (!customerName.trim()) { setError("Enter the customer name."); return; }
    if (customerType === "existing" && !selectedCustomerId) { setError("Select an existing customer or choose New / guest."); return; }
    const notifyTelegramId = customerType === "guest" ? telegramId.trim() : "";
    if (notifyTelegramId && !/^[0-9]{1,20}$/.test(notifyTelegramId)) { setError("Enter a numeric Telegram user ID."); return; }
    if (mode === "delivery" && (!deliveryAddress.trim() || !courierId || !Number.isFinite(Number(deliveryFee)) || Number(deliveryFee) < 0)) {
      setError("Enter the delivery address, choose a courier, and check the delivery fee."); return;
    }
    if (!window.confirm(`Confirm ${formatPHP(total)} received by ${paymentMethodName} and save this ${mode === "store" ? "store sale" : "delivery order"}?`)) return;
    setSaving(true); setError(""); setNotice(""); setLastSale(null);
    try {
      if (!window.crypto?.getRandomValues) throw new Error("Secure checkout keys are unavailable on this device.");
      let operationKey = retryKey;
      if (!operationKey) {
        const bytes = new Uint8Array(24); window.crypto.getRandomValues(bytes);
        operationKey = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        setRetryKey(operationKey);
      }
      const result = await callServerless<{ success?: boolean; orderNumber?: string; totalAmount?: number }>("createPosOrder", {
        operationKey, mode, customerName: customerName.trim(), customerPhone: customerPhone.trim(),
        customerId: customerType === "existing" ? selectedCustomerId : "",
        telegramId: notifyTelegramId,
        paymentMethodName, deliveryAddress: deliveryAddress.trim(), courierId,
        deliveryFee: mode === "delivery" ? Number(deliveryFee) : 0,
        items: cart.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })),
      }, 60_000);
      if (!result?.success || !result.orderNumber) throw new Error("The POS did not receive a saved order confirmation.");
      setLastSale({ orderNumber: result.orderNumber, totalAmount: Number(result.totalAmount) || total, mode });
      setNotice(`Order ${result.orderNumber} saved in the shared Orders list.`);
      setRetryKey("");
      setCart([]); setCustomerName(""); setCustomerPhone(""); setTelegramId(""); setSelectedCustomerId(""); setCustomerType("guest"); setDeliveryAddress(""); setDeliveryFee("0");
      await load();
    } catch (err: any) { setError(err?.message || "Could not save this sale."); }
    finally { setSaving(false); }
  };

  return <main className="serverless-admin-panel" aria-label="Point of sale">
    <header className="serverless-panel-header">
      <button type="button" onClick={onBack} className="serverless-action" aria-label="Back to Admin modules"><ArrowLeft className="h-4 w-4"/></button>
      <div className="serverless-panel-header__copy"><h1>Point of Sale</h1><p><ShieldCheck className="mr-1 inline h-3 w-3 text-emerald-700"/>Live catalog · shared orders</p></div>
      <button type="button" onClick={() => void load()} disabled={!authorized || loading || saving} className="serverless-action" aria-label="Refresh POS data"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/></button>
    </header>
    {(error || notice) && <div role={error ? "alert" : "status"} className={`my-2 border p-2 text-xs ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error || notice}</div>}
    {checkingAuth && <div className="my-2 flex justify-center border bg-white p-5"><Loader2 className="h-5 w-5 animate-spin"/></div>}
    {authorized && <>
      <div className="grid grid-cols-2 gap-2 py-2">
        <button type="button" onClick={() => { setMode("store"); setRetryKey(""); }} className={`flex min-h-11 items-center justify-center gap-2 border text-xs font-bold uppercase ${mode === "store" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}><Store className="h-4 w-4"/>Store sale</button>
        <button type="button" onClick={() => { setMode("delivery"); setRetryKey(""); }} className={`flex min-h-11 items-center justify-center gap-2 border text-xs font-bold uppercase ${mode === "delivery" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}><Truck className="h-4 w-4"/>Delivery</button>
      </div>
      <section className="my-2 border border-slate-200 bg-white p-3" aria-label="POS customer">
        <div className="mb-2"><strong className="text-xs font-bold uppercase tracking-wide text-slate-700">Customer</strong><p className="mt-0.5 text-[10px] text-slate-500">Choose an account or enter a Telegram ID for order updates.</p></div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setCustomerType("existing"); setSelectedCustomerId(""); setTelegramId(""); setCustomerName(""); setCustomerPhone(""); setRetryKey(""); }} className={`min-h-10 border px-2 text-[10px] font-bold uppercase ${customerType === "existing" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>Existing customer</button>
          <button type="button" onClick={() => { setCustomerType("guest"); setSelectedCustomerId(""); setTelegramId(""); setCustomerName(""); setCustomerPhone(""); setRetryKey(""); }} className={`min-h-10 border px-2 text-[10px] font-bold uppercase ${customerType === "guest" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>New / guest</button>
        </div>
        {customerType === "existing" ? <label className="serverless-field">Select customer<select value={selectedCustomerId} onChange={(event) => {
          const customer = customers.find((row) => row.id === event.target.value);
          setSelectedCustomerId(event.target.value); setRetryKey("");
          setCustomerName(customer?.tgName || customer?.tgUsername || ""); setCustomerPhone(customer?.phoneNumber || "");
        }}><option value="">Choose a customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id} disabled={customer.isBanned === true}>{customer.tgName || "Telegram customer"}{customer.tgUsername ? ` · @${customer.tgUsername}` : ""} · {customer.tgUserId || "No Telegram ID"}{customer.isBanned ? " · Restricted" : ""}</option>)}</select></label> : <label className="serverless-field">Telegram ID for bot notifications (optional)<input value={telegramId} onChange={(event) => { setTelegramId(event.target.value.replace(/[^0-9]/g, "").slice(0, 20)); setRetryKey(""); }} maxLength={20} inputMode="numeric" placeholder="Customer Telegram user ID"/><small className="text-[10px] leading-snug text-slate-500">The customer must have opened the bot before it can send them a message.</small></label>}
        {customerType === "existing" && selectedCustomerId && !customers.find((customer) => customer.id === selectedCustomerId)?.tgUserId && <p className="mt-1 text-[10px] text-amber-700">This account has no Telegram ID on file, so bot notifications cannot be delivered.</p>}
      </section>
      <label className="relative block py-1"><Search className="absolute left-3 top-4 h-4 w-4 text-slate-400"/><input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedProductId(null); }} placeholder="Search categories or products" className="min-h-11 w-full border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-700"/></label>
      {loading && !products.length ? <div className="flex justify-center border bg-white p-6"><Loader2 className="h-5 w-5 animate-spin"/></div> : <section className="my-2 border border-slate-200 bg-white" aria-label="Live product picker">
        {selectedCategory === null ? <>
          <div className="border-b border-slate-200 px-3 py-2"><strong className="text-xs font-bold uppercase tracking-wide text-slate-700">Choose a category</strong><p className="mt-0.5 text-[10px] text-slate-500">{visibleCategories.length} categories · live catalog</p></div>
          {visibleCategories.length ? <div className="grid max-h-[34vh] grid-cols-3 gap-2 overflow-y-auto p-2" aria-label="Product categories">
            {visibleCategories.map((category) => {
              const count = products.filter((product) => (String(product.category || "General").trim() || "General") === category).length;
              return <button key={category} type="button" onClick={() => { setSelectedCategory(category); setSelectedProductId(null); }} className="flex min-h-[82px] flex-col items-start justify-between border border-slate-200 bg-slate-50 p-2 text-left hover:border-emerald-700 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
                <Package className="h-4 w-4 text-emerald-800"/><span className="line-clamp-2 w-full text-[11px] font-bold leading-tight text-slate-900">{category}</span><span className="font-mono text-[9px] text-slate-500">{count} {count === 1 ? "item" : "items"}</span>
              </button>;
            })}
          </div> : <p className="p-4 text-center text-xs text-slate-500">No matching categories.</p>}
        </> : selectedProduct === null ? <>
          <div className="flex items-center gap-2 border-b border-slate-200 px-2 py-2"><button type="button" onClick={() => { setSelectedCategory(null); setSelectedProductId(null); }} className="serverless-action min-h-9 px-2" aria-label="Back to categories"><ArrowLeft className="h-4 w-4"/></button><div className="min-w-0"><strong className="block truncate text-xs font-bold uppercase tracking-wide">{selectedCategory}</strong><span className="text-[10px] text-slate-500">Choose a product</span></div></div>
          <div className="max-h-[34vh] overflow-y-auto" aria-label={`${selectedCategory} products`}>
            {categoryProducts.length ? categoryProducts.map((product) => <button key={product.id} type="button" onClick={() => setSelectedProductId(product.id)} className="flex min-h-14 w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50">
              <span className="min-w-0"><strong className="block truncate text-xs text-slate-900">{product.name}</strong><small className="font-mono text-[10px] text-slate-500">{productVariants(product).length ? `${productVariants(product).length} options` : `${formatPHP(Number(product.price) || 0)} · ${Number(product.stock) || 0} available`}</small></span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400"/>
            </button>) : <p className="p-4 text-center text-xs text-slate-500">No products in this category match your search.</p>}
          </div>
        </> : <>
          <div className="flex items-center gap-2 border-b border-slate-200 px-2 py-2"><button type="button" onClick={() => setSelectedProductId(null)} className="serverless-action min-h-9 px-2" aria-label={`Back to ${selectedCategory} products`}><ArrowLeft className="h-4 w-4"/></button><div className="min-w-0"><span className="block truncate text-[10px] text-slate-500">{selectedCategory}</span><strong className="block truncate text-xs font-bold">{selectedProduct.name}</strong></div></div>
          {productVariants(selectedProduct).length ? <div className="max-h-[34vh] overflow-y-auto p-2" aria-label={`${selectedProduct.name} available variants`}><p className="px-1 pb-2 text-[10px] text-slate-500">Choose an available option</p><div className="grid grid-cols-2 gap-2">{productVariants(selectedProduct).map((variant) => {
            const stock = Math.max(0, Number(variant.stock) || 0);
            return <button key={String(variant.id)} type="button" disabled={saving || stock < 1} onClick={() => addItem(selectedProduct, variant)} className="flex min-h-[68px] flex-col items-start justify-between border border-slate-200 p-2 text-left hover:border-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-45"><span className="line-clamp-2 text-[11px] font-bold leading-tight">{String(variant.name || variant.id)}</span><span className="w-full font-mono text-[10px] text-slate-600">{formatPHP(Number(variant.price ?? selectedProduct.price) || 0)} <span className="float-right">{stock ? `${stock} left` : "Out of stock"}</span></span></button>;
          })}</div></div> : <div className="p-3"><div className="mb-3 flex items-center justify-between gap-2"><div><strong className="text-xs">{formatPHP(Number(selectedProduct.price) || 0)}</strong><p className="font-mono text-[10px] text-slate-500">{Number(selectedProduct.stock) || 0} available</p></div></div><button type="button" disabled={saving || Number(selectedProduct.stock) < 1} onClick={() => addItem(selectedProduct)} className="serverless-action serverless-action--primary min-h-11 w-full justify-center"><Plus className="h-4 w-4"/>Add to sale</button></div>}
        </>}
      </section>}

      <section className="my-2 border border-slate-200 bg-white" aria-label="Sale cart">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2"><strong className="flex items-center gap-2 text-xs uppercase"><ShoppingCart className="h-4 w-4"/>Current sale</strong><span className="font-mono text-[10px] text-slate-500">{cart.reduce((sum, line) => sum + line.quantity, 0)} items</span></div>
        {cart.map((line) => <div key={line.key} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0"><div className="min-w-0 flex-1"><strong className="block truncate text-[11px]">{line.name}</strong><small className="font-mono text-[10px] text-slate-500">{formatPHP(line.price)} each</small></div><button type="button" aria-label={`Remove one ${line.name}`} onClick={() => changeQuantity(line.key, -1)} className="serverless-action"><Minus className="h-3 w-3"/></button><span className="w-5 text-center font-mono text-xs">{line.quantity}</span><button type="button" aria-label={`Add one ${line.name}`} disabled={line.quantity >= line.stock} onClick={() => changeQuantity(line.key, 1)} className="serverless-action"><Plus className="h-3 w-3"/></button><strong className="w-16 text-right font-mono text-xs">{formatPHP(line.price * line.quantity)}</strong></div>)}
        {!cart.length && <p className="p-3 text-center text-xs text-slate-500">Add products from the live catalog.</p>}
        <div className="flex justify-between bg-slate-50 px-3 py-2 text-xs"><span>Subtotal</span><strong className="font-mono">{formatPHP(subtotal)}</strong></div>
        {total > subtotal && <div className="flex justify-between px-3 py-2 text-xs text-slate-600"><span>Charges and delivery</span><strong className="font-mono">{formatPHP(total - subtotal)}</strong></div>}
      </section>

      <section className="serverless-fields my-2">
        <label className="serverless-field">Customer name<input value={customerName} onChange={(event) => { setCustomerName(event.target.value); setRetryKey(""); }} maxLength={120} placeholder="Name for this order"/></label>
        <label className="serverless-field">Phone (optional)<input value={customerPhone} onChange={(event) => { setCustomerPhone(event.target.value); setRetryKey(""); }} maxLength={40} inputMode="tel" placeholder="Contact number"/></label>
        {mode === "delivery" && <>
          <label className="serverless-field">Delivery address<textarea value={deliveryAddress} onChange={(event) => { setDeliveryAddress(event.target.value); setRetryKey(""); }} maxLength={500} rows={2} placeholder="Street, barangay, city"/></label>
          <label className="serverless-field">Courier<select value={courierId} onChange={(event) => { setCourierId(event.target.value); setRetryKey(""); }}><option value="">Choose courier</option>{couriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.name}</option>)}</select></label>
          <label className="serverless-field">Delivery fee (PHP)<input value={deliveryFee} onChange={(event) => { setDeliveryFee(event.target.value); setRetryKey(""); }} type="number" min="0" step="0.01" inputMode="decimal"/></label>
        </>}
        <label className="serverless-field">Payment received by<select value={paymentMethodName} onChange={(event) => { setPaymentMethodName(event.target.value); setRetryKey(""); }}><option value="Cash">Cash</option>{tenders.map((tender) => <option key={tender.id} value={tender.name}>{tender.name}</option>)}</select></label>
      </section>

      <div className="sticky bottom-0 z-10 mt-2 border border-slate-200 bg-white p-3 shadow-lg">
        <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold uppercase text-slate-600">Amount received</span><strong className="font-mono text-lg">{formatPHP(total)}</strong></div>
        <button type="button" onClick={() => void checkout()} disabled={saving || !cart.length || !customerName.trim() || !total} className="serverless-action serverless-action--primary min-h-12 w-full justify-center">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4"/>}{saving ? "Saving sale…" : "Confirm payment & create order"}</button>
        <p className="mt-2 text-center text-[10px] text-slate-500">Only confirm after payment is received. Stock and orders sync to the Serverless database.</p>
      </div>
      {lastSale && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 p-2 sm:items-center"><section className="w-full max-w-[430px] border border-slate-200 bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label="Sale saved"><div className="flex items-start justify-between"><div><div className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase text-emerald-800"><Check className="h-4 w-4"/>Sale saved</div><h2 className="font-heading text-lg">Order {lastSale.orderNumber}</h2></div><button type="button" onClick={() => setLastSale(null)} className="serverless-action" aria-label="Close"><X className="h-4 w-4"/></button></div><p className="my-3 font-mono text-xl">{formatPHP(lastSale.totalAmount)}</p><p className="mb-3 text-xs text-slate-600">This paid {lastSale.mode === "store" ? "store sale" : "delivery order"} is now in Admin → Orders.</p><button type="button" onClick={() => setLastSale(null)} className="serverless-action serverless-action--primary w-full justify-center">New sale</button></section></div>}
    </>}
  </main>;
}
