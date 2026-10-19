import { describe, expect, it } from 'vitest'
import {
  addDays,
  formatDateKey,
  parseDateKey,
  presetRange,
  rangeDays,
  rangeLabel,
  startOfDay,
  toDateKey,
  withinPeriod,
  withinRange,
} from '../dateRange'

const NOW = new Date(2026, 9, 19, 14, 30) // 19/10/2026 14:30

describe('dateRange — التحويل بين الصيغ', () => {
  it('toDateKey يحوّل Date محلية إلى YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 9, 9))).toBe('2026-10-09')
    expect(toDateKey(null)).toBe('')
    expect(toDateKey('غير صالح')).toBe('')
  })

  it('parseDateKey يقرأ المفتاح محلياً دون إزاحة منطقة زمنية', () => {
    const d = parseDateKey('2026-10-09')
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(9)
    expect(d?.getDate()).toBe(9)
    expect(d?.getHours()).toBe(0)
    expect(parseDateKey('2026/10/09')).toBeNull()
    expect(parseDateKey('')).toBeNull()
  })

  it('formatDateKey يعرض dd/mm/yyyy', () => {
    expect(formatDateKey('2026-10-09')).toBe('09/10/2026')
    expect(formatDateKey('')).toBe('')
  })

  it('startOfDay و addDays', () => {
    expect(toDateKey(startOfDay(NOW))).toBe('2026-10-19')
    expect(toDateKey(addDays(NOW, -6))).toBe('2026-10-13')
  })
})

describe('dateRange — الاختصارات', () => {
  it('today = اليوم كاملاً', () => {
    expect(presetRange('today', NOW)).toEqual({ from: '2026-10-19', to: '2026-10-19' })
  })

  it('yesterday = أمس', () => {
    expect(presetRange('yesterday', NOW)).toEqual({ from: '2026-10-18', to: '2026-10-18' })
  })

  it('week = آخر 7 أيام بما فيها اليوم', () => {
    expect(presetRange('week', NOW)).toEqual({ from: '2026-10-13', to: '2026-10-19' })
  })

  it('month = أول الشهر حتى اليوم', () => {
    expect(presetRange('month', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-19' })
  })

  it('lastMonth = الشهر الماضي كاملاً', () => {
    expect(presetRange('lastMonth', NOW)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('all بلا حدود', () => {
    expect(presetRange('all', NOW)).toEqual({ from: '', to: '' })
  })
})

describe('dateRange — withinPeriod', () => {
  it('today يسمح بيوم كامل (حتى آخر ثانية)', () => {
    expect(withinPeriod(new Date(2026, 9, 19, 0, 0), 'today', '', '', NOW)).toBe(true)
    expect(withinPeriod(new Date(2026, 9, 19, 23, 59), 'today', '', '', NOW)).toBe(true)
    expect(withinPeriod(new Date(2026, 9, 18, 23, 59), 'today', '', '', NOW)).toBe(false)
  })

  it('yesterday لا يسرّب اليوم', () => {
    expect(withinPeriod(new Date(2026, 9, 18, 23, 0), 'yesterday', '', '', NOW)).toBe(true)
    expect(withinPeriod(new Date(2026, 9, 19, 1, 0), 'yesterday', '', '', NOW)).toBe(false)
  })

  it('week يشمل 6 أيام للخلف', () => {
    expect(withinPeriod(new Date(2026, 9, 13, 10, 0), 'week', '', '', NOW)).toBe(true)
    expect(withinPeriod(new Date(2026, 9, 12, 10, 0), 'week', '', '', NOW)).toBe(false)
  })

  it('month يبدأ من اليوم الأول', () => {
    expect(withinPeriod(new Date(2026, 9, 1, 0, 1), 'month', '', '', NOW)).toBe(true)
    expect(withinPeriod(new Date(2026, 8, 30, 23, 59), 'month', '', '', NOW)).toBe(false)
  })

  it('custom يحترم من/إلى ويجعل النهاية شاملة لليوم', () => {
    expect(withinPeriod(new Date(2026, 9, 10, 0, 0), 'custom', '2026-10-10', '2026-10-12', NOW)).toBe(true)
    expect(withinPeriod(new Date(2026, 9, 12, 23, 59), 'custom', '2026-10-10', '2026-10-12', NOW)).toBe(true)
    expect(withinPeriod(new Date(2026, 9, 13, 0, 0), 'custom', '2026-10-10', '2026-10-12', NOW)).toBe(false)
    expect(withinPeriod(new Date(2026, 9, 9, 23, 59), 'custom', '2026-10-10', '2026-10-12', NOW)).toBe(false)
  })

  it('custom بلا حدود = كل التواريخ', () => {
    expect(withinPeriod(new Date(2019, 0, 1), 'custom', '', '', NOW)).toBe(true)
  })

  it('من فقط / إلى فقط', () => {
    expect(withinRange(new Date(2026, 9, 19), '2026-10-05', '')).toBe(true)
    expect(withinRange(new Date(2026, 9, 4), '2026-10-05', '')).toBe(false)
    expect(withinRange(new Date(2026, 9, 5, 23, 59), '', '2026-10-05')).toBe(true)
    expect(withinRange(new Date(2026, 9, 19), '', '2026-10-05')).toBe(false)
  })

  it('all يمرر كل القيم', () => {
    expect(withinPeriod(new Date(2000, 0, 1), 'all', '', '', NOW)).toBe(true)
  })
})

describe('dateRange — العرض', () => {
  it('rangeDays يحسب الأيام شاملة الطرفين', () => {
    expect(rangeDays('2026-10-01', '2026-10-19')).toBe(19)
    expect(rangeDays('', '2026-10-19')).toBe(0)
  })

  it('rangeLabel يعرض من – إلى أو مفتوح', () => {
    expect(rangeLabel('2026-10-01', '2026-10-19')).toBe('01/10/2026 ← 19/10/2026')
    expect(rangeLabel('', '')).toBe('كل التواريخ')
    expect(rangeLabel('2026-10-01', '')).toBe('من 01/10/2026')
    expect(rangeLabel('', '2026-10-19')).toBe('حتى 19/10/2026')
  })
})