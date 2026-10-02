/**
 * session-policy.test.ts — اختبارات سياسة جهاز-واحد-نشط
 * أي انكسار هنا = مشتركون يُحجبون خطأً أو مشاركة بلا ضبط
 */
import { describe, it, expect } from 'vitest'
import {
  activeDevices,
  pruneDevices,
  isSessionBlocked,
  mergeHeartbeat,
  shortDeviceId,
  SESSION_STALE_MS,
} from '../session-policy'

const NOW = 1_000_000_000_000
const FRESH = NOW - 60_000
const STALE = NOW - SESSION_STALE_MS - 60_000
const ANCIENT = NOW - 2 * 60 * 60_000

describe('activeDevices', () => {
  it('يعتبر النبضة الحديثة نشطة والقديمة مغادرة', () => {
    const list = activeDevices(
      [{ id: 'a', seen: FRESH }, { id: 'b', seen: STALE }],
      NOW
    )
    expect(list.map((d) => d.id)).toEqual(['a'])
  })
  it('يتجاهل السجلات الفاسدة', () => {
    expect(activeDevices([{ id: '', seen: FRESH }], NOW)).toEqual([])
  })
})

describe('pruneDevices', () => {
  it('يحذف السجلات الأقدم من ساعة ويبقي الباقي', () => {
    const list = pruneDevices(
      [{ id: 'a', seen: FRESH }, { id: 'b', seen: STALE }, { id: 'c', seen: ANCIENT }],
      NOW
    )
    expect(list.map((d) => d.id).sort()).toEqual(['a', 'b'])
  })
})

describe('isSessionBlocked', () => {
  it('جهازي أنا فقط = غير محجوب', () => {
    expect(isSessionBlocked([{ id: 'me', seen: FRESH }], 'me', 1, NOW)).toBe(false)
  })
  it('جهاز آخر نشط مع حد 1 = محجوب', () => {
    expect(
      isSessionBlocked([{ id: 'me', seen: FRESH }, { id: 'other', seen: FRESH }], 'me', 1, NOW)
    ).toBe(true)
  })
  it('جهاز آخر قديم (مغادر) = غير محجوب ويُفسح المجال', () => {
    expect(
      isSessionBlocked([{ id: 'me', seen: FRESH }, { id: 'other', seen: STALE }], 'me', 1, NOW)
    ).toBe(false)
  })
  it('حد 2 يسمح بجهازين', () => {
    const devices = [{ id: 'me', seen: FRESH }, { id: 'other', seen: FRESH }]
    expect(isSessionBlocked(devices, 'me', 2, NOW)).toBe(false)
    expect(
      isSessionBlocked([...devices, { id: 'third', seen: FRESH }], 'me', 2, NOW)
    ).toBe(true)
  })
  it('بلا سجل = غير محجوب (أول دخول)', () => {
    expect(isSessionBlocked([], 'me', 1, NOW)).toBe(false)
  })
})

describe('mergeHeartbeat', () => {
  it('يضيف نبضتي ويحدّث وقتها في المرة التالية', () => {
    const first = mergeHeartbeat([], 'me', NOW)
    expect(first).toEqual([{ id: 'me', seen: NOW }])
    const second = mergeHeartbeat(first, 'me', NOW + 1000)
    expect(second).toEqual([{ id: 'me', seen: NOW + 1000 }])
  })
  it('ينظف السجلات القديمة أثناء الدمج', () => {
    const merged = mergeHeartbeat([{ id: 'old', seen: ANCIENT }], 'me', NOW)
    expect(merged.map((d) => d.id)).toEqual(['me'])
  })
})

describe('shortDeviceId', () => {
  it('أول 8 أحرف كبيرة', () => {
    expect(shortDeviceId('abcdef123456')).toBe('ABCDEF12')
  })
})
