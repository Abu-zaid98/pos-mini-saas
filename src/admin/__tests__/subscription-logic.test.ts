/**
 * subscription-logic.test.ts — اختبارات المنطق الحساس للفوترة
 * الحسابات، الحالات، روابط واتساب — أي انكسار هنا = مشتركون متأثرون
 * التشغيل: npm test
 */
import { describe, it, expect } from 'vitest'
import {
  calcExpiryMsPrecise,
  addDurationMs,
  msToDhms,
  formatDurationAr,
  DAY_MS,
  HOUR_MS,
} from '../crypto'
import { computeStatus, buildRenewalWhatsApp, buildExpiredWhatsApp } from '../subscriptions'
import type { Subscription } from '../types'

const DAY = 86_400_000

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  const now = new Date()
  return {
    id: 'uid_test_app',
    uid: 'uid_test',
    appId: 'app',
    username: 'ahmed',
    email: 'ahmed@lic.local',
    displayName: 'أحمد محمد',
    phone: '+972501234567',
    token: 'dummy',
    status: 'active',
    startDate: new Date(now.getTime() - 10 * DAY),
    expiryDate: new Date(now.getTime() + 4 * DAY),
    graceDays: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// ── حساب المدد ──

describe('calcExpiryMsPrecise', () => {
  it('يحافظ على وقت اليوم مع إضافة الأيام', () => {
    const from = new Date('2026-03-10T14:30:00')
    const exp = new Date(calcExpiryMsPrecise(from, 4, 0))
    expect(exp.getDate()).toBe(14)
    expect(exp.getHours()).toBe(14)
    expect(exp.getMinutes()).toBe(30)
  })

  it('يضيف الساعات بدقة', () => {
    const from = new Date('2026-03-10T10:00:00')
    expect(calcExpiryMsPrecise(from, 0, 12)).toBe(from.getTime() + 12 * HOUR_MS)
    expect(calcExpiryMsPrecise(from, 2, 6)).toBe(from.getTime() + 2 * DAY_MS + 6 * HOUR_MS)
  })
})

describe('addDurationMs', () => {
  it('يزيد وينقص الأيام والساعات', () => {
    const d = new Date('2026-03-10T10:00:00')
    expect(addDurationMs(d, 7, 0)).toBe(d.getTime() + 7 * DAY_MS)
    expect(addDurationMs(d, -2, 0)).toBe(d.getTime() - 2 * DAY_MS)
    expect(addDurationMs(d, 0, -24)).toBe(d.getTime() - 24 * HOUR_MS)
    expect(addDurationMs(d, 1, 12)).toBe(d.getTime() + DAY_MS + 12 * HOUR_MS)
  })
})

describe('msToDhms', () => {
  it('يفكك المدة لأيام وساعات ودقائق', () => {
    const r = msToDhms(2 * DAY_MS + 3 * HOUR_MS + 5 * 60_000)
    expect(r).toMatchObject({ days: 2, hours: 3, mins: 5, expired: false })
    expect(r.totalHours).toBe(2 * 24 + 3)
  })

  it('يعتبر الصفر والسالب منتهياً', () => {
    expect(msToDhms(0).expired).toBe(true)
    expect(msToDhms(-1000).expired).toBe(true)
  })
})

describe('formatDurationAr', () => {
  it('ينسق المدة بالعربية', () => {
    expect(formatDurationAr(30, 0)).toBe('30 يوم')
    expect(formatDurationAr(7, 12)).toBe('7 يوم و 12 ساعة')
    expect(formatDurationAr(0, 0)).toBe('بدون مدة')
  })
})

// ── الحالات — قلب الفوترة ──

describe('computeStatus', () => {
  it('نشط عندما الانتهاء مستقبلي', () => {
    expect(computeStatus(makeSub())).toBe('active')
  })

  it('يحافظ على التجريبي قبل الانتهاء', () => {
    expect(computeStatus(makeSub({ status: 'trial' }))).toBe('trial')
  })

  it('فترة سماح بعد الانتهاء ضمن أيام السماح', () => {
    const yesterday = new Date(Date.now() - DAY)
    expect(computeStatus(makeSub({ expiryDate: yesterday, graceDays: 3 }))).toBe('grace')
  })

  it('منتهي بعد تجاوز السماح', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * DAY)
    expect(computeStatus(makeSub({ expiryDate: tenDaysAgo, graceDays: 3 }))).toBe('expired')
  })

  it('الموقوف يبقى موقوفاً حتى مع انتهاء مستقبلي', () => {
    expect(computeStatus(makeSub({ status: 'suspended' }))).toBe('suspended')
  })

  it('صفر أيام سماح = انتهاء فوري بعد التاريخ', () => {
    const past = new Date(Date.now() - 60_000)
    expect(computeStatus(makeSub({ expiryDate: past, graceDays: 0 }))).toBe('expired')
  })
})

// ── روابط واتساب ──

describe('WhatsApp builders', () => {
  it('رابط التجديد يحمل رقم المشترك منقّى', () => {
    const url = buildRenewalWhatsApp(makeSub())
    expect(url.startsWith('https://wa.me/')).toBe(true)
    expect(url).toContain('972501234567')
    expect(url).toContain('text=')
  })

  it('يستخدم رقم الدعم عند غياب هاتف المشترك', () => {
    const url = buildExpiredWhatsApp(makeSub({ phone: undefined }))
    expect(url.startsWith('https://wa.me/')).toBe(true)
    expect(url).toContain('text=')
  })
})
