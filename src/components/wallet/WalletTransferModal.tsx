import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { PAYMENT_METHODS, type PaymentMethod } from '../../db/db'
import { addWalletTransfer } from '../../utils/wallet'
import { useAccountBalances } from '../../hooks/useInvoices'
import { formatCurrency } from '../../utils/currency'

interface WalletTransferModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  initialFrom?: PaymentMethod
}

export function WalletTransferModal({ open, onClose, onSuccess, initialFrom }: WalletTransferModalProps) {
  const balances = useAccountBalances()
  const [fromMethod, setFromMethod] = useState<PaymentMethod>(initialFrom || 'cash')
  const [toMethod, setToMethod] = useState<PaymentMethod>(
    (initialFrom === 'cash' ? 'bop' : initialFrom ? 'cash' : 'bop') as PaymentMethod,
  )
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const getMethodBalance = (m: PaymentMethod): number => {
    switch (m) {
      case 'cash': return balances.cash
      case 'jawwal_pay': return balances.jawwal_pay
      case 'palpay': return balances.palpay
      case 'bop': return balances.bop
      default: return 0
    }
  }

  const currentFromBalance = getMethodBalance(fromMethod)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const val = Number(amount)
    if (!val || val <= 0) {
      setError('يرجى إدخال مبلغ تحويل صالح أكبر من صفر')
      return
    }

    if (fromMethod === toMethod) {
      setError('يرجى اختيار محفظتين مختلفتين للتحويل بينهما')
      return
    }

    setLoading(true)
    try {
      await addWalletTransfer({
        fromMethod,
        toMethod,
        amount: val,
        notes: notes.trim(),
        date: new Date(),
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إتمام التحويل')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🔄 تحويل أموال بين الصناديق والمحافظ"
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

        {/* من محفظة */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
            من (خصم من):
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {PAYMENT_METHODS.map((m) => {
              const active = fromMethod === m.id
              const bal = getMethodBalance(m.id)
              return (
                <button
                  type="button"
                  key={`from-${m.id}`}
                  onClick={() => {
                    setFromMethod(m.id)
                    if (toMethod === m.id) {
                      const nextTo = PAYMENT_METHODS.find((x) => x.id !== m.id)?.id || 'cash'
                      setToMethod(nextTo)
                    }
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '10px 8px',
                    borderRadius: 10,
                    border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: active ? 'var(--color-primary-glow)' : 'var(--color-input-bg)',
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{m.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{m.label}</span>
                  <span style={{ fontSize: 11, color: bal < 0 ? 'var(--color-danger-light)' : 'var(--color-text-muted)', direction: 'ltr' }}>
                    {formatCurrency(bal)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* إلى محفظة */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
            إلى (إيداع في):
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {PAYMENT_METHODS.map((m) => {
              const active = toMethod === m.id
              const isSame = fromMethod === m.id
              const bal = getMethodBalance(m.id)
              return (
                <button
                  type="button"
                  key={`to-${m.id}`}
                  disabled={isSame}
                  onClick={() => setToMethod(m.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '10px 8px',
                    borderRadius: 10,
                    border: active ? '2px solid var(--color-success-light)' : '1px solid var(--color-border)',
                    background: active ? 'var(--kpi-green-bg)' : 'var(--color-input-bg)',
                    color: isSame ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                    opacity: isSame ? 0.35 : 1,
                    cursor: isSame ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{m.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{m.label}</span>
                  <span style={{ fontSize: 11, color: bal < 0 ? 'var(--color-danger-light)' : 'var(--color-text-muted)', direction: 'ltr' }}>
                    {formatCurrency(bal)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* المبلغ */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
            مبلغ التحويل:
          </label>
          <Input
            type="number"
            min="0.01"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
            autoFocus
          />
          {currentFromBalance < Number(amount) && Number(amount) > 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-warning-light)', marginTop: 4 }}>
              ⚠️ تنبيه: المبلغ أكبر من رصيد الصندوق الحالي ({formatCurrency(currentFromBalance)})
            </div>
          )}
        </div>

        {/* الملاحظات */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
            البيان / ملاحظات (اختياري):
          </label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثال: توريد نقدي لحساب البنك، تغذية صندوق الكاش..."
          />
        </div>

        {/* ملخص العملية */}
        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: '12px 14px',
          fontSize: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <div style={{ fontWeight: 800, color: 'var(--color-text-muted)' }}>الأثر المحاسبي:</div>
          <div>ينقص {PAYMENT_METHODS.find((x) => x.id === fromMethod)?.label} بمقدار {formatCurrency(Number(amount) || 0)}</div>
          <div>يزيد {PAYMENT_METHODS.find((x) => x.id === toMethod)?.label} بمقدار {formatCurrency(Number(amount) || 0)}</div>
          <div style={{ color: 'var(--color-success-light)', fontWeight: 700 }}>إجمالي السيولة الكلية للمتجر: لا يتغير (0 ₪)</div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <Button
            type="submit"
            variant="primary"
            style={{ flex: 1, padding: 12, fontSize: 14, fontWeight: 800 }}
            disabled={loading}
          >
            {loading ? 'جاري التحويل...' : 'تأكيد التحويل الآن'}
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
    </Modal>
  )
}
