/**
 * AdminLoginPage.tsx — صفحة تسجيل دخول الأدمن
 * تصميم Apple Style — أبيض وأسود — RTL — عربي
 */
import { useState, useRef, useEffect } from 'react'

interface Props {
  onLogin: (email: string, password: string) => Promise<void>
  loading: boolean
  error: string
}

export function AdminLoginPage({ onLogin, loading, error }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onLogin(email.trim(), password)
  }

  return (
    <div className="admin-login-root">
      {/* Background pattern */}
      <div className="admin-login-bg" aria-hidden="true">
        <div className="admin-login-blob blob-1" />
        <div className="admin-login-blob blob-2" />
        <div className="admin-login-grid" />
      </div>

      <div className="admin-login-card" role="main">
        {/* Logo */}
        <div className="admin-login-logo-wrap">
          <div className="admin-login-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="currentColor" />
              <path d="M16 8L20 13H23L17.5 20L19.5 24H12.5L14.5 20L9 13H12L16 8Z" fill="white" />
            </svg>
          </div>
          <div className="admin-login-logo-text">
            <span className="admin-login-logo-title">لوحة التحكم</span>
            <span className="admin-login-logo-sub">نظام إدارة الاشتراكات</span>
          </div>
        </div>

        {/* Card */}
        <div className="admin-card">
          <div className="admin-card-header">
            <h1 className="admin-card-title">تسجيل الدخول</h1>
            <p className="admin-card-desc">ادخل بيانات حساب الأدمن للمتابعة</p>
          </div>

          {/* Error */}
          {error && (
            <div className="admin-alert admin-alert-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 5v3M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="admin-form" noValidate>
            {/* Email */}
            <div className="admin-field">
              <label htmlFor="admin-email" className="admin-label">
                البريد الإلكتروني
              </label>
              <div className="admin-input-wrap">
                <svg className="admin-input-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
                <input
                  ref={emailRef}
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="admin-input"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Password */}
            <div className="admin-field">
              <label htmlFor="admin-password" className="admin-label">
                كلمة المرور
              </label>
              <div className="admin-input-wrap">
                <svg className="admin-input-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  className="admin-input"
                  dir="ltr"
                />
                <button
                  type="button"
                  className="admin-input-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4" />
                      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M2 14L14 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4" />
                      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              id="admin-login-btn"
              type="submit"
              disabled={loading || !email || !password}
              className="admin-btn-primary"
            >
              {loading ? (
                <>
                  <span className="admin-spinner" aria-hidden="true" />
                  <span>جارٍ التحقق...</span>
                </>
              ) : (
                <>
                  <span>دخول لوحة التحكم</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </form>

          <p className="admin-login-footer">
            للوصول للوحة التحكم يجب أن تكون مسجّلاً كأدمن في Firebase
          </p>
        </div>
      </div>
    </div>
  )
}
