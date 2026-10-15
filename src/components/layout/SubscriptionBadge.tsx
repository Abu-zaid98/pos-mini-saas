import { useEffect, useState } from 'react'
import { lic } from '../../lib/license'

const DAY_MS = 86_400_000

interface BadgeInfo {
  name: string | null
  daysLeft: number
  inGrace: boolean
}

/**
 * اسم المشترك والمدة المتبقية للاشتراك — يظهر في الهيدر:
 * - فوق تاريخ اليوم في كل الصفحات.
 * - بجانب كلمة «كاشير» في صفحة الكاشير.
 */
export function SubscriptionBadge() {
  const [info, setInfo] = useState<BadgeInfo | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const details = await lic.getDetails()
        if (!mounted || !details) return
        const now = Date.now()
        const inGrace = now > details.expiryMs
        const endMs = details.expiryMs + details.graceDays * DAY_MS
        const daysLeft = Math.max(0, Math.ceil(((inGrace ? endMs : details.expiryMs) - now) / DAY_MS))
        setInfo({ name: lic.getUser(), daysLeft, inGrace })
      } catch {
        // لا نكسر الهيدر بسبب فشل القراءة
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [])

  if (!info) return null
  const { name, daysLeft, inGrace } = info

  const daysLabel =
    daysLeft === 0
      ? 'اليوم الأخير'
      : daysLeft <= 1
        ? 'يوم واحد'
        : daysLeft <= 2
          ? 'يومان'
          : `${daysLeft} يوم`

  const label = `${name ? `${name} — ` : ''}${inGrace ? 'فترة سماح: ' : 'المتبقي: '}${daysLabel}`

  return (
    <span className="subscription-badge" title={label}>
      {name && (
        <>
          <span aria-hidden="true">👤</span>
          <span className="subscription-badge-name">{name}</span>
        </>
      )}
      <span className={`subscription-badge-days${inGrace ? ' is-grace' : ''}`}>
        <span aria-hidden="true">{inGrace ? '⚠️' : '⏳'}</span>
        {daysLabel}
      </span>
    </span>
  )
}
