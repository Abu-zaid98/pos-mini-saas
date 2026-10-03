/**
 * PWAInstallSheet.tsx — إشعار تنزيل التطبيق عند بدء التشغيل (POS)
 * ورقة سفلية: زر تثبيت مباشر عند توفره، وإلا خطوات أندرويد/آيفون
 */
import { useState } from 'react'
import { usePWAInstall } from '../../hooks/usePWAInstall'
import { detectPlatform, snoozePrompt, PWA_STEPS } from '../../utils/pwa'

interface Props {
  open: boolean
  onClose: () => void
  storageKey: string
  appName: string
}

export function PWAInstallSheet({ open, onClose, storageKey, appName }: Props) {
  const { canInstall, isInstalled, installApp } = usePWAInstall()
  const [tab, setTab] = useState<'android' | 'ios'>(() =>
    detectPlatform() === 'ios' ? 'ios' : 'android'
  )
  const [installing, setInstalling] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  if (!open || isInstalled) return null

  // زر واحد: تثبيت مباشر عند توفره، وإلا كشف الخطوات اليدوية
  const handleInstall = async () => {
    if (!canInstall) {
      setShowGuide(true)
      return
    }
    setInstalling(true)
    try {
      const ok = await installApp()
      if (ok) {
        onClose()
      } else {
        setShowGuide(true)
      }
    } finally {
      setInstalling(false)
    }
  }

  const handleLater = () => {
    snoozePrompt(storageKey, 7)
    onClose()
  }

  return (
    <div
      onClick={handleLater}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'var(--color-modal-backdrop)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 0.25s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          margin: '0 auto',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderBottom: 'none',
          borderRadius: '24px 24px 0 0',
          padding: '14px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
          animation: 'slideUp 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: '88dvh',
          overflowY: 'auto',
        }}
      >
        <div style={{
          width: 44, height: 5, borderRadius: 99,
          background: 'var(--color-border)', margin: '0 auto 14px',
        }} />

        {/* App identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <img
            src="/logo.jpeg"
            alt="ميزان"
            style={{
              width: 56, height: 56, borderRadius: 12, flexShrink: 0,
              objectFit: 'contain', background: '#fff',
              border: '1px solid rgba(148, 163, 184, 0.2)',
            }}
          />
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 17, fontWeight: 900, margin: 0 }}>
              ثبّت {appName} على جوالك 📲
            </h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '3px 0 0' }}>
              برنامج كامل على شاشتك الرئيسية — سريع ويعمل بدون إنترنت
            </p>
          </div>
        </div>

        {/* Benefits */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 0' }}>
          {[
            ['⚡', 'فتح بضغطة واحدة'],
            ['📴', 'يعمل بدون إنترنت'],
          ].map(([icon, label]) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--brand-gradient-soft)',
              border: '1px solid var(--color-border)',
              borderRadius: 12, padding: '9px 12px', fontSize: 12, fontWeight: 800,
            }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* زر التثبيت الموحد — دائماً ظاهر */}
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing}
          className="btn btn-primary btn-full btn-lg"
          style={{ marginBottom: 4 }}
        >
          {installing ? 'جارٍ التثبيت...' : '📲 ثبّت التطبيق الآن'}
        </button>

        {/* الخطوات اليدوية: ظاهرة دائماً عند غياب التثبيت المباشر */}
        {(!canInstall || showGuide) && (
          <>
            {/* Platform tabs */}
            <div style={{
              display: 'flex', background: 'var(--color-input-bg)',
              border: '1px solid var(--color-border)', borderRadius: 12,
              padding: 3, gap: 4, marginBottom: 10,
            }}>
              {(['android', 'ios'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTab(p)}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 9, border: 'none',
                    background: tab === p ? 'var(--brand-gradient)' : 'transparent',
                    color: tab === p ? '#fff' : 'var(--color-text-secondary)',
                    fontSize: 13, fontWeight: 800, cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  {p === 'android' ? '📱 أندرويد' : '🍏 آيفون'}
                </button>
              ))}
            </div>

            <div style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              background: 'var(--color-input-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 12, padding: 14, fontSize: 13, lineHeight: 1.7,
            }}>
              {PWA_STEPS[tab].map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--brand-gradient)', color: '#fff',
                    fontSize: 12, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={handleLater}
          style={{
            width: '100%', background: 'none', border: 'none',
            color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', padding: '12px 0 2px', fontFamily: 'var(--font-main)',
          }}
        >
          تذكيري لاحقاً
        </button>
      </div>
    </div>
  )
}
