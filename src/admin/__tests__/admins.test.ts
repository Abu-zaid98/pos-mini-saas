/**
 * admins.test.ts — اختبارات إدارة المدراء
 * parseAdmin نقية + ضمان عدم تسرب كلمة المرور لمستند Firestore
 */
import { describe, it, expect } from 'vitest'
import { parseAdmin } from '../admins'

describe('parseAdmin', () => {
  it('يحلل مستند المدير الكامل', () => {
    const d = new Date('2026-01-01T10:00:00')
    const admin = parseAdmin('uid_1', {
      email: 'Admin@Example.com',
      displayName: 'المدير العام',
      active: true,
      createdAt: d,
      createdBy: 'owner@example.com',
    })
    expect(admin).toMatchObject({
      uid: 'uid_1',
      email: 'Admin@Example.com',
      displayName: 'المدير العام',
      active: true,
      createdBy: 'owner@example.com',
    })
    expect(admin.createdAt).toEqual(d)
  })

  it('مغلق افتراضياً عند غياب حقل active (fail-closed)', () => {
    const admin = parseAdmin('uid_2', { email: 'x@y.com', createdAt: new Date() })
    expect(admin.active).toBe(false)
    expect(admin.displayName).toBeUndefined()
    expect(admin.createdBy).toBeUndefined()
  })

  it('لا يقبل active إلا true الصريحة', () => {
    expect(parseAdmin('u', { email: 'x@y.com', active: 1 }).active).toBe(false)
    expect(parseAdmin('u', { email: 'x@y.com', active: 'yes' }).active).toBe(false)
    expect(parseAdmin('u', { email: 'x@y.com', active: true }).active).toBe(true)
  })

  it('لا يوجد حقل كلمة مرور في النوع إطلاقاً', () => {
    const admin = parseAdmin('uid_3', {
      email: 'x@y.com',
      active: true,
      password: 'secret-should-be-ignored',
    })
    expect('password' in admin).toBe(false)
    expect(JSON.stringify(admin)).not.toContain('secret')
  })
})
