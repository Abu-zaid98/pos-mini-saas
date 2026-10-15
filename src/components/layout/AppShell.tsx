import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { Modal } from '../ui/Modal'
import { Icon } from '../ui/Icon'
import { getStoredTheme, toggleTheme, type Theme } from '../../utils/theme'
import { useStoreName } from '../../hooks/useStoreName'
import { CurrentDate } from './CurrentDate'
import { SubscriptionBadge } from './SubscriptionBadge'
import { InvoicePrintProvider } from '../invoice/InvoicePrint'
import { PWAInstallSheet } from '../pwa/PWAInstallSheet'
import { PWAInstallBanner } from '../pwa/PWAInstallBanner'
import { PWAUpdateBanner } from '../pwa/PWAUpdateBanner'

// PAGE_TITLES is now built dynamically inside the component using the store name

interface AppShellProps {
  onLogout?: () => void
}

export function AppShell({ onLogout }: AppShellProps) {
  const location = useLocation()
  const storeName = useStoreName()
  const contentRef = useRef<HTMLElement | null>(null)

  const pageTitles: Record<string, string> = {
    '/': storeName ? `${storeName} كاشير` : 'الكاشير',
    '/products': 'المخزون والمنتجات',
    '/purchases': 'المشتريات والتوريد',
    '/customers': 'العملاء والديون',
    '/invoices': 'سجل الفواتير',
    '/expenses': 'المصاريف والنفقات',
    '/suppliers': 'الموردون والذمم',
    '/wallets': 'الخزينة والمحافظ',
    '/reports': 'التقارير والإحصائيات',
    '/settings': 'الإعدادات العامة',
  }

  const title = pageTitles[location.pathname] ?? (storeName || 'ميزان')
  const [logoutModalOpen, setLogoutModalOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(getStoredTheme)
  const [pwaGuideOpen, setPwaGuideOpen] = useState(false)

  // عند التنقل بين الشاشات: افتح كل شاشة من بدايتها (أعلى) لا من موضع تمرير الشاشة السابقة
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0 })
  }, [location.pathname])

  const handleToggleTheme = () => {
    const next = toggleTheme()
    setTheme(next)
  }

  const handleQuickLogout = () => {
    setLogoutModalOpen(true)
  }

  const confirmLogout = () => {
    setLogoutModalOpen(false)
    onLogout?.()
  }

  return (
    <InvoicePrintProvider>
    <div className="app-shell">
      {/* Header */}
      <header className="page-header">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}>
          <div style={{ minWidth: 0 }}>
            {/* عنوان الصفحة يظهر في شاشة الكاشير فقط؛ بقية الصفحات لها عنوانها الداخلي */}
            {/* اسم المشترك + المدة المتبقية: بجانب «كاشير» في شاشة البيع، وفوق التاريخ في بقية الصفحات */}
            {location.pathname === '/' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <h1 style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.3px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}>
                  {title}
                </h1>
                <SubscriptionBadge />
              </div>
            ) : (
              <SubscriptionBadge />
            )}
            <CurrentDate />
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            {/* Store badge */}
            <div style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: '3px 9px',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              whiteSpace: 'nowrap',
            }}>
              <img
                src="/logo.jpeg"
                alt={storeName || 'شعار المتجر'}
                style={{ width: 26, height: 26, borderRadius: 7, objectFit: 'contain', background: '#fff', display: 'block' }}
              />
              {storeName.trim() && (
                <span className="header-store-name" style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                  {storeName}
                </span>
              )}
            </div>



            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={handleToggleTheme}
              title={theme === 'dark' ? 'التحويل إلى الثيم الفاتح' : 'التحويل إلى الثيم الداكن'}
              style={{
                background: 'var(--color-input-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                padding: '4px 8px',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 34,
                height: 32,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>

            {/* Quick Logout / Lock Button */}
            {onLogout && (
              <button
                type="button"
                onClick={handleQuickLogout}
                title="تسجيل خروج وقفل التطبيق"
                style={{
                  background: 'rgba(244,63,94,0.12)',
                  border: '1px solid rgba(244,63,94,0.35)',
                  borderRadius: 10,
                  padding: '4px 10px',
                  color: 'var(--color-danger-light)',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontFamily: 'var(--font-main)',
                  height: 32,
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <Icon name="lock" size={14} />
                <span className="header-logout-label">خروج</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="page-content" ref={contentRef}>
        <Outlet context={{ onLogout }} />
      </main>

      {/* Bottom navigation */}
      <BottomNav />

      {/* PWA install banner + full guide fallback */}
      <PWAInstallBanner
        storageKey="pos_pwa_prompt"
        onNeedGuide={() => setPwaGuideOpen(true)}
      />
      {/* PWA update notice */}
      <PWAUpdateBanner />
      <PWAInstallSheet
        open={pwaGuideOpen}
        onClose={() => setPwaGuideOpen(false)}
        storageKey="pos_pwa_prompt"
        appName={storeName.trim() || 'نظام الكاشير'}
      />

      {/* Logout Confirmation Modal */}
      <Modal
        open={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        title="🔒 تسجيل الخروج"
        type="box"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{
            textAlign: 'center',
            padding: '16px 0 8px',
          }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🚪</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              هل تريد قفل التطبيق؟
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              سيتم إغلاق الجلسة الحالية وستحتاج إلى كلمة المرور للدخول مجدداً
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%' }}>
            <button
              type="button"
              onClick={() => setLogoutModalOpen(false)}
              className="btn btn-ghost"
              style={{ flex: 1 }}
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={confirmLogout}
              className="btn btn-danger"
              style={{ flex: 1 }}
            >
              🔒 تأكيد الخروج
            </button>
          </div>
        </div>
      </Modal>
    </div>
    </InvoicePrintProvider>
  )
}
