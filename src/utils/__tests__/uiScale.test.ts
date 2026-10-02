/**
 * uiScale.test.ts — اختبارات حجم العرض (الافتراضي 86٪)
 */
import { describe, it, expect } from 'vitest'
import { parseUiScale, scaleLabel, bottomExtra, UI_SCALE_DEFAULT, UI_SCALE_PRESETS } from '../uiScale'

describe('parseUiScale', () => {
  it('الغائب والفاسد يعود للافتراضي 86٪', () => {
    expect(parseUiScale(null)).toBe(0.86)
    expect(parseUiScale(undefined)).toBe(0.86)
    expect(parseUiScale('')).toBe(0.86)
    expect(parseUiScale('abc')).toBe(0.86)
    expect(parseUiScale(NaN)).toBe(0.86)
    expect(parseUiScale(-1)).toBe(0.86)
    expect(parseUiScale(0)).toBe(0.86)
    expect(UI_SCALE_DEFAULT).toBe(0.86)
  })
  it('يقبل الأحجام الثلاثة', () => {
    expect(parseUiScale(0.86)).toBe(0.86)
    expect(parseUiScale(1)).toBe(1)
    expect(parseUiScale(1.08)).toBe(1.08)
    expect(parseUiScale('1')).toBe(1)
  })
  it('يقرّب أي قيمة قديمة لأقرب حجم مسموح', () => {
    expect(parseUiScale(0.8)).toBe(0.86)
    expect(parseUiScale(0.87)).toBe(0.86)
    expect(parseUiScale(0.95)).toBe(1)
    expect(parseUiScale(1.12)).toBe(1.08)
    expect(parseUiScale(1.2)).toBe(1.08)
  })
})

describe('scaleLabel', () => {
  it('يسمي الأحجام الثلاثة', () => {
    expect(scaleLabel(0.86)).toBe('قياسي')
    expect(scaleLabel(1)).toBe('طبيعي')
    expect(scaleLabel(1.08)).toBe('كبير')
    expect(scaleLabel(0.95)).toBe('طبيعي')
  })
  it('الأحجام ثلاثة فقط', () => {
    expect(UI_SCALE_PRESETS.map((p) => p.value)).toEqual([0.86, 1, 1.08])
  })
})

describe('bottomExtra', () => {
  it('هامش صغير فوق 100٪ ويتقلص تحتها', () => {
    expect(bottomExtra(1)).toBe(24)
    expect(bottomExtra(1.08)).toBe(24)
    expect(bottomExtra(0.86)).toBe(Math.round(24 * 0.86 * 0.86))
  })
})
