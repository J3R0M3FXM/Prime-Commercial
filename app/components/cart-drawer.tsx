import React from 'react';
import { useCart } from './cart-context';
import { ShoppingCart, X, Plus, Minus, Trash2 } from 'lucide-react';

export default function CartDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { cart, removeFromCart, updateQuantity, clearCart, cartTotal, cartCount } = useCart();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 transition-opacity">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-gray-900" />
            <h2 className="text-xl font-heading font-bold uppercase tracking-wide">Your Cart</h2>
            <span className="bg-black text-white text-xs font-bold px-2 py-0.5 rounded-full ml-2">
              {cartCount}
            </span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cart.length === 0 ? (
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
            cart.map((item: any) => (
              <div key={item.id} className="flex gap-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <img 
                  src={item.imageUrl || "https://picsum.photos/seed/prime/100"} 
                  alt={item.name} 
                  className="w-20 h-20 object-cover rounded bg-white border border-gray-200"
                />
                <div className="flex-1 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-gray-900 line-clamp-1">{item.name}</h3>
                      <p className="text-sm font-medium text-gray-600">${Number(item.price).toFixed(2)}</p>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center border border-gray-200 rounded bg-white">
                      <button 
                        className="px-2 py-1 text-gray-500 hover:text-black hover:bg-gray-50 disabled:opacity-50"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-bold w-8 text-center">{item.quantity}</span>
                      <button 
                        className="px-2 py-1 text-gray-500 hover:text-black hover:bg-gray-50"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="p-4 border-t border-gray-100 bg-white space-y-4">
            <div className="flex justify-between items-center text-lg">
              <span className="font-bold text-gray-600">Total:</span>
              <span className="font-bold text-2xl font-heading">${cartTotal.toFixed(2)}</span>
            </div>
            <button className="w-full bg-black text-white font-bold py-4 rounded hover:bg-gray-800 transition-colors uppercase tracking-widest text-sm flex items-center justify-center gap-2">
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
