/**
 * AdminLayout.tsx — الهيكل العام للوحة التحكم
 * Sidebar + Header + Content — Apple Style
 */
import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { useConfirm } from './feedback'
import { useNotifications } from '../hooks/useNotifications'
import { BulkRemindModal } from './BulkRemindModal'

interface Props {
  children: React.ReactNode
  user: User
  onLogout: () => void
}

const navItems = [
  {
    to: '/admin',
    end: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <rect x="10" y="1" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <rect x="1" y="10" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <rect x="10" y="10" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    label: 'لوحة البيانات',
  },
  {
    to: '/admin/subscribers',
    end: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M1 16c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    label: 'المشتركون',
  },
  {
    to: '/admin/admins',
    end: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 1l6 2.5v4c0 4-2.7 7-6 8.5-3.3-1.5-6-4.5-6-8.5v-4L9 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M6.5 9l2 2 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    label: 'المدراء',
  },
  {
    to: '/admin/billing',
    end: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="4" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 8h14M6 12.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    label: 'الفوترة',
  },
  {
    to: '/admin/reports',
    end: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 16h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4 16v-5M9 16V7M14 16V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    label: 'التقارير',
  },
  {
    to: '/admin/keys',
    end: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 11l5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M14 12.5v2M16.5 10h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    label: 'المفاتيح',
  },
  {
    to: '/admin/activity',
    end: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 9h3l2.5-6L10 15l2.5-8L14 9h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    label: 'سجل النشاط',
  },
  {
    to: '/admin/settings',
    end: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 1.5v2.5M9 14v2.5M1.5 9H4M14 9h2.5M3.7 3.7l1.8 1.8M12.5 12.5l1.8 1.8M14.3 3.7l-1.8 1.8M5.5 12.5l-1.8 1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    label: 'الإعدادات',
  },
]

export function AdminLayout({ children, user, onLogout }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showBell, setShowBell] = useState(false)
  const [showRemind, setShowRemind] = useState(false)
  const [adminTheme, setAdminTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('admin_theme') === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })
  const location = useLocation()
  const navigate = useNavigate()
  const confirmAction = useConfirm()
  const { expiring, multiDevice, total, refresh: refreshNotes } = useNotifications()

  useEffect(() => {
    try {
      localStorage.setItem('admin_theme', adminTheme)
    } catch {
      // تجاهل
    }
    if (adminTheme === 'dark') {
      document.documentElement.setAttribute('data-admin-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-admin-theme')
    }
  }, [adminTheme])

  // Reset scroll on navigation — .admin-content is the scroller
  useEffect(() => {
    setSidebarOpen(false)
    document.getElementById('admin-main-content')?.scrollTo({ top: 0 })
  }, [location.pathname])

  const handleLogout = async () => {
    const ok = await confirmAction({
      title: 'تسجيل الخروج؟',
      message: `سيتم إنهاء جلسة الإدارة لحساب ${user.email || ''}.`,
      confirmLabel: 'تسجيل الخروج',
      cancelLabel: 'بقاء',
    })
    if (ok) onLogout()
  }

  const currentPage = navItems.find((n) =>
    n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)
  )

  return (
    <div className="admin-layout">
      {/* Sidebar Overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="admin-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar-open' : ''}`} aria-label="قائمة التنقل">
        {/* Brand */}
        <div className="admin-sidebar-brand">
          <div className="admin-sidebar-logo">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect width="20" height="20" rx="5" fill="currentColor" />
              <path d="M10 4L13 8.5H15.5L11 14L12.5 17H7.5L9 14L4.5 8.5H7L10 4Z" fill="white" />
            </svg>
          </div>
          <div>
            <div className="admin-sidebar-brand-name">لوحة التحكم</div>
            <div className="admin-sidebar-brand-sub">POS Admin</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="admin-sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `admin-nav-item ${isActive ? 'admin-nav-item-active' : ''}`
              }
            >
              <span className="admin-nav-icon">{item.icon}</span>
              <span className="admin-nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="admin-sidebar-user">
          <div className="admin-sidebar-avatar" aria-hidden="true">
            {user.email?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div className="admin-sidebar-user-info">
            <div className="admin-sidebar-user-email">{user.email}</div>
            <div className="admin-sidebar-user-role">مدير النظام</div>
          </div>
          <button
            className="admin-sidebar-logout"
            onClick={handleLogout}
            title="تسجيل الخروج"
            aria-label="تسجيل الخروج"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="admin-main">
        {/* Header */}
        <header className="admin-header">
          <button
            className="admin-header-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label="فتح القائمة"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <h2 className="admin-header-title">{currentPage?.label || 'لوحة التحكم'}</h2>
          <div className="admin-header-right">
            {/* Theme toggle */}
            <button
              className="admin-header-menu"
              style={{ display: 'flex' }}
              onClick={() => setAdminTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label="تبديل المظهر"
              title={adminTheme === 'dark' ? 'وضع نهاري' : 'وضع ليلي'}
            >
              {adminTheme === 'dark' ? '☀️' : '🌙'}
            </button>
            {/* Notifications bell */}
            <div style={{ position: 'relative' }}>
              <button
                className="admin-header-menu"
                style={{ display: 'flex' }}
                onClick={() => {
                  setShowBell((v) => !v)
                  refreshNotes()
                }}
                aria-label="التنبيهات"
                title="التنبيهات"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 1.5a4.5 4.5 0 00-4.5 4.5c0 4-1.5 5-1.5 5h12S13.5 10 13.5 6A4.5 4.5 0 009 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M7 13.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                {total > 0 && <span className="admin-bell-badge">{total > 9 ? '9+' : total}</span>}
              </button>

              {showBell && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 1 }}
                    onClick={() => setShowBell(false)}
                  />
                  <div className="admin-bell-panel">
                    <div className="admin-panel-header" style={{ marginBottom: 8 }}>
                      <h3 className="admin-panel-title">🔔 التنبيهات</h3>
                      {expiring.length > 0 && (
                        <button
                          className="admin-btn-wa admin-btn-xs"
                          style={{ border: 'none', cursor: 'pointer' }}
                          onClick={() => {
                            setShowBell(false)
                            setShowRemind(true)
                          }}
                        >
                          💬 تذكير الكل
                        </button>
                      )}
                    </div>

                    {total === 0 ? (
                      <p className="admin-empty-desc" style={{ textAlign: 'center', padding: '12px 0' }}>
                        لا توجد تنبيهات — كل شيء هادئ 🎉
                      </p>
                    ) : (
                      <>
                        {multiDevice.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <p className="admin-sort-label" style={{ marginBottom: 6 }}>📱 مشاركة حسابات نشطة الآن</p>
                            {multiDevice.map((m) => (
                              <button
                                key={m.uid}
                                className="admin-mini-item"
                                style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit' }}
                                onClick={() => {
                                  setShowBell(false)
                                  if (m.subId) navigate(`/admin/subscribers/${m.subId}`)
                                }}
                              >
                                <div className="admin-mini-info">
                                  <div className="admin-mini-name">{m.name}</div>
                                  <div className="admin-mini-sub">{m.count} أجهزة نشطة</div>
                                </div>
                                <span className="admin-badge admin-badge-warning">فحص</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {expiring.length > 0 && (
                          <div>
                            <p className="admin-sort-label" style={{ marginBottom: 6 }}>⏳ تنتهي خلال يومين</p>
                            {expiring.slice(0, 5).map((s) => (
                              <button
                                key={s.id}
                                className="admin-mini-item"
                                style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit' }}
                                onClick={() => {
                                  setShowBell(false)
                                  navigate(`/admin/subscribers/${s.id}`)
                                }}
                              >
                                <div className="admin-mini-avatar">{s.username.charAt(0).toUpperCase()}</div>
                                <div className="admin-mini-info">
                                  <div className="admin-mini-name">{s.displayName || s.username}</div>
                                  <div className="admin-mini-sub">{s.expiryDate.toLocaleDateString('ar')}</div>
                                </div>
                              </button>
                            ))}
                            {expiring.length > 5 && (
                              <button
                                className="admin-panel-link"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}
                                onClick={() => {
                                  setShowBell(false)
                                  navigate('/admin/subscribers?filter=expiring')
                                }}
                              >
                                عرض الكل ({expiring.length})
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="admin-header-badge" title={user.email || ''}>
              {user.email?.charAt(0).toUpperCase() || 'A'}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="admin-content" id="admin-main-content">
          {children}
        </main>
      </div>

      {/* Bulk remind from notifications */}
      {showRemind && (
        <BulkRemindModal subs={expiring} onClose={() => setShowRemind(false)} />
      )}
    </div>
  )
}
