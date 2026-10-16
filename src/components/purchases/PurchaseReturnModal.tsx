import { useMemo, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { CustomSelect } from '../ui/CustomSelect'
import { type Purchase, type PaymentMethod, getPaymentMethodName } from '../../db/db'
import { useWallets, activeWallets } from '../../hooks/useWallets'
import { returnPurchaseItems, type PurchaseRefundItemInput } from '../../hooks/usePurchases'
import { formatCurrency } from '../../utils/currency'
import { formatDateTime } from '../../utils/datetime'
import { GRAMS_PER_KG } from '../../utils/units'

interface PurchaseReturnModalProps {
  open: boolean
  purchase: Purchase
  onClose: () => void
  onSuccess: () => void
}

interface ItemReturnState {
  qtyToReturn: number
  reason: string
}

export function PurchaseReturnModal({ open, purchase, onClose, onSuccess }: PurchaseReturnModalProps) {
  // الكميات المرتجعة سابقاً لكل صنف (بالوحدات الأساسية: قطع أو جرام)
  const previousReturnsByProduct = useMemo(() => {
    const map = new Map<number, number>()
    if (purchase.returnedItems) {
      for (const r of purchase.returnedItems) {
        map.set(r.productId, (map.get(r.productId) || 0) + r.quantity)
      }
    }
    return map
  }, [purchase.returnedItems])

  const [returnStates, setReturnStates] = useState<Record<number, ItemReturnState>>({})
  const [refundMethod, setRefundMethod] = useState<'cash' | 'debt'>(
    (purchase.debtAmount || 0) > 0 ? 'debt' : 'cash',
  )
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(purchase.paymentMethod || 'cash')
  const [generalNote, setGeneralNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const allWallets = useWallets()
  const activeList = activeWallets(allWallets)
  const wallets = activeList.length ? activeList : allWallets

  if (!open) return null

  // تجهيز الأصناف مع الكميات المتاحة (بالوحدات الأساسية + وحدة العرض)
  const itemsWithAvailable = purchase.items.map((item) => {
    const isWeighted = item.unit === 'kg'
    const alreadyReturned = previousReturnsByProduct.get(item.productId) || 0
    const availableBase = Math.max(0, item.quantity - alreadyReturned)
    const perDisplayUnit = isWeighted ? GRAMS_PER_KG : 1
    const costPerBase = isWeighted ? (item.costPrice || 0) / GRAMS_PER_KG : (item.costPrice || 0)
    return {
      ...item,
      isWeighted,
      alreadyReturned,
      availableBase,
      perDisplayUnit,
      availableDisplay: availableBase / perDisplayUnit,
      costPerBase,
    }
  })

  const hasAnyRefundable = itemsWithAvailable.some((i) => i.availableBase > 0)

  const itemsToReturn: PurchaseRefundItemInput[] = []
  let totalRefundAmount = 0

  for (const item of itemsWithAvailable) {
    const state = returnStates[item.productId]
    const displayQty = state?.qtyToReturn || 0
    const baseQty = Math.round(displayQty * item.perDisplayUnit * 1000) / 1000
    if (baseQty > 0) {
      const lineRefund = Math.round(baseQty * item.costPerBase * 100) / 100
      totalRefundAmount += lineRefund
      itemsToReturn.push({
        productId: item.productId,
        productName: item.productName,
        quantity: baseQty,
        unit: item.unit,
        costPrice: item.costPrice,
        refundAmount: lineRefund,
        reason: state?.reason || generalNote,
      })
    }
  }

  totalRefundAmount = Math.round(totalRefundAmount * 100) / 100
  const currentDebt = Math.round((Number(purchase.debtAmount) || 0) * 100) / 100

  const handleQtyChange = (productId: number, val: number, maxDisplay: number) => {
    const clamped = Math.max(0, Math.min(val, maxDisplay))
    setReturnStates((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], qtyToReturn: clamped },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (itemsToReturn.length === 0) {
      setError('يرجى تحديد كمية صنف واحد على الأقل للإرجاع')
      return
    }
    if (refundMethod === 'debt' && totalRefundAmount > currentDebt + 0.001) {
      setError(`مبلغ المرتجع (${formatCurrency(totalRefundAmount)}) أكبر من دين المورد المتبقي (${formatCurrency(currentDebt)}). اختر «استرداد نقدي» للجزء الزائد.`)
      return
    }

    setLoading(true)
    try {
      await returnPurchaseItems({
        purchaseId: purchase.id!,
        items: itemsToReturn,
        refundMethod,
        paymentMethod: refundMethod === 'cash' ? paymentMethod : undefined,
        note: generalNote.trim(),
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل المرتجع')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`↩️ تسجيل مرتجع للمورد — فاتورة #${purchase.invoiceNumber || purchase.id}`}
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

        {!hasAnyRefundable ? (
          <div className="empty-state" style={{ padding: 20 }}>
            <div className="empty-icon">✅</div>
            <p style={{ fontWeight: 800, fontSize: 14 }}>تم إرجاع كافة أصناف هذه الفاتورة مسبقاً</p>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              إجمالي المرتجعات السابقة: {formatCurrency(purchase.returnedAmount || 0)}
            </span>
          </div>
        ) : (
          <>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 800 }}>
                حدد الأصناف والكمية المرتجعة للمورد:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {itemsWithAvailable.map((item) => {
                  const state = returnStates[item.productId]
                  const currentQty = state?.qtyToReturn || 0
                  const isFullyReturned = item.availableBase <= 0
                  const unitLabel = item.isWeighted ? 'كغ' : 'قطعة'
                  const lineRefund = Math.round(currentQty * item.perDisplayUnit * item.costPerBase * 100) / 100

                  return (
                    <div
                      key={item.productId}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: currentQty > 0 ? 'var(--color-primary-glow)' : 'var(--color-input-bg)',
                        border: currentQty > 0 ? '1px solid var(--color-border-active)' : '1px solid var(--color-border)',
                        opacity: isFullyReturned ? 0.6 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div>
                          <strong style={{ fontSize: 13 }}>{item.productName}</strong>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                            مورَّد: {item.isWeighted ? `${Math.round(item.quantity / GRAMS_PER_KG * 1000) / 1000} كغ` : item.quantity}
                            {item.alreadyReturned > 0 ? ` (أُرجع: ${item.isWeighted ? `${Math.round(item.alreadyReturned / GRAMS_PER_KG * 1000) / 1000} كغ` : item.alreadyReturned})` : ''}
                            {' · '}التكلفة: {formatCurrency(item.costPrice)}{item.isWeighted ? '/كغ' : ''}
                          </div>
                        </div>
                        {isFullyReturned ? (
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700 }}>مرتجع بالكامل ✓</span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--color-primary-light)', fontWeight: 800 }}>
                            متاح: {Math.round(item.availableDisplay * 1000) / 1000} {unitLabel}
                          </span>
                        )}
                      </div>

                      {!isFullyReturned && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>الكمية المرتجعة:</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => handleQtyChange(item.productId, currentQty - (item.isWeighted ? 0.1 : 1), item.availableDisplay)}
                              disabled={currentQty <= 0}
                              style={{
                                width: 28, height: 28, borderRadius: 6, border: '1px solid var(--color-border)',
                                background: 'var(--color-bg-card)', cursor: 'pointer', fontWeight: 900,
                              }}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              max={item.availableDisplay}
                              step={item.isWeighted ? '0.1' : '1'}
                              value={currentQty || ''}
                              placeholder="0"
                              onChange={(e) => handleQtyChange(item.productId, Number(e.target.value) || 0, item.availableDisplay)}
                              style={{
                                width: 72, textAlign: 'center', padding: '4px', borderRadius: 6,
                                border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
                                color: 'var(--color-text-primary)', fontFamily: 'var(--font-main)', fontWeight: 800,
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleQtyChange(item.productId, currentQty + (item.isWeighted ? 0.1 : 1), item.availableDisplay)}
                              disabled={currentQty >= item.availableDisplay}
                              style={{
                                width: 28, height: 28, borderRadius: 6, border: '1px solid var(--color-border)',
                                background: 'var(--color-bg-card)', cursor: 'pointer', fontWeight: 900,
                              }}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQtyChange(item.productId, item.availableDisplay, item.availableDisplay)}
                              style={{
                                padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-border)',
                                background: 'var(--color-bg-card)', fontSize: 11, cursor: 'pointer',
                              }}
                            >
                              الكل
                            </button>
                          </div>
                          {currentQty > 0 && (
                            <span style={{ marginInlineStart: 'auto', fontWeight: 800, color: 'var(--color-success-light)', direction: 'ltr', fontSize: 13 }}>
                              {formatCurrency(lineRefund)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {totalRefundAmount > 0 && (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
                  طريقة التسوية المالية:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  <button
                    type="button"
                    disabled={currentDebt <= 0}
                    onClick={() => setRefundMethod('debt')}
                    style={{
                      padding: '10px 8px', borderRadius: 10,
                      border: refundMethod === 'debt' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: refundMethod === 'debt' ? 'var(--color-primary-glow)' : 'var(--color-input-bg)',
                      color: 'var(--color-text-primary)', cursor: currentDebt <= 0 ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--font-main)', opacity: currentDebt <= 0 ? 0.4 : 1,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>🤝</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>خصم من دين المورد</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {currentDebt > 0 ? `الدين الحالي (${formatCurrency(currentDebt)})` : 'لا يوجد دين'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRefundMethod('cash')}
                    style={{
                      padding: '10px 8px', borderRadius: 10,
                      border: refundMethod === 'cash' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: refundMethod === 'cash' ? 'var(--color-primary-glow)' : 'var(--color-input-bg)',
                      color: 'var(--color-text-primary)', cursor: 'pointer', fontFamily: 'var(--font-main)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>💵</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>استرداد نقدي</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>يدخل إلى المحفظة</span>
                  </button>
                </div>
              </div>
            )}

            {totalRefundAmount > 0 && refundMethod === 'cash' && (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
                  المحفظة المسترد إليها:
                </label>
                <CustomSelect
                  value={paymentMethod}
                  onChange={(m) => setPaymentMethod(m as PaymentMethod)}
                  options={wallets.map((m) => ({ value: m.id, label: `${m.icon} ${m.name}` }))}
                />
              </div>
            )}

            {totalRefundAmount > 0 && (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
                  سبب الإرجاع / ملاحظات (اختياري):
                </label>
                <Input
                  value={generalNote}
                  onChange={(e) => setGeneralNote(e.target.value)}
                  placeholder="مثال: بضاعة تالفة، مخالفة للمواصفات، إلغاء طلبية..."
                />
              </div>
            )}

            {totalRefundAmount > 0 && (
              <div style={{
                background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                borderRadius: 12, padding: '12px 14px', fontSize: 13,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>عدد الأصناف المرتجعة:</span>
                  <strong>{itemsToReturn.length} صنف</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-warning-light)', fontWeight: 800 }}>
                  <span>إجمالي قيمة المرتجع:</span>
                  <span style={{ direction: 'ltr' }}>{formatCurrency(totalRefundAmount)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', paddingTop: 6 }}>
                  {refundMethod === 'cash'
                    ? `سيتم خصم البضاعة من المخزون وإيداع ${formatCurrency(totalRefundAmount)} في ${getPaymentMethodName(paymentMethod)}`
                    : `سيتم خصم البضاعة من المخزون وتخفيض دين المورد بمقدار ${formatCurrency(totalRefundAmount)}`}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button
                type="submit"
                variant="primary"
                disabled={loading || totalRefundAmount <= 0}
                style={{ flex: 1, padding: 12, fontSize: 14 }}
              >
                {loading ? 'جارٍ تسجيل المرتجع...' : `تأكيد إرجاع البضاعة (${formatCurrency(totalRefundAmount)})`}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose} style={{ padding: '12px 18px', fontSize: 14 }}>
                إلغاء
              </Button>
            </div>
          </>
        )}

        {purchase.returnedItems && purchase.returnedItems.length > 0 && (
          <div style={{ marginTop: 10, borderTop: '1px dashed var(--color-border)', paddingTop: 12 }}>
            <h4 style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: 'var(--color-text-muted)' }}>
              📋 سجل المرتجعات المسجلة سابقاً لهذه الفاتورة:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {purchase.returnedItems.map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 10px', borderRadius: 8, background: 'var(--color-input-bg)', fontSize: 12,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700 }}>
                      {r.productName} × {r.unit === 'kg' ? `${Math.round(r.quantity / GRAMS_PER_KG * 1000) / 1000} كغ` : r.quantity}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'block' }}>
                      {formatDateTime(r.date)}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </span>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ fontWeight: 800, direction: 'ltr', display: 'block', color: 'var(--color-success-light)' }}>
                      {formatCurrency(r.refundAmount)}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                      {r.refundMethod === 'debt' ? 'خصم دين' : 'استرداد كاش'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
