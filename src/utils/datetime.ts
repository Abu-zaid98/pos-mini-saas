/**
 * Unified date/time formatting for the whole app (POS + admin panel).
 *
 * The format matches the persistent app header exactly:
 *   date → dd/mm/yyyy    (Latin digits, zero-padded)   e.g. 15/10/2026
 *   time → h:mm م/ص      (Latin digits, 12-hour clock) e.g. 3:45 م
 */

type DateInput = Date | number | string

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

const timeFormatter = new Intl.DateTimeFormat('ar-PS', {
  hour: 'numeric',
  minute: '2-digit',
  numberingSystem: 'latn',
})

const weekdayFormatter = new Intl.DateTimeFormat('ar-PS', { weekday: 'long' })

/** dd/mm/yyyy — e.g. 15/10/2026 */
export function formatDate(value: DateInput): string {
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** h:mm م/ص — e.g. 3:45 م */
export function formatTime(value: DateInput): string {
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return ''
  return timeFormatter.format(d)
}

/** dd/mm/yyyy · h:mm م/ص — e.g. 15/10/2026 · 3:45 م */
export function formatDateTime(value: DateInput): string {
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${formatDate(d)} · ${formatTime(d)}`
}

/** Arabic weekday name — e.g. الخميس */
export function formatWeekday(value: DateInput): string {
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return ''
  return weekdayFormatter.format(d)
}
