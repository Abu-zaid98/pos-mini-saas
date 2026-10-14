/**
 * StatCard — بطاقة الإحصاء الموحدة (KPI Card)
 * تحل محل جميع بطاقات الإحصاء المبنية بـ inline styles في الصفحات
 */
import { Icon, type IconName } from './Icon'

type StatVariant = 'brand' | 'info' | 'warning' | 'danger' | 'success' | 'default'

interface StatCardProps {
  label: string
  value: string | number
  icon?: IconName
  variant?: StatVariant
  sub?: string
  onClick?: () => void
  /** إظهار العملة باتجاه LTR */
  ltr?: boolean
}

/**
 * بطاقة إحصاء موحدة بخط أعلى ملوّن
 *
 * @example
 * <StatCard label="إجمالي المنتجات" value={products.length} icon="package" variant="info" />
 * <StatCard label="مخزون منخفض"    value={12}               icon="warning" variant="warning" />
 * <StatCard label="قيمة المخزون"   value="5,280 ₪"          icon="banknotes" variant="success" ltr />
 */
export function StatCard({
  label,
  value,
  icon,
  variant = 'brand',
  sub,
  onClick,
  ltr = false,
}: StatCardProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={`stat-card-v2 variant-${variant}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer', border: 'none', fontFamily: 'var(--font-main)', textAlign: 'right', width: '100%' } : undefined}
      type={onClick ? 'button' : undefined}
    >
      <div className="stat-card-header">
        <div className="stat-card-label">{label}</div>
        {icon && (
          <div className="stat-card-icon">
            <Icon name={icon} size={16} strokeWidth={2} />
          </div>
        )}
      </div>
      <div className="stat-card-value" style={ltr ? { direction: 'ltr', textAlign: 'right' } : undefined}>
        {value}
      </div>
      {sub && <div className="stat-card-label" style={{ marginTop: 2 }}>{sub}</div>}
    </Tag>
  )
}
