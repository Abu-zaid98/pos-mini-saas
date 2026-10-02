/**
 * feedback.tsx — نظام التنبيهات والتأكيدات للوحة التحكم
 * useToast: رسائل نجاح/خطأ/معلومات تنزلق من الأسفل (بدل alert)
 * useConfirm: نافذة تأكيد أنيقة تُرجع Promise<boolean> (بدل confirm)
 *
 * الاستخدام داخل AdminFeedbackProvider فقط (مغلّف في AdminApp):
 *   const toast = useToast()
 *   toast.success('تم الحفظ', 'أُعيد إصدار التوكن')
 *   const confirmAction = useConfirm()
 *   if (await confirmAction({ title: 'حذف؟', message: '...', danger: true })) { ... }
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react'

export type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  desc?: string
}

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface FeedbackContextValue {
  toast: (kind: ToastKind, title: string, desc?: string) => void
  success: (title: string, desc?: string) => void
  error: (title: string, desc?: string) => void
  info: (title: string, desc?: string) => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useToast/useConfirm يجب أن يُستخدما داخل AdminFeedbackProvider')
  return ctx
}

export const useToast = () => useFeedback()
export const useConfirm = () => useFeedback().confirm

const TOAST_ICON: Record<ToastKind, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

export function AdminFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [pendingConfirm, setPendingConfirm] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((kind: ToastKind, title: string, desc?: string) => {
    const id = ++idRef.current
    setToasts((prev) => [...prev.slice(-2), { id, kind, title, desc }])
    setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 4000)
  }, [dismiss])

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPendingConfirm({ opts, resolve })
    })
  }, [])

  const value: FeedbackContextValue = {
    toast,
    success: (title, desc) => toast('success', title, desc),
    error: (title, desc) => toast('error', title, desc),
    info: (title, desc) => toast('info', title, desc),
    confirm,
  }

  const answerConfirm = (v: boolean) => {
    pendingConfirm?.resolve(v)
    setPendingConfirm(null)
  }

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {/* Toast stack */}
      <div className="admin-toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`admin-toast admin-toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span className={`admin-toast-icon admin-toast-icon-${t.kind}`}>{TOAST_ICON[t.kind]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="admin-toast-title">{t.title}</div>
              {t.desc && <div className="admin-toast-desc">{t.desc}</div>}
            </div>
            <button className="admin-toast-close" onClick={() => dismiss(t.id)} aria-label="إغلاق">✕</button>
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {pendingConfirm && (
        <div className="admin-modal-overlay" onClick={() => answerConfirm(false)}>
          <div className="admin-modal admin-modal-sm" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label={pendingConfirm.opts.title}>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <span className={`admin-confirm-icon ${pendingConfirm.opts.danger ? 'admin-confirm-danger' : ''}`}>
                {pendingConfirm.opts.danger ? '⚠️' : '❓'}
              </span>
            </div>
            <h2 className="admin-modal-title" style={{ textAlign: 'center', marginBottom: 8 }}>
              {pendingConfirm.opts.title}
            </h2>
            <p className="admin-modal-body" style={{ textAlign: 'center' }}>
              {pendingConfirm.opts.message}
            </p>
            <div className="admin-modal-footer" style={{ justifyContent: 'center' }}>
              <button className="admin-btn-secondary" onClick={() => answerConfirm(false)}>
                {pendingConfirm.opts.cancelLabel || 'تراجع'}
              </button>
              <button
                className={pendingConfirm.opts.danger ? 'admin-btn-danger' : 'admin-btn-primary'}
                onClick={() => answerConfirm(true)}
                autoFocus
              >
                {pendingConfirm.opts.confirmLabel || 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  )
}
