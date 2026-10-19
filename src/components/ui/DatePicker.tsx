/**
 * DatePicker.tsx — منتقي تاريخ مخصّص (بديل input[type=date]).
 *
 * يحافظ على قيمة `YYYY-MM-DD` (نفس صيغة الحقول القديمة) فيسهل استبدال
 * أي `<input type="date">` دون تغيير منطق الفلترة، مع مظهر متناسق مع
 * ثيم المتجر (فاتح/داكن) واتجاه RTL.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AR_MONTHS,
  formatDateKey,
  pad2,
  parseDateKey,
  toDateKey,
} from '../../utils/dateRange'

const WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
const POPOVER_WIDTH = 300

export interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  /** أقل تاريخ مسموح (YYYY-MM-DD) */
  min?: string
  /** أكبر تاريخ مسموح (YYYY-MM-DD) */
  max?: string
  disabled?: boolean
  className?: string
  id?: string
}

interface Cell {
  key: string
  date: Date
  inMonth: boolean
}

function buildMonthGrid(year: number, month: number): Cell[] {
  const first = new Date(year, month, 1)
  // ترتيب الأسبوع: الأحد أول يوم (getDay = 0)
  const offset = first.getDay()
  const start = new Date(year, month, 1 - offset)
  const cells: Cell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    cells.push({ key: toDateKey(d), date: d, inMonth: d.getMonth() === month })
  }
  // اقتطع الصف الأخير إن كان فارغاً تماماً
  return cells
}

export function DatePicker({
  value,
  onChange,
  label,
  placeholder = 'اختر التاريخ',
  min,
  max,
  disabled = false,
  className = '',
  id,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => parseDateKey(value) ?? new Date())
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({})

  const selected = parseDateKey(value)
  const todayKey = toDateKey(new Date())
  const today = useMemo(() => parseDateKey(todayKey) as Date, [todayKey])

  useEffect(() => {
    if (!open) return
    // month ويبدأ من الشهر المختار أو شهر اليوم
    const base = selected ?? today
    setMonth(new Date(base.getFullYear(), base.getMonth(), 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const place = () => {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const maxHeight = 420
      const spaceBelow = window.innerHeight - rect.bottom
      const openUp = spaceBelow < maxHeight + 24 && rect.top > spaceBelow
      const left = Math.min(
        Math.max(8, rect.left),
        window.innerWidth - POPOVER_WIDTH - 8,
      )
      setPopStyle({
        position: 'fixed',
        zIndex: 460,
        width: POPOVER_WIDTH,
        left,
        ...(openUp
          ? { bottom: Math.max(8, window.innerHeight - rect.top + 6) }
          : { top: rect.bottom + 6 }),
      })
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!popRef.current?.contains(t) && !wrapRef.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    place()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown as EventListener, { passive: true })
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown as EventListener)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
    }
  }, [open, selected])

  const grid = useMemo(
    () => buildMonthGrid(month.getFullYear(), month.getMonth()),
    [month],
  )

  const isDisabled = (key: string) =>
    (!!min && key < min) || (!!max && key > max)

  const goMonth = (delta: number) => {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  }

  const goYear = (delta: number) => {
    setMonth((m) => new Date(m.getFullYear() + delta, m.getMonth(), 1))
  }

  const displayText = value ? formatDateKey(value) : ''

  const trigger = (
    <button
      ref={triggerRef}
      id={id}
      type="button"
      className={`date-picker-trigger ${open ? 'is-open' : ''}`}
      onClick={() => setOpen((v) => !v)}
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <span className={value ? 'date-picker-value' : 'date-picker-placeholder'}>
        {value ? displayText : placeholder}
      </span>
      {value ? (
        <span
          className="date-picker-clear"
          role="button"
          tabIndex={-1}
          aria-label="مسح التاريخ"
          onClick={(e) => {
            e.stopPropagation()
            onChange('')
          }}
        >
          ×
        </span>
      ) : (
        <span className="date-picker-icon" aria-hidden>📅</span>
      )}
    </button>
  )

  const popover = open
    ? createPortal(
        <div
          ref={popRef}
          className="date-picker-pop"
          style={popStyle}
          role="dialog"
          aria-label="اختيار التاريخ"
        >
          <div className="date-picker-head">
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => goYear(-1)}
              aria-label="السنة السابقة"
            >
              »
            </button>
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => goMonth(-1)}
              aria-label="الشهر السابق"
            >
              ‹
            </button>
            <div className="date-picker-title">
              {AR_MONTHS[month.getMonth()]} {month.getFullYear()}
            </div>
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => goMonth(1)}
              aria-label="الشهر التالي"
            >
              ›
            </button>
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => goYear(1)}
              aria-label="السنة التالية"
            >
              «
            </button>
          </div>

          <div className="date-picker-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w} className="date-picker-weekday">{w}</span>
            ))}
          </div>

          <div className="date-picker-grid">
            {grid.map((cell) => {
              const isSelected = cell.key === value
              const isToday = cell.key === todayKey
              const disabled = isDisabled(cell.key)
              return (
                <button
                  key={cell.key}
                  type="button"
                  className={[
                    'date-picker-day',
                    cell.inMonth ? '' : 'is-outside',
                    isToday ? 'is-today' : '',
                    isSelected ? 'is-selected' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (disabled) return
                    onChange(cell.key)
                    setOpen(false)
                  }}
                >
                  {cell.date.getDate()}
                </button>
              )
            })}
          </div>

          <div className="date-picker-foot">
            <button
              type="button"
              className="date-picker-foot-btn"
              onClick={() => {
                if (!isDisabled(todayKey)) {
                  onChange(todayKey)
                  setOpen(false)
                }
              }}
            >
              اليوم
            </button>
            <button
              type="button"
              className="date-picker-foot-btn is-primary"
              onClick={() => setOpen(false)}
            >
              تم
            </button>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <div className={`date-picker ${className}`} ref={wrapRef}>
      {label && <label className="input-label">{label}</label>}
      {trigger}
      {popover}
    </div>
  )
}

/** إجمالي أيام الشهر بصيغة `2026-10` — للاختبارات والاستخدامات العامة */
export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}