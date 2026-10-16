/**
 * excelExport.ts — تصدير شامل ومفصّل إلى Excel (.xlsx).
 *
 * وحدة واحدة تبني أوراق العمل من بيانات التطبيق، لتفادي تكرار منطق التصدير
 * وضمان تطابق الأرقام مع ما يظهر في الشاشات (نفس دوال reports/units).
 *
 * الأوراق المدعومة:
 *   ملخص مالي · فواتير البيع · أصناف المبيعات · مرتجعات البيع ·
 *   فواتير الشراء · أصناف المشتريات · مرتجعات الشراء · دفعات العملاء ·
 *   دفعات الموردين · المصاريف · التحويلات · الإنتاج ·
 *   أرصدة العملاء · أرصدة الموردين · أرصدة المحافظ
 */
import {
  db,
  EXPENSE_CATEGORIES,
  type Invoice,
  type Purchase,
  type Payment,
  type Expense,
  type WalletTransfer,
  type Production,
  type Customer,
  type PaymentType,
  type PaymentKind,
} from '../db/db'
import { formatDate, formatDateTime } from './datetime'
import { getPaymentMethodName } from './wallets'
import { GRAMS_PER_KG, lineDiscountAmount, lineProfit } from './units'
import { invoiceNetRevenue, invoiceNetProfit } from './reports'
import { computeBalances, parseAdjustments, type AccountBalances } from './wallet'
import { downloadXlsx, type XlsxCell, type XlsxSheet } from './xlsx'

// ─────────────────────────────────────────────
// أدوات مساعدة
// ─────────────────────────────────────────────

const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100

const PAY_TYPE_LABEL: Record<PaymentType, string> = {
  cash: 'نقدي',
  debt: 'دين',
  partial: 'جزئي',
}

const PAY_KIND_LABEL: Record<PaymentKind, string> = {
  sale: 'دفعة بيع',
  collection: 'تحصيل دين',
  loan: 'سلفة للعميل',
}

/** تسمية وحدة العرض بالعربية */
function unitName(u?: string): string {
  return u === 'kg' ? 'كغ' : u === 'g' ? 'غرام' : 'قطعة'
}

function categoryName(id: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.id === id)?.name || id
}

/** فاتورة بيع حقيقية (ليست قيد دين يدوي/رصيد افتتاحي) */
const isRealSale = (inv: Invoice): boolean =>
  inv.items.length === 0 || inv.items.some((i) => i.productId !== 0)

/** المدفوع لفاتورة شراء — السجلات القديمة بلا حقول دفع تُعامل كمدفوعة بالكامل */
const purchasePaid = (p: Purchase): number =>
  p.paidAmount !== undefined || p.debtAmount !== undefined
    ? Number(p.paidAmount) || 0
    : Number(p.totalAmount) || 0

const byDateAsc = (d: (x: unknown) => Date) => (a: unknown, b: unknown) =>
  d(a).getTime() - d(b).getTime()

export interface ExportRange {
  from?: Date | null
  to?: Date | null
}

function inRange(date: Date, range?: ExportRange): boolean {
  if (!range) return true
  const t = new Date(date).getTime()
  if (range.from && t < range.from.getTime()) return false
  if (range.to && t >= range.to.getTime()) return false
  return true
}

// ─────────────────────────────────────────────
// فواتير البيع
// ─────────────────────────────────────────────

export function salesInvoiceRows(invoices: Invoice[]): XlsxCell[][] {
  const list = invoices.filter(isRealSale).sort(byDateAsc((x) => (x as Invoice).createdAt))
  const rows: XlsxCell[][] = [[
    'رقم الفاتورة', 'التاريخ', 'العميل', 'نوع الدفع', 'الوسيلة', 'الإجمالي',
    'خصم الأصناف', 'خصم الفاتورة', 'مبلغ المرتجع', 'صافي المبيعات', 'الربح', 'المدفوع', 'الدين', 'ملاحظة',
  ]]
  for (const inv of list) {
    rows.push([
      inv.id ?? '',
      formatDateTime(inv.createdAt),
      inv.customerName?.trim() || 'بيع مباشر',
      PAY_TYPE_LABEL[inv.paymentType] || inv.paymentType,
      inv.paymentMethod ? getPaymentMethodName(inv.paymentMethod) : '—',
      r2(inv.total),
      r2(inv.itemDiscountAmount ?? inv.items.reduce((s, i) => s + lineDiscountAmount(i), 0)),
      r2(inv.discountAmount),
      r2(inv.refundedAmount ?? 0),
      invoiceNetRevenue(inv),
      invoiceNetProfit(inv),
      r2(inv.paidAmount),
      r2(inv.debtAmount),
      (inv.note || '').replace(/\n/g, ' '),
    ])
  }
  return rows
}

export function salesItemRows(invoices: Invoice[]): XlsxCell[][] {
  const rows: XlsxCell[][] = [[
    'رقم الفاتورة', 'التاريخ', 'العميل', 'الصنف', 'الوحدة', 'الكمية',
    'الكمية بالمخزون (قطعة/غرام)', 'السعر', 'التكلفة', 'خصم السطر', 'إجمالي السطر', 'ربح السطر', 'العبوة',
  ]]
  for (const inv of invoices.filter(isRealSale).sort(byDateAsc((x) => (x as Invoice).createdAt))) {
    for (const it of inv.items) {
      if (it.productId === 0) continue
      const gross = (Number(it.qty) || 0) * (Number(it.price) || 0)
      const stockQty = it.pack
        ? (Number(it.qty) || 0) * it.pack.factor
        : it.unit === 'kg'
          ? (Number(it.qty) || 0) * GRAMS_PER_KG
          : Number(it.qty) || 0
      rows.push([
        inv.id ?? '',
        formatDateTime(inv.createdAt),
        inv.customerName?.trim() || 'بيع مباشر',
        it.name,
        it.pack ? it.pack.label : unitName(it.unit),
        Number(it.qty) || 0,
        r2(stockQty),
        r2(it.price),
        r2(it.costPrice),
        lineDiscountAmount(it),
        r2(gross - lineDiscountAmount(it)),
        r2(lineProfit(it)),
        it.pack ? `${it.pack.label} (${it.pack.factor})` : '',
      ])
    }
  }
  return rows
}

export function salesReturnRows(invoices: Invoice[]): XlsxCell[][] {
  const rows: XlsxCell[][] = [[
    'رقم الفاتورة', 'التاريخ', 'العميل', 'الصنف', 'الوحدة', 'الكمية',
    'سعر الإرجاع', 'مبلغ الاسترداد', 'طريقة الاسترداد', 'السبب',
  ]]
  const list = [...invoices].sort((a, b) =>
    new Date(b.returnedItems?.[0]?.date || b.createdAt).getTime() -
    new Date(a.returnedItems?.[0]?.date || a.createdAt).getTime(),
  )
  for (const inv of list) {
    for (const ret of inv.returnedItems || []) {
      rows.push([
        inv.id ?? '',
        formatDateTime(ret.date),
        inv.customerName?.trim() || 'بيع مباشر',
        ret.name,
        unitName(ret.unit),
        Number(ret.qty) || 0,
        r2(ret.price),
        r2(ret.refundAmount),
        ret.refundMethod === 'debt' ? 'خصم دين' : 'استرداد نقدي',
        ret.reason || '',
      ])
    }
  }
  return rows
}

// ─────────────────────────────────────────────
// فواتير الشراء
// ─────────────────────────────────────────────

export function purchaseInvoiceRows(purchases: Purchase[]): XlsxCell[][] {
  const list = [...purchases].sort(byDateAsc((x) => (x as Purchase).date))
  const rows: XlsxCell[][] = [[
    'رقم السجل', 'التاريخ', 'المورد', 'رقم فاتورة المورد', 'نوع الدفع', 'الوسيلة',
    'الإجمالي', 'المدفوع', 'الدين', 'مبلغ المرتجع', 'صافي الشراء', 'ملاحظة',
  ]]
  for (const p of list) {
    const total = r2(p.totalAmount)
    const ret = r2(p.returnedAmount ?? 0)
    rows.push([
      p.id ?? '',
      formatDate(p.date),
      p.supplierName?.trim() || 'غير محدد',
      p.invoiceNumber || '',
      p.paymentType ? PAY_TYPE_LABEL[p.paymentType] : '—',
      p.paymentMethod ? getPaymentMethodName(p.paymentMethod) : '—',
      total,
      r2(purchasePaid(p)),
      r2(p.debtAmount ?? 0),
      ret,
      Math.max(0, r2(total - ret)),
      (p.notes || '').replace(/\n/g, ' '),
    ])
  }
  return rows
}

export function purchaseItemRows(purchases: Purchase[]): XlsxCell[][] {
  const rows: XlsxCell[][] = [[
    'رقم السجل', 'التاريخ', 'المورد', 'الصنف', 'الباركود', 'الوحدة',
    'عدد العبوات', 'اسم العبوة', 'حبات/عبوة', 'الكمية بالمخزون (قطعة/غرام)',
    'تكلفة العبوة', 'تكلفة الوحدة', 'إجمالي السطر',
  ]]
  for (const p of [...purchases].sort(byDateAsc((x) => (x as Purchase).date))) {
    for (const it of p.items) {
      rows.push([
        p.id ?? '',
        formatDate(p.date),
        p.supplierName?.trim() || 'غير محدد',
        it.productName,
        it.barcode || '',
        it.unit === 'kg' ? 'كغ' : 'قطعة',
        it.pack ? (it.packQty ?? '') : '',
        it.pack ? it.pack.label : '',
        it.pack ? it.pack.factor : '',
        r2(it.quantity),
        it.pack ? r2(it.packCost ?? 0) : '',
        r2(it.costPrice),
        r2(it.totalCost),
      ])
    }
  }
  return rows
}

export function purchaseReturnRows(purchases: Purchase[]): XlsxCell[][] {
  const rows: XlsxCell[][] = [[
    'رقم السجل', 'التاريخ', 'المورد', 'الصنف', 'الوحدة', 'الكمية',
    'تكلفة الوحدة', 'مبلغ الاسترداد', 'طريقة الاسترداد', 'السبب',
  ]]
  for (const p of [...purchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())) {
    for (const ret of p.returnedItems || []) {
      rows.push([
        p.id ?? '',
        formatDate(ret.date),
        p.supplierName?.trim() || 'غير محدد',
        ret.productName,
        unitName(ret.unit),
        Number(ret.quantity) || 0,
        r2(ret.costPrice),
        r2(ret.refundAmount),
        ret.refundMethod === 'debt' ? 'خصم دين مورد' : 'استرداد نقدي',
        ret.reason || '',
      ])
    }
  }
  return rows
}

// ─────────────────────────────────────────────
// الحركات المالية
// ─────────────────────────────────────────────

export function customerPaymentRows(payments: Payment[], customers: Customer[]): XlsxCell[][] {
  const name = new Map(customers.map((c) => [c.id, c.name]))
  const rows: XlsxCell[][] = [[
    '#', 'التاريخ', 'العميل', 'الفاتورة', 'المبلغ', 'الوسيلة', 'النوع', 'ملاحظة',
  ]]
  const list = [...payments].sort(byDateAsc((x) => (x as Payment).createdAt))
  list.forEach((p, i) => {
    rows.push([
      i + 1,
      formatDateTime(p.createdAt),
      name.get(p.customerId) || `#${p.customerId}`,
      p.invoiceId != null ? `#${p.invoiceId}` : '—',
      r2(p.amount),
      p.method ? getPaymentMethodName(p.method) : '—',
      p.kind ? PAY_KIND_LABEL[p.kind] : 'دفعة',
      (p.note || '').replace(/\n/g, ' '),
    ])
  })
  return rows
}

export function supplierPaymentRows(purchases: Purchase[]): XlsxCell[][] {
  const rows: XlsxCell[][] = [[
    '#', 'التاريخ', 'المورد', 'فاتورة الشراء', 'المبلغ', 'الوسيلة', 'ملاحظة',
  ]]
  let i = 0
  for (const p of purchases) {
    for (const sp of p.supplierPayments || []) {
      i += 1
      rows.push([
        i,
        formatDate(sp.date),
        p.supplierName?.trim() || 'غير محدد',
        p.invoiceNumber || (p.id != null ? `#${p.id}` : ''),
        r2(sp.amount),
        sp.paymentMethod ? getPaymentMethodName(sp.paymentMethod) : '—',
        sp.notes || '',
      ])
    }
  }
  return rows
}

export function expenseRows(expenses: Expense[]): XlsxCell[][] {
  const rows: XlsxCell[][] = [[
    '#', 'التاريخ', 'البيان', 'الفئة', 'المبلغ', 'الوسيلة', 'ملاحظات',
  ]]
  ;[...expenses].sort(byDateAsc((x) => (x as Expense).date)).forEach((e, i) => {
    rows.push([
      i + 1,
      formatDate(e.date),
      e.title,
      categoryName(e.category),
      r2(e.amount),
      e.paymentMethod ? getPaymentMethodName(e.paymentMethod) : '—',
      (e.notes || '').replace(/\n/g, ' '),
    ])
  })
  return rows
}

export function transferRows(transfers: WalletTransfer[]): XlsxCell[][] {
  const rows: XlsxCell[][] = [[
    '#', 'التاريخ', 'من محفظة', 'إلى محفظة', 'المبلغ', 'ملاحظات',
  ]]
  ;[...transfers].sort(byDateAsc((x) => (x as WalletTransfer).date)).forEach((t, i) => {
    rows.push([
      i + 1,
      formatDateTime(t.date),
      getPaymentMethodName(t.fromMethod),
      getPaymentMethodName(t.toMethod),
      r2(t.amount),
      (t.notes || '').replace(/\n/g, ' '),
    ])
  })
  return rows
}

export function productionRows(productions: Production[]): XlsxCell[][] {
  const rows: XlsxCell[][] = [[
    '#', 'التاريخ', 'الصنف', 'الوزن (غرام)', 'تكلفة المواد', 'التكلفة الكلية', 'تكلفة الكيلو',
  ]]
  ;[...productions].sort(byDateAsc((x) => (x as Production).date)).forEach((p, i) => {
    rows.push([
      i + 1,
      formatDate(p.date),
      p.productName,
      r2(p.producedQty),
      r2(p.materialCost),
      r2(p.totalCost),
      r2(p.unitCost),
    ])
  })
  return rows
}

// ─────────────────────────────────────────────
// الأرصدة
// ─────────────────────────────────────────────

export function customerBalanceRows(customers: Customer[]): XlsxCell[][] {
  const rows: XlsxCell[][] = [[
    '#', 'الاسم', 'الهاتف', 'إجمالي الدين', 'الرصيد الدائن',
  ]]
  customers.forEach((c, i) => {
    rows.push([i + 1, c.name, c.phone || '', r2(c.totalDebt), r2(c.creditBalance ?? 0)])
  })
  return rows
}

interface SupplierAgg {
  name: string
  count: number
  total: number
  paid: number
  returned: number
  debt: number
}

/** تجميع حسابات الموردين من فواتير الشراء بالاسم (نفس منطق شاشة الموردين). */
export function aggregateSuppliers(purchases: Purchase[]): SupplierAgg[] {
  const map = new Map<string, SupplierAgg>()
  for (const p of purchases) {
    const name = (p.supplierName || '').trim()
    const key = name.toLocaleLowerCase('ar')
    const total = Number(p.totalAmount) || 0
    const paid = purchasePaid(p)
    const debt = p.debtAmount !== undefined || p.paidAmount !== undefined ? Number(p.debtAmount) || 0 : 0
    const returned = Number(p.returnedAmount) || 0
    const cur = map.get(key) || { name: name || 'بدون مورد', count: 0, total: 0, paid: 0, returned: 0, debt: 0 }
    cur.count += 1
    cur.total = r2(cur.total + total)
    cur.paid = r2(cur.paid + paid)
    cur.returned = r2(cur.returned + returned)
    cur.debt = r2(cur.debt + debt)
    map.set(key, cur)
  }
  return [...map.values()].sort((a, b) => b.debt - a.debt || b.total - a.total)
}

export function supplierBalanceRows(purchases: Purchase[]): XlsxCell[][] {
  const rows: XlsxCell[][] = [[
    '#', 'المورد', 'عدد الفواتير', 'إجمالي التوريد', 'إجمالي السداد', 'إجمالي المرتجعات', 'الرصيد المستحق',
  ]]
  aggregateSuppliers(purchases).forEach((s, i) => {
    rows.push([i + 1, s.name, s.count, s.total, s.paid, s.returned, s.debt])
  })
  return rows
}

export function walletBalanceRows(balances: AccountBalances): XlsxCell[][] {
  const rows: XlsxCell[][] = [['المحفظة', 'الرصيد']]
  for (const [key, value] of Object.entries(balances)) {
    if (key === 'total') continue
    rows.push([getPaymentMethodName(key), r2(value as number)])
  }
  rows.push(['الإجمالي', r2(balances.total)])
  return rows
}

// ─────────────────────────────────────────────
// الملخص المالي
// ─────────────────────────────────────────────

export interface FinancialSnapshot {
  salesGross: number
  salesReturns: number
  salesNet: number
  grossProfit: number
  purchasesGross: number
  purchaseReturns: number
  purchasesNet: number
  expenses: number
  netProfit: number
  collections: number
  customersDebt: number
  suppliersDebt: number
  walletsTotal: number
}

export function computeSnapshot(
  invoices: Invoice[],
  purchases: Purchase[],
  payments: Payment[],
  expenses: Expense[],
  customers: Customer[],
  balances: AccountBalances,
): FinancialSnapshot {
  const real = invoices.filter(isRealSale)
  const salesGross = r2(real.reduce((s, inv) => s + (Number(inv.total) || 0), 0))
  const salesReturns = r2(real.reduce((s, inv) => s + (Number(inv.refundedAmount) || 0), 0))
  const salesNet = r2(real.reduce((s, inv) => s + invoiceNetRevenue(inv), 0))
  const grossProfit = r2(real.reduce((s, inv) => s + invoiceNetProfit(inv), 0))
  const purchasesGross = r2(purchases.reduce((s, p) => s + (Number(p.totalAmount) || 0), 0))
  const purchaseReturns = r2(purchases.reduce((s, p) => s + (Number(p.returnedAmount) || 0), 0))
  const purchasesNet = r2(Math.max(0, purchasesGross - purchaseReturns))
  const expensesTotal = r2(expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0))
  const collections = r2(payments.filter((p) => (Number(p.amount) || 0) > 0).reduce((s, p) => s + p.amount, 0))
  const customersDebt = r2(customers.reduce((s, c) => s + (Number(c.totalDebt) || 0), 0))
  const suppliersDebt = r2(
    purchases.reduce(
      (s, p) => s + (p.debtAmount !== undefined || p.paidAmount !== undefined ? Number(p.debtAmount) || 0 : 0),
      0,
    ),
  )

  return {
    salesGross,
    salesReturns,
    salesNet,
    grossProfit,
    purchasesGross,
    purchaseReturns,
    purchasesNet,
    expenses: expensesTotal,
    netProfit: r2(grossProfit - expensesTotal),
    collections,
    customersDebt,
    suppliersDebt,
    walletsTotal: r2(balances.total),
  }
}

export function summaryRows(snap: FinancialSnapshot): XlsxCell[][] {
  return [
    ['البند', 'القيمة'],
    ['إجمالي المبيعات (خام)', snap.salesGross],
    ['مرتجعات البيع', snap.salesReturns],
    ['صافي المبيعات', snap.salesNet],
    ['تكلفة البضاعة المبيعة + المرتجعات', r2(snap.salesNet - snap.grossProfit)],
    ['إجمالي الربح', snap.grossProfit],
    ['إجمالي المشتريات (خام)', snap.purchasesGross],
    ['مرتجعات الشراء', snap.purchaseReturns],
    ['صافي المشتريات', snap.purchasesNet],
    ['المصاريف', snap.expenses],
    ['صافي الربح', snap.netProfit],
    ['تحصيلات العملاء (نقدي)', snap.collections],
    ['ديون العملاء المستحقة', snap.customersDebt],
    ['مستحقات الموردين', snap.suppliersDebt],
    ['إجمالي أرصدة المحافظ', snap.walletsTotal],
  ]
}

// ─────────────────────────────────────────────
// بناء الملفات
// ─────────────────────────────────────────────

function stamp(range?: ExportRange): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (range?.from || range?.to) {
    return `${range?.from ? fmt(range.from) : 'start'}_${range?.to ? fmt(range.to) : 'now'}`
  }
  return fmt(new Date())
}

/** ملف تصدير فواتير البيع (فواتير + أصناف + مرتجعات بيع). */
export function exportSalesExcel(invoices: Invoice[], range?: ExportRange): void {
  const list = invoices.filter((inv) => isRealSale(inv) && inRange(inv.createdAt, range))
  downloadXlsx(`المبيعات-التفصيلي-${stamp(range)}-${list.length}.xlsx`, [
    { name: 'فواتير البيع', rows: salesInvoiceRows(list), columnWidths: [10, 20, 22, 10, 14, 12, 12, 12, 12, 12, 12, 12, 12, 30] },
    { name: 'أصناف المبيعات', rows: salesItemRows(list), columnWidths: [10, 20, 20, 26, 12, 10, 14, 10, 10, 10, 12, 12, 18] },
    { name: 'مرتجعات البيع', rows: salesReturnRows(list), columnWidths: [10, 20, 20, 26, 10, 10, 10, 14, 16, 26] },
  ])
}

/** ملف تصدير المشتريات (فواتير + أصناف مع العبوات + مرتجعات + دفعات الموردين). */
export function exportPurchasesExcel(purchases: Purchase[], range?: ExportRange): void {
  const list = purchases.filter((p) => inRange(p.date, range))
  downloadXlsx(`المشتريات-التفصيلي-${stamp(range)}-${list.length}.xlsx`, [
    { name: 'فواتير الشراء', rows: purchaseInvoiceRows(list), columnWidths: [10, 14, 22, 16, 12, 14, 14, 12, 12, 12, 12, 30] },
    { name: 'أصناف المشتريات', rows: purchaseItemRows(list), columnWidths: [10, 14, 22, 26, 14, 10, 12, 14, 12, 16, 12, 12, 12] },
    { name: 'مرتجعات الشراء', rows: purchaseReturnRows(list), columnWidths: [10, 14, 22, 26, 10, 10, 12, 14, 16, 26] },
    { name: 'دفعات الموردين', rows: supplierPaymentRows(list), columnWidths: [6, 14, 22, 16, 12, 14, 30] },
  ])
}

/** ملف تصدير المرتجعات (بيع + شراء). */
export function exportReturnsExcel(invoices: Invoice[], purchases: Purchase[]): void {
  downloadXlsx(`المرتجعات-التفصيلي-${stamp()}.xlsx`, [
    { name: 'مرتجعات البيع', rows: salesReturnRows(invoices), columnWidths: [10, 20, 20, 26, 10, 10, 10, 14, 16, 26] },
    { name: 'مرتجعات الشراء', rows: purchaseReturnRows(purchases), columnWidths: [10, 14, 22, 26, 10, 10, 12, 14, 16, 26] },
  ])
}

interface FullData {
  invoices: Invoice[]
  purchases: Purchase[]
  payments: Payment[]
  expenses: Expense[]
  transfers: WalletTransfer[]
  productions: Production[]
  customers: Customer[]
  balances: AccountBalances
}

async function loadFullData(): Promise<FullData> {
  const [invoices, purchases, payments, expenses, transfers, productions, customers, openingSetting, adjustmentsSetting] =
    await Promise.all([
      db.invoices.toArray(),
      db.purchases.toArray(),
      db.payments.toArray(),
      db.expenses.toArray(),
      db.transfers.toArray(),
      db.productions.toArray(),
      db.customers.toArray(),
      db.settings.get('wallet_opening_balances'),
      db.settings.get('wallet_adjustments'),
    ])

  const balances = computeBalances(
    payments,
    purchases,
    expenses,
    transfers,
    openingSetting?.value as import('./wallet').OpeningBalances | undefined,
    parseAdjustments(adjustmentsSetting?.value),
  )

  return { invoices, purchases, payments, expenses, transfers, productions, customers, balances }
}

/** كل الأوراق التفصيلية من بيانات جاهزة. */
export function buildFullWorkbook(data: FullData, range?: ExportRange): XlsxSheet[] {
  const invoices = data.invoices.filter((inv) => inRange(inv.createdAt, range))
  const purchases = data.purchases.filter((p) => inRange(p.date, range))
  const expenses = data.expenses.filter((e) => inRange(e.date, range))
  const transfers = data.transfers.filter((t) => inRange(t.date, range))
  const productions = data.productions.filter((p) => inRange(p.date, range))
  // الدفعات والحركات المالية تُفلتر أيضاً بنفس الفترة
  const payments = data.payments.filter((p) => inRange(p.createdAt, range))

  const snap = computeSnapshot(invoices, purchases, payments, expenses, data.customers, data.balances)

  return [
    { name: 'ملخص مالي', rows: summaryRows(snap), columnWidths: [40, 16] },
    { name: 'فواتير البيع', rows: salesInvoiceRows(invoices), columnWidths: [10, 20, 22, 10, 14, 12, 12, 12, 12, 12, 12, 12, 12, 30] },
    { name: 'أصناف المبيعات', rows: salesItemRows(invoices), columnWidths: [10, 20, 20, 26, 12, 10, 14, 10, 10, 10, 12, 12, 18] },
    { name: 'مرتجعات البيع', rows: salesReturnRows(invoices), columnWidths: [10, 20, 20, 26, 10, 10, 10, 14, 16, 26] },
    { name: 'فواتير الشراء', rows: purchaseInvoiceRows(purchases), columnWidths: [10, 14, 22, 16, 12, 14, 14, 12, 12, 12, 12, 30] },
    { name: 'أصناف المشتريات', rows: purchaseItemRows(purchases), columnWidths: [10, 14, 22, 26, 14, 10, 12, 14, 12, 16, 12, 12, 12] },
    { name: 'مرتجعات الشراء', rows: purchaseReturnRows(purchases), columnWidths: [10, 14, 22, 26, 10, 10, 12, 14, 16, 26] },
    { name: 'دفعات العملاء', rows: customerPaymentRows(payments, data.customers), columnWidths: [6, 20, 22, 12, 12, 14, 14, 30] },
    { name: 'دفعات الموردين', rows: supplierPaymentRows(purchases), columnWidths: [6, 14, 22, 16, 12, 14, 30] },
    { name: 'المصاريف', rows: expenseRows(expenses), columnWidths: [6, 14, 26, 14, 12, 14, 30] },
    { name: 'التحويلات', rows: transferRows(transfers), columnWidths: [6, 20, 18, 18, 12, 30] },
    { name: 'الإنتاج', rows: productionRows(productions), columnWidths: [6, 14, 22, 14, 14, 14, 14] },
    { name: 'أرصدة العملاء', rows: customerBalanceRows(data.customers), columnWidths: [6, 24, 16, 14, 14] },
    { name: 'أرصدة الموردين', rows: supplierBalanceRows(data.purchases), columnWidths: [6, 24, 12, 14, 14, 14, 14] },
    { name: 'أرصدة المحافظ', rows: walletBalanceRows(data.balances), columnWidths: [22, 16] },
  ]
}

/** يبني ويُنزّل التقرير الشامل التفصيلي. */
export async function exportFullExcel(range?: ExportRange): Promise<void> {
  const data = await loadFullData()
  const sheets = buildFullWorkbook(data, range)
  downloadXlsx(`التقرير-الشامل-${stamp(range)}.xlsx`, sheets)
}
