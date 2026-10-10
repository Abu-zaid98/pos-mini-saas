import { useMemo, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { CustomSelect } from '../ui/CustomSelect'
import {
  type Invoice,
  type PaymentMethod,
  PAYMENT_METHODS,
  getPaymentMethodName,
} from '../../db/db'
import { refundInvoiceItems, type RefundItemInput } from '../../hooks/useInvoices'
import { formatCurrency } from '../../utils/currency'
import { formatLineQty, getItemUnit, lineDiscountAmount } from '../../utils/units'

interface InvoiceReturnModalProps {
  open: boolean
  invoice: Invoice
  onClose: () => void
  onSuccess: () => void
}

interface ItemReturnState {
  qtyToReturn: number
  reason: string
}

export function InvoiceReturnModal({ open, invoice, onClose, onSuccess }: InvoiceReturnModalProps) {
  // حساب الكميات المرتجعة سابقاً لكل صنف
  const previousReturnsByProduct = useMemo(() => {
    const map = new Map<number, number>()
    if (invoice.returnedItems) {
      for (const r of invoice.returnedItems) {
        map.set(r.productId, (map.get(r.productId) || 0) + r.qty)
      }
    }
    return map
  }, [invoice.returnedItems])

  // حالة كل بند (الكمية المراد إرجاعها)
  const [returnStates, setReturnStates] = useState<Record<number, ItemReturnState>>({})
  const [refundMethod, setRefundMethod] = useState<'cash' | 'debt'>(
    invoice.debtAmount > 0 ? 'debt' : 'cash',
  )
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(invoice.paymentMethod || 'cash')
  const [generalNote, setGeneralNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  // حساب الكميات المتاحة للإرجاع
  const itemsWithAvailable = invoice.items.map((item) => {
    const alreadyReturned = previousReturnsByProduct.get(item.productId) || 0
    const availableQty = Math.max(0, item.qty - alreadyReturned)
    const lineNet = item.price * item.qty - lineDiscountAmount(item)
    const effectiveUnitPrice = item.qty > 0 ? lineNet / item.qty : item.price
    return {
      ...item,
      alreadyReturned,
      availableQty,
      effectiveUnitPrice: Math.round(effectiveUnitPrice * 100) / 100,
    }
  })

  const hasAnyRefundable = itemsWithAvailable.some((i) => i.availableQty > 0)

  // حساب الإجمالي المراد إرجاعه حالياً
  const itemsToReturn: RefundItemInput[] = []
  let totalRefundAmount = 0

  for (const item of itemsWithAvailable) {
    const state = returnStates[item.productId]
    const qty = state?.qtyToReturn || 0
    if (qty > 0) {
      const lineRefund = Math.min(
        Math.round(qty * item.effectiveUnitPrice * 100) / 100,
        item.price * item.qty,
      )
      totalRefundAmount += lineRefund
      itemsToReturn.push({
        productId: item.productId,
        name: item.name,
        qty,
        unit: getItemUnit(item),
        price: item.effectiveUnitPrice,
        refundAmount: lineRefund,
        reason: state?.reason || generalNote,
      })
    }
  }

  totalRefundAmount = Math.round(totalRefundAmount * 100) / 100

  const handleQtyChange = (productId: number, val: number, maxQty: number) => {
    const clamped = Math.max(0, Math.min(val, maxQty))
    setReturnStates((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        qtyToReturn: clamped,
      },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (itemsToReturn.length === 0) {
      setError('يرجى تحديد كمية صنف واحد على الأقل للإرجاع')
      return
    }

    if (totalRefundAmount <= 0) {
      setError('مبلغ الاسترداد الإجمالي غير صالح')
      return
    }

    setLoading(true)
    try {
      await refundInvoiceItems({
        invoiceId: invoice.id!,
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
      title={`↩️ تسجيل مرتجع مبيعات — فاتورة #${invoice.id}`}
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
              إجمالي المرتجعات السابقة: {formatCurrency(invoice.refundedAmount || 0)}
            </span>
          </div>
        ) : (
          <>
            {/* جدول اختيار الأصناف والكميات */}
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 800 }}>
                حدد الأصناف والكمية المرتجعة:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {itemsWithAvailable.map((item) => {
                  const state = returnStates[item.productId]
                  const currentQty = state?.qtyToReturn || 0
                  const isFullyReturned = item.availableQty <= 0

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
                          <strong style={{ fontSize: 13 }}>{item.name}</strong>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                            مباع: {formatLineQty(item)} {item.alreadyReturned > 0 ? `(أُرجع سابقاً: ${item.alreadyReturned})` : ''} · السعر الصافي: {formatCurrency(item.effectiveUnitPrice)}
                          </div>
                        </div>
                        {isFullyReturned ? (
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700 }}>
                            مرتجع بالكامل ✓
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--color-primary-light)', fontWeight: 800 }}>
                            متاح للإرجاع: {item.availableQty}
                          </span>
                        )}
                      </div>

                      {!isFullyReturned && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>الكمية المرتجعة:</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => handleQtyChange(item.productId, currentQty - 1, item.availableQty)}
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
                              max={item.availableQty}
                              step={item.unit === 'g' || item.unit === 'kg' ? '0.01' : '1'}
                              value={currentQty || ''}
                              placeholder="0"
                              onChange={(e) => handleQtyChange(item.productId, Number(e.target.value) || 0, item.availableQty)}
                              style={{
                                width: 60, textAlign: 'center', padding: '4px', borderRadius: 6,
                                border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
                                color: 'var(--color-text-primary)', fontFamily: 'var(--font-main)', fontWeight: 800,
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleQtyChange(item.productId, currentQty + 1, item.availableQty)}
                              disabled={currentQty >= item.availableQty}
                              style={{
                                width: 28, height: 28, borderRadius: 6, border: '1px solid var(--color-border)',
                                background: 'var(--color-bg-card)', cursor: 'pointer', fontWeight: 900,
                              }}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQtyChange(item.productId, item.availableQty, item.availableQty)}
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
                              {formatCurrency(Math.round(currentQty * item.effectiveUnitPrice * 100) / 100)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* طريقة التسوية المالية */}
            {totalRefundAmount > 0 && (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
                  طريقة التسوية المالية:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
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
                    <span style={{ fontSize: 13, fontWeight: 700 }}>استرداد نقدي (كاش)</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>خصم من الخزينة/المحفظة</span>
                  </button>

                  <button
                    type="button"
                    disabled={!invoice.customerId && invoice.debtAmount <= 0}
                    onClick={() => setRefundMethod('debt')}
                    style={{
                      padding: '10px 8px', borderRadius: 10,
                      border: refundMethod === 'debt' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: refundMethod === 'debt' ? 'var(--color-primary-glow)' : 'var(--color-input-bg)',
                      color: 'var(--color-text-primary)', cursor: 'pointer', fontFamily: 'var(--font-main)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      opacity: (!invoice.customerId && invoice.debtAmount <= 0) ? 0.4 : 1,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>🤝</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>تخفيض من ذمة العميل</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {invoice.debtAmount > 0 ? `دين الفاتورة (${formatCurrency(invoice.debtAmount)})` : 'تخفيض من دين العميل'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* إذا كان الاسترداد نقدي: اختيار المحفظة */}
            {totalRefundAmount > 0 && refundMethod === 'cash' && (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
                  الصندوق / المحفظة المسترد منها:
                </label>
                <CustomSelect
                  value={paymentMethod}
                  onChange={(m) => setPaymentMethod(m as PaymentMethod)}
                  options={PAYMENT_METHODS.map((m) => ({
                    value: m.id,
                    label: `${m.icon} ${m.label}`,
                  }))}
                />
              </div>
            )}

            {/* سبب الإرجاع وملاحظات */}
            {totalRefundAmount > 0 && (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800 }}>
                  سبب الإرجاع / ملاحظات (اختياري):
                </label>
                <Input
                  value={generalNote}
                  onChange={(e) => setGeneralNote(e.target.value)}
                  placeholder="مثال: عيب مصنعي، تبديل بمقاس آخر، إلغاء طلبية..."
                />
              </div>
            )}

            {/* ملخص المرتجع */}
            {totalRefundAmount > 0 && (
              <div style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                padding: '12px 14px',
                fontSize: 13,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>عدد الأصناف المرتجعة:</span>
                  <strong>{itemsToReturn.length} صنف</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-warning-light)', fontWeight: 800 }}>
                  <span>إجمالي مبلغ الاسترداد:</span>
                  <span style={{ direction: 'ltr' }}>{formatCurrency(totalRefundAmount)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', paddingTop: 6 }}>
                  {refundMethod === 'cash'
                    ? `سيتم إعادة البضاعة للمخزن وخصم ${formatCurrency(totalRefundAmount)} نقداً من ${getPaymentMethodName(paymentMethod)}`
                    : `سيتم إعادة البضاعة للمخزن وتخفيض دين العميل بمقدار ${formatCurrency(totalRefundAmount)}`}
                </div>
              </div>
            )}

            {/* أزرار الإجراء */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button
                type="submit"
                variant="primary"
                disabled={loading || totalRefundAmount <= 0}
                style={{ flex: 1, padding: 12, fontSize: 14, fontWeight: 800 }}
              >
                {loading ? 'جارٍ تسجيل المرتجع...' : `تأكيد إرجاع البضاعة (${formatCurrency(totalRefundAmount)})`}
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
          </>
        )}

        {/* عرض سجل المرتجعات السابقة إن وُجدت */}
        {invoice.returnedItems && invoice.returnedItems.length > 0 && (
          <div style={{
            marginTop: 10,
            borderTop: '1px dashed var(--color-border)',
            paddingTop: 12,
          }}>
            <h4 style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: 'var(--color-text-muted)' }}>
              📋 سجل المرتجعات المسجلة سابقاً لهذه الفاتورة:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {invoice.returnedItems.map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--color-input-bg)',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700 }}>{r.name} × {r.qty}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'block' }}>
                      {new Date(r.date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </span>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ fontWeight: 800, direction: 'ltr', display: 'block', color: 'var(--color-danger-light)' }}>
                      -{formatCurrency(r.refundAmount)}
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
