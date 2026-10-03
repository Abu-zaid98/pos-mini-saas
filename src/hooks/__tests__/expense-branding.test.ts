import { describe, expect, it } from 'vitest'
import { DEFAULT_EXPENSE_CATEGORIES, countExpenseUsageByCategory } from '../useExpenses'

describe('expense branding', () => {
  it('uses the branded default categories and keeps the list usable', () => {
    expect(DEFAULT_EXPENSE_CATEGORIES.length).toBeGreaterThan(0)
    expect(DEFAULT_EXPENSE_CATEGORIES.some(({ name }) => name === 'إيجار المحل')).toBe(true)
    expect(DEFAULT_EXPENSE_CATEGORIES.some(({ name }) => name === 'مشتريات تشغيلية')).toBe(true)
  })

  it('counts recorded category usage without deleting historical data', () => {
    const usage = countExpenseUsageByCategory([
      { category: 'إيجار المحل', amount: 500 },
      { category: 'كهرباء', amount: 120 },
      { category: 'إيجار المحل', amount: 250 },
      { category: 'أخرى', amount: 30 },
    ])

    expect(usage['إيجار المحل']).toBe(2)
    expect(usage['كهرباء']).toBe(1)
    expect(usage['أخرى']).toBe(1)
  })
})
