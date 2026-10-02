/**
 * AdminApp.tsx — نقطة دخول لوحة تحكم الأدمن
 * يُدمج داخل مشروع POS عبر route /admin
 * يُحمّل كسولاً (React.lazy) — وملف admin.css يأتي مع نفس الشريحة
 */
import './admin.css'
import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAdminAuth } from './hooks/useAdminAuth'
import { AdminFeedbackProvider } from './components/feedback'
import { PWAInstallNotice } from './components/PWAInstallNotice'
import { loadTemplates } from './templates'
import { shouldShowPrompt } from '../utils/pwa'
import { AdminLayout } from './components/AdminLayout'
import { AdminLoginPage } from './pages/AdminLoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { SubscribersPage } from './pages/SubscribersPage'
import { SubscriberDetailPage } from './pages/SubscriberDetailPage'
import { AdminsPage } from './pages/AdminsPage'
import { BillingPage } from './pages/BillingPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { KeysPage } from './pages/KeysPage'
import { ActivityPage } from './pages/ActivityPage'

export function AdminApp() {
  const { user, isAdmin, loading, error, login, logout } = useAdminAuth()
  const [pwaOpen, setPwaOpen] = useState(false)

  // إشعار تثبيت اللوحة بعد الدخول بثوانٍ (مرة أسبوعياً ما لم تُثبّت)
  useEffect(() => {
    if (!user || isAdmin === false) return
    loadTemplates().catch(() => null)
    if (!shouldShowPrompt('admin_pwa_prompt')) return
    const t = setTimeout(() => {
      if (shouldShowPrompt('admin_pwa_prompt')) setPwaOpen(true)
    }, 2500)
    return () => clearTimeout(t)
  }, [user, isAdmin])

  return (
    <AdminFeedbackProvider>
      {loading ? (
        <div className="admin-splash">
          <div className="admin-splash-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="currentColor" />
              <path d="M16 6L20 13H25L20 18L22 25L16 21L10 25L12 18L7 13H12L16 6Z" fill="white" />
            </svg>
          </div>
          <div className="admin-splash-spinner" />
          <p>جارٍ التحميل...</p>
        </div>
      ) : !user ? (
        <AdminLoginPage
          onLogin={login}
          loading={loading}
          error={error}
        />
      ) : isAdmin === false ? (
        <div className="admin-login-root">
          <div className="admin-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⛔</div>
            <h2 className="admin-card-title">حساب غير مخوّل</h2>
            <p className="admin-card-desc" style={{ marginBottom: 4 }}>
              {user.email}
            </p>
            <p className="admin-card-desc" style={{ marginBottom: 20 }}>
              هذا الحساب غير مسجل كمدير. سجّل مستنداً له في مجموعة <code>admins</code> من Firebase Console.
            </p>
            <button className="admin-btn-secondary" onClick={logout} style={{ width: '100%', justifyContent: 'center' }}>
              تسجيل الخروج
            </button>
          </div>
        </div>
      ) : (
        <AdminLayout user={user} onLogout={logout}>
          <Routes>
            <Route index element={<DashboardPage />} />
            <Route path="subscribers" element={<SubscribersPage />} />
            <Route path="subscribers/:id" element={<SubscriberDetailPage />} />
            <Route path="admins" element={<AdminsPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="keys" element={<KeysPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
          {/* PWA install notice on startup */}
          <PWAInstallNotice
            open={pwaOpen}
            onClose={() => setPwaOpen(false)}
            storageKey="admin_pwa_prompt"
          />
        </AdminLayout>
      )}
    </AdminFeedbackProvider>
  )
}
