/**
 * PWAInstallBanner.tsx — إشعار تثبيت مدمج أسفل الشاشة
 * سطر واحد: أيقونة + نص قصير + زر تثبيت + إغلاق — لا أكثر
 */
import { useEffect, useState } from 'react'
import { usePWAInstall } from '../../hooks/usePWAInstall'
import { shouldShowPrompt, snoozePrompt } from '../../utils/pwa'

interface Props {
  storageKey: string
  /** يُستدعى عند غياب التثبيت المباشر لعرض الدليل الكامل */
  onNeedGuide: () => void
  /** إزاحة من الأسفل (فوق شريط التنقل في التطبيق، 16px في شاشات الدخول) */
  bottom?: string
}

export function PWAInstallBanner({ storageKey, onNeedGuide, bottom }: Props) {
  const { canInstall, isInstalled, installApp } = usePWAInstall()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isInstalled || !shouldShowPrompt(storageKey)) return
    const t = setTimeout(() => {
      if (shouldShowPrompt(storageKey)) setVisible(true)
    }, 1200)
    return () => clearTimeout(t)
  }, [isInstalled, storageKey])

  if (!visible || isInstalled) return null

  const handleInstall = async () => {
    if (!canInstall) {
      onNeedGuide()
      return
    }
    setBusy(true)
    try {
      const ok = await installApp()
      if (ok) setVisible(false)
    } finally {
      setBusy(false)
    }
  }

  const handleLater = () => {
    snoozePrompt(storageKey, 7)
    setVisible(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: bottom || 'calc(var(--bottom-bar-total-height, 72px) + 10px)',
        right: '50%',
        transform: 'translateX(50%)',
        zIndex: 90,
        width: 'calc(100% - 24px)',
        maxWidth: 430,
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-active)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-lg)',
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        animation: 'slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        boxSizing: 'border-box',
      }}
    >
      <span style={{ fontSize: 26, flexShrink: 0 }}>📲</span>
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 }}>
        ثبّت التطبيق على جوالك لفتح أسرع بدون إنترنت
      </span>
      <button
        type="button"
        onClick={handleInstall}
        disabled={busy}
        style={{
          background: 'var(--brand-gradient)',
          border: 'none',
          borderRadius: 10,
          color: 'white',
          fontSize: 13,
          fontWeight: 800,
          padding: '9px 16px',
          cursor: 'pointer',
          fontFamily: 'var(--font-main)',
          whiteSpace: 'nowrap',
          boxShadow: '0 3px 12px rgba(124, 58, 237, 0.4)',
        }}
      >
        {busy ? '...' : 'تثبيت'}
      </button>
      <button
        type="button"
        onClick={handleLater}
        aria-label="إغلاق"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--color-text-muted)',
          fontSize: 14,
          cursor: 'pointer',
          padding: 4,
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}
