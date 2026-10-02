/**
 * ActivityPage.tsx — سجل النشاط
 */
import { useEffect, useState } from 'react'
import { getActivityLog } from '../subscriptions'
import type { ActivityLog } from '../types'

const ACTION_CONFIG = {
  created: { label: 'إنشاء اشتراك', icon: '✚', color: 'success' },
  renewed: { label: 'تجديد اشتراك', icon: '🔄', color: 'info' },
  adjusted: { label: 'تعديل المدة', icon: '⏱', color: 'info' },
  expiry_set: { label: 'تعيين الانتهاء', icon: '📅', color: 'warning' },
  suspended: { label: 'تعليق اشتراك', icon: '⊘', color: 'warning' },
  reactivated: { label: 'إعادة تفعيل', icon: '✓', color: 'success' },
  deleted: { label: 'حذف اشتراك', icon: '🗑️', color: 'error' },
  token_issued: { label: 'إصدار توكن', icon: '🔑', color: 'muted' },
  admin_created: { label: 'إنشاء مدير', icon: '🛡️', color: 'success' },
  admin_updated: { label: 'تعديل مدير', icon: '✏️', color: 'info' },
  admin_deleted: { label: 'حذف مدير', icon: '🗑️', color: 'error' },
  devices_reset: { label: 'إدارة الأجهزة', icon: '📱', color: 'warning' },
  payment_recorded: { label: 'تسجيل دفعة', icon: '💰', color: 'success' },
} as const

export function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadLogs = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getActivityLog(100)
      setLogs(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">سجل النشاط</h1>
          <p className="admin-page-desc">سجل كامل بجميع العمليات التي تمت على الاشتراكات</p>
        </div>
        <button className="admin-btn-secondary admin-btn-sm" onClick={loadLogs}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 7a6 6 0 1011.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M12 2v3H9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>تحديث</span>
        </button>
      </div>

      {loading ? (
        <div className="admin-loading">
          <div className="admin-spinner-lg" />
          <p>جارٍ التحميل...</p>
        </div>
      ) : error ? (
        <div className="admin-error-state">
          <p>{error}</p>
          <button className="admin-btn-secondary" onClick={loadLogs}>إعادة المحاولة</button>
        </div>
      ) : logs.length === 0 ? (
        <div className="admin-empty-state">
          <div className="admin-empty-icon">📋</div>
          <p className="admin-empty-title">لا يوجد سجل نشاط بعد</p>
        </div>
      ) : (
        <div className="admin-card-panel">
          <div className="admin-activity-list">
            {logs.map((log, i) => {
              const cfg = ACTION_CONFIG[log.action] || { label: log.action, icon: '•', color: 'muted' }
              return (
                <div key={log.id || i} className="admin-activity-item">
                  <div className={`admin-activity-icon admin-badge-${cfg.color}`}>
                    {cfg.icon}
                  </div>
                  <div className="admin-activity-content">
                    <div className="admin-activity-title">
                      <span className="admin-activity-action">{cfg.label}</span>
                      <span className="admin-activity-subscriber">{log.subscriberEmail}</span>
                    </div>
                    {log.details && (
                      <div className="admin-activity-details">{log.details}</div>
                    )}
                    <div className="admin-activity-meta">
                      <span>بواسطة: {log.adminEmail}</span>
                      <span>·</span>
                      <span>{log.timestamp.toLocaleString('ar')}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
