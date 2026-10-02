/**
 * SettingsPage.tsx — إعدادات اللوحة: قوالب الواتساب + العملة الافتراضية
 * المتغيرات: {name} {days} {date} {uid} {receipt} {period} {from} {to} {amount} {currency} {method}
 */
import { useEffect, useState } from 'react'
import { DEFAULT_TEMPLATES, formatTemplate, loadTemplates, saveTemplates } from '../templates'
import { getDefaultCurrency, saveDefaultCurrency } from '../billing'
import { useToast } from '../components/feedback'
import type { WhatsTemplates } from '../types'

const FIELDS: Array<{ key: keyof WhatsTemplates; title: string; desc: string }> = [
  { key: 'renewal', title: 'رسالة التجديد (قرب الانتهاء)', desc: 'تُرسل من زر 💬 للمشتركين النشطين' },
  { key: 'expiring', title: 'رسالة التذكير السريع', desc: 'تذكير قصير بمن تنتهي اشتراكاتهم' },
  { key: 'expired', title: 'رسالة انتهاء الاشتراك', desc: 'تُرسل للمنتهية والفترة السماح' },
  { key: 'receipt', title: 'رسالة إيصال التجديد', desc: 'تُرسل مع زر الإيصال بعد الدفع' },
]

const SAMPLE = {
  name: 'أحمد محمد',
  days: 3,
  date: new Date().toLocaleDateString('ar'),
  uid: 'abc123',
  receipt: 'R-202610-0042',
  period: 'اشتراك شهري',
  from: new Date().toLocaleDateString('ar'),
  to: new Date(Date.now() + 30 * 86400000).toLocaleDateString('ar'),
  amount: 150,
  currency: '₪',
  method: 'نقدي',
}

export function SettingsPage() {
  const [templates, setTemplates] = useState<WhatsTemplates>(DEFAULT_TEMPLATES)
  const [currency, setCurrency] = useState('₪')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  useEffect(() => {
    Promise.all([loadTemplates(), getDefaultCurrency()])
      .then(([t, c]) => {
        setTemplates(t)
        setCurrency(c)
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await Promise.all([saveTemplates(templates), saveDefaultCurrency(currency.trim() || '₪')])
      toast.success('تم حفظ الإعدادات')
    } catch (e) {
      toast.error('فشل الحفظ', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const resetAll = async () => {
    setTemplates(DEFAULT_TEMPLATES)
    toast.info('أُعيدت القوالب للافتراضية — اضغط حفظ للاعتماد')
  }

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="admin-spinner-lg" />
        <p>جارٍ التحميل...</p>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">الإعدادات</h1>
          <p className="admin-page-desc">قوالب رسائل الواتساب والعملة الافتراضية</p>
        </div>
        <div className="admin-toolbar-row">
          <button className="admin-btn-secondary admin-btn-sm" onClick={resetAll}>
            ↩ افتراضي
          </button>
          <button className="admin-btn-primary admin-btn-sm" onClick={save} disabled={saving}>
            {saving ? 'جارٍ الحفظ...' : '✓ حفظ الكل'}
          </button>
        </div>
      </div>

      <div className="admin-card-panel">
        <h3 className="admin-panel-title">العملة الافتراضية للخطط والمدفوعات</h3>
        <input
          className="admin-input admin-input-sm"
          style={{ maxWidth: 160 }}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          placeholder="₪"
        />
      </div>

      {FIELDS.map((f) => (
        <div key={f.key} className="admin-card-panel">
          <h3 className="admin-panel-title">{f.title}</h3>
          <p className="admin-page-desc" style={{ marginBottom: 8 }}>{f.desc}</p>
          <div className="admin-grid-2">
            <textarea
              className="admin-input admin-textarea admin-mono"
              rows={8}
              value={templates[f.key]}
              onChange={(e) => setTemplates({ ...templates, [f.key]: e.target.value })}
              dir="auto"
            />
            <div>
              <p className="admin-sort-label" style={{ marginBottom: 6 }}>👁 معاينة حية</p>
              <div className="admin-token-wrap">
                <code className="admin-token-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {formatTemplate(templates[f.key], SAMPLE)}
                </code>
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="admin-card-panel admin-info-panel">
        <h3 className="admin-panel-title">🔤 المتغيرات المتاحة</h3>
        <p className="admin-step-desc">
          <code className="admin-mono">{'{name}'}</code> الاسم ·
          <code className="admin-mono">{'{days}'}</code> الأيام المتبقية ·
          <code className="admin-mono">{'{date}'}</code> تاريخ الانتهاء ·
          <code className="admin-mono">{'{uid}'}</code> المعرّف ·
          <code className="admin-mono">{'{receipt}'}</code> رقم الإيصال ·
          <code className="admin-mono">{'{period}'}</code> المدة ·
          <code className="admin-mono">{'{from}'}</code> من ·
          <code className="admin-mono">{'{to}'}</code> إلى ·
          <code className="admin-mono">{'{amount}'}</code> المبلغ ·
          <code className="admin-mono">{'{currency}'}</code> العملة ·
          <code className="admin-mono">{'{method}'}</code> طريقة الدفع
        </p>
      </div>
    </div>
  )
}
