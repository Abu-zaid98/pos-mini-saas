/**
 * EmptyState — شاشة الحالة الفارغة الموحدة
 * تُعرض عندما لا توجد نتائج بحث، أو عندما تكون القائمة فارغة
 */
import type { ReactNode, CSSProperties } from 'react'
import { Icon, type IconName } from './Icon'

interface EmptyStateProps {
  icon?: IconName
  title: string
  description?: string
  action?: ReactNode
  className?: string
  style?: CSSProperties
}

export function EmptyState({
  icon = 'package',
  title,
  description,
  action,
  className = '',
  style,
}: EmptyStateProps) {
  return (
    <div className={`empty-state-v2 ${className}`} style={style}>
      <div className="empty-state-icon-wrap">
        <Icon name={icon} size={28} />
      </div>
      <div className="empty-state-title">{title}</div>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}
