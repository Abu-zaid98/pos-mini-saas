/**
 * PurchasesArchive.tsx — أرشيف فواتير الشراء (عرض وطباعة فقط)
 *
 * يُستخدم داخل شاشة «سجل المستندات» كبند ثانٍ بجانب فواتير البيع.
 * الإدخال والتعديل والسداد يبقون في شاشة المشتريات والتوريد المخصّصة.
 */
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePurchases } from '../../hooks/usePurchases'
import { PurchasePrint } from './PurchasePrint'
import { InvoiceExportActions } from '../invoice/InvoiceExportActions'
import { useStoreInfo } from '../invoice/InvoicePrint'
import { printElementById } from '../print/printDocument'
import { Modal } from '../ui/Modal'
import { Icon, SearchBar, PeriodFilter, StatCard, EmptyState } from '../ui'
import { formatCurrency } from '../../utils/currency'
import { formatDate, formatTime } from '../../utils/datetime'
import { GRAMS_PER_KG } from '../../utils/units'
import { getPaymentMethodName, type Purchase } from '../../db/db'

type Period = 'all' | 'today' | 'week' | 'month' | 'custom'

const periodTabs = [
  { value: 'all', label: 'الكل' },
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'آخر 7 أيام' },
  { value: 'month', label: 'هذا الشهر' },
  { value: 'custom', label: 'مخصص' },
]

export function PurchasesArchive() {
  const navigate = useNavigate()
  const storeInfo = useStoreInfo()
  const [period, setPeriod] = useState<Period>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Purchase | null>(null)
  const [printPurchase, setPrintPurchase] = useState<Purchase | null>(null)
  const docRef = useRef<HTMLDivElement>(null)

  const purchases = usePurchases(period, { fromDate, toDate })

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return purchases
    return purchases.filter((p) =>
      String(p.id).includes(q) ||
      (p.invoiceNumber || '').toLowerCase().includes(q) ||
      (p.supplierName || '').toLowerCase().includes(q) ||
      p.items.some((it) => it.productName.toLowerCase().includes(q)),
    )
  }, [purchases, search])

  const totals = useMemo(() => visible.reduce(
    (s, p) => ({
      total: s.total + (p.totalAmount || 0),
      debt: s.debt + (Number(p.debtAmount) || 0),
      returns: s.returns + (Number(p.returnedAmount) || 0),
    }),
    { total: 0, debt: 0, returns: 0 },
  ), [visible])

  const handlePrint = (p: Purchase) => {
    setPrintPurchase(p)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => printElementById('purchase-archive-print-root'))
    })
  }

  return (
    <>
      <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-primary">{visible.length} / {purchases.length}</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => navigate('/purchases')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="plus" size={15} />
            <span>تسجيل فاتورة شراء</span>
          </button>
        </div>
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="ابحث برقم الفاتورة، المورد أو اسم الصنف..."
        />
        <PeriodFilter
          period={period}
          onPeriodChange={(p) => setPeriod(p as Period)}
          from={fromDate}
          to={toDate}
          onRangeChange={(f, t) => { setFromDate(f); setToDate(t) }}
          options={periodTabs}
        />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <StatCard label="إجمالي المشتريات" value={formatCurrency(totals.total)} variant="brand" ltr />
        <StatCard label="ديون الموردين" value={formatCurrency(totals.debt)} variant={totals.debt > 0 ? 'danger' : 'default'} ltr />
        <StatCard label="المرتجعات" value={formatCurrency(totals.returns)} variant={totals.returns > 0 ? 'warning' : 'default'} ltr />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="box"
          title="لا توجد فواتير شراء"
          description={search ? `لا توجد نتائج مطابقة لـ "${search}"` : 'لم تسجّل أي فاتورة شراء في هذه الفترة'}
          action={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/purchases')}>
              تسجيل فاتورة شراء
            </button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((purchase) => {
            const returned = Number(purchase.returnedAmount) || 0
            const debt = Number(purchase.debtAmount) || 0
            const d = new Date(purchase.date)
            return (
              <button
                key={purchase.id}
                type="button"
                onClick={() => setSelected(purchase)}
                style={{
                  width: '100%',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)',
                  borderRadius: 16,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  textAlign: 'right',
                  fontFamily: 'var(--font-main)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 15 }}>{purchase.supplierName?.trim() || 'شراء عام'}</strong>
                      {purchase.invoiceNumber && (
                        <span className="badge" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          #{purchase.invoiceNumber}
                        </span>
                      )}
                      {returned > 0 && (
                        <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Icon name="arrow-down" size={11} />
                          <span>مرتجع {formatCurrency(returned)}</span>
                        </span>
                      )}
                    </div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{formatDate(d)} · {formatTime(d)}</span>
                      <span>·</span>
                      <span>{purchase.items.length} أصناف</span>
                      <span>·</span>
                      <span>{purchase.paymentType === 'debt' ? 'آجل' : purchase.paymentType === 'partial' ? 'جزئي' : getPaymentMethodName(purchase.paymentMethod)}</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'left', flexShrink: 0 }}>
                    <strong style={{ direction: 'ltr', display: 'block', fontSize: 16 }}>{formatCurrency(purchase.totalAmount)}</strong>
                    {debt > 0 && (
                      <small style={{ color: 'var(--color-danger-light)', direction: 'ltr', display: 'block', fontWeight: 800, fontSize: 11 }}>
                        دين {formatCurrency(debt)}
                      </small>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Purchase detail modal */}
      {selected && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={`فاتورة شراء #${selected.invoiceNumber || selected.id}`}
          type="sheet"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PurchasePrint purchase={selected} store={storeInfo} containerRef={docRef} />
            <InvoiceExportActions
              getTarget={() => docRef.current}
              filenameBase={`purchase-${selected.invoiceNumber || selected.id || ''}`}
              whatsappText={`فاتورة شراء #${selected.invoiceNumber || selected.id || ''}`}
            />
            {selected.returnedItems && selected.returnedItems.length > 0 && (
              <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 12 }}>
                <h4 style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: 'var(--color-text-muted)' }}>
                  ↩️ مرتجعات هذه الفاتورة:
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selected.returnedItems.map((r, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'var(--color-input-bg)', fontSize: 12 }}>
                      <span>
                        {r.productName} × {r.unit === 'kg' ? `${Math.round((r.quantity / GRAMS_PER_KG) * 1000) / 1000} كغ` : r.quantity}
                      </span>
                      <span style={{ direction: 'ltr', fontWeight: 800, color: 'var(--color-success-light)' }}>
                        {formatCurrency(r.refundAmount)}
                        <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginInlineStart: 6 }}>
                          {r.refundMethod === 'debt' ? 'خصم دين' : 'استرداد'}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" style={{ flex: 2 }} onClick={() => handlePrint(selected)}>
                🖨️ طباعة الفاتورة
              </button>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => navigate('/purchases')}>
                إدارة المشتريات
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* hidden print host */}
      <div id="purchase-archive-print-root" aria-hidden="true">
        {printPurchase && <PurchasePrint purchase={printPurchase} store={storeInfo} />}
      </div>
    </>
  )
}
