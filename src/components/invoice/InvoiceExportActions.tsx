/**
 * InvoiceExportActions.tsx — أزرار تصدير الفاتورة (صورة PNG / ملف PDF / مشاركة كصورة)
 *
 * تُستخدم في فاتورة البيع وفاتورة الشراء: تلتقط عنصر الفاتورة المعروض كصورة
 * عالية الدقة، ثم تنزّلها أو تشاركها كصورة عبر واتساب (Web Share) بدل النص.
 */
import { useState } from 'react'
import {
  captureNodeAsPng,
  downloadDataUrl,
  exportPngDataUrlAsPdf,
  nativeShareImage,
  supportsFileShare,
  whatsappUrl,
} from '../../utils/documentExport'
import { Icon } from '../ui'

type BusyKind = 'png' | 'pdf' | 'whatsapp' | null

interface InvoiceExportActionsProps {
  /** يرجّع عنصر الفاتورة المطلوب التقاطه. */
  getTarget: () => HTMLElement | null
  /** اسم الملف بدون امتداد (مثال: invoice-12). */
  filenameBase: string
  /** رقم هاتف العميل/المورد لفتح واتساب في وضع الاحتياط. */
  whatsappPhone?: string
  /** نص قصير يُرفق مع الصورة عند المشاركة. */
  whatsappText?: string
}

export function InvoiceExportActions({
  getTarget,
  filenameBase,
  whatsappPhone,
  whatsappText,
}: InvoiceExportActionsProps) {
  const [busy, setBusy] = useState<BusyKind>(null)
  const [note, setNote] = useState('')

  const capture = async (): Promise<string | null> => {
    const target = getTarget()
    if (!target) {
      setNote('تعذّر الوصول للفاتورة، أعد فتح المعاينة.')
      return null
    }
    return captureNodeAsPng(target, { pixelRatio: 2 })
  }

  const handlePng = async () => {
    if (busy) return
    setBusy('png')
    setNote('')
    try {
      const png = await capture()
      if (!png) return
      downloadDataUrl(png, `${filenameBase}.png`)
      setNote('تم تنزيل صورة الفاتورة ✓')
    } catch {
      setNote('تعذّر إنشاء الصورة، حاول مجدداً.')
    } finally {
      setBusy(null)
    }
  }

  const handlePdf = async () => {
    if (busy) return
    setBusy('pdf')
    setNote('')
    try {
      const png = await capture()
      if (!png) return
      await exportPngDataUrlAsPdf(png, `${filenameBase}.pdf`)
      setNote('تم تنزيل ملف PDF ✓')
    } catch {
      setNote('تعذّر إنشاء ملف PDF، حاول مجدداً.')
    } finally {
      setBusy(null)
    }
  }

  const handleWhatsApp = async () => {
    if (busy) return
    setBusy('whatsapp')
    setNote('')

    // نتحقق مسبقاً هل يدعم الجهاز مشاركة الملفات. إن لا، نفتح نافذة
    // واتساب الآن (قبل أي await) حتى لا يحجبها المتصفح كنافذة منبثقة.
    const canShareFiles = supportsFileShare()
    let preopened: Window | null = null
    if (!canShareFiles) {
      preopened = window.open('about:blank', '_blank')
    }

    try {
      const png = await capture()
      if (!png) {
        preopened?.close()
        return
      }
      const filename = `${filenameBase}.png`

      if (canShareFiles) {
        const result = await nativeShareImage(png, filename, { text: whatsappText })
        if (result === 'shared') setNote('تم فتح قائمة المشاركة ✓')
        else if (result === 'cancelled') setNote('')
        else {
          // فشلت المشاركة الأصلية → ننزّل الصورة ونفتح واتساب
          downloadDataUrl(png, filename)
          const w = window.open(whatsappUrl(whatsappPhone, whatsappText), '_blank', 'noopener,noreferrer')
          setNote(w ? 'تم تنزيل الصورة وفتح واتساب — أرفق الصورة من المعرض.' : 'تم تنزيل الصورة — ارفعها في واتساب يدوياً.')
        }
      } else {
        downloadDataUrl(png, filename)
        const url = whatsappUrl(whatsappPhone, whatsappText)
        if (preopened) preopened.location.href = url
        else window.open(url, '_blank', 'noopener,noreferrer')
        setNote('تم تنزيل الصورة وفتح واتساب — أرفق الصورة من المعرض.')
      }
    } catch {
      preopened?.close()
      setNote('تعذّر تجهيز الصورة للمشاركة.')
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={handleWhatsApp}
          disabled={disabled}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '11px 8px',
            borderRadius: 12,
            border: 'none',
            background: '#25D366',
            color: '#fff',
            fontWeight: 800,
            fontSize: 13.5,
            fontFamily: 'var(--font-main)',
            cursor: disabled ? 'progress' : 'pointer',
            opacity: disabled && busy !== 'whatsapp' ? 0.6 : 1,
          }}
        >
          <span>{busy === 'whatsapp' ? '⏳ جارٍ...' : 'واتساب'}</span>
        </button>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={handlePng}
          disabled={disabled}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '11px 8px',
            borderRadius: 12,
            fontWeight: 800,
            fontSize: 13.5,
          }}
        >
          <Icon name="download" size={16} />
          <span>{busy === 'png' ? '...' : 'صورة'}</span>
        </button>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={handlePdf}
          disabled={disabled}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '11px 8px',
            borderRadius: 12,
            fontWeight: 800,
            fontSize: 13.5,
          }}
        >
          <Icon name="document" size={16} />
          <span>{busy === 'pdf' ? '...' : 'PDF'}</span>
        </button>
      </div>

      {note && (
        <div
          role="status"
          style={{
            fontSize: 12,
            fontWeight: 700,
            textAlign: 'center',
            color: 'var(--color-text-muted)',
          }}
        >
          {note}
        </div>
      )}
    </div>
  )
}
