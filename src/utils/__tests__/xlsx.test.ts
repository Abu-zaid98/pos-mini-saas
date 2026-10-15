/**
 * xlsx.test.ts — التحقق من بناء ملف Excel (.xlsx) بدون مكتبة خارجية
 * (لا يلمس DOM: يختبر صحة بايتات الحزمة والـ XML المضمّن فيها)
 */
import { describe, it, expect } from 'vitest'
import { buildXlsx, type XlsxSheet } from '../xlsx'

function bytesToText(bytes: Uint8Array): string {
  const decoder = new TextDecoder('utf-8')
  return decoder.decode(bytes)
}

async function unzip(blob: Blob): Promise<{ names: string[]; content: string }> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const content = bytesToText(bytes)
  const names = [...content.matchAll(/xl\/[\w/.\-]+\.xml|^\[Content_Types\]\.xml|_rels\/\.rels/g)].map((m) => m[0])
  return { names, content }
}

describe('buildXlsx', () => {
  it('ينتج Blob بصيغة Excel القياسية', async () => {
    const blob = buildXlsx([{ name: 'ورقة', rows: [['أ', 1]] }])
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    const bytes = new Uint8Array(await blob.arrayBuffer())
    // توقيع ZIP المحلي: PK\x03\x04
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    expect(bytes[2]).toBe(0x03)
    expect(bytes[3]).toBe(0x04)
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('يتضمّن أجزاء الحزمة الأساسية', async () => {
    const { content } = await unzip(buildXlsx([{ name: 'ورقة', rows: [['أ']] }]))
    expect(content).toContain('[Content_Types].xml')
    expect(content).toContain('xl/workbook.xml')
    expect(content).toContain('xl/_rels/workbook.xml.rels')
    expect(content).toContain('xl/styles.xml')
    expect(content).toContain('xl/worksheets/sheet1.xml')
    expect(content).toContain('spreadsheetml.sheet.main+xml')
    expect(content).toContain('relationships/officeDocument')
  })

  it('يكتب كل ورقة تحت اسمها مع اتجاه RTL افتراضياً', async () => {
    const sheets: XlsxSheet[] = [
      { name: 'المبيعات', rows: [['الإجمالي'], [100]] },
      { name: 'المشتريات', rows: [['الإجمالي'], [40]] },
    ]
    const { content } = await unzip(buildXlsx(sheets))

    expect(content).toContain('xl/worksheets/sheet2.xml')
    expect(content).toContain('sheetId="2"')
    expect(content).toContain('rightToLeft="1"')
    // اسم ورقة متعددة الأوراق
    const encodedSales = 'المبيعات'
    expect(content).toContain(encodedSales)
  })

  it('يسمح بتعطيل RTL لأوراق لوحة التحكم', async () => {
    const { content } = await unzip(buildXlsx([{ name: 'subscribers', rows: [['username']], rtl: false }]))
    expect(content).toContain('<sheetView workbookViewId="0"/>')
    expect(content).not.toContain('rightToLeft')
  })

  it('يكتب الأرقام كسلاسل <v> والنصوص كخلايا نصية', async () => {
    const { content } = await unzip(buildXlsx([{ name: 't', rows: [['نص', 123.5]] }]))
    expect(content).toContain('<v>123.5</v>')
    expect(content).toContain('t="inlineStr"')
    expect(content).toContain('xml:space="preserve"')
    // لا تُنقل الأرقام كنصوص
    expect(content).not.toContain('t="inlineStr"><is><t xml:space="preserve">123.5</t>')
  })

  it('يهرّب الرموز XML الخاصة في النصوص', async () => {
    const { content } = await unzip(buildXlsx([{ name: 't', rows: [['a & b < c > d "e" \'f\'']] }]))
    expect(content).toContain('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;')
    expect(content).not.toContain('a & b < c')
  })

  it('يضيف كلاً خلية لرأس الصف الأول (خط عريض)', async () => {
    const { content } = await unzip(buildXlsx([{ name: 't', rows: [['العميل', 'المبلغ'], ['أحمد', 50]] }]))
    const firstRow = content.match(/<row r="1">.*?<\/row>/)
    expect(firstRow?.[0]).toContain('s="1"')
    const secondRow = content.match(/<row r="2">.*?<\/row>/)
    expect(secondRow?.[0]).not.toContain('s="1"')
  })

  it('يحسب مراجع الأعمدة حتى ما بعد الحرف Z', async () => {
    const row = Array.from({ length: 27 }, (_, i) => `c${i}`)
    const { content } = await unzip(buildXlsx([{ name: 't', rows: [row] }]))
    expect(content).toContain('A1')
    expect(content).toContain('Z1')
    expect(content).toContain('AA1')
  })

  it('يعمل مع ورقة فارغة (لا صفوف)', async () => {
    const { content } = await unzip(buildXlsx([{ name: 'فارغ', rows: [] }]))
    expect(content).toContain('<sheetData></sheetData>')
  })
})
