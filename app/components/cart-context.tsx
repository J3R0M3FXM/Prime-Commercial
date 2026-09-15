"use client";
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

const CartContext = createContext<any>(null);

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
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

  // Sync cart items with fresh server product data
  const syncWithServerData = (serverProducts: any[]) => {
    if (!Array.isArray(serverProducts)) return;
    setCart(prev => {
      if (!Array.isArray(prev)) return [];
      let changed = false;
      const updatedCart = prev.map(item => {
        if (!item || !item.id) return item;
        const serverProduct = serverProducts.find(p => p && p.id === item.id);
        if (!serverProduct) return item;
        
        let newQty = Number(item.quantity) || 1;
        if (serverProduct.stock !== undefined && newQty > serverProduct.stock) {
          newQty = serverProduct.stock;
        }

        if (item.price !== serverProduct.price || item.name !== serverProduct.name || item.quantity !== newQty || item.imageUrl !== serverProduct.imageUrl) {
          changed = true;
          return { ...item, price: serverProduct.price, name: serverProduct.name, quantity: newQty, imageUrl: serverProduct.imageUrl };
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
