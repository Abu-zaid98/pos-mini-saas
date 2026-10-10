import React, { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { PAYMENT_METHODS, type Product, type PaymentMethod, type PaymentType } from '../../db/db'
import { addQuickRestock } from '../../hooks/usePurchases'
import { useSupplierNames } from '../../hooks/useSuppliers'
import { useAccountBalances } from '../../hooks/useInvoices'
import { formatCurrency } from '../../utils/currency'
import { GRAMS_PER_KG, averageCostPerKg, getProductType } from '../../utils/units'

interface QuickRestockModalProps {
  open: boolean
  onClose: () => void
  product: Product | null
  onSuccess?: () => void
}

export function QuickRestockModal({ open, onClose, product, onSuccess }: QuickRestockModalProps) {
  const balances = useAccountBalances()
  const supplierNames = useSupplierNames()
  const [addedQty, setAddedQty] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType>('cash')
  const [partialPaid, setPartialPaid] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 16))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && product) {
      setAddedQty('')
      setCostPrice(String(product.costPrice ?? ''))
      setSupplierName('')
      setPaymentType('cash')
      setPartialPaid('')
      setNotes('')
      setDateStr(new Date().toISOString().slice(0, 16))
      setError('')
    }
  }, [open, product])

  if (!product || getProductType(product) === 'service') return null

  const isWeighted = getProductType(product) === 'weighted'
  // الموزون: الإدخال بالكيلو والتكلفة للكيلو — يُحوّل للجرام عند الحفظ
  const currentStock = product.quantity
  const numAddedDisplay = isWeighted ? parseFloat(addedQty) || 0 : parseInt(addedQty) || 0
  const numAdded = isWeighted ? Math.round(numAddedDisplay * GRAMS_PER_KG) : numAddedDisplay
  const newStock = currentStock + numAdded
  const numCost = parseFloat(costPrice) || 0
  const totalCost = numAddedDisplay * numCost

  const fmtStock = (gramsOrPieces: number) =>
    isWeighted ? `${Math.round((gramsOrPieces / GRAMS_PER_KG) * 1000) / 1000} كغ` : String(gramsOrPieces)

  // متوسط التكلفة المتوقع بعد التوريد (مرجح بالمخزون)
  const toPricing = (base: number) => isWeighted ? base / GRAMS_PER_KG : base
  const projectedAvg = numAddedDisplay > 0
    ? averageCostPerKg(toPricing(currentStock), Number(product.costPrice) || 0, numAddedDisplay, numCost)
    : Number(product.costPrice) || 0

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError('')

    if (numAdded <= 0) {
      setError('يرجى إدخال كمية صحيحة أكبر من الصفر')
      return
    }

    if (numCost < 0) {
      setError('سعر التكلفة غير صالح')
      return
    }

    let paid = totalCost
    let debt = 0
    if (paymentType === 'debt') {
      paid = 0
      debt = totalCost
    } else if (paymentType === 'partial') {
      const parsed = parseFloat(partialPaid) || 0
      paid = Math.min(totalCost, Math.max(0, parsed))
      debt = Math.max(0, totalCost - paid)
    }

    setLoading(true)
    try {
      await addQuickRestock({
        productId: product.id!,
        addedQuantity: numAdded,
        newCostPrice: numCost,
        supplierName: supplierName.trim(),
        paymentMethod: paymentType === 'debt' ? undefined : paymentMethod,
        paidAmount: paid,
        debtAmount: debt,
        paymentType,
        date: dateStr ? new Date(dateStr) : new Date(),
        notes: notes.trim(),
      })

      onSuccess?.()
      onClose()
    } catch (err) {
      console.error(err)
      setError('حدث خطأ أثناء توريد البضاعة')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`📥 توريد بضاعة: ${product.name}`}
      type="sheet"
      footer={
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{ flex: 1 }}
          >
            إلغاء
          </button>
          <Button
            variant="primary"
            loading={loading}
            onClick={handleSubmit}
            style={{ flex: 2 }}
          >
            ✓ تأكيد توريد {numAddedDisplay > 0 ? (isWeighted ? `(${numAddedDisplay} كغ)` : `(${numAdded} قطعة)`) : ''}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10,
            padding: '8px 12px',
            color: 'var(--color-danger-light)',
            fontSize: 13,
            fontWeight: 700,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Stock Math Highlight Card */}
        <div style={{
          background: 'var(--color-bg-card)',
          border: '1.5px solid var(--color-border)',
          borderRadius: 14,
          padding: '12px 16px',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr auto 1fr',
          alignItems: 'center',
          textAlign: 'center',
          gap: 6,
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>المخزون الحالي</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)' }}>
              {fmtStock(currentStock)}
            </div>
          </div>
          <div style={{ fontSize: 20, color: 'var(--color-primary)' }}>+</div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-primary)' }}>الكمية المشتراة</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-primary-light)' }}>
              {isWeighted ? `${numAddedDisplay} كغ` : numAdded}
            </div>
          </div>
          <div style={{ fontSize: 20, color: 'var(--color-success)' }}>=</div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-success-light)' }}>المخزون الجديد</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--color-success-light)' }}>
              {fmtStock(newStock)}
            </div>
          </div>
        </div>

        {/* Added Quantity & Cost Price */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input
            label={isWeighted ? 'الكمية المضافة (كغ) *' : 'الكمية المضافة *'}
            placeholder={isWeighted ? 'مثال: 2.5' : 'مثال: 100'}
            value={addedQty}
            onChange={(e) => setAddedQty(e.target.value)}
            inputMode="decimal"
            autoFocus
            required
          />

          <Input
            label={isWeighted ? 'سعر تكلفة الكيلو ₪ *' : 'سعر تكلفة الشراء ₪ *'}
            placeholder="0.00"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            inputMode="decimal"
            required
            hint={numAddedDisplay > 0 ? `متوسط التكلفة بعد التوريد: ${projectedAvg.toFixed(2)} ₪${isWeighted ? '/كغ' : ''}` : undefined}
          />
        </div>

        {/* Total Cost Badge */}
        {numAdded > 0 && (
          <div style={{
            background: 'rgba(59,130,246,0.1)',
            border: '1px solid rgba(59,130,246,0.25)',
            borderRadius: 12,
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>إجمالي قيمة فاتورة الشراء:</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-primary-light)' }}>
              {totalCost.toFixed(2)} ₪
            </span>
          </div>
        )}

        {/* Supplier & Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Input
              label="اسم المورد / الشركة"
              placeholder="مثال: شركة سند..."
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
            />
            {supplierNames.length > 0 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginTop: 6 }}>
                {supplierNames.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSupplierName(n)}
                    style={{
                      flexShrink: 0, padding: '4px 12px', borderRadius: 50,
                      border: supplierName.trim() === n ? '1px solid transparent' : '1px solid var(--color-border)',
                      background: supplierName.trim() === n ? 'var(--brand-gradient)' : 'var(--color-bg-card)',
                      color: supplierName.trim() === n ? '#fff' : 'var(--color-text-muted)',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-main)',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>
              التاريخ والوقت
            </label>
            <input
              type="datetime-local"
              className="input"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              style={{ width: '100%', fontSize: 13 }}
            />
          </div>
        </div>

        {/* Payment Status: Cash / Debt / Partial */}
        <div>
          <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>
            حالة الدفع للمورد *
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[
              { id: 'cash' as PaymentType, label: '💵 نقداً كاش' },
              { id: 'debt' as PaymentType, label: '📝 آجل (دين)' },
              { id: 'partial' as PaymentType, label: '⚖️ جزئي' },
            ].map((t) => {
              const active = paymentType === t.id
              const activeStyle =
                t.id === 'debt'
                  ? { border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.15)', color: 'var(--color-danger-light)' }
                  : t.id === 'partial'
                    ? { border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.12)', color: 'var(--color-warning-light)' }
                    : { border: '1px solid transparent', background: 'var(--brand-gradient)', color: '#fff' }
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPaymentType(t.id)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 8,
                    border: active ? activeStyle.border : '1px solid var(--color-border)',
                    background: active ? activeStyle.background : 'var(--color-bg-card)',
                    color: active ? activeStyle.color : 'var(--color-text-secondary)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* If partial, input for paid amount */}
        {paymentType === 'partial' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            background: 'rgba(255,255,255,0.03)',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--color-border)',
          }}>
            <Input
              label="المبلغ المدفوع كاش ₪ *"
              placeholder="0.00"
              value={partialPaid}
              onChange={(e) => setPartialPaid(e.target.value)}
              inputMode="decimal"
              required
            />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>المتبقي دين للمورد:</span>
              <strong style={{ fontSize: 15, color: 'var(--color-danger-light)', marginTop: 2 }}>
                {formatCurrency(Math.max(0, totalCost - (parseFloat(partialPaid) || 0)))}
              </strong>
            </div>
          </div>
        )}

        {/* Payment Method (only if there is cash paid) */}
        {paymentType !== 'debt' && (
          <div>
            <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>
              صندوق / محفظة الدفع
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {PAYMENT_METHODS.map((m) => {
                const active = paymentMethod === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: active ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: active ? 'rgba(59,130,246,0.15)' : 'var(--color-bg-card)',
                      color: active ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 3,
                      justifyContent: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{m.icon}</span>
                      <span>{m.label}</span>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                      الرصيد: {formatCurrency(balances[m.id])}
                    </span>
                  </button>
                )
              })}
            </div>
            {totalCost > 0 && (
              <div style={{
                marginTop: 8,
                padding: '6px 10px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--color-border)',
                fontSize: 11,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: 'var(--color-text-secondary)',
              }}>
                <span>الخصم من المحفظة:</span>
                <strong style={{
                  color: 'var(--color-primary-light)'
                }}>
                  {formatCurrency(paymentType === 'cash' ? totalCost : (parseFloat(partialPaid) || 0))}
                </strong>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>
            ملاحظات الشراء
          </label>
          <input
            className="input"
            placeholder="مثلاً: رقم فاتورة المورد، دفعة تحت الحساب..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  )
}
