/**
 * suppliers.test.ts — تجميع حسابات الموردين من الفواتير بالاسم
 */
import { describe, it, expect } from 'vitest'
import { buildSupplierStats, supplierKey } from '../useSuppliers'
import type { Purchase } from '../../db/db'

function pur(over: Partial<Purchase> = {}): Purchase {
  return {
    id: 1,
    supplierName: 'مورد',
    items: [],
    totalAmount: 1000,
    paidAmount: 400,
    debtAmount: 600,
    paymentType: 'partial',
    paymentMethod: 'cash',
    date: new Date('2026-10-01T10:00:00'),
    createdAt: new Date('2026-10-01T10:00:00'),
    ...over,
  }
}

describe('supplierKey', () => {
  it('يطبع الاسم ويوحد الحالة', () => {
    expect(supplierKey('  أحمد  ')).toBe('أحمد'.toLocaleLowerCase('ar'))
    expect(supplierKey('')).toBe('')
    expect(supplierKey(undefined)).toBe('')
  })
})

describe('buildSupplierStats', () => {
  it('شراء 1000 ومدفوع 400 = دين 600 للمورد', () => {
    const [s] = buildSupplierStats([pur()])
    expect(s.name).toBe('مورد')
    expect(s.invoices).toBe(1)
    expect(s.totalAmount).toBe(1000)
    expect(s.totalPaid).toBe(400)
    expect(s.totalDebt).toBe(600)
  })

  it('يجمع الفواتير ويوحد الاسم باختلاف المسافات', () => {
    const stats = buildSupplierStats([
      pur({ id: 1, supplierName: 'مورد', totalAmount: 1000, paidAmount: 400, debtAmount: 600 }),
      pur({ id: 2, supplierName: '  مورد ', totalAmount: 500, paidAmount: 500, debtAmount: 0 }),
    ])
    expect(stats).toHaveLength(1)
    expect(stats[0].invoices).toBe(2)
    expect(stats[0].totalAmount).toBe(1500)
    expect(stats[0].totalPaid).toBe(900)
    expect(stats[0].totalDebt).toBe(600)
  })

  it('السجل القديم بلا حقول دفع = مسدد بالكامل', () => {
    const p = pur({ totalAmount: 700 })
    delete (p as { paidAmount?: unknown }).paidAmount
    delete (p as { debtAmount?: unknown }).debtAmount
    const [s] = buildSupplierStats([p])
    expect(s.totalPaid).toBe(700)
    expect(s.totalDebt).toBe(0)
  })

  it('يرتب أصحاب الديون أولاً', () => {
    const stats = buildSupplierStats([
      pur({ id: 1, supplierName: 'مسدد', totalAmount: 5000, paidAmount: 5000, debtAmount: 0 }),
      pur({ id: 2, supplierName: 'مدين', totalAmount: 300, paidAmount: 0, debtAmount: 300 }),
    ])
    expect(stats[0].name).toBe('مدين')
  })

  it('فارغ الاسم يُجمع تحت بدون مورد', () => {
    const [s] = buildSupplierStats([pur({ supplierName: '' })])
    expect(s.key).toBe('')
    expect(s.name).toBe('بدون مورد')
  })
})
