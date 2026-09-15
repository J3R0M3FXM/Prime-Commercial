import React, { useEffect, useState, useMemo } from 'react';
import { useCart } from './cart-context';
import { ShoppingCart, X, Plus, Minus, Trash2 } from 'lucide-react';
import { formatPHP } from "@/lib/currency";

export default function CartDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { cart, removeFromCart, updateQuantity, toggleSelection, clearSelectedItems, cartTotal, cartCount, syncWithServerData } = useCart();
  const [activeCharges, setActiveCharges] = useState<any[]>([]);
  const [loadingCharges, setLoadingCharges] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Sync Products
      fetch("/api/products")
        .then(res => res.json())
        .then(data => {
           if (data && Array.isArray(data)) {
             syncWithServerData(data);
           }
        })
        .catch(err => console.error("Failed to sync cart data", err));
              // Fetch Active Charges
      setLoadingCharges(true);
      fetch("/api/admin/charges")
        .then(res => res.json())
        .then(data => {
          if (data && Array.isArray(data)) {
            // Apply only if the charge is marked as Active
            setActiveCharges(data.filter(c => c.isActive === true));
          }
        })
        .catch(err => console.error("Failed to fetch charges", err))
        .finally(() => setLoadingCharges(false));
    }
  }, [isOpen]); 

  if (!isOpen) return null;

  const selectedItems = cart.filter((item: any) => item.selected !== false);
  
  // Calculate Grand Total
  const { totalChargesAmount, grandTotal, chargesBreakdown } = useMemo(() => {
    if (selectedItems.length === 0) return { totalChargesAmount: 0, grandTotal: 0, chargesBreakdown: [] };
    
    let breakdown: { id: string, name: string, computedAmount: number }[] = [];
    let fixedTotal = 0;
    let percentTotal = 0;

    activeCharges.forEach(charge => {
      let computed = 0;
      if (charge.type === 'percentage') {
        computed = cartTotal * (charge.amount / 100);
        percentTotal += computed;
      } else {
        computed = charge.amount;
        fixedTotal += computed;
      }
      breakdown.push({ id: charge.id, name: charge.name, computedAmount: computed });
    });

    const totalCharges = fixedTotal + percentTotal;
    return {
      totalChargesAmount: totalCharges,
      grandTotal: cartTotal + totalCharges,
      chargesBreakdown: breakdown
    };
  }, [cartTotal, activeCharges, selectedItems.length]);

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
              <div key={item.id} className="flex gap-4 p-3 bg-gray-50 rounded-lg border border-gray-100 items-center">
                <input 
                  type="checkbox" 
                  checked={item.selected !== false}
                  onChange={(e) => toggleSelection(item.id, e.target.checked)}
                  className="w-5 h-5 cursor-pointer accent-black shrink-0"
                />
                <img 
                  src={item.imageUrl || "https://picsum.photos/seed/prime/100"} 
                  alt={item.name} 
                  className="w-16 h-16 object-cover rounded bg-white border border-gray-200"
                />
                <div className="flex-1 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-heading font-normal uppercase text-gray-900 line-clamp-1">{item.name}</h3>
                      <p className="text-sm font-medium text-gray-600">{formatPHP(item.price)}</p>
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
                        className="px-2 py-1 text-gray-500 hover:text-black hover:bg-gray-50"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
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
            
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 uppercase tracking-wider">Subtotal:</span>
                <span className="font-medium text-gray-900">{formatPHP(cartTotal)}</span>
              </div>
              
              {chargesBreakdown.map(charge => (
                <div key={charge.id} className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 uppercase tracking-wider">{charge.name}:</span>
                  <span className="font-medium text-gray-900">{formatPHP(charge.computedAmount)}</span>
                </div>
              ))}
              
              <div className="flex justify-between items-center text-lg pt-3 border-t border-gray-100 mt-2">
                <span className="font-heading font-bold uppercase tracking-wide text-gray-900">Total:</span>
                <span className="font-heading font-bold text-2xl text-black">{formatPHP(grandTotal)}</span>
              </div>
            </div>

            <button 
              disabled={selectedItems.length === 0}
              onClick={async () => {
                if (selectedItems.length === 0) return;
                try {
                  const storedUserId = typeof window !== 'undefined' ? (sessionStorage.getItem("prime_customer_id") || sessionStorage.getItem("prime_admin_user_id") || "1085949511") : "1085949511";
                  const storedName = typeof window !== 'undefined' ? (sessionStorage.getItem("prime_customer_name") || "Customer") : "Customer";
                  const storedUsername = typeof window !== 'undefined' ? (sessionStorage.getItem("prime_customer_username") || "") : "";
                  const storedMemberId = typeof window !== 'undefined' ? (sessionStorage.getItem("prime_member_id") || "") : "";
                  
                  const res = await fetch("/api/orders", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      customerId: storedUserId,
                      customerName: storedName,
                      customerUsername: storedUsername,
                      primeMemberId: storedMemberId,
                      items: selectedItems,
                      subTotal: cartTotal,
                      appliedCharges: chargesBreakdown,
                      totalAmount: grandTotal,
                      notes: "Storefront Checkout Order"
                    })
                  });
                  if (res.ok) {
                    const data = await res.json();
                    alert(`Order #${data.orderNumber} placed successfully!`);
                    clearSelectedItems();
                    onClose();
                  } else {
                    const err = await res.json().catch(() => ({}));
                    alert(`Failed to create order: ${err.error || "Please try again."}`);
                  }
                } catch (e) {
                  console.error(e);
                  alert("Order checkout error");
                }
              }}
              className="w-full bg-black text-white font-bold py-4 rounded hover:bg-gray-800 transition-colors uppercase tracking-widest text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
