"use client";

import React, { useState, useMemo } from "react";
import { 
  X, 
  Trash2, 
  Plus, 
  Minus, 
  Gift, 
  DollarSign, 
  Tag, 
  RotateCcw, 
  ShoppingBag, 
  Package, 
  Truck, 
  Percent, 
  Check, 
  AlertCircle,
  Sparkles,
  Sliders
} from "lucide-react";
import { formatPHP } from "@/lib/currency";

export interface OrderItem {
  id: string;
  productId?: string;
  variantId?: string | null;
  name: string;
  price: number;
  originalPrice?: number;
  isFree?: boolean;
  quantity: number;
  imageUrl?: string;
}

export interface AppliedChargeItem {
  id: string;
  name: string;
  amount: number;
  originalAmount?: number;
  type?: string;
  rate?: number | null;
  isFree?: boolean;
}

interface ModifyOrderModalProps {
  order: any;
  catalogProducts: any[];
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated: (updatedOrder: any) => void;
}

export default function ModifyOrderModal({
  order,
  catalogProducts,
  isOpen,
  onClose,
  onOrderUpdated,
}: ModifyOrderModalProps) {
  // Initial items clone
  const initialItems: OrderItem[] = useMemo(() => {
    if (!order || !Array.isArray(order.items)) return [];
    return order.items.map((it: any) => {
      const price = Number(it.price) || 0;
      const originalPrice = it.originalPrice !== undefined ? Number(it.originalPrice) : price;
      const isFree = Boolean(it.isFree || price === 0);
      return {
        id: String(it.id || `item-${Math.random()}`),
        productId: it.productId || (String(it.id || '').includes('_') ? String(it.id).split('_')[0] : it.id),
        variantId: it.variantId || (String(it.id || '').includes('_') ? String(it.id).split('_')[1] : null),
        name: it.name || "Product",
        price: isFree ? 0 : price,
        originalPrice: originalPrice > 0 ? originalPrice : price,
        isFree,
        quantity: Math.max(1, Number(it.quantity) || 1),
        imageUrl: it.imageUrl || "",
      };
    });
  }, [order]);

  // Initial charges clone
  const initialCharges: AppliedChargeItem[] = useMemo(() => {
    if (!order || !Array.isArray(order.appliedCharges)) return [];
    return order.appliedCharges.map((ch: any, idx: number) => {
      const amount = Number(ch.amount) || 0;
      const originalAmount = ch.originalAmount !== undefined ? Number(ch.originalAmount) : amount;
      const isFree = Boolean(ch.isFree || amount === 0);
      return {
        id: String(ch.id || `charge-${idx}-${Date.now()}`),
        name: String(ch.name || "Charge").replace(/:+$/, "").trim(),
        amount: isFree ? 0 : amount,
        originalAmount: originalAmount > 0 ? originalAmount : amount,
        type: ch.type || "fixed",
        rate: ch.rate !== undefined ? Number(ch.rate) : null,
        isFree,
      };
    });
  }, [order]);

  // Working state
  const [items, setItems] = useState<OrderItem[]>(initialItems);
  const [charges, setCharges] = useState<AppliedChargeItem[]>(initialCharges);
  
  // Delivery Fee
  const initialDeliveryFee = Number(order?.deliveryFee) || 0;
  const [deliveryFee, setDeliveryFee] = useState<number>(order?.isDeliveryFeeFree ? 0 : initialDeliveryFee);
  const [originalDeliveryFee] = useState<number>(initialDeliveryFee);
  const [isDeliveryFree, setIsDeliveryFree] = useState<boolean>(Boolean(order?.isDeliveryFeeFree || initialDeliveryFee === 0));

  // Add Product Form State
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<string>("");
  const [selectedVariantToAdd, setSelectedVariantToAdd] = useState<string>("");
  const [addQty, setAddQty] = useState<number>(1);
  const [addPrice, setAddPrice] = useState<string>("");
  const [addIsFree, setAddIsFree] = useState<boolean>(false);
  const [showCustomItemForm, setShowCustomItemForm] = useState<boolean>(false);
  const [customItemName, setCustomItemName] = useState<string>("");
  const [customItemPrice, setCustomItemPrice] = useState<string>("");
  const [customItemQty, setCustomItemQty] = useState<number>(1);
  const [customItemIsFree, setCustomItemIsFree] = useState<boolean>(false);

  // Add Charge Form State
  const [showAddChargeForm, setShowAddChargeForm] = useState<boolean>(false);
  const [newChargeName, setNewChargeName] = useState<string>("");
  const [newChargeAmount, setNewChargeAmount] = useState<string>("");

  // Modification Reason & Save state
  const [modificationReason, setModificationReason] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- Calculations ---
  const subTotal = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.price) * Number(it.quantity)), 0);
  }, [items]);

  const chargesTotal = useMemo(() => {
    return charges.reduce((sum, ch) => sum + (Number(ch.amount) || 0), 0);
  }, [charges]);

  const activeDeliveryFee = isDeliveryFree ? 0 : (Number(deliveryFee) || 0);

  const grandTotal = useMemo(() => {
    const feeInCheckout = order.deliveryFeePaymentMethod !== "upon_delivery";
    return Math.max(0, subTotal + chargesTotal + (feeInCheckout ? activeDeliveryFee : 0));
  }, [subTotal, chargesTotal, activeDeliveryFee, order.deliveryFeePaymentMethod]);

  const originalTotal = Number(order.totalAmount) || 0;
  const priceDifference = grandTotal - originalTotal;

  // --- Item Handlers ---
  const handleQuantityChange = (index: number, delta: number) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      const newQty = Math.max(1, current.quantity + delta);
      next[index] = { ...current, quantity: newQty };
      return next;
    });
  };

  const handleSetQuantityDirect = (index: number, val: string) => {
    const parsed = parseInt(val, 10);
    const newQty = isNaN(parsed) || parsed < 1 ? 1 : parsed;
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], quantity: newQty };
      return next;
    });
  };

  const handlePriceChange = (index: number, val: string) => {
    const parsed = parseFloat(val);
    const newPrice = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      next[index] = {
        ...current,
        price: newPrice,
        isFree: newPrice === 0,
      };
      return next;
    });
  };

  const handleToggleItemFree = (index: number) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      if (current.isFree || current.price === 0) {
        // Restore to original price or fallback
        const restored = current.originalPrice && current.originalPrice > 0 ? current.originalPrice : 50;
        next[index] = { ...current, price: restored, isFree: false };
      } else {
        // Make free
        next[index] = { 
          ...current, 
          originalPrice: current.price > 0 ? current.price : (current.originalPrice || 0), 
          price: 0, 
          isFree: true 
        };
      }
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Product Selection for Adding ---
  const selectedProductObj = useMemo(() => {
    return catalogProducts.find((p) => String(p.id) === selectedProductToAdd);
  }, [catalogProducts, selectedProductToAdd]);

  const handleSelectProduct = (productId: string) => {
    setSelectedProductToAdd(productId);
    const prod = catalogProducts.find((p) => String(p.id) === productId);
    if (prod) {
      if (Array.isArray(prod.variants) && prod.variants.length > 0) {
        setSelectedVariantToAdd(String(prod.variants[0].id));
        setAddPrice(String(prod.variants[0].price || prod.price || 0));
      } else {
        setSelectedVariantToAdd("");
        setAddPrice(String(prod.price || 0));
      }
      setAddIsFree(false);
    }
  };

  const handleSelectVariant = (variantId: string) => {
    setSelectedVariantToAdd(variantId);
    if (selectedProductObj && Array.isArray(selectedProductObj.variants)) {
      const v = selectedProductObj.variants.find((item: any) => String(item.id) === variantId);
      if (v && v.price !== undefined) {
        setAddPrice(String(v.price));
      }
    }
  };

  const handleAddProductToOrder = () => {
    if (!selectedProductObj) return;

    let itemPrice = parseFloat(addPrice);
    if (isNaN(itemPrice) || itemPrice < 0) itemPrice = 0;
    if (addIsFree) itemPrice = 0;

    let itemName = selectedProductObj.name;
    let itemId = String(selectedProductObj.id);

    if (selectedVariantToAdd && Array.isArray(selectedProductObj.variants)) {
      const variant = selectedProductObj.variants.find((v: any) => String(v.id) === selectedVariantToAdd);
      if (variant) {
        itemName = `${selectedProductObj.name} (${variant.name || variant.title || "Variant"})`;
        itemId = `${selectedProductObj.id}_${variant.id}`;
      }
    }

    const newItem: OrderItem = {
      id: itemId,
      productId: String(selectedProductObj.id),
      variantId: selectedVariantToAdd || null,
      name: itemName,
      price: addIsFree ? 0 : itemPrice,
      originalPrice: Number(selectedProductObj.price) || itemPrice,
      isFree: addIsFree || itemPrice === 0,
      quantity: Math.max(1, addQty),
      imageUrl: selectedProductObj.imageUrl || "",
    };

    setItems((prev) => [...prev, newItem]);
    
    // Reset add product form
    setSelectedProductToAdd("");
    setSelectedVariantToAdd("");
    setAddQty(1);
    setAddPrice("");
    setAddIsFree(false);
  };

  const handleAddCustomItem = () => {
    if (!customItemName.trim()) return;
    let price = parseFloat(customItemPrice);
    if (isNaN(price) || price < 0) price = 0;
    if (customItemIsFree) price = 0;

    const newItem: OrderItem = {
      id: `custom-${Date.now()}`,
      productId: "custom",
      variantId: null,
      name: customItemName.trim(),
      price: customItemIsFree ? 0 : price,
      originalPrice: price,
      isFree: customItemIsFree || price === 0,
      quantity: Math.max(1, customItemQty),
      imageUrl: "",
    };

    setItems((prev) => [...prev, newItem]);
    setCustomItemName("");
    setCustomItemPrice("");
    setCustomItemQty(1);
    setCustomItemIsFree(false);
    setShowCustomItemForm(false);
  };

  // --- Charge Handlers ---
  const handleChargeAmountChange = (index: number, val: string) => {
    const parsed = parseFloat(val);
    const newAmount = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setCharges((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        amount: newAmount,
        isFree: newAmount === 0,
      };
      return next;
    });
  };

  const handleToggleChargeFree = (index: number) => {
    setCharges((prev) => {
      const next = [...prev];
      const current = next[index];
      if (current.isFree || current.amount === 0) {
        // Restore charge
        const restored = current.originalAmount && current.originalAmount > 0 ? current.originalAmount : 50;
        next[index] = { ...current, amount: restored, isFree: false };
      } else {
        // Give charge as free
        next[index] = { 
          ...current, 
          originalAmount: current.amount > 0 ? current.amount : (current.originalAmount || 0), 
          amount: 0, 
          isFree: true 
        };
      }
      return next;
    });
  };

  const handleRemoveCharge = (index: number) => {
    setCharges((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddCustomCharge = () => {
    if (!newChargeName.trim()) return;
    const parsed = parseFloat(newChargeAmount);
    const amount = isNaN(parsed) || parsed < 0 ? 0 : parsed;

    const newCharge: AppliedChargeItem = {
      id: `charge-custom-${Date.now()}`,
      name: newChargeName.trim(),
      amount: amount,
      originalAmount: amount,
      type: "fixed",
      isFree: amount === 0,
    };

    setCharges((prev) => [...prev, newCharge]);
    setNewChargeName("");
    setNewChargeAmount("");
    setShowAddChargeForm(false);
  };

  // --- Delivery Fee Handlers ---
  const handleToggleDeliveryFree = () => {
    if (isDeliveryFree) {
      setIsDeliveryFree(false);
      setDeliveryFee(originalDeliveryFee > 0 ? originalDeliveryFee : 100);
    } else {
      setIsDeliveryFree(true);
      setDeliveryFee(0);
    }
  };

  // --- Save Order Changes ---
  const handleSaveChanges = async () => {
    if (items.length === 0) {
      setErrorMessage("Order must contain at least one item. Please add a product.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const payload = {
        id: order.id,
        items,
        subTotal,
        appliedCharges: charges,
        deliveryFee: activeDeliveryFee,
        isDeliveryFeeFree: isDeliveryFree,
        totalAmount: grandTotal,
        notes: modificationReason.trim()
          ? `${order.notes || ""}\n[${new Date().toLocaleDateString("en-PH")}] Modified by Admin: ${modificationReason.trim()}`.trim()
          : order.notes,
        modificationHistory: [
          ...(Array.isArray(order.modificationHistory) ? order.modificationHistory : []),
          {
            modifiedAt: new Date().toISOString(),
            adminUser: "Admin",
            previousTotal: originalTotal,
            newTotal: grandTotal,
            itemCount: items.length,
            notes: modificationReason.trim() || "Admin modified items, pricing, or charges",
          },
        ],
      };

      const res = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to update order");
      }

      onOrderUpdated(data.order || { ...order, ...payload });
      onClose();
    } catch (err: any) {
      console.error("Modify Order Error:", err);
      setErrorMessage(err.message || "An error occurred while modifying the order.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !order) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div 
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-[430px] shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-heading font-normal tracking-tight text-white uppercase">
                  Modify Order #{order.orderNumber}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                  Admin Edit
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                Customer: <span className="text-slate-200 font-bold">{order.customerName || "Customer"}</span> &bull; Prime ID: <span className="text-slate-200">{order.primeMemberId || "N/A"}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSaving}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-slate-800">
          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-mono text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 1: Line Items Management */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-heading font-normal uppercase text-slate-900 tracking-wider flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-slate-500" />
                <span>Line Items ({items.length})</span>
              </h3>
              <span className="text-xs font-mono text-slate-500">
                Adjust quantity, unit price, or make item free (₱0)
              </span>
            </div>

            {/* Items List */}
            {items.length === 0 ? (
              <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-xs font-mono text-slate-500">No items in this order. Please add at least one product.</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white shadow-xs">
                {items.map((it, idx) => (
                  <div key={idx} className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                    {/* Item Name & Details */}
                    <div className="flex items-center gap-3 min-w-0 sm:w-2/5">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                        {it.imageUrl ? (
                          <img src={it.imageUrl} alt={it.name} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-xs sm:text-sm text-slate-900 truncate font-mono">{it.name}</p>
                          {it.isFree && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Free Item
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-mono text-slate-500">
                          Orig. Unit: {formatPHP(it.originalPrice || it.price)}
                        </p>
                      </div>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-mono text-slate-400 uppercase hidden sm:inline mr-1">Qty:</span>
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(idx, -1)}
                        className="w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                        title="Decrease quantity"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={(e) => handleSetQuantityDirect(idx, e.target.value)}
                        className="w-12 h-7 text-center font-mono font-bold text-xs border border-slate-200 rounded bg-white text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(idx, 1)}
                        className="w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                        title="Increase quantity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Unit Price & Free Toggle */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">₱</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={it.price}
                          onChange={(e) => handlePriceChange(idx, e.target.value)}
                          className={`w-24 h-7 pl-5 pr-1.5 text-right font-mono font-bold text-xs border rounded transition-colors focus:outline-hidden focus:ring-1 focus:ring-slate-900 ${
                            it.isFree ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-slate-200 text-slate-900"
                          }`}
                          placeholder="Price"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleItemFree(idx)}
                        className={`px-2 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                          it.isFree
                            ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                        }`}
                        title={it.isFree ? "Restore regular price" : "Give this item for free (₱0)"}
                      >
                        <Gift className="w-3 h-3" />
                        <span>{it.isFree ? "Free" : "Make Free"}</span>
                      </button>
                    </div>

                    {/* Subtotal & Delete */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div className="text-right">
                        <p className={`font-mono font-bold text-sm ${it.isFree ? "text-emerald-600" : "text-slate-900"}`}>
                          {it.isFree ? "FREE" : formatPHP(it.price * it.quantity)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove item from order"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Product Controls */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-slate-600" />
                  <span>Add Product to Order</span>
                </span>

                <button
                  type="button"
                  onClick={() => setShowCustomItemForm(!showCustomItemForm)}
                  className="text-[11px] font-mono text-blue-600 hover:text-blue-800 underline cursor-pointer"
                >
                  {showCustomItemForm ? "Select from Catalog" : "Add Custom / Off-Catalog Item"}
                </button>
              </div>

              {!showCustomItemForm ? (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  {/* Product Picker */}
                  <div className="sm:col-span-5">
                    <label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">Product</label>
                    <select
                      value={selectedProductToAdd}
                      onChange={(e) => handleSelectProduct(e.target.value)}
                      className="w-full h-8 px-2 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                    >
                      <option value="">-- Choose a product --</option>
                      {catalogProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({formatPHP(p.price)}) {p.stock !== undefined ? `• Stock: ${p.stock}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Variant Picker (if available) */}
                  {selectedProductObj && Array.isArray(selectedProductObj.variants) && selectedProductObj.variants.length > 0 && (
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">Variant</label>
                      <select
                        value={selectedVariantToAdd}
                        onChange={(e) => handleSelectVariant(e.target.value)}
                        className="w-full h-8 px-2 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                      >
                        {selectedProductObj.variants.map((v: any) => (
                          <option key={v.id} value={v.id}>
                            {v.name || v.title} ({formatPHP(v.price ?? selectedProductObj.price)})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Quantity */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={addQty}
                      onChange={(e) => setAddQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full h-8 px-2 text-center font-mono text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                    />
                  </div>

                  {/* Unit Price with Free Checkbox */}
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-mono text-slate-500 uppercase">Price</label>
                      <label className="flex items-center gap-1 text-[10px] font-mono text-emerald-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={addIsFree}
                          onChange={(e) => setAddIsFree(e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-0"
                        />
                        <span>Free</span>
                      </label>
                    </div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">₱</span>
                      <input
                        type="number"
                        step="any"
                        disabled={addIsFree}
                        value={addIsFree ? 0 : addPrice}
                        onChange={(e) => setAddPrice(e.target.value)}
                        className={`w-full h-8 pl-5 pr-2 font-mono text-xs border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-900 ${
                          addIsFree ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-bold" : "bg-white border-slate-300 text-slate-900"
                        }`}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Add Button */}
                  <div className="sm:col-span-12 flex justify-end mt-1">
                    <button
                      type="button"
                      disabled={!selectedProductToAdd}
                      onClick={handleAddProductToOrder}
                      className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-mono font-bold uppercase rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to Order</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Custom / Off-Catalog Item Form */
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  <div className="sm:col-span-5">
                    <label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">Item Description / Name</label>
                    <input
                      type="text"
                      placeholder="e.g. VIP Rush Packing / Promo Item"
                      value={customItemName}
                      onChange={(e) => setCustomItemName(e.target.value)}
                      className="w-full h-8 px-2 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={customItemQty}
                      onChange={(e) => setCustomItemQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full h-8 px-2 text-center font-mono text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-mono text-slate-500 uppercase">Unit Price</label>
                      <label className="flex items-center gap-1 text-[10px] font-mono text-emerald-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={customItemIsFree}
                          onChange={(e) => setCustomItemIsFree(e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-0"
                        />
                        <span>Give Free</span>
                      </label>
                    </div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">₱</span>
                      <input
                        type="number"
                        step="any"
                        disabled={customItemIsFree}
                        value={customItemIsFree ? 0 : customItemPrice}
                        onChange={(e) => setCustomItemPrice(e.target.value)}
                        className={`w-full h-8 pl-5 pr-2 font-mono text-xs border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-900 ${
                          customItemIsFree ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-bold" : "bg-white border-slate-300 text-slate-900"
                        }`}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-2 flex justify-end">
                    <button
                      type="button"
                      disabled={!customItemName.trim()}
                      onClick={handleAddCustomItem}
                      className="w-full h-8 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-mono font-bold uppercase rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Charges & Delivery Management */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-200">
            {/* Applied Charges Column */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-heading font-normal uppercase text-slate-900 tracking-wider flex items-center gap-2">
                  <Percent className="w-4 h-4 text-slate-500" />
                  <span>Charges & Fees ({charges.length})</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddChargeForm(!showAddChargeForm)}
                  className="text-[11px] font-mono text-blue-600 hover:text-blue-800 underline cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Charge</span>
                </button>
              </div>

              {charges.length === 0 ? (
                <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center text-xs font-mono text-slate-400">
                  No additional charges currently applied.
                </div>
              ) : (
                <div className="space-y-2">
                  {charges.map((ch, cIdx) => (
                    <div key={ch.id || cIdx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono font-bold text-xs text-slate-900 truncate">{ch.name}</p>
                        {ch.isFree && (
                          <span className="text-[9px] font-mono text-emerald-600 font-bold">Waived / Free</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">₱</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={ch.amount}
                            onChange={(e) => handleChargeAmountChange(cIdx, e.target.value)}
                            className={`w-20 h-7 pl-5 pr-1.5 text-right font-mono text-xs border rounded transition-colors ${
                              ch.isFree ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-bold" : "bg-white border-slate-200 text-slate-900"
                            }`}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleChargeFree(cIdx)}
                          className={`px-2 py-1 rounded text-[10px] font-mono font-bold uppercase transition-colors flex items-center gap-1 cursor-pointer ${
                            ch.isFree
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                          title={ch.isFree ? "Restore charge" : "Waive charge / Give as free"}
                        >
                          <Gift className="w-3 h-3" />
                          <span>{ch.isFree ? "Waived" : "Waive"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveCharge(cIdx)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                          title="Delete this charge"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Custom Charge Inline Form */}
              {showAddChargeForm && (
                <div className="p-3 bg-white border border-slate-300 rounded-xl space-y-2 shadow-xs">
                  <p className="text-[10px] font-mono font-bold text-slate-600 uppercase">New Custom Charge</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Charge Name (e.g. Handling Fee)"
                      value={newChargeName}
                      onChange={(e) => setNewChargeName(e.target.value)}
                      className="flex-1 h-7 px-2 text-xs font-mono border border-slate-300 rounded bg-white text-slate-900"
                    />
                    <div className="relative w-24">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">₱</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={newChargeAmount}
                        onChange={(e) => setNewChargeAmount(e.target.value)}
                        className="w-full h-7 pl-5 pr-1 text-right text-xs font-mono border border-slate-300 rounded bg-white text-slate-900"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!newChargeName.trim()}
                      onClick={handleAddCustomCharge}
                      className="px-2.5 h-7 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-[11px] font-mono rounded cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Delivery Fee Column */}
            <div className="space-y-3">
              <h3 className="text-xs font-heading font-normal uppercase text-slate-900 tracking-wider flex items-center gap-2">
                <Truck className="w-4 h-4 text-slate-500" />
                <span>Delivery Logistics & Fee</span>
              </h3>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-500">Selected Courier:</span>
                  <span className="font-bold text-slate-900">{order.courier?.name || "Standard Courier"}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-500">Payment Collection:</span>
                  <span className="font-bold text-slate-700">
                    {order.deliveryFeePaymentMethod === "upon_delivery" ? "Paid on Delivery (COD)" : "Paid at Checkout"}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-500 uppercase">Delivery Fee (₱)</label>
                    <div className="relative mt-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">₱</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        disabled={isDeliveryFree}
                        value={isDeliveryFree ? 0 : deliveryFee}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setDeliveryFee(isNaN(val) || val < 0 ? 0 : val);
                        }}
                        className={`w-28 h-7 pl-5 pr-2 font-mono text-xs border rounded transition-colors ${
                          isDeliveryFree ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-bold" : "bg-white border-slate-300 text-slate-900"
                        }`}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleDeliveryFree}
                    className={`mt-4 px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                      isDeliveryFree
                        ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                        : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                    }`}
                  >
                    <Gift className="w-3.5 h-3.5" />
                    <span>{isDeliveryFree ? "Free Delivery Active" : "Give Free Delivery"}</span>
                  </button>
                </div>
              </div>

              {/* Modification Reason Textbox */}
              <div>
                <label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">
                  Reason for Modification (Appended to Audit Trail)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Swapped variant per customer chat; waived delivery fee"
                  value={modificationReason}
                  onChange={(e) => setModificationReason(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Live Financial Summary Breakdown */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-3 font-mono">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-heading font-normal uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Real-Time Recalculation Summary</span>
              </span>
              {priceDifference !== 0 && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  priceDifference < 0 ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-blue-950 text-blue-300 border border-blue-800"
                }`}>
                  {priceDifference < 0 ? `Adjustment: -${formatPHP(Math.abs(priceDifference))}` : `Adjustment: +${formatPHP(priceDifference)}`}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase block">Items Subtotal</span>
                <span className="text-sm font-bold text-white mt-0.5 block">{formatPHP(subTotal)}</span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase block">Charges Total</span>
                <span className="text-sm font-bold text-white mt-0.5 block">{formatPHP(chargesTotal)}</span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase block">Delivery Fee</span>
                <span className={`text-sm font-bold mt-0.5 block ${isDeliveryFree ? "text-emerald-400" : "text-white"}`}>
                  {isDeliveryFree ? "FREE (₱0.00)" : formatPHP(activeDeliveryFee)}
                </span>
              </div>

              <div className="bg-slate-800/80 p-2 rounded-xl border border-slate-700/80">
                <span className="text-[10px] text-amber-300 uppercase font-bold block">New Grand Total</span>
                <span className="text-base font-bold text-amber-400 mt-0.5 block">{formatPHP(grandTotal)}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80">
              <span>Original Order Total: <strong className="text-slate-200">{formatPHP(originalTotal)}</strong></span>
              <span>Items count: <strong className="text-slate-200">{items.reduce((s, it) => s + it.quantity, 0)} units</strong></span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-mono font-bold uppercase transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving || items.length === 0}
              onClick={handleSaveChanges}
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-heading font-normal uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-md"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Save Order Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
