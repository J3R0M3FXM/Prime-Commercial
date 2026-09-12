"use client";
import React, { useState } from 'react';
import { useCart } from './cart-context';
import { X, Check, Minus, Plus } from 'lucide-react';

export default function ProductModal({ product, onClose }: { product: any, onClose: () => void }) {
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);

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
            <h2 className="text-2xl font-heading font-black uppercase text-gray-900 leading-tight">{product.name}</h2>
            <span className="text-2xl font-heading font-bold text-gray-900 shrink-0">${Number(finalPrice).toFixed(2)}</span>
          </div>
          
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
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

          {!isOutOfStock && (
            <div className="flex items-center gap-4 mb-2">
              <span className="font-bold text-gray-700 uppercase tracking-wide text-sm">Quantity</span>
              <div className="flex items-center border border-gray-200 rounded-lg">
                <button 
                  className="p-3 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors disabled:opacity-50"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center font-bold text-lg">{quantity}</span>
                <button 
                  className="p-3 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors disabled:opacity-50"
                  onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                  disabled={quantity >= product.stock}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 shrink-0">
          <button 
            onClick={() => { addToCart(product, quantity); onClose(); }} 
            disabled={isOutOfStock}
            className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-gray-800 transition-colors disabled:bg-gray-200 disabled:text-gray-400 shadow-lg disabled:shadow-none"
          >
            {isOutOfStock ? "Out of Stock" : `Add to Cart - $${(finalPrice * quantity).toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
