export interface PromoConfig {
  id: string;
  code: string;
  title: string;
  description?: string;
  discountType: 'fixed' | 'percentage' | 'free_shipping';
  discountValue: number; // e.g., 50 for ₱50 or 15 for 15%
  maxDiscountAmount?: number; // Cap for percentage discount (e.g. ₱200 max)
  minSpend?: number; // Minimum items subtotal required
  totalUsageLimit?: number; // Max total redemptions, 0 for unlimited
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
  discountType?: 'fixed' | 'percentage' | 'free_shipping';
  code?: string;
  promoId?: string;
  title?: string;
  description?: string;
  isFreeShipping?: boolean;
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
): { discount: number; isFreeShipping: boolean } {
  if (promo.discountType === 'free_shipping') {
    return {
      discount: Math.max(0, deliveryFee),
      isFreeShipping: true
    };
  }

  if (promo.discountType === 'fixed') {
    const fixedVal = Number(promo.discountValue) || 0;
    return {
      discount: Math.min(itemsSubtotal, fixedVal),
      isFreeShipping: false
    };
  }

  if (promo.discountType === 'percentage') {
    const pct = Math.max(0, Number(promo.discountValue) || 0);
    let calculated = (itemsSubtotal * pct) / 100;
    if (promo.maxDiscountAmount && promo.maxDiscountAmount > 0) {
      calculated = Math.min(calculated, Number(promo.maxDiscountAmount));
    }
    return {
      discount: Math.min(itemsSubtotal, calculated),
      isFreeShipping: false
    };
  }

  return { discount: 0, isFreeShipping: false };
}
