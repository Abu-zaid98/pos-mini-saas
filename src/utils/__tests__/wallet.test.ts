/**
 * wallet.test.ts — كشف حركة المحفظة: نفس معادلة الأرصدة + رصيد جارٍ مرتب زمنياً
 */
import { describe, it, expect } from 'vitest'
import { buildWalletLedger, computeBalances } from '../wallet'
import type { Payment } from '../../db/db'

const D = (s: string) => new Date(s)

function pay(over: Partial<Payment> = {}): Payment {
  return {
    id: 1, customerId: 0, invoiceId: 1, amount: 100, method: 'cash',
    note: '', createdAt: D('2026-10-05T10:00:00'),
    ...over,
  }
}

describe('buildWalletLedger', () => {
  it('يجمع الداخل والخارج لنفس المحفظة ويتجاهل غيرها', () => {
    const { totalIn, totalOut, net } = buildWalletLedger(
      [
        pay({ id: 1, amount: 5000, invoiceId: 7 }),
        pay({ id: 2, amount: 300, invoiceId: null, note: 'سداد' }),
        pay({ id: 3, amount: 999, method: 'jawwal_pay', invoiceId: 8 }),
      ],
      [],
      [{ id: 1, title: 'إيجار', category: 'إيجار المحل', amount: 2000, date: D('2026-10-06'), paymentMethod: 'cash', createdAt: D('2026-10-06') }],
      'cash',
    )
    expect(totalIn).toBe(5300)
    expect(totalOut).toBe(2000)
    expect(net).toBe(3300) // موجب لأنه رصيد متبقٍ — وليس خطأ
  })

  it('يرتب زمنياً ويحسب الرصيد الجاري', () => {
    const { entries } = buildWalletLedger(
      [pay({ id: 1, amount: 5000, createdAt: D('2026-10-05T10:00:00') })],
      [{ id: 1, supplierName: 'مورد', items: [], totalAmount: 1200, paymentMethod: 'cash', date: D('2026-10-04T10:00:00'), createdAt: D('2026-10-04T10:00:00') }],
      [{ id: 1, title: 'إيجار', category: 'x', amount: 2000, date: D('2026-10-06T10:00:00'), paymentMethod: 'cash', createdAt: D('2026-10-06T10:00:00') }],
      'cash',
    )
    expect(entries.map((e) => e.source)).toEqual(['purchase', 'sale', 'expense'])
    expect(entries.map((e) => e.running)).toEqual([-1200, 3800, 1800])
  })

  it('يميز دفعة البيع عن سند التحصيل', () => {
    const { entries } = buildWalletLedger(
      [pay({ id: 1, invoiceId: 9, amount: 100 }), pay({ id: 2, invoiceId: null, amount: 50 })],
      [], [],
      'cash',
    )
    expect(entries.find((e) => e.refId === 1)?.source).toBe('sale')
    expect(entries.find((e) => e.refId === 2)?.source).toBe('collection')
  })

  it('السجلات بلا طريقة دفع تُعامل كاش', () => {
    const p = pay({ id: 1, amount: 100 })
    delete (p as { method?: unknown }).method
    const { totalIn } = buildWalletLedger([p], [], [], 'cash')
    expect(totalIn).toBe(100)
  })

  it('محفظة فارغة = أصفار', () => {
    expect(buildWalletLedger([], [], [], 'bop')).toEqual({ entries: [], totalIn: 0, totalOut: 0, net: 0 })
  })
})

describe('computeBalances — انحدار: المصروف يُطرح دائماً', () => {
  it('رصيد 400 + مصروف 2000 = -1600 (وليس 2400)', () => {
    const b = computeBalances(
      [{ amount: 400, method: 'cash' }],
      [],
      [{ amount: 2000, paymentMethod: 'cash' }],
    )
    expect(b.cash).toBe(-1600)
    expect(b.total).toBe(-1600)
  })

  it('المصروف لا يرفع أي محفظة أبداً', () => {
    const b = computeBalances(
      [],
      [],
      [
        { amount: 100, paymentMethod: 'cash' },
        { amount: 200, paymentMethod: 'jawwal_pay' },
        { amount: 300, paymentMethod: 'palpay' },
        { amount: 400, paymentMethod: 'bop' },
      ],
    )
    expect(b).toEqual({ cash: -100, jawwal_pay: -200, palpay: -300, bop: -400, total: -1000 })
  })

  it('المشتريات تُطرح والمدفوعات تُجمع', () => {
    const b = computeBalances(
      [{ amount: 1000, method: 'cash' }],
      [{ totalAmount: 250, paymentMethod: 'cash' }],
      [{ amount: 100, paymentMethod: 'cash' }],
    )
    expect(b.cash).toBe(650)
    expect(b.total).toBe(650)
  })
})
