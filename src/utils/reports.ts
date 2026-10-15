/**
 * reports.ts — حسابات التقارير المالية النقية (بلا React/قاعدة بيانات).
 *
 * تُجمع المبيعات والأرباح هنا لأن المرتجعات يجب أن تنعكس مالياً في التقارير
 * تماماً كما تنعكس في الفاتورة والمخزون والمحفظة — فيبقى التطبيق مترابطاً.
 */
import type { Invoice } from '../db/db'
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
