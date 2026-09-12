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
        return [...prev, { ...product, quantity }];
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

  const clearCart = () => {
    setCart([]);
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  }, [cart]);

  const cartCount = useMemo(() => {
    return cart.reduce((count, item) => count + item.quantity, 0);
  }, [cart]);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, cartTotal, cartCount }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
