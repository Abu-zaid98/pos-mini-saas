import {
  db,
  type Payment,
  type Purchase,
  type Expense,
  type WalletTransfer,
  type PaymentMethod,
  getPaymentMethodName,
} from '../db/db'

export interface AccountBalances {
  cash: number
  jawwal_pay: number
  palpay: number
  bop: number
  total: number
}

function emptyBalances(): AccountBalances {
  return { cash: 0, jawwal_pay: 0, palpay: 0, bop: 0, total: 0 }
}

function methodOf(m: PaymentMethod | undefined): PaymentMethod {
  return m || 'cash'
}

function addToBucket(b: AccountBalances, method: PaymentMethod, amt: number) {
  if (method === 'jawwal_pay') b.jawwal_pay += amt
  else if (method === 'palpay') b.palpay += amt
  else if (method === 'bop') b.bop += amt
  else b.cash += amt
  b.total += amt
}

function adjustBucketOnly(b: AccountBalances, method: PaymentMethod, amt: number) {
  if (method === 'jawwal_pay') b.jawwal_pay += amt
  else if (method === 'palpay') b.palpay += amt
  else if (method === 'bop') b.bop += amt
  else b.cash += amt
}

export type OpeningBalances = Partial<Record<PaymentMethod, number>>

/**
 * معادلة الأرصدة في البرنامج:
 * الداخل (+) = payments (مبيعات + تحصيلات) + الرصيد الافتتاحي
 * الخارج (−) = purchases (مدفوعات التوريد) + expenses (مصاريف)
 * التحويلات = نقل رصيد بين الصناديق (تغير رصيد المحفظتين مع بقاء الإجمالي الكلي ثابتاً).
 */
export function computeBalances(
  payments: Pick<Payment, 'amount' | 'method'>[],
  purchases: Pick<Purchase, 'totalAmount' | 'paidAmount' | 'paymentMethod' | 'supplierPayments'>[],
  expenses: Pick<Expense, 'amount' | 'paymentMethod'>[],
  transfers?: Pick<WalletTransfer, 'fromMethod' | 'toMethod' | 'amount'>[],
  openingBalances?: OpeningBalances,
): AccountBalances {
  const b = emptyBalances()

  // إضافة الأرصدة الافتتاحية إن وُجدت
  if (openingBalances) {
    for (const [m, amt] of Object.entries(openingBalances)) {
      if (amt) addToBucket(b, methodOf(m as PaymentMethod), Number(amt) || 0)
    }
  }

  for (const p of payments) addToBucket(b, methodOf(p.method), Number(p.amount) || 0)

  for (const pur of purchases) {
    if (pur.supplierPayments && pur.supplierPayments.length > 0) {
      for (const sp of pur.supplierPayments) {
        addToBucket(b, methodOf(sp.paymentMethod), -(Number(sp.amount) || 0))
      }
    } else {
      const paid = pur.paidAmount !== undefined ? Number(pur.paidAmount) || 0 : Number(pur.totalAmount) || 0
      addToBucket(b, methodOf(pur.paymentMethod), -paid)
    }
  }

  for (const exp of expenses) addToBucket(b, methodOf(exp.paymentMethod), -(Number(exp.amount) || 0))

  if (transfers) {
    for (const t of transfers) {
      const amt = Number(t.amount) || 0
      if (amt <= 0) continue
      adjustBucketOnly(b, methodOf(t.fromMethod), -amt)
      adjustBucketOnly(b, methodOf(t.toMethod), amt)
    }
  }

  b.cash = Math.round(b.cash * 100) / 100
  b.jawwal_pay = Math.round(b.jawwal_pay * 100) / 100
  b.palpay = Math.round(b.palpay * 100) / 100
  b.bop = Math.round(b.bop * 100) / 100
  b.total = Math.round(b.total * 100) / 100
  return b
}

export type WalletEntrySource = 'sale' | 'collection' | 'purchase' | 'expense' | 'transfer' | 'refund' | 'opening'

export interface WalletEntry {
  key: string
  /** التاريخ بالمللي ثانية — للترتيب */
  dateMs: number
  date: Date
  kind: 'in' | 'out'
  source: WalletEntrySource
  title: string
  sub?: string
  amount: number
  /** id السجل الأصلي في جدوله */
  refId: number
  /** لل alien linked sales */
  invoiceId?: number | null
}

/**
 * يبني كشف حركة محفظة واحدة (داخل/خارج + رصيد جارٍ) من الجداول.
 * نفس معادلة useAccountBalances: الداخل = payments + الرصيد الافتتاحي، والخارج = purchases (مدفوعات التوريد) + expenses.
 */
export function buildWalletLedger(
  payments: Payment[],
  purchases: Purchase[],
  expenses: Expense[],
  method: PaymentMethod,
  transfers: WalletTransfer[] = [],
  openingBalance: number = 0,
): { entries: WalletEntryWithRunning[]; totalIn: number; totalOut: number; net: number } {
  const entries: WalletEntry[] = []

  // بند الرصيد الافتتاحي إن وُجد
  if (openingBalance > 0) {
    entries.push({
      key: 'opening-balance',
      dateMs: 0,
      date: new Date(0),
      kind: 'in',
      source: 'opening',
      title: 'رصيد افتتاحي (رأس مال أولي)',
      amount: openingBalance,
      refId: 0,
    })
  }

  for (const p of payments) {
    if (methodOf(p.method) !== method) continue
    const amt = Number(p.amount) || 0
    if (amt < 0) {
      // حركة استرداد نقدي (خارج من الصندوق)
      entries.push({
        key: `pay-ref-${p.id}`,
        dateMs: new Date(p.createdAt).getTime(),
        date: new Date(p.createdAt),
        kind: 'out',
        source: 'refund',
        title: p.invoiceId ? `استرداد نقدي لفاتورة #${p.invoiceId}` : 'استرداد نقدي',
        sub: p.note || undefined,
        amount: Math.abs(amt),
        refId: Number(p.id),
        invoiceId: p.invoiceId,
      })
    } else if (p.invoiceId) {
      entries.push({
        key: `pay-${p.id}`,
        dateMs: new Date(p.createdAt).getTime(),
        date: new Date(p.createdAt),
        kind: 'in',
        source: 'sale',
        title: `بيع فاتورة #${p.invoiceId}`,
        sub: p.note || undefined,
        amount: amt,
        refId: Number(p.id),
        invoiceId: p.invoiceId,
      })
    } else {
      entries.push({
        key: `pay-${p.id}`,
        dateMs: new Date(p.createdAt).getTime(),
        date: new Date(p.createdAt),
        kind: 'in',
        source: 'collection',
        title: 'سند قبض / تحصيل دين',
        sub: p.note || undefined,
        amount: amt,
        refId: Number(p.id),
        invoiceId: null,
      })
    }
  }

  for (const pur of purchases) {
    if (pur.supplierPayments && pur.supplierPayments.length > 0) {
      pur.supplierPayments.forEach((sp, idx) => {
        if (methodOf(sp.paymentMethod) !== method) return
        const amt = Number(sp.amount) || 0
        if (amt <= 0) return
        const date = new Date(sp.date)
        entries.push({
          key: `pur-sp-${pur.id}-${idx}`,
          dateMs: date.getTime(),
          date,
          kind: 'out',
          source: 'purchase',
          title: pur.supplierName?.trim() ? `شراء: ${pur.supplierName}` : 'دفعة شراء',
          sub: sp.notes || (pur.invoiceNumber ? `فاتورة #${pur.invoiceNumber}` : 'سداد دفعة للمورد'),
          amount: amt,
          refId: Number(pur.id),
        })
      })
    } else {
      if (methodOf(pur.paymentMethod) !== method) continue
      const paid = pur.paidAmount !== undefined ? Number(pur.paidAmount) || 0 : Number(pur.totalAmount) || 0
      if (paid <= 0) continue // توريد آجل بالكامل (بلا خروج نقدي فوري)
      entries.push({
        key: `pur-${pur.id}`,
        dateMs: new Date(pur.date).getTime(),
        date: new Date(pur.date),
        kind: 'out',
        source: 'purchase',
        title: pur.supplierName?.trim() ? `شراء: ${pur.supplierName}` : 'فاتورة شراء',
        sub: pur.debtAmount && pur.debtAmount > 0
          ? `مدفوع ${paid} ₪ (متبقٍ دين ${pur.debtAmount} ₪)`
          : (pur.invoiceNumber?.trim() ? `رقم الفاتورة: ${pur.invoiceNumber}` : `${pur.items.length} صنف`),
        amount: paid,
        refId: Number(pur.id),
      })
    }
  }

  for (const exp of expenses) {
    if (methodOf(exp.paymentMethod) !== method) continue
    entries.push({
      key: `exp-${exp.id}`,
      dateMs: new Date(exp.date).getTime(),
      date: new Date(exp.date),
      kind: 'out',
      source: 'expense',
      title: exp.title,
      sub: exp.category,
      amount: Number(exp.amount) || 0,
      refId: Number(exp.id),
    })
  }

  for (const t of transfers) {
    const amt = Number(t.amount) || 0
    if (amt <= 0) continue
    const date = t.date ? new Date(t.date) : new Date(t.createdAt)
    const dateMs = date.getTime()

    if (methodOf(t.fromMethod) === method) {
      entries.push({
        key: `tr-out-${t.id}`,
        dateMs,
        date,
        kind: 'out',
        source: 'transfer',
        title: `تحويل إلى ${getPaymentMethodName(t.toMethod)}`,
        sub: t.notes || undefined,
        amount: amt,
        refId: Number(t.id),
      })
    }

    if (methodOf(t.toMethod) === method) {
      entries.push({
        key: `tr-in-${t.id}`,
        dateMs,
        date,
        kind: 'in',
        source: 'transfer',
        title: `تحويل من ${getPaymentMethodName(t.fromMethod)}`,
        sub: t.notes || undefined,
        amount: amt,
        refId: Number(t.id),
      })
    }
  }

  entries.sort((a, b) => a.dateMs - b.dateMs || (a.key < b.key ? -1 : 1))

  let running = 0
  const withRunning = entries.map((e) => {
    running = Math.round((running + (e.kind === 'in' ? e.amount : -e.amount)) * 100) / 100
    return { ...e, running }
  })

  const totalIn = Math.round(entries.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0) * 100) / 100
  const totalOut = Math.round(entries.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0) * 100) / 100

  return { entries: withRunning, totalIn, totalOut, net: Math.round((totalIn - totalOut) * 100) / 100 }
}

export interface WalletEntryWithRunning extends WalletEntry {
  running: number
}

export async function addWalletTransfer(data: {
  fromMethod: PaymentMethod
  toMethod: PaymentMethod
  amount: number
  notes?: string
  date?: Date
}): Promise<number> {
  const amount = Number(data.amount) || 0
  if (amount <= 0) throw new Error('مبلغ التحويل يجب أن يكون أكبر من صفر')
  if (data.fromMethod === data.toMethod) throw new Error('لا يمكن التحويل لنفس المحفظة')

  const now = data.date || new Date()
  const id = await db.transfers.add({
    fromMethod: data.fromMethod,
    toMethod: data.toMethod,
    amount,
    notes: data.notes?.trim() || '',
    date: now,
    createdAt: new Date(),
  })
  return Number(id)
}

export async function deleteWalletTransfer(id: number): Promise<void> {
  await db.transfers.delete(id)
}
