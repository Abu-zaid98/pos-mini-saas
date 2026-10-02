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
 * - If `forceDelete` is false (default) and the customer has outstanding debt,
 *   the function returns { blocked: true } instead of deleting.
 * - If `forceDelete` is true, deletes the customer along with all their invoices
 *   (reverting stock for each one) and all their payment records.
 */
export async function deleteCustomer(
  id: number,
  forceDelete = false
): Promise<{ blocked: true } | { blocked: false }> {
  return db.transaction('rw', [db.customers, db.invoices, db.products, db.payments], async () => {
    const customer = await db.customers.get(id)
    if (!customer) return { blocked: false }

    // Block deletion if the customer still has debt or an outstanding credit balance.
    const hasBalance = (customer.totalDebt || 0) > 0 || (customer.creditBalance || 0) > 0
    if (!forceDelete && hasBalance) {
      return { blocked: true }
    }

    // Delete all payments for this customer
    await db.payments.where('customerId').equals(id).delete()

    // Delete all invoices for this customer, reverting stock for real products
    const invoices = await db.invoices.where('customerId').equals(id).toArray()
    for (const inv of invoices) {
      if (!inv.id) continue
      // Revert stock only for actual products (productId > 0)
      for (const item of inv.items) {
        if (item.productId > 0) {
          const product = await db.products.get(item.productId)
          if (product) {
            await db.products.update(item.productId, {
              quantity: product.quantity + item.qty,
              updatedAt: new Date(),
            })
          }
        }
      }
      await db.invoices.delete(inv.id)
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
