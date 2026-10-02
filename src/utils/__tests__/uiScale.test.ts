/**
 * uiScale.test.ts — اختبارات حجم العرض (3 أحجام مقفلة فقط)
 */
import { describe, it, expect } from 'vitest'
import { parseUiScale, scaleLabel, bottomExtra, UI_SCALE_PRESETS } from '../uiScale'

describe('parseUiScale', () => {
  it('الافتراضي 1 للقيم الفارغة والفاسدة', () => {
    expect(parseUiScale(null)).toBe(1)
    expect(parseUiScale(undefined)).toBe(1)
    expect(parseUiScale('')).toBe(1)
    expect(parseUiScale('abc')).toBe(1)
    expect(parseUiScale(NaN)).toBe(1)
    expect(parseUiScale(-1)).toBe(1)
    expect(parseUiScale(0)).toBe(1)
  })
  it('يقبل الأحجام الثلاثة', () => {
    expect(parseUiScale(0.87)).toBe(0.87)
    expect(parseUiScale(1)).toBe(1)
    expect(parseUiScale(1.08)).toBe(1.08)
    expect(parseUiScale('0.87')).toBe(0.87)
  })
  it('يقرّب أي قيمة قديمة لأقرب حجم مسموح', () => {
    expect(parseUiScale(0.8)).toBe(0.87)
    expect(parseUiScale(0.9)).toBe(0.87)
    expect(parseUiScale(0.95)).toBe(1)
    expect(parseUiScale(1.12)).toBe(1.08)
    expect(parseUiScale(1.2)).toBe(1.08)
  })
})

describe('scaleLabel', () => {
  it('يسمي الأحجام الثلاثة', () => {
    expect(scaleLabel(1)).toBe('طبيعي')
    expect(scaleLabel(0.87)).toBe('قياسي')
    expect(scaleLabel(1.08)).toBe('كبير')
    expect(scaleLabel(0.95)).toBe('طبيعي')
  })
  it('الأحجام ثلاثة فقط', () => {
    expect(UI_SCALE_PRESETS.map((p) => p.value)).toEqual([0.87, 1, 1.08])
  })
})

describe('bottomExtra', () => {
  it('ثابت فوق 100٪ ويتقلص تحتها', () => {
    expect(bottomExtra(1)).toBe(36)
    expect(bottomExtra(1.08)).toBe(36)
    expect(bottomExtra(0.87)).toBe(Math.round(36 * 0.87 * 0.87))
  })
})
