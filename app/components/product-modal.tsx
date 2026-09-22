"use client";
import React, { useState, useEffect } from 'react';
import { useCart } from './cart-context';
import { X, Check, Minus, Plus, ShoppingCart, Info } from 'lucide-react';
import { formatPHP } from "@/lib/currency";

export default function ProductModal({ product, onClose }: { product: any, onClose: () => void }) {
  const { cart, addToCart, updateQuantity } = useCart();
  
  // Extract variants
  const fallbackImage = product?.imageUrl || "https://picsum.photos/seed/prime/600";
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

  // Canonical variant shape: one image URL per variant.
  const variants = rawVariants.map((variant: any) => ({
    ...variant,
    imageUrl: variant?.imageUrl || variant?.images?.[0]?.url || variant?.images?.[0] || fallbackImage,
  }));

  // Do NOT pre-select an option by default — require customer choice first
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [localQuantity, setLocalQuantity] = useState(1);

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
    if (!selectedVariant) return null;
    const stock = selectedVariant.stock ?? 0;
    let tag = "NONE";
    
    if (stock <= 0) {
      tag = "UNAVAILABLE";
    } else if (stock <= lowStockThreshold) {
      tag = "LOW STOCKS";
    } else if (selectedVariant.tag && selectedVariant.tag !== "NONE") {
      tag = selectedVariant.tag;
    }

    if (tag === "NONE") return null;

    let colorClasses = "bg-slate-800/85 border-slate-600/50 shadow-slate-900/10";
    if (tag === "UNAVAILABLE") colorClasses = "bg-red-500/85 border-red-400/40 shadow-red-500/20";
    else if (tag === "LOW STOCKS") colorClasses = "bg-amber-500/85 border-amber-400/40 shadow-amber-500/20";
    else if (tag === "NEW") colorClasses = "bg-emerald-500/85 border-emerald-400/40 shadow-emerald-500/20";
    else if (tag === "BEST SELLER") colorClasses = "bg-indigo-600/85 border-indigo-400/40 shadow-indigo-500/20";
    else if (tag === "SALE") colorClasses = "bg-rose-500/85 border-rose-400/40 shadow-rose-500/20";

    return (
      <span className={`absolute top-4 left-4 z-10 px-2.5 py-1 text-[9px] font-bold tracking-wider rounded-md backdrop-blur-md border text-white uppercase shadow-sm font-mono ${colorClasses}`}>
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-[430px] sm:rounded-2xl rounded-t-2xl sm:rounded-b-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:fade-in-20 relative max-h-[90vh] flex flex-col cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-2 bg-white/90 backdrop-blur-md text-gray-900 rounded-full hover:bg-white transition-colors shadow-sm cursor-pointer border border-gray-100"
          aria-label="Close product"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="overflow-y-auto px-4 pt-5 pb-4">
          <div className="text-left pr-10">
            <p className="text-[9px] font-mono font-bold tracking-widest text-gray-400 uppercase leading-none">
              {product.category || "General"}
            </p>
            <h2 className="mt-1 text-lg sm:text-xl font-heading font-bold text-gray-900 leading-[1.15] tracking-tight">
              {product.name}
            </h2>
          </div>

          <div className="mt-4 flex justify-center">
            <div className="relative w-full max-w-[360px] aspect-[4/3] overflow-hidden rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
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

          {product.description && (
            <p className="mt-3 mx-auto max-w-[380px] text-center text-xs text-gray-500 leading-relaxed">
              {product.description}
            </p>
          )}

          <div className="mt-4 text-center">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 font-mono">
              Select Variant
            </label>
            {variants.length > 1 && (
              <span className="mt-1 block text-[9px] font-mono text-gray-400">
                {variants.length} OPTIONS
              </span>
            )}

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {variants.map((v: any) => {
                const isSelected = selectedVariant?.id === v.id;
                const variantPrice = Number(v.price) || 0;

                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setSelectedVariant(v);
                      setLocalQuantity(1);
                    }}
                    className={"rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wide transition-all cursor-pointer " + (isSelected
                      ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                      : "border-gray-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50")}
                  >
                    <span>{v.name || "Variant"}</span>
                    <span className={"ml-1.5 font-mono " + (isSelected ? "text-white/80" : "text-slate-400")}>
                      {formatPHP(variantPrice)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedVariant && (
            <>
              <div className="mt-3 flex items-center justify-center py-2 border-y border-gray-100">
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-center">
                  {isOutOfStock ? (
                    <span className="text-red-500">Unavailable</span>
                  ) : (
                    <span className="text-gray-500">
                      Stock: <span className="text-gray-900">{selectedVariant.stock}</span>
                    </span>
                  )}
                </div>
              </div>

              {hasBundle && !isOutOfStock && (
                <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                  <p className="font-bold text-emerald-800 text-[10px] uppercase tracking-wide">
                    Buy More, Save More
                  </p>
                  <p className="text-emerald-600 text-[11px] mt-0.5">
                    Buy 2 or more to get <span className="font-bold">{product.bundleConfig.discount}% off</span>.
                  </p>
                </div>
              )}
            </>
          )}

          <div className="mt-4">
            {!selectedVariant ? (
              <button disabled className="w-full bg-gray-100 text-gray-400 py-3.5 rounded-xl font-heading font-bold uppercase tracking-widest text-xs cursor-not-allowed text-center">
                Please Select an Option First
              </button>
            ) : isOutOfStock ? (
              <button disabled className="w-full bg-gray-100 text-gray-400 py-3.5 rounded-xl font-heading font-bold uppercase tracking-widest text-xs text-center">
                Unavailable
              </button>
            ) : isInCart ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                  <button
                    className="p-3.5 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => updateQuantity(cartItemId, cartItem.quantity - 1)}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{cartItem.quantity}</span>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">In Cart</span>
                  </div>
                  <button
                    className="p-3.5 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors disabled:opacity-30 cursor-pointer"
                    onClick={() => updateQuantity(cartItemId, cartItem.quantity + 1)}
                    disabled={cartItem.quantity >= (selectedVariant.stock ?? 10)}
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-3">
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wide font-mono">Quantity</span>
                  <div className="flex items-center border border-gray-200 rounded-lg bg-white">
                    <button
                      type="button"
                      className="p-2 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors disabled:opacity-30 cursor-pointer"
                      onClick={() => setLocalQuantity(Math.max(1, localQuantity - 1))}
                      disabled={localQuantity <= 1}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-10 text-center font-bold text-sm font-mono">{localQuantity}</span>
                    <button
                      type="button"
                      className="p-2 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors disabled:opacity-30 cursor-pointer"
                      onClick={() => setLocalQuantity(Math.min(selectedVariant.stock ?? 10, localQuantity + 1))}
                      disabled={localQuantity >= (selectedVariant.stock ?? 10)}
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl font-mono font-bold text-gray-900">
                    {formatPHP(finalPrice * localQuantity)}
                  </span>
                  {hasBundle && localQuantity > 1 && (
                    <span className="text-[10px] font-mono font-bold text-emerald-600 uppercase tracking-wider">
                      Bundle Savings Applied
                    </span>
                  )}
                </div>

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
    </div>
  );
}
