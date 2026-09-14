"use client";
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

const CartContext = createContext<any>(null);

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [cart, setCart] = useState<any[]>([]);

  useEffect(() => {
    try {
      const savedCart = localStorage.getItem('prime-cart');
      if (savedCart) setCart(JSON.parse(savedCart));
    } catch (e) {
      console.error("Failed to load cart from local storage", e);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('prime-cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (product: any, quantity: number) => {
    setCart(prev => {
        const existing = prev.find(item => item.id === product.id);
        if (existing) {
            return prev.map(item => item.id === product.id ? {...item, quantity: item.quantity + quantity} : item);
        }
        return [...prev, { ...product, quantity, selected: true }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    setCart(prev => {
      if (quantity <= 0) return prev.filter(item => item.id !== productId);
      return prev.map(item => item.id === productId ? { ...item, quantity } : item);
    });
  };

  const toggleSelection = (productId: string, selected: boolean) => {
    setCart(prev => prev.map(item => item.id === productId ? { ...item, selected } : item));
  };

  const clearSelectedItems = () => {
    setCart(prev => prev.filter(item => item.selected === false));
  };

  const clearCart = () => {
    setCart([]);
  };

  // Sync cart items with fresh server product data
  const syncWithServerData = (serverProducts: any[]) => {
    setCart(prev => {
      let changed = false;
      const updatedCart = prev.map(item => {
        const serverProduct = serverProducts.find(p => p.id === item.id);
        if (!serverProduct) return item; // Keep as is if not found, or maybe remove? We'll keep.
        
        let newQty = item.quantity;
        // Adjust quantity if server stock is lower than requested quantity
        if (serverProduct.stock !== undefined && newQty > serverProduct.stock) {
          newQty = serverProduct.stock;
        }

        if (item.price !== serverProduct.price || item.name !== serverProduct.name || item.quantity !== newQty || item.imageUrl !== serverProduct.imageUrl) {
          changed = true;
          return { ...item, price: serverProduct.price, name: serverProduct.name, quantity: newQty, imageUrl: serverProduct.imageUrl };
        }
        return item;
      }).filter(item => item.quantity > 0); // Remove if stock went to 0

      if (changed || updatedCart.length !== prev.length) {
        return updatedCart;
      }
      return prev;
    });
  };

  const cartTotal = useMemo(() => {
    return cart.filter(item => item.selected !== false).reduce((total, item) => total + (item.price * item.quantity), 0);
  }, [cart]);

  const cartCount = useMemo(() => {
    return cart.reduce((count, item) => count + item.quantity, 0);
  }, [cart]);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, toggleSelection, clearSelectedItems, clearCart, cartTotal, cartCount, syncWithServerData, setCart }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
