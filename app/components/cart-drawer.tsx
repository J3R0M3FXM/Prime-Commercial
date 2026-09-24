"use client";

import { authenticatedFetch } from "./telegram-auth-client";

import React, { useEffect, useState, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { useCart } from './cart-context';
import { ShoppingCart, X, Plus, Minus, Trash2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { formatPHP } from "@/lib/currency";
import CheckoutModal from './checkout-modal';

// Defensive Error Boundary to ensure Cart never crashes the host page
interface ErrorBoundaryProps {
  children: ReactNode;
  onClose: () => void;
}
interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class CartErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("CartDrawer Caught Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full flex justify-center bg-gray-50 py-3">
          <div className="w-full max-w-[760px] min-h-[calc(100vh-120px)] bg-white shadow-sm flex flex-col p-6 items-center justify-center text-center relative border-x border-slate-200">
            <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h3 className="font-heading font-black uppercase tracking-wider text-gray-900 text-lg mb-2">Cart Recovered</h3>
            <p className="text-gray-500 text-sm mb-6 max-w-xs leading-relaxed">
              We encountered a temporary calculation hiccup with cart data.
            </p>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem('prime-cart');
                  } catch (e) {}
                  window.location.reload();
                }}
                className="w-full bg-black text-white font-bold py-3 rounded-lg text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-gray-800"
              >
                <RefreshCw className="w-4 h-4" /> Reset Cart & Reload
              </button>
              <button
                onClick={() => {
                  this.setState({ hasError: false });
                  this.props.onClose();
                }}
                className="w-full bg-gray-100 text-gray-700 font-bold py-3 rounded-lg text-xs uppercase tracking-widest hover:bg-gray-200"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function CartDrawerContent({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { cart, removeFromCart, updateQuantity, toggleSelection, clearSelectedItems, cartTotal, cartCount, syncWithServerData } = useCart();
  const [activeCharges, setActiveCharges] = useState<any[]>([]);
  const [loadingCharges, setLoadingCharges] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Sync Products
      authenticatedFetch("/api/products")
        .then(res => res.json())
        .then(data => {
           if (data && Array.isArray(data) && typeof syncWithServerData === 'function') {
             syncWithServerData(data);
           }
        })
        .catch(err => console.warn("Failed to sync cart data", err));

      // Fetch Active Charges Fresh with No Cache
      setLoadingCharges(true);
      authenticatedFetch(`/api/charges?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Pragma": "no-cache" }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setActiveCharges(data);
          }
        })
        .catch(err => console.warn("Failed to fetch charges", err))
        .finally(() => setLoadingCharges(false));
    }
  }, [isOpen]); 

  const safeCart = Array.isArray(cart) ? cart : [];
  const selectedItems = useMemo(() => {
    return safeCart.filter((item: any) => item && typeof item === 'object' && item.selected !== false);
  }, [safeCart]);
  
  if (!isOpen) return null;

  return (
    <div className="w-full flex justify-center bg-gray-50 py-3">
      {!isCheckoutOpen && (
        <div className="w-full max-w-[760px] bg-white h-auto max-h-[calc(100vh-120px)] shadow-sm flex flex-col relative border-x border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-100">
          <div className="flex items-center gap-1.5">
            <ShoppingCart className="w-4 h-4 text-gray-900" />
            <h2 className="text-base font-heading font-bold uppercase tracking-wide">Your Cart</h2>
            <span className="bg-black text-white text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ml-1">
              {cartCount || 0}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors cursor-pointer">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Cart Items */}
        <div className="overflow-y-auto p-2.5 space-y-2 max-h-[calc(100vh-250px)]">
          {safeCart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3 py-12">
              <ShoppingCart className="w-12 h-12 opacity-20" />
              <p className="font-medium text-sm font-mono">Your cart is empty</p>
              <button 
                onClick={onClose}
                className="mt-2 px-4 py-1.5 bg-black text-white font-bold rounded-lg hover:bg-gray-800 transition-colors uppercase text-xs tracking-wide"
              >
                Start Shopping
              </button>
            </div>
          ) : (
            safeCart.map((item: any) => {
              if (!item || !item.id) return null;
              return (
                <div key={item.id} className="flex gap-2 p-1.5 bg-gray-50 rounded-lg border border-gray-100 items-center">
                  <input 
                    type="checkbox" 
                    checked={item.selected !== false}
                    onChange={(e) => toggleSelection && toggleSelection(item.id, e.target.checked)}
                    className="w-3.5 h-3.5 cursor-pointer accent-black shrink-0"
                  />
                  <img 
                    src={item.imageUrl || "https://picsum.photos/seed/prime/100"} 
                    alt={item.name || "Item"} 
                    className="w-10 h-10 object-cover rounded-md bg-white border border-gray-200 shrink-0"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "https://picsum.photos/seed/prime/100";
                    }}
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="flex justify-between items-start gap-1">
                      <div className="min-w-0">
                        <h3 className="font-heading font-normal uppercase text-gray-900 line-clamp-1 text-[11px]">{item.name || "Product"}</h3>
                        <p className="text-[11px] font-bold text-gray-800 font-mono mt-0.5">{formatPHP(item.price || 0)}</p>
                      </div>
                      <button 
                        onClick={() => removeFromCart && removeFromCart(item.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors cursor-pointer shrink-0"
                        title="Remove item"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center border border-gray-200 rounded bg-white">
                        <button 
                          className="px-1.5 py-0.5 text-gray-500 hover:text-black hover:bg-gray-50 cursor-pointer"
                          onClick={() => updateQuantity && updateQuantity(item.id, (item.quantity || 1) - 1)}
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                        <span className="text-[11px] font-mono font-bold w-5 text-center">{item.quantity || 1}</span>
                        <button 
                          className="px-1.5 py-0.5 text-gray-500 hover:text-black hover:bg-gray-50 cursor-pointer"
                          onClick={() => updateQuantity && updateQuantity(item.id, (item.quantity || 1) + 1)}
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {safeCart.length > 0 && (
          <div className="p-3 pb-3 border-t border-gray-100 bg-white space-y-2.5">
            
            <div className="space-y-1">
              <div className="flex justify-between items-center text-sm">
                <span className="font-heading font-bold uppercase tracking-wider text-gray-700 text-xs">Subtotal:</span>
                <span className="font-mono font-bold text-base text-black">{formatPHP(cartTotal || 0)}</span>
              </div>
              <p className="text-[10px] text-gray-400 font-mono">
                Delivery & charges calculated at checkout.
              </p>
            </div>

            <button 
              disabled={selectedItems.length === 0}
              onClick={() => setIsCheckoutOpen(true)}
              className="w-full py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shadow-2xs text-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Proceed to Checkout ({selectedItems.length})
            </button>
          </div>
        )}
        </div>
      )}

      {/* Multi-Step Checkout Modal replaces the cart panel while checkout is open */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        selectedItems={selectedItems}
        onOrderSuccess={() => {
          if (typeof clearSelectedItems === 'function') {
            clearSelectedItems();
          }
        }}
      />
    </div>
  );
}

export default function CartDrawer(props: { isOpen: boolean; onClose: () => void }) {
  if (!props.isOpen) return null;
  return (
    <CartErrorBoundary onClose={props.onClose}>
      <CartDrawerContent {...props} />
    </CartErrorBoundary>
  );
}
