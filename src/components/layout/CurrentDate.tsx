import { useEffect, useState } from 'react'
import { formatDate, formatTime, formatWeekday } from '../../utils/datetime'

function getNow() {
  return new Date()
}

/** Compact live date for the persistent application header. */
export function CurrentDate() {
  const [now, setNow] = useState(getNow)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(getNow()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const day = formatWeekday(now)
  const date = formatDate(now)
  const time = formatTime(now)

  return (
    <div className="current-date" aria-label={`${day}، ${date}، ${time}`}>
      <span className="current-date-calendar">📅</span>
      <span>
        <strong>{day}</strong>
        <small>{date} · {time}</small>
      </span>
    </div>
  )
}
