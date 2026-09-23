'use client';

import React, { useState, useEffect } from 'react';
import { 
  Tag, 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  AlertTriangle, 
  ShieldAlert, 
  RefreshCw,
  Sparkles,
  Calendar,
  Layers,
  Users,
  Eye,
  Percent,
  DollarSign,
  Truck,
  Coins,
  Clock,
  CreditCard,
  Sliders,
  CheckCircle2
} from 'lucide-react';
import { 
  PromoConfig, 
  PromoVoucherType, 
  PromoDiscountType, 
  PromoCustomerEligibility, 
  generatePromoCode 
} from '@/lib/promos';

const LOYALTY_TIERS = ['SILVER', 'BRONZE', 'GOLD', 'PLATINUM', 'TITANIUM'];
const DAYS_OF_WEEK = [
  { id: 0, label: 'Sun', full: 'Sunday' },
  { id: 1, label: 'Mon', full: 'Monday' },
  { id: 2, label: 'Tue', full: 'Tuesday' },
  { id: 3, label: 'Wed', full: 'Wednesday' },
  { id: 4, label: 'Thu', full: 'Thursday' },
  { id: 5, label: 'Fri', full: 'Friday' },
  { id: 6, label: 'Sat', full: 'Saturday' }
];

export default function PromosModule() {
  const [promos, setPromos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'discount' | 'eligibility' | 'schedule' | 'limits'>('basic');
  const [editingPromo, setEditingPromo] = useState<any | null>(null);
  const [auditPromo, setAuditPromo] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state - Marketplace Standard Fields
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [voucherType, setVoucherType] = useState<PromoVoucherType>('shop_voucher');
  const [discountType, setDiscountType] = useState<PromoDiscountType>('fixed');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  const [maxDiscountAmount, setMaxDiscountAmount] = useState<number | ''>('');
  const [cappedShippingDiscount, setCappedShippingDiscount] = useState<number | ''>('');
  const [cashbackPercentage, setCashbackPercentage] = useState<number | ''>('');
  
  // Basket Requirements
  const [minSpend, setMinSpend] = useState<number | ''>('');
  const [minItemQuantity, setMinItemQuantity] = useState<number | ''>('');
  
  // Target Audience & Eligibility
  const [customerEligibility, setCustomerEligibility] = useState<PromoCustomerEligibility>('all');
  const [minPreviousOrders, setMinPreviousOrders] = useState<number | ''>('');
  const [eligibleTiers, setEligibleTiers] = useState<string[]>([]);
  
  // Payment Channels & Logistics
  const [allowedPaymentMethods, setAllowedPaymentMethods] = useState<string[]>(['all']);
  const [allowedCourierIds, setAllowedCourierIds] = useState<string[]>(['all']);
  
  // Philippine Schedule & Flash Windows
  const [activeDaysOfWeek, setActiveDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [isPaydayOnly, setIsPaydayOnly] = useState<boolean>(false);
  const [flashHourStart, setFlashHourStart] = useState<number | ''>('');
  const [flashHourEnd, setFlashHourEnd] = useState<number | ''>('');
  
  // Usage Quotas & Limits
  const [totalUsageLimit, setTotalUsageLimit] = useState<number | ''>('');
  const [usageLimitPerCustomer, setUsageLimitPerCustomer] = useState<number>(1);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchPromos = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/promos');
      if (!res.ok) throw new Error('Failed to fetch promos');
      const data = await res.json();
      setPromos(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Error loading promos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromos();
  }, []);

  const openCreateModal = () => {
    setEditingPromo(null);
    setActiveTab('basic');
    setCode(generatePromoCode('PRIME'));
    setTitle('');
    setDescription('');
    setVoucherType('shop_voucher');
    setDiscountType('fixed');
    setDiscountValue('');
    setMaxDiscountAmount('');
    setCappedShippingDiscount('');
    setCashbackPercentage('');
    setMinSpend('');
    setMinItemQuantity('');
    setCustomerEligibility('all');
    setMinPreviousOrders('');
    setEligibleTiers([]);
    setAllowedPaymentMethods(['all']);
    setAllowedCourierIds(['all']);
    setActiveDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
    setIsPaydayOnly(false);
    setFlashHourStart('');
    setFlashHourEnd('');
    setTotalUsageLimit('');
    setUsageLimitPerCustomer(1);
    setIsActive(true);
    setStartDate('');
    setEndDate('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: any) => {
    setEditingPromo(p);
    setActiveTab('basic');
    setCode(p.code || '');
    setTitle(p.title || '');
    setDescription(p.description || '');
    setVoucherType(p.voucherType || 'shop_voucher');
    setDiscountType(p.discountType || 'fixed');
    setDiscountValue(p.discountValue !== undefined ? p.discountValue : '');
    setMaxDiscountAmount(p.maxDiscountAmount || '');
    setCappedShippingDiscount(p.cappedShippingDiscount || '');
    setCashbackPercentage(p.cashbackPercentage || '');
    setMinSpend(p.minSpend || '');
    setMinItemQuantity(p.minItemQuantity || '');
    setCustomerEligibility(p.customerEligibility || 'all');
    setMinPreviousOrders(p.minPreviousOrders || '');
    setEligibleTiers(Array.isArray(p.eligibleTiers) ? p.eligibleTiers : []);
    setAllowedPaymentMethods(Array.isArray(p.allowedPaymentMethods) ? p.allowedPaymentMethods : ['all']);
    setAllowedCourierIds(Array.isArray(p.allowedCourierIds) ? p.allowedCourierIds : ['all']);
    setActiveDaysOfWeek(Array.isArray(p.activeDaysOfWeek) ? p.activeDaysOfWeek : [0, 1, 2, 3, 4, 5, 6]);
    setIsPaydayOnly(Boolean(p.isPaydayOnly));
    setFlashHourStart(p.flashHourStart !== undefined && p.flashHourStart !== null ? p.flashHourStart : '');
    setFlashHourEnd(p.flashHourEnd !== undefined && p.flashHourEnd !== null ? p.flashHourEnd : '');
    setTotalUsageLimit(p.totalUsageLimit || '');
    setUsageLimitPerCustomer(p.usageLimitPerCustomer || 1);
    setIsActive(p.isActive !== false);
    setStartDate(p.startDate ? p.startDate.split('T')[0] : '');
    setEndDate(p.endDate ? p.endDate.split('T')[0] : '');
    setIsModalOpen(true);
  };

  const handleToggleActive = async (p: any) => {
    try {
      const nextState = !p.isActive;
      const res = await fetch('/api/admin/promos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, isActive: nextState })
      });
      if (res.ok) {
        setPromos(prev => prev.map(item => item.id === p.id ? { ...item, isActive: nextState } : item));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (!window.confirm(`Are you sure you want to delete promo code "${code}"?`)) return;
    try {
      const res = await fetch(`/api/admin/promos?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPromos(prev => prev.filter(item => item.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectVoucherType = (type: PromoVoucherType) => {
    setVoucherType(type);
    if (type === 'shipping_voucher') {
      setDiscountType('free_shipping');
    } else if (type === 'cashback_voucher') {
      setDiscountType('coins_cashback');
      if (!discountValue) setDiscountValue(10);
    } else if (type === 'new_buyer_voucher') {
      setCustomerEligibility('new_customer');
      if (discountType === 'free_shipping' || discountType === 'coins_cashback') {
        setDiscountType('fixed');
      }
    } else if (type === 'shop_voucher') {
      if (discountType === 'free_shipping' || discountType === 'coins_cashback') {
        setDiscountType('fixed');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      alert('Promo code is required');
      return;
    }
    if (discountType !== 'free_shipping' && (!discountValue || Number(discountValue) <= 0)) {
      alert('Please enter a valid discount or cashback value');
      return;
    }

    try {
      setSubmitting(true);
      const payload: any = {
        code: code.trim().toUpperCase(),
        title: title.trim() || `${code.trim().toUpperCase()} Promo`,
        description: description.trim(),
        voucherType,
        discountType,
        discountValue: discountType === 'free_shipping' ? 0 : Number(discountValue) || 0,
        maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : null,
        cappedShippingDiscount: cappedShippingDiscount ? Number(cappedShippingDiscount) : null,
        cashbackPercentage: cashbackPercentage ? Number(cashbackPercentage) : null,
        minSpend: minSpend ? Number(minSpend) : 0,
        minItemQuantity: minItemQuantity ? Number(minItemQuantity) : null,
        customerEligibility,
        minPreviousOrders: minPreviousOrders ? Number(minPreviousOrders) : null,
        eligibleTiers: customerEligibility === 'tier_restricted' ? eligibleTiers : [],
        allowedPaymentMethods: allowedPaymentMethods.length > 0 ? allowedPaymentMethods : ['all'],
        allowedCourierIds: allowedCourierIds.length > 0 ? allowedCourierIds : ['all'],
        activeDaysOfWeek: activeDaysOfWeek.length > 0 ? activeDaysOfWeek : [0, 1, 2, 3, 4, 5, 6],
        isPaydayOnly,
        flashHourStart: flashHourStart !== '' && flashHourStart !== null ? Number(flashHourStart) : null,
        flashHourEnd: flashHourEnd !== '' && flashHourEnd !== null ? Number(flashHourEnd) : null,
        totalUsageLimit: totalUsageLimit ? Number(totalUsageLimit) : null,
        usageLimitPerCustomer: Number(usageLimitPerCustomer) || 1,
        isActive,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null
      };

      if (editingPromo) {
        payload.id = editingPromo.id;
        const res = await fetch('/api/admin/promos', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update promo');
        }
      } else {
        const res = await fetch('/api/admin/promos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create promo');
        }
      }

      setIsModalOpen(false);
      fetchPromos();
    } catch (err: any) {
      alert(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPromos = promos.filter(p => {
    const q = searchQuery.toLowerCase();
    return (
      p.code?.toLowerCase().includes(q) ||
      p.title?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.voucherType?.toLowerCase().includes(q)
    );
  });

  return (
    <div id="promos-module-container" className="space-y-3">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-3 border border-gray-200">
        <div>
          <h2 className="text-xl font-normal text-gray-900 flex items-center gap-2">
            <Tag className="w-5 h-5 text-emerald-600" />
            Marketplace Promos & Vouchers
          </h2>
          <p className="text-xs text-gray-500 mt-1 font-mono">
            Philippine marketplace-standard promo vouchers: buyer eligibility, shipping subsidies, flash sale windows, and device anti-fraud
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="refresh-promos-btn"
            onClick={fetchPromos}
            className="p-2 border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            title="Refresh Promos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            id="create-promo-btn"
            onClick={openCreateModal}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Promo
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white p-2.5 border border-gray-200 flex items-center gap-3">
        <Search className="w-4 h-4 text-gray-400" />
        <input
          id="search-promos-input"
          type="text"
          placeholder="Search by code, promo title, voucher type, or details..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full text-sm outline-none font-mono text-gray-800 placeholder-gray-400"
        />
        {searchQuery && (
          <button id="clear-promo-search-btn" onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Promos Table / Grid */}
      {loading ? (
        <div className="bg-white p-2.5 border border-gray-200 text-center text-gray-500 font-mono text-sm">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
          Loading promotional vouchers...
        </div>
      ) : filteredPromos.length === 0 ? (
        <div className="bg-white p-2.5 border border-gray-200 text-center text-gray-500 font-mono text-sm">
          No promos found. Click "Create Promo" to publish your first marketplace discount voucher.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-mono text-gray-500 uppercase tracking-wider">
                <th className="py-2 px-3">Code & Type</th>
                <th className="py-2 px-3">Reward Value</th>
                <th className="py-2 px-3">Eligibility & Channel</th>
                <th className="py-2 px-3">Spend & Min Qty</th>
                <th className="py-2 px-3">Schedule & Flash</th>
                <th className="py-2 px-3">Usage & Fraud</th>
                <th className="py-2 px-3 text-center">Status</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredPromos.map((p) => {
                const isFraudAlert = (p.fraudFlagsCount || 0) > 0;
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    {/* Code & Type */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 border border-gray-300 text-xs">
                          {p.code}
                        </span>
                        {p.voucherType === 'shipping_voucher' && (
                          <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 border border-blue-200">
                            FREE SHIPPING
                          </span>
                        )}
                        {p.voucherType === 'new_buyer_voucher' && (
                          <span className="text-[10px] font-mono bg-amber-50 text-amber-700 px-1.5 py-0.5 border border-amber-200">
                            NEW BUYER
                          </span>
                        )}
                        {p.voucherType === 'cashback_voucher' && (
                          <span className="text-[10px] font-mono bg-purple-50 text-purple-700 px-1.5 py-0.5 border border-purple-200">
                            CASHBACK
                          </span>
                        )}
                        {p.isPaydayOnly && (
                          <span className="text-[10px] font-mono bg-red-50 text-red-700 px-1.5 py-0.5 border border-red-200">
                            PAYDAY
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-gray-800 mt-1">{p.title}</div>
                      {p.description && (
                        <div className="text-[11px] text-gray-500 truncate max-w-xs">{p.description}</div>
                      )}
                    </td>

                    {/* Reward Value */}
                    <td className="py-2.5 px-3 font-mono text-xs">
                      {p.discountType === 'fixed' && (
                        <span className="text-emerald-700 font-bold">₱{Number(p.discountValue).toLocaleString()} OFF</span>
                      )}
                      {p.discountType === 'percentage' && (
                        <div>
                          <span className="text-indigo-700 font-bold">{p.discountValue}% OFF</span>
                          {p.maxDiscountAmount && (
                            <span className="text-[10px] text-gray-500 block">Cap: ₱{Number(p.maxDiscountAmount).toLocaleString()}</span>
                          )}
                        </div>
                      )}
                      {p.discountType === 'free_shipping' && (
                        <span className="text-blue-700 font-bold">100% Free Delivery</span>
                      )}
                      {p.discountType === 'shipping_discount' && (
                        <span className="text-blue-700 font-bold">Up to ₱{Number(p.cappedShippingDiscount || p.discountValue).toLocaleString()} Delivery Subsidy</span>
                      )}
                      {p.discountType === 'coins_cashback' && (
                        <div>
                          <span className="text-purple-700 font-bold">{p.discountValue}% Coins Cashback</span>
                          {p.maxDiscountAmount && (
                            <span className="text-[10px] text-gray-500 block">Cap: ₱{Number(p.maxDiscountAmount).toLocaleString()}</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Eligibility & Channel */}
                    <td className="py-2.5 px-3 font-mono text-xs text-gray-600">
                      <div>
                        {p.customerEligibility === 'new_customer' ? (
                          <span className="text-amber-700 font-semibold">New Customers Only</span>
                        ) : p.customerEligibility === 'min_orders' ? (
                          <span>Min {p.minPreviousOrders || 1}+ Prior Orders</span>
                        ) : p.customerEligibility === 'tier_restricted' ? (
                          <span className="text-indigo-700">Tiers: {p.eligibleTiers?.join(', ') || 'All'}</span>
                        ) : (
                          <span className="text-gray-500">All Buyers</span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {Array.isArray(p.allowedPaymentMethods) && !p.allowedPaymentMethods.includes('all') ? (
                          <span>PM: {p.allowedPaymentMethods.join(', ')}</span>
                        ) : (
                          <span>All Payment Channels</span>
                        )}
                      </div>
                    </td>

                    {/* Spend & Min Qty */}
                    <td className="py-2.5 px-3 font-mono text-xs text-gray-600">
                      <div>Min Spend: <span className="font-semibold text-gray-800">{p.minSpend ? `₱${Number(p.minSpend).toLocaleString()}` : '₱0'}</span></div>
                      {p.minItemQuantity && (
                        <div className="text-[11px] text-gray-500">Min Items: {p.minItemQuantity} pcs</div>
                      )}
                      <div className="text-[10px] text-gray-400">Limit: {p.usageLimitPerCustomer || 1}x/user</div>
                    </td>

                    {/* Schedule & Flash */}
                    <td className="py-2.5 px-3 font-mono text-[11px] text-gray-500">
                      {p.flashHourStart !== undefined && p.flashHourStart !== null && (
                        <div className="text-amber-700 font-bold">
                          Flash: {String(p.flashHourStart).padStart(2, '0')}:00 - {String(p.flashHourEnd || 24).padStart(2, '0')}:00 PHT
                        </div>
                      )}
                      {p.startDate || p.endDate ? (
                        <div>
                          <div>Start: {p.startDate ? new Date(p.startDate).toLocaleDateString() : 'Immediate'}</div>
                          <div>End: {p.endDate ? new Date(p.endDate).toLocaleDateString() : 'No expiry'}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Ongoing</span>
                      )}
                    </td>

                    {/* Usage & Fraud */}
                    <td className="py-2.5 px-3 font-mono text-xs">
                      <div className="flex items-center gap-1.5 text-gray-800 font-semibold">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        {p.usageCount || 0} {p.totalUsageLimit ? `/ ${p.totalUsageLimit}` : 'claimed'}
                      </div>
                      {isFraudAlert ? (
                        <button
                          onClick={() => setAuditPromo(p)}
                          className="mt-1 flex items-center gap-1 text-[10px] bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 hover:bg-red-100 cursor-pointer"
                        >
                          <ShieldAlert className="w-3 h-3 text-red-600" />
                          {p.fraudFlagsCount} Device Abuse
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-600 mt-1 block">Hardware verified</span>
                      )}
                    </td>

                    {/* Status Toggle */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => handleToggleActive(p)}
                        className={`inline-flex items-center px-2.5 py-1 text-xs font-mono font-medium border transition-colors cursor-pointer ${
                          p.isActive !== false
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                            : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        {p.isActive !== false ? 'Active' : 'Disabled'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setAuditPromo(p)}
                          className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                          title="View Redemptions & Fraud Logs"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(p)}
                          className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                          title="Edit Promo"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id, p.code)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Delete Promo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Philippine Marketplace Standard Configurator Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2.5">
          <div className="bg-white border border-gray-300 w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-none flex flex-col">
            {/* Modal Header */}
            <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="text-lg font-normal text-gray-900 flex items-center gap-2">
                  <Tag className="w-5 h-5 text-emerald-600" />
                  {editingPromo ? `Edit Voucher: ${editingPromo.code}` : 'Marketplace Promo Code Configurator'}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  Configure eligibility, conditions, flash windows, and payment restrictions
                </p>
              </div>
              <button 
                id="close-promo-modal-btn" 
                onClick={() => setIsModalOpen(false)} 
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Configurator Navigation Tabs */}
            <div className="flex border-b border-gray-200 bg-white px-3 overflow-x-auto">
              <button
                type="button"
                id="tab-basic-btn"
                onClick={() => setActiveTab('basic')}
                className={`py-2 px-3 text-xs font-mono font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'basic'
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                1. Basic Info & Type
              </button>
              <button
                type="button"
                id="tab-discount-btn"
                onClick={() => setActiveTab('discount')}
                className={`py-2 px-3 text-xs font-mono font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'discount'
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                2. Reward & Discount
              </button>
              <button
                type="button"
                id="tab-eligibility-btn"
                onClick={() => setActiveTab('eligibility')}
                className={`py-2 px-3 text-xs font-mono font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'eligibility'
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                3. Buyer & Basket Rules
              </button>
              <button
                type="button"
                id="tab-schedule-btn"
                onClick={() => setActiveTab('schedule')}
                className={`py-2 px-3 text-xs font-mono font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'schedule'
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                4. Schedule & Flash Sale
              </button>
              <button
                type="button"
                id="tab-limits-btn"
                onClick={() => setActiveTab('limits')}
                className={`py-2 px-3 text-xs font-mono font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'limits'
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                5. Quotas & Anti-Fraud
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-3 flex-1 space-y-3">
              {/* TAB 1: BASIC INFO & VOUCHER TYPE */}
              {activeTab === 'basic' && (
                <div className="space-y-3">
                  {/* Voucher Type Grid */}
                  <div>
                    <label className="block text-xs font-mono text-gray-600 uppercase mb-2">
                      Marketplace Voucher Category *
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { id: 'shop_voucher', label: 'Shop Voucher', desc: 'Item discount on subtotal', icon: Tag },
                        { id: 'shipping_voucher', label: 'Free Shipping', desc: '100% or capped courier subsidy', icon: Truck },
                        { id: 'new_buyer_voucher', label: 'New Buyer Welcome', desc: 'First purchase exclusive', icon: Users },
                        { id: 'cashback_voucher', label: 'Coins Cashback', desc: 'Rewards loyalty points', icon: Coins }
                      ].map((t) => {
                        const Icon = t.icon;
                        const isSelected = voucherType === t.id;
                        return (
                          <div
                            key={t.id}
                            onClick={() => handleSelectVoucherType(t.id as PromoVoucherType)}
                            className={`p-3 border rounded cursor-pointer transition-all ${
                              isSelected
                                ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <Icon className={`w-5 h-5 mb-1.5 ${isSelected ? 'text-emerald-700' : 'text-gray-400'}`} />
                            <div className="font-heading font-semibold text-xs text-gray-900">{t.label}</div>
                            <div className="text-[10px] text-gray-500 font-mono mt-0.5">{t.desc}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Promo Code Input with Auto-Generators */}
                  <div>
                    <label className="block text-xs font-mono text-gray-600 uppercase mb-1">
                      Voucher Code *
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="promo-code-input"
                        type="text"
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="e.g. PAYDAY50, FREESHIP, SALAMAT100"
                        className="flex-1 p-2.5 border border-gray-300 font-mono text-sm tracking-wider uppercase text-gray-900 outline-none focus:border-emerald-600"
                      />
                      <button
                        type="button"
                        id="auto-gen-prime-btn"
                        onClick={() => setCode(generatePromoCode('PRIME'))}
                        className="px-3 py-2.5 border border-gray-300 bg-gray-50 text-xs font-mono text-gray-700 hover:bg-gray-100 flex items-center gap-1.5 cursor-pointer"
                        title="Generate Random Code"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        Random
                      </button>
                      <button
                        type="button"
                        id="auto-gen-payday-btn"
                        onClick={() => setCode(`PAYDAY${new Date().getDate() >= 20 ? '30' : '15'}`)}
                        className="px-2.5 py-2.5 border border-gray-300 bg-gray-50 text-xs font-mono text-gray-700 hover:bg-gray-100 cursor-pointer"
                        title="Preset Payday Code"
                      >
                        Payday
                      </button>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-mono text-gray-600 uppercase mb-1">
                        Voucher Title (Displayed to Buyer at Checkout) *
                      </label>
                      <input
                        id="promo-title-input"
                        type="text"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Payday Special: ₱100 OFF on Orders ₱500+"
                        className="w-full p-2.5 border border-gray-300 text-sm outline-none focus:border-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-gray-600 uppercase mb-1">
                        Internal Notes / Campaign Remarks
                      </label>
                      <textarea
                        id="promo-desc-input"
                        rows={2}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Marketing blast for Manila Mega Sale Q3"
                        className="w-full p-2 border border-gray-300 text-xs font-mono outline-none focus:border-emerald-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: REWARD & DISCOUNT */}
              {activeTab === 'discount' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono text-gray-600 uppercase mb-2">
                      Reward / Discount Mechanism *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { id: 'fixed', label: 'Fixed Peso Discount', desc: '₱ amount deducted from subtotal' },
                        { id: 'percentage', label: 'Percentage (%) Off', desc: '% discount with optional max cap' },
                        { id: 'free_shipping', label: '100% Free Shipping', desc: 'Full delivery fee subsidized' },
                        { id: 'shipping_discount', label: 'Capped Shipping Subsidy', desc: 'Deducts up to ₱X from courier' },
                        { id: 'coins_cashback', label: 'Loyalty Points Cashback', desc: 'Rewards PRIME Points to buyer' }
                      ].map((d) => (
                        <div
                          key={d.id}
                          onClick={() => setDiscountType(d.id as PromoDiscountType)}
                          className={`p-3 border rounded cursor-pointer transition-all ${
                            discountType === d.id
                              ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="font-heading font-semibold text-xs text-gray-900">{d.label}</div>
                          <div className="text-[10px] text-gray-500 font-mono mt-0.5">{d.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Value Configuration */}
                  <div className="p-2.5 bg-gray-50 border border-gray-200 space-y-2.5">
                    {discountType === 'fixed' && (
                      <div>
                        <label className="block text-xs font-mono text-gray-700 uppercase mb-1">
                          Discount Amount (₱) *
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 font-mono text-gray-400">₱</span>
                          <input
                            id="discount-fixed-val-input"
                            type="number"
                            required
                            min={1}
                            value={discountValue}
                            onChange={(e) => setDiscountValue(e.target.value ? Number(e.target.value) : '')}
                            placeholder="100"
                            className="w-full pl-8 p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600 bg-white"
                          />
                        </div>
                      </div>
                    )}

                    {discountType === 'percentage' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-mono text-gray-700 uppercase mb-1">
                            Discount Percentage (1-100%) *
                          </label>
                          <div className="relative">
                            <input
                              id="discount-pct-val-input"
                              type="number"
                              required
                              min={1}
                              max={100}
                              value={discountValue}
                              onChange={(e) => setDiscountValue(e.target.value ? Number(e.target.value) : '')}
                              placeholder="15"
                              className="w-full pr-8 p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600 bg-white"
                            />
                            <span className="absolute right-3 top-2.5 font-mono text-gray-400">%</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-gray-700 uppercase mb-1">
                            Maximum Discount Cap (₱, Optional)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 font-mono text-gray-400">₱</span>
                            <input
                              id="discount-cap-input"
                              type="number"
                              min={1}
                              value={maxDiscountAmount}
                              onChange={(e) => setMaxDiscountAmount(e.target.value ? Number(e.target.value) : '')}
                              placeholder="e.g. 250 (leave empty for uncapped)"
                              className="w-full pl-8 p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600 bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {discountType === 'free_shipping' && (
                      <div className="text-xs font-mono text-blue-800 bg-blue-50/70 p-3 border border-blue-200">
                        100% of the customer's calculated courier delivery fee will be subsidized and discounted at checkout.
                      </div>
                    )}

                    {discountType === 'shipping_discount' && (
                      <div>
                        <label className="block text-xs font-mono text-gray-700 uppercase mb-1">
                          Max Shipping Subsidy Amount (₱) *
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 font-mono text-gray-400">₱</span>
                          <input
                            id="shipping-subsidy-input"
                            type="number"
                            required
                            min={1}
                            value={cappedShippingDiscount || discountValue}
                            onChange={(e) => {
                              const val = e.target.value ? Number(e.target.value) : '';
                              setCappedShippingDiscount(val);
                              setDiscountValue(val);
                            }}
                            placeholder="60"
                            className="w-full pl-8 p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600 bg-white"
                          />
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono mt-1 block">
                          Example: If courier fee is ₱90 and subsidy is ₱60, buyer pays only ₱30 delivery fee.
                        </span>
                      </div>
                    )}

                    {discountType === 'coins_cashback' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-mono text-gray-700 uppercase mb-1">
                            Cashback Rate (% of Subtotal) *
                          </label>
                          <div className="relative">
                            <input
                              id="cashback-pct-input"
                              type="number"
                              required
                              min={1}
                              max={100}
                              value={discountValue}
                              onChange={(e) => setDiscountValue(e.target.value ? Number(e.target.value) : '')}
                              placeholder="10"
                              className="w-full pr-8 p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600 bg-white"
                            />
                            <span className="absolute right-3 top-2.5 font-mono text-gray-400">%</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-gray-700 uppercase mb-1">
                            Max Points Reward Cap (Optional)
                          </label>
                          <input
                            id="cashback-cap-input"
                            type="number"
                            min={1}
                            value={maxDiscountAmount}
                            onChange={(e) => setMaxDiscountAmount(e.target.value ? Number(e.target.value) : '')}
                            placeholder="e.g. 500 points"
                            className="w-full p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600 bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: BUYER & BASKET RULES */}
              {activeTab === 'eligibility' && (
                <div className="space-y-3">
                  {/* Basket Thresholds */}
                  <div>
                    <h4 className="text-xs font-mono uppercase text-gray-700 font-bold mb-2">
                      Basket Minimum Conditions
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-mono text-gray-600 mb-1">
                          Minimum Items Spend (₱)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 font-mono text-gray-400">₱</span>
                          <input
                            id="promo-min-spend-input"
                            type="number"
                            min={0}
                            value={minSpend}
                            onChange={(e) => setMinSpend(e.target.value ? Number(e.target.value) : '')}
                            placeholder="0 (No minimum)"
                            className="w-full pl-8 p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-gray-600 mb-1">
                          Minimum Cart Item Quantity (Pieces)
                        </label>
                        <input
                          id="promo-min-qty-input"
                          type="number"
                          min={1}
                          value={minItemQuantity}
                          onChange={(e) => setMinItemQuantity(e.target.value ? Number(e.target.value) : '')}
                          placeholder="e.g. 2 items or leave empty"
                          className="w-full p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Customer Target Audience */}
                  <div className="pt-3 border-t border-gray-200">
                    <h4 className="text-xs font-mono uppercase text-gray-700 font-bold mb-2">
                      Customer Eligibility Criteria
                    </h4>
                    <div className="space-y-2">
                      {[
                        { id: 'all', title: 'All Registered & Guest Buyers', desc: 'Universal access for any checkout' },
                        { id: 'new_customer', title: 'New Customers Only (Welcome Voucher)', desc: 'Valid only if user has 0 previous completed orders' },
                        { id: 'min_orders', title: 'Repeat / Loyal Buyers', desc: 'Valid only for buyers who reached order frequency milestone' },
                        { id: 'tier_restricted', title: 'Loyalty VIP Tier Restricted', desc: 'Exclusively available to specific PRIME Loyalty tiers' }
                      ].map((item) => (
                        <label
                          key={item.id}
                          className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${
                            customerEligibility === item.id
                              ? 'border-emerald-600 bg-emerald-50/50'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="customer-eligibility-radio"
                            checked={customerEligibility === item.id}
                            onChange={() => setCustomerEligibility(item.id as PromoCustomerEligibility)}
                            className="mt-1 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div>
                            <div className="text-xs font-bold font-heading text-gray-900">{item.title}</div>
                            <div className="text-[11px] text-gray-500 font-mono">{item.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>

                    {/* Conditional input for min_orders */}
                    {customerEligibility === 'min_orders' && (
                      <div className="mt-3 p-3 bg-gray-50 border border-gray-200">
                        <label className="block text-xs font-mono text-gray-700 mb-1">
                          Minimum Required Completed Orders:
                        </label>
                        <input
                          id="promo-min-orders-input"
                          type="number"
                          min={1}
                          value={minPreviousOrders}
                          onChange={(e) => setMinPreviousOrders(e.target.value ? Number(e.target.value) : '')}
                          placeholder="e.g. 3"
                          className="w-32 p-1.5 border border-gray-300 font-mono text-sm bg-white"
                        />
                      </div>
                    )}

                    {/* Conditional selection for loyalty tiers */}
                    {customerEligibility === 'tier_restricted' && (
                      <div className="mt-3 p-3 bg-gray-50 border border-gray-200">
                        <label className="block text-xs font-mono text-gray-700 mb-2">
                          Select Eligible VIP Tiers:
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {LOYALTY_TIERS.map((tier) => {
                            const isChecked = eligibleTiers.includes(tier);
                            return (
                              <label
                                key={tier}
                                className={`flex items-center gap-2 p-2 border text-xs font-mono rounded cursor-pointer ${
                                  isChecked ? 'bg-emerald-100 border-emerald-500 text-emerald-900 font-bold' : 'bg-white border-gray-200 text-gray-700'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setEligibleTiers([...eligibleTiers, tier]);
                                    } else {
                                      setEligibleTiers(eligibleTiers.filter(t => t !== tier));
                                    }
                                  }}
                                  className="text-emerald-600 rounded"
                                />
                                <span>{tier}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Channel Restrictions */}
                  <div className="pt-3 border-t border-gray-200">
                    <h4 className="text-xs font-mono uppercase text-gray-700 font-bold mb-2">
                      Payment Method Restriction
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 p-2.5 border border-gray-200 bg-white text-xs font-mono cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={allowedPaymentMethods.includes('all')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAllowedPaymentMethods(['all']);
                            } else {
                              setAllowedPaymentMethods(['upon_checkout']);
                            }
                          }}
                          className="text-emerald-600 rounded"
                        />
                        <span className="font-bold text-gray-900">All Payment Channels</span>
                      </label>
                      {!allowedPaymentMethods.includes('all') && (
                        <>
                          <label className="flex items-center gap-2 p-2.5 border border-gray-200 bg-white text-xs font-mono cursor-pointer hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={allowedPaymentMethods.includes('upon_checkout')}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setAllowedPaymentMethods(prev => checked ? [...prev, 'upon_checkout'] : prev.filter(x => x !== 'upon_checkout'));
                              }}
                              className="text-emerald-600 rounded"
                            />
                            <span>GCash / Maya / Bank (Online Checkout)</span>
                          </label>
                          <label className="flex items-center gap-2 p-2.5 border border-gray-200 bg-white text-xs font-mono cursor-pointer hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={allowedPaymentMethods.includes('upon_delivery')}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setAllowedPaymentMethods(prev => checked ? [...prev, 'upon_delivery'] : prev.filter(x => x !== 'upon_delivery'));
                              }}
                              className="text-emerald-600 rounded"
                            />
                            <span>Cash / Paid Upon Delivery</span>
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: SCHEDULE & FLASH SALE */}
              {activeTab === 'schedule' && (
                <div className="space-y-3">
                  {/* Validity Date Range */}
                  <div>
                    <h4 className="text-xs font-mono uppercase text-gray-700 font-bold mb-2">
                      Voucher Validity Period
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-mono text-gray-600 mb-1">Start Date (PHT)</label>
                        <input
                          id="promo-start-date-input"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-gray-600 mb-1">Expiry Date (PHT)</label>
                        <input
                          id="promo-end-date-input"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Philippine Marketplace Specials: Payday & Days of Week */}
                  <div className="pt-3 border-t border-gray-200 space-y-2.5">
                    <div className="flex items-start gap-3 p-3.5 bg-red-50/70 border border-red-200 rounded">
                      <input
                        id="promo-payday-check"
                        type="checkbox"
                        checked={isPaydayOnly}
                        onChange={(e) => setIsPaydayOnly(e.target.checked)}
                        className="mt-0.5 text-red-600 rounded focus:ring-red-500"
                      />
                      <div>
                        <label htmlFor="promo-payday-check" className="font-heading font-bold text-xs text-red-900 cursor-pointer">
                          Philippine Payday Flash Exclusive (15th & Month-End)
                        </label>
                        <p className="text-[11px] text-red-700 font-mono mt-0.5">
                          When checked, this voucher will ONLY activate on the 14th-16th and the 28th-end of the month (Philippine Time).
                        </p>
                      </div>
                    </div>

                    {/* Active Days of the Week */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-mono text-gray-700 uppercase font-bold">
                          Active Days of Week
                        </label>
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          <button
                            type="button"
                            onClick={() => setActiveDaysOfWeek([0, 1, 2, 3, 4, 5, 6])}
                            className="text-emerald-700 hover:underline cursor-pointer"
                          >
                            All Days
                          </button>
                          <span>|</span>
                          <button
                            type="button"
                            onClick={() => setActiveDaysOfWeek([1, 2, 3, 4, 5])}
                            className="text-emerald-700 hover:underline cursor-pointer"
                          >
                            Weekdays Only
                          </button>
                          <span>|</span>
                          <button
                            type="button"
                            onClick={() => setActiveDaysOfWeek([0, 6])}
                            className="text-emerald-700 hover:underline cursor-pointer"
                          >
                            Weekends Only
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-1.5">
                        {DAYS_OF_WEEK.map((day) => {
                          const isSelected = activeDaysOfWeek.includes(day.id);
                          return (
                            <button
                              type="button"
                              key={day.id}
                              onClick={() => {
                                if (isSelected) {
                                  if (activeDaysOfWeek.length > 1) {
                                    setActiveDaysOfWeek(activeDaysOfWeek.filter(d => d !== day.id));
                                  }
                                } else {
                                  setActiveDaysOfWeek([...activeDaysOfWeek, day.id]);
                                }
                              }}
                              className={`py-2 text-center text-xs font-mono border rounded transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Flash Sale Rush Hour Window */}
                    <div className="p-2.5 bg-amber-50/60 border border-amber-200 rounded">
                      <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-900 mb-1">
                        <Clock className="w-4 h-4 text-amber-700" />
                        Flash Sale Hour Window (PHT / UTC+8)
                      </div>
                      <p className="text-[11px] text-amber-700 font-mono mb-3">
                        Restrict voucher to specific rush hours (e.g. 12:00 PM lunch flash, or 00:00 midnight drop). Leave blank for all day.
                      </p>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-mono text-gray-600 uppercase mb-1">
                            Start Hour (0 - 23)
                          </label>
                          <input
                            id="flash-hour-start-input"
                            type="number"
                            min={0}
                            max={23}
                            value={flashHourStart}
                            onChange={(e) => setFlashHourStart(e.target.value !== '' ? Number(e.target.value) : '')}
                            placeholder="e.g. 12 (12:00 PM)"
                            className="w-full p-2 border border-gray-300 font-mono text-sm bg-white outline-none focus:border-amber-600"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono text-gray-600 uppercase mb-1">
                            End Hour (1 - 24)
                          </label>
                          <input
                            id="flash-hour-end-input"
                            type="number"
                            min={1}
                            max={24}
                            value={flashHourEnd}
                            onChange={(e) => setFlashHourEnd(e.target.value !== '' ? Number(e.target.value) : '')}
                            placeholder="e.g. 14 (2:00 PM)"
                            className="w-full p-2 border border-gray-300 font-mono text-sm bg-white outline-none focus:border-amber-600"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: QUOTAS & ANTI-FRAUD */}
              {activeTab === 'limits' && (
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-mono uppercase text-gray-700 font-bold mb-2">
                      Redemption Quotas & Allocation
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-mono text-gray-600 mb-1">
                          Marketplace Total Redemptions Quota
                        </label>
                        <input
                          id="total-usage-limit-input"
                          type="number"
                          min={1}
                          value={totalUsageLimit}
                          onChange={(e) => setTotalUsageLimit(e.target.value ? Number(e.target.value) : '')}
                          placeholder="Unlimited (or enter number e.g. 500)"
                          className="w-full p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600"
                        />
                        <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">
                          Total vouchers available for the entire customer base.
                        </span>
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-gray-600 mb-1">
                          Claims Limit Per Customer / Device
                        </label>
                        <input
                          id="per-user-limit-input"
                          type="number"
                          min={1}
                          value={usageLimitPerCustomer}
                          onChange={(e) => setUsageLimitPerCustomer(Math.max(1, parseInt(e.target.value || '1', 10)))}
                          className="w-full p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600"
                        />
                        <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">
                          Default is 1x per user to prevent duplicate redemptions.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Device Fingerprinting Anti-Fraud Guarantee */}
                  <div className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded space-y-2">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-900">
                      <ShieldAlert className="w-4 h-4 text-emerald-700" />
                      Multi-Account Voucher Abuse Protection
                    </div>
                    <p className="text-[11px] text-emerald-800 font-mono leading-relaxed">
                      Every promo redemption records the customer's Canvas/WebGL hardware signature and hardware UUID. If a buyer creates multiple dummy accounts or incognito sessions on the same physical phone or computer to reuse Welcome or Flash vouchers, the system automatically rejects it with "Voucher already redeemed on this device".
                    </p>
                  </div>

                  {/* Master Active Status */}
                  <div className="pt-2 border-t border-gray-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        id="promo-master-active-check"
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                      />
                      <span className="text-xs font-mono text-gray-800 font-bold">
                        Activate voucher immediately for customer checkout
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  {activeTab !== 'basic' && (
                    <button
                      type="button"
                      onClick={() => {
                        const tabs: ('basic' | 'discount' | 'eligibility' | 'schedule' | 'limits')[] = ['basic', 'discount', 'eligibility', 'schedule', 'limits'];
                        const currIdx = tabs.indexOf(activeTab);
                        if (currIdx > 0) setActiveTab(tabs[currIdx - 1]);
                      }}
                      className="px-3.5 py-1.5 border border-gray-300 text-xs font-mono text-gray-700 hover:bg-gray-50 cursor-pointer"
                    >
                      ← Previous Tab
                    </button>
                  )}
                  {activeTab !== 'limits' && (
                    <button
                      type="button"
                      onClick={() => {
                        const tabs: ('basic' | 'discount' | 'eligibility' | 'schedule' | 'limits')[] = ['basic', 'discount', 'eligibility', 'schedule', 'limits'];
                        const currIdx = tabs.indexOf(activeTab);
                        if (currIdx < tabs.length - 1) setActiveTab(tabs[currIdx + 1]);
                      }}
                      className="px-3.5 py-1.5 border border-emerald-300 bg-emerald-50 text-xs font-mono text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                    >
                      Next Tab →
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="cancel-promo-modal-btn"
                    onClick={() => setIsModalOpen(false)}
                    className="px-3 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="submit-promo-modal-btn"
                    disabled={submitting}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? 'Saving Voucher...' : editingPromo ? 'Update Voucher' : 'Publish Voucher'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit & Redemptions Modal */}
      {auditPromo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2.5">
          <div className="bg-white border border-gray-300 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-none">
            <div className="p-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-normal text-gray-900 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-emerald-600" />
                  Redemption & Fraud Audit: {auditPromo.code}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  Device fingerprinting matches, customer accounts, and order records
                </p>
              </div>
              <button onClick={() => setAuditPromo(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 space-y-2.5">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-gray-50 border border-gray-200 font-mono text-center">
                  <div className="text-[10px] text-gray-500 uppercase">Total Redemptions</div>
                  <div className="text-lg font-bold text-gray-900">{auditPromo.usageCount || 0}</div>
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200 font-mono text-center">
                  <div className="text-[10px] text-gray-500 uppercase">Discount Rate</div>
                  <div className="text-lg font-bold text-emerald-700">
                    {auditPromo.discountType === 'fixed' ? `₱${auditPromo.discountValue}` : `${auditPromo.discountValue}%`}
                  </div>
                </div>
                <div className={`p-3 border font-mono text-center ${
                  auditPromo.fraudFlagsCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="text-[10px] uppercase text-gray-500">Device Abuse Flags</div>
                  <div className={`text-lg font-bold ${auditPromo.fraudFlagsCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                    {auditPromo.fraudFlagsCount || 0}
                  </div>
                </div>
              </div>

              {/* Redemptions Table */}
              <div>
                <h4 className="text-xs font-mono text-gray-700 uppercase mb-2">Recent Redemptions Log</h4>
                {(!auditPromo.redemptions || auditPromo.redemptions.length === 0) ? (
                  <div className="p-3 border border-dashed border-gray-200 text-center text-xs font-mono text-gray-400">
                    No orders have claimed this promo code yet.
                  </div>
                ) : (
                  <div className="border border-gray-200 overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase border-b border-gray-200">
                        <tr>
                          <th className="p-2.5">Order #</th>
                          <th className="p-2.5">Member ID</th>
                          <th className="p-2.5">Device Fingerprint</th>
                          <th className="p-2.5">Discount</th>
                          <th className="p-2.5">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {auditPromo.redemptions.map((r: any, idx: number) => (
                          <tr key={r.id || idx} className="hover:bg-gray-50">
                            <td className="p-2.5 font-bold text-gray-900">#{r.orderId}</td>
                            <td className="p-2.5 text-gray-700">{r.primeMemberId || r.customerId || 'Guest'}</td>
                            <td className="p-2.5 text-gray-500 truncate max-w-[120px]">
                              {r.deviceId || r.hardwareId || 'N/A'}
                            </td>
                            <td className="p-2.5 text-emerald-700 font-semibold">
                              ₱{Number(r.discountAmount || 0).toLocaleString()}
                            </td>
                            <td className="p-2.5 text-gray-400 text-[10px]">
                              {r.usedAt ? new Date(r.usedAt).toLocaleString() : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setAuditPromo(null)}
                  className="px-3 py-2 bg-gray-900 text-white text-xs font-mono hover:bg-black transition-colors cursor-pointer"
                >
                  Close Audit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

