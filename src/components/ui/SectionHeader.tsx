/**
 * SectionHeader — ترويسة القسم الموحدة
 * توفر عنواناً مع شريط ملون وإجراء اختياري (مثل "عرض الكل" أو زر إضافة)
 */
import type { ReactNode, CSSProperties } from 'react'

interface SectionHeaderProps {
  title: string
  action?: ReactNode
  className?: string
  style?: CSSProperties
}

export function SectionHeader({ title, action, className = '', style }: SectionHeaderProps) {
  return (
    <div className={`section-header-v2 ${className}`} style={style}>
      <div className="section-header-title">
        <span className="section-header-bar" />
        <span>{title}</span>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
