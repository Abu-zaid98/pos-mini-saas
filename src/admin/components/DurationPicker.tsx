/**
 * DurationPicker.tsx — منتقي المدة الاحترافي (أيام + ساعات + تاريخ مخصص)
 * مستخدم في الإنشاء والتجديد والتمديد
 */
import { useMemo } from 'react'
import { calcExpiryMsPrecise, formatDurationAr, toDatetimeLocalValue } from '../crypto'

export interface DurationValue {
  days: number
  hours: number
  customExpiryMs: number | null
}

interface Props {
  value: DurationValue
  onChange: (v: DurationValue) => void
  /** التاريخ المرجعي الذي تُحسب منه المدة (الآن أو تاريخ الانتهاء) */
  baseDate: Date
  showCustom?: boolean
}

const PRESETS: { days: number; hours: number; label: string; trial?: boolean }[] = [
  { days: 0, hours: 12, label: '12 ساعة' },
  { days: 1, hours: 0, label: 'يوم' },
  { days: 3, hours: 0, label: '3 أيام', trial: true },
  { days: 7, hours: 0, label: 'أسبوع' },
  { days: 30, hours: 0, label: 'شهر' },
  { days: 90, hours: 0, label: '3 أشهر' },
  { days: 180, hours: 0, label: '6 أشهر' },
  { days: 365, hours: 0, label: 'سنة' },
]

function Stepper({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  const dec = () => onChange(Math.max(min, +(value - step).toFixed(1)))
  const inc = () => onChange(Math.min(max, +(value + step).toFixed(1)))
  return (
    <div className="admin-stepper">
      <span className="admin-stepper-label">{label}</span>
      <div className="admin-stepper-controls">
        <button type="button" className="admin-stepper-btn" onClick={dec} disabled={value <= min} aria-label={`إنقاص ${label}`}>−</button>
        <div className="admin-stepper-value">
          <input
            type="number"
            className="admin-stepper-input"
            value={value}
            min={min}
            max={max}
            step={step}
            dir="ltr"
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
            }}
          />
          <span className="admin-stepper-unit">{unit}</span>
        </div>
        <button type="button" className="admin-stepper-btn admin-stepper-plus" onClick={inc} disabled={value >= max} aria-label={`زيادة ${label}`}>+</button>
      </div>
    </div>
  )
}

export function DurationPicker({ value, onChange, baseDate, showCustom = true }: Props) {
  const previewExpiry = useMemo(() => {
    if (value.customExpiryMs) return new Date(value.customExpiryMs)
    return new Date(calcExpiryMsPrecise(baseDate, value.days, value.hours))
  }, [value, baseDate])

  const isCustom = value.customExpiryMs != null

  return (
    <div className="admin-duration">
      {/* Presets */}
      <div className="admin-quick-days admin-presets">
        {PRESETS.map((p) => {
          const active = !isCustom && value.days === p.days && value.hours === p.hours
          return (
            <button
              key={p.label}
              type="button"
              className={`admin-day-chip ${active ? 'active' : ''} ${p.trial ? 'admin-chip-trial' : ''}`}
              onClick={() => onChange({ days: p.days, hours: p.hours, customExpiryMs: null })}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Steppers */}
      <div className="admin-steppers-grid">
        <Stepper label="الأيام" unit="يوم" value={value.days} min={0} max={3650} onChange={(days) => onChange({ ...value, days, customExpiryMs: null })} />
        <Stepper label="الساعات" unit="ساعة" value={value.hours} min={0} max={720} onChange={(hours) => onChange({ ...value, hours, customExpiryMs: null })} />
      </div>

      {/* Custom datetime */}
      {showCustom && (
        <div className="admin-field">
          <label className="admin-label">🗓 أو حدد تاريخ انتهاء دقيق (يوم + ساعة)</label>
          <input
            type="datetime-local"
            className="admin-input admin-input-sm"
            dir="ltr"
            value={value.customExpiryMs ? toDatetimeLocalValue(new Date(value.customExpiryMs)) : ''}
            min={toDatetimeLocalValue(new Date())}
            onChange={(e) => {
              const t = new Date(e.target.value).getTime()
              onChange({ ...value, customExpiryMs: Number.isFinite(t) ? t : null })
            }}
          />
          {isCustom && (
            <button type="button" className="admin-btn-secondary admin-btn-xs" onClick={() => onChange({ ...value, customExpiryMs: null })}>
              ✕ العودة للمدة
            </button>
          )}
        </div>
      )}

      {/* Live preview */}
      <div className="admin-expiry-preview">
        <span className="admin-expiry-preview-icon">⏳</span>
        <div>
          <div className="admin-expiry-preview-label">
            {isCustom ? 'ينتهي في تاريخ محدد' : `المدة: ${formatDurationAr(value.days, value.hours)}`}
          </div>
          <div className="admin-expiry-preview-date">
            {previewExpiry.toLocaleString('ar', { dateStyle: 'full', timeStyle: 'short' })}
          </div>
        </div>
      </div>
    </div>
  )
}
