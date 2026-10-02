/**
 * billing.test.ts — اختبارات الفوترة النقية
 * القوالب، أرقام الإيصالات، التجميع الشهري
 */
import { describe, it, expect } from 'vitest'
import { formatTemplate, formatReceiptNo, monthKey, bucketByMonth } from '../billing'
import { DEFAULT_TEMPLATES } from '../templates'

describe('formatTemplate', () => {
  it('يعبئ كل المتغيرات', () => {
    expect(formatTemplate('مرحباً {name} بعد {days}', { name: 'أحمد', days: 3 })).toBe(
      'مرحباً أحمد بعد 3'
    )
  })
  it('يترك النص سليماً بلا متغيرات', () => {
    expect(formatTemplate('نص عادي', {})).toBe('نص عادي')
  })
  it('القوالب الافتراضية تذكر الاسم والتاريخ', () => {
    const out = formatTemplate(DEFAULT_TEMPLATES.receipt, {
      receipt: 'R-202610-0001',
      name: 'أحمد',
      period: 'شهر',
      from: '1/10',
      to: '1/11',
      amount: 100,
      currency: '₪',
      method: 'نقدي',
    })
    expect(out).toContain('R-202610-0001')
    expect(out).toContain('أحمد')
    expect(out).toContain('100')
  })
})

describe('formatReceiptNo', () => {
  it('رقم متسلسل بأصفار', () => {
    expect(formatReceiptNo('202610', 42)).toBe('R-202610-0042')
    expect(formatReceiptNo('202610', 7)).toBe('R-202610-0007')
  })
})

describe('bucketByMonth', () => {
  it('يجمع المبالغ والأعداد شهرياً مرتبة', () => {
    const items = [
      { d: new Date(2026, 9, 5), a: 100 },
      { d: new Date(2026, 9, 20), a: 50 },
      { d: new Date(2026, 7, 1), a: 200 },
    ]
    const buckets = bucketByMonth(items, (t) => t.d, (t) => t.a)
    expect(buckets.map((b) => b.key)).toEqual(['202608', '202610'])
    expect(buckets[1]).toMatchObject({ count: 2, sum: 150 })
    expect(buckets[0].sum).toBe(200)
  })
  it('يتجاهل التواريخ الفاسدة', () => {
    const buckets = bucketByMonth([{ d: new Date('bad'), a: 5 }], (t) => t.d, (t) => t.a)
    expect(buckets).toEqual([])
  })
})

describe('monthKey', () => {
  it('بصيغة YYYYMM', () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe('202601')
    expect(monthKey(new Date(2026, 9, 1))).toBe('202610')
  })
})
