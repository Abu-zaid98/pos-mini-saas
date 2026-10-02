import { useLocation, useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/', icon: '🛒', label: 'بيع', activeIcon: '🛒' },
  { path: '/products', icon: '📦', label: 'المخزون', activeIcon: '📦' },
  { path: '/customers', icon: '👥', label: 'عملاء', activeIcon: '👥' },
  { path: '/invoices', icon: '🧾', label: 'فواتير', activeIcon: '🧾' },
  { path: '/reports', icon: '📊', label: 'تقارير', activeIcon: '📊' },
  { path: '/settings', icon: '⚙️', label: 'إعدادات', activeIcon: '⚙️' },
]

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map((item) => {
        const isActive = location.pathname === item.path ||
          (item.path !== '/' && location.pathname.startsWith(item.path)) ||
          (item.path === '/products' && location.pathname.startsWith('/purchases'))

        return (
          <button
            key={item.path}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <div className="nav-icon-wrap">
              <span style={{ fontSize: 20 }}>
                {isActive ? item.activeIcon : item.icon}
              </span>
            </div>
            <span className="nav-label">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
