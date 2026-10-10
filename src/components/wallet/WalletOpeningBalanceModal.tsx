import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { ConfirmModal } from '../ui/ConfirmModal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { db, PAYMENT_METHODS, type PaymentMethod } from '../../db/db'
import {
  type OpeningBalances,
  type WalletAdjustment,
  getWalletAdjustments,
  saveWalletAdjustment,
  deleteWalletAdjustment,
} from '../../utils/wallet'
import { formatCurrency } from '../../utils/currency'

function toLocalInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function methodLabel(id: PaymentMethod): string {
  const m = PAYMENT_METHODS.find((x) => x.id === id)
  return m ? `${m.icon} ${m.label}` : id
}

interface WalletOpeningBalanceModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function WalletOpeningBalanceModal({ open, onClose, onSuccess }: WalletOpeningBalanceModalProps) {
  const [balances, setBalances] = useState<OpeningBalances>({
    cash: 0,
    jawwal_pay: 0,
    palpay: 0,
    bop: 0,
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // تسويات يدوية (عمليات حرة غير مرتبطة بفواتير)
  const [adjustments, setAdjustments] = useState<WalletAdjustment[]>([])
  const [adjLoading, setAdjLoading] = useState(false)
  const [adjId, setAdjId] = useState<string | null>(null)
  const [adjMethod, setAdjMethod] = useState<PaymentMethod>('cash')
  const [adjSign, setAdjSign] = useState<1 | -1>(1)
  const [adjAmount, setAdjAmount] = useState('')
  const [adjNote, setAdjNote] = useState('')
  const [adjDate, setAdjDate] = useState(() => toLocalInputValue(new Date()))
  const [adjError, setAdjError] = useState('')
  const [adjSaving, setAdjSaving] = useState(false)
  const [adjDeleteTarget, setAdjDeleteTarget] = useState<WalletAdjustment | null>(null)
  const [adjDeleting, setAdjDeleting] = useState(false)

  const loadAdjustments = async () => {
    setAdjLoading(true)
    try {
      setAdjustments(await getWalletAdjustments())
    } catch {
      // تجاهل
    } finally {
      setAdjLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setLoading(true)
    db.settings
      .get('wallet_opening_balances')
      .then((setting) => {
        if (setting?.value && typeof setting.value === 'object') {
          const val = setting.value as OpeningBalances
          setBalances({
            cash: Number(val.cash) || 0,
            jawwal_pay: Number(val.jawwal_pay) || 0,
            palpay: Number(val.palpay) || 0,
            bop: Number(val.bop) || 0,
          })
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
    resetAdjForm()
    loadAdjustments()
  }, [open ])

  const resetAdjForm = () => {
    setAdjId(null)
    setAdjMethod('cash')
    setAdjSign(1)
    setAdjAmount('')
    setAdjNote('')
    setAdjDate(toLocalInputValue(new Date()))
    setAdjError('')
  }

  const startAdjEdit = (a: WalletAdjustment) => {
    setAdjId(a.id)
    setAdjMethod(a.method)
    setAdjSign(a.amount < 0 ? -1 : 1)
    setAdjAmount(String(Math.abs(a.amount)))
    setAdjNote(a.note)
    const d = new Date(a.date)
    setAdjDate(Number.isFinite(d.getTime()) ? toLocalInputValue(d) : toLocalInputValue(new Date()))
    setAdjError('')
  }

  const handleAdjSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setAdjError('')
    const num = Number(adjAmount)
    if (!Number.isFinite(num) || num <= 0) {
      setAdjError('يرجى إدخال مبلغ أكبر من صفر')
      return
    }
    setAdjSaving(true)
    try {
      const list = await saveWalletAdjustment({
        id: adjId || undefined,
        method: adjMethod,
        amount: adjSign * num,
        note: adjNote.trim() || (adjSign > 0 ? 'إيداع يدوي' : 'سحب يدوي'),
        date: adjDate ? new Date(adjDate).toISOString() : new Date().toISOString(),
      })
      setAdjustments(list)
      resetAdjForm()
    } catch (err) {
      setAdjError(err instanceof Error ? err.message : 'تعذر حفظ التسوية')
    } finally {
      setAdjSaving(false)
    }
  }

  const handleAdjDelete = async () => {
    if (!adjDeleteTarget) return
    setAdjDeleting(true)
    try {
      const list = await deleteWalletAdjustment(adjDeleteTarget.id)
      setAdjustments(list)
      if (adjId === adjDeleteTarget.id) resetAdjForm()
      setAdjDeleteTarget(null)
    } catch {
      // تجاهل
    } finally {
      setAdjDeleting(false)
    }
  }

  if (!open) return null

  const handleChange = (method: PaymentMethod, valStr: string) => {
    const num = Math.max(0, Number(valStr) || 0)
    setBalances((prev) => ({
      ...prev,
      [method]: num,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await db.settings.put({
        key: 'wallet_opening_balances',
        value: {
          cash: Number(balances.cash) || 0,
          jawwal_pay: Number(balances.jawwal_pay) || 0,
          palpay: Number(balances.palpay) || 0,
          bop: Number(balances.bop) || 0,
        },
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الأرصدة الافتتاحية')
    } finally {
      setSaving(false)
    }
  }

  const totalCapital =
    (Number(balances.cash) || 0) +
    (Number(balances.jawwal_pay) || 0) +
    (Number(balances.palpay) || 0) +
    (Number(balances.bop) || 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="⚙️ رأس المال والأرصدة الافتتاحية للصناديق"
      type="sheet"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div style={{
            background: 'var(--kpi-danger-bg)',
            border: '1px solid var(--kpi-danger-border)',
            color: 'var(--color-danger-light)',
            padding: '10px 12px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
          }}>
            {error}
          </div>
        )}

        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: '12px 14px',
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.6,
        }}>
          💡 <strong>الرصيد الافتتاحي:</strong> هو السيولة النقدية والبنكية التي بدأت بها نشاطك التجاري. يُضاف إلى رصيد الصندوق والمحفظة دون احتسابه كمبيعات أو أرباح تشغيلية.
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>جارٍ التحميل...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PAYMENT_METHODS.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 140 }}>
                  <span style={{ fontSize: 18 }}>{m.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{m.label}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={balances[m.id] ? String(balances[m.id]) : ''}
                    placeholder="0.00"
                    onChange={(e) => handleChange(m.id, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* إجمالي رأس المال الأولي */}
        <div style={{
          background: 'var(--kpi-blue-bg)',
          border: '1px solid var(--kpi-blue-border)',
          borderRadius: 12,
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>إجمالي رأس المال الابتدائي:</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-primary-light)', direction: 'ltr' }}>
            {totalCapital.toFixed(2)} ₪
          </span>
        </div>

        {/* ── تسويات يدوية: ضبط الميزانية بعمليات حرة ── */}
        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>🧮 تسويات يدوية (ضبط الميزانية)</div>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.7 }}>
            عملية حرة على أي محفظة غير مرتبطة بفاتورة بيع أو شراء — لتصحيح فرق جرد أو إيداع/سحب استثنائي. تظهر في كشف المحفظة ويمكن حذفها أو تعديلها في أي وقت.
          </p>

          {adjError && (
            <div style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: 'var(--color-danger-light)',
              padding: '8px 12px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
            }}>
              {adjError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={() => setAdjSign(1)}
              style={{
                padding: '9px', borderRadius: 10,
                border: adjSign === 1 ? '1px solid transparent' : '1px solid var(--color-border)',
                background: adjSign === 1 ? 'var(--brand-gradient)' : 'transparent',
                color: adjSign === 1 ? '#fff' : 'var(--color-text-secondary)',
                fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-main)',
              }}
            >
              ＋ إيداع
            </button>
            <button
              type="button"
              onClick={() => setAdjSign(-1)}
              style={{
                padding: '9px', borderRadius: 10,
                border: adjSign === -1 ? '1px solid transparent' : '1px solid var(--color-border)',
                background: adjSign === -1 ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'transparent',
                color: adjSign === -1 ? '#fff' : 'var(--color-text-secondary)',
                fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-main)',
              }}
            >
              − سحب
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setAdjMethod(m.id)}
                style={{
                  padding: '7px 4px', borderRadius: 9,
                  border: adjMethod === m.id ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: adjMethod === m.id ? 'var(--color-primary-glow)' : 'transparent',
                  color: adjMethod === m.id ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-main)',
                }}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          <div className="form-grid-two">
            <Input
              label="المبلغ ₪ *"
              placeholder="0.00"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              inputMode="decimal"
            />
            <div>
              <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>التاريخ</label>
              <input
                type="datetime-local"
                className="input"
                value={adjDate}
                onChange={(e) => setAdjDate(e.target.value)}
                style={{ width: '100%', fontSize: 13 }}
              />
            </div>
          </div>

          <Input
            label="البيان"
            placeholder="مثال: فرق جرد الصندوق، إيداع شخصي..."
            value={adjNote}
            onChange={(e) => setAdjNote(e.target.value)}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            {adjId && (
              <button
                type="button"
                onClick={resetAdjForm}
                className="btn btn-ghost btn-sm"
                style={{ flex: 1 }}
              >
                إلغاء التعديل
              </button>
            )}
            <button
              type="button"
              onClick={handleAdjSubmit}
              disabled={adjSaving}
              className="btn btn-primary btn-sm"
              style={{ flex: 2 }}
            >
              {adjSaving ? 'جارٍ الحفظ...' : adjId ? '✓ حفظ تعديل التسوية' : '＋ إضافة التسوية'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-muted)' }}>
              التسويات المسجلة ({adjustments.length})
            </div>
            {adjLoading ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }}>جارٍ التحميل...</div>
            ) : adjustments.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }}>لا توجد تسويات بعد</div>
            ) : (
              [...adjustments]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'var(--color-input-bg)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 10, padding: '8px 10px',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>
                        {methodLabel(a.method)} · {new Date(a.date).toLocaleDateString('ar-EG')}
                      </div>
                      {a.note && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.note}
                        </div>
                      )}
                    </div>
                    <strong style={{
                      direction: 'ltr', fontSize: 13,
                      color: a.amount > 0 ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                    }}>
                      {a.amount > 0 ? '+' : '-'}{formatCurrency(Math.abs(a.amount))}
                    </strong>
                    <button
                      type="button"
                      onClick={() => startAdjEdit(a)}
                      title="تعديل"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjDeleteTarget(a)}
                      title="حذف"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                    >
                      🗑️
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button
            type="submit"
            variant="primary"
            disabled={saving || loading}
            style={{ flex: 1, padding: 12, fontSize: 14, fontWeight: 800 }}
          >
            {saving ? 'جارٍ الحفظ...' : 'حفظ الأرصدة الافتتاحية'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            style={{ padding: '12px 18px', fontSize: 14 }}
          >
            إلغاء
          </Button>
        </div>
      </form>

      <ConfirmModal
        open={adjDeleteTarget !== null}
        onClose={() => setAdjDeleteTarget(null)}
        onConfirm={handleAdjDelete}
        loading={adjDeleting}
        title="حذف التسوية اليدوية"
        icon="🧮"
        message={adjDeleteTarget ? `حذف ${adjDeleteTarget.amount > 0 ? 'إيداع' : 'سحب'} ${formatCurrency(Math.abs(adjDeleteTarget.amount))}؟` : ''}
        subMessage="سيُعكس أثرها على رصيد المحفظة فوراً."
        confirmText="تأكيد الحذف"
        cancelText="إلغاء"
      />
    </Modal>
  )
}
