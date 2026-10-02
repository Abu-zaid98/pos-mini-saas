import { useMemo, useState } from 'react'
import type React from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useProducts } from '../../hooks/useProducts'
import { addProduction } from '../../hooks/useProductions'
import type { Product } from '../../db/db'
import { GRAMS_PER_KG, recipeCost } from '../../utils/units'
import { formatCurrency } from '../../utils/currency'

interface ProductionModalProps {
  open: boolean
  onClose: () => void
  product: Product | null
  onProduced?: () => void
}

export function ProductionModal({ open, onClose, product, onProduced }: ProductionModalProps) {
  const allProducts = useProducts()
  const [batchKg, setBatchKg] = useState('5')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const byId = useMemo(() => new Map(allProducts.map((p) => [p.id!, p])), [allProducts])
  const kg = parseFloat(batchKg) || 0
  const cost = useMemo(
    () => recipeCost(product?.recipe ?? [], byId, kg, product?.wastePercent || 0),
    [product, byId, kg]
  )

  if (!product) return null

  const fmtReq = (base: number, unit: string) =>
    unit === 'kg' ? `${Math.round((base / GRAMS_PER_KG) * 1000) / 1000} كغ` : unit === 'g' ? `${base} غ` : `${base} قطعة`

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError('')
    if (kg <= 0) {
      setError('أدخل وزن الدفعة بالكيلو')
      return
    }
    setLoading(true)
    try {
      await addProduction({ productId: product.id!, batchKg: kg, notes: notes.trim() })
      onProduced?.()
      onClose()
      setBatchKg('5')
      setNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء تسجيل الإنتاج')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`🏭 إنتاج دفعة: ${product.name}`}
      type="sheet"
      footer={
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>
            إلغاء
          </button>
          <Button variant="primary" loading={loading} onClick={handleSubmit} disabled={!cost.feasible || kg <= 0} style={{ flex: 2 }}>
            ✓ تأكيد الإنتاج ({kg > 0 ? `${kg} كغ` : '—'})
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10, padding: '8px 12px',
            color: 'var(--color-danger-light)', fontSize: 13, fontWeight: 700,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Batch weight */}
        <div>
          <label className="input-label">وزن الدفعة المنتجة (كغ) *</label>
          <input
            className="input"
            type="number"
            min="0"
            step="any"
            value={batchKg}
            onChange={(e) => setBatchKg(e.target.value)}
            style={{ marginTop: 6, fontSize: 20, fontWeight: 800, textAlign: 'center' }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
            {['1', '2', '5', '10'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setBatchKg(v)}
                style={{
                  padding: '6px 14px', borderRadius: 99,
                  border: batchKg === v ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: batchKg === v ? 'var(--color-primary-glow)' : 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)', fontWeight: 700, fontSize: 12,
                  cursor: 'pointer', fontFamily: 'var(--font-main)',
                }}
              >
                {v} كغ
              </button>
            ))}
          </div>
        </div>

        {/* Consumption preview */}
        <div>
          <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>
            المواد التي ستُخصم من المخزون
          </label>
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 12, padding: 10,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {cost.lines.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                لا توجد وصفة — أضف المكونات من تعديل المنتج
              </p>
            )}
            {cost.lines.map((l) => (
              <div key={l.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>
                  {l.missing ? '❌' : l.enough ? '✓' : '⚠️'} {l.productName}
                </span>
                <span style={{
                  direction: 'ltr', fontWeight: 700,
                  color: l.missing || !l.enough ? 'var(--color-danger-light)' : 'var(--color-text-secondary)',
                }}>
                  {fmtReq(l.requiredBase, l.unit)}
                </span>
              </div>
            ))}
          </div>
          {!cost.feasible && cost.lines.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--color-danger-light)', fontWeight: 700, marginTop: 6 }}>
              مواد غير كافية أو مكونات محذوفة — ورّد المواد أو عدّل الوصفة أولاً
            </p>
          )}
        </div>

        {/* Cost summary */}
        <div style={{
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 12, padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>تكلفة المواد</span>
            <span style={{ direction: 'ltr', fontWeight: 700 }}>{formatCurrency(cost.materialCost)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>الهالك ({cost.wastePercent}%)</span>
            <span style={{ direction: 'ltr', fontWeight: 700 }}>{formatCurrency(cost.totalCost - cost.materialCost)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 900, borderTop: '1px dashed rgba(16,185,129,0.3)', paddingTop: 6 }}>
            <span>تكلفة الكيلو للدفعة</span>
            <span style={{ direction: 'ltr', color: 'var(--color-success-light)' }}>{formatCurrency(cost.unitCostPerKg)}</span>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>ملاحظات الدفعة</label>
          <input
            className="input"
            placeholder="مثال: دفعة الصباح..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}
