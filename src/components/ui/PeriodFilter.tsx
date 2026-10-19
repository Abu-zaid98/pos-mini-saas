/**
 * PeriodFilter.tsx — فلتر الفترات الموحّد (اختصارات + فترة مخصصة من – إلى).
 *
 * يحل محل التكرار في كل الشاشات: تبويبات/قائمة فترة + حقلي تاريخ عاديين،
 * ويستخدم منتقي التاريخ المخصّص نفسه في كل المشروع.
 */
import { CustomSelect } from './CustomSelect'
import { Tabs } from './Tabs'
import { DatePicker } from './DatePicker'
import { presetRange, rangeDays, rangeLabel } from '../../utils/dateRange'

export interface PeriodOption {
  value: string
  label: string
}

/** الاختصارات المعتادة للشاشات التي تدعم كل الفترات */
export const PERIOD_TABS_ALL: PeriodOption[] = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'آخر 7 أيام' },
  { value: 'month', label: 'هذا الشهر' },
  { value: 'all', label: 'كل الفترات' },
  { value: 'custom', label: 'مخصص' },
]

interface PeriodFilterProps {
  period: string
  onPeriodChange: (period: string) => void
  /** قيمة تاريخ البداية YYYY-MM-DD ('' يعني مفتوح من اليمين) */
  from: string
  /** قيمة تاريخ النهاية YYYY-MM-DD ('' يعني مفتوح من اليسار) */
  to: string
  onRangeChange: (from: string, to: string) => void
  /** الاختصارات المتاحة (افتراضياً: اليوم / آخر 7 / هذا الشهر / الكل / مخصص) */
  options?: PeriodOption[]
  /** شكل الاختيار: تبويبات أو قائمة منسدلة */
  variant?: 'tabs' | 'select'
  /** عنوان القائمة المنسدلة */
  label?: string
  className?: string
}

/** اختصارات سريعة داخل لوحة الفترة المخصصة */
const QUICK_RANGES: PeriodOption[] = [
  { value: 'today', label: 'اليوم' },
  { value: 'yesterday', label: 'أمس' },
  { value: 'week', label: 'آخر 7 أيام' },
  { value: 'month', label: 'هذا الشهر' },
  { value: 'lastMonth', label: 'الشهر الماضي' },
]

export function PeriodFilter({
  period,
  onPeriodChange,
  from,
  to,
  onRangeChange,
  options = PERIOD_TABS_ALL,
  variant = 'tabs',
  label = 'الفترة',
  className = '',
}: PeriodFilterProps) {
  const handleChange = (value: string) => {
    onPeriodChange(value)
    if (value !== 'custom') onRangeChange('', '')
  }

  return (
    <div className={`period-filter ${className}`}>
      {variant === 'select' ? (
        <CustomSelect
          label={label}
          value={period}
          onChange={handleChange}
          options={options}
        />
      ) : (
        <>
          <div className="period-filter-title">الفترة الزمنية</div>
          <Tabs tabs={options} value={period} onChange={handleChange} />
        </>
      )}

      {period === 'custom' && (
        <div className="period-filter-custom">
          <div className="period-quick">
            {QUICK_RANGES.map((q) => (
              <button
                key={q.value}
                type="button"
                className="period-quick-chip"
                onClick={() => {
                  const r = presetRange(q.value)
                  onRangeChange(r.from, r.to)
                }}
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="period-range-fields">
            <DatePicker
              label="من تاريخ"
              value={from}
              max={to || undefined}
              onChange={(v) => onRangeChange(v, to)}
            />
            <DatePicker
              label="إلى تاريخ"
              value={to}
              min={from || undefined}
              onChange={(v) => onRangeChange(from, v)}
            />
          </div>

          <div className="period-range-foot">
            <span className="period-range-summary">
              {rangeLabel(from, to)}
              {from && to && ` · ${rangeDays(from, to)} يوم`}
            </span>
            {(from || to) && (
              <button
                type="button"
                className="period-range-clear"
                onClick={() => onRangeChange('', '')}
              >
                مسح التاريخ
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}