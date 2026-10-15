/**
 * datetime.test.ts — انحدار: توحيد صيغة التاريخ والوقت في كل التطبيق
 * التاريخ dd/mm/yyyy والأرقام لاتينية (نفس صيغة النافبار).
 */
import { describe, it, expect } from 'vitest'
import { formatDate, formatTime, formatDateTime, formatWeekday } from '../datetime'

const sample = new Date(2026, 9, 15, 15, 45) // 15/10/2026 3:45 مساءً

describe('formatDate', () => {
  it('صيغة dd/mm/yyyy بأرقام لاتينية', () => {
    expect(formatDate(sample)).toBe('15/10/2026')
  })

  it('يُصفّر اليوم والشهر', () => {
    expect(formatDate(new Date(2026, 0, 3))).toBe('03/01/2026')
  })

  it('يقبل ms و نص التاريخ', () => {
    expect(formatDate(sample.getTime())).toBe('15/10/2026')
    expect(formatDate(sample.toISOString())).not.toContain('٢')
  })

  it('قيمة غير صحيحة تعيد نصاً فارغاً', () => {
    expect(formatDate('not-a-date')).toBe('')
  })
})

describe('formatTime', () => {
  it('نظام 12 ساعة بأرقام لاتينية', () => {
    const t = formatTime(sample)
    expect(t).toContain('3:45')
    expect(t).toMatch(/[مص]$/)
  })
})

describe('formatDateTime', () => {
  it('يجمع التاريخ والوقت بفاصل', () => {
    const dt = formatDateTime(sample)
    expect(dt.startsWith('15/10/2026 · ')).toBe(true)
  })
})

describe('formatWeekday', () => {
  it('اسم اليوم بالعربية', () => {
    expect(formatWeekday(sample)).toBe('الخميس')
  })
})
