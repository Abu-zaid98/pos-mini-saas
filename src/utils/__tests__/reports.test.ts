/**
 * reports.test.ts — ترابط التقارير المالية: صافي الإيراد والربح بعد المرتجعات
 */
import { describe, it, expect } from 'vitest'
import { invoiceNetRevenue, invoiceNetProfit } from '../reports'
import type { Invoice } from '../../db/db'

/** فاتورة مبسّطة للاختبار */
function inv(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    customerId: null,
    items: [],
    subtotal: 0,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    itemDiscountAmount: 0,
    total: 0,
    paidAmount: 0,
    debtAmount: 0,
    paymentType: 'cash',
    paymentMethod: 'cash',
    note: '',
    createdAt: new Date('2026-10-05T10:00:00'),
    ...over,
  } as Invoice
}

describe('invoiceNetRevenue — صافي الإيراد بعد المرتجعات', () => {
  it('بلا مرتجعات = إجمالي الفاتورة', () => {
    expect(invoiceNetRevenue(inv({ total: 250 }))).toBe(250)
  })

  it('يخصم مبلغ المرتجع من الإيراد', () => {
    expect(invoiceNetRevenue(inv({ total: 250, refundedAmount: 100 }))).toBe(150)
  })

  it('لا ينزل تحت الصفر حتى لو تجاوز المرتجع الإجمالي (خصم فاتورة)', () => {
    expect(invoiceNetRevenue(inv({ total: 80, refundedAmount: 100 }))).toBe(0)
  })
})

describe('invoiceNetProfit — ربح البضاعة بعد المرتجعات', () => {
  it('بلا مرتجعات = الإجمالي − التكلفة', () => {
    const invoice = inv({
      items: [
        { productId: 1, name: 'أ', qty: 2, price: 100, costPrice: 60 },
        { productId: 2, name: 'ب', qty: 1, price: 50, costPrice: 20 },
      ],
      subtotal: 250,
      total: 250,
    })
    // (200 − 120) + (50 − 20) = 110
    expect(invoiceNetProfit(invoice)).toBe(110)
  })

  it('يخصم خصم الفاتورة الإجمالي من الربح', () => {
    const invoice = inv({
      items: [{ productId: 1, name: 'أ', qty: 1, price: 100, costPrice: 60 }],
      subtotal: 100,
      discountAmount: 20,
      total: 80,
    })
    expect(invoiceNetProfit(invoice)).toBe(20) // 40 − 20
  })

  it('مرتجع كامل يصفّر الربح (تُعاد التكلفة للمخزون)', () => {
    const invoice = inv({
      items: [{ productId: 1, name: 'أ', qty: 2, price: 100, costPrice: 60 }],
      subtotal: 200,
      total: 200,
      refundedAmount: 200,
      returnedItems: [
        { productId: 1, name: 'أ', qty: 2, price: 100, refundAmount: 200, refundMethod: 'cash', date: new Date() },
      ],
    })
    expect(invoiceNetProfit(invoice)).toBe(0)
  })

  it('مرتجع جزئي يعكس ربح الكمية المُعادة فقط', () => {
    const invoice = inv({
      items: [{ productId: 1, name: 'أ', qty: 4, price: 100, costPrice: 60 }],
      subtotal: 400,
      total: 400,
      refundedAmount: 100,
      returnedItems: [
        { productId: 1, name: 'أ', qty: 1, price: 100, refundAmount: 100, refundMethod: 'cash', date: new Date() },
      ],
    })
    // الربح الأصلي 160 − ربح القطعة المُعادة (100−60)=40 → 120
    expect(invoiceNetProfit(invoice)).toBe(120)
  })

  it('يتجاهل بنود الديون الوهمية (productId = 0)', () => {
    const invoice = inv({
      items: [
        { productId: 0, name: 'دين افتتاحي', qty: 1, price: 500, costPrice: 0 },
        { productId: 1, name: 'أ', qty: 1, price: 100, costPrice: 60 },
      ],
      subtotal: 600,
      total: 600,
    })
    expect(invoiceNetProfit(invoice)).toBe(40)
  })

  it('خصم السطر يقلل ربح السطر', () => {
    const invoice = inv({
      items: [
        { productId: 1, name: 'أ', qty: 2, price: 100, costPrice: 60, discount: { type: 'fixed', value: 50 } },
      ],
      subtotal: 200,
      itemDiscountAmount: 50,
      total: 150,
    })
    // صافي السطر 150 − تكلفة 120 = 30
    expect(invoiceNetProfit(invoice)).toBe(30)
  })
})
