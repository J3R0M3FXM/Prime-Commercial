"use client";
import React, { useState, useEffect } from 'react';
import { useCart } from './cart-context';
import { X, Check, Minus, Plus, ShoppingCart, Info } from 'lucide-react';
import { formatPHP } from "@/lib/currency";

export default function ProductModal({ product, onClose }: { product: any, onClose: () => void }) {
  const { cart, addToCart, updateQuantity } = useCart();
  
  // Extract variants
  const variants = product?.variants && product.variants.length > 0
    ? product.variants
    : [{
        id: "default",
        name: "Standard",
        imageUrl: product?.imageUrl || "https://picsum.photos/seed/prime/600",
        stock: product?.stock ?? 10,
        price: product?.price || 0,
        tag: "NONE"
      }];

  // Do NOT pre-select an option by default — require customer choice first
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [localQuantity, setLocalQuantity] = useState(1);

  // Reset selection when product changes
  useEffect(() => {
    setSelectedVariant(null);
    setLocalQuantity(1);
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
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 z-20 p-2 bg-white/90 backdrop-blur-md text-gray-900 rounded-full hover:bg-white transition-colors shadow-sm cursor-pointer border border-gray-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="sm:grid sm:grid-cols-2 flex-1 overflow-y-auto">
          {/* Left panel: Image */}
          <div className="relative aspect-square sm:aspect-auto sm:h-full bg-gray-50 min-h-[250px] sm:min-h-[400px]">
            {renderGlossyChip()}
            <img 
              src={selectedVariant?.imageUrl || product.imageUrl || "https://picsum.photos/seed/prime/600"} 
              alt={product.name} 
              className={`w-full h-full object-cover absolute inset-0 ${isOutOfStock ? 'opacity-60 grayscale' : ''}`} 
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "https://picsum.photos/seed/prime/600";
              }}
            />
          </div>

          {/* Right panel: Details & Option selection */}
          <div className="p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              {/* Category */}
              <p className="text-[10px] font-mono font-bold tracking-widest text-gray-400 uppercase">
                {product.category || "General"}
              </p>

              {/* Title & Price */}
              <div>
                <h2 className="text-xl sm:text-2xl font-heading font-bold text-gray-900 leading-tight">
                  {product.name}
                </h2>
                {selectedVariant && selectedVariant.id !== "default" && (
                  <p className="text-sm font-semibold text-gray-500 mt-1 uppercase tracking-wide font-mono">
                    Selected Option: <span className="text-gray-900 font-bold">{selectedVariant.name}</span>
                  </p>
                )}
                
                {/* Price */}
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-mono font-bold text-gray-900">
                    {formatPHP(finalPrice)}
                  </span>
                  {!selectedVariant && variants.length > 1 && (
                    <span className="text-[11px] font-mono font-medium text-slate-400">
                      (Starting Price)
                    </span>
                  )}
                  {hasBundle && currentQuantity > 1 && selectedVariant && (
                    <span className="text-xs font-mono font-bold text-emerald-600 uppercase tracking-wider">
                      Bundle Savings Applied
                    </span>
                  )}
                </div>
              </div>

              {/* Stocks Status */}
              {selectedVariant && (
                <div className="flex items-center py-2 border-y border-gray-100">
                  <div className="text-xs font-mono font-bold uppercase tracking-wider">
                    {isOutOfStock ? (
                      <span className="text-red-500">Unavailable</span>
                    ) : (
                      <span className="text-gray-500">Stock: <span className="text-gray-900">{selectedVariant.stock}</span></span>
                    )}
                  </div>
                </div>
              )}

              {/* Selection Note for Customers - automatically hidden once option is selected */}
              {!selectedVariant && (
                <div className="bg-amber-50 border border-amber-200/90 rounded-xl p-3 flex items-center gap-2 text-amber-900 text-xs font-mono animate-in fade-in duration-150">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Note: Please select an option or variant before adding to cart.</span>
                </div>
              )}

              {/* Description */}
              <p className="text-xs text-gray-500 leading-relaxed max-h-[100px] overflow-y-auto">
                {product.description || "No description provided for this product. Premium quality guaranteed."}
              </p>

              {/* Option / Variant selector */}
              <div className="space-y-2 pt-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 font-mono">
                  Select Option
                </label>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v: any) => {
                    const isSelected = selectedVariant?.id === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setSelectedVariant(v);
                          setLocalQuantity(1);
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                          isSelected 
                            ? "border-black bg-black text-white shadow-xs" 
                            : "border-gray-200 bg-white hover:border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {v.imageUrl && (
                          <img 
                            src={v.imageUrl} 
                            alt={v.name} 
                            className="w-4 h-4 rounded-md object-cover border border-gray-100" 
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                        <span>{v.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bundle discount banner */}
              {hasBundle && selectedVariant && !isOutOfStock && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-start gap-2.5">
                  <div className="mt-0.5 bg-emerald-500 text-white rounded-full p-0.5">
                    <Check className="w-2.5 h-2.5" />
                  </div>
                  <div>
                    <p className="font-bold text-emerald-800 text-[10px] uppercase tracking-wide">Buy More, Save More</p>
                    <p className="text-emerald-600 text-[11px] mt-0.5">
                      Buy 2 or more to get <span className="font-bold">{product.bundleConfig.discount}% off</span>.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom: Cart Control Actions */}
            <div className="pt-4 border-t border-gray-100">
              {!selectedVariant ? (
                <button 
                  disabled
                  className="w-full bg-gray-100 text-gray-400 py-3.5 rounded-xl font-heading font-bold uppercase tracking-widest text-xs cursor-not-allowed text-center"
                >
                  Please Select an Option First
                </button>
              ) : isOutOfStock ? (
                <button 
                  disabled
                  className="w-full bg-gray-100 text-gray-400 py-3.5 rounded-xl font-heading font-bold uppercase tracking-widest text-xs"
                >
                  Unavailable
                </button>
              ) : isInCart ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                    <button 
                      className="p-3.5 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => updateQuantity(cartItemId, cartItem.quantity - 1)}
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
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Quantity adjustment before adding to cart */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-600 uppercase tracking-wide font-mono">Quantity</span>
                    <div className="flex items-center border border-gray-200 rounded-lg bg-white">
                      <button 
                        type="button"
                        className="p-2 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors disabled:opacity-30 cursor-pointer"
                        onClick={() => setLocalQuantity(Math.max(1, localQuantity - 1))}
                        disabled={localQuantity <= 1}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-10 text-center font-bold text-sm font-mono">{localQuantity}</span>
                      <button 
                        type="button"
                        className="p-2 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors disabled:opacity-30 cursor-pointer"
                        onClick={() => setLocalQuantity(Math.min(selectedVariant.stock ?? 10, localQuantity + 1))}
                        disabled={localQuantity >= (selectedVariant.stock ?? 10)}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={handleAddToCart} 
                    className="w-full px-3.5 py-3 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs text-center"
                  >
                    <span>Add to Cart — {formatPHP(finalPrice * localQuantity)}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
