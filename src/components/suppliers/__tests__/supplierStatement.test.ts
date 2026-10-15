import { describe, expect, it } from 'vitest'
import type { Purchase } from '../../../db/db'
import { buildSupplierStatement, supplierStatementToRows } from '../SupplierStatementPrint'

function purchase(overrides: Partial<Purchase>): Purchase {
  return {
    id: 1,
    items: [],
    totalAmount: 0,
    date: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('buildSupplierStatement', () => {
  it('records a legacy purchase (no payment fields) as fully paid', () => {
    const rows = buildSupplierStatement([purchase({ id: 1, totalAmount: 100 })])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ type: 'purchase', amount: 100, balance: 100 })
    expect(rows[1]).toMatchObject({ type: 'payment', amount: 100, balance: 0 })
  })

  it('records an initial partial payment when there are no archived payments', () => {
    const rows = buildSupplierStatement([
      purchase({ id: 2, totalAmount: 200, paidAmount: 50, debtAmount: 150, paymentMethod: 'cash' }),
    ])
    expect(rows.map((r) => r.type)).toEqual(['purchase', 'payment'])
    expect(rows[1]).toMatchObject({ type: 'payment', amount: 50, method: 'cash' })
    expect(rows[1].balance).toBe(150)
  })

  it('uses archived supplier payments and keeps a running balance', () => {
    const rows = buildSupplierStatement([
      purchase({ id: 3, totalAmount: 300, paidAmount: 120, debtAmount: 180, supplierPayments: [
        { amount: 100, paymentMethod: 'cash', date: new Date('2026-02-01') },
        { amount: 20, paymentMethod: 'bop', date: new Date('2026-03-01') },
      ] }),
    ])
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ type: 'purchase', amount: 300, balance: 300 })
    expect(rows[1]).toMatchObject({ type: 'payment', amount: 100, balance: 200 })
    expect(rows[2]).toMatchObject({ type: 'payment', amount: 20, balance: 180 })
  })

  it('sorts all movements by date ascending', () => {
    const rows = buildSupplierStatement([
      purchase({ id: 1, totalAmount: 100, date: new Date('2026-05-01'), paidAmount: 0, debtAmount: 100 }),
      purchase({ id: 2, totalAmount: 200, date: new Date('2026-04-01'), paidAmount: 200, debtAmount: 0 }),
    ])
    expect(rows.map((r) => r.date.toISOString().slice(0, 10))).toEqual([
      '2026-04-01',
      '2026-04-01',
      '2026-05-01',
    ])
  })

  it('builds Excel rows that include the balance total', () => {
    const rows = supplierStatementToRows('مورد', [purchase({ id: 1, totalAmount: 100, paidAmount: 40, debtAmount: 60 })])
    const flat = rows.flat().join(' ')
    expect(flat).toContain('كشف حساب مورد')
    expect(flat).toContain('مدين')
    expect(flat).toContain('60')
    expect(flat).toContain('100')
    expect(flat).toContain('40')
  })
})
