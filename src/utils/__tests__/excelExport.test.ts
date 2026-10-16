/**
 * excelExport.test.ts — اختبارات وحدات التصدير الشامل إلى Excel.
 *
 * تغطي:
 *  1. صفوف فواتير البيع (الصافي والربح بعد المرتجعات).
 *  2. صفوف أصناف المبيعات مع العبوة (الكمية بالحبات).
 *  3. صفوف أصناف المشتريات مع لقطة العبوة (عدد العبوات/التكلفة).
 *  4. صفوف مرتجعات البيع والشراء.
 *  5. الملخص المالي (computeSnapshot + summaryRows).
 *  6. أرصدة العملاء/الموردين/المحافظ.
 *  7. الأوراق الناتجة من buildFullWorkbook.
 */
import { describe, it, expect } from 'vitest'
import type {
  Invoice,
  InvoiceItem,
  Purchase,
  PurchaseItem,
  Payment,
  Expense,
  Customer,
} from '../../db/db'
import {
  salesInvoiceRows,
  salesItemRows,
  purchaseItemRows,
  salesReturnRows,
  purchaseReturnRows,
  computeSnapshot,
  summaryRows,
  supplierBalanceRows,
  walletBalanceRows,
  customerPaymentRows,
  buildFullWorkbook,
  type FinancialSnapshot,
} from '../excelExport'
import type { AccountBalances } from '../wallet'

const D = () => new Date('2026-10-10T10:00:00')

function item(over: Partial<InvoiceItem> = {}): InvoiceItem {
  return { productId: 1, name: 'صنف', qty: 1, price: 10, costPrice: 6, unit: 'piece', ...over }
}

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    customerId: null,
    customerName: 'بيع مباشر',
    items: [],
    subtotal: 0,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    total: 0,
    paidAmount: 0,
    debtAmount: 0,
    paymentType: 'cash',
    paymentMethod: 'cash',
    note: '',
    createdAt: D(),
    ...over,
  }
}

function pItem(over: Partial<PurchaseItem> = {}): PurchaseItem {
  return {
    productId: 1,
    productName: 'صنف',
    barcode: '',
    quantity: 1,
    oldQuantity: 0,
    newQuantity: 1,
    costPrice: 5,
    totalCost: 5,
    unit: 'piece',
    ...over,
  }
}

function purchase(over: Partial<Purchase> = {}): Purchase {
  return {
    id: 1,
    supplierName: 'مورد',
    items: [],
    totalAmount: 0,
    paidAmount: 0,
    debtAmount: 0,
    paymentType: 'cash',
    paymentMethod: 'cash',
    date: D(),
    createdAt: D(),
    ...over,
  }
}

const emptyBalances = (total = 0): AccountBalances => ({
  cash: total,
  jawwal_pay: 0,
  palpay: 0,
  bop: 0,
  total,
})

describe('salesInvoiceRows', () => {
  it('يحسب الصافي والربح لفاتورة بسيطة', () => {
    const inv = invoice({ total: 20, paidAmount: 20, items: [item({ qty: 2, price: 10, costPrice: 6 })] })
    const rows = salesInvoiceRows([inv])
    expect(rows).toHaveLength(2)
    const r = rows[1]
    expect(r[5]).toBe(20) // الإجمالي
    expect(r[9]).toBe(20) // صافي المبيعات
    expect(r[10]).toBe(8) // الربح = 20 − 12
    expect(r[11]).toBe(20) // المدفوع
  })

  it('يستبعد قيود الديون الوهمية (productId = 0)', () => {
    const inv = invoice({ items: [item({ productId: 0, name: 'دين يدوي' })] })
    expect(salesInvoiceRows([inv])).toHaveLength(1) // رأس فقط
  })

  it('ينقص المرتجع من صافي المبيعات', () => {
    const inv = invoice({
      total: 100,
      items: [item({ qty: 1, price: 100, costPrice: 40 })],
      refundedAmount: 25,
      returnedItems: [
        { productId: 1, name: 'صنف', qty: 1, unit: 'piece', price: 100, refundAmount: 25, refundMethod: 'cash', date: D() },
      ],
    })
    const r = salesInvoiceRows([inv])[1]
    expect(r[8]).toBe(25) // مبلغ المرتجع
    expect(r[9]).toBe(75) // الصافي
  })
})

describe('salesItemRows — العبوة', () => {
  it('يعرض الكمية بالحبات ولقطة العبوة وربح السطر', () => {
    const inv = invoice({
      total: 195,
      items: [
        item({ qty: 3, price: 65, costPrice: 60, pack: { label: 'علبة', factor: 12, price: 65 } }),
      ],
    })
    const r = salesItemRows([inv])[1]
    expect(r[4]).toBe('علبة') // الوحدة
    expect(r[5]).toBe(3) // الكمية (عبوات)
    expect(r[6]).toBe(36) // الكمية بالمخزون = 3 × 12
    expect(r[10]).toBe(195) // إجمالي السطر
    expect(r[11]).toBe(15) // الربح = 3 × (65 − 60)
    expect(r[12]).toBe('علبة (12)')
  })
})

describe('purchaseItemRows — العبوة', () => {
  it('يُخرج عدد العبوات وتكلفتها والكمية بالمخزون', () => {
    const p = purchase({
      totalAmount: 480,
      items: [
        pItem({
          quantity: 144,
          costPrice: 3.33,
          totalCost: 480,
          pack: { label: 'كرتونة', factor: 72 },
          packQty: 2,
          packCost: 240,
        }),
      ],
    })
    const r = purchaseItemRows([p])[1]
    expect(r[6]).toBe(2) // عدد العبوات
    expect(r[7]).toBe('كرتونة') // اسم العبوة
    expect(r[8]).toBe(72) // حبات/عبوة
    expect(r[9]).toBe(144) // الكمية
    expect(r[10]).toBe(240) // تكلفة العبوة
  })
})

describe('مرتجعات البيع والشراء', () => {
  it('يبني صفوف مرتجعات البيع', () => {
    const inv = invoice({
      refundedAmount: 20,
      returnedItems: [
        { productId: 1, name: 'صنف', qty: 2, unit: 'piece', price: 10, refundAmount: 20, refundMethod: 'cash', date: D() },
      ],
    })
    const rows = salesReturnRows([inv])
    expect(rows).toHaveLength(2)
    expect(rows[1][7]).toBe(20)
    expect(rows[1][8]).toBe('استرداد نقدي')
  })

  it('يبني صفوف مرتجعات الشراء', () => {
    const p = purchase({
      returnedAmount: 20,
      returnedItems: [
        { productId: 1, productName: 'صنف', quantity: 5, unit: 'piece', costPrice: 4, refundAmount: 20, refundMethod: 'debt', date: D() },
      ],
    })
    const rows = purchaseReturnRows([p])
    expect(rows[1][7]).toBe(20)
    expect(rows[1][8]).toBe('خصم دين مورد')
  })
})

describe('computeSnapshot + summaryRows', () => {
  const invoices = [
    invoice({
      total: 100,
      refundedAmount: 10,
      items: [item({ qty: 2, price: 50, costPrice: 30 })],
    }),
  ]
  const purchases = [purchase({ totalAmount: 200, returnedAmount: 50 })]
  const payments: Payment[] = [
    { customerId: 1, invoiceId: null, amount: 50, note: 'تحصيل', createdAt: D(), kind: 'collection' },
    { customerId: 1, invoiceId: null, amount: -20, note: 'سلفة', createdAt: D(), kind: 'loan' },
  ]
  const expenses: Expense[] = [
    { title: 'كهرباء', category: 'electricity', amount: 30, date: D(), createdAt: D() },
  ]
  const customers: Customer[] = [{ name: 'علي', phone: '', totalDebt: 300, createdAt: D() }]

  const snap: FinancialSnapshot = computeSnapshot(
    invoices,
    purchases,
    payments,
    expenses,
    customers,
    emptyBalances(120),
  )

  it('يحسب مبالغ المبيعات والمشتريات والمرتجعات', () => {
    expect(snap.salesGross).toBe(100)
    expect(snap.salesReturns).toBe(10)
    expect(snap.salesNet).toBe(90)
    expect(snap.purchasesGross).toBe(200)
    expect(snap.purchaseReturns).toBe(50)
    expect(snap.purchasesNet).toBe(150)
  })

  it('يحسب التحصيلات (الموجب فقط) والأرصدة وصافي الربح', () => {
    expect(snap.collections).toBe(50) // السلفة (−20) لا تُحسب تحصيلاً
    expect(snap.customersDebt).toBe(300)
    expect(snap.suppliersDebt).toBe(0)
    expect(snap.walletsTotal).toBe(120)
    expect(snap.expenses).toBe(30)
    expect(snap.netProfit).toBe(Math.round((snap.grossProfit - 30) * 100) / 100)
  })

  it('يبني ورقة الملخص بالقيم المطلوبة', () => {
    const rows = summaryRows(snap)
    const find = (label: string) => rows.find((r) => r[0] === label)?.[1]
    expect(find('صافي المبيعات')).toBe(90)
    expect(find('إجمالي المشتريات (خام)')).toBe(200)
    expect(find('مرتجعات الشراء')).toBe(50)
    expect(find('صافي المشتريات')).toBe(150)
    expect(find('إجمالي أرصدة المحافظ')).toBe(120)
  })
})

describe('الأرصدة', () => {
  it('يجمع أرصدة الموردين بالاسم', () => {
    const purchases = [
      purchase({ totalAmount: 100, paidAmount: 40, debtAmount: 60 }),
      purchase({ totalAmount: 200, paidAmount: 200, debtAmount: 0 }),
    ]
    const rows = supplierBalanceRows(purchases)
    expect(rows[1]).toEqual([1, 'مورد', 2, 300, 240, 0, 60])
  })

  it('يخرج أرصدة المحافظ مع الإجمالي', () => {
    const rows = walletBalanceRows({ cash: 100, jawwal_pay: 20, palpay: 0, bop: 0, total: 120 })
    expect(rows[0]).toEqual(['المحفظة', 'الرصيد'])
    expect(rows[rows.length - 1]).toEqual(['الإجمالي', 120])
  })

  it('يخرج دفعات العملاء بأسمائهم', () => {
    const customers: Customer[] = [{ id: 7, name: 'سامي', phone: '', totalDebt: 0, createdAt: D() }]
    const payments: Payment[] = [
      { customerId: 7, invoiceId: 3, amount: 25, method: 'cash', note: 'قبض', createdAt: D(), kind: 'collection' },
    ]
    const r = customerPaymentRows(payments, customers)[1]
    expect(r[2]).toBe('سامي')
    expect(r[4]).toBe(25)
    expect(r[6]).toBe('تحصيل دين')
  })
})

describe('buildFullWorkbook', () => {
  it('ينتج كل الأوراق المتوقعة', () => {
    const sheets = buildFullWorkbook({
      invoices: [invoice({ total: 10, items: [item()] })],
      purchases: [purchase()],
      payments: [],
      expenses: [],
      transfers: [],
      productions: [],
      customers: [],
      balances: emptyBalances(0),
    })
    const names = sheets.map((s) => s.name)
    expect(names).toEqual([
      'ملخص مالي',
      'فواتير البيع',
      'أصناف المبيعات',
      'مرتجعات البيع',
      'فواتير الشراء',
      'أصناف المشتريات',
      'مرتجعات الشراء',
      'دفعات العملاء',
      'دفعات الموردين',
      'المصاريف',
      'التحويلات',
      'الإنتاج',
      'أرصدة العملاء',
      'أرصدة الموردين',
      'أرصدة المحافظ',
    ])
  })

  it('يفلتر الأصناف حسب النطاق الزمني', () => {
    const sheets = buildFullWorkbook(
      {
        invoices: [invoice({ createdAt: new Date('2026-10-01T10:00:00'), items: [item()] })],
        purchases: [],
        payments: [],
        expenses: [],
        transfers: [],
        productions: [],
        customers: [],
        balances: emptyBalances(0),
      },
      { from: new Date('2026-10-05T00:00:00'), to: null },
    )
    const salesSheet = sheets.find((s) => s.name === 'فواتير البيع')
    expect(salesSheet?.rows).toHaveLength(1) // رأس فقط — الفاتورة خارج النطاق
  })
})
