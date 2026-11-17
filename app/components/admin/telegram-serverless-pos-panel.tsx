"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Loader2, Minus, Package, Plus, RefreshCw, Search, ShieldCheck, ShoppingCart, Store, Truck, X } from "lucide-react";
import { callServerless, getTelegramServerlessSession } from "@/lib/telegram-serverless-client";
import { isChargeApplicable } from "@/lib/charges";
import { formatPHP } from "@/lib/currency";
import { beginPosCheckoutAttempt, readPosCheckoutAttempt, finishPosCheckoutAttempt, type PosCheckoutAttempt } from '@/lib/pos-checkout-attempt';

type Product = { id: string; name: string; price: number; stock: number; category?: string; imageUrl?: string; isActive?: boolean; variants?: Array<Record<string, any>>; bundleConfig?: { variants?: Array<Record<string, any>> } };
type CartLine = { key: string; productId: string; variantId: string; name: string; price: number; quantity: number; stock: number };
type Customer = { id: string; tgUserId?: string; tgName?: string; tgUsername?: string; phoneNumber?: string; primeMemberId?: string; isBanned?: boolean; storeCredits?: number };
type Courier = { id: string; name: string; isActive?: boolean; calculatedFee?: number; coverageAvailable?: boolean };
type Tender = { id: string; name: string; isActive?: boolean };

function productVariants(product: Product) {
  return Array.isArray(product.variants) ? product.variants : Array.isArray(product.bundleConfig?.variants) ? product.bundleConfig.variants : [];
}

export default function TelegramServerlessPosPanel({ onBack }: { onBack: () => void }) {
  const [authorized, setAuthorized] = useState(false);
  const [staffId,setStaffId]=useState('');
  const [pendingSale,setPendingSale]=useState<PosCheckoutAttempt|null>(null);
  const submissionBusy=useRef(false);
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
  const [destination, setDestination] = useState<{lat:number;lon:number}|null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [addressBusy, setAddressBusy] = useState(false);
  const [deliveryQuote, setDeliveryQuote] = useState<any>(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryPaymentMethod, setDeliveryPaymentMethod] = useState('upon_checkout');
  const [chargeOptions, setChargeOptions] = useState<any[]>([]);
  const [chargeIds, setChargeIds] = useState<string[]>([]);
  const [manualCharges, setManualCharges] = useState<Array<{name:string;type:string;amount:string}>>([]);
  const [promoCode, setPromoCode] = useState('');
  const [discountMode, setDiscountMode] = useState('none');
  const [discountValue, setDiscountValue] = useState('0');
  const [storeCreditsUsed, setStoreCreditsUsed] = useState('0');
  const [bill, setBill] = useState<any>(null);
  const [cashReceived, setCashReceived] = useState('');
  const [workspaceTab, setWorkspaceTab] = useState<'catalog'|'sale'>('catalog');
  const [retryKey, setRetryKey] = useState("");
  const [lastSale, setLastSale] = useState<{ orderNumber: string; totalAmount: number; mode: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [catalog, customerRows, courierRows, paymentRows, chargeRows] = await Promise.all([
        callServerless<Product[]>("getCatalog", {}, 30_000),
        callServerless<Customer[]>("manageCustomers", { action: "list" }, 30_000),
        callServerless<Courier[]>("manageCouriers", { action: "list" }, 30_000),
        callServerless<Tender[]>("managePaymentMethods", { action: "list" }, 30_000),
        callServerless<any[]>("getPublicCharges", {}, 30_000),
      ]);
      if (!Array.isArray(catalog)) throw new Error("The live product catalog response was invalid.");
      setChargeOptions(Array.isArray(chargeRows) ? chargeRows : []);
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
      const id=String(session.tgUserId||'');
      setStaffId(id);
      setPendingSale(readPosCheckoutAttempt(id));
      setAuthorized(true);
    }).catch((err: any) => { if (current) setError(err?.message || "Open PRIME from Telegram to use POS."); })
      .finally(() => { if (current) setCheckingAuth(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => { if (authorized) void load(); }, [authorized, load]);

  useEffect(() => {
    if (!authorized || mode !== 'delivery' || destination || deliveryAddress.trim().length < 3) {setSuggestions([]);return;}
    let active = true;
    const timer = window.setTimeout(async () => {
      setAddressBusy(true);
      try { const result = await callServerless<any>('geoapifyAddress', {action:'autocomplete',text:deliveryAddress},20000); if(active)setSuggestions(result.results || []); }
      catch(err:any) {if(active)setError(err.message || 'Address search failed.');}
      finally {if(active)setAddressBusy(false);}
    },350);
    return () => {active=false;window.clearTimeout(timer);setAddressBusy(false);};
  }, [authorized, mode, deliveryAddress, destination]);
  useEffect(() => {
    setDeliveryQuote(null);
    if (!destination || mode !== 'delivery') return;
    let active=true; setDeliveryBusy(true);
    callServerless<any>('createPosOrder',{action:'deliveryQuote',mode,destination},30000)
      .then(result=>{if(active){setDeliveryQuote(result);setCourierId(result.courier?.id || '');}})
      .catch(err=>{if(active)setError(err.message || 'Delivery quote unavailable.');})
      .finally(()=>{if(active)setDeliveryBusy(false);});
    return ()=>{active=false;};
  },[destination,mode]);
  useEffect(()=>{setStoreCreditsUsed('0');setPromoCode('');},[selectedCustomerId,customerType]);
  const quoteRequest = useMemo(() => ({
    action: 'quote', mode, deliveryFee: 0, destination, courierId, deliveryPaymentMethod,
    customerId: customerType === 'existing' ? selectedCustomerId : '',
    chargeIds, manualCharges, promoCode, discountMode, discountValue: Number(discountValue), storeCreditsUsed: Number(storeCreditsUsed),
    items: cart.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })),
  }), [cart, mode, destination, courierId, deliveryPaymentMethod, customerType, selectedCustomerId, chargeIds, manualCharges, promoCode, discountMode, discountValue, storeCreditsUsed]);
  const quoteKey = JSON.stringify(quoteRequest);

  useEffect(() => {
    if (!authorized || !cart.length || (mode === 'delivery' && (!destination || !courierId))) { setQuoteResult({ key: "", total: 0 }); return; }
    let active = true;
    setQuoteResult({ key: "", total: 0 });
    const timer = window.setTimeout(() => {
      void callServerless<any>("createPosOrder", quoteRequest, 30_000)
        .then((quote) => { if (active) {setBill(quote);setQuoteResult({ key: quoteKey, total: Number(quote.totalAmount) || 0 });setError('');} })
        .catch((err: any) => { if (active) { setBill(null); setQuoteResult({ key: "", total: 0 }); setError(err?.message || "Could not calculate the current POS total."); } });
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
    if(submissionBusy.current)return;
    let attempt:PosCheckoutAttempt|null;
    try {attempt=readPosCheckoutAttempt(staffId);}catch(err:any){setError(err?.message||'Could not restore the pending sale.');return;}
    if(!attempt) {
    if (!cart.length) { setError("Add at least one item to the sale."); return; }
    if (!customerName.trim()) { setError("Enter the customer name."); return; }
    if (customerType === "existing" && !selectedCustomerId) { setError("Select an existing customer or choose New / guest."); return; }
    const notifyTelegramId = customerType === "guest" ? telegramId.trim() : "";
    if (notifyTelegramId && !/^[0-9]{1,20}$/.test(notifyTelegramId)) { setError("Enter a numeric Telegram user ID."); return; }
    if (mode === "delivery" && (!deliveryAddress.trim() || !courierId || !Number.isFinite(Number(deliveryFee)) || Number(deliveryFee) < 0)) {
      setError("Enter the delivery address, choose a courier, and check the delivery fee."); return;
    }
    if(quoteResult.key!==quoteKey){setError('Wait for the current bill.');return;}
    if(paymentMethodName==='Cash' && bill?.payableNow > 0 && (!Number.isFinite(Number(cashReceived)) || Number(cashReceived)<bill.payableNow)){setError('Enter enough cash received to cover the amount due now.');return;}
    if (!window.confirm(`Confirm ${formatPHP(bill?.payableNow ?? total)} received by ${paymentMethodName} and save this ${mode === "store" ? "store sale" : "delivery order"}?`)) return;
    if(quoteResult.key!==quoteKey||!Number.isFinite(total)){setError('Wait for the current sale total before confirming.');return;}
    }
    submissionBusy.current=true;
    setSaving(true); setError(""); setNotice(""); setLastSale(null);
    try {
      if (!window.crypto?.getRandomValues) throw new Error("Secure checkout keys are unavailable on this device.");
      attempt=attempt||beginPosCheckoutAttempt(staffId,{
        ...quoteRequest, action: undefined, mode, customerName: customerName.trim(), customerPhone: customerPhone.trim(), expectedTotal:total, expectedPayableNow:bill?.payableNow,
        customerId: customerType === "existing" ? selectedCustomerId : "",
        telegramId: customerType==='guest'?telegramId.trim():'',
        paymentMethodName, deliveryAddress: deliveryAddress.trim(), courierId,
        deliveryFee: 0,
        items: cart.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })),
      });
      setPendingSale(attempt);
      const result = await callServerless<{ success?: boolean; orderNumber?: string; totalAmount?: number }>('createPosOrder',{...attempt.payload,operationKey:attempt.operationKey},60_000);
      if (!result?.success || !result.orderNumber) throw new Error("The POS did not receive a saved order confirmation.");
      finishPosCheckoutAttempt(staffId,attempt.operationKey);setPendingSale(null);
      setLastSale({ orderNumber: result.orderNumber, totalAmount: Number(result.totalAmount) || 0, mode:attempt.payload.mode });
      setNotice(`Order ${result.orderNumber} saved in the shared Orders list.`);
      setRetryKey("");
      setCart([]); setCustomerName(""); setCustomerPhone(""); setTelegramId(""); setSelectedCustomerId(""); setCustomerType("guest"); setDeliveryAddress(""); setDeliveryFee("0");
      setChargeIds([]);setManualCharges([]);setPromoCode('');setDiscountMode('none');setDiscountValue('0');setStoreCreditsUsed('0');setDestination(null);setDeliveryQuote(null);setCashReceived('');setBill(null);setWorkspaceTab('catalog');
      await load();
    } catch (err: any) {
      const code=String(err?.parameters?.code||err?.code||err?.type||'');
      if(attempt&&code==='POS_CHECKOUT_FAILED') {
        finishPosCheckoutAttempt(staffId,attempt.operationKey);setPendingSale(null);
      }
      setError(err?.message || "Sale confirmation is pending. Retry this sale without collecting payment again.");
    }
    finally { submissionBusy.current=false;setSaving(false); }
  };

  return <main className="serverless-admin-panel mx-auto w-full max-w-[430px] pb-6" aria-label="Point of sale">
    <header className="serverless-panel-header">
      <button type="button" onClick={onBack} className="serverless-action" aria-label="Back to Admin modules"><ArrowLeft className="h-4 w-4"/></button>
      <div className="serverless-panel-header__copy"><h1>Point of Sale</h1><p><ShieldCheck className="mr-1 inline h-3 w-3 text-emerald-700"/>Register · live inventory</p></div>
      <button type="button" onClick={() => void load()} disabled={!authorized || loading || saving} className="serverless-action" aria-label="Refresh POS data"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/></button>
    </header>
    {(error || notice) && <div role={error ? "alert" : "status"} className={`my-2 border p-2 text-xs ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error || notice}</div>}
    {checkingAuth && <div className="my-2 flex justify-center border bg-white p-5"><Loader2 className="h-5 w-5 animate-spin"/></div>}
    {authorized && <>
      {pendingSale&&<section className="my-2 border p-2"><p className="text-xs">An earlier sale is awaiting confirmation. Retry it before starting another sale.</p><button type="button" className="serverless-action" disabled={saving} onClick={()=>void checkout()}>Retry Pending Sale</button></section>}
      <fieldset disabled={saving||Boolean(pendingSale)} className="min-w-0 border-0 p-0">
      <div className="grid grid-cols-2 gap-2 py-2">
        <button type="button" onClick={() => { setMode("store"); setRetryKey(""); }} className={`flex min-h-11 items-center justify-center gap-2 border text-xs font-bold uppercase ${mode === "store" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}><Store className="h-4 w-4"/>Store Sale</button>
        <button type="button" onClick={() => { setMode("delivery"); setRetryKey(""); }} className={`flex min-h-11 items-center justify-center gap-2 border text-xs font-bold uppercase ${mode === "delivery" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}><Truck className="h-4 w-4"/>Delivery</button>
      </div>
      <div className="sticky top-0 z-10 grid grid-cols-2 gap-1 rounded-xl bg-slate-900 p-1 text-sm text-white">
        <button type="button" className={`min-h-11 rounded-lg ${workspaceTab==='catalog'?'bg-white text-slate-900':''}`} onClick={()=>setWorkspaceTab('catalog')}>Catalog</button>
        <button type="button" className={`min-h-11 rounded-lg ${workspaceTab==='sale'?'bg-white text-slate-900':''}`} onClick={()=>setWorkspaceTab('sale')}>Ticket · {cart.reduce((n,l)=>n+l.quantity,0)} items</button>
      </div>
      <div hidden={workspaceTab!=='sale'}>
      <section className="my-2 rounded-xl border border-slate-200 bg-white p-3" aria-label="POS customer">
        <div className="mb-2"><strong className="text-xs font-bold uppercase tracking-wide text-slate-700">Customer</strong><p className="mt-0.5 text-[10px] text-slate-500">Choose an account or enter a Telegram ID for order updates.</p></div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setCustomerType("existing"); setSelectedCustomerId(""); setTelegramId(""); setCustomerName(""); setCustomerPhone(""); setRetryKey(""); }} className={`min-h-10 border px-2 text-[10px] font-bold uppercase ${customerType === "existing" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>Existing Customer</button>
          <button type="button" onClick={() => { setCustomerType("guest"); setSelectedCustomerId(""); setTelegramId(""); setCustomerName(""); setCustomerPhone(""); setRetryKey(""); }} className={`min-h-10 border px-2 text-[10px] font-bold uppercase ${customerType === "guest" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>New / Guest</button>
        </div>
        {customerType === "existing" ? <label className="serverless-field">Select Customer<select value={selectedCustomerId} onChange={(event) => {
          const customer = customers.find((row) => row.id === event.target.value);
          setSelectedCustomerId(event.target.value); setRetryKey("");
          setCustomerName(customer?.tgName || customer?.tgUsername || ""); setCustomerPhone(customer?.phoneNumber || "");
        }}><option value="">Choose a Customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id} disabled={customer.isBanned === true}>{customer.tgName || "Telegram customer"}{customer.tgUsername ? ` · @${customer.tgUsername}` : ""} · {customer.tgUserId || "No Telegram ID"}{customer.isBanned ? " · Restricted" : ""}</option>)}</select></label> : <label className="serverless-field">Telegram ID for Bot Notifications (Optional)<input value={telegramId} onChange={(event) => { setTelegramId(event.target.value.replace(/[^0-9]/g, "").slice(0, 20)); setRetryKey(""); }} maxLength={20} inputMode="numeric" placeholder="Customer Telegram user ID"/><small className="text-[10px] leading-snug text-slate-500">The customer must have opened the bot before it can send them a message.</small></label>}
        {customerType === "existing" && selectedCustomerId && !customers.find((customer) => customer.id === selectedCustomerId)?.tgUserId && <p className="mt-1 text-[10px] text-amber-700">This account has no Telegram ID on file, so bot notifications cannot be delivered.</p>}
      </section>
      </div>
      <div hidden={workspaceTab!=='catalog'}>
      <label className="serverless-search my-2"><Search aria-hidden="true" className="h-4 w-4"/><input aria-label="Search categories or products" value={search} onChange={(event) => { setSearch(event.target.value); setSelectedProductId(null); }} placeholder="Search categories or products"/></label>
      {loading && !products.length ? <div className="flex justify-center border bg-white p-6"><Loader2 className="h-5 w-5 animate-spin"/></div> : <section className="my-2 border border-slate-200 bg-white" aria-label="Live product picker">
        {selectedCategory === null ? <>
          <div className="border-b border-slate-200 px-3 py-2"><strong className="text-xs font-bold uppercase tracking-wide text-slate-700">Choose a Category</strong><p className="mt-0.5 text-[10px] text-slate-500">{visibleCategories.length} categories · live catalog</p></div>
          {visibleCategories.length ? <div className="grid max-h-[34vh] grid-cols-3 gap-2 overflow-y-auto p-2" aria-label="Product categories">
            {visibleCategories.map((category) => {
              const count = products.filter((product) => (String(product.category || "General").trim() || "General") === category).length;
              return <button key={category} type="button" onClick={() => { setSelectedCategory(category); setSelectedProductId(null); }} className="flex min-h-[82px] flex-col items-start justify-between border border-slate-200 bg-slate-50 p-2 text-left hover:border-emerald-700 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
                <Package className="h-4 w-4 text-emerald-800"/><span className="line-clamp-2 w-full text-[11px] font-bold leading-tight text-slate-900">{category}</span><span className="font-mono text-[9px] text-slate-500">{count} {count === 1 ? "item" : "items"}</span>
              </button>;
            })}
          </div> : <p className="p-4 text-center text-xs text-slate-500">No matching categories.</p>}
        </> : selectedProduct === null ? <>
          <div className="flex items-center gap-2 border-b border-slate-200 px-2 py-2"><button type="button" onClick={() => { setSelectedCategory(null); setSelectedProductId(null); }} className="serverless-action min-h-9 px-2" aria-label="Back to categories"><ArrowLeft className="h-4 w-4"/></button><div className="min-w-0"><strong className="block truncate text-xs font-bold uppercase tracking-wide">{selectedCategory}</strong><span className="text-[10px] text-slate-500">Choose a Product</span></div></div>
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
          })}</div></div> : <div className="p-3"><div className="mb-3 flex items-center justify-between gap-2"><div><strong className="text-xs">{formatPHP(Number(selectedProduct.price) || 0)}</strong><p className="font-mono text-[10px] text-slate-500">{Number(selectedProduct.stock) || 0} available</p></div></div><button type="button" disabled={saving || Number(selectedProduct.stock) < 1} onClick={() => addItem(selectedProduct)} className="serverless-action serverless-action--primary min-h-11 w-full justify-center"><Plus className="h-4 w-4"/>Add to Sale</button></div>}
        </>}
      </section>}

      <button type="button" onClick={()=>setWorkspaceTab('sale')} className="serverless-action serverless-action--primary my-2 min-h-12 w-full justify-between">Review ticket <span className="font-mono">{cart.reduce((n,l)=>n+l.quantity,0)} items · {formatPHP(subtotal)}</span></button>
      </div>
      <div hidden={workspaceTab!=='sale'}>
      <section className="my-2 rounded-xl border border-slate-200 bg-white" aria-label="Sale cart">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2"><strong className="flex items-center gap-2 text-xs uppercase"><ShoppingCart className="h-4 w-4"/>Current Sale</strong><span className="font-mono text-[10px] text-slate-500">{cart.reduce((sum, line) => sum + line.quantity, 0)} Items</span></div>
        {cart.map((line) => <div key={line.key} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0"><div className="min-w-0 flex-1"><strong className="block truncate text-[11px]">{line.name}</strong><small className="font-mono text-[10px] text-slate-500">{formatPHP(line.price)} each</small></div><button type="button" aria-label={`Remove one ${line.name}`} onClick={() => changeQuantity(line.key, -1)} className="serverless-action"><Minus className="h-3 w-3"/></button><span className="w-5 text-center font-mono text-xs">{line.quantity}</span><button type="button" aria-label={`Add one ${line.name}`} disabled={line.quantity >= line.stock} onClick={() => changeQuantity(line.key, 1)} className="serverless-action"><Plus className="h-3 w-3"/></button><strong className="w-16 text-right font-mono text-xs">{formatPHP(line.price * line.quantity)}</strong></div>)}
        {!cart.length && <p className="p-3 text-center text-xs text-slate-500">Add products from the live catalog.</p>}
        <div className="flex justify-between bg-slate-50 px-3 py-2 text-xs"><span>Subtotal</span><strong className="font-mono">{formatPHP(subtotal)}</strong></div>

      </section>

      <section className="serverless-fields my-2">
        <label className="serverless-field">Customer Name<input value={customerName} onChange={(event) => { setCustomerName(event.target.value); setRetryKey(""); }} maxLength={120} placeholder="Name for this order"/></label>
        <label className="serverless-field">Phone (Optional)<input value={customerPhone} onChange={(event) => { setCustomerPhone(event.target.value); setRetryKey(""); }} maxLength={40} inputMode="tel" placeholder="Contact number"/></label>
        {mode === "delivery" && <>
          <label className="serverless-field">Delivery address<input value={deliveryAddress} onChange={event=>{setDeliveryAddress(event.target.value);setDestination(null);setCourierId('');setDeliveryQuote(null);}} maxLength={240} placeholder="Search street, building or barangay"/></label>
          {addressBusy && <p role="status" className="text-xs">Searching addresses…</p>}
          {suggestions.length>0 && <div className="max-h-48 overflow-auto rounded-lg border bg-white">{suggestions.map((item,index)=><button key={index} type="button" className="block min-h-11 w-full border-b p-3 text-left text-xs" onClick={()=>{setDeliveryAddress(item.formatted);setDestination({lat:Number(item.lat),lon:Number(item.lon)});setSuggestions([]);}}>{item.formatted}</button>)}</div>}
          {destination && <p className="font-mono text-xs text-emerald-700">Address selected · {destination.lat.toFixed(5)}, {destination.lon.toFixed(5)}</p>}
          {deliveryBusy && <p role="status" className="text-xs">Calculating courier rates…</p>}
          {deliveryQuote && <><p className="font-mono text-xs text-slate-500">{deliveryQuote.distanceKm} km · {deliveryQuote.routeTimeMinutes ? `${deliveryQuote.routeTimeMinutes} min` : 'Travel time unavailable'}{deliveryQuote.estimated ? ' · Estimated route' : ''}</p>
          <label className="serverless-field">Courier<select value={courierId} onChange={event=>setCourierId(event.target.value)}><option value="">Choose courier</option>{(deliveryQuote.couriers || []).map((courier:Courier)=><option key={courier.id} value={courier.id} disabled={courier.coverageAvailable===false}>{courier.name} · {courier.coverageAvailable===false?'Outside coverage':formatPHP(Number(courier.calculatedFee))}</option>)}</select></label></>}
          <label className="serverless-field">Delivery fee collection<select value={deliveryPaymentMethod} onChange={event=>setDeliveryPaymentMethod(event.target.value)}><option value="upon_checkout">Collect at checkout</option><option value="upon_delivery">Customer pays courier on delivery</option></select></label>

        </>}
      </section>
      <section className="my-2 space-y-3 rounded-xl border bg-white p-3" aria-label="Bill adjustments">
        <h2 className="font-heading text-lg">Charges & savings</h2>
        <p className="text-xs text-slate-500">Default and scheduled charges apply automatically. Select extra configured charges below.</p>
        <div className="space-y-2">{chargeOptions.map(c=><label key={c.id} className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" disabled={isChargeApplicable(c)} checked={isChargeApplicable(c)||chargeIds.includes(c.id)} onChange={event=>setChargeIds(ids=>event.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id))}/><span>{c.name}{isChargeApplicable(c)?' (automatic)':''} · {c.type==='percentage'?`${c.rate}%`:formatPHP(Number(c.rate))}</span></label>)}</div>
        {manualCharges.map((c,index)=><div key={index} className="space-y-2 rounded-lg bg-slate-50 p-2"><label className="serverless-field">Charge name<input value={c.name} maxLength={100} onChange={event=>setManualCharges(rows=>rows.map((row,i)=>i===index?{...row,name:event.target.value}:row))}/></label><div className="grid grid-cols-2 gap-2"><label className="serverless-field">Type<select value={c.type} onChange={event=>setManualCharges(rows=>rows.map((row,i)=>i===index?{...row,type:event.target.value}:row))}><option value="fixed">PHP</option><option value="percentage">Percent</option></select></label><label className="serverless-field">Amount<input type="number" min="0" step="0.01" value={c.amount} onChange={event=>setManualCharges(rows=>rows.map((row,i)=>i===index?{...row,amount:event.target.value}:row))}/></label></div><button type="button" className="serverless-action" onClick={()=>setManualCharges(rows=>rows.filter((_,i)=>i!==index))}>Remove charge</button></div>)}
        <button type="button" className="serverless-action min-h-10" disabled={manualCharges.length>=20} onClick={()=>setManualCharges(rows=>[...rows,{name:'Additional service',type:'fixed',amount:'0'}])}><Plus className="h-4 w-4"/>Manual charge</button>
        <div className="grid grid-cols-2 gap-2"><label className="serverless-field">Staff discount<select value={discountMode} onChange={event=>setDiscountMode(event.target.value)}><option value="none">None</option><option value="fixed">PHP amount</option><option value="percentage">Percentage</option></select></label>{discountMode!=='none' && <label className="serverless-field">Discount value<input type="number" min="0" step="0.01" max={discountMode==='percentage'?100:undefined} value={discountValue} onChange={event=>setDiscountValue(event.target.value)}/></label>}</div>
        {customerType==='existing' && selectedCustomerId ? <><label className="serverless-field">Voucher code<input value={promoCode} onChange={event=>setPromoCode(event.target.value.toUpperCase())} placeholder="Enter voucher code" maxLength={100}/></label><label className="serverless-field">Store Credits to apply<input type="number" min="0" step="0.01" value={storeCreditsUsed} onChange={event=>setStoreCreditsUsed(event.target.value)}/><small className="font-mono">Available: {formatPHP(Number(customers.find(c=>c.id===selectedCustomerId)?.storeCredits)||0)} · Applied: {formatPHP(bill?.creditsUsed || 0)}</small></label></>:<p className="text-xs text-slate-500">Select an existing customer to use their vouchers and Store Credits.</p>}
      </section>
      <section className="serverless-fields my-2">
        <label className="serverless-field">Payment Received By<select value={paymentMethodName} onChange={(event) => { setPaymentMethodName(event.target.value); setRetryKey(""); }}><option value="Cash">Cash</option>{tenders.map((tender) => <option key={tender.id} value={tender.name}>{tender.name}</option>)}</select></label>
      </section>

      <div className="mt-2 border border-slate-200 bg-white p-3">
        <h2 className="mb-3 font-heading text-lg">Payment</h2>
        {quoteResult.key===quoteKey && bill ? <div className="mb-3 space-y-2 text-xs font-mono">
          <div className="flex justify-between"><span>Items</span><span>{formatPHP(bill.cart.subtotal)}</span></div>
          {bill.chargeResult.computedCharges.map((c:any)=><div key={c.id} className="flex justify-between gap-2"><span>{c.name}</span><span>{formatPHP(c.computedAmount)}</span></div>)}
          {bill.cart.items.filter((item:any)=>item.isFree).map((item:any)=><div key={item.id} className="flex justify-between text-emerald-700"><span>{item.name}</span><span>Free</span></div>)}
          {bill.rewardPointsAmount>0 && <div className="text-slate-500">{bill.rewardPointsAmount} points pending completion</div>}
          {bill.deliveryFee>0 && <div className="flex justify-between"><span>Delivery</span><span>{formatPHP(bill.deliveryFee)}</span></div>}
          {[['Voucher',bill.promoDiscount],['Delivery voucher',bill.shippingSubsidy],['Staff discount',bill.staffDiscount],['Store Credits',bill.creditsUsed]].map(([label,value])=>Number(value)>0?<div key={String(label)} className="flex justify-between text-emerald-700"><span>{label}</span><span>−{formatPHP(Number(value))}</span></div>:null)}
          <div className="flex justify-between border-t pt-2 text-lg"><span>Due now</span><strong>{formatPHP(bill.payableNow)}</strong></div>
          {bill.payableOnDelivery>0 && <div className="flex justify-between text-amber-800"><span>Due to courier on delivery</span><strong>{formatPHP(bill.payableOnDelivery)}</strong></div>}
        </div>:<p className="mb-3 text-xs text-slate-500">{cart.length?'Waiting for a valid bill…':'Add items to start a sale.'}</p>}
        {paymentMethodName==='Cash' && <label className="serverless-field mb-3">Cash received<input type="number" min="0" step="0.01" value={cashReceived} onChange={event=>setCashReceived(event.target.value)}/><small className="font-mono">Change: {formatPHP(Math.max(0,Number(cashReceived)-(bill?.payableNow || 0)))}</small></label>}
        <button type="button" onClick={() => void checkout()} disabled={saving || !cart.length || !customerName.trim() || quoteResult.key!==quoteKey} className="serverless-action serverless-action--primary min-h-12 w-full justify-center">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4"/>}{saving ? "Saving sale…" : "Confirm Payment & Create Order"}</button>
        <p className="mt-2 text-center text-[10px] text-slate-500">Only confirm after payment is received. Stock and orders sync to the Serverless database.</p>
      </div>
      </div>
      {lastSale && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 p-2 sm:items-center"><section className="w-full max-w-[430px] border border-slate-200 bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label="Sale saved"><div className="flex items-start justify-between"><div><div className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase text-emerald-800"><Check className="h-4 w-4"/>Sale saved</div><h2 className="font-heading text-lg">Order {lastSale.orderNumber}</h2></div><button type="button" onClick={() => setLastSale(null)} className="serverless-action" aria-label="Close"><X className="h-4 w-4"/></button></div><p className="my-3 font-mono text-xl">{formatPHP(lastSale.totalAmount)}</p><p className="mb-3 text-xs text-slate-600">This {lastSale.mode === "store" ? "store sale" : "delivery order"} is now in Admin → Orders.</p><button type="button" onClick={() => setLastSale(null)} className="serverless-action serverless-action--primary w-full justify-center">New Sale</button></section></div>}
      </fieldset>
    </>}
  </main>;
}
