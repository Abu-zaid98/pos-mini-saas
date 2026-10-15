/**
 * documentExport.test.ts — التحقق من بناء PDF الصورة ومساعدات واتساب
 * (لا يلمس DOM: يختبر منطق البايتات النقي فقط)
 */
import { describe, it, expect } from 'vitest'
import { buildPdfFromJpeg, cleanWhatsAppPhone, whatsappUrl } from '../documentExport'

function bytesToText(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i])
  return out
}

describe('تنظيف رقم واتساب', () => {
  it('يحوّل الرقم المحلي إلى صيغة دولية 970', () => {
    expect(cleanWhatsAppPhone('0599123456')).toBe('970599123456')
    expect(cleanWhatsAppPhone('+970 599 123 456')).toBe('970599123456')
    expect(cleanWhatsAppPhone(undefined)).toBe('')
  })

  it('يبني رابط واتساب مع/بدون نص', () => {
    expect(whatsappUrl('0599123456')).toBe('https://wa.me/970599123456')
    expect(whatsappUrl('', 'مرحبا')).toBe('https://api.whatsapp.com/send?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7')
  })
})

describe('بناء ملف PDF من صورة', () => {
  it('ينتج PDF صالحاً بأحجام وأبعاد صحيحة', async () => {
    // بيانات JPEG وهمية (المهم البنية وليست صحة الصورة نفسها)
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9])
    const blob = buildPdfFromJpeg(jpeg, 800, 1200)
    expect(blob.type).toBe('application/pdf')

    const bytes = new Uint8Array(await blob.arrayBuffer())
    const text = bytesToText(bytes)

    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toContain('/Type /Catalog')
    expect(text).toContain('/Subtype /Image')
    expect(text).toContain(`/Width 800`)
    expect(text).toContain(`/Height 1200`)
    expect(text).toContain('/Filter /DCTDecode')
    expect(text).toContain(`/Length ${jpeg.length}`)

    // مؤشر startxref يجب أن يشير إلى بداية جدول xref فعلاً
    const info = /startxref\s+(\d+)/.exec(text)
    expect(info).not.toBeNull()
    const offset = Number(info![1])
    expect(text.slice(offset, offset + 4)).toBe('xref')
  })

  it('يختار الاتجاه الأفقي للصور العريضة', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    const blob = buildPdfFromJpeg(jpeg, 2000, 500)
    const text = bytesToText(new Uint8Array(await blob.arrayBuffer()))
    // A4 أفقي: العرض 841.89 والارتفاع 595.28
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]')
  })
})
