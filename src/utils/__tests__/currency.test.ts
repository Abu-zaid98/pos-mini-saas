/**
 * currency.test.ts — انحدار: السالب يجب أن يظهر بإشارته على الكروت
 * (رصيد -844.5 كان يُعرض "844.50 ₪" بالموجب بسبب Math.abs)
 */
import { describe, it, expect } from 'vitest'
import { formatCurrency, formatCurrencySigned } from '../currency'

describe('formatCurrency', () => {
  it('الموجب كما هو', () => {
    expect(formatCurrency(844.5)).toBe('844.50 ₪')
    expect(formatCurrency(0)).toBe('0.00 ₪')
  })

  it('السالب يظهر بإشارة ناقص', () => {
    expect(formatCurrency(-844.5)).toBe('-844.50 ₪')
    expect(formatCurrency(-1600)).toBe('-1600.00 ₪')
  })

  it('الصفر السالب يُعرض صفراً', () => {
    expect(formatCurrency(-0)).toBe('0.00 ₪')
  })
})

describe('formatCurrencySigned', () => {
  it('يعرض + للموجب و - للسالب', () => {
    expect(formatCurrencySigned(5)).toBe('+5.00 ₪')
    expect(formatCurrencySigned(-5)).toBe('-5.00 ₪')
    expect(formatCurrencySigned(0)).toBe('0.00 ₪')
  })
})
