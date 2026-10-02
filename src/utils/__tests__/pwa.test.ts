/**
 * pwa.test.ts — اختبارات منطق إشعار التثبيت
 */
import { describe, it, expect } from 'vitest'
import { detectPlatform, shouldShowPrompt, PWA_STEPS } from '../pwa'

describe('detectPlatform', () => {
  it('يكشف الآيفون والأندرويد وسطح المكتب', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120')).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop')
    expect(detectPlatform('')).toBe('desktop')
  })
})

describe('shouldShowPrompt', () => {
  it('يعرض عند غياب التخزين (لا يرمي خطأ)', () => {
    expect(shouldShowPrompt('any_key_xyz')).toBe(true)
  })
})

describe('PWA_STEPS', () => {
  it('خطوات مختصرة لكل منصة', () => {
    expect(PWA_STEPS.android.length).toBeGreaterThanOrEqual(3)
    expect(PWA_STEPS.ios.length).toBeGreaterThanOrEqual(3)
    expect(PWA_STEPS.android.join(' ')).toContain('Chrome')
    expect(PWA_STEPS.ios.join(' ')).toContain('Safari')
  })
})
