/**
 * Toast.tsx — نظام إشعارات خفيف لتطبيق الكاشير.
 *
 * يُغلّف التطبيق مرة واحدة عبر ToastProvider (في main.tsx)، ثم:
 *   const toast = useToast()
 *   toast.success('تم الحفظ')
 *   toast.error('فشلت العملية')
 *
 * يستخدم أنماط .toast-container/.toast الموجودة في index.css.
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

export type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastContextValue {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** الوصول لنظام الإشعارات — يجب أن يكون داخل ToastProvider. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast يجب أن يُستخدم داخل ToastProvider')
  return ctx
}

const ICONS: Record<ToastKind, string> = {
  success: '✅',
  error: '⚠️',
  info: 'ℹ️',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++idRef.current
      // نُبقي آخر 3 إشعارات فقط حتى لا تتكدّس الشاشة
      setToasts((prev) => [...prev.slice(-2), { id, kind, message }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 4000)
    },
    [dismiss]
  )

  const value: ToastContextValue = {
    success: (message) => push('success', message),
    error: (message) => push('error', message),
    info: (message) => push('info', message),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}`}
            role={t.kind === 'error' ? 'alert' : 'status'}
          >
            <span aria-hidden="true">{ICONS[t.kind]}</span>
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="إغلاق الإشعار"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
                opacity: 0.85,
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
