"use client";
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

const CartContext = createContext<any>(null);

export default function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<any[]>([]);

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
    }
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && Array.isArray(cart)) {
        localStorage.setItem('prime-cart', JSON.stringify(cart));
      }
    } catch (e) {
      // Quietly ignore storage quota or sandbox restrictions
    }
  }, [cart]);

  const addToCart = (product: any, quantity: number) => {
    if (!product || !product.id) return;
    setCart(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const existing = safePrev.find(item => item && item.id === product.id);
      if (existing) {
        return safePrev.map(item => item && item.id === product.id ? { ...item, quantity: (Number(item.quantity) || 1) + quantity } : item);
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

  const clearCart = () => {
    setCart([]);
  };

  // Live inventory sync from Postgres. The database remains the source of truth;
  // this subscription only keeps the cart UI current between checkout attempts.
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel('prime-products-stock')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products' },
        (payload) => {
          const product = payload.new as any;
          if (!product?.id) return;

          const bundleConfig = product.bundle_config && typeof product.bundle_config === 'object'
            ? product.bundle_config
            : {};
          const variants = Array.isArray(bundleConfig.variants) ? bundleConfig.variants : [];

          setCart(prev => {
            if (!Array.isArray(prev)) return [];
            let changed = false;
            const next = prev.map(item => {
              if (!item?.id) return item;
              const productId = item.productId || (
                typeof item.id === 'string' && item.id.includes('_')
                  ? item.id.split('_')[0]
                  : item.id
              );
              if (productId !== product.id) return item;
              const variantId = item.variantId || (
                typeof item.id === 'string' && item.id.includes('_')
                  ? item.id.split('_').slice(1).join('_')
                  : 'default'
              );
              const liveVariant = variants.find((v: any) => String(v?.id) === String(variantId));
              const liveStock = liveVariant ? Math.max(0, Number(liveVariant.stock) || 0) : Math.max(0, Number(product.stock) || 0);
              const livePrice = liveVariant ? Number(liveVariant.price) || 0 : Number(product.price) || 0;
              const liveImage = liveVariant?.imageUrl || product.image_url || item.imageUrl || '';
              const currentQty = Math.max(0, Number(item.quantity) || 0);
              const nextQty = Math.min(currentQty, liveStock);
              if (item.stock !== liveStock || Number(item.price) !== livePrice || item.imageUrl !== liveImage || nextQty !== currentQty) {
                changed = true;
                return { ...item, stock: liveStock, price: livePrice, imageUrl: liveImage, quantity: nextQty };
              }
              return item;
            }).filter(item => item && Number(item.quantity) > 0);
            return changed ? next : prev;
          });
        }
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') console.warn('Product stock realtime status:', status);
      });

    return () => {
      void supabase.removeChannel(channel);
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
        const serverProduct = serverProducts.find(p => p && p.id === productId);
        if (!serverProduct) return item;

        const serverVariants = Array.isArray(serverProduct.variants) ? serverProduct.variants : [];
        const serverVariant = serverVariants.find((v: any) => String(v?.id) === String(variantId));
        const liveStock = serverVariant ? Math.max(0, Number(serverVariant.stock) || 0) : Math.max(0, Number(serverProduct.stock) || 0);
        const livePrice = serverVariant ? Number(serverVariant.price) || 0 : Number(serverProduct.price) || 0;
        const liveImage = serverVariant?.imageUrl || serverProduct.imageUrl || item.imageUrl || '';
        const newQty = Math.min(Math.max(0, Number(item.quantity) || 1), liveStock);
        const liveName = serverVariant ? serverProduct.name + ' - ' + serverVariant.name : serverProduct.name;

        if (item.price !== livePrice || item.name !== liveName || item.quantity !== newQty || item.imageUrl !== liveImage || Number(item.stock) !== liveStock) {
          changed = true;
          return { ...item, price: livePrice, name: liveName, quantity: newQty, imageUrl: liveImage, stock: liveStock, productId, variantId };
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
      .filter(item => item && item.selected !== false)
      .reduce((total, item) => total + ((Number(item.price) || 0) * (Number(item.quantity) || 1)), 0);
  }, [cart]);

  const cartCount = useMemo(() => {
    if (!Array.isArray(cart)) return 0;
    return cart
      .filter(Boolean)
      .reduce((count, item) => count + (Number(item.quantity) || 0), 0);
  }, [cart]);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, toggleSelection, clearSelectedItems, clearCart, cartTotal, cartCount, syncWithServerData, setCart }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
