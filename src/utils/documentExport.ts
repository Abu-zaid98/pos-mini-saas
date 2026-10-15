/**
 * documentExport.ts — تصدير الفواتير كمستندات جاهزة للمشاركة
 *
 * الأدوار:
 *  1. captureNodeAsPng(): يلتقط عنصر DOM (فاتورة) كصورة PNG عالية الدقة عبر html-to-image.
 *  2. downloadBlob() / downloadDataUrl(): تنزيل الملف على الجهاز.
 *  3. supportsFileShare() / nativeShareImage() / whatsappUrl(): مشاركة الصورة
 *     عبر Web Share API (تفتح قائمة المشاركة → واتساب كصورة فعلية)، مع احتياط
 *     (تنزيل + فتح واتساب) على الأجهزة التي لا تدعم مشاركة الملفات.
 *  4. buildPdfFromJpeg() / exportPngDataUrlAsPdf(): يبنيان ملف PDF بسيطاً
 *     (صفحة واحدة) يحوي الصورة، دون أي مكتبة خارجية.
 */
import { toPng } from 'html-to-image'

// ─────────────────────────────────────────────
// 1) التقاط العنصر كصورة
// ─────────────────────────────────────────────

export interface CaptureOptions {
  /** دقة مضاعفة (2 = صورة واضحة للمشاركة). */
  pixelRatio?: number
}

/** ينتظر جاهزية الخطوط ثم يلتقط العنصر كـ PNG. */
export async function captureNodeAsPng(node: HTMLElement, options: CaptureOptions = {}): Promise<string> {
  const requested = options.pixelRatio ?? 2

  // حدود اللوحة في المتصفحات (~16384px للضلع) — نقلّص الدقة للفواتير الطويلة جداً
  const w = node.offsetWidth || node.clientWidth || 1
  const h = node.offsetHeight || node.clientHeight || 1
  const maxDim = Math.max(w, h)
  const pixelRatio = Math.max(1, Math.min(requested, 16000 / maxDim))

  // الانتظار حتى تُحمَّل خطوط الويب حتى لا تظهر الفاتورة بخط بديل
  try {
    await document.fonts?.ready
  } catch {
    /* بعض المتصفحات لا تدعم document.fonts — نتجاهل */
  }

  const base = {
    pixelRatio,
    backgroundColor: '#ffffff',
    cacheBust: true,
    style: { boxShadow: 'none', margin: '0', transform: 'none' },
  } as const

  try {
    return await toPng(node, base)
  } catch {
    // احتياط: تجاوز تضمين الخطوط (قد يفشل أثناء انعدام الشبكة)
    return await toPng(node, { ...base, skipFonts: true })
  }
}

// ─────────────────────────────────────────────
// 2) التنزيل
// ─────────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// ─────────────────────────────────────────────
// 3) المشاركة كصورة
// ─────────────────────────────────────────────

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  const meta = dataUrl.slice(0, comma)
  const isBase64 = meta.includes(';base64')
  const data = dataUrl.slice(comma + 1)
  if (isBase64) {
    const bin = atob(data)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const mime = /:(.*?);/.exec(meta)?.[1] || 'image/png'
    return new Blob([bytes], { type: mime })
  }
  return new Blob([decodeURIComponent(data)], { type: 'image/png' })
}

export function cleanWhatsAppPhone(raw: string | undefined): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('0') ? `970${digits.slice(1)}` : digits
}

export function whatsappUrl(phone?: string, text?: string): string {
  const clean = cleanWhatsAppPhone(phone)
  const base = clean ? `https://wa.me/${clean}` : 'https://api.whatsapp.com/send'
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

/** هل يدعم المتصفح مشاركة الملفات (الصور) عبر Web Share؟ */
export function supportsFileShare(): boolean {
  try {
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean
      share?: (data: ShareData) => Promise<void>
    }
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false
    const probe = new File([new Blob(['x'])], 'probe.png', { type: 'image/png' })
    return !!nav.canShare({ files: [probe] })
  } catch {
    return false
  }
}

export type ShareResult = 'shared' | 'cancelled' | 'failed'

/** يشارك الصورة عبر Web Share API (تفتح قائمة المشاركة → واتساب كصورة فعلية). */
export async function nativeShareImage(
  pngDataUrl: string,
  filename: string,
  opts: { title?: string; text?: string } = {},
): Promise<ShareResult> {
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>
  }
  if (typeof nav.share !== 'function') return 'failed'
  try {
    const file = new File([dataUrlToBlob(pngDataUrl)], filename, { type: 'image/png' })
    await nav.share({ files: [file], title: opts.title, text: opts.text })
    return 'shared'
  } catch (err) {
    // إلغاء المستخدم للقائمة ليس خطأً
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    return 'failed'
  }
}

// ─────────────────────────────────────────────
// 4) بناء PDF بسيط يحوي صورة واحدة (DCTDecode)
// ─────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('تعذر تحميل الصورة'))
    img.src = src
  })
}

/** يحوّل PNG (data URL) إلى بايتات JPEG عبر canvas. */
async function pngToJpegBytes(pngDataUrl: string): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const img = await loadImage(pngDataUrl)
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('تعذر تجهيز اللوحة')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const jpegUrl = canvas.toDataURL('image/jpeg', 0.94)
  const comma = jpegUrl.indexOf(',')
  const bin = atob(jpegUrl.slice(comma + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, width, height }
}

function base64ToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function fmt(n: number): string {
  return n.toFixed(2)
}

/** يبني ملف PDF أحادي الصفحة من بايتات JPEG. */
export function buildPdfFromJpeg(jpeg: Uint8Array, imgW: number, imgH: number): Blob {
  const A4_W = 595.28
  const A4_H = 841.89
  const margin = 22
  const landscape = imgW > imgH
  const pageW = landscape ? A4_H : A4_W
  const pageH = landscape ? A4_W : A4_H
  const maxW = pageW - margin * 2
  const maxH = pageH - margin * 2
  const scale = Math.min(maxW / imgW, maxH / imgH)
  const drawW = imgW * scale
  const drawH = imgH * scale
  const x = (pageW - drawW) / 2
  const y = (pageH - drawH) / 2

  const enc = new TextEncoder()
  const content = `q\n${fmt(drawW)} 0 0 ${fmt(drawH)} ${fmt(x)} ${fmt(y)} cm\n/Im0 Do\nQ\n`
  const contentBytes = enc.encode(content)

  const chunks: Array<Uint8Array> = []
  const offsets: number[] = []
  let length = 0
  const push = (data: Uint8Array | string) => {
    const b = typeof data === 'string' ? enc.encode(data) : data
    chunks.push(b)
    length += b.length
  }
  const startObj = (n: number) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
  }
  const endObj = () => push('endobj\n')

  push('%PDF-1.4\n')
  // علامة ثنائية اختيارية ليعرف بعض الأدوات أن الملف يحوي بيانات ثنائية
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  startObj(1)
  push('<< /Type /Catalog /Pages 2 0 R >>\n')
  endObj()

  startObj(2)
  push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n')
  endObj()

  startObj(3)
  push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(pageW)} ${fmt(pageH)}] ` +
      `/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\n`,
  )
  endObj()

  startObj(4)
  push(`<< /Length ${contentBytes.length} >>\nstream\n`)
  push(contentBytes)
  push('\nendstream\n')
  endObj()

  startObj(5)
  push(
    `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  )
  push(jpeg)
  push('\nendstream\n')
  endObj()

  const xrefStart = length
  push('xref\n0 6\n')
  push('0000000000 65535 f \n')
  for (let n = 1; n <= 5; n++) {
    push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`)

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

/** ينزّل الفاتورة كملف PDF من صورة PNG ملتقطة مسبقاً. */
export async function exportPngDataUrlAsPdf(pngDataUrl: string, filename: string): Promise<void> {
  // مسار سريع: إن كان مصدر الصورة JPEG أصلاً نضمّنه مباشرة، وإلا نحوّله
  let jpeg: Uint8Array
  let width: number
  let height: number
  if (pngDataUrl.startsWith('data:image/jpeg') || pngDataUrl.startsWith('data:image/jpg')) {
    const img = await loadImage(pngDataUrl)
    jpeg = base64ToBytes(pngDataUrl)
    width = img.naturalWidth || img.width
    height = img.naturalHeight || img.height
  } else {
    const converted = await pngToJpegBytes(pngDataUrl)
    jpeg = converted.bytes
    width = converted.width
    height = converted.height
  }
  downloadBlob(buildPdfFromJpeg(jpeg, width, height), filename)
}
