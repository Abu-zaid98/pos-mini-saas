/**
 * dateRange.ts — منطق موحّد للفترات الزمنية وفلاتر «من – إلى».
 *
 * كل الشاشات تستخدم مفاتيح تاريخ بصيغة YYYY-MM-DD (قيمة <input type="date">
 * سابقاً)، لكن المقارنة هنا تتم محلياً (local time) لتفادي إزاحة المناطق
 * الزمنية، وتكون نهاية الفترة شاملة لليوم كامل.
 */

const DAY_MS = 86_400_000

export type PeriodKey =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'lastMonth'
  | 'custom'

export interface DateRangeValue {
  from: string
  to: string
}

export const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** تاريخ محلي → YYYY-MM-DD */
export function toDateKey(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const d = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** YYYY-MM-DD → تاريخ محلي عند منتصف الليل (أو null) */
export function parseDateKey(key: string | null | undefined): Date | null {
  if (!key) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isFinite(d.getTime()) ? d : null
}

export function startOfDay(value: Date | string | number = new Date()): Date {
  const d = value instanceof Date ? value : new Date(value)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(value: Date | string | number, days: number): Date {
  const d = value instanceof Date ? new Date(value) : new Date(value)
  d.setDate(d.getDate() + days)
  return d
}

/** أول يوم من الشهر التالي — نهاية حصرية مريحة للمقارنة */
export function nextMonthStart(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
}

/** آخر لحظة في اليوم (حصرية) — منتصف ليل اليوم التالي */
export function endOfDayExclusive(value: Date | string | number): Date {
  return addDays(startOfDay(value), 1)
}

/** نطاق جاهز لأي اختيار سريع — تواريخ YYYY-MM-DD */
export function presetRange(preset: string, now = new Date()): DateRangeValue {
  const today = startOfDay(now)
  switch (preset) {
    case 'today':
      return { from: toDateKey(today), to: toDateKey(today) }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { from: toDateKey(y), to: toDateKey(y) }
    }
    case 'week':
      return { from: toDateKey(addDays(today, -6)), to: toDateKey(today) }
    case 'month':
      return {
        from: toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: toDateKey(today),
      }
    case 'lastMonth':
      return {
        from: toDateKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toDateKey(new Date(now.getFullYear(), now.getMonth(), 0)),
      }
    default:
      return { from: '', to: '' }
  }
}

function toTime(value: Date | string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return NaN
  return (value instanceof Date ? value : new Date(value)).getTime()
}

/**
 * هل تقع القيمة داخل الفترة المحددة؟
 * - نهاية الفترة (`to`) شاملة لليوم كامل.
 * - الفترة المخصصة بلا تاريخين = كل التواريخ.
 */
export function withinPeriod(
  value: Date | string | number | null | undefined,
  period: string,
  from?: string | null,
  to?: string | null,
  now = new Date(),
): boolean {
  if (!period || period === 'all') return true
  const t = toTime(value)
  if (!Number.isFinite(t)) return false

  const today = startOfDay(now)
  const todayTs = today.getTime()

  switch (period) {
    case 'today':
      return t >= todayTs && t < addDays(today, 1).getTime()
    case 'yesterday':
      return t >= addDays(today, -1).getTime() && t < todayTs
    case 'week':
      return t >= addDays(today, -6).getTime() && t < addDays(today, 1).getTime()
    case 'month':
      return (
        t >= new Date(now.getFullYear(), now.getMonth(), 1).getTime() &&
        t < addDays(today, 1).getTime()
      )
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
      const end = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      return t >= start && t < end
    }
    case 'custom': {
      const f = parseDateKey(from)
      const e = parseDateKey(to)
      if (f && t < f.getTime()) return false
      if (e && t >= addDays(e, 1).getTime()) return false
      return true
    }
    default:
      return true
  }
}

/** هل يقع تاريخ داخل نطاق مفتوح (from/to قد يكونان فارغين)؟ */
export function withinRange(
  value: Date | string | number | null | undefined,
  from?: string | null,
  to?: string | null,
): boolean {
  return withinPeriod(value, 'custom', from, to)
}

/** dd/mm/yyyy — لاتيني بأصفار بادئة */
export function formatDateKey(key: string | null | undefined): string {
  const d = parseDateKey(key)
  if (!d) return ''
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** «01/10/2026 ← 19/10/2026» أو «كل التواريخ» */
export function rangeLabel(from?: string | null, to?: string | null): string {
  const f = formatDateKey(from)
  const t = formatDateKey(to)
  if (!f && !t) return 'كل التواريخ'
  if (f && t) return `${f} ← ${t}`
  if (f) return `من ${f}`
  return `حتى ${t}`
}

/** عدد الأيام في النطاق (شامل) — مفيد للعرض */
export function rangeDays(from?: string | null, to?: string | null): number {
  const f = parseDateKey(from)
  const t = parseDateKey(to)
  if (!f || !t) return 0
  return Math.max(0, Math.round((startOfDay(t).getTime() - startOfDay(f).getTime()) / DAY_MS) + 1)
}

/** هل مفتاح التاريخ صالح؟ */
export function isValidDateKey(key: string | null | undefined): boolean {
  return parseDateKey(key) !== null
}
