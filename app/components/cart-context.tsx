"use client";
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { getServerlessCatalog } from '@/lib/telegram-serverless-client';

const CartContext = createContext<any>(null);

export default function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<any[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const savedCart = localStorage.getItem('prime-cart');
        if (savedCart) {
          const parsed = JSON.parse(savedCart);
          if (Array.isArray(parsed)) {
            // Sanitize items
            const clean = parsed.filter(item => item && typeof item === 'object' && item.id);
            setCart(clean);
          }
        }
      }
    } catch (e) {
      console.warn("Notice: Local storage unavailable or failed to parse cart", e);
    } finally {
      setHydrated(true);
    }
  }, []);

  const restoreCart = () => {
    try {
      const savedCart = typeof window !== 'undefined' ? localStorage.getItem('prime-cart') : null;
      if (!savedCart) return;
      const parsed = JSON.parse(savedCart);
      if (!Array.isArray(parsed)) return;
      const clean = parsed.filter(item => item && typeof item === 'object' && item.id);
      setCart(previous => previous.length > 0 ? previous : clean);
    } catch (error) {
      console.warn('Saved cart could not be restored.', error);
    }
  };

  useEffect(() => {
    try {
      if (hydrated && typeof window !== 'undefined' && Array.isArray(cart)) {
        localStorage.setItem('prime-cart', JSON.stringify(cart));
      }
    } catch (e) {
      // Quietly ignore storage quota or sandbox restrictions
    }
  }, [cart, hydrated]);

  const addToCart = (product: any, quantity: number) => {
    if (!product || !product.id) return;
    setCart(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const existing = safePrev.find(item => item && item.id === product.id);
      if (existing) {
        return safePrev.map(item => item && item.id === product.id ? { ...item, quantity: (Number(item.quantity) || 1) + quantity, catalogUnavailable: false, catalogUnavailableReason: '' } : item);
      }
      return [...safePrev, { ...product, quantity: Number(quantity) || 1, selected: true }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => (Array.isArray(prev) ? prev.filter(item => item && item.id !== productId) : []));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    setCart(prev => {
      if (!Array.isArray(prev)) return [];
      if (quantity <= 0) return prev.filter(item => item && item.id !== productId);
      return prev.map(item => item && item.id === productId ? { ...item, quantity: Number(quantity) || 1 } : item);
    });
  };

  const toggleSelection = (productId: string, selected: boolean) => {
    setCart(prev => (Array.isArray(prev) ? prev.map(item => item && item.id === productId ? { ...item, selected } : item) : []));
  };

  const clearSelectedItems = () => {
    setCart(prev => (Array.isArray(prev) ? prev.filter(item => item && item.selected === false) : []));
  };

  // Checkout keeps its paid-for snapshot while the customer visits other tabs.
  // Remove only submitted quantities; preserve items added in the meantime.
  const clearCheckoutItems = (submitted: any[]) => {
    setCart(previous => previous.flatMap(item => {
      const line = submitted.find(row => String(row.id) === String(item.id));
      if (!line) return [item];
      const remaining = Math.max(0, Number(item.quantity) - Number(line.quantity));
      return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
    }));
  };

  const clearCart = () => {
    setCart([]);
  };

  // Refresh cart prices and stock from Telegram Serverless.
  useEffect(() => {
    let cancelled = false;
    const refreshCartInventory = async () => {
      try {
        // Cart reconciliation only needs product/variant IDs, price, and stock.
        // Resolving every catalog image here makes one failed media fetch abort
        // the entire inventory sync and can leave stale cart records behind.
        const products = await getServerlessCatalog({ resolveMedia: false });
        if (cancelled) return;
        setCart(previous => {
          if (!Array.isArray(previous)) return [];
          let changed = false;
          const next = previous.map(item => {
            if (!item?.id) return item;
            const productId = item.productId || (typeof item.id === 'string' && item.id.includes('_') ? item.id.split('_')[0] : item.id);
            const variantId = item.variantId || (typeof item.id === 'string' && item.id.includes('_') ? item.id.split('_').slice(1).join('_') : 'default');
            const product = products.find(row => row && typeof row === 'object' && String(row.id) === String(productId));
            if (!product || product.active === false || product.isActive === false) {
              if (item.catalogUnavailable === true) return item;
              changed = true;
              return { ...item, catalogUnavailable: true, catalogUnavailableReason: 'This item is no longer in the catalog.' };
            }
            const variants = Array.isArray(product.variants) ? product.variants : [];
            const variant = variants.find(row => String(row.id) === String(variantId));
            if (variants.length > 0 && !variant) {
              if (item.catalogUnavailable === true) return item;
              changed = true;
              return { ...item, catalogUnavailable: true, catalogUnavailableReason: 'This option is no longer available.' };
            }
            const stock = Math.max(0, Number(variant?.stock ?? product.stock) || 0);
            const price = Math.max(0, Number(variant?.price ?? product.price) || 0);
            const imageReference = String(variant?.imageUrl || product.imageUrl || '');
            const imageUrl = imageReference || String(item.imageUrl || '');
            const quantity = Math.min(Math.max(0, Number(item.quantity) || 1), stock);
            const unavailable = stock < 1;
            if (Number(item.stock) !== stock || Number(item.price) !== price || item.imageUrl !== imageUrl || Number(item.quantity) !== quantity || item.catalogUnavailable !== unavailable) {
              changed = true;
              return { ...item, stock, price, imageUrl, quantity: unavailable ? Number(item.quantity) || 1 : quantity, catalogUnavailable: unavailable, catalogUnavailableReason: unavailable ? 'Out of stock.' : '' };
            }
            return item;
          }).filter(item => item && Number(item.quantity) > 0);
          return changed || next.length !== previous.length ? next : previous;
        });
      } catch (error) {
        console.warn('Telegram Serverless inventory refresh failed:', error);
      }
    };
    void refreshCartInventory();
    const timer = window.setInterval(refreshCartInventory, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Sync cart items with fresh server product data
  const syncWithServerData = (serverProducts: any[]) => {
    if (!Array.isArray(serverProducts)) return;
    setCart(prev => {
      if (!Array.isArray(prev)) return [];
      let changed = false;
      const updatedCart = prev.map(item => {
        if (!item || !item.id) return item;
        const productId = item.productId || (
          typeof item.id === 'string' && item.id.includes('_')
            ? item.id.split('_')[0]
            : item.id
        );
        const variantId = item.variantId || (
          typeof item.id === 'string' && item.id.includes('_')
            ? item.id.split('_').slice(1).join('_')
            : 'default'
        );
        const serverProduct = serverProducts.find(p => p && String(p.id) === String(productId));
        if (!serverProduct || serverProduct.active === false || serverProduct.isActive === false) {
          if (item.catalogUnavailable === true) return item;
          changed = true;
          return { ...item, catalogUnavailable: true, catalogUnavailableReason: 'This item is no longer in the catalog.' };
        }

        const serverVariants = Array.isArray(serverProduct.variants) ? serverProduct.variants : [];
        const serverVariant = serverVariants.find((v: any) => String(v?.id) === String(variantId));
        if (serverVariants.length > 0 && !serverVariant) {
          if (item.catalogUnavailable === true) return item;
          changed = true;
          return { ...item, catalogUnavailable: true, catalogUnavailableReason: 'This option is no longer available.' };
        }
        const liveStock = serverVariant ? Math.max(0, Number(serverVariant.stock) || 0) : Math.max(0, Number(serverProduct.stock) || 0);
        const livePrice = serverVariant ? Number(serverVariant.price) || 0 : Number(serverProduct.price) || 0;
        const imageReference = String(serverVariant?.imageUrl || serverProduct.imageUrl || '');
        const liveImage = imageReference || String(item.imageUrl || '');
        const newQty = Math.min(Math.max(0, Number(item.quantity) || 1), liveStock);
        const liveName = serverVariant ? serverProduct.name + ' - ' + serverVariant.name : serverProduct.name;

        const unavailable = liveStock < 1;
        if (item.price !== livePrice || item.name !== liveName || item.quantity !== newQty || item.imageUrl !== liveImage || Number(item.stock) !== liveStock || item.catalogUnavailable !== unavailable) {
          changed = true;
          return { ...item, price: livePrice, name: liveName, quantity: unavailable ? Number(item.quantity) || 1 : newQty, imageUrl: liveImage, stock: liveStock, productId, variantId, catalogUnavailable: unavailable, catalogUnavailableReason: unavailable ? 'Out of stock.' : '' };
        }
        return item;
      }).filter(item => item && item.quantity > 0);

      if (changed || updatedCart.length !== prev.length) {
        return updatedCart;
      }
      return prev;
    });
  };

  const cartTotal = useMemo(() => {
    if (!Array.isArray(cart)) return 0;
    return cart
      .filter(item => item && item.selected !== false && item.catalogUnavailable !== true)
      .reduce((total, item) => total + ((Number(item.price) || 0) * (Number(item.quantity) || 1)), 0);
  }, [cart]);

  const cartCount = useMemo(() => {
    if (!Array.isArray(cart)) return 0;
    return cart
      .filter(item => item && item.catalogUnavailable !== true)
      .reduce((count, item) => count + (Number(item.quantity) || 0), 0);
  }, [cart]);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, toggleSelection, clearSelectedItems, clearCheckoutItems, clearCart, cartTotal, cartCount, syncWithServerData, restoreCart, setCart }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
