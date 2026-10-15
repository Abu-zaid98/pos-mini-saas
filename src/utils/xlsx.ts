/**
 * xlsx.ts — كاتب ملفات Excel (.xlsx) بدون أي مكتبة خارجية.
 *
 * يبني حزمة OOXML مصغّرة (ZIP بطريقة التخزين Store بدون ضغط) قابلة للفتح في
 * Excel وGoogle Sheets وWPS، مع دعم:
 *  - تعدد الأوراق (Sheets).
 *  - الاتجاه من اليمين لليسار (RTL) افتراضياً.
 *  - صف رأس عريض + عرض أعمدة مخصّص.
 *  - خلايا نصية/رقمية/منطقية (inline strings بلا sharedStrings لتبسيط البنية).
 */

export type XlsxCell = string | number | boolean | null | undefined

export interface XlsxSheet {
  /** اسم الورقة — يُنظَّف ويُقتطع إلى 31 حرفاً */
  name: string
  /** صفوف الورقة — الصف الأول يُنسَّق كرأس (bold) افتراضياً */
  rows: XlsxCell[][]
  /** عرض الأعمدة بوحدة الحرف (اختياري) */
  columnWidths?: number[]
  /** اتجاه الورقة من اليمين لليسار (افتراضي true) */
  rtl?: boolean
  /** تمييز الصف الأول كرأس عريض (افتراضي true) */
  boldHeader?: boolean
}

const enc = new TextEncoder()

// ─────────────────────────────────────────────
// CRC32 — مطلوب لبنية ZIP
// ─────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ─────────────────────────────────────────────
// XML helpers
// ─────────────────────────────────────────────

function xmlEscape(value: string): string {
  return value.replace(/[<>&"']/g, (ch) => {
    switch (ch) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case '"':
        return '&quot;'
      default:
        return '&apos;'
    }
  })
}

/** فهرس عمود (0-based) إلى مرجع Excel: 0→A، 25→Z، 26→AA */
function colRef(index: number): string {
  let ref = ''
  let n = index
  do {
    ref = String.fromCharCode(65 + (n % 26)) + ref
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return ref
}

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31)
  return cleaned || `ورقة ${index + 1}`
}

// ─────────────────────────────────────────────
// ZIP (store — بلا ضغط)
// ─────────────────────────────────────────────

interface ZipEntry {
  name: string
  data: Uint8Array
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const now = new Date()
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff

  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    // Local file header
    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0x0800, true) // flags: UTF-8 file names
    lv.setUint16(8, 0, true) // method: store
    lv.setUint16(10, dosTime, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true) // extra field length
    local.set(nameBytes, 30)

    localParts.push(local, entry.data)

    // Central directory header
    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, dosTime, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true) // extra length
    cv.setUint16(32, 0, true) // comment length
    cv.setUint16(34, 0, true) // disk number start
    cv.setUint16(36, 0, true) // internal attributes
    cv.setUint32(38, 0, true) // external attributes
    cv.setUint32(42, offset, true) // relative offset of local header
    central.set(nameBytes, 46)
    centralParts.push(central)

    offset += local.length + size
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)

  // End of central directory
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true) // disk number
  ev.setUint16(6, 0, true) // disk with central directory
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true) // comment length

  const parts = [...localParts, ...centralParts, end]
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const part of parts) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

// ─────────────────────────────────────────────
// Worksheet XML
// ─────────────────────────────────────────────

function sheetXml(sheet: XlsxSheet): string {
  const rtl = sheet.rtl !== false
  const boldHeader = sheet.boldHeader !== false

  const cols = sheet.columnWidths?.length
    ? `<cols>${sheet.columnWidths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : ''

  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${colRef(c)}${r + 1}`
          const style = boldHeader && r === 0 ? ' s="1"' : ''
          if (value === null || value === undefined || value === '') return `<c r="${ref}"${style}/>`
          if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`
          if (typeof value === 'boolean') return `<c r="${ref}"${style} t="b"><v>${value ? 1 : 0}</v></c>`
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetViews><sheetView${rtl ? ' rightToLeft="1"' : ''} workbookViewId="0"/></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rows}</sheetData>` +
    '</worksheet>'
  )
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="2">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

/** يبني ملف .xlsx كاملاً (Blob) من مجموعة أوراق. */
export function buildXlsx(sheets: XlsxSheet[]): Blob {
  const list = sheets.length ? sheets : [{ name: 'ورقة 1', rows: [] }]

  const entries: ZipEntry[] = []

  const overrides = list
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('')

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    overrides +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>'

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'

  const sheetTags = list
    .map((sheet, i) => `<sheet name="${xmlEscape(sanitizeSheetName(sheet.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${sheetTags}</sheets>` +
    '</workbook>'

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    list
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join('') +
    `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>'

  entries.push(
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) }
  )

  list.forEach((sheet, i) => {
    entries.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(sheet)) })
  })

  entries.push(
    { name: 'xl/workbook.xml', data: enc.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRels) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES_XML) }
  )

  return new Blob([buildZip(entries).buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/** يُنزّل ملف .xlsx على جهاز المستخدم. */
export function downloadXlsx(filename: string, sheets: XlsxSheet[]): void {
  const blob = buildXlsx(sheets)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
