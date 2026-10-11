/**
 * printDocument.test.ts — مستند الطباعة يحافظ على معرّف الجذر (قواعد @media print)
 * انحدار: طباعة جذر فارغ/بدون غلاف كانت تنتج صفحة بيضاء صامتة
 */
import { describe, it, expect } from 'vitest'
import { buildPrintDocument, printElementById } from '../print/printDocument'

describe('buildPrintDocument', () => {
  it('يغلف المحتوى بنفس معرّف الجذر ويضمّن CSS', () => {
    const html = buildPrintDocument('invoice-print-root', '<div>فاتورة</div>', '.x{color:red}')
    expect(html).toContain('<div id="invoice-print-root"><div>فاتورة</div></div>')
    expect(html).toContain('.x{color:red}')
    expect(html).toContain('dir="rtl"')
  })
})

describe('printElementById', () => {
  it('يرفض بأمان خارج المتصفح (Node) بدل التعطل', () => {
    expect(printElementById('invoice-print-root')).toBe(false)
  })
})
