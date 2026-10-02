/**
 * PWAUpdateBanner.tsx — إشعار مدمج "يتوفر تحديث جديد" بزر تحديث واحد
 * نفس روح PWAInstallBanner: سطر واحد أسفل الشاشة
 */
import { useState } from 'react'
import { usePWAUpdate } from '../../hooks/usePWAUpdate'

export function PWAUpdateBanner({ bottom }: { bottom?: string }) {
  const { updateAvailable, applyUpdate } = usePWAUpdate()
  const [updating, setUpdating] = useState(false)

  if (!updateAvailable) return null

  const handleUpdate = async () => {
    setUpdating(true)
    try {
      await applyUpdate()
    } finally {
      setUpdating(false)
    }
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
        background: 'linear-gradient(135deg, #0d7a3f 0%, #12a75c 100%)',
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: 16,
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        animation: 'slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        boxSizing: 'border-box',
        color: '#fff',
      }}
    >
      <span style={{ fontSize: 26, flexShrink: 0 }}>🚀</span>
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800, lineHeight: 1.5 }}>
        يتوفر تحديث جديد للتطبيق
      </span>
      <button
        type="button"
        onClick={handleUpdate}
        disabled={updating}
        style={{
          background: '#fff',
          border: 'none',
          borderRadius: 10,
          color: '#059669',
          fontSize: 13,
          fontWeight: 900,
          padding: '9px 18px',
          cursor: 'pointer',
          fontFamily: 'var(--font-main)',
          whiteSpace: 'nowrap',
        }}
      >
        {updating ? '...' : 'تحديث'}
      </button>
    </div>
  )
}
