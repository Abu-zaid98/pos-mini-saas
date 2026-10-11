/**
 * printDocument.ts — طباعة موثوقة لمستندات الفواتير والكشوفات.
 *
 * لماذا iframe وليس window.print() على الصفحة؟
 * 1. زرّ كان يستدعي window.print() مباشرة وجذر الطباعة فارغ (#invoice-print-root
 *    لا يُملأ إلا عبر usePrintInvoice) → معاينة بيضاء مضمونة.
 * 2. توقيت setTimeout(120ms) يقامر: على الأجهزة البطيئة قد يُفتح الحوار قبل
 *    رسم React للمحتوى → صفحة بيضاء.
 * 3. محتوى نظيف: لا backdrop ولا overflow للصفحة الأم يقصّ الصفحات.
 *
 * الآلية: نقرأ innerHTML الجذر (بعد التأكد أنه غير فارغ — وإلا تنبيه واضح
 * بدل صفحة بيضاء صامتة)، ننسخ CSS التطبيق في مستند iframe مخفي، ننتظر
 * الصور (الشعار)، ثم نطبع من الـ iframe.
 */

/** كل CSS التطبيق من نفس الأصل (يشمل :root وقواعد @media print) */
export function collectAppCss(): string {
  if (typeof document === 'undefined') return ''
  const parts: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules
      if (!rules) continue
      for (const rule of Array.from(rules)) parts.push(rule.cssText)
    } catch {
      // ورقة خارجية (خطوط Google) — تُتجاهل بصمت مع fallback للخطوط
    }
  }
  return parts.join('\n')
}

/** مستند طباعة مستقل: نفس معرّف الجذر لتطبيق قواعد @media print كما هي */
export function buildPrintDocument(rootId: string, bodyHtml: string, cssText: string): string {
  return (
    '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<title>طباعة</title>' +
    '<style>' + cssText + '</style>' +
    '</head><body>' +
    '<div id="' + rootId + '">' + bodyHtml + '</div>' +
    '</body></html>'
  )
}

function waitForImages(doc: Document, timeoutMs = 1500): Promise<void> {
  const imgs = Array.from(doc.images || []).filter((img) => !img.complete)
  if (imgs.length === 0) return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    const timer = setTimeout(finish, timeoutMs)
    let pending = imgs.length
    imgs.forEach((img) => {
      img.addEventListener('load', () => { if (--pending <= 0) { clearTimeout(timer); finish() } }, { once: true })
      img.addEventListener('error', () => { if (--pending <= 0) { clearTimeout(timer); finish() } }, { once: true })
    })
  })
}

/**
 * اطبع محتوى عنصر مخفي عبر iframe. تُستدعى بعد رسم المحتوى في الـ DOM
 * (مباشرة بعد setState داخل requestAnimationFrame — لا حاجة لتخمين setTimeout).
 * تُرجع false وتعرض تنبيهاً إن كان الجذر فارغاً (بدل صفحة بيضاء صامتة).
 */
export function printElementById(rootId: string): boolean {
  if (typeof document === 'undefined') return false
  const el = document.getElementById(rootId)
  const html = el ? el.innerHTML.trim() : ''
  if (!html) {
    alert('لا يوجد محتوى للطباعة — أعد فتح المعاينة وحاول مجدداً')
    return false
  }

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
  document.body.appendChild(iframe)

  const cleanup = () => {
    window.setTimeout(() => {
      try { iframe.remove() } catch { /* ignore */ }
    }, 500)
  }

  try {
    const doc = iframe.contentDocument
    if (!doc) {
      iframe.remove()
      return false
    }
    doc.open()
    doc.write(buildPrintDocument(rootId, html, collectAppCss()))
    doc.close()
    const win = iframe.contentWindow
    if (!win) {
      iframe.remove()
      return false
    }
    void waitForImages(doc).then(() => {
      try {
        win.focus()
        win.print()
      } catch {
        // تجاهل — حوار الطباعة غير متاح على هذا الجهاز
      }
    })
    // احتياط: تنظيف حتى لو لم يُطلق afterprint (بعض متصفحات الجوال)
    win.addEventListener('afterprint', cleanup)
    window.setTimeout(cleanup, 30000)
    return true
  } catch {
    try { iframe.remove() } catch { /* ignore */ }
    return false
  }
}
