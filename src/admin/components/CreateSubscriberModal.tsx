/**
 * CreateSubscriberModal.tsx — إنشاء مشترك (أيام + ساعات + تاريخ مخصص)
 */
import { useState } from 'react'
import { createSubscriber } from '../subscriptions'
import { loadPrivateKey } from '../crypto'
import { DurationPicker } from './DurationPicker'

const APP_ID = import.meta.env.VITE_LIC_APP_ID || '1374790599531web0b22b9db833219122b122e'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export function CreateSubscriberModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    username: '',
    password: '',
    displayName: '',
    phone: '',
    graceDays: 3,
    isTrial: false,
    notes: '',
  })
  const [duration, setDuration] = useState({ days: 30, hours: 0, customExpiryMs: null as number | null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [createdEmail, setCreatedEmail] = useState('')

  const set = (key: keyof typeof form, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.username.trim()) { setError('اسم المستخدم مطلوب'); return }
    if (!form.password.trim() || form.password.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return }
    if (!duration.customExpiryMs && !duration.days && !duration.hours) { setError('حدد مدة الاشتراك (أيام أو ساعات) أو تاريخ انتهاء مخصص'); return }

    const pk = loadPrivateKey(APP_ID)
    if (!pk) { setError('⚠️ لا يوجد مفتاح خاص — اذهب لصفحة المفاتيح'); return }

    setLoading(true)
    try {
      const sub = await createSubscriber({
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        durationDays: duration.days,
        durationHours: duration.hours,
        graceDays: form.graceDays,
        customExpiryMs: duration.customExpiryMs ?? undefined,
        isTrial: form.isTrial,
        notes: form.notes.trim() || undefined,
        privateKeyJwk: pk,
      })
      setCreatedEmail(sub.email)
      setStep('success')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="إنشاء مشترك جديد">
        {step === 'success' ? (
          <div className="admin-modal-success">
            <div className="admin-success-icon">✓</div>
            <h2 className="admin-modal-title">تم إنشاء المشترك بنجاح!</h2>
            <p className="admin-success-email">{createdEmail}</p>
            <p className="admin-success-note">
              يمكن للمشترك الآن تسجيل الدخول بهذه البيانات في تطبيق POS.
            </p>
            <div className="admin-modal-footer">
              <button className="admin-btn-secondary" onClick={onCreated}>إغلاق</button>
              <button className="admin-btn-primary" onClick={() => { setStep('form'); setForm({ username: '', password: '', displayName: '', phone: '', graceDays: 3, isTrial: false, notes: '' }); setDuration({ days: 30, hours: 0, customExpiryMs: null }) }}>
                إضافة مشترك آخر
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">✨ إضافة مشترك جديد</h2>
              <button className="admin-modal-close" onClick={onClose} aria-label="إغلاق">✕</button>
            </div>

            {error && (
              <div className="admin-alert admin-alert-error">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="admin-form">
              <div className="admin-form-section">
                <h4 className="admin-form-section-title">👤 بيانات الدخول</h4>
                <div className="admin-grid-2">
                  <div className="admin-field">
                    <label className="admin-label">
                      اسم المستخدم <span className="admin-required">*</span>
                    </label>
                    <input
                      id="new-sub-username"
                      type="text"
                      className="admin-input"
                      value={form.username}
                      onChange={(e) => set('username', e.target.value)}
                      placeholder="مثال: ahmed"
                      dir="ltr"
                      required
                      autoFocus
                    />
                    <span className="admin-field-hint">سيُضاف @lic.local تلقائياً</span>
                  </div>
                  <div className="admin-field">
                    <label className="admin-label">
                      كلمة المرور <span className="admin-required">*</span>
                    </label>
                    <input
                      id="new-sub-password"
                      type="text"
                      className="admin-input"
                      value={form.password}
                      onChange={(e) => set('password', e.target.value)}
                      placeholder="6 أحرف على الأقل"
                      dir="ltr"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="admin-form-section">
                <h4 className="admin-form-section-title">📇 المعلومات الشخصية (اختياري)</h4>
                <div className="admin-grid-2">
                  <div className="admin-field">
                    <label className="admin-label">الاسم الكامل</label>
                    <input
                      type="text"
                      className="admin-input"
                      value={form.displayName}
                      onChange={(e) => set('displayName', e.target.value)}
                      placeholder="أحمد محمد"
                    />
                  </div>
                  <div className="admin-field">
                    <label className="admin-label">رقم الواتساب</label>
                    <input
                      type="tel"
                      className="admin-input"
                      value={form.phone}
                      onChange={(e) => set('phone', e.target.value)}
                      placeholder="+972501234567"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              <div className="admin-form-section admin-form-highlight">
                <h4 className="admin-form-section-title">⏱ مدة الاشتراك — أيام + ساعات</h4>
                <DurationPicker value={duration} onChange={setDuration} baseDate={new Date()} />
                <div className="admin-grid-2">
                  <div className="admin-field">
                    <label className="admin-label">أيام السماح بعد الانتهاء</label>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      className="admin-input"
                      value={form.graceDays}
                      onChange={(e) => set('graceDays', Number(e.target.value))}
                      dir="ltr"
                    />
                  </div>
                  <label className="admin-checkbox-label" style={{ alignSelf: 'end', paddingBottom: 12 }}>
                    <input
                      type="checkbox"
                      checked={form.isTrial}
                      onChange={(e) => set('isTrial', e.target.checked)}
                      className="admin-checkbox"
                    />
                    <span>تحديد كفترة تجريبية</span>
                  </label>
                </div>
              </div>

              <div className="admin-field">
                <label className="admin-label">ملاحظات (اختياري)</label>
                <textarea
                  className="admin-input admin-textarea"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="أي ملاحظات..."
                  rows={2}
                />
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="admin-btn-secondary" onClick={onClose}>إلغاء</button>
                <button
                  id="confirm-create-btn"
                  type="submit"
                  className="admin-btn-primary"
                  disabled={loading}
                >
                  {loading ? (
                    <><span className="admin-spinner" /> جارٍ الإنشاء...</>
                  ) : (
                    '✓ إنشاء المشترك'
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
