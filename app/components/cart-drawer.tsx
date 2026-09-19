"use client";

import React, { useEffect, useState, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { useCart } from './cart-context';
import { ShoppingCart, X, Plus, Minus, Trash2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { formatPHP } from "@/lib/currency";
import { calculateChargesBreakdown } from "@/lib/charges";
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
        <div className="fixed inset-0 z-50 flex justify-center bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-[430px] bg-white h-full shadow-2xl flex flex-col p-6 items-center justify-center text-center relative border-x border-slate-200">
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
  const [checkoutStatus, setCheckoutStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCheckoutStatus({ type: null, message: '' });

      // Sync Products
      fetch("/api/products")
        .then(res => res.json())
        .then(data => {
           if (data && Array.isArray(data) && typeof syncWithServerData === 'function') {
             syncWithServerData(data);
           }
        })
        .catch(err => console.warn("Failed to sync cart data", err));

      // Fetch Active Charges Fresh with No Cache
      setLoadingCharges(true);
      fetch(`/api/admin/charges?_t=${Date.now()}`, {
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
  
  // Calculate Grand Total & Charges Breakdown via lib/charges.ts
  const { totalChargesAmount, grandTotal, chargesBreakdown } = useMemo(() => {
    const validCartTotal = Number.isFinite(cartTotal) ? Math.max(0, cartTotal) : 0;
    
    if (selectedItems.length === 0 || validCartTotal === 0) {
      return { totalChargesAmount: 0, grandTotal: validCartTotal, chargesBreakdown: [] };
    }
    
    try {
      const { totalChargesAmount: computedTotal, computedCharges } = calculateChargesBreakdown(activeCharges, validCartTotal);
      return {
        totalChargesAmount: computedTotal,
        grandTotal: validCartTotal + computedTotal,
        chargesBreakdown: computedCharges.map(c => ({
          id: c.id,
          name: c.name,
          computedAmount: c.computedAmount,
          rate: c.rate,
          type: c.type
        }))
      };
    } catch (e) {
      console.warn("Charges calculation error fallback", e);
      return { totalChargesAmount: 0, grandTotal: validCartTotal, chargesBreakdown: [] };
    }
  }, [cartTotal, activeCharges, selectedItems.length]);

  if (!isOpen) return null;

  const handleCheckout = async () => {
    if (selectedItems.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setCheckoutStatus({ type: null, message: '' });

    try {
      let storedUserId = "";
      let storedName = "Customer";
      let storedUsername = "";
      let storedMemberId = "";

      if (typeof window !== 'undefined') {
        try {
          storedUserId = sessionStorage.getItem("prime_customer_id") || localStorage.getItem("prime_customer_id") || "";
          storedName = sessionStorage.getItem("prime_customer_name") || localStorage.getItem("prime_customer_name") || "Customer";
          storedUsername = sessionStorage.getItem("prime_customer_username") || localStorage.getItem("prime_customer_username") || "";
          storedMemberId = sessionStorage.getItem("prime_member_id") || localStorage.getItem("prime_member_id") || "";
        } catch (e) {}
      }
      
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: storedUserId,
          customerName: storedName,
          customerUsername: storedUsername,
          primeMemberId: storedMemberId,
          items: selectedItems,
          subTotal: cartTotal || 0,
          appliedCharges: chargesBreakdown || [],
          totalAmount: grandTotal || 0,
          notes: "Storefront Checkout Order"
        })
      });

      if (res.ok) {
        const data = await res.json();
        setCheckoutStatus({
          type: 'success',
          message: `Order #${data.orderNumber || 'COMPLETED'} placed successfully!`
        });
        if (typeof clearSelectedItems === 'function') {
          clearSelectedItems();
        }
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        const err = await res.json().catch(() => ({}));
        setCheckoutStatus({
          type: 'error',
          message: err.error || "Failed to create order. Please try again."
        });
      }
    } catch (e: any) {
      console.error("Order checkout error", e);
      setCheckoutStatus({
        type: 'error',
        message: e?.message || "Order checkout encountered an error. Please retry."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/60 transition-opacity">
      <div className="w-full max-w-[430px] bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-300 relative border-x border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-gray-900" />
            <h2 className="text-xl font-heading font-bold uppercase tracking-wide">Your Cart</h2>
            <span className="bg-black text-white text-xs font-bold px-2 py-0.5 rounded-full ml-2">
              {cartCount || 0}
            </span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Notification Banner (Replaces window.alert for sandboxed iframes) */}
        {checkoutStatus.type && (
          <div className={`p-4 mx-4 mt-3 rounded-lg flex items-center gap-3 text-xs font-bold uppercase tracking-wider ${
            checkoutStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {checkoutStatus.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
            )}
            <span>{checkoutStatus.message}</span>
          </div>
        )}

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {safeCart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
              <ShoppingCart className="w-16 h-16 opacity-20" />
              <p className="font-medium text-lg">Your cart is empty</p>
              <button 
                onClick={onClose}
                className="mt-4 px-6 py-2 bg-black text-white font-bold rounded hover:bg-gray-800 transition-colors uppercase text-sm tracking-wide"
              >
                Start Shopping
              </button>
            </div>
          ) : (
            safeCart.map((item: any) => {
              if (!item || !item.id) return null;
              return (
                <div key={item.id} className="flex gap-4 p-3 bg-gray-50 rounded-lg border border-gray-100 items-center">
                  <input 
                    type="checkbox" 
                    checked={item.selected !== false}
                    onChange={(e) => toggleSelection && toggleSelection(item.id, e.target.checked)}
                    className="w-5 h-5 cursor-pointer accent-black shrink-0"
                  />
                  <img 
                    src={item.imageUrl || "https://picsum.photos/seed/prime/100"} 
                    alt={item.name || "Item"} 
                    className="w-16 h-16 object-cover rounded bg-white border border-gray-200"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "https://picsum.photos/seed/prime/100";
                    }}
                  />
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-heading font-normal uppercase text-gray-900 line-clamp-1">{item.name || "Product"}</h3>
                        <p className="text-sm font-medium text-gray-600 font-ibm-condensed">{formatPHP(item.price || 0)}</p>
                      </div>
                      <button 
                        onClick={() => removeFromCart && removeFromCart(item.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center border border-gray-200 rounded bg-white">
                        <button 
                          className="px-2 py-1 text-gray-500 hover:text-black hover:bg-gray-50"
                          onClick={() => updateQuantity && updateQuantity(item.id, (item.quantity || 1) - 1)}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-bold w-8 text-center">{item.quantity || 1}</span>
                        <button 
                          className="px-2 py-1 text-gray-500 hover:text-black hover:bg-gray-50"
                          onClick={() => updateQuantity && updateQuantity(item.id, (item.quantity || 1) + 1)}
                        >
                          <Plus className="w-3 h-3" />
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
          <div className="p-4 pb-12 border-t border-gray-100 bg-white space-y-4">
            
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-base">
                <span className="font-heading font-bold uppercase tracking-wider text-gray-700">Subtotal:</span>
                <span className="font-heading font-bold text-xl text-black font-ibm-condensed">{formatPHP(cartTotal || 0)}</span>
              </div>
              <p className="text-[11px] text-gray-500 font-mono">
                Delivery fees & applicable charges are calculated during checkout.
              </p>
            </div>

            <button 
              disabled={selectedItems.length === 0}
              onClick={() => setIsCheckoutOpen(true)}
              className="w-full px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs text-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Proceed to Checkout ({selectedItems.length})
            </button>
          </div>
        )}
      </div>

      {/* Multi-Step Checkout Modal */}
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
