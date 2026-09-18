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
  Truck
} from 'lucide-react';
import { PromoConfig, generatePromoCode } from '@/lib/promos';

export default function PromosModule() {
  const [promos, setPromos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<any | null>(null);
  const [auditPromo, setAuditPromo] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage' | 'free_shipping'>('fixed');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  const [maxDiscountAmount, setMaxDiscountAmount] = useState<number | ''>('');
  const [minSpend, setMinSpend] = useState<number | ''>('');
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
    setCode(generatePromoCode('PRIME'));
    setTitle('');
    setDescription('');
    setDiscountType('fixed');
    setDiscountValue('');
    setMaxDiscountAmount('');
    setMinSpend('');
    setTotalUsageLimit('');
    setUsageLimitPerCustomer(1);
    setIsActive(true);
    setStartDate('');
    setEndDate('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: any) => {
    setEditingPromo(p);
    setCode(p.code || '');
    setTitle(p.title || '');
    setDescription(p.description || '');
    setDiscountType(p.discountType || 'fixed');
    setDiscountValue(p.discountValue !== undefined ? p.discountValue : '');
    setMaxDiscountAmount(p.maxDiscountAmount || '');
    setMinSpend(p.minSpend || '');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      alert('Promo code is required');
      return;
    }
    if (discountType !== 'free_shipping' && (!discountValue || Number(discountValue) <= 0)) {
      alert('Please enter a valid discount value');
      return;
    }

    try {
      setSubmitting(true);
      const payload: any = {
        code: code.trim().toUpperCase(),
        title: title.trim() || `${code.trim().toUpperCase()} Promo`,
        description: description.trim(),
        discountType,
        discountValue: discountType === 'free_shipping' ? 0 : Number(discountValue),
        maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : null,
        minSpend: minSpend ? Number(minSpend) : 0,
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
      p.description?.toLowerCase().includes(q)
    );
  });

  return (
    <div id="promos-module-container" className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-gray-200">
        <div>
          <h2 className="text-xl font-normal text-gray-900 flex items-center gap-2">
            <Tag className="w-5 h-5 text-emerald-600" />
            Promos & Discounts
          </h2>
          <p className="text-xs text-gray-500 mt-1 font-mono">
            Manage promotional discount vouchers, validity schedules, spending tiers, and device abuse anti-fraud
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
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Promo
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white p-4 border border-gray-200 flex items-center gap-3">
        <Search className="w-4 h-4 text-gray-400" />
        <input
          id="search-promos-input"
          type="text"
          placeholder="Search by code, promo title, or details..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full text-sm outline-none font-mono text-gray-800 placeholder-gray-400"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Promos Table / Grid */}
      {loading ? (
        <div className="bg-white p-12 border border-gray-200 text-center text-gray-500 font-mono text-sm">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
          Loading promotional vouchers...
        </div>
      ) : filteredPromos.length === 0 ? (
        <div className="bg-white p-12 border border-gray-200 text-center text-gray-500 font-mono text-sm">
          No promos found. Click "Create Promo" to publish your first discount code.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-mono text-gray-500 uppercase tracking-wider">
                <th className="py-3 px-4">Code & Title</th>
                <th className="py-3 px-4">Discount</th>
                <th className="py-3 px-4">Spend & Limits</th>
                <th className="py-3 px-4">Usage & Fraud</th>
                <th className="py-3 px-4">Schedule</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredPromos.map((p) => {
                const isFraudAlert = (p.fraudFlagsCount || 0) > 0;
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 border border-gray-300 text-xs">
                          {p.code}
                        </span>
                        {p.discountType === 'free_shipping' && (
                          <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 border border-blue-200">
                            FREE DELIVERY
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-gray-800 mt-1">{p.title}</div>
                      {p.description && (
                        <div className="text-[11px] text-gray-500 truncate max-w-xs">{p.description}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs">
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
                        <span className="text-blue-700 font-bold">100% Free Shipping</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-600">
                      <div>Min Spend: <span className="font-semibold text-gray-800">{p.minSpend ? `₱${Number(p.minSpend).toLocaleString()}` : 'None'}</span></div>
                      <div className="text-[11px] text-gray-500">Per User: {p.usageLimitPerCustomer || 1}x</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs">
                      <div className="flex items-center gap-1.5 text-gray-800 font-semibold">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        {p.usageCount || 0} {p.totalUsageLimit ? `/ ${p.totalUsageLimit}` : 'redemptions'}
                      </div>
                      {isFraudAlert ? (
                        <button
                          onClick={() => setAuditPromo(p)}
                          className="mt-1 flex items-center gap-1 text-[10px] bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 hover:bg-red-100"
                        >
                          <ShieldAlert className="w-3 h-3 text-red-600" />
                          {p.fraudFlagsCount} Device Abuse
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-600 mt-1 block">Anti-fraud verified</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-gray-500">
                      {p.startDate || p.endDate ? (
                        <div>
                          <div>Start: {p.startDate ? new Date(p.startDate).toLocaleDateString() : 'Immediate'}</div>
                          <div>End: {p.endDate ? new Date(p.endDate).toLocaleDateString() : 'Never'}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Ongoing</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleToggleActive(p)}
                        className={`inline-flex items-center px-2.5 py-1 text-xs font-mono font-medium border transition-colors ${
                          p.isActive !== false
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                            : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        {p.isActive !== false ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setAuditPromo(p)}
                          className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                          title="View Redemptions"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(p)}
                          className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                          title="Edit Promo"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id, p.code)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-gray-300 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-normal text-gray-900">
                {editingPromo ? `Edit Promo: ${editingPromo.code}` : 'Create New Promotional Code'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Code */}
              <div>
                <label className="block text-xs font-mono text-gray-600 uppercase mb-1">
                  Promo Code *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. PRIME50"
                    className="flex-1 p-2.5 border border-gray-300 font-mono text-sm tracking-wider uppercase text-gray-900 outline-none focus:border-emerald-600"
                  />
                  <button
                    type="button"
                    onClick={() => setCode(generatePromoCode('PRIME'))}
                    className="px-3 py-2.5 border border-gray-300 bg-gray-50 text-xs font-mono text-gray-700 hover:bg-gray-100 flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Auto
                  </button>
                </div>
              </div>

              {/* Title & Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-gray-600 uppercase mb-1">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Welcome Discount"
                    className="w-full p-2 border border-gray-300 text-sm outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-600 uppercase mb-1">Discount Type</label>
                  <select
                    value={discountType}
                    onChange={(e: any) => setDiscountType(e.target.value)}
                    className="w-full p-2 border border-gray-300 text-sm font-mono outline-none focus:border-emerald-600 bg-white"
                  >
                    <option value="fixed">Fixed Amount (₱)</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="free_shipping">Free Shipping</option>
                  </select>
                </div>
              </div>

              {/* Discount Value & Max Cap */}
              {discountType !== 'free_shipping' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-gray-600 uppercase mb-1">
                      {discountType === 'fixed' ? 'Discount Amount (₱) *' : 'Percentage (0-100%) *'}
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={discountType === 'percentage' ? 100 : undefined}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value ? Number(e.target.value) : '')}
                      placeholder={discountType === 'fixed' ? '100' : '15'}
                      className="w-full p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600"
                    />
                  </div>
                  {discountType === 'percentage' && (
                    <div>
                      <label className="block text-xs font-mono text-gray-600 uppercase mb-1">
                        Max Cap (₱, optional)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={maxDiscountAmount}
                        onChange={(e) => setMaxDiscountAmount(e.target.value ? Number(e.target.value) : '')}
                        placeholder="e.g. 250"
                        className="w-full p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Min Spend & Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-mono text-gray-600 uppercase mb-1">Min Spend (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={minSpend}
                    onChange={(e) => setMinSpend(e.target.value ? Number(e.target.value) : '')}
                    placeholder="0"
                    className="w-full p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-600 uppercase mb-1">Total Limit</label>
                  <input
                    type="number"
                    min={1}
                    value={totalUsageLimit}
                    onChange={(e) => setTotalUsageLimit(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Unlimited"
                    className="w-full p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-600 uppercase mb-1">Per User Limit</label>
                  <input
                    type="number"
                    min={1}
                    value={usageLimitPerCustomer}
                    onChange={(e) => setUsageLimitPerCustomer(Math.max(1, parseInt(e.target.value || '1', 10)))}
                    className="w-full p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              {/* Start & End Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-gray-600 uppercase mb-1">Start Date (Optional)</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-600 uppercase mb-1">End Date (Optional)</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full p-2 border border-gray-300 font-mono text-sm outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-mono text-gray-600 uppercase mb-1">Notes / Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Special promo for launch campaign"
                  className="w-full p-2 border border-gray-300 text-sm outline-none focus:border-emerald-600"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  id="promo-active-check"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="promo-active-check" className="text-xs font-mono text-gray-700 cursor-pointer">
                  Activate promo voucher immediately upon saving
                </label>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingPromo ? 'Update Promo' : 'Publish Promo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit & Redemptions Modal */}
      {auditPromo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-gray-300 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-xl">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-normal text-gray-900 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-emerald-600" />
                  Redemption & Fraud Audit: {auditPromo.code}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  Device fingerprinting matches, customer accounts, and order records
                </p>
              </div>
              <button onClick={() => setAuditPromo(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
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
                  <div className="p-8 border border-dashed border-gray-200 text-center text-xs font-mono text-gray-400">
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
                  className="px-4 py-2 bg-gray-900 text-white text-xs font-mono hover:bg-black transition-colors"
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
