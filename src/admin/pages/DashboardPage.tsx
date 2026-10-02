/**
 * DashboardPage.tsx — الصفحة الرئيسية للوحة التحكم
 * إحصائيات فورية + أحدث المشتركين
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSubscriptions } from '../hooks/useSubscriptions'
import { computeStatus } from '../subscriptions'
import { BulkRemindModal } from '../components/BulkRemindModal'
import type { Subscription } from '../types'

const STATUS_CONFIG = {
  active: { label: 'نشط', color: 'success', icon: '✓' },
  trial: { label: 'تجريبي', color: 'info', icon: '⏳' },
  grace: { label: 'فترة سماح', color: 'warning', icon: '⚠' },
  expired: { label: 'منتهي', color: 'error', icon: '✕' },
  suspended: { label: 'موقوف', color: 'muted', icon: '⊘' },
} as const

export function DashboardPage() {
  const { subscriptions, stats, loading, error, refresh } = useSubscriptions()
  const [showRemind, setShowRemind] = useState(false)

  useEffect(() => {
    refresh()
  }, [refresh])

  const expiringSubs = useMemo(() => subscriptions.filter((s) => {
    const status = computeStatus(s)
    if (status !== 'active' && status !== 'trial') return false
    const daysLeft = Math.ceil((s.expiryDate.getTime() - Date.now()) / 86400000)
    return daysLeft <= 7 && daysLeft >= 0
  }), [subscriptions])

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="admin-spinner-lg" />
        <p>جارٍ تحميل البيانات...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-error-state">
        <p>{error}</p>
        <button className="admin-btn-secondary" onClick={refresh}>إعادة المحاولة</button>
      </div>
    )
  }

  const recentSubs = subscriptions.slice(0, 5)

  return (
    <div className="admin-page">
      {/* Hero Header */}
      <div className="admin-dashboard-hero">
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', color: '#fff' }}>👋 لوحة البيانات</h1>
            <p style={{ fontSize: 13, margin: 0, color: 'rgba(255,255,255,0.75)' }}>
              نظرة حية على الاشتراكات — {stats ? `${stats.total} مشترك · ${stats.active} نشط · ${stats.expiringSoon} ينتهي قريباً` : 'جارٍ التحميل...'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="admin-btn-secondary admin-btn-sm" onClick={refresh} aria-label="تحديث" style={{ background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 7a6 6 0 1011.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M12 2v3H9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>تحديث</span>
            </button>
            <Link to="/admin/subscribers" className="admin-btn-primary admin-btn-sm" style={{ background: '#fff', color: '#1d1d1f' }}>
              + مشترك جديد
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid — clickable */}
      {stats && (
        <div className="admin-stats-grid">
          <Link to="/admin/subscribers" className="admin-stat-link">
            <StatCard
              label="إجمالي المشتركين"
              value={stats.total}
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="14" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M1 17c0-3 3.134-5 7-5s7 2 7 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M14 14c1.657 0 4 .895 4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              color="default"
            />
          </Link>
          <Link to="/admin/subscribers?filter=active" className="admin-stat-link">
            <StatCard
              label="نشطون"
              value={stats.active}
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 10l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
              color="success"
            />
          </Link>
          <Link to="/admin/subscribers?filter=trial" className="admin-stat-link">
            <StatCard
              label="تجريبيون"
              value={stats.trial}
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              color="info"
            />
          </Link>
          <Link to="/admin/subscribers?filter=grace" className="admin-stat-link">
            <StatCard
              label="فترة سماح"
              value={stats.grace}
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2l2 6h6l-5 3.5 2 6L10 14l-5 3.5 2-6L2 8h6L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              }
              color="warning"
            />
          </Link>
          <Link to="/admin/subscribers?filter=expired" className="admin-stat-link">
            <StatCard
              label="منتهون"
              value={stats.expired}
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              color="error"
            />
          </Link>
          <Link to="/admin/subscribers?filter=expiring" className="admin-stat-link">
            <StatCard
              label="ينتهون قريباً"
              value={stats.expiringSoon}
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 3v7l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              }
              color="warning"
              note="خلال 7 أيام"
            />
          </Link>
        </div>
      )}

      {/* Charts Row */}
      <div className="admin-grid-2">
        {/* Status Distribution */}
        <div className="admin-card-panel">
          <h3 className="admin-panel-title">توزيع الحالات</h3>
          {stats && (
            <div className="admin-status-bars">
              {[
                { key: 'active', label: 'نشط', value: stats.active, total: stats.total },
                { key: 'trial', label: 'تجريبي', value: stats.trial, total: stats.total },
                { key: 'grace', label: 'فترة سماح', value: stats.grace, total: stats.total },
                { key: 'expired', label: 'منتهي', value: stats.expired, total: stats.total },
                { key: 'suspended', label: 'موقوف', value: stats.suspended, total: stats.total },
              ].map((item) => (
                <div key={item.key} className="admin-status-bar-row">
                  <span className="admin-status-bar-label">{item.label}</span>
                  <div className="admin-status-bar-track">
                    <div
                      className={`admin-status-bar-fill admin-bar-${item.key}`}
                      style={{ width: item.total > 0 ? `${(item.value / item.total) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="admin-status-bar-count">{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expiring Soon */}
        <div className="admin-card-panel">
          <div className="admin-panel-header">
            <h3 className="admin-panel-title">تنتهي قريباً</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="admin-btn-wa admin-btn-xs" onClick={() => setShowRemind(true)} style={{ border: 'none', cursor: 'pointer' }} title={expiringSubs.length === 0 ? 'لا يوجد من تنتهي اشتراكاتهم حالياً' : `تذكير ${expiringSubs.length} مشترك`}>
                💬 تذكير الكل{expiringSubs.length > 0 ? ` (${expiringSubs.length})` : ''}
              </button>
              <Link to="/admin/subscribers?filter=expiring" className="admin-panel-link">عرض الكل</Link>
            </div>
          </div>
          <div className="admin-mini-list">
            {subscriptions
              .filter((s) => {
                const status = computeStatus(s)
                if (status !== 'active' && status !== 'trial') return false
                const daysLeft = Math.ceil((s.expiryDate.getTime() - Date.now()) / 86400000)
                return daysLeft <= 7 && daysLeft >= 0
              })
              .slice(0, 4)
              .map((s) => {
                const daysLeft = Math.ceil((s.expiryDate.getTime() - Date.now()) / 86400000)
                return (
                  <Link key={s.id} to={`/admin/subscribers/${s.id}`} className="admin-mini-item">
                    <div className="admin-mini-avatar">{s.username.charAt(0).toUpperCase()}</div>
                    <div className="admin-mini-info">
                      <div className="admin-mini-name">{s.displayName || s.username}</div>
                      <div className="admin-mini-sub">{s.email}</div>
                    </div>
                    <div className={`admin-days-badge ${daysLeft <= 2 ? 'days-critical' : 'days-warning'}`}>
                      {daysLeft} يوم
                    </div>
                  </Link>
                )
              })}
            {subscriptions.filter((s) => {
              const status = computeStatus(s)
              if (status !== 'active' && status !== 'trial') return false
              const daysLeft = Math.ceil((s.expiryDate.getTime() - Date.now()) / 86400000)
              return daysLeft <= 7 && daysLeft >= 0
            }).length === 0 && (
              <div className="admin-empty-mini">لا توجد اشتراكات تنتهي قريباً 🎉</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Subscribers */}
      <div className="admin-card-panel">
        <div className="admin-panel-header">
          <h3 className="admin-panel-title">آخر المشتركين</h3>
          <Link to="/admin/subscribers" className="admin-panel-link">عرض الكل</Link>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>المشترك</th>
                <th>الحالة</th>
                <th>تاريخ الانتهاء</th>
                <th>الأيام المتبقية</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentSubs.map((sub) => (
                <SubscriberRow key={sub.id} sub={sub} />
              ))}
              {recentSubs.length === 0 && (
                <tr>
                  <td colSpan={5} className="admin-table-empty">
                    لا يوجد مشتركون بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk remind modal */}
      {showRemind && (
        <BulkRemindModal subs={expiringSubs} onClose={() => setShowRemind(false)} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
  note,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: 'default' | 'success' | 'info' | 'warning' | 'error'
  note?: string
}) {
  return (
    <div className={`admin-stat-card admin-stat-${color}`}>
      <div className="admin-stat-icon">{icon}</div>
      <div className="admin-stat-content">
        <div className="admin-stat-value">{value.toLocaleString('ar')}</div>
        <div className="admin-stat-label">{label}</div>
        {note && <div className="admin-stat-note">{note}</div>}
      </div>
    </div>
  )
}

function SubscriberRow({ sub }: { sub: Subscription }) {
  const status = computeStatus(sub)
  const cfg = STATUS_CONFIG[status]
  const daysLeft = Math.ceil((sub.expiryDate.getTime() - Date.now()) / 86400000)

  return (
    <tr>
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
        <span className={`admin-badge admin-badge-${cfg.color}`}>
          {cfg.icon} {cfg.label}
        </span>
      </td>
      <td className="admin-table-date">
        {sub.expiryDate.toLocaleDateString('ar')}
      </td>
      <td>
        <span className={daysLeft > 7 ? 'admin-days-ok' : daysLeft >= 0 ? 'admin-days-warn' : 'admin-days-expired'}>
          {daysLeft > 0 ? `${daysLeft} يوم` : daysLeft === 0 ? 'اليوم الأخير' : 'انتهى'}
        </span>
      </td>
      <td>
        <Link to={`/admin/subscribers/${sub.id}`} className="admin-table-action">
          عرض
        </Link>
      </td>
    </tr>
  )
}
