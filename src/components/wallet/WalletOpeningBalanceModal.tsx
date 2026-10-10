import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { db, PAYMENT_METHODS, type PaymentMethod } from '../../db/db'
import type { OpeningBalances } from '../../utils/wallet'

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
  }, [open])

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
    </Modal>
  )
}
