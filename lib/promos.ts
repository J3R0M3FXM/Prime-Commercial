export type PromoVoucherType = 
  | 'shop_voucher' 
  | 'shipping_voucher' 
  | 'new_buyer_voucher' 
  | 'category_voucher' 
  | 'cashback_voucher';

export type PromoDiscountType = 
  | 'fixed' 
  | 'percentage' 
  | 'free_shipping' 
  | 'shipping_discount' 
  | 'coins_cashback';

export type PromoCustomerEligibility = 
  | 'all' 
  | 'new_customer' 
  | 'min_orders' 
  | 'tier_restricted';

export interface PromoConfig {
  id: string;
  code: string;
  title: string;
  description?: string;
  voucherType: PromoVoucherType;
  discountType: PromoDiscountType;
  discountValue: number; // e.g., 50 for ₱50 or 15 for 15%
  maxDiscountAmount?: number; // Cap for percentage discount or coins cashback (e.g. ₱200 max)
  cappedShippingDiscount?: number; // Cap for shipping discount subsidy (e.g. up to ₱60 OFF)
  cashbackPercentage?: number; // e.g. 10%
  minSpend?: number; // Minimum items subtotal required
  minItemQuantity?: number; // Minimum items count in cart
  
  // Target Audience & Customer Eligibility
  customerEligibility?: PromoCustomerEligibility;
  minPreviousOrders?: number; // Minimum delivered/completed orders required
  eligibleTiers?: string[]; // e.g., ['SILVER', 'BRONZE', 'GOLD', 'PLATINUM', 'TITANIUM']
  
  // Channel & Payment Restrictions (Standard PH Marketplaces)
  allowedPaymentMethods?: string[]; // ['all'] or ['gcash', 'maya', 'bank_transfer', 'upon_delivery']
  allowedCourierIds?: string[]; // ['all'] or specific courier IDs
  
  // Philippine Schedule & Flash Windows
  activeDaysOfWeek?: number[]; // [0,1,2,3,4,5,6] (0=Sun, 6=Sat)
  isPaydayOnly?: boolean; // Active only on 15th & end of month
  flashHourStart?: number; // 0 - 23 (Philippine Time)
  flashHourEnd?: number; // 0 - 23 (Philippine Time)

  // Usage Quotas & Limits
  totalUsageLimit?: number; // Max total redemptions, null or 0 for unlimited
  usageCount: number; // Current total redemptions
  usageLimitPerCustomer?: number; // Default 1
  isActive: boolean; // Master toggle
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PromoValidationResult {
  valid: boolean;
  error?: string;
  discountAmount?: number;
  discountType?: PromoDiscountType;
  voucherType?: PromoVoucherType;
  code?: string;
  promoId?: string;
  title?: string;
  description?: string;
  isFreeShipping?: boolean;
  shippingSubsidy?: number;
  cashbackPoints?: number;
  maxDiscountAmount?: number | null;
  minSpend?: number;
}

/**
 * Generates an authentic Philippine e-commerce style promo code
 * (e.g., PRIME-8K92, SALAMAT2026, PAYDAY-100, SIKAT-50)
 */
export function generatePromoCode(prefix: string = 'PRIME'): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const cleanPrefix = (prefix || 'PRIME').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${cleanPrefix}-${rand}`;
}

/**
 * Computes discount amount based on promo configuration and order amounts
 */
export function calculatePromoDiscount(
  promo: PromoConfig,
  itemsSubtotal: number,
  deliveryFee: number = 0
): { 
  discount: number; 
  isFreeShipping: boolean; 
  shippingSubsidy: number; 
  cashbackPoints: number; 
} {
  // Full Free Shipping
  if (promo.discountType === 'free_shipping') {
    const fee = Math.max(0, deliveryFee);
    return {
      discount: fee,
      isFreeShipping: true,
      shippingSubsidy: fee,
      cashbackPoints: 0
    };
  }

  // Capped Shipping Subsidy (e.g., ₱50 off delivery fee)
  if (promo.discountType === 'shipping_discount') {
    const cap = Number(promo.cappedShippingDiscount || promo.discountValue) || deliveryFee;
    const subsidy = Math.min(Math.max(0, deliveryFee), Math.max(0, cap));
    return {
      discount: subsidy,
      isFreeShipping: subsidy >= deliveryFee && deliveryFee > 0,
      shippingSubsidy: subsidy,
      cashbackPoints: 0
    };
  }

  // Fixed Amount Discount on items
  if (promo.discountType === 'fixed') {
    const fixedVal = Number(promo.discountValue) || 0;
    return {
      discount: Math.min(itemsSubtotal, fixedVal),
      isFreeShipping: false,
      shippingSubsidy: 0,
      cashbackPoints: 0
    };
  }

  // Percentage Discount with optional Cap
  if (promo.discountType === 'percentage') {
    const pct = Math.max(0, Number(promo.discountValue) || 0);
    let calculated = (itemsSubtotal * pct) / 100;
    if (promo.maxDiscountAmount && promo.maxDiscountAmount > 0) {
      calculated = Math.min(calculated, Number(promo.maxDiscountAmount));
    }
    return {
      discount: Math.min(itemsSubtotal, calculated),
      isFreeShipping: false,
      shippingSubsidy: 0,
      cashbackPoints: 0
    };
  }

  // Coins / Points Cashback
  if (promo.discountType === 'coins_cashback') {
    const pct = Math.max(0, Number(promo.discountValue || promo.cashbackPercentage) || 0);
    let pts = Math.floor((itemsSubtotal * pct) / 100);
    if (promo.maxDiscountAmount && promo.maxDiscountAmount > 0) {
      pts = Math.min(pts, Number(promo.maxDiscountAmount));
    }
    return {
      discount: 0, // Cashback does not reduce payable upfront; it credits points post-delivery
      isFreeShipping: false,
      shippingSubsidy: 0,
      cashbackPoints: pts
    };
  }

  return { discount: 0, isFreeShipping: false, shippingSubsidy: 0, cashbackPoints: 0 };
}
