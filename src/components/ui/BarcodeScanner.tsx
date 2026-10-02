import { useEffect, useState } from 'react'
import { useCamera } from '../../hooks/useCamera'
import { Modal } from './Modal'
import { formatCurrency } from '../../utils/currency'

interface BarcodeScannerProps {
  open: boolean
  onDetected: (barcode: string) => void
  onClose: () => void
  continuous?: boolean
  cartCount?: number
  cartTotal?: number
  onFinishInvoice?: () => void
  lastScannedMessage?: { text: string; success: boolean } | null
}

export function BarcodeScanner({
  open,
  onDetected,
  onClose,
  continuous = false,
  cartCount = 0,
  cartTotal = 0,
  onFinishInvoice,
  lastScannedMessage,
}: BarcodeScannerProps) {
  const { videoRef, scanning, error, hasTorch, torchOn, toggleTorch, startScanning, stopScanning } =
    useCamera()
  const [manualCode, setManualCode] = useState('')

  useEffect(() => {
    if (open) {
      setManualCode('')
      startScanning((code) => {
        onDetected(code)
        if (!continuous) {
          onClose()
        }
      }, continuous)
    } else {
      stopScanning()
    }
    return () => stopScanning()
  }, [open, continuous])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = manualCode.trim()
    if (trimmed) {
      onDetected(trimmed)
      setManualCode('')
      if (!continuous) {
        stopScanning()
        onClose()
      }
    }
  }

  const handleClose = () => {
    stopScanning()
    onClose()
  }

  const handleFinish = () => {
    stopScanning()
    onClose()
    if (onFinishInvoice) {
      onFinishInvoice()
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={continuous ? 'مسح باركود الأصناف المتتالية' : 'مسح الباركود بالكاميرا'}
      type="sheet"
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {/* Live Cart HUD (When in continuous sale mode) */}
        {continuous && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 14,
              padding: '8px 14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>🛒</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                السلة: {cartCount} قطعة
              </span>
            </div>
            <span
              style={{
                fontSize: 15,
                fontWeight: 900,
                color: 'var(--color-success-light)',
                direction: 'ltr',
              }}
            >
              {formatCurrency(cartTotal)}
            </span>
          </div>
        )}

        {/* Camera viewfinder */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 320,
            aspectRatio: '1',
            borderRadius: 18,
            overflow: 'hidden',
            background: '#000',
            border: '2px solid var(--color-border)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            playsInline
            muted
          />

          {/* Scan frame overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Corner brackets */}
            {[
              {
                top: '22%',
                right: '12%',
                borderTop: '3.5px solid #3b82f6',
                borderRight: '3.5px solid #3b82f6',
                borderRadius: '0 10px 0 0',
              },
              {
                top: '22%',
                left: '12%',
                borderTop: '3.5px solid #3b82f6',
                borderLeft: '3.5px solid #3b82f6',
                borderRadius: '10px 0 0 0',
              },
              {
                bottom: '22%',
                right: '12%',
                borderBottom: '3.5px solid #3b82f6',
                borderRight: '3.5px solid #3b82f6',
                borderRadius: '0 0 10px 0',
              },
              {
                bottom: '22%',
                left: '12%',
                borderBottom: '3.5px solid #3b82f6',
                borderLeft: '3.5px solid #3b82f6',
                borderRadius: '0 0 0 10px',
              },
            ].map((style, i) => (
              <div key={i} style={{ position: 'absolute', width: 38, height: 38, ...style }} />
            ))}

            {/* Scan line animation */}
            {scanning && (
              <div
                style={{
                  position: 'absolute',
                  left: '12%',
                  right: '12%',
                  height: 3,
                  background: 'linear-gradient(90deg, transparent, #60a5fa, #3b82f6, transparent)',
                  boxShadow: '0 0 12px #3b82f6',
                  animation: 'scanLine 1.8s ease-in-out infinite',
                }}
              />
            )}
          </div>

          {/* Torch toggle button */}
          {hasTorch && (
            <button
              onClick={toggleTorch}
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                background: torchOn ? '#3b82f6' : 'rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '50%',
                width: 42,
                height: 42,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 19,
                color: 'white',
                cursor: 'pointer',
                zIndex: 10,
              }}
              title="تشغيل الكشاف"
            >
              {torchOn ? '🔦' : '💡'}
            </button>
          )}

          {/* Not scanning yet overlay */}
          {!scanning && !error && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.7)',
              }}
            >
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>جارٍ تشغيل الكاميرا...</p>
            </div>
          )}
        </div>

        {/* Live Feedback Toast: Last Scanned Item */}
        {lastScannedMessage && (
          <div
            style={{
              width: '100%',
              padding: '8px 14px',
              borderRadius: 12,
              background: lastScannedMessage.success
                ? 'rgba(16,185,129,0.18)'
                : 'rgba(239,68,68,0.18)',
              border: `1.5px solid ${
                lastScannedMessage.success ? 'var(--color-success)' : 'var(--color-danger)'
              }`,
              color: lastScannedMessage.success
                ? 'var(--color-success-light)'
                : 'var(--color-danger-light)',
              fontWeight: 700,
              fontSize: 13,
              textAlign: 'center',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            {lastScannedMessage.text}
          </div>
        )}

        {error && (
          <div
            style={{
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 12,
              padding: '10px 14px',
              width: '100%',
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'var(--color-danger-light)', fontSize: 13, fontWeight: 600 }}>
              ⚠ {error}
            </p>
          </div>
        )}

        {scanning && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 12, textAlign: 'center', margin: 0 }}>
            {continuous
              ? '⚡ يمكنك تمرير الصنف تلو الآخر دون توقف'
              : '📷 وجّه الكاميرا نحو خطوط الباركود داخل الإطار'}
          </p>
        )}

        {/* Manual Barcode input */}
        <form
          onSubmit={handleManualSubmit}
          style={{
            width: '100%',
            display: 'flex',
            gap: 8,
          }}
        >
          <input
            type="text"
            inputMode="numeric"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="أو اكتب رقم الباركود يدوياً..."
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 12,
              background: 'var(--color-input-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontSize: 14,
              outline: 'none',
              fontFamily: 'var(--font-main)',
              direction: 'ltr',
              textAlign: 'center',
            }}
          />
          <button
            type="submit"
            disabled={!manualCode.trim()}
            style={{
              minHeight: 46,
              padding: '0 16px',
              borderRadius: 12,
              background: manualCode.trim() ? 'var(--color-primary)' : 'var(--color-btn-ghost-bg)',
              border: 'none',
              color: 'white',
              fontWeight: 700,
              fontSize: 13,
              cursor: manualCode.trim() ? 'pointer' : 'default',
              fontFamily: 'var(--font-main)',
            }}
          >
            إضافة
          </button>
        </form>

        {/* Action Buttons: Finish Invoice vs Close */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 4 }}>
          {continuous && onFinishInvoice && cartCount > 0 && (
            <button
              type="button"
              onClick={handleFinish}
              style={{
                width: '100%',
                padding: '14px 20px',
                borderRadius: 14,
                border: 'none',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white',
                fontSize: 16,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
                boxShadow: '0 4px 16px rgba(16,185,129,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <span>💳 إنهاء الفاتورة والتحصيل</span>
              <span>({formatCurrency(cartTotal)}) ➔</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleClose}
            style={{
              background: 'var(--color-btn-ghost-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: '10px 24px',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-main)',
              fontWeight: 700,
              fontSize: 14,
              width: '100%',
            }}
          >
            {continuous && cartCount > 0 ? '✓ تم (عرض السلة والمنتجات)' : 'إلغاء'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scanLine {
          0% { top: 22%; }
          50% { top: 72%; }
          100% { top: 22%; }
        }
      `}</style>
    </Modal>
  )
}
