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

  it('المشتريات بآجل أو دفع جزئي تخصم المدفوع فقط وتتجاهل الدين', () => {
    const b = computeBalances(
      [{ amount: 1000, method: 'cash' }],
      [
        // توريد بـ 500 مع دفع 200 كاش والباقي 300 دين للمورد
        { totalAmount: 500, paidAmount: 200, paymentMethod: 'cash' },
        // توريد آجل بالكامل 400 (مدفوع 0)
        { totalAmount: 400, paidAmount: 0, paymentMethod: 'cash' },
      ],
      [],
    )
    // 1000 داخل - 200 مدفوع = 800 (وليس 1000 - 900 = 100)
    expect(b.cash).toBe(800)
    expect(b.total).toBe(800)
  })

  it('التحويل بين المحافظ يغير أرصدة الصناديق ويبقى الإجمالي ثابتاً (صافي أثر = 0)', () => {
    const b = computeBalances(
      [{ amount: 1000, method: 'cash' }],
      [],
      [],
      [
        // تحويل 300 من الكاش إلى بنك فلسطين
        { fromMethod: 'cash', toMethod: 'bop', amount: 300 },
        // تحويل 100 من الكاش إلى جوال باي
        { fromMethod: 'cash', toMethod: 'jawwal_pay', amount: 100 },
      ],
    )
    expect(b.cash).toBe(600) // 1000 - 300 - 100
    expect(b.bop).toBe(300)
    expect(b.jawwal_pay).toBe(100)
    expect(b.palpay).toBe(0)
    expect(b.total).toBe(1000) // لم يتغير المجموع الكلي!
  })
})

describe('buildWalletLedger مع التحويلات والمرتجعات', () => {
  it('يسجل التحويل كحركة خارجة للمحفظة المحول منها وحركة داخلة للمحفظة المستلمة', () => {
    const transfers = [
      {
        id: 1,
        fromMethod: 'cash' as const,
        toMethod: 'bop' as const,
        amount: 250,
        notes: 'إيداع بنكي',
        date: D('2026-10-07T12:00:00'),
        createdAt: D('2026-10-07T12:00:00'),
      },
    ]

    // فحص كشف الكاش (المصدر)
    const cashLedger = buildWalletLedger(
      [pay({ id: 1, amount: 500, createdAt: D('2026-10-07T10:00:00') })],
      [],
      [],
      'cash',
      transfers,
    )
    expect(cashLedger.totalIn).toBe(500)
    expect(cashLedger.totalOut).toBe(250)
    expect(cashLedger.net).toBe(250)
    expect(cashLedger.entries[1].source).toBe('transfer')
    expect(cashLedger.entries[1].kind).toBe('out')

    // فحص كشف البنك (الوجهة)
    const bopLedger = buildWalletLedger(
      [],
      [],
      [],
      'bop',
      transfers,
    )
    expect(bopLedger.totalIn).toBe(250)
    expect(bopLedger.totalOut).toBe(0)
    expect(bopLedger.net).toBe(250)
    expect(bopLedger.entries[0].source).toBe('transfer')
    expect(bopLedger.entries[0].kind).toBe('in')
  })

  it('حركات الاسترداد النقدي (المرتجع) تظهر كحركة خارجة سالبة من الصندوق', () => {
    const { entries, totalIn, totalOut, net } = buildWalletLedger(
      [
        pay({ id: 1, amount: 200, invoiceId: 10, createdAt: D('2026-10-08T10:00:00') }),
        // حركة استرداد نقدي لمرتجع
        pay({ id: 2, amount: -50, invoiceId: 10, note: 'استرداد صنف', createdAt: D('2026-10-08T11:00:00') }),
      ],
      [],
      [],
      'cash',
    )
    expect(totalIn).toBe(200)
    expect(totalOut).toBe(50)
    expect(net).toBe(150)
    expect(entries[1].source).toBe('refund')
    expect(entries[1].kind).toBe('out')
    expect(entries[1].amount).toBe(50)
    expect(entries[1].running).toBe(150)
  })

  it('الرصيد الافتتاحي يظهر كأول بند في الكشف ويبدأ منه الرصيد الجاري', () => {
    const { entries, totalIn, net } = buildWalletLedger(
      [pay({ id: 1, amount: 200, createdAt: D('2026-10-09T10:00:00') })],
      [],
      [],
      'cash',
      [],
      1000, // رصيد افتتاحي 1000
    )
    expect(entries[0].source).toBe('opening')
    expect(entries[0].amount).toBe(1000)
    expect(entries[0].running).toBe(1000)
    expect(entries[1].running).toBe(1200)
    expect(totalIn).toBe(1200)
    expect(net).toBe(1200)
  })

  it('دفعات سداد الموردين المتعددة تخصم من محافظها المحددة بدقة', () => {
    const b = computeBalances(
      [],
      [
        {
          totalAmount: 1000,
          paidAmount: 600,
          paymentMethod: 'cash',
          supplierPayments: [
            { amount: 200, paymentMethod: 'cash', date: D('2026-10-01') },
            { amount: 400, paymentMethod: 'bop', date: D('2026-10-02') },
          ],
        },
      ],
      [],
      [],
      { cash: 500, bop: 1000 },
    )
    // كاش: 500 افتتاحي - 200 دفعة = 300
    expect(b.cash).toBe(300)
    // بنك: 1000 افتتاحي - 400 دفعة = 600
    expect(b.bop).toBe(600)
    // إجمالي: 1500 - 600 = 900
    expect(b.total).toBe(900)
  })
})


