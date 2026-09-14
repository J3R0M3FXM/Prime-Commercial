"use client";
import React, { useState, useEffect } from 'react';
import { useCart } from './cart-context';
import { X, Check, Minus, Plus, ShoppingCart } from 'lucide-react';
import { formatPHP } from "@/lib/currency";

export default function ProductModal({ product, onClose }: { product: any, onClose: () => void }) {
  const { cart, addToCart, updateQuantity } = useCart();
  
  const cartItem = cart.find((item: any) => item.id === product?.id);
  const isInCart = !!cartItem;
  
  const [localQuantity, setLocalQuantity] = useState(1);
  const quantity = isInCart ? cartItem.quantity : localQuantity;

  if (!product) return null;

  const isOutOfStock = product.stock === 0;
  const hasBundle = product.bundleConfig?.enabled;
  const finalPrice = hasBundle && quantity > 1 
    ? product.price * (1 - (product.bundleConfig.discount / 100))
    : product.price;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-0 bg-black/60 backdrop-blur-sm transition-opacity">
      <div 
        className="bg-white w-full max-w-lg sm:rounded-2xl rounded-t-2xl sm:rounded-b-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:fade-in-20 relative max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 z-10 p-2 bg-white/80 backdrop-blur-md text-gray-900 rounded-full hover:bg-white transition-colors shadow-sm"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative aspect-[4/3] bg-gray-50 shrink-0">
          <img 
            src={product.imageUrl || "https://picsum.photos/seed/prime/600"} 
            alt={product.name} 
            className={`w-full h-full object-cover ${isOutOfStock ? 'opacity-50 grayscale' : ''}`} 
          />
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex justify-between items-start gap-4 mb-2">
            <h2 className="text-2xl font-heading font-normal uppercase text-gray-900 leading-tight">{product.name}</h2>
            <span className="text-2xl font-heading font-normal text-gray-900 shrink-0">{formatPHP(finalPrice)}</span>
          </div>
          
          <p className="text-sm font-heading uppercase tracking-widest text-gray-400 mb-4">
            {product.category || "General"}
          </p>
          
          <p className="text-gray-600 leading-relaxed mb-6">
            {product.description || "No description provided for this product. Premium quality guaranteed."}
          </p>

          {hasBundle && !isOutOfStock && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-6 flex items-start gap-3">
              <div className="mt-0.5 bg-emerald-500 text-white rounded-full p-1">
                <Check className="w-3 h-3" />
              </div>
              <div>
                <p className="font-bold text-emerald-800 text-sm uppercase tracking-wide">Buy More, Save More</p>
                <p className="text-emerald-600 text-sm mt-1">
                  Add 2 or more to get <span className="font-bold">{product.bundleConfig.discount}% off</span> each item.
                </p>
              </div>
            </div>
          )}

          {!isOutOfStock && !isInCart && (
            <div className="flex items-center gap-4 mb-2">
              <span className="font-bold text-gray-700 uppercase tracking-wide text-sm">Quantity</span>
              <div className="flex items-center border border-gray-200 rounded-lg">
                <button 
                  className="p-3 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors disabled:opacity-50"
                  onClick={() => setLocalQuantity(Math.max(1, localQuantity - 1))}
                  disabled={localQuantity <= 1}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center font-bold text-lg">{localQuantity}</span>
                <button 
                  className="p-3 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors disabled:opacity-50"
                  onClick={() => setLocalQuantity(Math.min(product.stock, localQuantity + 1))}
                  disabled={localQuantity >= product.stock}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 shrink-0">
          {isOutOfStock ? (
            <button 
              disabled
              className="w-full bg-gray-200 text-gray-400 py-4 rounded-xl font-heading font-normal uppercase tracking-widest text-sm"
            >
              Out of Stock
            </button>
          ) : isInCart ? (
            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <button 
                className="p-4 sm:p-5 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors"
                onClick={() => updateQuantity(cartItem.id, cartItem.quantity - 1)}
              >
                <Minus className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
              <div className="flex flex-col items-center">
                <span className="text-xl sm:text-2xl font-bold">{cartItem.quantity}</span>
                <span className="text-[10px] sm:text-xs text-gray-500 font-bold uppercase tracking-widest">In Cart</span>
              </div>
              <button 
                className="p-4 sm:p-5 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors disabled:opacity-50"
                onClick={() => updateQuantity(cartItem.id, cartItem.quantity + 1)}
                disabled={cartItem.quantity >= product.stock}
              >
                <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => { addToCart(product, localQuantity); onClose(); }} 
              className="w-full flex items-center justify-center gap-3 bg-black text-white py-4 rounded-xl font-heading font-normal uppercase tracking-widest text-sm hover:bg-gray-800 transition-colors shadow-lg"
            >
              <ShoppingCart className="w-5 h-5" />
              <span>Add to Cart - {formatPHP(finalPrice * localQuantity)}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
