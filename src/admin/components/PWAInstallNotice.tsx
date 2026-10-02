/**
 * PWAInstallNotice.tsx — إشعار تنزيل لوحة التحكم عند بدء التشغيل (أدمن)
 * نافذة بهوية اللوحة: زر تثبيت مباشر عند توفره، وإلا خطوات أندرويد/آيفون
 */
import { useState } from 'react'
import { usePWAInstall } from '../../hooks/usePWAInstall'
import { detectPlatform, snoozePrompt, PWA_STEPS } from '../../utils/pwa'

interface Props {
  open: boolean
  onClose: () => void
  storageKey: string
}

export function PWAInstallNotice({ open, onClose, storageKey }: Props) {
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
    <div className="admin-modal-overlay" onClick={handleLater}>
      <div
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="تثبيت لوحة التحكم"
      >
        <div className="admin-modal-header">
          <h2 className="admin-modal-title">📲 ثبّت لوحة التحكم على جوالك</h2>
          <button className="admin-modal-close" onClick={handleLater} aria-label="إغلاق">✕</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div className="admin-login-logo" style={{ width: 52, height: 52, fontSize: 26 }}>🏪</div>
          <p className="admin-modal-desc" style={{ margin: 0 }}>
            برنامج مستقل على شاشتك الرئيسية — وصول أسرع لإدارة الاشتراكات ويعمل بدون إنترنت.
          </p>
        </div>

        {/* زر التثبيت الموحد — دائماً ظاهر */}
        <button className="admin-btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleInstall} disabled={installing}>
          {installing ? 'جارٍ التثبيت...' : '📲 ثبّت اللوحة الآن'}
        </button>

        {/* الخطوات اليدوية: ظاهرة دائماً عند غياب التثبيت المباشر */}
        {(!canInstall || showGuide) && (
          <>
            <div className="admin-tabs" role="tablist" style={{ marginBottom: 12, marginTop: 12 }}>
              {(['android', 'ios'] as const).map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={tab === p}
                  className={`admin-tab ${tab === p ? 'active' : ''}`}
                  onClick={() => setTab(p)}
                >
                  {p === 'android' ? '📱 أندرويد' : '🍏 آيفون'}
                </button>
              ))}
            </div>
            <div className="admin-steps" style={{ marginBottom: 4 }}>
              {PWA_STEPS[tab].map((step, i) => (
                <div key={i} className="admin-step">
                  <div className="admin-step-num">{i + 1}</div>
                  <div className="admin-step-desc" style={{ fontSize: 13 }}>{step}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="admin-modal-footer" style={{ justifyContent: 'center' }}>
          <button className="admin-btn-secondary" onClick={handleLater}>
            تذكيري لاحقاً
          </button>
        </div>
      </div>
    </div>
  )
}
