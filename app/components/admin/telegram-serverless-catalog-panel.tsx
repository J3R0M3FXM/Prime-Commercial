"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, Edit2, Loader2, PackagePlus, Plus, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import { callServerless, getTelegramServerlessSession, uploadProductImage } from "@/lib/telegram-serverless-client";
import TelegramMediaImage from "@/app/components/telegram-media-image";
import { formatPHP } from "@/lib/currency";

type CatalogProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
  category?: string;
  description?: string;
  isActive?: boolean;
  active?: boolean;
  imageUrl?: string;
  variants?: Array<Record<string, any>>;
  bundleConfig?: { variants?: Array<Record<string, any>>; [key: string]: any };
  lowStockThreshold?: number;
  sortOrder?: number;
  isFeatured?: boolean;
  tags?: string[];
};

function productVariants(product: CatalogProduct) {
  if (Array.isArray(product.variants)) return product.variants;
  return Array.isArray(product.bundleConfig?.variants) ? product.bundleConfig.variants : [];
}

export default function TelegramServerlessCatalogPanel({ onBack, inventoryMode = false }: { onBack: () => void; inventoryMode?: boolean }) {
  const [authorized, setAuthorized] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", price: "", stock: "", category: "Featured", description: "", imageUrl: "", lowStockThreshold: "10", sortOrder: "1", isActive: true, isFeatured: false });
  const [variants, setVariants] = useState<Array<Record<string, any>>>([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState<"all" | "low" | "out">("all");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await callServerless<CatalogProduct[]>("manageProducts", { action: "list" }, 30_000);
      if (!Array.isArray(rows)) throw new Error("The Serverless product list response was invalid.");
      setProducts(rows);
    } catch (err: any) {
      setError(err?.message || "Could not load Serverless products.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let current = true;
    getTelegramServerlessSession()
      .then((session) => {
        if (!current) return;
        if (!session?.authenticated || !session?.isAdmin) {
          setError(session?.error || "Verified Telegram admin access is required to manage products.");
          return;
        }
        setAuthorized(true);
      })
      .catch((err: any) => { if (current) setError(err?.message || "Open PRIME from Telegram to manage products."); })
      .finally(() => { if (current) setAuthLoading(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => { if (authorized) void loadProducts(); }, [authorized, loadProducts]);

  const resetForm = () => { setEditingId(""); setVariants([]); setFormOpen(false); setForm({ name: "", price: "", stock: "", category: "Featured", description: "", imageUrl: "", lowStockThreshold: "10", sortOrder: String(products.length + 1), isActive: true, isFeatured: false }); };

  const startNewProduct = () => {
    setEditingId(""); setVariants([]); setError(""); setNotice("");
    setForm({ name: "", price: "", stock: "", category: "Featured", description: "", imageUrl: "", lowStockThreshold: "10", sortOrder: String(products.length + 1), isActive: true, isFeatured: false });
    setFormOpen(true);
  };

  const editProduct = (product: CatalogProduct) => {
    setEditingId(product.id);
    setVariants(productVariants(product).map((variant) => ({ ...variant })));
    setForm({ name: product.name || "", price: String(product.price ?? 0), stock: String(product.stock ?? 0), category: product.category || "Featured", description: product.description || "", imageUrl: product.imageUrl || "", lowStockThreshold: String(product.lowStockThreshold ?? product.bundleConfig?.lowStockThreshold ?? 10), sortOrder: String(product.sortOrder ?? 1), isActive: (product.isActive ?? product.active) !== false, isFeatured: product.isFeatured === true });
    setFormOpen(true);
  };

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const stock = variants.length ? variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0) : Number(form.stock);
      const price = variants.length ? Math.min(...variants.map((variant) => Number(variant.price) || 0)) : Number(form.price);
      const payload = { ...form, action: editingId ? "update" : "create", ...(editingId ? { id: editingId } : {}), imageUrl: form.imageUrl, price, stock, sortOrder: Number(form.sortOrder), lowStockThreshold: Number(form.lowStockThreshold), variants, bundleConfig: { variants, lowStockThreshold: Number(form.lowStockThreshold) } };
      const result = await callServerless<{ success?: boolean; product?: CatalogProduct }>("manageProducts", payload, 30_000);
      if (!result?.success || (!editingId && !result.product?.id)) throw new Error("The Serverless product save was not confirmed.");
      setNotice(editingId ? "Product updated." : "Product created.");
      resetForm();
      await loadProducts();
    } catch (err: any) {
      setError(err?.message || "Could not save the Serverless product.");
    } finally {
      setSaving(false);
    }
  };

  const uploadDraftImage = async (file: File | undefined, variantIndex: number | null) => {
    if (!file) return;
    const target = variantIndex === null ? "draft:product" : `draft:variant:${variantIndex}`;
    setUploadingTarget(target); setError(""); setNotice("");
    try {
      const imageUrl = await uploadProductImage(file);
      if (variantIndex === null) setForm((current) => ({ ...current, imageUrl }));
      else setVariants((current) => current.map((variant, index) => index === variantIndex ? { ...variant, imageUrl } : variant));
      setNotice(variantIndex === null ? "Product image uploaded and ready to save." : "Variant image uploaded and ready to save.");
    } catch (err: any) { setError(err?.message || "Could not upload product image."); }
    finally { setUploadingTarget(""); }
  };

  const adjustStock = async (product: CatalogProduct, variantIndex: number | null, delta: number) => {
    setSaving(true); setError(""); setNotice("");
    try {
      if (variantIndex === null) {
        const stock = Math.max(0, Number(product.stock || 0) + delta);
        await callServerless("manageProducts", { action: "update", id: product.id, stock }, 30_000);
      } else {
        const next = productVariants(product).map((variant, index) => index === variantIndex ? { ...variant, stock: Math.max(0, Number(variant.stock || 0) + delta) } : variant);
        const stock = next.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
        await callServerless("manageProducts", { action: "update", id: product.id, variants: next, stock }, 30_000);
      }
      setNotice("Stock updated."); await loadProducts();
    } catch (err: any) { setError(err?.message || "Stock update failed."); }
    finally { setSaving(false); }
  };

  const visibleProducts = products.filter((product) => {
    const variants = productVariants(product);
    const matches = `${product.name} ${product.category || ""} ${variants.map((variant) => variant.name || "").join(" ")}`.toLowerCase().includes(inventorySearch.toLowerCase());
    const threshold = Number(product.lowStockThreshold ?? product.bundleConfig?.lowStockThreshold) || 10;
    const stock = Number(product.stock) || 0;
    if (!matches) return false;
    if (inventoryFilter === "out") return stock <= 0;
    if (inventoryFilter === "low") return stock > 0 && stock <= threshold || variants.some((variant) => Number(variant.stock) > 0 && Number(variant.stock) <= threshold);
    return true;
  });

  const deleteProduct = async (product: CatalogProduct) => {
    if (!window.confirm(`Delete ${product.name} from the Serverless catalog?`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await callServerless("manageProducts", { action: "delete", id: product.id }, 30_000);
      setNotice(`Deleted ${product.name}.`);
      await loadProducts();
    } catch (err: any) {
      setError(err?.message || "Could not delete the Serverless demo product.");
    } finally {
      setSaving(false);
    }
  };

  const setDemoVariant = async (product: CatalogProduct, add: boolean) => {
    if (!product.name.startsWith("SERVERLESS CATALOG TEST")) {
      setError("Test variant changes are limited to the clearly labeled Serverless catalog test item.");
      return;
    }
    const currentVariants = productVariants(product);
    if (add && currentVariants.length > 0) return;
    if (!add && (currentVariants.length !== 1 || currentVariants[0]?.id !== "serverless-test-variant")) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const variants = add ? [{
        id: "serverless-test-variant",
        name: "Serverless Test Variant",
        price: Number(product.price) || 0,
        stock: Number(product.stock) || 0,
        imageUrl: "",
      }] : [];
      const result = await callServerless<{ success?: boolean }>("manageProducts", {
        action: "update",
        id: product.id,
        bundleConfig: { ...(product.bundleConfig || {}), variants },
      }, 30_000);
      if (!result?.success) throw new Error("The test variant update was not confirmed.");
      setNotice(add ? "Added a removable test variant to the demo product." : "Removed the test variant from the demo product.");
      await loadProducts();
    } catch (err: any) {
      setError(err?.message || "Could not update the test variant.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="serverless-admin-panel" aria-label={`Telegram Serverless ${inventoryMode ? "inventory" : "product"} management`}>
      <header className="serverless-panel-header">
        <button type="button" onClick={onBack} className="serverless-action" aria-label="Back to Admin modules"><ArrowLeft className="h-4 w-4"/></button>
        <div className="serverless-panel-header__copy"><h1>{inventoryMode ? "Inventory" : "Products"}</h1><p><ShieldCheck className="mr-1 inline h-3 w-3 text-emerald-700"/>Verified Telegram staff</p></div>
        {!inventoryMode && <button type="button" disabled={!authorized} onClick={startNewProduct} className="serverless-action serverless-action--primary"><Plus className="h-4 w-4"/>Add</button>}
        <button type="button" onClick={() => void loadProducts()} disabled={!authorized || loading || saving} className="serverless-action" aria-label="Refresh list"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/></button>
      </header>

      {error && <div role="alert" className="my-2 border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</div>}
      {notice && <div role="status" className="my-2 border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">{notice}</div>}
      {authLoading && <div className="my-2 flex justify-center border bg-white p-5"><Loader2 className="h-5 w-5 animate-spin"/></div>}

      {authorized && <>
        {inventoryMode && <div className="serverless-fields my-2">
          <label className="serverless-field">Search<input value={inventorySearch} onChange={(e)=>setInventorySearch(e.target.value)} placeholder="Product, category, variant"/></label>
          <label className="serverless-field">Stock filter<select value={inventoryFilter} onChange={(e)=>setInventoryFilter(e.target.value as typeof inventoryFilter)}><option value="all">All stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></label>
        </div>}

        <div className="serverless-panel-toolbar"><strong className="min-w-0 flex-1 text-xs uppercase">{inventoryMode ? "Stock records" : "Saved products"} · {products.length}</strong>{loading && <Loader2 className="h-4 w-4 animate-spin"/>}</div>
        {products.length === 0 ? <p className="border bg-white p-4 text-center text-xs text-slate-600">No products have been added to the Serverless catalog.</p> :
          <div className="serverless-record-list">{visibleProducts.map((product) => {
            const itemVariants = productVariants(product);
            const active = (product.isActive ?? product.active) !== false;
            const threshold = product.lowStockThreshold ?? product.bundleConfig?.lowStockThreshold ?? 10;
            return <article key={product.id} className="serverless-record">
              <div className="serverless-record__summary">
                <ProductImagePreview reference={product.imageUrl || ""} alt={product.name}/>
                <div className="serverless-record__copy"><strong>{product.name}</strong><small>{product.category || "General"} · {formatPHP(Number(product.price)||0)} · {Number(product.stock)||0} stock · Low ≤ {threshold}</small></div>
                {!inventoryMode && <div className="serverless-record__actions"><button type="button" disabled={saving} onClick={()=>editProduct(product)} className="serverless-action" aria-label={`Edit ${product.name}`}><Edit2 className="h-4 w-4"/></button><button type="button" disabled={saving} onClick={()=>void deleteProduct(product)} className="serverless-action serverless-action--danger" aria-label={`Delete ${product.name}`}><Trash2 className="h-4 w-4"/></button></div>}
              </div>
              {inventoryMode ? <div className="serverless-record__summary border-t border-slate-100">
                <div className="serverless-record__copy"><strong>Product stock</strong><small>{itemVariants.length ? `${itemVariants.length} variants · total ${Number(product.stock)||0}` : "Single item"}</small></div>
                <button disabled={saving} onClick={()=>void adjustStock(product,null,-10)} className="serverless-action">−10</button><button disabled={saving} onClick={()=>void adjustStock(product,null,-1)} className="serverless-action">−1</button><button disabled={saving} onClick={()=>void adjustStock(product,null,1)} className="serverless-action">+1</button><button disabled={saving} onClick={()=>void adjustStock(product,null,10)} className="serverless-action">+10</button>
              </div> : <div className="serverless-record__summary border-t border-slate-100">
                <label className="serverless-switch flex-1"><span>{active ? "Visible in shop" : "Hidden from shop"}</span><input type="checkbox" checked={active} disabled={saving} onChange={()=>void callServerless("manageProducts",{action:"update",id:product.id,isActive:!active},30_000).then(()=>loadProducts()).catch((err:any)=>setError(err?.message||"Could not update visibility."))}/><span className="serverless-switch__track"/></label>
                {itemVariants.length > 0 && <details className="serverless-disclosure flex-1"><summary className="flex items-center justify-between">{itemVariants.length} variants <ChevronDown className="h-4 w-4"/></summary><div className="serverless-disclosure__body space-y-1">{itemVariants.map((variant,index)=><div key={`${variant.id||"v"}-${index}`} className="flex min-w-0 items-center gap-2 border-b border-slate-100 py-1 last:border-0"><ProductImagePreview reference={variant.imageUrl||variant.image_url||""} alt={variant.name||`Variant ${index+1}`}/><span className="min-w-0 flex-1 break-words text-[11px]">{variant.name||`Variant ${index+1}`} · {formatPHP(Number(variant.price)||0)} · {Number(variant.stock)||0} stock</span></div>)}</div></details>}
              </div>}
              {inventoryMode && itemVariants.map((variant,index)=><div key={`${variant.id||"v"}-${index}`} className="serverless-record__summary border-t border-slate-100"><div className="serverless-record__copy"><strong>{variant.name||`Variant ${index+1}`}</strong><small>{Number(variant.stock)||0} stock · {variant.tag||"No tag"}</small></div><button disabled={saving} onClick={()=>void adjustStock(product,index,-10)} className="serverless-action">−10</button><button disabled={saving} onClick={()=>void adjustStock(product,index,-1)} className="serverless-action">−1</button><button disabled={saving} onClick={()=>void adjustStock(product,index,1)} className="serverless-action">+1</button><button disabled={saving} onClick={()=>void adjustStock(product,index,10)} className="serverless-action">+10</button></div>)}
            </article>;
          })}</div>}
      </>}

      {formOpen && !inventoryMode && <div className="serverless-dialog-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!saving&&!uploadingTarget)resetForm();}}>
        <section role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" className="serverless-dialog">
          <header className="serverless-dialog__header"><div className="flex min-w-0 items-center gap-2"><PackagePlus className="h-4 w-4"/><h2 id="product-dialog-title">{editingId?"Edit product":"Add product"}</h2></div><button type="button" onClick={resetForm} disabled={saving||Boolean(uploadingTarget)} className="serverless-action" aria-label="Close"><X className="h-4 w-4"/></button></header>
          <form onSubmit={saveProduct} className="serverless-dialog__form">
            <div className="serverless-dialog__body space-y-2">
              <div className="serverless-fields">
                <label className="serverless-field">Product name<input required maxLength={240} value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></label>
                <label className="serverless-field">Category<input value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})}/></label>
                {!variants.length && <label className="serverless-field">Price (PHP)<input required type="number" min="0" step="0.01" value={form.price} onChange={(e)=>setForm({...form,price:e.target.value})}/></label>}
                {!variants.length && <label className="serverless-field">Stock<input required type="number" min="0" step="1" value={form.stock} onChange={(e)=>setForm({...form,stock:e.target.value})}/></label>}
                <label className="serverless-field">Sort priority<input required type="number" min="1" step="1" value={form.sortOrder} onChange={(e)=>setForm({...form,sortOrder:e.target.value})}/></label>
                <label className="serverless-field">Low stock alert<input required type="number" min="0" step="1" value={form.lowStockThreshold} onChange={(e)=>setForm({...form,lowStockThreshold:e.target.value})}/></label>
              </div>
              <details className="serverless-disclosure" open><summary>Product photo</summary><div className="serverless-disclosure__body flex items-center gap-2"><ProductImagePreview reference={form.imageUrl} alt="Product image preview" large/><label className="serverless-action flex-1 cursor-pointer justify-center">{uploadingTarget==="draft:product"?"Uploading…":form.imageUrl?"Replace image":"Upload image"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={Boolean(uploadingTarget)||saving} onChange={(e)=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";void uploadDraftImage(file,null);}}/></label></div></details>
              <div className="serverless-disclosure">
                <div className="flex items-center gap-2 p-2"><strong className="min-w-0 flex-1 text-[11px] uppercase">Variants · {variants.length}</strong><button type="button" onClick={()=>setVariants((current)=>[...current,{id:`variant_${Date.now()}_${current.length}`,name:"",price:Number(form.price)||0,stock:0,tag:"NONE",imageUrl:""}])} className="serverless-action serverless-action--primary"><Plus className="h-3.5 w-3.5"/>Add</button></div>
                <div className="serverless-disclosure__body space-y-2">{variants.length===0&&<p className="text-[10px] text-slate-500">No variants. Product price and stock apply to one item.</p>}{variants.map((variant,index)=><details key={variant.id||index} className="serverless-disclosure" open><summary className="flex items-center justify-between">{variant.name||`Variant ${index+1}`}<ChevronDown className="h-4 w-4"/></summary><div className="serverless-disclosure__body space-y-2"><div className="serverless-fields"><label className="serverless-field">Variant name<input required value={variant.name||""} onChange={(e)=>setVariants((current)=>current.map((item,i)=>i===index?{...item,name:e.target.value}:item))}/></label><label className="serverless-field">Tag<select value={variant.tag||"NONE"} onChange={(e)=>setVariants((current)=>current.map((item,i)=>i===index?{...item,tag:e.target.value}:item))}><option>NONE</option><option>NEW</option><option>LOW STOCKS</option><option>UNAVAILABLE</option><option>BEST SELLER</option><option>SALE</option></select></label><label className="serverless-field">Price (PHP)<input type="number" min="0" step="0.01" value={variant.price??0} onChange={(e)=>setVariants((current)=>current.map((item,i)=>i===index?{...item,price:Number(e.target.value)}:item))}/></label><label className="serverless-field">Stock<input type="number" min="0" step="1" value={variant.stock??0} onChange={(e)=>setVariants((current)=>current.map((item,i)=>i===index?{...item,stock:Number(e.target.value)}:item))}/></label></div><div className="flex items-center gap-2"><ProductImagePreview reference={variant.imageUrl||variant.image_url||""} alt={`${variant.name||"Variant"} image preview`} large/><label className="serverless-action flex-1 cursor-pointer justify-center">{uploadingTarget===`draft:variant:${index}`?"Uploading…":variant.imageUrl||variant.image_url?"Replace image":"Upload image"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={Boolean(uploadingTarget)||saving} onChange={(e)=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";void uploadDraftImage(file,index);}}/></label><button type="button" onClick={()=>setVariants((current)=>current.filter((_,i)=>i!==index))} className="serverless-action serverless-action--danger">Remove</button></div></div></details>)}</div>
              </div>
              <details className="serverless-disclosure"><summary>Description</summary><div className="serverless-disclosure__body"><label className="serverless-field">Product details<textarea rows={3} value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/></label></div></details>
              <div className="serverless-fields"><label className="serverless-switch"><span>Visible in shop</span><input type="checkbox" checked={form.isActive} onChange={(e)=>setForm({...form,isActive:e.target.checked})}/><span className="serverless-switch__track"/></label><label className="serverless-switch"><span>Featured product</span><input type="checkbox" checked={form.isFeatured} onChange={(e)=>setForm({...form,isFeatured:e.target.checked})}/><span className="serverless-switch__track"/></label></div>
            </div>
            <footer className="serverless-dialog__footer"><button type="button" onClick={resetForm} disabled={saving||Boolean(uploadingTarget)} className="serverless-action">Cancel</button><button type="submit" disabled={!authorized||saving||Boolean(uploadingTarget)||!form.name.trim()} className="serverless-action serverless-action--primary">{saving?"Saving…":editingId?"Save product":"Create product"}</button></footer>
          </form>
        </section>
      </div>}
    </main>
  );
}

function ProductImagePreview({reference,alt,large=false}:{reference:string;alt:string;large?:boolean}) {
  return <TelegramMediaImage src={reference} alt={alt} className={`${large?"h-16 w-16":"h-9 w-9"} shrink-0 border border-slate-200 bg-white object-contain`} />;
}
