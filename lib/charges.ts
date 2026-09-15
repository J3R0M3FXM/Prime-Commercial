export interface ChargeSchedule {
  date?: string; // YYYY-MM-DD
  days?: number[]; // [0, 1, 2, 3, 4, 5, 6] (0 = Sun, 1 = Mon, ..., 6 = Sat)
  daysOfWeek?: number[]; // Legacy support
  time?: string; // HH:mm (e.g. "14:30")
  isOvernight?: boolean; // 10:00 PM to 6:00 AM (22:00 - 05:59)
  overnight?: boolean; // Legacy support
  isRecurring?: boolean;
  recurring?: boolean; // Legacy support
  temporal?: boolean;
}

export interface ChargeConfig {
  id: string;
  name: string;
  type: 'fixed' | 'percentage';
  amount: number;
  value?: number;
  isDefault: boolean; // Default Add to Bill: If true, automatically applies to all orders
  defaultAddToBill?: boolean; // Legacy alias
  isActive?: boolean; // Master active switch (defaults to true)
  schedules?: ChargeSchedule;
  createdAt?: any;
  updatedAt?: any;
}

export interface ComputedCharge {
  id: string;
  name: string;
  type: 'fixed' | 'percentage';
  rate: number;
  computedAmount: number;
}

/**
 * Normalizes a raw Firestore charge document into a strongly-typed ChargeConfig
 */
export function normalizeCharge(raw: any, fallbackId = ''): ChargeConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      id: fallbackId,
      name: 'Charge',
      type: 'fixed',
      amount: 0,
      isDefault: false,
      isActive: false
    };
  }

  const rawSchedules = raw.schedules || {};
  const isOvernight = Boolean(rawSchedules.isOvernight ?? rawSchedules.overnight ?? false);
  const isRecurring = Boolean(rawSchedules.isRecurring ?? rawSchedules.recurring ?? false);
  const days: number[] = Array.isArray(rawSchedules.days)
    ? rawSchedules.days
    : Array.isArray(rawSchedules.daysOfWeek)
    ? rawSchedules.daysOfWeek
    : [];

  const date: string = typeof rawSchedules.date === 'string' ? rawSchedules.date : '';
  const time: string = typeof rawSchedules.time === 'string' ? rawSchedules.time : '';

  // Has any scheduled constraint
  const hasScheduleConstraints = isOvernight || days.length > 0 || Boolean(date) || Boolean(time);

  // If isDefault is explicitly set, use it.
  // Otherwise, if charge has no schedule constraints and isActive is true, treat as default.
  let isDefault = false;
  if (typeof raw.isDefault === 'boolean') {
    isDefault = raw.isDefault;
  } else if (typeof raw.defaultAddToBill === 'boolean') {
    isDefault = raw.defaultAddToBill;
  } else if (!hasScheduleConstraints && raw.isActive === true) {
    isDefault = true;
  }

  const isActive = raw.isActive !== false;
  const amount = Number(raw.amount ?? raw.value ?? 0);

  return {
    id: String(raw.id || fallbackId),
    name: String(raw.name || 'Additional Charge').trim(),
    type: raw.type === 'percentage' ? 'percentage' : 'fixed',
    amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
    isDefault,
    isActive,
    schedules: {
      date,
      days,
      daysOfWeek: days,
      time,
      isOvernight,
      overnight: isOvernight,
      isRecurring,
      recurring: isRecurring,
      temporal: Boolean(rawSchedules.temporal)
    },
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt
  };
}

/**
 * Determines whether a charge is currently applicable to an order.
 * Follows the user's specification:
 * 1. If isActive === false -> never applies.
 * 2. If isDefault === true -> always automatically added to bill.
 * 3. If isDefault === false -> applies ONLY if it satisfies configured schedule conditions:
 *    - Date / Day of week
 *    - Time (e.g. from scheduled time onwards)
 *    - Overnight (10 PM - 6 AM / 22:00 - 05:59)
 *    - Recurring
 */
export function isChargeApplicable(
  chargeRaw: any,
  options?: { date?: Date; timezoneOffsetHours?: number }
): boolean {
  const charge = normalizeCharge(chargeRaw);

  // 1. Inactive charges never apply
  if (charge.isActive === false) {
    return false;
  }

  // 2. Default Add to Bill charges ALWAYS apply to every order
  if (charge.isDefault === true) {
    return true;
  }

  // 3. For scheduled charges (isDefault === false), evaluate current date & time
  const targetDate = options?.date || new Date();
  
  // Philippine Standard Time (UTC+8) is the store reference
  // Compute local hours and minutes in target timezone (default UTC+8)
  const tzOffset = options?.timezoneOffsetHours ?? 8;
  const utcMs = targetDate.getTime() + targetDate.getTimezoneOffset() * 60000;
  const phtDate = new Date(utcMs + tzOffset * 3600000);

  const currentHour = phtDate.getHours();
  const currentMin = phtDate.getMinutes();
  const currentDayOfWeek = phtDate.getDay(); // 0 = Sun, 6 = Sat
  const currentDateStr = phtDate.toISOString().split('T')[0]; // YYYY-MM-DD

  const schedules = charge.schedules || {};
  const isOvernight = Boolean(schedules.isOvernight || schedules.overnight);
  const isRecurring = Boolean(schedules.isRecurring || schedules.recurring);
  const days = Array.isArray(schedules.days) ? schedules.days : [];
  const dateStr = schedules.date || '';
  const timeStr = schedules.time || '';

  // If no schedules are configured at all and isDefault is false, it does not apply
  const hasAnySchedule = isOvernight || days.length > 0 || Boolean(dateStr) || Boolean(timeStr);
  if (!hasAnySchedule) {
    return false;
  }

  // Condition A: Overnight (10 PM to 6 AM / 22:00 - 05:59)
  if (isOvernight) {
    const isLateNight = currentHour >= 22 || currentHour < 6;
    if (!isLateNight) {
      return false;
    }
  }

  // Condition B: Days of week (0-6)
  if (days.length > 0 && !days.includes(currentDayOfWeek)) {
    return false;
  }

  // Condition C: Specific Date (unless recurring)
  if (dateStr && !isRecurring) {
    if (dateStr !== currentDateStr) {
      return false;
    }
  }

  // Condition D: Time check (HH:mm)
  if (timeStr && timeStr.includes(':')) {
    const [schedHour, schedMin] = timeStr.split(':').map(Number);
    if (Number.isFinite(schedHour) && Number.isFinite(schedMin)) {
      if (currentHour < schedHour || (currentHour === schedHour && currentMin < schedMin)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Computes the financial amount for a single charge based on cart subtotal
 */
export function computeChargeAmount(chargeRaw: any, subtotal: number): number {
  const charge = normalizeCharge(chargeRaw);
  const rate = charge.amount;
  const safeSubtotal = Number.isFinite(subtotal) ? Math.max(0, subtotal) : 0;

  if (rate <= 0) return 0;

  if (charge.type === 'percentage') {
    return Math.round(((safeSubtotal * rate) / 100) * 100) / 100;
  }
  return Math.round(rate * 100) / 100;
}

/**
 * Computes the complete charges breakdown for an array of configured charges
 */
export function calculateChargesBreakdown(
  chargesRaw: any[],
  subtotal: number,
  options?: { date?: Date; timezoneOffsetHours?: number }
): {
  totalChargesAmount: number;
  computedCharges: ComputedCharge[];
} {
  if (!Array.isArray(chargesRaw) || chargesRaw.length === 0) {
    return { totalChargesAmount: 0, computedCharges: [] };
  }

  const safeSubtotal = Number.isFinite(subtotal) ? Math.max(0, subtotal) : 0;
  const computedCharges: ComputedCharge[] = [];
  let total = 0;

  for (const raw of chargesRaw) {
    if (!isChargeApplicable(raw, options)) {
      continue;
    }

    const norm = normalizeCharge(raw);
    const amount = computeChargeAmount(norm, safeSubtotal);

    computedCharges.push({
      id: norm.id,
      name: norm.name,
      type: norm.type,
      rate: norm.amount,
      computedAmount: amount
    });

    total += amount;
  }

  return {
    totalChargesAmount: Math.round(total * 100) / 100,
    computedCharges
  };
}
