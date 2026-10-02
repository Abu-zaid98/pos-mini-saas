/**
 * AdminsPage.tsx — إدارة حسابات المدراء من اللوحة
 * إنشاء (Auth + مستند admins بدون كلمة مرور) + تفعيل/إيقاف + حذف
 * المدير لا يستطيع المساس بحسابه هو — حماية من القفل الذاتي
 */
import { useCallback, useEffect, useState } from 'react'
import { auth } from '../firebase'
import { getAllAdmins, createAdmin, setAdminActive, deleteAdmin } from '../admins'
import { useToast, useConfirm } from '../components/feedback'
import type { AdminUser } from '../types'

export function AdminsPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const toast = useToast()
  const confirmAction = useConfirm()

  const myUid = auth.currentUser?.uid || ''

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setAdmins(await getAllAdmins())
    } catch (e) {
      const msg = (e as Error).message || 'خطأ في التحميل'
      setError(
        msg.includes('permission-denied') || msg.includes('insufficient permissions')
          ? '⛔ صلاحيات غير كافية — يجب نشر firestore.rules وتسجيل حسابك في مجموعة admins'
          : msg
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleToggle = async (admin: AdminUser) => {
    const ok = await confirmAction({
      title: admin.active ? 'إيقاف هذا المدير؟' : 'تفعيل هذا المدير؟',
      message: admin.active
        ? `سيفقد ${admin.email} دخول اللوحة فوراً.`
        : `سيستعيد ${admin.email} دخول اللوحة فوراً.`,
      confirmLabel: admin.active ? 'إيقاف' : 'تفعيل',
      danger: admin.active,
    })
    if (!ok) return
    setActionLoading(true)
    try {
      await setAdminActive(admin.uid, !admin.active)
      await refresh()
      toast.success(admin.active ? 'تم إيقاف المدير' : 'تم تفعيل المدير')
    } catch (e) {
      toast.error('فشل العملية', (e as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteAdmin(deleteTarget.uid)
      setDeleteTarget(null)
      await refresh()
      toast.success('تم حذف المدير')
    } catch (e) {
      toast.error('فشل الحذف', (e as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">المدراء</h1>
          <p className="admin-page-desc">
            {admins.length} {admins.length === 1 ? 'مدير' : 'مدراء'} — كلمات المرور في Auth فقط ولا تُحفظ هنا أبداً
          </p>
        </div>
        <button className="admin-btn-primary admin-btn-sm" onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>مدير جديد</span>
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
          <button className="admin-btn-secondary" onClick={refresh}>إعادة المحاولة</button>
        </div>
      ) : admins.length === 0 ? (
        <div className="admin-empty-state">
          <div className="admin-empty-icon">🛡️</div>
          <p className="admin-empty-title">لا يوجد مدراء مسجلون</p>
          <p className="admin-empty-desc">اضغط "مدير جديد" لإضافة أول مدير</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="admin-card-panel admin-table-container">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>المدير</th>
                    <th>الحالة</th>
                    <th>أُنشئ بواسطة</th>
                    <th>تاريخ الإنشاء</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((a) => (
                    <AdminRow key={a.uid} admin={a} isMe={a.uid === myUid} busy={actionLoading} onToggle={() => handleToggle(a)} onDelete={() => setDeleteTarget(a)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="admin-subscriber-cards">
            {admins.map((a) => (
              <div key={a.uid} className="admin-sub-card">
                <div className="admin-sub-card-header">
                  <div className="admin-sub-card-avatar">{a.email.charAt(0).toUpperCase()}</div>
                  <div className="admin-sub-card-info">
                    <div className="admin-sub-card-name">
                      {a.displayName || a.email}
                      {a.uid === myUid && ' (أنت)'}
                    </div>
                    <div className="admin-sub-card-email">{a.email}</div>
                  </div>
                  <span className={`admin-badge ${a.active ? 'admin-badge-success' : 'admin-badge-muted'}`}>
                    {a.active ? '✓ نشط' : '⊘ موقوف'}
                  </span>
                </div>
                {a.uid !== myUid && (
                  <div className="admin-sub-card-footer" style={{ gap: 8 }}>
                    <button className="admin-btn-secondary admin-btn-xs" disabled={actionLoading} onClick={() => handleToggle(a)} style={{ flex: 1, justifyContent: 'center' }}>
                      {a.active ? 'إيقاف' : 'تفعيل'}
                    </button>
                    <button className="admin-btn-danger admin-btn-xs" disabled={actionLoading} onClick={() => setDeleteTarget(a)} style={{ flex: 1, justifyContent: 'center' }}>
                      حذف
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {showCreate && (
        <CreateAdminModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            toast.success('تم إنشاء المدير بنجاح')
            refresh()
          }}
        />
      )}

      {deleteTarget && (
        <div className="admin-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="admin-modal admin-modal-sm" onClick={(e) => e.stopPropagation()} role="alertdialog">
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">⚠️ حذف المدير</h2>
            </div>
            <p className="admin-modal-body">
              سيتم حذف <strong>{deleteTarget.email}</strong> من المدراء ويفقد دخول اللوحة فوراً.
              <br />
              <span style={{ fontSize: 12, color: 'var(--a-text-3)' }}>
                ملاحظة: حساب الدخول يبقى في Authentication — احذفه من الكونسول للإزالة الكاملة.
              </span>
            </p>
            <div className="admin-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setDeleteTarget(null)}>إلغاء</button>
              <button className="admin-btn-danger" onClick={handleDelete} disabled={actionLoading}>
                {actionLoading ? <><span className="admin-spinner" /> جارٍ الحذف...</> : 'حذف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────

function AdminRow({ admin, isMe, busy, onToggle, onDelete }: {
  admin: AdminUser
  isMe: boolean
  busy: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <tr>
      <td>
        <div className="admin-table-user">
          <div className="admin-table-avatar">{admin.email.charAt(0).toUpperCase()}</div>
          <div>
            <div className="admin-table-name">
              {admin.displayName || admin.email}
              {isMe && <span className="admin-badge admin-badge-info" style={{ marginRight: 8 }}>أنت</span>}
            </div>
            <div className="admin-table-email">{admin.email}</div>
          </div>
        </div>
      </td>
      <td>
        <span className={`admin-badge ${admin.active ? 'admin-badge-success' : 'admin-badge-muted'}`}>
          {admin.active ? '✓ نشط' : '⊘ موقوف'}
        </span>
      </td>
      <td style={{ fontSize: 12 }}>{admin.createdBy || '—'}</td>
      <td className="admin-table-date">{admin.createdAt.toLocaleDateString('ar')}</td>
      <td>
        {isMe ? (
          <span className="admin-table-empty-cell">حسابك الحالي</span>
        ) : (
          <div className="admin-row-actions">
            <button className="admin-table-action" disabled={busy} onClick={onToggle} style={{ cursor: 'pointer', background: 'none' }}>
              {admin.active ? 'إيقاف' : 'تفعيل'}
            </button>
            <button className="admin-table-action" disabled={busy} onClick={onDelete} style={{ cursor: 'pointer', background: 'none', color: 'var(--a-error-text)', borderColor: 'rgba(255,59,48,0.3)' }}>
              حذف
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────

function CreateAdminModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('البريد الإلكتروني مطلوب'); return }
    if (password.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return }
    setLoading(true)
    try {
      await createAdmin({ email, password, displayName: displayName.trim() || undefined })
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="إنشاء مدير جديد">
        <div className="admin-modal-header">
          <h2 className="admin-modal-title">🛡️ مدير جديد</h2>
          <button className="admin-modal-close" onClick={onClose} aria-label="إغلاق">✕</button>
        </div>

        <div className="admin-alert admin-alert-error" style={{ marginBottom: 12, background: 'var(--a-info-bg)', color: 'var(--a-info-text)', borderColor: 'rgba(0,122,255,0.2)' }}>
          <span>🔐</span>
          <span>كلمة المرور تُستخدم لإنشاء حساب الدخول فقط ولا تُحفظ في قاعدة البيانات أبداً.</span>
        </div>

        {error && (
          <div className="admin-alert admin-alert-error" style={{ marginBottom: 12 }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="admin-form">
          <div className="admin-field">
            <label className="admin-label">البريد الإلكتروني <span className="admin-required">*</span></label>
            <input
              type="email"
              className="admin-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              dir="ltr"
              required
              autoFocus
            />
          </div>
          <div className="admin-field">
            <label className="admin-label">كلمة المرور <span className="admin-required">*</span></label>
            <div className="admin-input-wrap">
              <input
                type={showPw ? 'text' : 'password'}
                className="admin-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6 أحرف على الأقل"
                dir="ltr"
                required
              />
              <button type="button" className="admin-input-eye" onClick={() => setShowPw((v) => !v)} aria-label="إظهار">
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div className="admin-field">
            <label className="admin-label">الاسم (اختياري)</label>
            <input
              type="text"
              className="admin-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="اسم المدير"
            />
          </div>
          <div className="admin-modal-footer">
            <button type="button" className="admin-btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="admin-btn-primary" disabled={loading}>
              {loading ? <><span className="admin-spinner" /> جارٍ الإنشاء...</> : '✓ إنشاء المدير'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
