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
import { deductStock, getItemUnit, packPieces, restoreStock } from '../utils/units'
import { computeBalances } from '../utils/wallet'

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

    // 3. Update customer debt if sale is on debt or partial
    if (data.customerId && data.debtAmount > 0) {
      const customer = await db.customers.get(data.customerId)
      if (customer) {
        await db.customers.update(data.customerId, {
          totalDebt: (customer.totalDebt || 0) + data.debtAmount,
        })
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

export type { AccountBalances } from '../utils/wallet'

export function useAccountBalances() {
  const balances = useLiveQuery(async () => {
    const [payments, purchases, expenses] = await Promise.all([
      db.payments.toArray(),
      db.purchases.toArray(),
      db.expenses.toArray(),
    ])

    // المعادلة الوحيدة: داخل (+) payments، خارج (−) purchases + expenses
    return computeBalances(payments, purchases, expenses)
  }, [])

  return balances ?? { cash: 0, jawwal_pay: 0, palpay: 0, bop: 0, total: 0 }
}

export async function deleteInvoice(invoiceId: number) {
  return db.transaction('rw', [db.invoices, db.products, db.customers, db.payments], async () => {
    const inv = await db.invoices.get(invoiceId)
    if (!inv) return

    // Revert product quantities (unit-aware, packs revert by factor)
    for (const item of inv.items) {
      if (item.productId > 0) {
        const product = await db.products.get(item.productId)
        if (product) {
          const qtyBase = item.pack ? packPieces(item.qty, item.pack) : item.qty
          const unit = item.pack ? 'piece' : getItemUnit(item)
          await db.products.update(item.productId, {
            quantity: restoreStock(product, qtyBase, unit),
            updatedAt: new Date(),
          })
        }
      }
    }

    // Revert customer debt
    if (inv.customerId && inv.debtAmount > 0) {
      const customer = await db.customers.get(inv.customerId)
      if (customer) {
        await db.customers.update(inv.customerId, {
          totalDebt: Math.max(0, (customer.totalDebt || 0) - inv.debtAmount),
        })
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

    const paidAmount = Math.min(invoice.total, Math.max(0, Number(data.paidAmount) || 0))
    const debtAmount = Math.max(0, invoice.total - paidAmount)

    if (debtAmount > 0 && !data.customerId) {
      throw new Error('اختر العميل عند وجود مبلغ متبقٍ كدين')
    }

    // Remove the old debt from its customer, then add the new debt to its customer.
    if (invoice.customerId && invoice.debtAmount > 0) {
      const oldCustomer = await db.customers.get(invoice.customerId)
      if (oldCustomer) {
        await db.customers.update(invoice.customerId, {
          totalDebt: Math.max(0, (oldCustomer.totalDebt || 0) - invoice.debtAmount),
        })
      }
    }
    if (data.customerId && debtAmount > 0) {
      const newCustomer = await db.customers.get(data.customerId)
      if (!newCustomer) throw new Error('العميل غير موجود')
      await db.customers.update(data.customerId, {
        totalDebt: (newCustomer.totalDebt || 0) + debtAmount,
      })
    }

    // The payment that belongs to the original sale is replaced. Independent
    // collection receipts remain untouched.
    const linkedPayments = await db.payments.where('invoiceId').equals(invoiceId).toArray()
    await Promise.all(linkedPayments
      .filter((payment) => payment.note.includes(`فاتورة #${invoiceId}`) || payment.note.includes(`#${invoiceId}`))
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
