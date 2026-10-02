import React, { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  type?: 'sheet' | 'box'
  footer?: React.ReactNode
}

export function Modal({ open, onClose, title, children, type = 'sheet', footer }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className={`modal-backdrop ${type === 'box' ? 'center' : ''}`}
      onClick={handleBackdropClick}
      style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}
    >
      <div
        className={type === 'sheet' ? 'modal-sheet' : 'modal-box'}
        style={footer ? {
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90dvh',
          height: 'auto',
          overflow: 'hidden',
          WebkitOverflowScrolling: 'touch',
        } : undefined}
      >
        {type === 'sheet' && <div className="modal-drag-handle" style={{ flexShrink: 0 }} />}

        {title && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            flexShrink: 0,
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h2>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                borderRadius: 8,
                width: 36,
                height: 36,
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
                fontSize: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {footer ? (
          <>
            <div style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
              paddingBottom: 8,
              paddingRight: 2,
              paddingLeft: 2,
            }}>
              {children}
            </div>
            <div style={{
              position: 'sticky',
              bottom: 0,
              zIndex: 2,
              flexShrink: 0,
              paddingTop: 12,
              paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-bg-elevated)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: '0 -8px 20px rgba(15, 23, 42, 0.08)',
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%' }}>
                {footer}
              </div>
            </div>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
