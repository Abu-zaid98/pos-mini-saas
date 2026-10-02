/**
 * uiScale.test.ts — اختبارات الهامش السفلي للحجم الثابت
 */
import { describe, it, expect } from 'vitest'
import { bottomExtra, UI_SCALE } from '../uiScale'

describe('uiScale', () => {
  it('الحجم الثابت 86٪', () => {
    expect(UI_SCALE).toBe(0.86)
  })
  it('هامش صغير فوق 100٪ ويتقلص تحتها', () => {
    expect(bottomExtra(1)).toBe(24)
    expect(bottomExtra(1.08)).toBe(24)
    expect(bottomExtra(0.86)).toBe(Math.round(24 * 0.86 * 0.86))
  })
})
