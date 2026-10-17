/**
 * reports.test.ts — ترابط التقارير المالية: صافي الإيراد والربح بعد المرتجعات
 */
import { describe, it, expect } from 'vitest'
import {
  invoiceNetRevenue,
  invoiceNetProfit,
  sumSalesReturns,
  sumPurchaseReturns,
  purchaseNetTotal,
  computeReturnsSummary,
} from '../reports'
import type { Invoice, Purchase } from '../../db/db'

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

/** فاتورة شراء مبسّطة للاختبار */
function pur(over: Partial<Purchase> = {}): Purchase {
  return {
    id: 1,
    items: [],
    totalAmount: 0,
    paidAmount: 0,
    debtAmount: 0,
    paymentType: 'cash',
    date: new Date('2026-10-05T10:00:00'),
    createdAt: new Date('2026-10-05T10:00:00'),
    ...over,
  } as Purchase
}

describe('ملخّص المرتجعات — صافي المرتجعات (بيع + شراء)', () => {
  it('sumSalesReturns يتجاهل قيود الديون الوهمية ويجمع المرتجعات', () => {
    const list = [
      inv({ total: 200, refundedAmount: 50 }),
      inv({ total: 100, refundedAmount: 0 }),
      // قيد دين يدوي (productId = 0) — لا يُحتسب ضمن مرتجعات البيع
      inv({ items: [{ productId: 0, name: 'دين', qty: 1, price: 999, costPrice: 0 }], total: 999, refundedAmount: 999 }),
    ]
    expect(sumSalesReturns(list)).toBe(50)
  })

  it('sumPurchaseReturns يجمع مرتجعات الشراء', () => {
    expect(sumPurchaseReturns([pur({ returnedAmount: 30 }), pur({ returnedAmount: 70 }), pur({})])).toBe(100)
  })

  it('purchaseNetTotal = الإجمالي − المرتجع ولا ينزل تحت الصفر', () => {
    expect(purchaseNetTotal(pur({ totalAmount: 500, returnedAmount: 120 }))).toBe(380)
    expect(purchaseNetTotal(pur({ totalAmount: 80, returnedAmount: 200 }))).toBe(0)
  })

  it('computeReturnsSummary يفصل الخام عن المرتجع والصافي للبيع والشراء', () => {
    const invoices = [
      inv({ total: 1000, refundedAmount: 200 }),
      inv({ total: 500, refundedAmount: 0 }),
      inv({ items: [{ productId: 0, name: 'دين', qty: 1, price: 300, costPrice: 0 }], total: 300, refundedAmount: 0 }),
    ]
    const purchases = [
      pur({ totalAmount: 800, returnedAmount: 100 }),
      pur({ totalAmount: 200, returnedAmount: 50 }),
    ]
    const s = computeReturnsSummary(invoices, purchases)
    expect(s.salesGross).toBe(1500) // يستثني قيد الدين (300)
    expect(s.salesReturns).toBe(200)
    expect(s.salesNet).toBe(1300)
    expect(s.salesReturnCount).toBe(1)
    expect(s.purchasesGross).toBe(1000)
    expect(s.purchaseReturns).toBe(150)
    expect(s.purchasesNet).toBe(850)
    expect(s.purchaseReturnCount).toBe(2)
  })

  it('بلا مرتجعات: الصافي = الخام والعدد صفر', () => {
    const s = computeReturnsSummary([inv({ total: 400 })], [pur({ totalAmount: 250 })])
    expect(s.salesReturns).toBe(0)
    expect(s.salesNet).toBe(400)
    expect(s.purchaseReturns).toBe(0)
    expect(s.purchasesNet).toBe(250)
    expect(s.salesReturnCount + s.purchaseReturnCount).toBe(0)
  })
})

// ─────────────────────────────────────────────
// تحقيق الربح مع كل حالات الخصم (نسبة/ثابت/فاتورة/عبوة/موزون)
//
// القاعدة الذهبية: ربح الفاتورة يجب أن يساوي دائماً
//   صافي الإيراد − مجموع التكلفة
// بغضّ النظر عن نوع الخصم أو مكانه (سطر أم فاتورة). هذه الاختبارات
// تحاكي بالضبط ما يخزّنه شاشة البيع في الفاتورة.
// ─────────────────────────────────────────────

interface LineLike {
  productId: number
  name: string
  qty: number
  price: number
  costPrice: number
  discount?: { type: 'percent' | 'fixed'; value: number }
}

/** يبني فاتورة كما تبنيها شاشة البيع تماماً، ويُرجع الفاتورة + مجموع التكلفة */
function buildSale(items: LineLike[], invoiceDiscount: { type: 'percent' | 'fixed'; value: number } | null = null) {
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0)
  const lineDisc = items.reduce((s, i) => {
    const gross = i.qty * i.price
    if (!i.discount || i.discount.value <= 0) return s
    return s + (i.discount.type === 'percent'
      ? (gross * Math.min(100, i.discount.value)) / 100
      : Math.min(gross, i.discount.value))
  }, 0)
  const base = Math.max(0, subtotal - lineDisc)
  const discountAmount = !invoiceDiscount || invoiceDiscount.value <= 0
    ? 0
    : invoiceDiscount.type === 'percent'
      ? (base * Math.min(100, invoiceDiscount.value)) / 100
      : Math.min(base, invoiceDiscount.value)
  const total = Math.max(0, base - discountAmount)
  const cost = items.reduce((s, i) => s + i.qty * i.costPrice, 0)
  const invoice = inv({
    items: items.map((i) => ({ ...i })) as Invoice['items'],
    subtotal,
    discountType: invoiceDiscount ? invoiceDiscount.type : null,
    discountValue: invoiceDiscount?.value ?? 0,
    discountAmount,
    itemDiscountAmount: lineDisc,
    total,
  })
  return { invoice, cost }
}

describe('تحقيق الربح = صافي الإيراد − التكلفة (كل حالات الخصم)', () => {
  const cases: Array<{ name: string; items: LineLike[]; inv?: { type: 'percent' | 'fixed'; value: number } }> = [
    { name: 'حبة بلا خصم', items: [{ productId: 1, name: 'حبة', qty: 3, price: 10, costPrice: 6 }] },
    { name: 'خصم نسبة على الحبة', items: [{ productId: 1, name: 'حبة', qty: 3, price: 10, costPrice: 6, discount: { type: 'percent', value: 10 } }] },
    { name: 'خصم ثابت على الحبة', items: [{ productId: 1, name: 'حبة', qty: 3, price: 10, costPrice: 6, discount: { type: 'fixed', value: 5 } }] },
    { name: 'خصم يتجاوز إجمالي السطر (يُحدّ)', items: [{ productId: 1, name: 'حبة', qty: 1, price: 10, costPrice: 6, discount: { type: 'fixed', value: 50 } }] },
    // العبوة: تكلفتها = تكلفة الحبة × عدد الحبات (2 × 12 = 24)، سعرها 27
    { name: 'كرتونة بلا خصم', items: [{ productId: 2, name: 'كرتونة', qty: 2, price: 27, costPrice: 24 }] },
    { name: 'خصم نسبة على الكرتونة', items: [{ productId: 2, name: 'كرتونة', qty: 2, price: 27, costPrice: 24, discount: { type: 'percent', value: 10 } }] },
    { name: 'خصم ثابت على الكرتونة', items: [{ productId: 2, name: 'كرتونة', qty: 1, price: 27, costPrice: 24, discount: { type: 'fixed', value: 5 } }] },
    { name: 'موزون', items: [{ productId: 3, name: 'موزون', qty: 1.5, price: 20, costPrice: 14 }] },
    {
      name: 'مختلط + خصم فاتورة نسبة',
      items: [
        { productId: 1, name: 'حبة', qty: 2, price: 10, costPrice: 6 },
        { productId: 2, name: 'كرتونة', qty: 1, price: 27, costPrice: 24, discount: { type: 'percent', value: 10 } },
      ],
      inv: { type: 'percent', value: 10 },
    },
    {
      name: 'مختلط + خصم فاتورة ثابت',
      items: [
        { productId: 1, name: 'حبة', qty: 3, price: 10, costPrice: 6, discount: { type: 'fixed', value: 5 } },
        { productId: 3, name: 'موزون', qty: 0.75, price: 20, costPrice: 14 },
      ],
      inv: { type: 'fixed', value: 5 },
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const { invoice, cost } = buildSale(c.items, c.inv ?? null)
      const expected = Math.round((invoiceNetRevenue(invoice) - cost) * 100) / 100
      const actual = Math.round(invoiceNetProfit(invoice) * 100) / 100
      expect(actual).toBeCloseTo(expected, 2)
    })
  }

  it('الكرتونة المخفّضة 10%: الإيراد 24.3 والتكلفة 24 ⇒ ربح موجب 0.3', () => {
    const { invoice } = buildSale([
      { productId: 2, name: 'كرتونة', qty: 1, price: 27, costPrice: 24, discount: { type: 'percent', value: 10 } },
    ])
    expect(invoiceNetRevenue(invoice)).toBe(24.3)
    expect(invoiceNetProfit(invoice)).toBe(0.3)
  })

  it('الكرتونة المخفّضة 10% مع تكلفة أعلى من سعر البيع ⇒ خسارة حقيقية (سلوك صحيح)', () => {
    // تكلفة الحبة 2.75 × 12 = 33 للكرتونة، بيع 27 بخصم 10% = 24.3
    const { invoice } = buildSale([
      { productId: 2, name: 'كرتونة', qty: 1, price: 27, costPrice: 33, discount: { type: 'percent', value: 10 } },
    ])
    expect(invoiceNetRevenue(invoice)).toBe(24.3)
    expect(invoiceNetProfit(invoice)).toBe(-8.7)
  })
})
