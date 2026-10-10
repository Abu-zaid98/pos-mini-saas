import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  type Invoice,
  type InvoiceItem,
  type PaymentType,
  type PaymentMethod,
  type DiscountType,
  getPaymentMethodName,
} from '../db/db'
import { deductStock, getItemUnit, packPieces, computeInvoiceRestore, returnedLineBase } from '../utils/units'
import { computeBalances, parseAdjustments } from '../utils/wallet'
import { normalizeCustomerBalance } from './useCustomers'

export interface CreateSaleInput {
  customerId: number | null
  customerName?: string
  items: InvoiceItem[]
  subtotal: number
  discountType: DiscountType | null
  discountValue: number
  discountAmount: number
  /** مجموع خصومات الأصناف */
  itemDiscountAmount?: number
  total: number
  paidAmount: number
  debtAmount: number
  paymentType: PaymentType
  paymentMethod?: PaymentMethod
  note?: string
}

export function useInvoices(options?: {
  customerId?: number | null
  dateRange?: 'today' | 'week' | 'month' | 'all'
  limit?: number
}) {
  const invoices = useLiveQuery(async () => {
    let query = db.invoices.orderBy('id').reverse()
    let all = await query.toArray()

    if (options?.customerId !== undefined && options.customerId !== null) {
      all = all.filter((inv) => inv.customerId === options.customerId)
    }

    if (options?.dateRange && options.dateRange !== 'all') {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

      if (options.dateRange === 'today') {
        all = all.filter((inv) => new Date(inv.createdAt).getTime() >= startOfDay)
      } else if (options.dateRange === 'week') {
        const startOfWeek = startOfDay - 6 * 24 * 60 * 60 * 1000
        all = all.filter((inv) => new Date(inv.createdAt).getTime() >= startOfWeek)
      } else if (options.dateRange === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
        all = all.filter((inv) => new Date(inv.createdAt).getTime() >= startOfMonth)
      }
    }

    if (options?.limit && options.limit > 0) {
      all = all.slice(0, options.limit)
    }

    return all
  }, [options?.customerId, options?.dateRange, options?.limit])

  return invoices ?? []
}

export async function createSaleInvoice(data: CreateSaleInput): Promise<Invoice> {
  const now = new Date()

  return db.transaction('rw', [db.invoices, db.products, db.customers, db.payments], async () => {
    // 1. Decrement stock for inventory items (type-aware: pieces / grams / services skip)
    // goods sold by pack deduct qty × factor pieces
    for (const item of data.items) {
      if (item.productId > 0) {
        const product = await db.products.get(item.productId)
        if (product) {
          const qtyBase = item.pack ? packPieces(item.qty, item.pack) : item.qty
          const unit = item.pack ? 'piece' : getItemUnit(item)
          const newQty = deductStock(product, qtyBase, unit)
          await db.products.update(item.productId, {
            quantity: newQty,
            updatedAt: now,
          })
        }
      }
    }

    // 2. Insert Invoice
    const invoiceId = await db.invoices.add({
      customerId: data.customerId,
      customerName: data.customerName || undefined,
      items: data.items,
      subtotal: data.subtotal,
      discountType: data.discountType,
      discountValue: data.discountValue,
      discountAmount: data.discountAmount,
      itemDiscountAmount: data.itemDiscountAmount || 0,
      total: data.total,
      paidAmount: data.paidAmount,
      debtAmount: data.debtAmount,
      paymentType: data.paymentType,
      paymentMethod: data.paymentMethod || 'cash',
      note: data.note?.trim() || '',
      createdAt: now,
    })

    const createdInvoiceId = Number(invoiceId)

    // 3. Update customer debt if sale is on debt or partial.
    // يُستهلك الرصيد الدائن أولاً (عميل دفع زيادة سابقاً لا يُسجل عليه دين جديد قبل نفاد رصيده)
    if (data.customerId && data.debtAmount > 0) {
      const customer = await db.customers.get(data.customerId)
      if (customer) {
        const next = normalizeCustomerBalance(customer.totalDebt || 0, customer.creditBalance || 0, data.debtAmount)
        await db.customers.update(data.customerId, next)
      }
    }

    // 4. Record payment if money was received (cash/jawwal_pay/palpay/bop)
    if (data.paidAmount > 0) {
      const method = data.paymentMethod || 'cash'
      const methodName = getPaymentMethodName(method)
      await db.payments.add({
        customerId: data.customerId || 0,
        invoiceId: createdInvoiceId,
        amount: data.paidAmount,
        method,
        note: data.customerId
          ? `دفعة عبر ${methodName} لفاتورة #${createdInvoiceId}`
          : `بيع مباشر عبر ${methodName} #${createdInvoiceId}`,
        createdAt: now,
      })
    }

    return {
      ...data,
      id: createdInvoiceId,
      note: data.note?.trim() || '',
      createdAt: now,
    }
  })
}

export type { AccountBalances, OpeningBalances } from '../utils/wallet'

export function useAccountBalances() {
  const balances = useLiveQuery(async () => {
    const [payments, purchases, expenses, transfers, openingSetting, adjustmentsSetting] = await Promise.all([
      db.payments.toArray(),
      db.purchases.toArray(),
      db.expenses.toArray(),
      db.transfers.toArray(),
      db.settings.get('wallet_opening_balances'),
      db.settings.get('wallet_adjustments'),
    ])

    const openingBalances = openingSetting?.value as import('../utils/wallet').OpeningBalances | undefined

    // المعادلة: داخل (+) payments + أرصدة افتتاحية + تسويات إيداع،
    // خارج (−) purchases + expenses + تسويات سحب، مع أثر التحويلات بين المحافظ
    return computeBalances(payments, purchases, expenses, transfers, openingBalances, parseAdjustments(adjustmentsSetting?.value))
  }, [])

  return balances ?? { cash: 0, jawwal_pay: 0, palpay: 0, bop: 0, total: 0 }
}

export interface RefundItemInput {
  productId: number
  name: string
  qty: number
  unit?: import('../db/db').SaleUnit
  price: number
  refundAmount: number
  reason?: string
}

export interface ProcessRefundInput {
  invoiceId: number
  items: RefundItemInput[]
  refundMethod: 'cash' | 'debt'
  paymentMethod?: PaymentMethod
  note?: string
}

/**
 * معالجة مرتجع مبيعات (جزئي أو كلي) بدقة محاسبية ومخزنية:
 * 1. إعادة الأصناف المرتجعة للمخزون (مع مراعاة الوحدات والعبوات).
 * 2. التسوية المالية: إما خروج كاش من المحفظة (استرداد نقدي) أو تخفيض دين العميل.
 * 3. حفظ سجل المرتجع في الفاتورة مع التاريخ والسبب.
 */
export async function refundInvoiceItems(data: ProcessRefundInput): Promise<void> {
  if (!data.items || data.items.length === 0) {
    throw new Error('يرجى تحديد الأصناف المراد إرجاعها')
  }

  const now = new Date()

  return db.transaction('rw', [db.invoices, db.products, db.customers, db.payments], async () => {
    const invoice = await db.invoices.get(data.invoiceId)
    if (!invoice) throw new Error('الفاتورة غير موجودة')

    const totalRefundAmount = data.items.reduce((sum, it) => sum + (Number(it.refundAmount) || 0), 0)
    if (totalRefundAmount <= 0) throw new Error('مبلغ الاسترداد يجب أن يكون أكبر من صفر')

    // 1. إعادة البضاعة للمخزن — الكمية بوحدة البند المرتجع نفسه (موحدة عبر returnedLineBase)
    for (const item of data.items) {
      if (item.productId > 0) {
        const originalItem = invoice.items.find((i) => i.productId === item.productId)
        const product = await db.products.get(item.productId)
        if (product) {
          const qtyBase = returnedLineBase(item, originalItem)
          await db.products.update(item.productId, {
            quantity: Math.round((product.quantity + qtyBase) * 1000) / 1000,
            updatedAt: now,
          })
        }
      }
    }

    // 2. التسوية المالية
    if (data.refundMethod === 'debt') {
      // تخفيض من دين العميل
      if (invoice.customerId) {
        const customer = await db.customers.get(invoice.customerId)
        if (customer) {
          await db.customers.update(invoice.customerId, {
            totalDebt: Math.max(0, (customer.totalDebt || 0) - totalRefundAmount),
          })
        }
      }
      invoice.debtAmount = Math.max(0, (invoice.debtAmount || 0) - totalRefundAmount)
    } else {
      // استرداد نقدي من الصندوق / المحفظة
      const method = data.paymentMethod || invoice.paymentMethod || 'cash'
      const methodName = getPaymentMethodName(method)
      await db.payments.add({
        customerId: invoice.customerId || 0,
        invoiceId: invoice.id!,
        amount: -totalRefundAmount,
        method,
        note: `استرداد نقدي عبر ${methodName} لمرتجع فاتورة #${invoice.id}${data.note ? ` (${data.note})` : ''}`,
        createdAt: now,
      })
      invoice.paidAmount = Math.max(0, (invoice.paidAmount || 0) - totalRefundAmount)
    }

    // 3. تحديث الفاتورة وسجل المرتجعات
    const newReturns: import('../db/db').ReturnedItem[] = data.items.map((it) => ({
      productId: it.productId,
      name: it.name,
      qty: it.qty,
      unit: it.unit,
      price: it.price,
      refundAmount: it.refundAmount,
      refundMethod: data.refundMethod,
      reason: it.reason?.trim() || data.note?.trim() || '',
      date: now,
    }))

    const existingReturns = invoice.returnedItems || []
    const updatedReturns = [...existingReturns, ...newReturns]
    const updatedRefundedAmount = (invoice.refundedAmount || 0) + totalRefundAmount

    await db.invoices.update(data.invoiceId, {
      returnedItems: updatedReturns,
      refundedAmount: updatedRefundedAmount,
      paidAmount: invoice.paidAmount,
      debtAmount: invoice.debtAmount,
    })
  })
}

export async function deleteInvoice(invoiceId: number) {
  return db.transaction('rw', [db.invoices, db.products, db.customers, db.payments], async () => {
    const inv = await db.invoices.get(invoiceId)
    if (!inv) return

    // Revert product quantities (unit-aware, packs revert by factor),
    // مطروحاً منها ما سبق إرجاعه بمرتجعات — حتى لا يُستعاد نفس الصنف مرتين
    const restoreMap = computeInvoiceRestore(inv.items, inv.returnedItems)
    const restoredOnce = new Set<number>()
    for (const item of inv.items) {
      if (item.productId > 0 && !restoredOnce.has(item.productId)) {
        restoredOnce.add(item.productId)
        const product = await db.products.get(item.productId)
        const restoreBase = restoreMap.get(item.productId) || 0
        if (product && restoreBase > 0) {
          await db.products.update(item.productId, {
            quantity: Math.round((product.quantity + restoreBase) * 1000) / 1000,
            updatedAt: new Date(),
          })
        }
      }
    }

    // Revert customer debt. التحصيلات اللاحقة (سندات مستقلة) تبقى مدفوعات صحيحة،
    // فيتحول الفائض لرصيد دائن للعميل بدل تبخره — لا يُحذف دين سبق تحصيله
    if (inv.customerId && inv.debtAmount > 0) {
      const customer = await db.customers.get(inv.customerId)
      if (customer) {
        const next = normalizeCustomerBalance(customer.totalDebt || 0, customer.creditBalance || 0, -inv.debtAmount)
        await db.customers.update(inv.customerId, next)
      }
    }

    // Delete associated payments
    await db.payments.where('invoiceId').equals(invoiceId).delete()

    // Delete invoice
    await db.invoices.delete(invoiceId)
  })
}

export interface UpdateInvoiceInput {
  customerId: number | null
  customerName?: string
  paymentType: PaymentType
  paymentMethod?: PaymentMethod
  paidAmount: number
  note: string
}

/**
 * Updates the editable financial details of an invoice while keeping stock and
 * customer balances consistent. Item editing is intentionally kept in the sale
 * flow; it prevents accidental inventory changes from the invoice archive.
 */
export async function updateInvoiceDetails(invoiceId: number, data: UpdateInvoiceInput) {
  return db.transaction('rw', [db.invoices, db.customers, db.payments], async () => {
    const invoice = await db.invoices.get(invoiceId)
    if (!invoice) throw new Error('الفاتورة غير موجودة')

    // المقبوض لا يتجاوز المتبقي بعد المرتجعات — حتى لا يُحيي التعديل مبلغاً مسترداً
    const refunded = Math.max(0, Number(invoice.refundedAmount) || 0)
    const maxPaid = Math.max(0, invoice.total - refunded)
    const paidAmount = Math.min(maxPaid, Math.max(0, Number(data.paidAmount) || 0))
    const debtAmount = Math.max(0, invoice.total - paidAmount)

    if (debtAmount > 0 && !data.customerId) {
      throw new Error('اختر العميل عند وجود مبلغ متبقٍ كدين')
    }

    // Remove the old debt from its customer, then add the new debt to its customer.
    // بالفروقات عبر normalize حتى لا يضيع تحصيل لاحق أو رصيد دائن (انظر حذف الفاتورة)
    if (invoice.customerId && invoice.debtAmount > 0) {
      const oldCustomer = await db.customers.get(invoice.customerId)
      if (oldCustomer) {
        const next = normalizeCustomerBalance(oldCustomer.totalDebt || 0, oldCustomer.creditBalance || 0, -invoice.debtAmount)
        await db.customers.update(invoice.customerId, next)
      }
    }
    if (data.customerId && debtAmount > 0) {
      const newCustomer = await db.customers.get(data.customerId)
      if (!newCustomer) throw new Error('العميل غير موجود')
      const next = normalizeCustomerBalance(newCustomer.totalDebt || 0, newCustomer.creditBalance || 0, debtAmount)
      await db.customers.update(data.customerId, next)
    }

    // The payment that belongs to the original sale is replaced. Independent
    // collection receipts remain untouched — وكذلك دفعات المرتجع النقدي (السالبة
    // والتي تحوي "مرتجع") فحذفها يمحو أثر الاسترداد من المحفظة.
    const linkedPayments = await db.payments.where('invoiceId').equals(invoiceId).toArray()
    await Promise.all(linkedPayments
      .filter((payment) =>
        payment.amount > 0 &&
        !payment.note.includes('مرتجع') &&
        (payment.note.includes(`فاتورة #${invoiceId}`) || payment.note.includes(`#${invoiceId}`)))
      .map((payment) => db.payments.delete(payment.id!)))

    const method = data.paymentMethod || 'cash'
    if (paidAmount > 0) {
      await db.payments.add({
        customerId: data.customerId || 0,
        invoiceId,
        amount: paidAmount,
        method,
        note: data.customerId
          ? `دفعة عبر ${getPaymentMethodName(method)} لفاتورة #${invoiceId}`
          : `بيع مباشر عبر ${getPaymentMethodName(method)} #${invoiceId}`,
        createdAt: invoice.createdAt,
      })
    }

    await db.invoices.update(invoiceId, {
      customerId: data.customerId,
      customerName: data.customerName || undefined,
      paymentType: data.paymentType,
      paymentMethod: method,
      paidAmount,
      debtAmount,
      note: data.note.trim(),
    })
  })
}
