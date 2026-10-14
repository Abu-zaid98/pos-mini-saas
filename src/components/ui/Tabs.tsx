/**
 * Tabs — مكون التبويبات الموحد (Segmented Control)
 * يحل محل كل تبديلات الصفحات المبنية بـ inline styles
 */
import { Icon, type IconName } from './Icon'

export interface TabItem {
  value: string
  label: string
  /** أيقونة اختيارية (SVG) */
  icon?: IconName
  /** شارة عددية — تُعرض فقط إذا كانت موجودة */
  badge?: number | string
}

interface TabsProps {
  tabs: TabItem[]
  value: string
  onChange: (value: string) => void
  className?: string
  /** حجم الأيقونات */
  iconSize?: number
}

/**
 * مكون تبويب موحد يعمل في جميع الصفحات
 *
 * @example
 * <Tabs
 *   value={activeTab}
 *   onChange={setActiveTab}
 *   tabs={[
 *     { value: 'catalog', label: 'المنتجات', icon: 'package' },
 *     { value: 'cart',    label: 'السلة',    icon: 'cart', badge: 3 },
 *   ]}
 * />
 */
export function Tabs({ tabs, value, onChange, className = '', iconSize = 16 }: TabsProps) {
  return (
    <div className={`tabs-container ${className}`} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`tab-item${isActive ? ' active' : ''}`}
            onClick={() => onChange(tab.value)}
          >
            {tab.icon && <Icon name={tab.icon} size={iconSize} strokeWidth={isActive ? 2 : 1.5} />}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className="tab-badge">{tab.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
