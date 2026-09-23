'use client';

import React, { useState, useEffect } from 'react';
import { 
  User, 
  X, 
  Copy, 
  Check, 
  Award, 
  Sparkles, 
  ArrowRight, 
  Share2, 
  RefreshCw, 
  CreditCard, 
  ArrowUpRight, 
  Clock, 
  Users, 
  ShoppingBag, 
  Calendar, 
  Phone, 
  ChevronRight, 
  Send, 
  TrendingUp, 
  ShieldCheck, 
  Camera, 
  Info,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOrder?: (order: any) => void;
}

export default function AccountModal({ isOpen, onClose, onSelectOrder }: AccountModalProps) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'points' | 'referrals' | 'orders'>('overview');

  // Copy helper state
  const [copiedCode, setCopiedCode] = useState(false);

  // Conversion state
  const [converting, setConverting] = useState(false);
  const [convertType, setConvertType] = useState<'purchasing' | 'referral'>('purchasing');
  const [convertAmount, setConvertAmount] = useState<number | ''>('');

  // Transfer state
  const [transferring, setTransferring] = useState(false);
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState<number | ''>('');
  const [transferMsg, setTransferMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Custom photo upload state
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Referrals view modal
  const [showReferralsList, setShowReferralsList] = useState(false);

  const getLiveTelegramInitData = () => {
    if (typeof window === 'undefined') return '';
    const webApp = (window as any).Telegram?.WebApp;
    return typeof webApp?.initData === 'string' ? webApp.initData.trim() : '';
  };

  const bootstrapTelegramSession = async () => {
    const initData = getLiveTelegramInitData();
    if (!initData) throw new Error('Telegram authentication required. Please reopen PRIME from Telegram.');

    const response = await fetch('/api/auth/telegram/validate', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Unable to restore Telegram session.');
    }

    const sessionCheck = await fetch('/api/auth/telegram/validate', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    const session = await sessionCheck.json().catch(() => ({}));
    if (!sessionCheck.ok || !session.authenticated || !session.sessionReady) {
      throw new Error('Telegram session could not be restored. Please reopen PRIME from Telegram.');
    }
  };

  const authenticatedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const initData = getLiveTelegramInitData();
    const headers = new Headers(init?.headers || {});
    if (initData) headers.set('X-Telegram-Init-Data', initData);

    let response = await fetch(input, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });

    if (response.status === 401) {
      await bootstrapTelegramSession();

      const retryHeaders = new Headers(init?.headers || {});
      const retryInitData = getLiveTelegramInitData();
      if (retryInitData) retryHeaders.set('X-Telegram-Init-Data', retryInitData);

      response = await fetch(input, {
        ...init,
        headers: retryHeaders,
        credentials: 'include',
        cache: 'no-store',
      });
    }

    return response;
  };

  const fetchAccount = async () => {
    try {
      setLoading(true);
      setError(null);

      // Determine customer id or tgUserId from storage/session
      let customerId = '';
      let primeMemberId = '';

      if (typeof window !== 'undefined') {
        const storedUser = localStorage.getItem('prime_user') || sessionStorage.getItem('prime_user');
        if (storedUser) {
          try {
            const parsed = JSON.parse(storedUser);
            customerId = parsed.id || parsed.tgUserId || '';
            primeMemberId = parsed.primeMemberId || '';
          } catch {}
        }
        if (!customerId) {
          customerId = localStorage.getItem('tg_user_id') || sessionStorage.getItem('tg_user_id') || '';
        }
        if (!primeMemberId) {
          primeMemberId = localStorage.getItem('prime_member_id') || sessionStorage.getItem('prime_member_id') || '';
        }
      }

      const params = new URLSearchParams();
      if (customerId) params.set('customerId', customerId);
      if (primeMemberId) params.set('primeMemberId', primeMemberId);

      const res = await authenticatedFetch(`/api/account?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to load account profile');
      }

      const resData = await res.json();
      setData(resData);
    } catch (err: any) {
      setError(err.message || 'Error loading account details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAccount();
    }
  }, [isOpen]);

  const handleCopyCode = () => {
    if (!data?.customer?.primeMemberId) return;
    navigator.clipboard.writeText(data.customer.primeMemberId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleShareReferral = () => {
    if (!data?.customer?.primeMemberId) return;
    const shareText = `Join Prime Shop! Use my referral code ${data.customer.primeMemberId} when checking out to support my membership!`;
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(shareText)}`;
    window.open(tgUrl, '_blank');
  };

  const handleConvertPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertAmount || Number(convertAmount) <= 0) return;
    try {
      setConverting(true);
      const res = await authenticatedFetch('/api/account/points/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: data?.customer?.id,
          pointsType: convertType,
          amount: Number(convertAmount)
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Conversion failed');

      alert(`Successfully converted ${result.convertedAmount} points to ₱${result.convertedAmount} Store Credits!`);
      setConvertAmount('');
      fetchAccount();
    } catch (err: any) {
      alert(err.message || 'Conversion failed');
    } finally {
      setConverting(false);
    }
  };

  const handleTransferCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferMsg(null);
    if (!transferRecipient.trim() || !transferAmount || Number(transferAmount) <= 0) return;

    try {
      setTransferring(true);
      const res = await authenticatedFetch('/api/account/points/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderCustomerId: data?.customer?.id,
          recipientMemberId: transferRecipient.trim().toUpperCase(),
          amount: Number(transferAmount)
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Transfer failed');

      setTransferMsg({
        type: 'success',
        text: `Transferred ₱${result.transferredAmount} to ${result.recipientName} (${result.recipientMemberId}) successfully!`
      });
      setTransferRecipient('');
      setTransferAmount('');
      fetchAccount();
    } catch (err: any) {
      setTransferMsg({ type: 'error', text: err.message || 'Transfer failed' });
    } finally {
      setTransferring(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Photo must be smaller than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (!base64 || !data?.customer?.id) return;

      try {
        setUploadingPhoto(true);
        const res = await authenticatedFetch('/api/account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: data.customer.id,
            photoUrl: base64
          })
        });
        if (!res.ok) throw new Error('Failed to update photo');
        
        setData((prev: any) => ({
          ...prev,
          customer: {
            ...prev.customer,
            photoUrl: base64,
            hasCustomPhoto: true
          }
        }));
      } catch (err: any) {
        alert(err.message || 'Error updating photo');
      } finally {
        setUploadingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  const c = data?.customer;
  const tier = c?.tierInfo;

  // Tier color mapping
  const tierColors: Record<string, { bg: string; text: string; border: string; pill: string }> = {
    Titanium: { bg: 'bg-slate-900', text: 'text-white', border: 'border-slate-800', pill: 'bg-gradient-to-r from-slate-800 to-slate-950 text-slate-100' },
    Platinum: { bg: 'bg-cyan-950', text: 'text-cyan-200', border: 'border-cyan-800', pill: 'bg-cyan-900 text-cyan-100' },
    Gold: { bg: 'bg-amber-950', text: 'text-amber-200', border: 'border-amber-700', pill: 'bg-amber-900 text-amber-100' },
    Bronze: { bg: 'bg-orange-950', text: 'text-orange-200', border: 'border-orange-800', pill: 'bg-orange-900 text-orange-100' },
    Silver: { bg: 'bg-slate-800', text: 'text-slate-200', border: 'border-slate-600', pill: 'bg-slate-700 text-slate-100' },
  };

  const activeTier = tier?.tier || 'Silver';
  const activeTierTheme = tierColors[activeTier] || tierColors.Silver;

  return (
    <div id="account-modal-overlay" className="w-full bg-gray-50 flex justify-center py-3 sm:py-5">
      <div className="w-full max-w-[760px] min-h-[calc(100vh-120px)] bg-white shadow-sm border-x border-slate-200 flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-gray-900" />
            <h2 className="text-base font-normal uppercase text-gray-900 tracking-wide">
              Your Account
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAccount}
              disabled={loading}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Refresh Account Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              id="close-account-modal-btn"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading && !data ? (
            <div className="py-16 text-center text-gray-500 font-mono text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
              Loading your account profile...
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
              {error}
            </div>
          ) : (
            <>
              {/* Profile Card & Tier Banner */}
              <div className="bg-gray-50 border border-gray-200 p-4 sm:p-5 relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Photo and Identity */}
                  <div className="flex items-center gap-4">
                    <div className="relative group">
                      <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 border-2 border-white shadow-sm flex items-center justify-center">
                        {c?.photoUrl ? (
                          <img 
                            src={c.photoUrl} 
                            alt={c.tgName || 'User'} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-8 h-8 text-gray-400" />
                        )}
                      </div>
                      <label 
                        className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                        title="Upload Custom Photo"
                      >
                        <Camera className="w-5 h-5 text-white" />
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handlePhotoUpload}
                          disabled={uploadingPhoto}
                          className="hidden" 
                        />
                      </label>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900">{c?.tgName || 'Valued Member'}</h3>
                        {c?.tgUsername && (
                          <span className="text-xs text-gray-500 font-mono">@{c.tgUsername}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono text-gray-500">PRIME ID:</span>
                        <span className="text-xs font-mono font-bold text-gray-900 bg-white px-2 py-0.5 border border-gray-300">
                          {c?.primeMemberId || 'N/A'}
                        </span>
                        <button
                          onClick={handleCopyCode}
                          className="text-gray-400 hover:text-gray-700 p-1"
                          title="Copy PRIME Member ID"
                        >
                          {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Tier Badge */}
                  <div className="flex sm:flex-col items-start sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-200">
                    <div className="text-[10px] font-mono uppercase text-gray-500">Membership Tier</div>
                    <div className={`px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider rounded-md ${activeTierTheme.pill} mt-0.5`}>
                      ★ {activeTier}
                    </div>
                  </div>
                </div>

                {/* Rolling 30-day Tier Progress */}
                <div className="mt-5 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                    <span className="text-gray-600">
                      30-Day Item Spend: <strong className="text-gray-900">₱{Number(tier?.currentSpending || 0).toLocaleString()}</strong>
                    </span>
                    <span className="text-gray-500">
                      {tier?.nextTier ? (
                        <>₱{Number(tier?.amountNeededForNextTier || 0).toLocaleString()} more for <strong className="text-gray-900">{tier.nextTier}</strong></>
                      ) : (
                        <span className="text-emerald-700 font-bold">Top Tier Achieved</span>
                      )}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-600 transition-all duration-500"
                      style={{ width: `${tier?.progressPercent || 0}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-gray-500 mt-1.5">
                    <span>Cycle Ends: {new Date(tier?.cycleEndDate || Date.now()).toLocaleDateString()}</span>
                    <span className="font-semibold text-gray-700">{tier?.daysRemainingInCycle || 0} days left in cycle</span>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-gray-200 font-mono text-xs">
                {[
                  { key: 'overview', label: 'Overview' },
                  { key: 'points', label: 'Points & Credits' },
                  { key: 'referrals', label: `Referrals (${c?.referralCount || 0})` },
                  { key: 'orders', label: 'Recent Orders' }
                ].map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key as any)}
                    className={`flex-1 py-2.5 text-center font-medium transition-colors border-b-2 ${
                      activeTab === t.key
                        ? 'border-emerald-600 text-emerald-700 font-bold'
                        : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  {/* Financial & Order Stats */}
                  <div>
                    <h4 className="text-xs font-mono uppercase text-gray-500 mb-2.5">Lifetime Account Activity</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
                      <div className="p-3 bg-gray-50 border border-gray-200">
                        <div className="text-[10px] text-gray-500 uppercase">Total Orders</div>
                        <div className="text-base font-bold text-gray-900 mt-0.5">{c?.lifetimeOrderCount || 0}</div>
                        <div className="text-[10px] text-emerald-600 mt-0.5">{c?.lifetimeSuccessfulOrders || 0} Delivered</div>
                      </div>
                      <div className="p-3 bg-gray-50 border border-gray-200">
                        <div className="text-[10px] text-gray-500 uppercase">Item Spend</div>
                        <div className="text-base font-bold text-gray-900 mt-0.5">₱{Number(c?.lifetimeItemSpending || 0).toLocaleString()}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">Points Base</div>
                      </div>
                      <div className="p-3 bg-gray-50 border border-gray-200">
                        <div className="text-[10px] text-gray-500 uppercase">Total Spend</div>
                        <div className="text-base font-bold text-gray-900 mt-0.5">₱{Number(c?.lifetimeTotalSpending || 0).toLocaleString()}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">All Orders</div>
                      </div>
                      <div className="p-3 bg-gray-50 border border-gray-200">
                        <div className="text-[10px] text-gray-500 uppercase">Discounts Saved</div>
                        <div className="text-base font-bold text-emerald-700 mt-0.5">₱{Number(c?.lifetimeDiscounts || 0).toLocaleString()}</div>
                        <div className="text-[10px] text-emerald-600 mt-0.5">Promos & Credits</div>
                      </div>
                    </div>
                  </div>

                  {/* Account Metadata Details */}
                  <div className="border border-gray-200 p-4 font-mono text-xs space-y-2">
                    <h4 className="text-[11px] uppercase font-bold text-gray-700 border-b border-gray-100 pb-1.5 mb-2">
                      Account Registration & History
                    </h4>
                    <div className="flex justify-between text-gray-600">
                      <span>Enrollment Date:</span>
                      <span className="text-gray-900">{c?.enrollmentDate ? new Date(c.enrollmentDate).toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>First Completed Order:</span>
                      <span className="text-gray-900">{c?.firstOrderDate ? new Date(c.firstOrderDate).toLocaleDateString() : 'None yet'}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Latest Order Placed:</span>
                      <span className="text-gray-900">{c?.latestOrderDate ? new Date(c.latestOrderDate).toLocaleDateString() : 'None'}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Linked Phone:</span>
                      <span className="text-gray-900">{c?.phone || 'Not linked'}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Referred By:</span>
                      <span className="text-gray-900">
                        {c?.referredBy !== 'N/A' ? (
                          <span className="text-emerald-700 font-semibold">{c.referredBy} ({c.referredByMemberId})</span>
                        ) : (
                          'N/A (Direct Member)'
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: POINTS & STORE CREDITS */}
              {activeTab === 'points' && (
                <div className="space-y-6">
                  {/* Point Balances Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
                    {/* Store Credits */}
                    <div className="p-4 bg-emerald-50 border border-emerald-200">
                      <div className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5" />
                        Store Credits (Good as Cash)
                      </div>
                      <div className="text-2xl font-bold text-emerald-900 mt-1">
                        ₱{Number(c?.storeCredits || 0).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-emerald-600 mt-1">
                        Applied during checkout
                      </div>
                    </div>

                    {/* Purchasing Points */}
                    <div className="p-4 bg-gray-50 border border-gray-200">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        <ShoppingBag className="w-3.5 h-3.5 text-gray-400" />
                        Purchasing Points
                      </div>
                      <div className="text-2xl font-bold text-gray-900 mt-1">
                        {c?.purchasingPoints || 0}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        Earn 5 pts per ₱100 item spend
                      </div>
                    </div>

                    {/* Referral Points */}
                    <div className="p-4 bg-gray-50 border border-gray-200">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        Referral Points
                      </div>
                      <div className="text-2xl font-bold text-gray-900 mt-1">
                        {c?.referralPoints || 0}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        {c?.pendingReferralPoints ? (
                          <span className="text-amber-600 font-semibold">{c.pendingReferralPoints} pts maturing soon</span>
                        ) : (
                          '50 pts per completed referral'
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Convert Points to Store Credits (1:1) */}
                  <div className="border border-gray-200 p-4 bg-white">
                    <h4 className="text-xs font-mono uppercase font-bold text-gray-900 mb-1 flex items-center gap-1.5">
                      <ArrowRight className="w-4 h-4 text-emerald-600" />
                      Convert Points to Store Credits (1:1 Ratio)
                    </h4>
                    <p className="text-[11px] font-mono text-gray-500 mb-3">
                      1 Point equals ₱1 in Store Credits. Credits never expire and apply directly to your orders.
                    </p>

                    <form onSubmit={handleConvertPoints} className="space-y-3 font-mono text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-gray-500 uppercase text-[10px] mb-1">Convert From</label>
                          <select
                            value={convertType}
                            onChange={(e: any) => setConvertType(e.target.value)}
                            className="w-full p-2 border border-gray-300 bg-white text-xs outline-none focus:border-emerald-600"
                          >
                            <option value="purchasing">Purchasing Points (Avail: {c?.purchasingPoints || 0})</option>
                            <option value="referral">Referral Points (Avail: {c?.referralPoints || 0})</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-500 uppercase text-[10px] mb-1">Points Amount</label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min={1}
                              max={convertType === 'purchasing' ? c?.purchasingPoints || 0 : c?.referralPoints || 0}
                              value={convertAmount}
                              onChange={(e) => setConvertAmount(e.target.value ? Number(e.target.value) : '')}
                              placeholder="e.g. 50"
                              className="w-full p-2 border border-gray-300 text-xs outline-none focus:border-emerald-600"
                            />
                            <button
                              type="button"
                              onClick={() => setConvertAmount(convertType === 'purchasing' ? c?.purchasingPoints || 0 : c?.referralPoints || 0)}
                              className="px-2.5 py-2 bg-gray-100 border border-gray-300 text-[10px] hover:bg-gray-200"
                            >
                              MAX
                            </button>
                          </div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={converting || !convertAmount}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
                      >
                        {converting ? 'Converting...' : 'Convert to Store Credits'}
                      </button>
                    </form>
                  </div>

                  {/* Peer to Peer Transfer */}
                  <div className="border border-gray-200 p-4 bg-white">
                    <h4 className="text-xs font-mono uppercase font-bold text-gray-900 mb-1 flex items-center gap-1.5">
                      <Send className="w-4 h-4 text-slate-700" />
                      Transfer Store Credits to Member
                    </h4>
                    <p className="text-[11px] font-mono text-gray-500 mb-3">
                      Transfer your available Store Credits to another customer using their PRIME Member ID.
                    </p>

                    {transferMsg && (
                      <div className={`p-2.5 mb-3 text-xs font-mono border ${
                        transferMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
                      }`}>
                        {transferMsg.text}
                      </div>
                    )}

                    <form onSubmit={handleTransferCredits} className="space-y-3 font-mono text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-gray-500 uppercase text-[10px] mb-1">Recipient PRIME Member ID</label>
                          <input
                            type="text"
                            required
                            value={transferRecipient}
                            onChange={(e) => setTransferRecipient(e.target.value.toUpperCase())}
                            placeholder="e.g. PRIME-ABCD12"
                            className="w-full p-2 border border-gray-300 text-xs uppercase tracking-wider outline-none focus:border-emerald-600"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-500 uppercase text-[10px] mb-1">Amount (₱)</label>
                          <input
                            type="number"
                            required
                            min={1}
                            max={c?.storeCredits || 0}
                            value={transferAmount}
                            onChange={(e) => setTransferAmount(e.target.value ? Number(e.target.value) : '')}
                            placeholder="e.g. 100"
                            className="w-full p-2 border border-gray-300 text-xs outline-none focus:border-emerald-600"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={transferring || !transferRecipient || !transferAmount || Number(c?.storeCredits || 0) <= 0}
                        className="w-full py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
                      >
                        {transferring ? 'Processing Transfer...' : 'Send Store Credits'}
                      </button>
                    </form>
                  </div>

                  {/* Transaction Timeline */}
                  <div>
                    <h4 className="text-xs font-mono uppercase text-gray-500 mb-2">Points & Credits Activity Timeline</h4>
                    {(!data?.pointTransactions || data.pointTransactions.length === 0) ? (
                      <div className="p-6 border border-dashed border-gray-200 text-center text-xs font-mono text-gray-400">
                        No transactions recorded yet. Earn points with every completed order!
                      </div>
                    ) : (
                      <div className="border border-gray-200 divide-y divide-gray-100 font-mono text-xs max-h-56 overflow-y-auto">
                        {data.pointTransactions.map((tx: any) => (
                          <div key={tx.id} className="p-3 flex items-center justify-between hover:bg-gray-50">
                            <div>
                              <div className="font-semibold text-gray-900">{tx.description}</div>
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {new Date(tx.createdAt).toLocaleString()}
                              </div>
                            </div>
                            <div className={`font-bold ${tx.amount > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                              {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: REFERRALS */}
              {activeTab === 'referrals' && (
                <div className="space-y-5">
                  {/* Share Card */}
                  <div className="border border-gray-200 p-4 bg-gray-50 font-mono text-xs space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 uppercase">Your Permanent Referral Code</h4>
                      <p className="text-gray-500 text-[11px] mt-0.5">
                        Share your PRIME Member ID with friends. When they place an order that gets delivered, you earn <strong>50 Referral Points</strong>!
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-3 bg-white border border-gray-300 font-mono font-bold text-sm tracking-wider text-gray-900 text-center">
                        {c?.primeMemberId || 'N/A'}
                      </div>
                      <button
                        onClick={handleCopyCode}
                        className="px-4 py-3 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-1.5"
                      >
                        {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        {copiedCode ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        onClick={handleShareReferral}
                        className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5"
                      >
                        <Share2 className="w-4 h-4" />
                        Share
                      </button>
                    </div>
                  </div>

                  {/* List of Referred Friends */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-mono uppercase text-gray-500">
                        Friends Referred ({c?.referrals?.length || 0})
                      </h4>
                      <span className="text-[11px] font-mono text-gray-400">50 pts credited 30m post-delivery</span>
                    </div>

                    {(!c?.referrals || c.referrals.length === 0) ? (
                      <div className="p-8 border border-dashed border-gray-200 text-center text-xs font-mono text-gray-400">
                        You haven't referred any friends yet. Share your code above to start earning!
                      </div>
                    ) : (
                      <div className="border border-gray-200 divide-y divide-gray-100 font-mono text-xs">
                        {c.referrals.map((ref: any) => (
                          <div key={ref.id} className="p-3 flex items-center justify-between hover:bg-gray-50">
                            <div>
                              <div className="font-semibold text-gray-900">{ref.name}</div>
                              <div className="text-[10px] text-gray-400">Joined: {new Date(ref.enrolledAt).toLocaleDateString()}</div>
                            </div>
                            <div className="text-right">
                              <span className={`px-2 py-0.5 text-[10px] font-bold border ${
                                ref.hasDeliveredOrder
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-gray-100 text-gray-500 border-gray-200'
                              }`}>
                                {ref.rewardStatus}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: RECENT ORDERS */}
              {activeTab === 'orders' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-mono uppercase text-gray-500">Recent 5 Orders</h4>
                    <span className="text-[11px] font-mono text-gray-400">Click to view order details</span>
                  </div>

                  {(!data?.recentOrders || data.recentOrders.length === 0) ? (
                    <div className="p-8 border border-dashed border-gray-200 text-center text-xs font-mono text-gray-400">
                      No orders found under this account.
                    </div>
                  ) : (
                    <div className="border border-gray-200 divide-y divide-gray-100 font-mono text-xs">
                      {data.recentOrders.map((ord: any) => (
                        <div
                          key={ord.id}
                          onClick={() => onSelectOrder && onSelectOrder(ord)}
                          className="p-3.5 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900">#{ord.orderNumber || ord.id}</span>
                              <span className={`px-2 py-0.5 text-[10px] border ${
                                ord.status === 'Delivered' || ord.status === 'Completed'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}>
                                {ord.status}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-400 mt-1">
                              {new Date(ord.createdAt).toLocaleDateString()} • {ord.items?.length || 0} items
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="font-bold text-gray-900">₱{Number(ord.totalAmount || 0).toLocaleString()}</div>
                              {ord.promoDiscount > 0 && (
                                <div className="text-[10px] text-emerald-600">-₱{Number(ord.promoDiscount).toLocaleString()} Promo</div>
                              )}
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between font-mono text-xs">
          <span className="text-gray-500">PRIME Loyalty & Points Program</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-mono uppercase tracking-wider transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
