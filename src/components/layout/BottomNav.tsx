import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from '../ui/Icon'
import { Modal } from '../ui/Modal'

interface PrimaryNavItem {
  id: string
  path: string
  icon: IconName
  label: string
}

const PRIMARY_ITEMS: PrimaryNavItem[] = [
  { id: 'sale', path: '/', icon: 'cart', label: 'البيع' },
  { id: 'products', path: '/products', icon: 'package', label: 'المخزون' },
  { id: 'customers', path: '/customers', icon: 'users', label: 'العملاء' },
  { id: 'reports', path: '/reports', icon: 'chart-bar', label: 'التقارير' },
]

interface MoreItem {
  path: string
  icon: IconName
  label: string
  description: string
  badge?: string
}

const MORE_ITEMS: MoreItem[] = [
  {
    path: '/invoices',
    icon: 'receipt',
    label: 'سجل الفواتير والمردودات',
    description: 'استعراض فواتير البيع وطباعتها وإدارتها',
  },
  {
    path: '/purchases',
    icon: 'banknotes',
    label: 'المشتريات والتوريد',
    description: 'تسجيل فواتير الشراء وحركة البضائع الواردة',
  },
  {
    path: '/suppliers',
    icon: 'truck',
    label: 'إدارة الموردين',
    description: 'سجل الموردين، الأرصدة، وسداد الديون المستحقة',
  },
  {
    path: '/expenses',
    icon: 'credit-card',
    label: 'المصاريف والنفقات',
    description: 'تسجيل ومتابعة مصاريف التشغيل اليومية',
  },
  {
    path: '/settings',
    icon: 'settings',
    label: 'الإعدادات والنسخ الاحتياطي',
    description: 'بيانات المحل، الطابعة، النسخ الاحتياطي والترخيص',
  },
]

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  // هل الصفحة الحالية تنتمي لقائمة "المزيد"؟
  const isMoreActive = MORE_ITEMS.some((item) =>
    location.pathname === item.path ||
    (item.path !== '/' && location.pathname.startsWith(item.path))
  )

  const handleSelectMore = (path: string) => {
    setMoreOpen(false)
    navigate(path)
  }

  return (
    <>
      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        {PRIMARY_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path))

          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="nav-icon-wrap">
                <Icon name={item.icon} size={20} strokeWidth={isActive ? 2.2 : 1.7} />
              </div>
              <span className="nav-label">{item.label}</span>
            </button>
          )
        })}

        {/* زر المزيد */}
        <button
          type="button"
          className={`nav-item ${isMoreActive || moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-label="المزيد من الصفحات والخيارات"
          aria-expanded={moreOpen}
        >
          <div className="nav-icon-wrap">
            <Icon name="squares-2x2" size={20} strokeWidth={isMoreActive || moreOpen ? 2.2 : 1.7} />
          </div>
          <span className="nav-label">المزيد</span>
        </button>
      </nav>

      {/* نافذة "المزيد" المنبثقة من الأسفل */}
      <Modal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="المزيد من الخيارات"
        type="sheet"
      >
        <div className="more-sheet-list">
          {MORE_ITEMS.map((item) => {
            const isItemActive =
              location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))

            return (
              <button
                key={item.path}
                type="button"
                className="more-sheet-item"
                onClick={() => handleSelectMore(item.path)}
                style={{
                  background: isItemActive ? 'var(--color-primary-glow)' : undefined,
                  border: isItemActive ? '1px solid var(--color-primary)' : '1px solid transparent',
                }}
              >
                <div
                  className="more-sheet-item-icon"
                  style={{
                    background: isItemActive ? 'var(--brand-gradient)' : undefined,
                    color: isItemActive ? '#fff' : undefined,
                  }}
                >
                  <Icon name={item.icon} size={22} strokeWidth={isItemActive ? 2.2 : 1.8} />
                </div>
                <div className="more-sheet-item-info">
                  <span className="more-sheet-item-label">{item.label}</span>
                  <span className="more-sheet-item-desc">{item.description}</span>
                </div>
                <div className="more-sheet-item-chevron">
                  <Icon name="chevron-left" size={18} />
                </div>
              </button>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
