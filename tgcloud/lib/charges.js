function targetTimeParts(date, timeZone = 'Asia/Manila') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    hour: Number(parts.hour) || 0,
    minute: Number(parts.minute) || 0,
    day: days[parts.weekday] ?? 0,
    date: String(parts.year) + '-' + String(parts.month) + '-' + String(parts.day),
  };
}

export function normalizeCharge(row) {
  let metadata = {};
  try {
    if (typeof row?.description === 'string' && row.description.trim().startsWith('{')) {
      const parsed = JSON.parse(row.description);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metadata = parsed;
    }
  } catch {
    metadata = {};
  }
  const schedules = {
    ...metadata,
    days: Array.isArray(metadata.days) ? metadata.days
      : Array.isArray(metadata.daysOfWeek) ? metadata.daysOfWeek : [],
    isOvernight: Boolean(metadata.isOvernight ?? metadata.overnight ?? false),
    isRecurring: Boolean(metadata.isRecurring ?? metadata.recurring ?? false),
  };
  const hasConstraints = schedules.isOvernight || schedules.days.length > 0 || Boolean(schedules.date) || Boolean(schedules.time);
  const isDefault = typeof metadata.isDefault === 'boolean' ? metadata.isDefault : !hasConstraints;
  const name = String(row?.name || 'Additional Charge').trim();
  return {
    id: String(row?.id || ''),
    name: name.toLowerCase().split(' ').map((word) => word ? word[0].toUpperCase() + word.slice(1) : '').join(' '),
    type: String(row?.type || '').toLowerCase() === 'percentage' ? 'percentage' : 'fixed',
    amount: Math.max(0, Number(row?.rate) || 0),
    value: Math.max(0, Number(row?.rate) || 0),
    rate: Math.max(0, Number(row?.rate) || 0),
    isActive: row?.isActive !== false,
    isDefault,
    defaultAddToBill: isDefault,
    schedules,
  };
}

export function calculateChargesBreakdown(rows, subtotal, now = new Date()) {
  const safeSubtotal = Number.isFinite(Number(subtotal)) ? Math.max(0, Number(subtotal)) : 0;
  const current = targetTimeParts(now);
  const computedCharges = [];
  for (const raw of rows || []) {
    const charge = normalizeCharge(raw);
    if (!charge.isActive) continue;
    const s = charge.schedules;
    if (!charge.isDefault) {
      const constrained = s.isOvernight || s.days.length > 0 || s.date || s.time;
      if (!constrained) continue;
      if (s.isOvernight && !(current.hour >= 22 || current.hour < 6)) continue;
      if (s.days.length && !s.days.map(Number).includes(current.day)) continue;
      if (s.date && !s.isRecurring && s.date !== current.date) continue;
      if (s.time && String(s.time).includes(':')) {
        const [hour, minute] = String(s.time).split(':').map(Number);
        if (Number.isFinite(hour) && Number.isFinite(minute) &&
            (current.hour < hour || (current.hour === hour && current.minute < minute))) continue;
      }
    }
    const rate = charge.amount;
    const computedAmount = rate <= 0 ? 0 : charge.type === 'percentage'
      ? Math.round(safeSubtotal * rate) / 100
      : Math.round(rate * 100) / 100;
    computedCharges.push({ id: charge.id, name: charge.name, type: charge.type, rate, computedAmount });
  }
  return {
    computedCharges,
    totalChargesAmount: Math.round(computedCharges.reduce((sum, charge) => sum + charge.computedAmount, 0) * 100) / 100,
  };
}
