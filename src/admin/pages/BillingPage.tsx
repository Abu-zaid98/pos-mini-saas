/**
 * BillingPage.tsx — الفوترة: سجل المدفوعات والإيصالات + خطط الأسعار
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getPayments,
  getDefaultCurrency,
  PLAN_PRESETS,
  type PaymentMethodId,
} from '../billing'
import { buildReceiptWhatsApp } from '../billing'
import type { Plan, PaymentRecord } from '../types'
import { RenewalReceipt } from '../components/RenewalReceipt'
import { useToast, useConfirm } from '../components/feedback'

const METHOD_LABEL: Record<PaymentMethodId, string> = {
  cash: 'نقدي',
  transfer: 'تحويل',
  other: 'أخرى',
}

type Tab = 'payments' | 'plans'

export function BillingPage() {
  const [tab, setTab] = useState<Tab>('payments')
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [receipt, setReceipt] = useState<PaymentRecord | null>(null)
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [newPlanKey, setNewPlanKey] = useState(0)
  const [currency, setCurrency] = useState('₪')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [pay, pls] = await Promise.all([getPayments(), getPlans()])
      setPayments(pay)
      setPlans(pls)
    } catch (e) {
      setError((e as Error).message || 'خطأ في التحميل')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    getDefaultCurrency().then(setCurrency).catch(() => null)
  }, [refresh])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return payments
    return payments.filter(
      (p) =>
        p.receiptNo.toLowerCase().includes(q) ||
        p.subscriberEmail.toLowerCase().includes(q) ||
        (p.subscriberName?.toLowerCase().includes(q) ?? false)
    )
  }, [payments, search])

  const totalCollected = useMemo(
    () => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [payments]
  )

  const exportCSV = () => {
    const header = ['receiptNo', 'date', 'subscriber', 'email', 'period', 'amount', 'currency', 'method']
    const rows = filtered.map((p) => [
      p.receiptNo,
      p.createdAt.toISOString().slice(0, 10),
      p.subscriberName || '',
      p.subscriberEmail,
      p.periodLabel,
      String(p.amount),
      p.currency,
      p.methodLabel || METHOD_LABEL[p.method],
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const seedPresets = async () => {
    try {
      for (const preset of PLAN_PRESETS) {
        await createPlan({ ...preset, currency })
      }
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">الفوترة</h1>
          <p className="admin-page-desc">
            {payments.length} دفعة · إجمالي المحصّل {totalCollected.toLocaleString('ar')} {currency}
          </p>
        </div>
        <div className="admin-toolbar-row">
          {tab === 'payments' && filtered.length > 0 && (
            <button className="admin-btn-secondary admin-btn-sm" onClick={exportCSV}>
              ⬇ تصدير CSV
            </button>
          )}
          {tab === 'plans' && (
            <>
              {plans.length === 0 && (
                <button className="admin-btn-secondary admin-btn-sm" onClick={seedPresets}>
                  ✨ خطط جاهزة
                </button>
              )}
              <button className="admin-btn-primary admin-btn-sm" onClick={() => { setNewPlanKey((k) => k + 1); setShowPlanForm(true) }}>
                + خطة جديدة
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-tabs" role="tablist">
        {([['payments', '💰 المدفوعات والإيصالات'], ['plans', '📋 خطط الأسعار']] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={`admin-tab ${tab === k ? 'active' : ''}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
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
      ) : tab === 'payments' ? (
        <>
          <div className="admin-search-wrap" style={{ maxWidth: 420 }}>
            <svg className="admin-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="ابحث برقم إيصال أو مشترك..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="admin-search-input"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="admin-empty-state">
              <div className="admin-empty-icon">💰</div>
              <p className="admin-empty-title">لا توجد مدفوعات بعد</p>
              <p className="admin-empty-desc">سجّل أول دفعة عند تجديد اشتراك من صفحة المشترك</p>
            </div>
          ) : (
            <div className="admin-card-panel admin-table-container">
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>الإيصال</th>
                      <th>المشترك</th>
                      <th>المدة</th>
                      <th>المبلغ</th>
                      <th>الطريقة</th>
                      <th>التاريخ</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id}>
                        <td className="admin-mono">{p.receiptNo}</td>
                        <td>
                          <div className="admin-table-name">{p.subscriberName || p.subscriberEmail}</div>
                          <div className="admin-table-email">{p.subscriberEmail}</div>
                        </td>
                        <td>{p.periodLabel}</td>
                        <td><strong>{p.amount} {p.currency}</strong></td>
                        <td>{p.methodLabel || METHOD_LABEL[p.method]}</td>
                        <td className="admin-table-date">{p.createdAt.toLocaleDateString('ar')}</td>
                        <td>
                          <div className="admin-row-actions">
                            <button className="admin-table-action" onClick={() => setReceipt(p)} style={{ cursor: 'pointer', background: 'none' }}>
                              الإيصال
                            </button>
                            <a
                              href={buildReceiptWhatsApp({
                                phone: p.phone,
                                name: p.subscriberName || p.subscriberEmail,
                                receiptNo: p.receiptNo,
                                periodLabel: p.periodLabel,
                                fromDate: p.fromDate,
                                toDate: p.toDate,
                                amount: p.amount,
                                currency: p.currency,
                                methodLabel: p.methodLabel || METHOD_LABEL[p.method],
                              })}
                              target="_blank"
                              rel="noreferrer"
                              className="admin-table-action admin-table-action-wa"
                              title="إرسال الإيصال واتساب"
                            >
                              💬
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <PlansSection plans={plans} currency={currency} newKey={newPlanKey} onChanged={refresh} showForm={showPlanForm} setShowForm={setShowPlanForm} />
      )}

      {/* Receipt modal */}
      {receipt && (
        <RenewalReceipt payment={receipt} onClose={() => setReceipt(null)} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────

function PlansSection({ plans, currency, newKey, onChanged, showForm, setShowForm }: {
  plans: Plan[]
  currency: string
  newKey: number
  onChanged: () => void
  showForm: boolean
  setShowForm: (v: boolean) => void
}) {
  const [editing, setEditing] = useState<Plan | null>(null)
  const [form, setForm] = useState({ name: '', days: '30', hours: '0', price: '', trial: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()
  const confirmAction = useConfirm()
  const onCloseForm = () => setShowForm(false)

  // زر "خطة جديدة" من الأب يُصفّر النموذج
  useEffect(() => {
    if (newKey > 0) {
      setEditing(null)
      setForm({ name: '', days: '30', hours: '0', price: '', trial: false })
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newKey])

  const openEdit = (p: Plan) => {
    setEditing(p)
    setForm({ name: p.name, days: String(p.durationDays), hours: String(p.durationHours || 0), price: String(p.price), trial: !!p.trial })
    setError('')
    setShowForm(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const days = Number(form.days) || 0
    const price = Number(form.price)
    if (!form.name.trim()) { setError('اسم الخطة مطلوب'); return }
    if (!days && !Number(form.hours)) { setError('حدد مدة الخطة'); return }
    if (!Number.isFinite(price) || price < 0) { setError('السعر غير صالح'); return }
    setSaving(true)
    try {
      const data = {
        name: form.name.trim(),
        durationDays: days,
        durationHours: Number(form.hours) || 0,
        price,
        currency,
        trial: form.trial,
        active: true,
      }
      if (editing?.id) await updatePlan(editing.id, data)
      else await createPlan(data)
      onCloseForm()
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (p: Plan) => {
    if (!p.id) return
    await updatePlan(p.id, { active: !p.active })
    onChanged()
  }

  const remove = async (p: Plan) => {
    if (!p.id) return
    const ok = await confirmAction({
      title: 'حذف الخطة؟',
      message: `سيتم حذف خطة "${p.name}" نهائياً.`,
      confirmLabel: 'حذف',
      danger: true,
    })
    if (!ok) return
    await deletePlan(p.id)
    toast.success('تم حذف الخطة')
    onChanged()
  }

  return (
    <>
      {plans.length === 0 && !showForm ? (
        <div className="admin-empty-state">
          <div className="admin-empty-icon">📋</div>
          <p className="admin-empty-title">لا توجد خطط أسعار</p>
          <p className="admin-empty-desc">أنشئ خططاً (شهري/سنوي...) لاختيارها السريع عند التجديد</p>
        </div>
      ) : (
        <div className="admin-subscriber-cards" style={{ display: 'flex' }}>
          {plans.map((p) => (
            <div key={p.id} className="admin-sub-card" style={{ opacity: p.active ? 1 : 0.6 }}>
              <div className="admin-sub-card-header">
                <div className="admin-sub-card-info">
                  <div className="admin-sub-card-name">{p.name} {p.trial && <span className="admin-badge admin-badge-info">تجريبي</span>}</div>
                  <div className="admin-sub-card-email">
                    {p.durationDays > 0 ? `${p.durationDays} يوم` : ''}{p.durationHours ? ` + ${p.durationHours} ساعة` : ''} · {p.price} {p.currency}
                  </div>
                </div>
                <span className={`admin-badge ${p.active ? 'admin-badge-success' : 'admin-badge-muted'}`}>
                  {p.active ? '✓ مفعّلة' : 'موقوفة'}
                </span>
              </div>
              <div className="admin-sub-card-footer" style={{ gap: 8 }}>
                <button className="admin-btn-secondary admin-btn-xs" style={{ flex: 1, justifyContent: 'center' }} onClick={() => openEdit(p)}>تعديل</button>
                <button className="admin-btn-secondary admin-btn-xs" style={{ flex: 1, justifyContent: 'center' }} onClick={() => toggleActive(p)}>
                  {p.active ? 'إيقاف' : 'تفعيل'}
                </button>
                <button className="admin-btn-danger admin-btn-xs" style={{ flex: 1, justifyContent: 'center' }} onClick={() => remove(p)}>حذف</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="admin-modal-overlay" onClick={onCloseForm}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">{editing ? 'تعديل الخطة' : 'خطة جديدة'}</h2>
              <button className="admin-modal-close" onClick={onCloseForm}>✕</button>
            </div>
            {error && <div className="admin-alert admin-alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            <form onSubmit={submit} className="admin-form">
              <div className="admin-field">
                <label className="admin-label">اسم الخطة *</label>
                <input className="admin-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: اشتراك شهري" required autoFocus />
              </div>
              <div className="admin-grid-2">
                <div className="admin-field">
                  <label className="admin-label">المدة بالأيام *</label>
                  <input type="number" min={0} className="admin-input" dir="ltr" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
                </div>
                <div className="admin-field">
                  <label className="admin-label">ساعات إضافية</label>
                  <input type="number" min={0} className="admin-input" dir="ltr" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
                </div>
              </div>
              <div className="admin-field">
                <label className="admin-label">السعر ₪ *</label>
                <input type="number" min={0} step="any" className="admin-input" dir="ltr" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </div>
              <label className="admin-checkbox-label">
                <input type="checkbox" className="admin-checkbox" checked={form.trial} onChange={(e) => setForm({ ...form, trial: e.target.checked })} />
                <span>خطة تجريبية</span>
              </label>
              <div className="admin-modal-footer">
                <button type="button" className="admin-btn-secondary" onClick={onCloseForm}>إلغاء</button>
                <button type="submit" className="admin-btn-primary" disabled={saving}>
                  {saving ? 'جارٍ الحفظ...' : '✓ حفظ الخطة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
