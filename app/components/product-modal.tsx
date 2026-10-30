"use client";
import React, { useState, useEffect } from 'react';
import { useCart } from './cart-context';
import { X, Check, Minus, Plus, ShoppingCart, Info, ChevronDown } from 'lucide-react';
import { formatPHP } from "@/lib/currency";

export default function ProductModal({ product, onClose }: { product: any, onClose: () => void }) {
  const { cart, addToCart, updateQuantity } = useCart();
  
  // Extract variants
  const fallbackImage = product?.imageUrl || "https://picsum.photos/seed/prime/600/600";
  const rawVariants = Array.isArray(product?.variants) && product.variants.length > 0
    ? product.variants
    : [{
        id: "default",
        name: "Standard",
        imageUrl: fallbackImage,
        stock: product?.stock ?? 10,
        price: product?.price || 0,
        tag: "NONE"
      }];

  // Canonical variant shape: one uploaded image reference per variant.
  const variants = rawVariants.map((variant: any) => ({
    ...variant,
    imageUrl: variant?.imageUrl || variant?.images?.[0]?.url || variant?.images?.[0] || fallbackImage,
  }));

  // Do NOT pre-select an option by default — require customer choice first
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [localQuantity, setLocalQuantity] = useState(1);
  const [variantMenuOpen, setVariantMenuOpen] = useState(false);
  const [variantFeedbackTick, setVariantFeedbackTick] = useState(0);

  // Preserve the customer's selected variant when the live product row updates.
  // Realtime stock/configuration changes should refresh the option without resetting the UI.
  useEffect(() => {
    setSelectedVariant((prev: any) => {
      if (!prev) return null;
      const live = variants.find((v: any) => String(v?.id) === String(prev.id));
      return live || null;
    });
    setLocalQuantity((prev) => {
      const liveSelected = variants.find((v: any) => String(v?.id) === String(selectedVariant?.id));
      const liveStock = Number(liveSelected?.stock ?? 0);
      return Math.min(Math.max(1, prev), Math.max(1, liveStock || 1));
    });
  }, [product]);

  useEffect(() => {
    if (!variantMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVariantMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [variantMenuOpen]);

  if (!product) return null;

  // Find unique cart item corresponding to this variant (if selected)
  const cartItemId = selectedVariant 
    ? (selectedVariant.id === "default" ? product.id : `${product.id}_${selectedVariant.id}`)
    : null;
  const cartItem = cartItemId ? cart.find((item: any) => item.id === cartItemId) : null;
  const isInCart = !!cartItem;
  const quantityInCart = isInCart ? cartItem.quantity : 0;

  const lowStockThreshold = Number(product.lowStockThreshold) ?? 10;
  const isOutOfStock = selectedVariant ? (selectedVariant.stock ?? 0) <= 0 : false;
  const hasBundle = product.bundleConfig?.enabled;
  
  // Base price
  const basePrice = selectedVariant 
    ? (Number(selectedVariant.price) || 0)
    : (variants.length > 0 ? Math.min(...variants.map((v: any) => Number(v.price) || 0)) : (Number(product.price) || 0));

  const currentQuantity = isInCart ? quantityInCart : localQuantity;
  const finalPrice = hasBundle && currentQuantity > 1 
    ? basePrice * (1 - (product.bundleConfig.discount / 100))
    : basePrice;

  // Glossy chip rendering
  const renderGlossyChip = () => {
    const stock = selectedVariant?.stock ?? product?.stock ?? 0;
    let tag = selectedVariant?.tag || product?.tag || "NONE";
    
    if (stock <= 0) {
      tag = "UNAVAILABLE";
    } else if (stock <= lowStockThreshold) {
      tag = "LOW STOCKS";
    }

    if (tag === "NONE") return null;

    let colorClasses = "bg-slate-800/85 border-slate-600/50 shadow-slate-900/10";
    if (tag === "UNAVAILABLE") colorClasses = "bg-red-500/85 border-red-400/40 shadow-red-500/20";
    else if (tag === "LOW STOCKS") colorClasses = "bg-amber-500/85 border-amber-400/40 shadow-amber-500/20";
    else if (tag === "NEW") colorClasses = "bg-emerald-500/85 border-emerald-400/40 shadow-emerald-500/20";
    else if (tag === "BEST SELLER") colorClasses = "bg-indigo-600/85 border-indigo-400/40 shadow-indigo-500/20";
    else if (tag === "SALE") colorClasses = "bg-rose-500/85 border-rose-400/40 shadow-rose-500/20";

    return (
      <span className={`absolute top-2 left-2 z-20 max-w-[calc(100%-1rem)] truncate px-2 py-1 text-[9px] font-bold tracking-wider rounded-md backdrop-blur-md border text-white uppercase shadow-sm font-mono ${colorClasses}`}>
        {tag}
      </span>
    );
  };

  const handleAddToCart = () => {
    if (!selectedVariant || !cartItemId) return;

    const itemToCart = {
      id: cartItemId,
      productId: product.id,
      variantId: selectedVariant.id,
      productName: product.name,
      variantName: selectedVariant.id === "default" ? "" : selectedVariant.name,
      name: selectedVariant.id === "default" ? product.name : `${product.name} - ${selectedVariant.name}`,
      price: basePrice,
      imageUrl: selectedVariant.imageUrl || product.imageUrl,
      stock: selectedVariant.stock,
      category: product.category,
      bundleConfig: product.bundleConfig
    };
    addToCart(itemToCart, localQuantity);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-[430px] rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 relative max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] flex flex-col min-h-0 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-2 bg-white/90 backdrop-blur-md text-gray-900 rounded-full hover:bg-white transition-colors shadow-sm cursor-pointer border border-gray-100"
          aria-label="Close product"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-5 pb-4 overscroll-contain">
          <div className="text-left pr-10">
            <p className="text-[9px] font-mono font-bold tracking-widest text-gray-400 uppercase leading-none">
              {product.category || "General"}
            </p>
            <h2 className="mt-1 text-lg sm:text-xl font-heading font-bold text-gray-900 leading-[1.15] tracking-tight">
              {product.name}
            </h2>
          </div>

          <div className="mt-4 flex justify-center">
            <div key={variantFeedbackTick} className={`relative w-full max-w-[360px] ${variants.length > 1 ? "h-[min(34dvh,300px)]" : "aspect-square"} ${variantFeedbackTick > 0 ? "variant-selection-feedback" : ""} overflow-hidden rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center`}>
              {renderGlossyChip()}
              <img
                src={selectedVariant?.imageUrl || fallbackImage}
                alt={selectedVariant ? `${product.name} - ${selectedVariant.name}` : product.name}
                className={`max-w-full max-h-full w-full h-full object-contain ${isOutOfStock ? "opacity-60 grayscale" : ""}`}
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  if (target.src !== fallbackImage) target.src = fallbackImage;
                }}
              />
            </div>
          </div>

          {selectedVariant && (
            <div className="mx-auto mt-2 flex max-w-[360px] items-baseline justify-between gap-2 px-1">
              <span className="font-mono text-[9px] font-bold uppercase tracking-wide text-slate-500">Price per item</span>
              <span className="font-mono text-base font-bold text-slate-900">{formatPHP(basePrice)}</span>
            </div>
          )}

          {product.description && (
            <p className="mt-2 mx-auto max-w-[380px] text-center text-xs text-gray-500 leading-relaxed">
              {product.description}
            </p>
          )}

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <div className="relative min-w-0 font-mono text-[9px] font-bold uppercase tracking-wide text-slate-500">
              <span className="mb-1 block">Variant</span>
              <button type="button" aria-haspopup="dialog" aria-expanded={variantMenuOpen} onClick={() => setVariantMenuOpen(true)} className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-[10px] font-semibold normal-case text-slate-800 shadow-sm">
                <span className="min-w-0 truncate">{selectedVariant?.name || "Choose a variant"}</span>
                {selectedVariant && <span className="shrink-0 font-mono">{formatPHP(Number(selectedVariant.price) || 0)}</span>}
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              </button>
            </div>

            <div className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-wide text-slate-500">
              <span className="mb-1 block text-center">Quantity</span>
              <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  className="h-full px-2.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                  onClick={() => isInCart ? updateQuantity(cartItemId, cartItem.quantity - 1) : setLocalQuantity(Math.max(1, localQuantity - 1))}
                  disabled={!selectedVariant || (isInCart ? cartItem.quantity <= 1 : localQuantity <= 1)}
                  aria-label="Decrease quantity"
                ><Minus className="h-3 w-3" /></button>
                <span className="w-7 text-center text-sm font-bold text-slate-900">{selectedVariant ? currentQuantity : "—"}</span>
                <button
                  type="button"
                  className="h-full px-2.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                  onClick={() => isInCart ? updateQuantity(cartItemId, cartItem.quantity + 1) : setLocalQuantity(Math.min(selectedVariant?.stock ?? 10, localQuantity + 1))}
                  disabled={!selectedVariant || isOutOfStock || (isInCart ? cartItem.quantity >= (selectedVariant.stock ?? 10) : localQuantity >= (selectedVariant.stock ?? 10))}
                  aria-label="Increase quantity"
                ><Plus className="h-3 w-3" /></button>
              </div>
            </div>
          </div>

          {selectedVariant && (
            <div className="mt-1 flex min-h-4 items-center justify-between gap-2 text-[9px] font-mono text-slate-500">
              <span>{isOutOfStock ? <span className="font-bold text-red-600">Unavailable</span> : `Stock: ${selectedVariant.stock}`}</span>
              {hasBundle && !isOutOfStock && <span className="truncate text-right text-emerald-700">Buy 2+ · {product.bundleConfig.discount}% off</span>}
            </div>
          )}

          {selectedVariant && (
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 font-mono">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Total amount</span>
              <span className="text-lg font-bold text-slate-900">{formatPHP(finalPrice * currentQuantity)}</span>
            </div>
          )}

          <div className="mt-3">
            {!selectedVariant ? (
              <button disabled className="w-full bg-gray-100 text-gray-400 py-3.5 rounded-xl font-heading font-bold uppercase tracking-widest text-xs cursor-not-allowed text-center">
                Please Select an Option First
              </button>
            ) : isOutOfStock ? (
              <button disabled className="w-full bg-gray-100 text-gray-400 py-3.5 rounded-xl font-heading font-bold uppercase tracking-widest text-xs text-center">
                Unavailable
              </button>
            ) : isInCart ? (
              <button type="button" disabled className="w-full rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-xs font-heading font-bold uppercase tracking-wider text-emerald-800">
                Added to Cart · {cartItem.quantity}
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleAddToCart}
                  className="w-full px-3.5 py-3 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs text-center"
                >
                  Add to Cart — {formatPHP(finalPrice * localQuantity)}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {variantMenuOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px]"
          onClick={(event) => {
            event.stopPropagation();
            if (event.target === event.currentTarget) setVariantMenuOpen(false);
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="variant-picker-title" className="flex max-h-[min(70dvh,520px)] w-full max-w-[430px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <div>
                <h3 id="variant-picker-title" className="font-heading text-base font-semibold text-slate-900">Select Variant</h3>
                <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-slate-500">{product.name}</p>
              </div>
              <button type="button" onClick={() => setVariantMenuOpen(false)} aria-label="Close variant selector" className="rounded-full p-2 text-slate-600 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </header>
            <div role="listbox" aria-label="Choose product variant" className="min-h-0 overflow-y-auto overscroll-contain">
              {variants.map((variant: any) => {
                const stock = Math.max(0, Number(variant.stock) || 0);
                const unavailable = stock <= 0;
                const selected = String(selectedVariant?.id || "") === String(variant.id);
                return <button key={variant.id} type="button" role="option" aria-selected={selected} disabled={unavailable} onClick={() => { setSelectedVariant(variant); setLocalQuantity(1); setVariantFeedbackTick((tick) => tick + 1); setVariantMenuOpen(false); }} className={`grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5 border-b border-slate-100 px-3 py-3 text-left text-[11px] last:border-b-0 ${unavailable ? "cursor-not-allowed bg-slate-100 text-slate-400" : selected ? "bg-amber-50 text-slate-950" : "bg-white text-slate-800 hover:bg-slate-100"}`}>
                  <span className="truncate font-semibold normal-case">{variant.name || "Variant"}</span><span className="whitespace-nowrap font-mono">{formatPHP(Number(variant.price) || 0)}</span><span className={`whitespace-nowrap font-mono ${unavailable ? "text-slate-400" : "text-slate-500"}`}>{unavailable ? "Out of stock" : `${stock} in stock`}</span>
                </button>;
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
