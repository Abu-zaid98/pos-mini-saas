/**
 * PageHeader — ترويسة صفحة داخلية موحّدة
 * أيقونة داخل مربع ملوّن + عنوان واضح + وصف مختصر + إجراءات اختيارية.
 * مطابقة لشكل صفحة المصاريف (المرجع) لتوحيد جميع الصفحات الداخلية.
 */
import type { CSSProperties, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface PageHeaderProps {
  icon: IconName
  title: string
  subtitle?: string
  actions?: ReactNode
  /** تدرّج مخصص لمربع الأيقونة (افتراضياً الهوية التركوازية) */
  iconGradient?: string
  style?: CSSProperties
}

export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
  iconGradient,
  style,
}: PageHeaderProps) {
  return (
    <div className="page-head" style={style}>
      <div className="page-head-main">
        <div
          className="page-head-icon"
          style={iconGradient ? { background: iconGradient } : undefined}
        >
          <Icon name={icon} size={22} />
        </div>
        <div className="page-head-titles">
          <h2 className="page-head-title">{title}</h2>
          {subtitle && <p className="page-head-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </div>
  )
}
