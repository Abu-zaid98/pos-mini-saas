/**
 * BulkRemindModal.tsx — التذكير الجماعي عبر واتساب
 * يمر على المشتركين واحداً واحداً: معاينة الرسالة + فتح المحادثة + تتبع التقدم
 * (متصفحات الويب تمنع فتح نوافذ متعددة دفعة واحدة — لذلك التنقل خطوة بخطوة)
 */
import { useMemo, useState } from 'react'
import { buildRenewalWhatsApp } from '../subscriptions'
import type { Subscription } from '../types'

interface Props {
  subs: Subscription[]
  onClose: () => void
}

function todayKey(): string {
  return `wa_reminded_${new Date().toISOString().slice(0, 10)}`
}

function loadReminded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(todayKey()) || '[]') as string[])
  } catch {
    return new Set()
  }
}

function extractMessage(waUrl: string): string {
  try {
    return new URL(waUrl).searchParams.get('text') || ''
  } catch {
    return ''
  }
}

export function BulkRemindModal({ subs, onClose }: Props) {
  const [reminded, setReminded] = useState<Set<string>>(loadReminded)
  const [index, setIndex] = useState(() => {
    const done = loadReminded()
    const firstPending = subs.findIndex((s) => !done.has(s.id))
    return firstPending >= 0 ? firstPending : 0
  })
  const [copied, setCopied] = useState(false)

  const pending = useMemo(() => subs.filter((s) => !reminded.has(s.id)), [subs, reminded])
  const current = subs[index] ?? null
  const waLink = current ? buildRenewalWhatsApp(current) : ''
  const message = waLink ? extractMessage(waLink) : ''
  const finished = pending.length === 0

  const markReminded = (id: string) => {
    setReminded((prev) => {
      const next = new Set(prev)
      next.add(id)
      localStorage.setItem(todayKey(), JSON.stringify([...next]))
      return next
    })
  }

  const openWhatsApp = () => {
    if (!current) return
    window.open(waLink, '_blank', 'noopener')
    markReminded(current.id)
    goNext()
  }

  const goNext = () => {
    // انتقل لأول مشترك لم يُذكّر بعده
    const nextIdx = subs.findIndex((s, i) => i > index && !reminded.has(s.id))
    if (nextIdx >= 0) {
      setIndex(nextIdx)
    } else {
      const firstPending = subs.findIndex((s) => !reminded.has(s.id) && s.id !== current?.id)
      setIndex(firstPending >= 0 ? firstPending : index)
    }
  }

  const copyMessage = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const pct = subs.length === 0 ? 100 : Math.round(((subs.length - pending.length) / subs.length) * 100)

  if (subs.length === 0) {
    return (
      <div className="admin-modal-overlay" onClick={onClose}>
        <div className="admin-modal admin-modal-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="التذكير الجماعي">
          <div className="admin-modal-header">
            <h2 className="admin-modal-title">💬 تذكير المشتركين</h2>
            <button className="admin-modal-close" onClick={onClose} aria-label="إغلاق">✕</button>
          </div>
          <div className="admin-empty-state" style={{ padding: '20px 10px' }}>
            <div className="admin-empty-icon">🎉</div>
            <p className="admin-empty-title">لا يوجد من يستحق التذكير</p>
            <p className="admin-empty-desc">لا توجد اشتراكات تنتهي خلال 7 أيام حالياً.</p>
          </div>
          <div className="admin-modal-footer" style={{ justifyContent: 'center' }}>
            <button className="admin-btn-primary" onClick={onClose}>إغلاق</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="التذكير الجماعي">
        <div className="admin-modal-header">
          <h2 className="admin-modal-title">💬 تذكير المشتركين ({subs.length})</h2>
          <button className="admin-modal-close" onClick={onClose} aria-label="إغلاق">✕</button>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--a-text-3)', marginBottom: 6 }}>
            <span>تم تذكير {subs.length - pending.length} من {subs.length}</span>
            <span>{pct}%</span>
          </div>
          <div className="admin-status-bar-track" style={{ height: 8 }}>
            <div className="admin-status-bar-fill admin-bar-active" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {finished ? (
          <div className="admin-modal-success">
            <div className="admin-success-icon">✓</div>
            <h2 className="admin-modal-title">أحسنت! تم تذكير الجميع 🎉</h2>
            <p className="admin-success-note">سُجلت التذكيرات بتاريخ اليوم ولن تظهر هذه القائمة مجدداً اليوم.</p>
            <div className="admin-modal-footer" style={{ justifyContent: 'center' }}>
              <button className="admin-btn-primary" onClick={onClose}>إغلاق</button>
            </div>
          </div>
        ) : current ? (
          <>
            {/* Subscriber card */}
            <div className="admin-form-section" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="admin-sub-card-avatar">{current.username.charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{current.displayName || current.username}</div>
                  <div style={{ fontSize: 12, color: 'var(--a-text-3)', direction: 'ltr', textAlign: 'right' }}>
                    {current.phone || current.email}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--a-text-3)' }}>
                  {index + 1} / {subs.length}
                </span>
              </div>
            </div>

            {/* Message preview */}
            <div className="admin-field" style={{ marginBottom: 12 }}>
              <label className="admin-label">📩 نص الرسالة الجاهزة</label>
              <div className="admin-token-wrap">
                <code className="admin-token-text" style={{ whiteSpace: 'pre-wrap' }}>{message}</code>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="admin-btn-wa" onClick={openWhatsApp} style={{ flex: 1, justifyContent: 'center', padding: '10px' }}>
                💬 فتح واتساب والتذكير
              </button>
              <button className="admin-btn-secondary admin-btn-sm" onClick={copyMessage}>
                {copied ? '✓ تم النسخ' : '📋 نسخ'}
              </button>
              <button className="admin-btn-secondary admin-btn-sm" onClick={goNext}>
                تخطي ⏭
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
