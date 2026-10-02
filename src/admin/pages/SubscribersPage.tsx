/**
 * SubscribersPage.tsx — إدارة المشتركين (نسخة احترافية)
 * بحث + فلترة + فرز + تصدير CSV + sticky toolbar + سكرول داخلي
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSubscriptions } from '../hooks/useSubscriptions'
import { computeStatus, buildRenewalWhatsApp, buildExpiredWhatsApp } from '../subscriptions'
import { hasPrivateKey } from '../crypto'
import { CreateSubscriberModal } from '../components/CreateSubscriberModal'
import { BulkRemindModal } from '../components/BulkRemindModal'
import { useToast } from '../components/feedback'
import type { Subscription, SubscriptionStatus } from '../types'

const APP_ID = import.meta.env.VITE_LIC_APP_ID || '1374790599531web0b22b9db833219122b122e'

const STATUS_CONFIG: Record<SubscriptionStatus, { label: string; color: string; icon: string }> = {
  active: { label: 'نشط', color: 'success', icon: '✓' },
  trial: { label: 'تجريبي', color: 'info', icon: '⏳' },
  grace: { label: 'فترة سماح', color: 'warning', icon: '⚠' },
  expired: { label: 'منتهي', color: 'error', icon: '✕' },
  suspended: { label: 'موقوف', color: 'muted', icon: '⊘' },
}

type FilterType = 'all' | SubscriptionStatus | 'expiring'
type SortType = 'newest' | 'expiry-asc' | 'expiry-desc' | 'name'

const FILTERS: [FilterType, string][] = [
  ['all', 'الكل'],
  ['active', 'نشط'],
  ['trial', 'تجريبي'],
  ['grace', 'فترة سماح'],
  ['expired', 'منتهي'],
  ['suspended', 'موقوف'],
  ['expiring', 'ينتهي قريباً'],
]

function daysLeftOf(sub: Subscription): number {
  return Math.ceil((sub.expiryDate.getTime() - Date.now()) / 86400000)
}

function isExpiringSoon(sub: Subscription): boolean {
  const status = computeStatus(sub)
  if (status !== 'active' && status !== 'trial') return false
  const d = daysLeftOf(sub)
  return d <= 7 && d >= 0
}

export function SubscribersPage() {
  const { subscriptions, loading, error, refresh } = useSubscriptions()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>(
    (searchParams.get('filter') as FilterType) || 'all'
  )
  const [sort, setSort] = useState<SortType>('newest')
  const [showCreate, setShowCreate] = useState(false)
  const [showRemind, setShowRemind] = useState(false)
  const toast = useToast()
  const [hasPK, setHasPK] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    refresh()
    setHasPK(hasPrivateKey(APP_ID))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const f = searchParams.get('filter') as FilterType
    if (f) setFilter(f)
  }, [searchParams])

  // اختصار "/" للتركيز على البحث
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleFilterChange = (f: FilterType) => {
    setFilter(f)
    const next = new URLSearchParams(searchParams)
    if (f === 'all') next.delete('filter')
    else next.set('filter', f)
    setSearchParams(next, { replace: true })
  }

  const filterCounts = useMemo(() => {
    const by = (fn: (s: Subscription) => boolean) => subscriptions.filter(fn).length
    return {
      all: subscriptions.length,
      active: by((s) => computeStatus(s) === 'active'),
      trial: by((s) => computeStatus(s) === 'trial'),
      grace: by((s) => computeStatus(s) === 'grace'),
      expired: by((s) => computeStatus(s) === 'expired'),
      suspended: by((s) => computeStatus(s) === 'suspended'),
      expiring: by(isExpiringSoon),
    }
  }, [subscriptions])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = subscriptions.filter((sub) => {
      const matchSearch =
        !q ||
        sub.username.toLowerCase().includes(q) ||
        sub.email.toLowerCase().includes(q) ||
        (sub.displayName?.toLowerCase().includes(q) ?? false) ||
        (sub.phone?.includes(q) ?? false)
      if (!matchSearch) return false
      if (filter === 'all') return true
      if (filter === 'expiring') return isExpiringSoon(sub)
      return computeStatus(sub) === filter
    })

    const sorted = [...list]
    switch (sort) {
      case 'expiry-asc':
        sorted.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())
        break
      case 'expiry-desc':
        sorted.sort((a, b) => b.expiryDate.getTime() - a.expiryDate.getTime())
        break
      case 'name':
        sorted.sort((a, b) =>
          (a.displayName || a.username).localeCompare(b.displayName || b.username, 'ar')
        )
        break
      case 'newest':
      default:
        sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        break
    }
    return sorted
  }, [subscriptions, search, filter, sort])

  const exportCSV = () => {
    const header = ['username', 'email', 'displayName', 'phone', 'status', 'expiryDate', 'daysLeft']
    const rows = filtered.map((s) => [
      s.username,
      s.email,
      s.displayName || '',
      s.phone || '',
      computeStatus(s),
      s.expiryDate.toISOString().slice(0, 10),
      String(daysLeftOf(s)),
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscribers-${filter}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">المشتركون</h1>
          <p className="admin-page-desc">
            {subscriptions.length} مشترك إجمالاً
            {search || filter !== 'all' ? ` — ${filtered.length} نتيجة معروضة` : ''}
          </p>
        </div>
        <div className="admin-toolbar-row">
          <button
            className="admin-btn-secondary admin-btn-sm"
            onClick={refresh}
            disabled={loading}
            title="تحديث القائمة"
          >
            {loading ? '⏳' : '↻'} تحديث
          </button>
          <button
            className="admin-btn-secondary admin-btn-sm"
            onClick={exportCSV}
            disabled={filtered.length === 0}
            title="تصدير النتائج CSV"
          >
            ⬇ تصدير
          </button>
          <button
            id="create-subscriber-btn"
            className="admin-btn-primary admin-btn-sm"
            onClick={() => {
              if (!hasPK) {
                toast.error('لا يوجد مفتاح خاص', 'اذهب إلى صفحة المفاتيح وأنشئ أو استورد المفتاح أولاً')
                return
              }
              setShowCreate(true)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span>مشترك جديد</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="admin-toolbar-card">
        <div className="admin-toolbar-row">
          <div className="admin-filter-pills" role="tablist" aria-label="فلترة حسب الحالة">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={filter === key}
                className={`admin-filter-pill ${filter === key ? 'active' : ''}`}
                onClick={() => handleFilterChange(key)}
              >
                {label}
                <span className="admin-filter-count">
                  {filterCounts[key as keyof typeof filterCounts]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="admin-toolbar-row">
          <div className="admin-search-wrap" style={{ maxWidth: 420 }}>
            <svg className="admin-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              placeholder="ابحث باسم أو إيميل أو هاتف... ( / )"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="admin-search-input"
            />
            {search && (
              <button className="admin-search-clear" onClick={() => setSearch('')} aria-label="مسح">
                ✕
              </button>
            )}
          </div>

          <div className="admin-sort-wrap">
            <span className="admin-sort-label">ترتيب:</span>
            <select
              className="admin-sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortType)}
              aria-label="ترتيب النتائج"
            >
              <option value="newest">الأحدث أولاً</option>
              <option value="expiry-asc">الأقرب للانتهاء</option>
              <option value="expiry-desc">الأبعد انتهاءً</option>
              <option value="name">أبجدي</option>
            </select>
          </div>
        </div>

        <div className="admin-results-bar">
          <span className="admin-results-count">
            عرض {filtered.length} من {subscriptions.length}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {filtered.length > 0 && (
              <button
                className="admin-btn-wa admin-btn-xs"
                onClick={() => setShowRemind(true)}
                style={{ border: 'none', cursor: 'pointer' }}
                title="تذكير المشتركين في القائمة الحالية عبر واتساب"
              >
                💬 تذكير القائمة ({filtered.length})
              </button>
            )}
            {(search || filter !== 'all') && (
              <button
                className="admin-btn-secondary admin-btn-xs"
                onClick={() => {
                  setSearch('')
                  handleFilterChange('all')
                }}
              >
                ✕ مسح الفلاتر
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading && subscriptions.length === 0 ? (
        <div className="admin-card-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="admin-skeleton-row">
              <div className="admin-skeleton" style={{ width: 38, height: 38, borderRadius: '50%' }} />
              <div style={{ flex: 1 }}>
                <div className="admin-skeleton" style={{ height: 13, width: '40%', marginBottom: 8 }} />
                <div className="admin-skeleton" style={{ height: 11, width: '60%' }} />
              </div>
              <div className="admin-skeleton" style={{ width: 70, height: 24, borderRadius: 20 }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="admin-error-state">
          <p>{error}</p>
          <button className="admin-btn-secondary" onClick={refresh}>إعادة المحاولة</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty-state">
          <div className="admin-empty-icon">👥</div>
          <p className="admin-empty-title">{search ? 'لا توجد نتائج' : 'لا يوجد مشتركون بعد'}</p>
          <p className="admin-empty-desc">
            {search ? `لم يُعثر على مشتركين بكلمة "${search}"` : 'اضغط "مشترك جديد" لإضافة أول مشترك'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="admin-card-panel admin-table-container">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>المشترك</th>
                    <th>الهاتف</th>
                    <th>الحالة</th>
                    <th>الانتهاء</th>
                    <th>المتبقي</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sub) => (
                    <SubscriberTableRow key={sub.id} sub={sub} onRefresh={refresh} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="admin-subscriber-cards">
            {filtered.map((sub) => (
              <SubscriberMobileCard key={sub.id} sub={sub} />
            ))}
          </div>
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateSubscriberModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            toast.success('تم إنشاء المشترك بنجاح')
            refresh()
          }}
        />
      )}

      {/* Bulk remind modal */}
      {showRemind && (
        <BulkRemindModal subs={filtered} onClose={() => setShowRemind(false)} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────

function SubscriberTableRow({ sub, onRefresh }: { sub: Subscription; onRefresh: () => void }) {
  void onRefresh
  const status = computeStatus(sub)
  const cfg = STATUS_CONFIG[status]
  const daysLeft = daysLeftOf(sub)
  const expiring = isExpiringSoon(sub)

  const waLink = status === 'expired' || status === 'grace'
    ? buildExpiredWhatsApp(sub)
    : buildRenewalWhatsApp(sub)

  return (
    <tr className={expiring ? 'admin-row-warning' : ''}>
      <td>
        <div className="admin-table-user">
          <div className="admin-table-avatar">{sub.username.charAt(0).toUpperCase()}</div>
          <div>
            <div className="admin-table-name">{sub.displayName || sub.username}</div>
            <div className="admin-table-email">{sub.email}</div>
          </div>
        </div>
      </td>
      <td>
        {sub.phone ? (
          <a href={`https://wa.me/${sub.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="admin-phone-link">
            {sub.phone}
          </a>
        ) : (
          <span className="admin-table-empty-cell">—</span>
        )}
      </td>
      <td>
        <span className={`admin-badge admin-badge-${cfg.color}`}>
          {cfg.icon} {cfg.label}
        </span>
      </td>
      <td className="admin-table-date">
        {sub.expiryDate.toLocaleDateString('ar')}
      </td>
      <td>
        <span className={
          daysLeft > 7 ? 'admin-days-ok' :
          daysLeft >= 0 ? 'admin-days-warn' :
          'admin-days-expired'
        }>
          {daysLeft > 0 ? `${daysLeft} يوم` : daysLeft === 0 ? 'اليوم الأخير' : 'انتهى'}
        </span>
      </td>
      <td>
        <div className="admin-row-actions">
          <Link to={`/admin/subscribers/${sub.id}`} className="admin-table-action">
            إدارة
          </Link>
          {(status === 'expired' || status === 'grace' || expiring) && (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="admin-table-action admin-table-action-wa"
              title="إرسال رسالة واتساب"
            >
              💬
            </a>
          )}
        </div>
      </td>
    </tr>
  )
}

function SubscriberMobileCard({ sub }: { sub: Subscription }) {
  const status = computeStatus(sub)
  const cfg = STATUS_CONFIG[status]
  const daysLeft = daysLeftOf(sub)

  return (
    <Link to={`/admin/subscribers/${sub.id}`} className="admin-sub-card">
      <div className="admin-sub-card-header">
        <div className="admin-sub-card-avatar">{sub.username.charAt(0).toUpperCase()}</div>
        <div className="admin-sub-card-info">
          <div className="admin-sub-card-name">{sub.displayName || sub.username}</div>
          <div className="admin-sub-card-email">{sub.email}</div>
        </div>
        <span className={`admin-badge admin-badge-${cfg.color}`}>{cfg.icon} {cfg.label}</span>
      </div>
      <div className="admin-sub-card-footer">
        <span className="admin-sub-card-date">
          📅 {sub.expiryDate.toLocaleDateString('ar')}
        </span>
        <span className={daysLeft > 7 ? 'admin-days-ok' : daysLeft >= 0 ? 'admin-days-warn' : 'admin-days-expired'}>
          {daysLeft > 0 ? `${daysLeft} يوم` : daysLeft === 0 ? 'اليوم الأخير' : 'انتهى'}
        </span>
      </div>
    </Link>
  )
}
