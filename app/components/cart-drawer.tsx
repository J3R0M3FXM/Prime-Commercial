"use client";
import { readCheckoutDraft, clearCheckoutDraft } from '@/lib/checkout-draft';

import { getServerlessCatalog } from "@/lib/telegram-serverless-client";

import React, { useEffect, useState, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { useCart } from './cart-context';
import { ShoppingCart, X, Plus, Minus, AlertCircle, RefreshCw } from 'lucide-react';
import { formatPHP } from "@/lib/currency";
import CheckoutModal from './checkout-modal';
import PrimePageHeading from './prime-page-heading';
import TelegramMediaImage from './telegram-media-image';

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
        <div className="w-full flex justify-center bg-gray-50 py-[4.8px]">
          <div className="w-full max-w-[760px] min-h-[calc(100vh-120px)] bg-white shadow-sm flex flex-col p-3 sm:p-3.5 items-center justify-center text-center relative border-x border-slate-200">
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

type CartDrawerProps = { isOpen: boolean; onClose: () => void; onCheckoutOpenChange?: (open: boolean) => void; liveQueue?: { averageReadyMinutes: number | null; ordersInQueue: number; ordersInProcessing: number } | null; onViewOrder?: (order: any) => void };
function CartDrawerContent({ isOpen, onClose, onCheckoutOpenChange, liveQueue, onViewOrder }: CartDrawerProps) {
  const { cart, removeFromCart, updateQuantity, toggleSelection, clearCheckoutItems, cartTotal, cartCount, syncWithServerData } = useCart();
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState("");
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutItems, setCheckoutItems] = useState<any[]>([]);

  useEffect(() => {
    let owner = '';
    try { owner = localStorage.getItem('prime_customer_id') || ''; } catch {}
    const draft = readCheckoutDraft(owner);
    if (draft) {
      setCheckoutItems(draft.items);
      setIsCheckoutOpen(true);
      onCheckoutOpenChange?.(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setInventoryLoading(true);
    setInventoryError('');
    // Cart needs stock and prices only. Checkout loads its own authoritative charges.
    void getServerlessCatalog({ resolveMedia: false }).then(products => {
      if (!cancelled && typeof syncWithServerData === 'function') syncWithServerData(products);
    }).catch(error => {
      if (!cancelled) setInventoryError(error instanceof Error ? error.message : 'Could not refresh cart inventory.');
    }).finally(() => { if (!cancelled) setInventoryLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, refreshAttempt]);

  const safeCart = Array.isArray(cart) ? cart : [];
  const selectedItems = useMemo(() => {
    return safeCart.filter((item: any) => item && typeof item === 'object' && item.selected !== false && item.catalogUnavailable !== true);
  }, [safeCart]);
  
  if (!isOpen && !isCheckoutOpen) return null;

  return (
    <div className={isOpen ? "prime-cart w-full flex justify-center bg-gray-50 py-[4.8px]" : "hidden"}>
      {!isCheckoutOpen && (
        <div className="w-full max-w-[430px] bg-white h-auto max-h-[calc(100vh-120px)] shadow-sm flex flex-col relative border-x border-slate-200">
        
        {/* Header */}
        <PrimePageHeading icon={<ShoppingCart />} title="CART" actions={<>
          <span className="prime-page-heading__badge">{cartCount || 0}</span>
          <button type="button" onClick={() => setRefreshAttempt(attempt => attempt + 1)} disabled={inventoryLoading} aria-label="Refresh cart" title="Refresh cart"><RefreshCw className={inventoryLoading ? "animate-spin" : ""} /></button>
          <button type="button" onClick={onClose} aria-label="Close cart" title="Close cart"><X /></button>
        </>} />

        {inventoryLoading && <p role="status" className="px-3 py-2 font-mono text-xs text-slate-500">Updating prices and stock…</p>}
        {inventoryError && <div role="alert" className="mx-3 my-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p>Could not refresh prices and stock. Your cart has been kept.</p><button type="button" className="mt-2 min-h-9 font-bold underline" onClick={() => setRefreshAttempt(attempt => attempt + 1)}>Retry cart refresh</button></div>}
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
              const storedName = String(item.name || "Product");
              const variantSeparator = storedName.lastIndexOf(" - ");
              const displayProductName = String(item.productName || (variantSeparator >= 0 ? storedName.slice(0, variantSeparator) : storedName));
              const displayVariantName = String(item.variantName || item.selectedVariant?.name || (variantSeparator >= 0 ? storedName.slice(variantSeparator + 3) : ""));
              return (
                <div key={item.id} className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
                  <div className="flex h-14 shrink-0 items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={item.selected !== false && item.catalogUnavailable !== true}
                      disabled={item.catalogUnavailable === true}
                      onChange={(e) => toggleSelection && toggleSelection(item.id, e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-slate-900 shrink-0"
                    />
                    <TelegramMediaImage
                      src={item.imageUrl || "/product-image-unavailable.svg"}
                      alt={item.name || "Item"}
                      className="h-14 w-14 aspect-square object-cover rounded-lg bg-white border border-gray-200 shrink-0"
                      fallbackSrc="/product-image-unavailable.svg"
                    />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <h3 className="prime-cart__product-name line-clamp-2 text-[12px] leading-tight text-gray-900">{displayProductName}</h3>
                    {displayVariantName && <p className="prime-cart__variant mt-0.5 line-clamp-1 text-[10px] leading-tight text-slate-600">{displayVariantName}</p>}
                    <p className="prime-cart__value mt-1 text-[11px] text-gray-800 font-mono">{formatPHP(item.price || 0)}</p>
                    {item.catalogUnavailable === true && <p className="mt-1 text-[10px] font-semibold text-red-700">{item.catalogUnavailableReason || 'No longer available. Remove this item to continue.'}</p>}
                  </div>
                  <div className="flex h-14 w-[68px] shrink-0 flex-col gap-0.5">
                    <button type="button" onClick={() => removeFromCart && removeFromCart(item.id)} className="h-[27px] w-full rounded-md border border-red-100 bg-white px-1 text-[9px] font-semibold uppercase tracking-wide text-red-700 shadow-sm transition hover:bg-red-50" title="Remove item">Remove</button>
                    <div className="grid h-[27px] w-full grid-cols-3 items-center overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
                        <button 
                          className="flex h-full items-center justify-center text-gray-500 hover:text-black hover:bg-gray-50 cursor-pointer"
                          onClick={() => updateQuantity && updateQuantity(item.id, (item.quantity || 1) - 1)}
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                        <span className="prime-cart__value text-[10px] font-mono text-center">{item.quantity || 1}</span>
                        <button 
                          className="flex h-full items-center justify-center text-gray-500 hover:text-black hover:bg-gray-50 cursor-pointer"
                          onClick={() => updateQuantity && updateQuantity(item.id, (item.quantity || 1) + 1)}
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
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
                <span className="prime-cart__value font-mono text-base text-black">{formatPHP(cartTotal || 0)}</span>
              </div>
              <p className="text-[10px] text-gray-400 font-mono">
                Delivery & charges calculated at checkout.
              </p>
            </div>

            <button 
              disabled={selectedItems.length === 0 || inventoryLoading || Boolean(inventoryError)}
              onClick={() => {
                setCheckoutItems(selectedItems);
                setIsCheckoutOpen(true);
                onCheckoutOpenChange?.(true);
              }}
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
        liveQueue={liveQueue}
        onViewOrder={onViewOrder}
        onContinueShopping={onClose}
        isOpen={isCheckoutOpen}
        onClose={() => {
          clearCheckoutDraft(localStorage.getItem('prime_customer_id') || '');
          setIsCheckoutOpen(false);
          onCheckoutOpenChange?.(false);
        }}
        selectedItems={checkoutItems}
        onOrderSuccess={() => {
          if (typeof clearCheckoutItems === 'function') {
            clearCheckoutItems(checkoutItems);
          }
        }}
      />
    </div>
  );
}

export default function CartDrawer(props: CartDrawerProps) {
  return (
    <CartErrorBoundary onClose={props.onClose}>
      <CartDrawerContent {...props} />
    </CartErrorBoundary>
  );
}
