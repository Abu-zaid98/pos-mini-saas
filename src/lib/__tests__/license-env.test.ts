/**
 * license-env.test.ts — اختبارات تنظيف قيمة المفتاح العام
 * تغطي كل أخطاء اللصق الشائعة من المستخدمين
 */
import { describe, it, expect } from 'vitest'
import { cleanJwkEnv } from '../license'

const GOOD = '{"crv":"P-256","ext":true,"key_ops":["verify"],"kty":"EC","x":"1jg49gbxB1uH5VNQayd4jMzFueLlfle5xDR-uq3K2hg","y":"eaasA0EA6wYgLjzybqo7xmxBRIJxEGELq1hpwiENEt4"}'

describe('cleanJwkEnv', () => {
  it('يمرر JSON سليماً كما هو', () => {
    expect(JSON.parse(cleanJwkEnv(GOOD)).x).toBe('1jg49gbxB1uH5VNQayd4jMzFueLlfle5xDR-uq3K2hg')
  })
  it('يزيل علامات التنصيص المفردة حول القيمة', () => {
    expect(JSON.parse(cleanJwkEnv(`'${GOOD}'`)).kty).toBe('EC')
  })
  it('يزيل أحرف الاتجاه الخفية من النسخ العربي', () => {
    const dirty = '\u200F' + GOOD.slice(0, 10) + '\u200E' + GOOD.slice(10) + '\uFEFF'
    expect(JSON.parse(cleanJwkEnv(dirty)).crv).toBe('P-256')
  })
  it('يستخرج JSON من سطر مع اسم المتغير', () => {
    expect(JSON.parse(cleanJwkEnv(`VITE_LIC_PUBLIC_KEY=${GOOD}`)).y).toBe(
      'eaasA0EA6wYgLjzybqo7xmxBRIJxEGELq1hpwiENEt4'
    )
  })
  it('يتجاهل نصوصاً وأسطراً زائدة حوله', () => {
    const dirty = `المفتاح:\n${GOOD}\nانتهى`
    expect(JSON.parse(cleanJwkEnv(dirty)).x).toBeDefined()
  })
})
