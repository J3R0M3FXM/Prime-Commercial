/**
 * Currency and Number Formatting Utility for Philippine Peso (PHP / ₱)
 * Ensures standard formatting with 2 decimal places and comma separators for thousands (e.g., ₱1,000.00).
 */

export function formatPHP(amount: number | string | null | undefined): string {
  const numeric = typeof amount === "number" ? amount : Number(amount);
  if (isNaN(numeric)) {
    return "₱0.00";
  }
  return `₱${numeric.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatNumber(val: number | string | null | undefined, decimals = 2): string {
  const numeric = typeof val === "number" ? val : Number(val);
  if (isNaN(numeric)) {
    return "0.00";
  }
  return numeric.toLocaleString("en-PH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
