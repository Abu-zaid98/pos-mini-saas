/**
 * SubscriberDetailPage.tsx — تفاصيل المشترك (تصميم احترافي + تحكم كامل بالمدة)
 * عدّاد تنازلي + زيادة/إنقاص أيام وساعات + تعيين تاريخ دقيق
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  getSubscription,
  computeStatus,
  renewSubscription,
  adjustSubscription,
  setSubscriptionExpiry,
  suspendSubscription,
  reactivateSubscription,
  deleteSubscription,
  buildRenewalWhatsApp,
  buildExpiredWhatsApp,
} from '../subscriptions'
import { getSession, setMaxDevices, removeDevice, resetDevices, type AdminSession } from '../sessions'
import { loadPrivateKey, hasPrivateKey, msToDhms, toDatetimeLocalValue, DAY_MS, formatDurationAr } from '../crypto'
import { DurationPicker } from '../components/DurationPicker'
import { useToast, useConfirm } from '../components/feedback'
import { getPlans, recordPayment, getDefaultCurrency, type PaymentMethodId } from '../billing'
import { RenewalReceipt } from '../components/RenewalReceipt'
import type { Subscription, Plan, PaymentRecord } from '../types'

const APP_ID = import.meta.env.VITE_LIC_APP_ID || '1374790599531web0b22b9db833219122b122e'

const STATUS_CONFIG = {
  active: { label: 'نشط', color: 'success', icon: '✓' },
  trial: { label: 'تجريبي', color: 'info', icon: '⏳' },
  grace: { label: 'فترة سماح', color: 'warning', icon: '⚠' },
  expired: { label: 'منتهي', color: 'error', icon: '✕' },
  suspended: { label: 'موقوف', color: 'muted', icon: '⊘' },
} as const

function timeAgo(d: Date): string {
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
  if (mins < 1) return 'الآن'
  if (mins < 60) return `منذ ${mins} دقيقة`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${hours} ${hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتين' : 'ساعات'}`
  const days = Math.floor(hours / 24)
  return `منذ ${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومين' : 'أيام'}`
}

type ManageTab = 'extend' | 'adjust' | 'set'

function useCountdown(expiryMs: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return useMemo(() => msToDhms(expiryMs - now), [expiryMs, now])
}

export function SubscriberDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [sub, setSub] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [tab, setTab] = useState<ManageTab>('extend')
  const [duration, setDuration] = useState({ days: 30, hours: 0, customExpiryMs: null as number | null })
  const [extendFrom, setExtendFrom] = useState<'expiry' | 'now'>('expiry')
  const [grace, setGrace] = useState(3)
  const [notes, setNotes] = useState('')
  const [adjustDays, setAdjustDays] = useState(7)
  const [adjustHours, setAdjustHours] = useState(0)
  const [exactDate, setExactDate] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [hasPK, setHasPK] = useState(false)
  const [session, setSession] = useState<AdminSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  // الدفعة والإيصال عند التجديد
  const [plans, setPlans] = useState<Plan[]>([])
  const [planId, setPlanId] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethodId>('cash')
  const [currency, setCurrency] = useState('₪')
  const [receipt, setReceipt] = useState<PaymentRecord | null>(null)
  const toast = useToast()
  const confirmAction = useConfirm()

  const loadSession = async (uid: string) => {
    setSessionLoading(true)
    try {
      setSession(await getSession(uid))
    } catch {
      setSession(null)
    } finally {
      setSessionLoading(false)
    }
  }

  useEffect(() => {
    setHasPK(hasPrivateKey(APP_ID))
    getPlans().then(setPlans).catch(() => null)
    getDefaultCurrency().then(setCurrency).catch(() => null)
    if (!id) return
    setLoading(true)
    getSubscription(id)
      .then((data) => {
        if (!data) setError('المشترك غير موجود')
        else {
          setSub(data)
          setGrace(data.graceDays)
          setExactDate(toDatetimeLocalValue(data.expiryDate))
          loadSession(data.uid)
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const countdown = useCountdown(sub?.expiryDate.getTime() ?? 0)

  const progress = useMemo(() => {
    if (!sub) return 0
    const total = sub.expiryDate.getTime() - sub.startDate.getTime()
    if (total <= 0) return 0
    const left = sub.expiryDate.getTime() - Date.now()
    return Math.min(100, Math.max(0, (left / total) * 100))
  }, [sub])

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="admin-spinner-lg" />
        <p>جارٍ التحميل...</p>
      </div>
    )
  }

  if (error || !sub) {
    return (
      <div className="admin-error-state">
        <p>{error || 'المشترك غير موجود'}</p>
        <Link to="/admin/subscribers" className="admin-btn-secondary">العودة</Link>
      </div>
    )
  }

  const status = computeStatus(sub)
  const cfg = STATUS_CONFIG[status]
  const waLink = status === 'expired' || status === 'grace'
    ? buildExpiredWhatsApp(sub)
    : buildRenewalWhatsApp(sub)

  const needPK = () => {
    if (!hasPK) { toast.error('لا يوجد مفتاح خاص', 'اذهب إلى صفحة المفاتيح وأنشئ أو استورد المفتاح أولاً'); return false }
    const pk = loadPrivateKey(APP_ID)
    if (!pk) { toast.error('تعذّر تحميل المفتاح الخاص'); return false }
    return true
  }

  const reload = (updated: Subscription) => {
    setSub(updated)
    setExactDate(toDatetimeLocalValue(updated.expiryDate))
    setGrace(updated.graceDays)
  }

  const handleExtend = async () => {
    if (!needPK()) return
    const pk = loadPrivateKey(APP_ID)!
    if (!duration.customExpiryMs && !duration.days && !duration.hours) { toast.error('حدد مدة أو تاريخاً'); return }
    const amount = parseFloat(payAmount) || 0
    const prevExpiry = sub.expiryDate
    setActionLoading(true)
    try {
      const updated = await renewSubscription({
        subscriptionId: sub.id,
        durationDays: duration.days,
        durationHours: duration.hours,
        graceDays: grace,
        mode: duration.customExpiryMs ? 'set' : 'extend',
        customExpiryMs: duration.customExpiryMs ?? undefined,
        extendFrom,
        notes,
        privateKeyJwk: pk,
      })
      reload(updated)

      // تسجيل الدفعة وإصدار الإيصال عند إدخال مبلغ
      if (amount > 0) {
        const plan = plans.find((p) => p.id === planId)
        const periodLabel = plan
          ? `${plan.name}`
          : duration.customExpiryMs
            ? 'مدة مخصصة'
            : formatDurationAr(duration.days, duration.hours)
        const fromDate = duration.customExpiryMs
          ? new Date()
          : extendFrom === 'now'
            ? new Date()
            : prevExpiry
        const payment = await recordPayment({
          subscriptionId: sub.id,
          subscriberEmail: sub.email,
          subscriberName: sub.displayName || sub.username,
          phone: sub.phone,
          amount,
          currency,
          method: payMethod,
          methodLabel: payMethod === 'cash' ? 'نقدي' : payMethod === 'transfer' ? 'تحويل' : 'أخرى',
          periodLabel,
          fromDate,
          toDate: updated.expiryDate,
          notes: notes || undefined,
        })
        setShowManage(false)
        setNotes('')
        setPayAmount('')
        setReceipt(payment)
        toast.success('تم التجديد وإصدار الإيصال', `إيصال ${payment.receiptNo}`)
      } else {
        setShowManage(false)
        setNotes('')
        setPayAmount('')
        toast.success('تم حفظ التمديد', 'أُعيد إصدار التوكن بالتاريخ الجديد')
      }
    } catch (e) {
      toast.error('فشل الحفظ', (e as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const applyPlan = (id: string) => {
    setPlanId(id)
    const plan = plans.find((p) => p.id === id)
    if (plan) {
      setDuration({ days: plan.durationDays, hours: plan.durationHours || 0, customExpiryMs: null })
      if (plan.price > 0) setPayAmount(String(plan.price))
    }
  }

  const handleQuickAdjust = async (dDays: number, dHours: number) => {
    if (!needPK()) return
    const pk = loadPrivateKey(APP_ID)!
    setActionLoading(true)
    try {
      const updated = await adjustSubscription({
        subscriptionId: sub.id,
        deltaDays: dDays,
        deltaHours: dHours,
        privateKeyJwk: pk,
      })
      reload(updated)
      toast.success('تم التعديل السريع', `الانتهاء الجديد: ${updated.expiryDate.toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' })}`)
    } catch (e) {
      toast.error('فشل التعديل', (e as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleCustomAdjust = async () => {
    if (!needPK()) return
    const pk = loadPrivateKey(APP_ID)!
    if (!adjustDays && !adjustHours) { toast.error('لا يوجد تغيير', 'أدخل أياماً أو ساعات (يمكن أن تكون سالبة للإنقاص)'); return }
    setActionLoading(true)
    try {
      const updated = await adjustSubscription({
        subscriptionId: sub.id,
        deltaDays: adjustDays,
        deltaHours: adjustHours,
        graceDays: grace,
        notes: notes || undefined,
        privateKeyJwk: pk,
      })
      reload(updated)
      setShowManage(false)
      setNotes('')
      toast.success('تم حفظ التعديل', 'أُعيد إصدار التوكن بالتاريخ الجديد')
    } catch (e) {
      toast.error('فشل الحفظ', (e as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSetExact = async () => {
    if (!needPK()) return
    const pk = loadPrivateKey(APP_ID)!
    const t = new Date(exactDate).getTime()
    if (!Number.isFinite(t)) { toast.error('حدد تاريخاً صحيحاً'); return }
    setActionLoading(true)
    try {
      const updated = await setSubscriptionExpiry({
        subscriptionId: sub.id,
        expiryMs: t,
        graceDays: grace,
        notes: notes || undefined,
        privateKeyJwk: pk,
      })
      reload(updated)
      setShowManage(false)
      setNotes('')
      toast.success('تم تعيين التاريخ', 'أُعيد إصدار التوكن بالتاريخ الجديد')
    } catch (e) {
      toast.error('فشل الحفظ', (e as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSuspend = async () => {
    const ok = await confirmAction({
      title: 'تعليق الاشتراك؟',
      message: 'سيتوقف تطبيق المشترك خلال دقائق. يمكنك إعادة التفعيل في أي وقت.',
      confirmLabel: 'تعليق',
      danger: true,
    })
    if (!ok) return
    setActionLoading(true)
    try {
      await suspendSubscription(sub.id)
      setSub({ ...sub, status: 'suspended' })
      toast.success('تم تعليق الاشتراك', 'سيتوقف تطبيق المشترك خلال دقائق')
    } catch (e) {
      toast.error('فشل التعليق', (e as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReactivate = async () => {
    setActionLoading(true)
    try {
      await reactivateSubscription(sub.id)
      setSub({ ...sub, status: sub.expiryDate > new Date() ? 'active' : 'expired' })
      toast.success('تمت إعادة التفعيل')
    } catch (e) {
      toast.error('فشل إعادة التفعيل', (e as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    setActionLoading(true)
    try {
      await deleteSubscription(sub.id)
      navigate('/admin/subscribers')
    } catch (e) {
      toast.error('فشل الحذف', (e as Error).message)
      setActionLoading(false)
    }
  }

  const handleMaxChange = async (max: number) => {
    setActionLoading(true)
    try {
      await setMaxDevices(sub.uid, max, sub.email)
      await loadSession(sub.uid)
      toast.success(`أصبح الحد ${max} ${max === 1 ? 'جهاز' : 'أجهزة'}`)
    } catch (e) {
      toast.error('فشل التعديل', (e as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemoveDevice = async (deviceId: string) => {
    const ok = await confirmAction({
      title: 'فك ارتباط الجهاز؟',
      message: `سيفقد الجهاز ${deviceId.slice(0, 8).toUpperCase()} الدخول خلال دقائق.`,
      confirmLabel: 'فك الارتباط',
      danger: true,
    })
    if (!ok) return
    setActionLoading(true)
    try {
      await removeDevice(sub.uid, deviceId, sub.email)
      await loadSession(sub.uid)
      toast.success('تم فك ارتباط الجهاز')
    } catch (e) {
      toast.error('فشل فك الارتباط', (e as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetDevices = async () => {
    const ok = await confirmAction({
      title: 'تحرير كل الأجهزة؟',
      message: 'سيتم فك ارتباط جميع الأجهزة — مفيد عند ضياع الجهاز أو استبداله.',
      confirmLabel: 'تحرير الكل',
      danger: true,
    })
    if (!ok) return
    setActionLoading(true)
    try {
      await resetDevices(sub.uid, sub.email)
      await loadSession(sub.uid)
      toast.success('تم تحرير كل الأجهزة')
    } catch (e) {
      toast.error('فشلت إعادة التعيين', (e as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const copyToken = () => {
    navigator.clipboard.writeText(sub.token).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    })
  }

  const totalUsedPct = 100 - progress

  return (
    <div className="admin-page">
      <div className="admin-breadcrumb">
        <Link to="/admin/subscribers">المشتركون</Link>
        <span>/</span>
        <span>{sub.displayName || sub.username}</span>
      </div>

      {/* Hero */}
      <div className={`admin-hero admin-hero-${cfg.color}`}>
        <div className="admin-hero-main">
          <div className="admin-detail-avatar admin-hero-avatar">
            {sub.username.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className="admin-hero-title">{sub.displayName || sub.username}</h1>
            <div className="admin-detail-meta">
              <span className="admin-detail-email">{sub.email}</span>
              <span className={`admin-badge admin-badge-${cfg.color}`}>{cfg.icon} {cfg.label}</span>
            </div>
            <div className="admin-hero-expiry">
              📅 ينتهي: {sub.expiryDate.toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          </div>
        </div>

        {/* Countdown */}
        <div className="admin-countdown">
          {countdown.expired ? (
            <div className="admin-countdown-expired">انتهى الاشتراك — جدده الآن ⏰</div>
          ) : (
            <>
              <div className="admin-countdown-cells">
                <div className="admin-count-cell"><b>{countdown.days}</b><span>يوم</span></div>
                <div className="admin-count-cell"><b>{countdown.hours}</b><span>ساعة</span></div>
                <div className="admin-count-cell"><b>{countdown.mins}</b><span>دقيقة</span></div>
              </div>
              <div className="admin-progress-track">
                <div className="admin-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="admin-progress-label">متبقي {Math.round(progress)}% — مستهلَك {Math.round(totalUsedPct)}%</div>
            </>
          )}
        </div>

        <div className="admin-hero-actions">
          <button
            className="admin-btn-primary admin-btn-sm"
            onClick={() => { setTab('extend'); setShowManage(true) }}
            disabled={actionLoading || !hasPK}
            title={!hasPK ? 'يتطلب المفتاح الخاص' : 'تمديد / تجديد'}
          >
            ⏱ إدارة المدة
          </button>
          {sub.phone && (
            <a href={waLink} target="_blank" rel="noreferrer" className="admin-btn-wa">واتساب</a>
          )}
          {status !== 'suspended' ? (
            <button className="admin-btn-secondary admin-btn-sm" onClick={handleSuspend} disabled={actionLoading}>⊘ تعليق</button>
          ) : (
            <button className="admin-btn-secondary admin-btn-sm" onClick={handleReactivate} disabled={actionLoading}>✓ إعادة تفعيل</button>
          )}
        </div>
      </div>

      {/* Quick adjust */}
      <div className="admin-card-panel">
        <h3 className="admin-panel-title">⚡ تعديل سريع — زيادة / إنقاص فوري</h3>
        <p className="admin-panel-desc">يُعاد إصدار التوكن تلقائياً بعد كل ضغطة. القيم السالبة تُنقص المدة.</p>
        <div className="admin-quick-grid">
          <button className="admin-quick-btn" disabled={actionLoading} onClick={() => handleQuickAdjust(1, 0)}>+ يوم</button>
          <button className="admin-quick-btn" disabled={actionLoading} onClick={() => handleQuickAdjust(7, 0)}>+ 7 أيام</button>
          <button className="admin-quick-btn" disabled={actionLoading} onClick={() => handleQuickAdjust(30, 0)}>+ 30 يوم</button>
          <button className="admin-quick-btn" disabled={actionLoading} onClick={() => handleQuickAdjust(0, 24)}>+ 24 ساعة</button>
          <button className="admin-quick-btn" disabled={actionLoading} onClick={() => handleQuickAdjust(0, 1)}>+ ساعة</button>
          <button className="admin-quick-btn admin-quick-danger" disabled={actionLoading} onClick={() => handleQuickAdjust(-1, 0)}>− يوم</button>
          <button className="admin-quick-btn admin-quick-danger" disabled={actionLoading} onClick={() => handleQuickAdjust(-7, 0)}>− 7 أيام</button>
          <button className="admin-quick-btn admin-quick-danger" disabled={actionLoading} onClick={() => handleQuickAdjust(0, -24)}>− 24 ساعة</button>
        </div>
      </div>

      {/* Info Grid */}
      <div className="admin-grid-2">
        <div className="admin-card-panel">
          <h3 className="admin-panel-title">📊 بيانات الاشتراك</h3>
          <dl className="admin-info-list">
            <div className="admin-info-row">
              <dt>الحالة</dt>
              <dd><span className={`admin-badge admin-badge-${cfg.color}`}>{cfg.icon} {cfg.label}</span></dd>
            </div>
            <div className="admin-info-row">
              <dt>تاريخ البدء</dt>
              <dd>{sub.startDate.toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' })}</dd>
            </div>
            <div className="admin-info-row">
              <dt>تاريخ الانتهاء</dt>
              <dd><b>{sub.expiryDate.toLocaleString('ar', { dateStyle: 'full', timeStyle: 'short' })}</b></dd>
            </div>
            <div className="admin-info-row">
              <dt>المتبقي بدقة</dt>
              <dd>
                {countdown.expired
                  ? <span className="admin-days-expired">انتهى منذ {Math.abs(Math.ceil((sub.expiryDate.getTime() - Date.now()) / DAY_MS))} يوم</span>
                  : <span className="admin-days-ok">{countdown.days} يوم و {countdown.hours} ساعة و {countdown.mins} دقيقة ({countdown.totalHours} ساعة إجمالاً)</span>}
              </dd>
            </div>
            <div className="admin-info-row">
              <dt>أيام السماح</dt>
              <dd>{sub.graceDays} يوم</dd>
            </div>
            {sub.notes && (
              <div className="admin-info-row">
                <dt>ملاحظات</dt>
                <dd>{sub.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="admin-card-panel">
          <h3 className="admin-panel-title">👤 بيانات المشترك</h3>
          <dl className="admin-info-list">
            <div className="admin-info-row">
              <dt>اسم المستخدم</dt>
              <dd className="admin-mono">{sub.username}</dd>
            </div>
            <div className="admin-info-row">
              <dt>الاسم الكامل</dt>
              <dd>{sub.displayName || '—'}</dd>
            </div>
            <div className="admin-info-row">
              <dt>البريد الإلكتروني</dt>
              <dd className="admin-mono">{sub.email}</dd>
            </div>
            <div className="admin-info-row">
              <dt>رقم الهاتف</dt>
              <dd>
                {sub.phone ? (
                  <a href={`https://wa.me/${sub.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="admin-phone-link">
                    {sub.phone}
                  </a>
                ) : '—'}
              </dd>
            </div>
            <div className="admin-info-row">
              <dt>معرّف Firebase</dt>
              <dd className="admin-mono admin-mono-sm">{sub.uid}</dd>
            </div>
            <div className="admin-info-row">
              <dt>تاريخ الإنشاء</dt>
              <dd>{sub.createdAt.toLocaleDateString('ar')}</dd>
            </div>
            <div className="admin-info-row">
              <dt>آخر تحديث</dt>
              <dd>{sub.updatedAt.toLocaleString('ar')}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Devices */}
      <div className="admin-card-panel">
        <div className="admin-panel-header">
          <h3 className="admin-panel-title">📱 الأجهزة المرتبطة</h3>
          {session && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="admin-sort-label">الحد الأقصى:</span>
              <select
                className="admin-sort-select"
                value={session.max}
                disabled={actionLoading}
                onChange={(e) => handleMaxChange(Number(e.target.value))}
                aria-label="الحد الأقصى للأجهزة"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n === 1 ? 'جهاز واحد' : `${n} أجهزة`}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {sessionLoading ? (
          <div className="admin-loading" style={{ padding: 24 }}>
            <div className="admin-spinner-lg" />
          </div>
        ) : !session || session.devices.length === 0 ? (
          <p className="admin-empty-desc">لم يسجل هذا المشترك دخوله من أي جهاز بعد — أول دخول سيحجز الجهاز تلقائياً.</p>
        ) : (
          <>
            <div className="admin-mini-list">
              {session.devices.map((d) => (
                <div key={d.id} className="admin-mini-item" style={{ cursor: 'default' }}>
                  <div className="admin-mini-avatar">📱</div>
                  <div className="admin-mini-info">
                    <div className="admin-mini-name admin-mono">{d.id.slice(0, 8).toUpperCase()}</div>
                    <div className="admin-mini-sub">آخر نشاط: {timeAgo(d.seen)}</div>
                  </div>
                  <button
                    className="admin-btn-secondary admin-btn-xs"
                    disabled={actionLoading}
                    onClick={() => handleRemoveDevice(d.id)}
                  >
                    فك الارتباط
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                className="admin-btn-secondary admin-btn-sm"
                disabled={actionLoading}
                onClick={handleResetDevices}
              >
                🔓 تحرير كل الأجهزة
              </button>
            </div>
          </>
        )}
      </div>

      {/* Token */}
      <div className="admin-card-panel">
        <div className="admin-panel-header">
          <h3 className="admin-panel-title">🔑 التوكن الحالي (JWT)</h3>
          <button
            className="admin-btn-secondary admin-btn-xs"
            onClick={copyToken}
          >
            {copySuccess ? '✓ تم النسخ' : '📋 نسخ'}
          </button>
        </div>
        <div className="admin-token-wrap">
          <code className="admin-token-text">{sub.token}</code>
        </div>
        <p className="admin-token-note">
          موقّع بـ ECDSA P-256 — يُعاد إصداره تلقائياً عند أي تعديل على المدة أو التاريخ.
        </p>
      </div>

      {/* Danger Zone */}
      <div className="admin-card-panel admin-danger-panel">
        <h3 className="admin-panel-title admin-danger-title">⚠️ منطقة الخطر</h3>
        <p className="admin-danger-desc">سيؤدي حذف هذا الاشتراك إلى توقف التطبيق عند المشترك فوراً.</p>
        <button
          id="delete-subscriber-btn"
          className="admin-btn-danger admin-btn-sm"
          onClick={() => setShowDelete(true)}
          disabled={actionLoading}
        >
          🗑️ حذف المشترك نهائياً
        </button>
      </div>

      {/* Manage Modal */}
      {showManage && (
        <div className="admin-modal-overlay" onClick={() => setShowManage(false)}>
          <div className="admin-modal admin-modal-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="إدارة المدة">
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">⏱ إدارة مدة {sub.displayName || sub.username}</h2>
              <button className="admin-modal-close" onClick={() => setShowManage(false)} aria-label="إغلاق">✕</button>
            </div>

            <div className="admin-current-expiry">
              ينتهي حالياً: <b>{sub.expiryDate.toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' })}</b>
            </div>

            {/* Tabs */}
            <div className="admin-tabs" role="tablist">
              {([['extend', '➕ تمديد'], ['adjust', '✏️ زيادة / إنقاص'], ['set', '📅 تاريخ محدد']] as [ManageTab, string][]).map(([k, label]) => (
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

            <div className="admin-form">
              {tab === 'extend' && (
                <>
                  <div className="admin-field">
                    <label className="admin-label">التمديد من</label>
                    <div className="admin-segmented">
                      <button type="button" className={`admin-seg-btn ${extendFrom === 'expiry' ? 'active' : ''}`} onClick={() => setExtendFrom('expiry')}>من تاريخ الانتهاء</button>
                      <button type="button" className={`admin-seg-btn ${extendFrom === 'now' ? 'active' : ''}`} onClick={() => setExtendFrom('now')}>من الآن</button>
                    </div>
                  </div>
                  <DurationPicker value={duration} onChange={setDuration} baseDate={extendFrom === 'now' ? new Date() : (sub.expiryDate > new Date() ? sub.expiryDate : new Date())} />

                  {/* Payment — اختياري: خطة + مبلغ لإصدار إيصال */}
                  <div className="admin-form-section">
                    <h4 className="admin-form-section-title">💰 الدفعة والإيصال (اختياري)</h4>
                    {plans.filter((p) => p.active).length > 0 && (
                      <div className="admin-field">
                        <label className="admin-label">خطة سعر (تعبئ المدة والمبلغ)</label>
                        <select
                          className="admin-input admin-input-sm"
                          value={planId}
                          onChange={(e) => applyPlan(e.target.value)}
                        >
                          <option value="">— بدون خطة (يدوي) —</option>
                          {plans.filter((p) => p.active).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} — {p.price} {p.currency}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="admin-grid-2">
                      <div className="admin-field">
                        <label className="admin-label">المبلغ المستلم</label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="admin-input admin-input-sm"
                          dir="ltr"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          placeholder="0 = بدون إيصال"
                        />
                      </div>
                      <div className="admin-field">
                        <label className="admin-label">طريقة الدفع</label>
                        <select
                          className="admin-input admin-input-sm"
                          value={payMethod}
                          onChange={(e) => setPayMethod(e.target.value as PaymentMethodId)}
                        >
                          <option value="cash">نقدي</option>
                          <option value="transfer">تحويل</option>
                          <option value="other">أخرى</option>
                        </select>
                      </div>
                    </div>
                    <span className="admin-field-hint">اترك المبلغ فارغاً للتجديد بدون إيصال — أدخل مبلغاً لإصدار إيصال وإرساله واتساب.</span>
                  </div>
                </>
              )}

              {tab === 'adjust' && (
                <>
                  <div className="admin-grid-2">
                    <div className="admin-field">
                      <label className="admin-label">أيام (+ زيادة / − إنقاص)</label>
                      <input type="number" className="admin-input" dir="ltr" value={adjustDays} onChange={(e) => setAdjustDays(Number(e.target.value))} placeholder="مثال: 7 أو -7" />
                    </div>
                    <div className="admin-field">
                      <label className="admin-label">ساعات (+ / −)</label>
                      <input type="number" className="admin-input" dir="ltr" value={adjustHours} onChange={(e) => setAdjustHours(Number(e.target.value))} placeholder="مثال: 12 أو -12" />
                    </div>
                  </div>
                  <div className="admin-quick-days">
                    {[1, 7, 30].map((d) => (
                      <button key={d} type="button" className="admin-day-chip" onClick={() => setAdjustDays(d)}>+{d} يوم</button>
                    ))}
                    {[1, 7, 30].map((d) => (
                      <button key={-d} type="button" className="admin-day-chip" onClick={() => setAdjustDays(-d)}>−{d} يوم</button>
                    ))}
                    <button type="button" className="admin-day-chip" onClick={() => { setAdjustDays(0); setAdjustHours(24) }}>+24 ساعة</button>
                    <button type="button" className="admin-day-chip" onClick={() => { setAdjustDays(0); setAdjustHours(-24) }}>−24 ساعة</button>
                  </div>
                </>
              )}

              {tab === 'set' && (
                <div className="admin-field">
                  <label className="admin-label">📅 تاريخ وساعة الانتهاء الجديد</label>
                  <input
                    type="datetime-local"
                    className="admin-input"
                    dir="ltr"
                    value={exactDate}
                    onChange={(e) => setExactDate(e.target.value)}
                  />
                  <span className="admin-field-hint">يمكنك تقديم التاريخ (تقليل المدة) أو تأخيره (زيادة المدة) بحرية كاملة.</span>
                </div>
              )}

              <div className="admin-grid-2">
                <div className="admin-field">
                  <label className="admin-label">أيام السماح</label>
                  <input type="number" min={0} max={90} value={grace} onChange={(e) => setGrace(Number(e.target.value))} className="admin-input admin-input-sm" dir="ltr" />
                </div>
                <div className="admin-field">
                  <label className="admin-label">ملاحظات (اختياري)</label>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} className="admin-input admin-input-sm" placeholder="سبب التعديل..." />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button className="admin-btn-secondary" onClick={() => setShowManage(false)}>إلغاء</button>
                <button
                  className="admin-btn-primary"
                  onClick={tab === 'extend' ? handleExtend : tab === 'adjust' ? handleCustomAdjust : handleSetExact}
                  disabled={actionLoading}
                >
                  {actionLoading ? <><span className="admin-spinner" /> جارٍ الحفظ...</> : '✓ حفظ وإعادة إصدار التوكن'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipt modal after paid renewal */}
      {receipt && (
        <RenewalReceipt payment={receipt} onClose={() => setReceipt(null)} />
      )}

      {/* Delete Confirm Modal */}
      {showDelete && (
        <div className="admin-modal-overlay" onClick={() => setShowDelete(false)}>
          <div className="admin-modal admin-modal-sm" onClick={(e) => e.stopPropagation()} role="alertdialog">
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">⚠️ تأكيد الحذف</h2>
            </div>
            <p className="admin-modal-body">
              سيتم حذف <strong>{sub.displayName || sub.username}</strong> نهائياً ولا يمكن التراجع. هل أنت متأكد؟
            </p>
            <div className="admin-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setShowDelete(false)}>إلغاء</button>
              <button
                className="admin-btn-danger"
                onClick={handleDelete}
                disabled={actionLoading}
              >
                {actionLoading ? <><span className="admin-spinner" /> جارٍ الحذف...</> : 'حذف نهائياً'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
