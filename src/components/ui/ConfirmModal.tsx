import { Modal } from './Modal'

interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title?: string
  icon?: string
  message: string
  subMessage?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'primary'
  loading?: boolean
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = 'تأكيد العملية',
  icon = '🗑️',
  message,
  subMessage,
  confirmText = 'تأكيد الحذف',
  cancelText = 'إلغاء',
  variant = 'danger',
  loading = false,
}: ConfirmModalProps) {
  if (!open) return null

  const getConfirmBg = () => {
    switch (variant) {
      case 'danger':
        return 'linear-gradient(135deg, #ef4444, #dc2626)'
      case 'warning':
        return 'linear-gradient(135deg, #f59e0b, #d97706)'
      case 'primary':
      default:
        return 'linear-gradient(135deg, #3b82f6, #2563eb)'
    }
  }

  const getConfirmShadow = () => {
    switch (variant) {
      case 'danger':
        return '0 4px 14px rgba(239, 68, 68, 0.4)'
      case 'warning':
        return '0 4px 14px rgba(245, 158, 11, 0.4)'
      case 'primary':
      default:
        return '0 4px 14px rgba(59, 130, 246, 0.4)'
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      type="box"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
          <div style={{ fontSize: 48, marginBottom: 12, lineHeight: 1 }}>{icon}</div>
          <p style={{
            fontSize: 16,
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            marginBottom: subMessage ? 6 : 0,
            lineHeight: 1.4,
          }}>
            {message}
          </p>
          {subMessage && (
            <p style={{
              fontSize: 13,
              color: 'var(--color-text-muted)',
              lineHeight: 1.5,
            }}>
              {subMessage}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, flexDirection: 'row-reverse', alignItems: 'center', width: '100%' }}>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1,
              minHeight: 46,
              padding: '12px',
              borderRadius: 12,
              border: 'none',
              background: getConfirmBg(),
              color: 'white',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-main)',
              boxShadow: getConfirmShadow(),
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            {loading ? 'جارٍ الحذف...' : confirmText}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              minHeight: 46,
              padding: '12px',
              borderRadius: 12,
              border: '1px solid var(--color-border)',
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--color-text-secondary)',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-main)',
              transition: 'all 0.15s ease',
            }}
          >
            {cancelText}
          </button>
        </div>
      </div>
    </Modal>
  )
}
