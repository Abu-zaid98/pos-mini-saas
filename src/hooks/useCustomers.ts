import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Customer, type Payment, type Invoice, type PaymentMethod, getPaymentMethodName } from '../db/db'

export function useCustomers(searchTerm = '', filter: 'all' | 'debt' | 'settled' = 'all') {
  const customers = useLiveQuery(async () => {
    const all = await db.customers.toArray()

    return all.filter((c) => {
      const matchSearch =
        !searchTerm ||
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm)

      const matchFilter =
        filter === 'all'
          ? true
          : filter === 'debt'
          ? (c.totalDebt ?? 0) > 0
          : (c.totalDebt ?? 0) <= 0

      return matchSearch && matchFilter
    })
  }, [searchTerm, filter])

  return customers ?? []
}

export function normalizeCustomerBalance(currentDebt: number, currentCredit: number, delta: number) {
  const debt = Math.max(0, Number(currentDebt) || 0)
  const credit = Math.max(0, Number(currentCredit) || 0)

  if (delta > 0) {
    const usedCredit = Math.min(credit, delta)
    const remainingDebt = delta - usedCredit
    return {
      totalDebt: debt + remainingDebt,
      creditBalance: credit - usedCredit,
    }
  }

  const amountToApply = Math.abs(delta)
  if (amountToApply <= debt) {
    return {
      totalDebt: debt - amountToApply,
      creditBalance: credit,
    }
  }

  return {
    totalDebt: 0,
    creditBalance: credit + (amountToApply - debt),
  }
}

export async function addCustomer(data: { name: string; phone?: string; initialDebt?: number }): Promise<number> {
  const initialDebt = Number(data.initialDebt) || 0
  const customerId = await db.transaction('rw', [db.customers, db.invoices], async () => {
    const id = await db.customers.add({
      name: data.name.trim(),
      phone: data.phone?.trim() ?? '',
      totalDebt: initialDebt,
      creditBalance: 0,
      createdAt: new Date(),
    })

    if (initialDebt > 0) {
      await db.invoices.add({
        customerId: Number(id),
        customerName: data.name.trim(),
        items: [{
          productId: 0,
          name: 'رصيد دين افتتاحي سابـق',
          qty: 1,
          price: initialDebt,
          costPrice: 0,
        }],
        subtotal: initialDebt,
        discountType: null,
        discountValue: 0,
        discountAmount: 0,
        total: initialDebt,
        paidAmount: 0,
        debtAmount: initialDebt,
        paymentType: 'debt',
        note: 'رصيد افتتاحي سابق',
        createdAt: new Date(),
      })
    }

    return Number(id)
  })

  return customerId
}

export async function updateCustomer(id: number, data: Partial<Customer>) {
  return db.customers.update(id, data)
}

/** Add an off-invoice debt and retain it as a visible ledger entry. */
export async function addCustomerDebt(data: { customerId: number; amount: number; note?: string }) {
  const amount = Number(data.amount) || 0
  if (amount <= 0) throw new Error('أدخل مبلغ دين أكبر من صفر')

  return db.transaction('rw', [db.customers, db.invoices], async () => {
    const customer = await db.customers.get(data.customerId)
    if (!customer) throw new Error('العميل غير موجود')
    const note = data.note?.trim() || 'دين إضافي مسجل على الحساب'
    await db.invoices.add({
      customerId: data.customerId,
      customerName: customer.name,
      items: [{ productId: 0, name: note, qty: 1, price: amount, costPrice: 0 }],
      subtotal: amount,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      total: amount,
      paidAmount: 0,
      debtAmount: amount,
      paymentType: 'debt',
      note,
      createdAt: new Date(),
    })

    const nextBalance = normalizeCustomerBalance(customer.totalDebt || 0, customer.creditBalance || 0, amount)
    await db.customers.update(data.customerId, nextBalance)
  })
}

export async function getInitialDebt(customerId: number): Promise<number> {
  const invoice = await db.invoices.where('customerId').equals(customerId)
    .filter((item) => item.note === 'رصيد افتتاحي سابق').first()
  return invoice?.debtAmount || 0
}

/** Update only the original opening balance without affecting later sales or payments. */
export async function updateInitialDebt(customerId: number, amount: number) {
  const nextAmount = Math.max(0, Number(amount) || 0)
  return db.transaction('rw', [db.customers, db.invoices], async () => {
    const customer = await db.customers.get(customerId)
    if (!customer) throw new Error('العميل غير موجود')
    const invoice = await db.invoices.where('customerId').equals(customerId)
      .filter((item) => item.note === 'رصيد افتتاحي سابق').first()
    const previousAmount = invoice?.debtAmount || 0
    const difference = nextAmount - previousAmount

    if (invoice?.id) {
      await db.invoices.update(invoice.id, {
        items: [{ productId: 0, name: 'رصيد دين افتتاحي سابـق', qty: 1, price: nextAmount, costPrice: 0 }],
        subtotal: nextAmount, total: nextAmount, debtAmount: nextAmount,
      })
    } else if (nextAmount > 0) {
      await db.invoices.add({
        customerId,
        customerName: customer.name,
        items: [{ productId: 0, name: 'رصيد دين افتتاحي سابـق', qty: 1, price: nextAmount, costPrice: 0 }],
        subtotal: nextAmount, discountType: null, discountValue: 0, discountAmount: 0,
        total: nextAmount, paidAmount: 0, debtAmount: nextAmount, paymentType: 'debt',
        note: 'رصيد افتتاحي سابق', createdAt: new Date(),
      })
    }
    if (difference !== 0) {
      const nextBalance = normalizeCustomerBalance(customer.totalDebt || 0, customer.creditBalance || 0, difference)
      await db.customers.update(customerId, nextBalance)
    }
  })
}

/**
 * Delete a customer.
 * - If `forceDelete` is false (default) and the customer has outstanding debt
 *   or credit, the function returns { blocked: true } instead of deleting.
 * - If `forceDelete` is true with debt/credit, it throws: wiping a debtor
 *   would erase real obligations while keeping their sales — an accounting hole.
 *   Settle first (collect debt / clear credit), then delete.
 * - If `forceDelete` is true with zero balances, deletes while safely unlinking
 *   historical sales and payments so cash balances, inventory and reports stay intact.
 */
export async function deleteCustomer(
  id: number,
  forceDelete = false
): Promise<{ blocked: true; reason: string } | { blocked: false }> {
  return db.transaction('rw', [db.customers, db.invoices, db.payments], async () => {
    const customer = await db.customers.get(id)
    if (!customer) return { blocked: false }

    // Block deletion if the customer still has debt or an outstanding credit balance.
    const debt = customer.totalDebt || 0
    const credit = customer.creditBalance || 0
    if (!forceDelete && (debt > 0 || credit > 0)) {
      return {
        blocked: true,
        reason: debt > 0
          ? `لا يمكن الحذف: على العميل دين مستحق (${debt} ₪). حصّله أولاً ثم احذف.`
          : `لا يمكن الحذف: للعميل رصيد زائد (${credit} ₪). سوّه أولاً ثم احذف.`,
      }
    }
    if (forceDelete && (debt > 0 || credit > 0)) {
      throw new Error(
        debt > 0
          ? `تعذر الحذف: على العميل دين مستحق (${debt} ₪). حصّله أولاً من زر «سداد دفعة» ثم احذف العميل.`
          : `تعذر الحذف: للعميل رصيد زائد (${credit} ₪) مستحق له. سوّه أولاً ثم احذف.`
      )
    }

    // For invoices: preserve real historical sales records and warehouse inventory.
    // Unlink the customerId while preserving the customerName on the invoice.
    const invoices = await db.invoices.where('customerId').equals(id).toArray()
    for (const inv of invoices) {
      if (!inv.id) continue
      const isOnlyDebtEntry = inv.items.length > 0 && inv.items.every((it) => it.productId === 0)
      if (isOnlyDebtEntry) {
        // Remove dummy opening-debt invoices
        await db.invoices.delete(inv.id)
      } else {
        // Keep real sale invoice intact for historical accuracy, unlinking customerId
        await db.invoices.update(inv.id, {
          customerId: null,
          customerName: inv.customerName || customer.name,
        })
      }
    }

    // For payments: keep cash drawer payments intact to protect cash balance accuracy.
    const payments = await db.payments.where('customerId').equals(id).toArray()
    for (const p of payments) {
      if (p.id) {
        await db.payments.update(p.id, {
          customerId: 0,
        })
      }
    }

    // Delete the customer record itself
    await db.customers.delete(id)
    return { blocked: false }
  })
}

export interface CustomerLedgerItem {
  id: string
  date: Date
  type: 'invoice' | 'payment'
  title: string
  amount: number
  paid: number
  debt: number
  note?: string
  invoice?: Invoice
  payment?: Payment
}

export async function getCustomerLedger(customerId: number): Promise<CustomerLedgerItem[]> {
  const [invoices, payments] = await Promise.all([
    db.invoices.where('customerId').equals(customerId).toArray(),
    db.payments.where('customerId').equals(customerId).toArray(),
  ])

  const ledger: CustomerLedgerItem[] = []

  for (const inv of invoices) {
    ledger.push({
      id: `inv-${inv.id}`,
      date: new Date(inv.createdAt),
      type: 'invoice',
      title: `فاتورة #${inv.id}`,
      amount: inv.total,
      paid: inv.paidAmount,
      debt: inv.debtAmount,
      note: inv.note,
      invoice: inv,
    })
  }

  for (const p of payments) {
    ledger.push({
      id: `pay-${p.id}`,
      date: new Date(p.createdAt),
      type: 'payment',
      title: 'سند قبض / سداد دفعة',
      amount: p.amount,
      paid: p.amount,
      debt: 0,
      note: p.note,
      payment: p,
    })
  }

  return ledger.sort((a, b) => b.date.getTime() - a.date.getTime())
}

export async function recordPayment(data: {
  customerId: number
  amount: number
  method?: PaymentMethod
  note?: string
  invoiceId?: number | null
}) {
  const { customerId, amount, method = 'cash', note, invoiceId = null } = data
  if (amount <= 0) return

  return db.transaction('rw', [db.customers, db.payments], async () => {
    const customer = await db.customers.get(customerId)
    if (!customer) throw new Error('Customer not found')

    const nextBalance = normalizeCustomerBalance(customer.totalDebt || 0, customer.creditBalance || 0, -amount)
    await db.customers.update(customerId, nextBalance)

    const methodName = getPaymentMethodName(method)
    await db.payments.add({
      customerId,
      invoiceId,
      amount,
      method,
      note: note?.trim() || `سداد دفعة عبر ${methodName}`,
      createdAt: new Date(),
    })
  })
}

/**
 * حذف سند قبض مستقل (تحصيل دين — invoiceId فارغ) مع عكس أثره على دين العميل.
 * دفعات البيع المرتبطة بفاتورة تُحذف فقط عبر حذف الفاتورة كاملة (deleteInvoice)
 * حتى لا ينكسر تطابق paidAmount/debtAmount مع الفاتورة.
 */
export async function deleteCollectionPayment(paymentId: number) {
  return db.transaction('rw', [db.customers, db.payments], async () => {
    const payment = await db.payments.get(paymentId)
    if (!payment) return
    if (payment.invoiceId) {
      throw new Error('دفعة بيع مرتبطة بفاتورة — احذف الفاتورة كاملة من سجل الفواتير')
    }
    const customer = await db.customers.get(payment.customerId)
    if (customer) {
      const nextBalance = normalizeCustomerBalance(customer.totalDebt || 0, customer.creditBalance || 0, Number(payment.amount) || 0)
      await db.customers.update(payment.customerId, nextBalance)
    }
    await db.payments.delete(paymentId)
  })
}
