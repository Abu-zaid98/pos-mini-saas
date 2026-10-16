/**
 * reports.ts — حسابات التقارير المالية النقية (بلا React/قاعدة بيانات).
 *
 * تُجمع المبيعات والأرباح هنا لأن المرتجعات يجب أن تنعكس مالياً في التقارير
 * تماماً كما تنعكس في الفاتورة والمخزون والمحفظة — فيبقى التطبيق مترابطاً.
 */
import type { Invoice, Purchase } from '../db/db'
import { lineDiscountAmount } from './units'

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100

/**
 * صافي إيراد الفاتورة بعد استبعاد المرتجعات (لا يقل عن صفر).
 * `total` يبقى إجمالي الفاتورة الأصلية، و`refundedAmount` مجموع ما أُرجع منها.
 */
export function invoiceNetRevenue(invoice: Invoice): number {
  return Math.max(0, round2((Number(invoice.total) || 0) - (Number(invoice.refundedAmount) || 0)))
}

/**
 * إجمالي ربح بضاعة الفاتورة على أساس الاستحقاق:
 *   (صافي البنود − التكلفة) − خصم الفاتورة − ربح البضاعة المُعادة
 * وربح البضاعة المُعادة = مبلغ الاسترداد − تكلفتها، فتُعاد تكلفتها للمخزون.
 * بدون مرتجعات تساوي: total − مجموع التكلفة.
 */
export function invoiceNetProfit(invoice: Invoice): number {
  const costByProduct = new Map<number, number>()
  let costAll = 0
  let totalNet = 0

  for (const item of invoice.items) {
    if (item.productId === 0) continue // قيود الديون/الرصيد الافتتاحي ليست بيعاً
    const cost = Number(item.costPrice) || 0
    costByProduct.set(item.productId, cost)
    costAll += cost * item.qty
    totalNet += item.qty * item.price - lineDiscountAmount(item)
  }

  const returnedMargin = (invoice.returnedItems || []).reduce((acc, ret) => {
    const unitCost = costByProduct.get(ret.productId) || 0
    return acc + (Number(ret.refundAmount) || 0) - unitCost * (Number(ret.qty) || 0)
  }, 0)

  return round2(totalNet - costAll - (invoice.discountAmount || 0) - returnedMargin)
}

// ─────────────────────────────────────────────
// ملخّص المرتجعات (بيع + شراء) — «صافي المرتجعات»
// ─────────────────────────────────────────────

/** فاتورة بيع حقيقية (ليست قيد دين يدوي/رصيد افتتاحي، وجميع بنودها وهمية). */
export function isRealSaleInvoice(invoice: Invoice): boolean {
  return !(invoice.items.length > 0 && invoice.items.every((i) => i.productId === 0))
}

/** إجمالي ما أُرجع من فواتير مبيعات (يستثني قيود الديون الوهمية). */
export function sumSalesReturns(invoices: Invoice[]): number {
  return round2(
    invoices
      .filter(isRealSaleInvoice)
      .reduce((s, inv) => s + (Number(inv.refundedAmount) || 0), 0),
  )
}

/** إجمالي ما أُرجع للموردين من فواتير شراء. */
export function sumPurchaseReturns(purchases: Purchase[]): number {
  return round2(purchases.reduce((s, p) => s + (Number(p.returnedAmount) || 0), 0))
}

/** صافي قيمة فاتورة الشراء بعد خصم المرتجعات (لا يقل عن صفر). */
export function purchaseNetTotal(purchase: Purchase): number {
  return Math.max(0, round2((Number(purchase.totalAmount) || 0) - (Number(purchase.returnedAmount) || 0)))
}

export interface ReturnsSummary {
  /** إجمالي المبيعات قبل المرتجعات */
  salesGross: number
  /** إجمالي مرتجعات البيع */
  salesReturns: number
  /** صافي المبيعات بعد المرتجعات */
  salesNet: number
  /** عدد الفواتير التي عليها مرتجعات */
  salesReturnCount: number
  /** إجمالي المشتريات قبل المرتجعات */
  purchasesGross: number
  /** إجمالي مرتجعات الشراء */
  purchaseReturns: number
  /** صافي المشتريات بعد المرتجعات */
  purchasesNet: number
  /** عدد فواتير الشراء التي عليها مرتجعات */
  purchaseReturnCount: number
}

/**
 * ملخّص موحّد للمرتجعات: يفصل الإجمالي الخام عن قيمة المرتجعات والصافي،
 * للبيع والشراء — فيظهر أثر المرتجعات بوضوح في التقارير.
 */
export function computeReturnsSummary(invoices: Invoice[], purchases: Purchase[]): ReturnsSummary {
  let salesGross = 0
  let salesReturns = 0
  let salesReturnCount = 0
  for (const inv of invoices) {
    if (!isRealSaleInvoice(inv)) continue
    salesGross += Number(inv.total) || 0
    const r = Number(inv.refundedAmount) || 0
    if (r > 0) salesReturnCount++
    salesReturns += r
  }

  let purchasesGross = 0
  let purchaseReturns = 0
  let purchaseReturnCount = 0
  for (const p of purchases) {
    purchasesGross += Number(p.totalAmount) || 0
    const r = Number(p.returnedAmount) || 0
    if (r > 0) purchaseReturnCount++
    purchaseReturns += r
  }

  return {
    salesGross: round2(salesGross),
    salesReturns: round2(salesReturns),
    salesNet: round2(Math.max(0, salesGross - salesReturns)),
    salesReturnCount,
    purchasesGross: round2(purchasesGross),
    purchaseReturns: round2(purchaseReturns),
    purchasesNet: round2(Math.max(0, purchasesGross - purchaseReturns)),
    purchaseReturnCount,
  }
}
