import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { PAYMENT_METHODS, type PaymentMethod, type Purchase } from '../../db/db'
import { addSupplierDebtPayment } from '../../hooks/usePurchases'
import { useAccountBalances } from '../../hooks/useInvoices'
import { formatCurrency } from '../../utils/currency'

interface SupplierPaymentModalProps {
  open: boolean
  purchase: Purchase
  onClose: () => void
  onSuccess: () => void
}

export function SupplierPaymentModal({ open, purchase, onClose, onSuccess }: SupplierPaymentModalProps) {
  const balances = useAccountBalances()
  const remainingDebt = purchase.debtAmount || 0
  const [amount, setAmount] = useState(String(remainingDebt))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(purchase.paymentMethod || 'cash')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  const currentWalletBalance = getMethodBalance(paymentMethod)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const val = Number(amount)
    if (!val || val <= 0) {
      setError('يرجى إدخال مبلغ سداد أكبر من صفر')
      return
    }

    if (val > remainingDebt) {
      setError(`المبلغ المدخل (${val} ₪) يتجاوز دين المورد المتبقي (${remainingDebt} ₪)`)
      return
    }

    setLoading(true)
    try {
      await addSupplierDebtPayment({
        purchaseId: purchase.id!,
        amount: val,
        paymentMethod,
        notes: notes.trim(),
        date: new Date(),
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل السداد')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`💳 سداد دفعة للمورد — ${purchase.supplierName || 'فاتورة شراء'}`}
      type="sheet"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

        {/* ملخص الفاتورة المالية */}
        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: '12px 14px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          textAlign: 'center',
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>إجمالي الفاتورة</div>
            <strong style={{ fontSize: 14, direction: 'ltr', display: 'block', marginTop: 2 }}>
              {formatCurrency(purchase.totalAmount)}
            </strong>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>المدفوع سابقاً</div>
            <strong style={{ fontSize: 14, color: 'var(--color-success-light)', direction: 'ltr', display: 'block', marginTop: 2 }}>
              {formatCurrency(purchase.paidAmount || 0)}
            </strong>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>المتبقي كدين</div>
            <strong style={{ fontSize: 14, color: 'var(--color-danger-light)', direction: 'ltr', display: 'block', marginTop: 2 }}>
              {formatCurrency(remainingDebt)}
            </strong>
          </div>
        </div>

        {/* مبلغ السداد */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 800 }}>مبلغ الدفعة المسددة:</label>
            <button
              type="button"
              onClick={() => setAmount(String(remainingDebt))}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-primary-light)',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              سداد كامل الدين ({formatCurrency(remainingDebt)})
            </button>
          </div>
          <Input
            type="number"
            min="0.01"
            max={remainingDebt}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
            autoFocus
          />
          {currentWalletBalance < Number(amount) && Number(amount) > 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-warning-light)', marginTop: 4 }}>
              ⚠️ تنبيه: المبلغ أكبر من الرصيد المتوفر في المحفظة المختارة ({formatCurrency(currentWalletBalance)})
            </div>
          )}
        </div>

        {/* اختيار المحفظة / الصندوق */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
            الصندوق / المحفظة المدفوع منها:
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {PAYMENT_METHODS.map((m) => {
              const active = paymentMethod === m.id
              const bal = getMethodBalance(m.id)
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id)}
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
                    الرصيد: {formatCurrency(bal)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ملاحظات وبيان الدفعة */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
            ملاحظات / بيان الدفعة (اختياري):
          </label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثال: دفعة شيك، تحويل عبر التطبيق، تسليم نقدي للمندوب..."
          />
        </div>

        {/* ملخص بعد السداد */}
        <div style={{
          background: 'var(--color-input-bg)',
          borderRadius: 10,
          padding: '10px 12px',
          fontSize: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>الدين المتبقي بعد هذه الدفعة:</span>
          <strong style={{ direction: 'ltr', color: Math.max(0, remainingDebt - (Number(amount) || 0)) === 0 ? 'var(--color-success-light)' : 'var(--color-danger-light)' }}>
            {formatCurrency(Math.max(0, remainingDebt - (Number(amount) || 0)))}
          </strong>
        </div>

        {/* أزرار الإجراء */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button
            type="submit"
            variant="primary"
            disabled={loading || Number(amount) <= 0}
            style={{ flex: 1, padding: 12, fontSize: 14, fontWeight: 800 }}
          >
            {loading ? 'جارٍ تسجيل السداد...' : `تأكيد صرف ${formatCurrency(Number(amount) || 0)}`}
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

        {/* سجل الدفعات السابقة */}
        {purchase.supplierPayments && purchase.supplierPayments.length > 0 && (
          <div style={{ marginTop: 10, borderTop: '1px dashed var(--color-border)', paddingTop: 10 }}>
            <h4 style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-muted)', marginBottom: 6 }}>
              📋 دفعات سابقة مسددة لهذه الفاتورة:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {purchase.supplierPayments.map((p, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: 'var(--color-bg-card)',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <span>{new Date(p.date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    {p.notes && <span style={{ color: 'var(--color-text-muted)', marginRight: 6 }}>({p.notes})</span>}
                  </div>
                  <strong style={{ direction: 'ltr', color: 'var(--color-primary-light)' }}>
                    {formatCurrency(p.amount)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
