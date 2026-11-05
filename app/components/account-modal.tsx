'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  User, 
  X, 
  Copy, 
  Check, 
  Award, 
  Sparkles, 
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
  TrendingUp, 
  ShieldCheck, 
  Info,
  ExternalLink,
  CircleHelp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { callServerless } from '@/lib/telegram-serverless-client';
import './account-modal.css';

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
  const [conversionType, setConversionType] = useState<'purchasing' | 'referral' | null>(null);
  const [conversionAmount, setConversionAmount] = useState('');
  const [conversionBusy, setConversionBusy] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [conversionSuccess, setConversionSuccess] = useState<string | null>(null);
  const [conversionOperationId, setConversionOperationId] = useState('');
  const [pointsHelp, setPointsHelp] = useState<'credits' | 'purchasing' | 'referral' | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferMemberId, setTransferMemberId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [telegramPhoto, setTelegramPhoto] = useState('');
  const [photoChecked, setPhotoChecked] = useState(false);
  const photoKeyRef = useRef('');
  const c = data?.customer;
  const tier = c?.tierInfo;

  // Referrals view modal
  const fetchAccount = async () => {
    try {
      setLoading(true);
      setError(null);

      if (import.meta.env.VITE_UI_PREVIEW === '1') {
        setData({
          customer: {
            tgName: 'nexus', tgUsername: 'nexus_member', primeMemberId: 'A25A23A8E95F', tierInfo: { tier: 'Titanium', currentSpending: 27732, progressPercent: 100, cycleEndDate: '2026-11-24', daysRemainingInCycle: 21 },
            purchasingPoints: 1340, referralPoints: 0, pendingReferralPoints: 0, storeCredits: 49.99,
            referrals: [], referralCount: 0, lifetimeOrderCount: 26, lifetimeSuccessfulOrders: 13,
            lifetimeItemSpending: 27732, lifetimeTotalSpending: 30194.29, lifetimeDiscounts: 134.64,
            enrollmentDate: '2026-10-23', firstOrderDate: '2026-10-24', latestOrderDate: '2026-10-31', referredBy: 'N/A',
          },
          pointTransactions: [
            { id: 'preview-1', description: 'Purchasing points earned for completed order #301102610101', createdAt: new Date().toISOString(), amount: 25 },
            { id: 'preview-2', description: 'Referral points credited after delivery confirmation', createdAt: new Date(Date.now() - 86400000).toISOString(), amount: 50 },
            { id: 'preview-3', description: 'Store Credits applied to order #281102610115', createdAt: new Date(Date.now() - 172800000).toISOString(), amount: -20 },
          ],
          recentOrders: [
            { id: 'preview-order-1', orderNumber: '311026235319', status: 'Expired', createdAt: '2026-10-31', totalAmount: 1867, items: [{}] },
            { id: 'preview-order-2', orderNumber: '311026102757', status: 'Ready', createdAt: '2026-10-31', totalAmount: 546, items: [{}] },
            { id: 'preview-order-3', orderNumber: '311026102710', status: 'Ready', createdAt: '2026-10-31', totalAmount: 859, items: [{}] },
            { id: 'preview-order-4', orderNumber: '311026102610', status: 'Ready', createdAt: '2026-10-31', totalAmount: 1937, items: [{}] },
            { id: 'preview-order-5', orderNumber: '301026180105', status: 'Completed', createdAt: '2026-10-30', totalAmount: 500, items: [{}] },
          ], allOrders: [],
        });
        return;
      }

      const resData = await callServerless<any>('getMyAccount');
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

  useEffect(() => {
    if (!isOpen || import.meta.env.VITE_UI_PREVIEW === '1') return;
    let active = true;
    let inFlight = false;
    const refreshPhoto = async () => {
      if (!active || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const result = await callServerless<any>('getMyTelegramPhoto', { knownPhotoKey: photoKeyRef.current }, 20_000);
        if (!active || result?.unchanged) return;
        photoKeyRef.current = String(result?.photoKey || '');
        setTelegramPhoto(String(result?.photoUrl || ''));
        setPhotoChecked(true);
      } catch {
        // The account remains usable; another refresh runs on focus or the next interval.
      } finally { inFlight = false; }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshPhoto(); };
    const webApp = (window as any).Telegram?.WebApp;
    void refreshPhoto();
    const timer = window.setInterval(() => void refreshPhoto(), 30_000);
    document.addEventListener('visibilitychange', onVisible);
    webApp?.onEvent?.('activated', onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); webApp?.offEvent?.('activated', onVisible); };
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

  const availableConversionPoints = conversionType === 'referral'
    ? Number(c?.referralPoints || 0)
    : Number(c?.purchasingPoints || 0);

  const submitPointsConversion = async () => {
    const amount = Math.floor(Number(conversionAmount));
    if (!conversionType || !Number.isSafeInteger(amount) || amount < 1 || amount > availableConversionPoints) return;
    setConversionBusy(true);
    setConversionError(null);
    setConversionSuccess(null);
    try {
      if (import.meta.env.VITE_UI_PREVIEW === '1') {
        setConversionError('Visual preview only. No points or Store Credits were changed.');
        return;
      }

      const operationId = conversionOperationId || Array.from(
        window.crypto.getRandomValues(new Uint8Array(16)),
        byte => byte.toString(16).padStart(2, '0'),
      ).join('');
      setConversionOperationId(operationId);
      const result = await callServerless<any>('convertPointsToCredits', {
        pointsType: conversionType,
        amount,
        operationId,
      }, 30_000);
      if (!result?.success) throw new Error(result?.error || 'Conversion could not be completed.');
      setData((current: any) => ({
        ...current,
        customer: {
          ...current?.customer,
          purchasingPoints: conversionType === 'purchasing' ? Number(result.newPointsBalance) : current?.customer?.purchasingPoints,
          referralPoints: conversionType === 'referral' ? Number(result.newPointsBalance) : current?.customer?.referralPoints,
          storeCredits: Number(result.newCreditsBalance),
        },
        pointTransactions: [
          result.transaction,
          ...(current?.pointTransactions || []).filter((transaction: any) => transaction.id !== result.transaction?.id),
        ].filter(Boolean),
      }));
      setConversionSuccess(`${amount.toLocaleString()} ${conversionType} points converted to ₱${amount.toLocaleString()} Store Credits.`);
      setConversionAmount('');
      setConversionOperationId('');
    } catch (err: any) {
      setConversionError(err?.message || 'Conversion could not be completed.');
    } finally {
      setConversionBusy(false);
    }
  };

  const submitCreditTransfer = async () => {
    const amount = Number(transferAmount);
    const recipientMemberId = transferMemberId.trim().toUpperCase();
    if (!Number.isFinite(amount) || Math.round(amount * 100) !== amount * 100 || amount < 0.01) {
      setTransferError('Enter an amount in pesos and centavos.');
      return;
    }
    if (amount > Number(c?.transferableCredits ?? c?.storeCredits ?? 0)) {
      setTransferError('Only earned or converted credits can be transferred. Received credits cannot be transferred again.');
      return;
    }
    if (!/^[A-Z0-9]{6,24}$/.test(recipientMemberId) || recipientMemberId === String(c?.primeMemberId || '').toUpperCase()) {
      setTransferError('Enter another member’s valid PRIME Member ID.');
      return;
    }
    setTransferBusy(true);
    setTransferError('');
    setTransferSuccess('');
    try {
      if (import.meta.env.VITE_UI_PREVIEW === '1') {
        setTransferSuccess('Preview only. No credits were transferred.');
        return;
      }
      const operationId = Array.from(window.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      const result = await callServerless<any>('transferStoreCredits', { recipientMemberId, amount, operationId }, 30_000);
      if (!result?.success) throw new Error(result?.error || 'Transfer was not confirmed.');
      setTransferSuccess(`₱${amount.toFixed(2)} sent to ${recipientMemberId}.`);
      await fetchAccount();
    } catch (error: any) {
      setTransferError(error?.message || 'Transfer could not be completed.');
    } finally {
      setTransferBusy(false);
    }
  };

  if (!isOpen) return null;

  const activeTier = tier?.tier || 'Silver';
  const tierPointsRate: Record<string, string> = { Silver: '5.0%', Bronze: '5.5%', Gold: '6.0%', Platinum: '6.5%', Titanium: '7.0%' };

  return (
    <div id="account-modal-overlay" className="prime-account w-full bg-gray-50 flex justify-center py-[4.8px]">
      <div className="w-full max-w-[430px] min-h-[calc(100vh-120px)] bg-white shadow-sm border-x border-slate-200 flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="prime-account__heading prime-page-heading px-3.5 py-2.5 border-b border-gray-200 flex items-center justify-between bg-white sticky top-0 z-10">
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
        <div className="prime-account__body flex-1 overflow-y-auto p-2.5 space-y-3">
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
              <div className="prime-account__profile bg-gray-50 border border-gray-200 rounded-xl p-3 relative overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  {/* Photo and Identity */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="prime-account__avatar relative group">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 border-2 border-white shadow-sm flex items-center justify-center">
                        {(photoChecked ? telegramPhoto : c?.telegramPhotoUrl || c?.photoUrl) ? (
                          <img 
                            src={photoChecked ? telegramPhoto : c?.telegramPhotoUrl || c?.photoUrl}
                            alt={c.tgName || 'User'} 
                            className="w-full h-full object-cover"
                            onError={() => { setTelegramPhoto(''); setPhotoChecked(true); }}
                          />
                        ) : (
                          <User className="w-8 h-8 text-gray-400" />
                        )}
                      </div>
                    </div>

                    <div className="prime-account__identity min-w-0">
                      <h3 className="truncate">{c?.tgName || 'Valued Member'}</h3>
                      {c?.tgUsername && <div className="prime-account__username truncate">@{c.tgUsername}</div>}
                      <div className="prime-account__mid flex items-center gap-1 mt-1">
                        <span className="truncate">{c?.primeMemberId || c?.visitorBadgeNo || 'VISITOR'}</span>
                        {c?.primeMemberId && (
                          <button
                            onClick={handleCopyCode}
                            className="p-0.5 text-white/75 hover:text-white"
                            title="Copy PRIME Member ID"
                            aria-label="Copy PRIME Member ID"
                          >
                            {copiedCode ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tier Badge */}
                  <div className="prime-account__tier flex shrink-0 flex-col items-end justify-center border-l border-gray-200 pl-2">
                    <div className="prime-account__tier-label uppercase">Membership Tier</div>
                    <div className="prime-account__tier-value mt-0.5 uppercase">{activeTier}</div>
                    <div className="prime-account__tier-rate mt-1">Cashback Rate: {tierPointsRate[activeTier] || '5.0%'}</div>
                  </div>
                </div>

              {!c?.primeMemberId && (
                <div className="mt-4 bg-amber-50 border border-amber-200 p-3 sm:p-4 text-xs font-mono text-amber-900 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold text-amber-950 uppercase text-[11px] mb-0.5">Referral Eligibility & PRIME Member ID Notice</strong>
                    To unlock your permanent <b>PRIME Member ID</b> (your permanent system identifier and referral code) and become eligible for referral bonuses, please complete your first successful order! Once delivered/completed, your account will automatically be migrated to Customers.
                  </div>
                </div>
              )}

                {/* Rolling 30-day Tier Progress */}
                <div className="prime-account__progress mt-3 pt-2 border-t border-gray-200">
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
              <div className="prime-account__tabs flex border-b border-gray-200 font-mono text-xs">
                {[
                  { key: 'overview', label: 'Overview', icon: User },
                  { key: 'points', label: 'Points & Credits', icon: CreditCard },
                  { key: 'referrals', label: `Referrals (${c?.referralCount || 0})`, icon: Users },
                  { key: 'orders', label: 'Recent Orders', icon: ShoppingBag }
                ].map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key as any)}
                    className={`prime-account__tab flex-1 py-2.5 text-center font-medium transition-colors border-b-2 ${
                      activeTab === t.key
                        ? 'border-emerald-600 text-emerald-700 font-bold'
                        : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <t.icon aria-hidden="true" />
                    {t.label}
                  </button>
                ))}
              </div>

              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="prime-account__overview space-y-3">
                  {/* Financial & Order Stats */}
                  <div className="prime-account__section">
                    <h4 className="text-xs font-mono uppercase text-gray-500 mb-2.5">Lifetime Account Activity</h4>
                    <div className="prime-account__stat-grid grid grid-cols-3 gap-1.5 font-mono">
                      <div className="prime-account__stat">
                        <div className="text-[10px] text-gray-500 uppercase">Total Orders</div>
                        <div className="text-base font-bold text-gray-900 mt-0.5">{c?.lifetimeOrderCount || 0}</div>
                        <div className="text-[10px] text-emerald-600 mt-0.5">{c?.lifetimeSuccessfulOrders || 0} Delivered</div>
                      </div>
                      <div className="prime-account__stat">
                        <div className="text-[10px] text-gray-500 uppercase">Total Spending</div>
                        <div className="text-base font-bold text-gray-900 mt-0.5">₱{Number(c?.lifetimeTotalSpending || 0).toLocaleString()}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">Completed Orders Only</div>
                      </div>
                      <div className="prime-account__stat">
                        <div className="text-[10px] text-gray-500 uppercase">Total Discounts</div>
                        <div className="text-base font-bold text-gray-900 mt-0.5">₱{Number(c?.lifetimeDiscounts || 0).toLocaleString()}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">Completed Orders Only</div>
                      </div>
                    </div>
                  </div>

                  {/* Account Metadata Details */}
                  <div className="prime-account__section prime-account__history border border-gray-200 rounded-lg p-3 font-mono text-xs space-y-2">
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
                        {c?.referredBy && c.referredBy !== 'N/A' ? (
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
                <div className="prime-account__points space-y-4">
                  {/* Point Balances Cards */}
                  <div className="prime-account__balance-grid grid grid-cols-3 items-stretch gap-2 font-mono">
                    {/* Store Credits */}
                    <div className="prime-account__balance-card">
                      <button type="button" className="prime-account__help" title="About Store Credits" aria-label="About Store Credits" onClick={() => setPointsHelp('credits')}><CircleHelp /></button>
                      <div className="prime-account__balance-label">
                        <CreditCard />
                        <span>Store<br />Credits</span>
                      </div>
                      <div className="prime-account__balance-value">
                        ₱{Number(c?.storeCredits || 0).toLocaleString()}
                      </div>
                      <button type="button" className="prime-account__balance-action" onClick={() => setTransferOpen(true)}>Transfer</button>
                    </div>

                    {/* Purchasing Points */}
                    <div className="prime-account__balance-card">
                      <button type="button" className="prime-account__help" title="About Purchasing Points" aria-label="About Purchasing Points" onClick={() => setPointsHelp('purchasing')}><CircleHelp /></button>
                      <div className="prime-account__balance-label">
                        <ShoppingBag />
                        <span>Purchasing<br />Points</span>
                      </div>
                      <div className="prime-account__balance-value">
                        {c?.purchasingPoints || 0}
                      </div>
                      <button type="button" disabled={Number(c?.purchasingPoints || 0) <= 0} onClick={() => { setConversionType('purchasing'); setConversionAmount(''); setConversionError(null); setConversionSuccess(null); setConversionOperationId(''); }} className="prime-account__balance-action">Convert</button>
                    </div>

                    {/* Referral Points */}
                    <div className="prime-account__balance-card">
                      <button type="button" className="prime-account__help" title="About Referral Points" aria-label="About Referral Points" onClick={() => setPointsHelp('referral')}><CircleHelp /></button>
                      <div className="prime-account__balance-label">
                        <Users />
                        <span>Referral<br />Points</span>
                      </div>
                      <div className="prime-account__balance-value">
                        {c?.referralPoints || 0}
                      </div>
                      <button type="button" disabled={Number(c?.referralPoints || 0) <= 0} onClick={() => { setConversionType('referral'); setConversionAmount(''); setConversionError(null); setConversionSuccess(null); setConversionOperationId(''); }} className="prime-account__balance-action">Convert</button>
                    </div>
                  </div>

                  {/* Transaction Timeline */}
                  <div className="prime-account__section prime-account__timeline">
                    <h4 className="text-xs font-mono uppercase text-gray-500 mb-2">Points & Credits Activity Timeline</h4>
                    {(!data?.pointTransactions || data.pointTransactions.length === 0) ? (
                      <div className="p-6 border border-dashed border-gray-200 text-center text-xs font-mono text-gray-400">
                        No point or Store Credit activity recorded yet.
                      </div>
                    ) : (
                      <div className="border border-gray-200 divide-y divide-gray-100 font-mono text-xs max-h-56 overflow-y-auto">
                        {data.pointTransactions.map((tx: any) => (
                          <div key={tx.id} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-gray-50">
                            <div className="min-w-0">
                              <div className="line-clamp-2 break-words text-[11px] font-semibold leading-snug text-gray-900">{tx.description}</div>
                              <div className="mt-1 text-[9px] text-gray-400">
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
                <div className="prime-account__referrals space-y-3">
                  {Number(c?.lifetimeSuccessfulOrders || 0) < 1 && <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Referral eligibility: complete your first successful order before others can use your PRIME Member ID as a referral code. They will see this reason if they try it early.</p>}
                  {/* Share Card */}
                  <div className="prime-account__section prime-account__share border border-gray-200 rounded-lg p-3 bg-gray-50 font-mono text-xs space-y-2">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 uppercase">Your Permanent Referral Code</h4>
                      <p className="text-gray-500 text-[11px] mt-0.5">
                        {Number(c?.lifetimeSuccessfulOrders || 0) < 1 ? 'Your referral code becomes valid after your first completed order.' : 'Share your PRIME Member ID with friends. After their order is completed, you can earn 50 Referral Points.'}
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
                  <div className="prime-account__section prime-account__friends">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-mono uppercase text-gray-500">
                        Friends Referred ({c?.referrals?.length || 0})
                      </h4>
                      <span className="text-[11px] font-mono text-gray-400">50 pts credited 30m post-delivery</span>
                    </div>

                    {(!c?.referrals || c.referrals.length === 0) ? (
                      <div className="p-8 border border-dashed border-gray-200 text-center text-xs font-mono text-gray-400">
                        <div>
                          <Users className="mx-auto mb-2 h-12 w-12 text-emerald-700" aria-hidden="true" />
                          <strong className="block text-sm text-slate-900">You haven’t referred any friends yet.</strong>
                          <span className="mt-1 block text-xs text-slate-600">Share your code above to start earning!</span>
                        </div>
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
                <div className="prime-account__section prime-account__orders space-y-3">
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
                                  : ord.status === 'Expired'
                                    ? 'bg-slate-100 text-slate-700 border-slate-200'
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
        <div className="prime-account__footer p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between font-mono text-xs">
          <Award aria-hidden="true" className="prime-account__footer-icon" />
          <span className="text-gray-500"><strong className="block">PRIME Loyalty &amp; Points Program</strong><small className="block">Earn points, unlock higher rewards, and convert to store credits!</small></span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-mono uppercase tracking-wider transition-colors"
          >
            Done <ChevronRight className="inline h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {pointsHelp && <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPointsHelp(null)}><section role="dialog" aria-modal="true" aria-label="Points and Credits information" className="w-full max-w-[398px] rounded-xl bg-white p-4 text-slate-900 shadow-xl" onClick={event => event.stopPropagation()}><h3 className="font-roboto-condensed-semibold text-base">{pointsHelp === 'credits' ? 'Store Credits' : pointsHelp === 'purchasing' ? 'Purchasing Points' : 'Referral Points'}</h3><p className="mt-2 text-sm">{pointsHelp === 'credits' ? 'Store Credits can be used at checkout. Credits received from another member cannot be transferred again.' : pointsHelp === 'purchasing' ? 'Purchasing Points come from eligible completed orders and can be converted to Store Credits.' : 'Referral Points are awarded after a referred member completes an order. You need your own completed order before your referral code is eligible.'}</p><button type="button" className="mt-4 rounded border px-4 py-2 text-sm" onClick={() => setPointsHelp(null)}>Close</button></section></motion.div>}
        {transferOpen && <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !transferBusy && setTransferOpen(false)}><section role="dialog" aria-modal="true" aria-label="Transfer Store Credits" className="w-full max-w-[398px] rounded-xl bg-white p-4 text-slate-900 shadow-xl" onClick={event => event.stopPropagation()}><h3 className="font-roboto-condensed-semibold text-base">Transfer Store Credits</h3><p className="mt-1 text-xs">Send eligible credits using the recipient’s PRIME Member ID. Received credits cannot be transferred again.</p><label className="mt-3 block text-xs">Recipient PRIME Member ID<input className="mt-1 min-h-10 w-full rounded border px-3 font-mono" value={transferMemberId} onChange={event => setTransferMemberId(event.target.value.toUpperCase())} autoCapitalize="characters" /></label><label className="mt-3 block text-xs">Amount (₱)<input className="mt-1 min-h-10 w-full rounded border px-3 font-mono" type="number" inputMode="decimal" min="0.01" step="0.01" value={transferAmount} onChange={event => setTransferAmount(event.target.value)} /></label>{transferError && <p role="alert" className="mt-2 text-xs text-rose-700">{transferError}</p>}{transferSuccess && <p role="status" className="mt-2 text-xs text-emerald-700">{transferSuccess}</p>}<div className="mt-4 flex gap-2"><button type="button" className="min-h-10 flex-1 rounded border" onClick={() => setTransferOpen(false)}>Close</button><button type="button" disabled={transferBusy || !transferMemberId.trim() || !(Number(transferAmount) > 0)} className="min-h-10 flex-1 rounded bg-emerald-700 px-2 text-white disabled:opacity-50" onClick={() => void submitCreditTransfer()}>{transferBusy ? 'Sending…' : 'Transfer'}</button></div></section></motion.div>}
        {conversionType && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 py-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !conversionBusy && setConversionType(null)}>
            <motion.section role="dialog" aria-modal="true" aria-labelledby="points-conversion-title" className="w-full max-w-[398px] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} onClick={event => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="points-conversion-title" className="text-base font-semibold uppercase tracking-wide text-slate-900">Convert Points</h3>
                  <p className="mt-1 text-xs text-slate-500">{conversionType === 'purchasing' ? 'Purchasing' : 'Referral'} points become Store Credits at 1 point = ₱1.</p>
                </div>
                <button type="button" aria-label="Close conversion" disabled={conversionBusy} onClick={() => setConversionType(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between text-xs text-slate-600"><span>Available points</span><strong className="font-mono text-slate-900">{availableConversionPoints.toLocaleString()}</strong></div>
                <label htmlFor="points-conversion-amount" className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-slate-600">Points to convert</label>
                <input id="points-conversion-amount" type="number" inputMode="numeric" min="1" max={availableConversionPoints} step="1" value={conversionAmount} onChange={event => setConversionAmount(event.target.value)} disabled={conversionBusy || Boolean(conversionSuccess)} className="mt-1.5 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-base text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="Enter whole points" />
                <div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-500">You will receive</span><strong className="font-mono text-emerald-800">₱{(Math.min(availableConversionPoints, Math.floor(Number(conversionAmount) || 0))).toLocaleString()}</strong></div>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Only available points can be converted. Pending referral points are not included.</p>
              {import.meta.env.VITE_UI_PREVIEW === '1' && <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">Visual preview only — no balance changes are enabled.</p>}
              {conversionError && <p role="alert" className="mt-3 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{conversionError}</p>}
              {conversionSuccess && <p role="status" className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">{conversionSuccess}</p>}
              <div className="mt-4 flex gap-2">
                <button type="button" disabled={conversionBusy} onClick={() => setConversionType(null)} className="min-h-10 flex-1 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold uppercase text-slate-700 hover:bg-slate-50">{conversionSuccess ? 'Done' : 'Cancel'}</button>
                {!conversionSuccess && <button type="button" disabled={conversionBusy || !Number.isInteger(Number(conversionAmount)) || Number(conversionAmount) < 1 || Number(conversionAmount) > availableConversionPoints} onClick={submitPointsConversion} className="min-h-10 flex-1 rounded-md bg-emerald-700 px-3 text-xs font-bold uppercase text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300">{conversionBusy ? 'Converting…' : 'Confirm conversion'}</button>}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
