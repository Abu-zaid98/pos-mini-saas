/**
 * Format a number as Israeli Shekel currency
 * Always returns: "X.XX ₪"
 */
export function formatCurrency(amount: number): string {
  return `${Math.abs(amount).toFixed(2)} ₪`
}

/**
 * Format with sign (for debt/credit display)
 */
export function formatCurrencySigned(amount: number): string {
  if (amount === 0) return `0.00 ₪`
  const sign = amount > 0 ? '+' : '-'
  return `${sign}${Math.abs(amount).toFixed(2)} ₪`
}

/**
 * Parse a string to a safe float for currency (max 2 decimal places)
 */
export function parseCurrency(value: string): number {
  const parsed = parseFloat(value.replace(/[^0-9.]/g, ''))
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100
}

/**
 * Calculate discount amount from subtotal
 */
export function calcDiscount(
  subtotal: number,
  discountType: 'percent' | 'fixed' | null,
  discountValue: number
): number {
  if (!discountType || discountValue <= 0) return 0
  if (discountType === 'percent') {
    return Math.min(subtotal, (subtotal * discountValue) / 100)
  }
  return Math.min(subtotal, discountValue)
}
