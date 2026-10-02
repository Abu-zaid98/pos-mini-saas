import { useEffect, useState } from 'react'

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

  const day = new Intl.DateTimeFormat('ar-PS', { weekday: 'long' }).format(now)
  const date = new Intl.DateTimeFormat('ar-PS', { day: 'numeric', month: 'short', year: 'numeric' }).format(now)
  const time = new Intl.DateTimeFormat('ar-PS', { hour: 'numeric', minute: '2-digit' }).format(now)

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
