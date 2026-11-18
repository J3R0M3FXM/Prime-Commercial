"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Loader2, Minus, Plus, RefreshCw, Search, ShoppingCart, Store, Truck, X } from "lucide-react";
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
  const [workspaceTab, setWorkspaceTab] = useState<'catalog'|'sale'|'payment'>('catalog');
  const [retryKey, setRetryKey] = useState("");
  const [lastSale, setLastSale] = useState<{ orderNumber: string; totalAmount: number; mode: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const request = async (label: string, name: string, input: Record<string, any>, apply: (rows: any[]) => void) => {
        try {
          const rows = await callServerless<any[]>(name, input, 30_000);
          if (!Array.isArray(rows)) throw new Error('Invalid response.');
          apply(rows);
        } catch (err: any) {
          throw new Error(`${label}: ${err?.message || 'Could not load data.'} Use Refresh to retry.`);
        }
      };
      const results = await Promise.allSettled([
        request('Products', 'getCatalog', {}, rows => setProducts(rows.filter(row => row.isActive !== false))),
        request('Customers', 'manageCustomers', { action: 'posList' }, setCustomers),
        request('Couriers', 'manageCouriers', { action: 'list' }, rows => setCouriers(rows.filter(row => row.isActive !== false))),
        request('Payment methods', 'managePaymentMethods', { action: 'list' }, rows => setTenders(rows.filter(row => row.isActive !== false))),
        request('Charges', 'getPublicCharges', {}, setChargeOptions),
      ]);
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failures.length) throw new Error(failures.map(result => result.reason.message).join(' '));
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
    if (!destination || mode !== 'delivery') {setDeliveryBusy(false);return;}
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

  const panelRef = useRef<HTMLElement | null>(null);
  const goTo = (tab: 'catalog' | 'sale' | 'payment') => {
    setWorkspaceTab(tab);
    if (panelRef.current) panelRef.current.scrollTop = 0;
  };
  const goToPayment = () => {
    if (!cart.length) { goTo('catalog'); return; }
    if (!customerName.trim() || (customerType === 'existing' && !selectedCustomerId)) {
      setError('Add the customer details before payment.'); goTo('sale'); return;
    }
    if (mode === 'delivery' && (!destination || !courierId)) {
      setError('Select a delivery address and courier before payment.'); goTo('sale'); return;
    }
    setError(''); goTo('payment');
  };
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const currentBill = quoteResult.key === quoteKey ? bill : null;
  const account = customerType === 'existing' ? customers.find(customer => customer.id === selectedCustomerId) : null;
  const matchingProducts = products.filter(product => (!selectedCategory || (String(product.category || 'General').trim() || 'General') === selectedCategory) &&
    (!normalizedSearch || `${product.name} ${productVariants(product).map(variant => variant.name || '').join(' ')}`.toLowerCase().includes(normalizedSearch)));
  const activeProduct = products.find(product => product.id === selectedProductId);
  const automaticCharges = chargeOptions.filter(charge => isChargeApplicable(charge));
  const optionalCharges = chargeOptions.filter(charge => !isChargeApplicable(charge));
  const savingsCount = (discountMode !== 'none' ? 1 : 0) + (promoCode.trim() ? 1 : 0) + (Number(storeCreditsUsed) > 0 ? 1 : 0);

  return <main ref={panelRef} className="serverless-admin-panel serverless-pos-panel mx-auto w-full max-w-[430px]" aria-label="Point of sale">
    <header className="serverless-panel-header pos-header">
      <button type="button" onClick={onBack} className="pos-icon" aria-label="Back to Admin modules"><ArrowLeft/></button>
      <div className="serverless-panel-header__copy"><h1>Point of Sale</h1><p>{mode === 'delivery' ? 'Delivery' : 'Store sale'} · {itemCount} {itemCount === 1 ? 'item' : 'items'}</p></div>
      <button type="button" onClick={() => void load()} disabled={!authorized || loading || saving} className="pos-icon" aria-label="Refresh POS data"><RefreshCw className={loading ? 'animate-spin' : ''}/></button>
    </header>
    {(error || notice) && <div role={error ? 'alert' : 'status'} className={`pos-message ${error ? 'pos-message--error' : ''}`}>{error || notice}</div>}
    {checkingAuth && <div className="pos-empty"><Loader2 className="animate-spin"/><p>Opening register…</p></div>}
    {authorized && <>
      {pendingSale && <section className="pos-message" aria-label="Pending sale"><p>This sale is awaiting confirmation. Retry before collecting another payment.</p><button type="button" className="pos-primary" disabled={saving} onClick={() => void checkout()}>Retry Pending Sale</button></section>}
      <fieldset disabled={saving || Boolean(pendingSale)} className="pos-workspace">
        <nav className="pos-tabs" aria-label="POS workspace">
          <button type="button" aria-current={workspaceTab === 'catalog' ? 'step' : undefined} onClick={() => goTo('catalog')}>Catalog</button>
          <button type="button" aria-current={workspaceTab === 'sale' ? 'step' : undefined} onClick={() => goTo('sale')}>Ticket <span>{itemCount}</span></button>
          <button type="button" aria-current={workspaceTab === 'payment' ? 'step' : undefined} disabled={!cart.length} onClick={goToPayment}>Payment</button>
        </nav>

        <div hidden={workspaceTab !== 'catalog'} className="pos-page" aria-label="Catalog workspace">
          <label className="pos-search"><Search/><input aria-label="Search products" value={search} onChange={event => {setSearch(event.target.value);setSelectedProductId(null);}} placeholder="Search products"/></label>
          <div className="pos-categories" aria-label="Product categories">
            <button type="button" aria-pressed={!selectedCategory} onClick={() => {setSelectedCategory(null);setSelectedProductId(null);}}>All</button>
            {categories.map(category => <button key={category} type="button" aria-pressed={selectedCategory === category} onClick={() => {setSelectedCategory(category);setSelectedProductId(null);}}>{category}</button>)}
          </div>
          {loading && !products.length ? <div className="pos-empty"><Loader2 className="animate-spin"/><p>Loading products…</p></div> : activeProduct && productVariants(activeProduct).length ? <section className="pos-card" aria-label="Product options">
            <div className="pos-card-heading"><button type="button" className="pos-icon" onClick={() => setSelectedProductId(null)} aria-label="Back to products"><ArrowLeft/></button><h2>{activeProduct.name}</h2></div>
            <div className="pos-product-list">{productVariants(activeProduct).map(variant => {
              const stock = Math.max(0, Number(variant.stock) || 0);
              return <button key={String(variant.id)} type="button" className="pos-product" disabled={stock < 1} onClick={() => addItem(activeProduct, variant)}><span><strong>{String(variant.name || variant.id)}</strong><small>{stock ? `${stock} available` : 'Out of stock'}</small></span><span className="pos-product-price">{formatPHP(Number(variant.price ?? activeProduct.price) || 0)}<Plus/></span></button>;
            })}</div>
          </section> : <section className="pos-card" aria-label="Live product picker">
            <div className="pos-card-heading"><h2>{selectedCategory || 'Products'}</h2><small>{matchingProducts.length} available</small></div>
            <div className="pos-product-list">{matchingProducts.map(product => {
              const variants = productVariants(product);
              const stock = Math.max(0, Number(product.stock) || 0);
              return <button type="button" key={product.id} className="pos-product" disabled={!variants.length && stock < 1} onClick={() => variants.length ? setSelectedProductId(product.id) : addItem(product)}>
                <span><strong>{product.name}</strong><small>{variants.length ? `${variants.length} options` : stock ? `${stock} available` : 'Out of stock'}</small></span>
                <span className="pos-product-price">{variants.length ? 'Choose' : formatPHP(Number(product.price) || 0)}{variants.length ? <ChevronRight/> : <Plus/>}</span>
              </button>;
            })}</div>
            {!matchingProducts.length && <p className="pos-hint pos-empty">No matching products.</p>}
          </section>}
          <div className="pos-footer"><div><small>Current sale</small><strong className="font-mono">{formatPHP(subtotal)}</strong></div><button type="button" className="pos-primary" disabled={!cart.length} onClick={() => goTo('sale')}>Review ticket <ChevronRight/></button></div>
        </div>

        <div hidden={workspaceTab !== 'sale'} className="pos-page" aria-label="Ticket workspace">
          {!cart.length ? <div className="pos-empty"><ShoppingCart/><h2>Your ticket is empty</h2><p>Add products to start a sale.</p><button type="button" className="pos-primary" onClick={() => goTo('catalog')}>Browse catalog</button></div> : <>
            <section className="pos-card" aria-label="Sale cart">
              <div className="pos-card-heading"><h2>Current sale</h2><button type="button" className="pos-text-action" onClick={() => goTo('catalog')}>Add items <Plus/></button></div>
              {cart.map(line => <div key={line.key} className="pos-cart-line"><div className="pos-line-copy"><strong>{line.name}</strong><small>{formatPHP(line.price)} each</small></div><div className="pos-quantity"><button type="button" aria-label={`Remove one ${line.name}`} onClick={() => changeQuantity(line.key, -1)}><Minus/></button><span>{line.quantity}</span><button type="button" aria-label={`Add one ${line.name}`} disabled={line.quantity >= line.stock} onClick={() => changeQuantity(line.key, 1)}><Plus/></button></div><strong className="pos-line-total font-mono">{formatPHP(line.price * line.quantity)}</strong></div>)}
              <div className="pos-totals-row pos-subtotal"><span>Items subtotal</span><strong>{formatPHP(subtotal)}</strong></div>
            </section>

            <section className="pos-card" aria-label="POS customer">
              <div className="pos-card-heading"><h2>Customer</h2>{account && <small>Account linked</small>}</div>
              <div className="pos-card-body">
                <div className="pos-choice" aria-label="Customer type">
                  <button type="button" aria-pressed={customerType === 'guest'} onClick={() => {if(customerType==='guest')return;setCustomerType('guest');setSelectedCustomerId('');setTelegramId('');setCustomerName('');setCustomerPhone('');}}>New / Guest</button>
                  <button type="button" aria-pressed={customerType === 'existing'} onClick={() => {if(customerType==='existing')return;setCustomerType('existing');setSelectedCustomerId('');setTelegramId('');setCustomerName('');setCustomerPhone('');}}>Existing Customer</button>
                </div>
                {customerType === 'existing' && <label className="pos-field">Customer Account<select value={selectedCustomerId} onChange={event => {const customer=customers.find(row=>row.id===event.target.value);setSelectedCustomerId(event.target.value);setCustomerName(customer?.tgName || customer?.tgUsername || '');setCustomerPhone(customer?.phoneNumber || '');}}><option value="">Choose a customer</option>{customers.map(customer => <option key={customer.id} value={customer.id} disabled={customer.isBanned}>{customer.tgName || customer.tgUsername || 'Telegram customer'} · {customer.primeMemberId || customer.tgUserId || customer.id}{customer.isBanned ? ' · Restricted' : ''}</option>)}</select></label>}
                <div className="pos-contact-fields"><label className="pos-field">Customer Name<input value={customerName} onChange={event=>setCustomerName(event.target.value)} maxLength={120} placeholder="Name for the order" autoComplete="name"/></label><label className="pos-field">Phone <small>Optional</small><input value={customerPhone} onChange={event=>setCustomerPhone(event.target.value)} maxLength={40} inputMode="tel" autoComplete="tel" placeholder="Contact number"/></label></div>
                {customerType === 'guest' ? <details className="pos-inline-details"><summary>Telegram order updates <span>Optional</span></summary><label className="pos-field">Telegram user ID<input value={telegramId} onChange={event=>setTelegramId(event.target.value.replace(/[^0-9]/g,'').slice(0,20))} inputMode="numeric" maxLength={20} placeholder="Numeric Telegram ID"/><small>The customer must have opened the bot.</small></label></details> : account && !account.tgUserId && <p className="pos-hint">This account has no Telegram ID for order updates.</p>}
              </div>
            </section>

            <section className="pos-card" aria-label="POS fulfilment">
              <div className="pos-card-heading"><h2>Fulfilment</h2></div>
              <div className="pos-card-body">
                <div className="pos-choice" aria-label="Sale type"><button type="button" aria-pressed={mode==='store'} onClick={()=>setMode('store')}><Store/>Store sale</button><button type="button" aria-pressed={mode==='delivery'} onClick={()=>setMode('delivery')}><Truck/>Delivery</button></div>
                {mode === 'delivery' && <div className="pos-delivery-fields">
                  <div className="pos-address-search">
                    <label className="pos-field" htmlFor="pos-delivery-address">Delivery Address</label>
                    <input id="pos-delivery-address" className="pos-address-input" value={deliveryAddress} onChange={event=>{setDeliveryAddress(event.target.value);setDestination(null);setCourierId('');setDeliveryQuote(null);}} maxLength={240} placeholder="Search street, building or barangay" autoComplete="off" aria-controls="pos-address-results" aria-expanded={suggestions.length>0}/>
                    {addressBusy && <p role="status" className="pos-hint">Searching addresses…</p>}
                    {suggestions.length>0 && <div id="pos-address-results" className="pos-address-results" aria-label="Address suggestions">{suggestions.map((item,index)=><button type="button" className="prime-address-suggestion" key={index} onClick={()=>{setDeliveryAddress(item.formatted);setDestination({lat:Number(item.lat),lon:Number(item.lon)});setSuggestions([]);}}>{item.formatted}<ChevronRight/></button>)}</div>}
                    {destination && <p className="pos-address-selected"><Check/>Address selected</p>}
                  </div>
                  {deliveryBusy && <p role="status" className="pos-hint">Calculating courier rates…</p>}
                  <div className="pos-field-grid">{deliveryQuote && <><label className="pos-field">Courier<select value={courierId} onChange={event=>setCourierId(event.target.value)}><option value="">Choose Courier</option>{(deliveryQuote.couriers || []).map((courier:Courier)=><option key={courier.id} value={courier.id} disabled={courier.coverageAvailable===false}>{courier.name} · {courier.coverageAvailable===false?'Outside coverage':formatPHP(Number(courier.calculatedFee))}</option>)}</select></label></>}
                  <label className="pos-field">Collect Delivery Fee<select value={deliveryPaymentMethod} onChange={event=>setDeliveryPaymentMethod(event.target.value)}><option value="upon_checkout">At Checkout</option><option value="upon_delivery">On Delivery · Pay Courier</option></select></label>
                  </div>
                  {deliveryQuote && <p className="pos-hint font-mono">{deliveryQuote.distanceKm} km{deliveryQuote.routeTimeMinutes?` · ${deliveryQuote.routeTimeMinutes} min`:''}{deliveryQuote.estimated?' · Estimated route':''}</p>}
                </div>}
              </div>
            </section>
            <button type="button" className="pos-primary pos-wide" onClick={goToPayment}>Continue to payment <ChevronRight/></button>
          </>}
        </div>

        <div hidden={workspaceTab !== 'payment'} className="pos-page" aria-label="Payment workspace">
          {cart.length>0 && <>
            <section className="pos-card pos-receipt" aria-label="Sale summary">
              <div className="pos-card-heading"><div><h2>{customerName || 'Current sale'}</h2><small>{mode==='delivery'?'Delivery':'Store sale'} · {itemCount} {itemCount===1?'item':'items'}</small></div><button type="button" className="pos-text-action" onClick={()=>goTo('sale')}>Edit ticket</button></div>
              {currentBill ? <div className="pos-card-body">
                <div className="pos-totals-row"><span>Items subtotal</span><span>{formatPHP(currentBill.cart.subtotal)}</span></div>
                <details className="pos-receipt-charges"><summary><span>Charges <small>{currentBill.chargeResult.computedCharges.length}</small></span><span>{formatPHP(currentBill.chargeResult.totalChargesAmount || 0)}</span></summary><div>{currentBill.chargeResult.computedCharges.map((charge:any)=><div key={charge.id} className="pos-totals-row"><span>{charge.name}</span><span>{formatPHP(charge.computedAmount)}</span></div>)}</div></details>
                {currentBill.deliveryFee>0 && <div className="pos-totals-row"><span>Delivery</span><span>{formatPHP(currentBill.deliveryFee)}</span></div>}
                {[['Voucher',currentBill.promoDiscount],['Delivery voucher',currentBill.shippingSubsidy],['Staff discount',currentBill.staffDiscount],['Store Credits',currentBill.creditsUsed]].map(([label,value])=>Number(value)>0?<div key={String(label)} className="pos-totals-row pos-saving"><span>{label}</span><span>−{formatPHP(Number(value))}</span></div>:null)}
                {currentBill.cart.items.filter((item:any)=>item.isFree).map((item:any)=><div key={item.id} className="pos-totals-row pos-saving"><span>{item.name}</span><span>Free</span></div>)}
                <div className="pos-due"><span>Due now</span><strong>{formatPHP(currentBill.payableNow)}</strong></div>
                {currentBill.payableOnDelivery>0 && <div className="pos-courier-due"><span>Pay courier on delivery</span><strong>{formatPHP(currentBill.payableOnDelivery)}</strong></div>}
              </div>:<p className="pos-card-body pos-hint" role="status">Updating bill…</p>}
            </section>

            <div className="pos-adjustments" aria-label="Bill adjustments">
              <details className="pos-card pos-disclosure" aria-label="Charges editor"><summary><span>Charges</span><small>{chargeIds.length+manualCharges.length ? `${chargeIds.length+manualCharges.length} added` : `${automaticCharges.length} automatic`}</small><ChevronRight/></summary><div className="pos-card-body">
                {automaticCharges.length>0 && <div className="pos-automatic-charges"><p className="pos-hint">Included automatically</p>{automaticCharges.map(charge=><div key={charge.id} className="pos-totals-row"><span>{charge.name}</span><span>{charge.type==='percentage'?`${charge.rate}%`:formatPHP(Number(charge.rate))}</span></div>)}</div>}
                {optionalCharges.map(charge=><label key={charge.id} className="pos-charge-option"><input type="checkbox" checked={chargeIds.includes(charge.id)} onChange={event=>setChargeIds(ids=>event.target.checked?[...ids,charge.id]:ids.filter(id=>id!==charge.id))}/><span>{charge.name}</span><small>{charge.type==='percentage'?`${charge.rate}%`:formatPHP(Number(charge.rate))}</small></label>)}
                {manualCharges.map((charge,index)=><div key={index} className="pos-manual-charge"><div className="pos-card-heading"><span>Manual Charge {index+1}</span><button type="button" className="pos-icon" aria-label={`Remove manual charge ${index+1}`} onClick={()=>setManualCharges(rows=>rows.filter((_,i)=>i!==index))}><X/></button></div><div className="pos-field-grid pos-field-grid--three"><label className="pos-field">Charge Name<input value={charge.name} maxLength={100} onChange={event=>setManualCharges(rows=>rows.map((row,i)=>i===index?{...row,name:event.target.value}:row))}/></label><label className="pos-field">Type<select value={charge.type} onChange={event=>setManualCharges(rows=>rows.map((row,i)=>i===index?{...row,type:event.target.value}:row))}><option value="fixed">PHP Amount</option><option value="percentage">Percentage</option></select></label><label className="pos-field">Amount<input type="number" min="0" step="0.01" inputMode="decimal" value={charge.amount} onChange={event=>setManualCharges(rows=>rows.map((row,i)=>i===index?{...row,amount:event.target.value}:row))}/></label></div></div>)}
                <button type="button" className="pos-secondary pos-wide" disabled={manualCharges.length>=20} onClick={()=>setManualCharges(rows=>[...rows,{name:'Additional service',type:'fixed',amount:'0'}])}><Plus/>Add Manual Charge</button>
              </div></details>
              <details className="pos-card pos-disclosure" aria-label="Savings editor"><summary><span>Discounts & Credits</span><small>{savingsCount ? `${savingsCount} selected` : 'Optional'}</small><ChevronRight/></summary><div className="pos-card-body">
                <div className="pos-field-grid"><label className="pos-field">Staff Discount<select value={discountMode} onChange={event=>setDiscountMode(event.target.value)}><option value="none">None</option><option value="fixed">PHP Amount</option><option value="percentage">Percentage</option></select></label>{discountMode!=='none' && <label className="pos-field">Discount Value<input type="number" min="0" step="0.01" inputMode="decimal" max={discountMode==='percentage'?100:undefined} value={discountValue} onChange={event=>setDiscountValue(event.target.value)}/></label>}
                {account ? <><label className="pos-field">Voucher Code<input value={promoCode} onChange={event=>setPromoCode(event.target.value.toUpperCase())} placeholder="Enter voucher code" maxLength={100}/></label><label className="pos-field">Store Credits to Apply<input type="number" min="0" step="0.01" inputMode="decimal" value={storeCreditsUsed} onChange={event=>setStoreCreditsUsed(event.target.value)}/><small className="font-mono">Available: {formatPHP(Number(account.storeCredits)||0)} · Applied: {formatPHP(currentBill?.creditsUsed || 0)}</small></label></>:<p className="pos-hint">Link an existing customer in Ticket to use vouchers and Store Credits.</p>}
                </div>
              </div></details>
            </div>

            <section className="pos-card" aria-label="Payment collection"><div className="pos-card-heading"><h2>Collect Payment</h2></div><div className="pos-card-body">
              <div className="pos-field-grid pos-field-grid--three"><label className="pos-field">Payment Method<select value={paymentMethodName} onChange={event=>setPaymentMethodName(event.target.value)}><option value="Cash">Cash</option>{tenders.filter(tender=>tender.name!=='Cash').map(tender=><option key={tender.id} value={tender.name}>{tender.name}</option>)}</select></label>
              {paymentMethodName==='Cash' && <><label className="pos-field">Cash Received<input type="number" min="0" step="0.01" inputMode="decimal" value={cashReceived} onChange={event=>setCashReceived(event.target.value)} placeholder="0.00"/></label><div className="pos-payment-change"><span>{currentBill && Number(cashReceived)>0 && Number(cashReceived)<currentBill.payableNow?'Still to Collect':'Change'}</span><strong>{currentBill ? formatPHP(Number(cashReceived)>0 && Number(cashReceived)<currentBill.payableNow?currentBill.payableNow-Number(cashReceived):Math.max(0,Number(cashReceived)-currentBill.payableNow)) : '—'}</strong></div></>}
              </div>
              <button type="button" className="pos-primary pos-wide" onClick={()=>void checkout()} disabled={saving || !cart.length || !customerName.trim() || !currentBill}>{saving?<Loader2 className="animate-spin"/>:<Check/>}{saving?'Saving sale…':currentBill?`Confirm ${formatPHP(currentBill.payableNow)} received`:'Waiting for bill…'}</button>
              <p className="pos-hint pos-payment-note">Confirm after verifying payment was received.</p>
            </div></section>
          </>}
        </div>
      </fieldset>
    </>}
    {lastSale && <div className="pos-dialog-backdrop"><section className="pos-dialog" role="dialog" aria-modal="true" aria-label="Sale saved"><button type="button" onClick={()=>setLastSale(null)} className="pos-icon pos-dialog-close" aria-label="Close"><X/></button><Check className="pos-saving"/><h2>Sale saved</h2><p>Order {lastSale.orderNumber}</p><strong className="pos-saved-total">{formatPHP(lastSale.totalAmount)}</strong><p className="pos-hint">View this {lastSale.mode==='store'?'store sale':'delivery order'} in Orders.</p><button type="button" onClick={()=>setLastSale(null)} className="pos-primary pos-wide">New sale</button></section></div>}
  </main>;
}
