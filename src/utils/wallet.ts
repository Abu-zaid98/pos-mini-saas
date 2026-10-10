import type { Payment, Purchase, Expense, PaymentMethod } from '../db/db'

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

/**
 * معادلة الأرصدة الوحيدة في البرنامج:
 * الداخل (+) = payments (مبيعات + تحصيلات)
 * الخارج (−) = purchases (توريد) + expenses (مصاريف)
 * أي مصروف يُطرح دائماً — لا يجوز أن يرفع رصيداً أبداً.
 */
export function computeBalances(
  payments: Pick<Payment, 'amount' | 'method'>[],
  purchases: Pick<Purchase, 'totalAmount' | 'paymentMethod'>[],
  expenses: Pick<Expense, 'amount' | 'paymentMethod'>[],
): AccountBalances {
  const b = emptyBalances()
  for (const p of payments) addToBucket(b, methodOf(p.method), Number(p.amount) || 0)
  for (const pur of purchases) addToBucket(b, methodOf(pur.paymentMethod), -(Number(pur.totalAmount) || 0))
  for (const exp of expenses) addToBucket(b, methodOf(exp.paymentMethod), -(Number(exp.amount) || 0))
  b.cash = Math.round(b.cash * 100) / 100
  b.jawwal_pay = Math.round(b.jawwal_pay * 100) / 100
  b.palpay = Math.round(b.palpay * 100) / 100
  b.bop = Math.round(b.bop * 100) / 100
  b.total = Math.round(b.total * 100) / 100
  return b
}

export type WalletEntrySource = 'sale' | 'collection' | 'purchase' | 'expense'

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
 * يبني كشف حركة محفظة واحدة (داخل/خارج + رصيد جارٍ) من الجداول الثلاثة.
 * نفس معادلة useAccountBalances: الداخل = payments، والخارج = purchases + expenses.
 */
export function buildWalletLedger(
  payments: Payment[],
  purchases: Purchase[],
  expenses: Expense[],
  method: PaymentMethod,
): { entries: WalletEntryWithRunning[]; totalIn: number; totalOut: number; net: number } {
  const entries: WalletEntry[] = []

  for (const p of payments) {
    if (methodOf(p.method) !== method) continue
    const amt = Number(p.amount) || 0
    if (p.invoiceId) {
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
    if (methodOf(pur.paymentMethod) !== method) continue
    entries.push({
      key: `pur-${pur.id}`,
      dateMs: new Date(pur.date).getTime(),
      date: new Date(pur.date),
      kind: 'out',
      source: 'purchase',
      title: pur.supplierName?.trim() ? `توريد: ${pur.supplierName}` : 'فاتورة توريد',
      sub: pur.invoiceNumber?.trim() ? `رقم الفاتورة: ${pur.invoiceNumber}` : `${pur.items.length} صنف`,
      amount: Number(pur.totalAmount) || 0,
      refId: Number(pur.id),
    })
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
