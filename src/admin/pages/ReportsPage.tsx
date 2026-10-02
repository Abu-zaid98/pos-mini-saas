/**
 * ReportsPage.tsx — تقارير اللوحة: الإيرادات، النمو، المشاركة
 * رسوم SVG بدون مكتبات + تصدير CSV
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSubscriptions } from '../hooks/useSubscriptions'
import { computeStatus, getActivityLog } from '../subscriptions'
import { getPayments, bucketByMonth } from '../billing'
import { getAllSessions } from '../sessions'
import { activeDevices } from '../../lib/session-policy'
import type { PaymentRecord, ActivityLog } from '../types'

function BarChart({ data, formatValue }: {
  data: Array<{ label: string; value: number }>
  formatValue?: (v: number) => string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const last = data.slice(-6)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, paddingTop: 8 }}>
      {last.length === 0 && <p className="admin-empty-desc">لا توجد بيانات بعد</p>}
      {last.map((d) => (
        <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--a-text-2)', whiteSpace: 'nowrap' }}>
            {formatValue ? formatValue(d.value) : d.value}
          </span>
          <div
            title={`${d.label}: ${d.value}`}
            style={{
              width: '100%',
              maxWidth: 44,
              height: Math.max(6, (d.value / max) * 100),
              borderRadius: '6px 6px 3px 3px',
              background: 'linear-gradient(180deg, var(--a-accent), rgba(0,113,227,0.35))',
            }}
          />
          <span style={{ fontSize: 10, color: 'var(--a-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ReportsPage() {
  const { subscriptions, stats, loading: subsLoading, refresh } = useSubscriptions()
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [multiCount, setMultiCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    refresh()
    Promise.all([getPayments(500), getActivityLog(300), getAllSessions()])
      .then(([pay, act, sessions]) => {
        setPayments(pay)
        setActivity(act)
        const now = Date.now()
        setMultiCount(
          sessions.filter(
            (s) =>
              activeDevices(
                s.devices.map((d) => ({ id: d.id, seen: d.seen.getTime() })),
                now
              ).length >= 2
          ).length
        )
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [refresh])

  const revenueByMonth = useMemo(
    () => bucketByMonth(payments, (p) => p.createdAt, (p) => p.amount),
    [payments]
  )
  const newSubsByMonth = useMemo(
    () => bucketByMonth(subscriptions, (s) => s.createdAt),
    [subscriptions]
  )

  const thisMonthKey = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const monthRevenue = revenueByMonth.find((b) => b.key === thisMonthKey)
  const totalRevenue = useMemo(() => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0), [payments])
  const renewedThisMonth = useMemo(
    () => activity.filter((a) => a.action === 'renewed' || a.action === 'payment_recorded').length,
    [activity]
  )

  const expiring30 = useMemo(() => {
    const now = Date.now()
    return subscriptions.filter((s) => {
      const st = computeStatus(s)
      if (st !== 'active' && st !== 'trial') return false
      const days = Math.ceil((s.expiryDate.getTime() - now) / 86400000)
      return days <= 30 && days >= 0
    }).length
  }, [subscriptions])

  const exportPayments = () => {
    const header = ['receiptNo', 'date', 'email', 'amount', 'currency', 'method']
    const rows = payments.map((p) => [
      p.receiptNo,
      p.createdAt.toISOString().slice(0, 10),
      p.subscriberEmail,
      String(p.amount),
      p.currency,
      p.method,
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revenue-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (subsLoading && loading) {
    return (
      <div className="admin-loading">
        <div className="admin-spinner-lg" />
        <p>جارٍ تجهيز التقارير...</p>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">التقارير</h1>
          <p className="admin-page-desc">الإيرادات والنمو والمشاركة — تُحسب لحظياً</p>
        </div>
        <button className="admin-btn-secondary admin-btn-sm" onClick={exportPayments} disabled={payments.length === 0}>
          ⬇ تصدير المدفوعات CSV
        </button>
      </div>

      {/* KPI cards */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card admin-stat-success">
          <div className="admin-stat-icon">💰</div>
          <div className="admin-stat-content">
            <div className="admin-stat-value">{totalRevenue.toLocaleString('ar')} ₪</div>
            <div className="admin-stat-label">إجمالي المحصّل</div>
          </div>
        </div>
        <div className="admin-stat-card admin-stat-info">
          <div className="admin-stat-icon">📅</div>
          <div className="admin-stat-content">
            <div className="admin-stat-value">{(monthRevenue?.sum || 0).toLocaleString('ar')} ₪</div>
            <div className="admin-stat-label">محصّل هذا الشهر ({monthRevenue?.count || 0} دفعة)</div>
          </div>
        </div>
        <div className="admin-stat-card admin-stat-default">
          <div className="admin-stat-icon">🔄</div>
          <div className="admin-stat-content">
            <div className="admin-stat-value">{renewedThisMonth}</div>
            <div className="admin-stat-label">تجديدات مسجلة</div>
          </div>
        </div>
        <div className="admin-stat-card admin-stat-warning">
          <div className="admin-stat-icon">⏳</div>
          <div className="admin-stat-content">
            <div className="admin-stat-value">{expiring30}</div>
            <div className="admin-stat-label">ينتهي خلال 30 يوم</div>
          </div>
        </div>
        <div className="admin-stat-card admin-stat-default">
          <div className="admin-stat-icon">👥</div>
          <div className="admin-stat-content">
            <div className="admin-stat-value">{stats?.total || subscriptions.length}</div>
            <div className="admin-stat-label">إجمالي المشتركين</div>
          </div>
        </div>
        <div className={`admin-stat-card ${multiCount > 0 ? 'admin-stat-error' : 'admin-stat-success'}`}>
          <div className="admin-stat-icon">📱</div>
          <div className="admin-stat-content">
            <div className="admin-stat-value">{multiCount}</div>
            <div className="admin-stat-label">مشاركة حسابات نشطة الآن</div>
          </div>
        </div>
      </div>

      <div className="admin-grid-2">
        {/* Revenue chart */}
        <div className="admin-card-panel">
          <div className="admin-panel-header">
            <h3 className="admin-panel-title">الإيراد الشهري (₪)</h3>
            <Link to="/admin/billing" className="admin-panel-link">الفوترة</Link>
          </div>
          <BarChart data={revenueByMonth.map((b) => ({ label: b.label, value: b.sum }))} formatValue={(v) => v.toLocaleString('ar')} />
        </div>

        {/* Growth chart */}
        <div className="admin-card-panel">
          <div className="admin-panel-header">
            <h3 className="admin-panel-title">مشتركون جدد شهرياً</h3>
            <Link to="/admin/subscribers" className="admin-panel-link">المشتركون</Link>
          </div>
          <BarChart data={newSubsByMonth.map((b) => ({ label: b.label, value: b.count }))} />
        </div>
      </div>

      {/* Payments by method */}
      <div className="admin-card-panel">
        <h3 className="admin-panel-title">المدفوعات حسب الطريقة</h3>
        <div className="admin-status-bars">
          {(['cash', 'transfer', 'other'] as const).map((m) => {
            const list = payments.filter((p) => p.method === m)
            const sum = list.reduce((s, p) => s + (Number(p.amount) || 0), 0)
            const label = m === 'cash' ? 'نقدي' : m === 'transfer' ? 'تحويل' : 'أخرى'
            return (
              <div key={m} className="admin-status-bar-row">
                <span className="admin-status-bar-label">{label}</span>
                <div className="admin-status-bar-track">
                  <div
                    className="admin-status-bar-fill admin-bar-active"
                    style={{ width: totalRevenue > 0 ? `${(sum / totalRevenue) * 100}%` : '0%' }}
                  />
                </div>
                <span className="admin-status-bar-count" style={{ width: 'auto' }}>
                  {sum.toLocaleString('ar')} ₪ ({list.length})
                </span>
              </div>
            )
          })}
          {payments.length === 0 && <p className="admin-empty-desc">لا توجد مدفوعات مسجلة بعد — تُسجل تلقائياً عند التجديد بمبلغ.</p>}
        </div>
      </div>
    </div>
  )
}
