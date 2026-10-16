/**
 * ReturnsArchive.tsx — أرشيف المرتجعات الموحّد
 *
 * يجمع مرتجعات البيع (المسجّلة على فواتير المبيعات) ومرتجعات الشراء
 * (المسجّلة على فواتير الشراء) في قائمة واحدة قابلة للفلترة.
 */
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SaleUnit } from '../../db/db'
import { Icon, SearchBar, Tabs, StatCard, EmptyState } from '../ui'
import { formatCurrency } from '../../utils/currency'
import { formatDateTime } from '../../utils/datetime'
import { GRAMS_PER_KG } from '../../utils/units'
import { exportReturnsExcel } from '../../utils/excelExport'

type Kind = 'all' | 'sale' | 'purchase'

const kindTabs = [
  { value: 'all', label: 'الكل' },
  { value: 'sale', label: 'مرتجع بيع' },
  { value: 'purchase', label: 'مرتجع شراء' },
]

interface ReturnLine {
  name: string
  qtyLabel: string
  refund: number
  reason?: string
}

interface ReturnEvent {
  key: string
  kind: 'sale' | 'purchase'
  refLabel: string
  party: string
  date: Date
  amount: number
  methods: string[]
  lines: ReturnLine[]
}

function qtyLabel(qty: number, unit?: SaleUnit): string {
  return unit === 'kg' ? `${Math.round((qty / GRAMS_PER_KG) * 1000) / 1000} كغ` : `${qty} قطعة`
}

export function ReturnsArchive() {
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) ?? []
  const purchases = useLiveQuery(() => db.purchases.toArray(), []) ?? []
  const [kind, setKind] = useState<Kind>('all')
  const [search, setSearch] = useState('')

  const events = useMemo<ReturnEvent[]>(() => {
    const list: ReturnEvent[] = []

    for (const inv of invoices) {
      const items = inv.returnedItems || []
      if (items.length === 0) continue
      const amount = inv.refundedAmount ?? items.reduce((s, i) => s + (Number(i.refundAmount) || 0), 0)
      const date = new Date(Math.max(...items.map((i) => new Date(i.date).getTime())))
      list.push({
        key: `sale-${inv.id}`,
        kind: 'sale',
        refLabel: `فاتورة مبيعات #${inv.id}`,
        party: inv.customerName?.trim() || 'بيع مباشر',
        date,
        amount,
        methods: Array.from(new Set(items.map((i) => (i.refundMethod === 'debt' ? 'خصم دين' : 'استرداد نقدي')))),
        lines: items.map((i) => ({ name: i.name, qtyLabel: qtyLabel(i.qty, i.unit), refund: Number(i.refundAmount) || 0, reason: i.reason })),
      })
    }

    for (const pur of purchases) {
      const items = pur.returnedItems || []
      if (items.length === 0) continue
      const amount = pur.returnedAmount ?? items.reduce((s, i) => s + (Number(i.refundAmount) || 0), 0)
      const date = new Date(Math.max(...items.map((i) => new Date(i.date).getTime())))
      list.push({
        key: `purchase-${pur.id}`,
        kind: 'purchase',
        refLabel: `فاتورة شراء #${pur.invoiceNumber || pur.id}`,
        party: pur.supplierName?.trim() || 'شراء عام',
        date,
        amount,
        methods: Array.from(new Set(items.map((i) => (i.refundMethod === 'debt' ? 'خصم دين مورد' : 'استرداد نقدي')))),
        lines: items.map((i) => ({ name: i.productName, qtyLabel: qtyLabel(i.quantity, i.unit), refund: Number(i.refundAmount) || 0, reason: i.reason })),
      })
    }

    return list.sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [invoices, purchases])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter((e) => {
      if (kind !== 'all' && e.kind !== kind) return false
      if (!q) return true
      return e.party.toLowerCase().includes(q) || e.refLabel.toLowerCase().includes(q) || e.lines.some((l) => l.name.toLowerCase().includes(q))
    })
  }, [events, kind, search])

  const totals = useMemo(() => visible.reduce(
    (s, e) => ({
      count: s.count + 1,
      sale: s.sale + (e.kind === 'sale' ? e.amount : 0),
      purchase: s.purchase + (e.kind === 'purchase' ? e.amount : 0),
    }),
    { count: 0, sale: 0, purchase: 0 },
  ), [visible])

  return (
    <>
      <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-primary">{visible.length} / {events.length}</span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              exportReturnsExcel(
                kind === 'purchase' ? [] : invoices,
                kind === 'sale' ? [] : purchases,
              )
            }
            disabled={events.length === 0}
            title="تصدير المرتجعات بكل التفاصيل إلى Excel"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="download" size={16} />
            <span>تصدير Excel</span>
          </button>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="ابحث بالعميل، المورد، الرقم أو اسم الصنف..." />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8 }}>نوع المرتجع</div>
          <Tabs tabs={kindTabs} value={kind} onChange={(k) => setKind(k as Kind)} />
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <StatCard label="عدد المرتجعات" value={totals.count} variant="brand" />
        <StatCard label="مرتجع البيع" value={formatCurrency(totals.sale)} variant="danger" ltr />
        <StatCard label="مرتجع الشراء" value={formatCurrency(totals.purchase)} variant="warning" ltr />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="arrow-down"
          title="لا توجد مرتجعات"
          description={search ? `لا توجد نتائج مطابقة لـ "${search}"` : 'لم تُسجّل أي مرتجعات بعد'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((e) => {
            const isSale = e.kind === 'sale'
            return (
              <div
                key={e.key}
                style={{
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-card)',
                  borderRadius: 16,
                  padding: '14px 16px',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={`badge ${isSale ? 'badge-danger' : 'badge-warning'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="arrow-down" size={11} />
                        <span>{isSale ? 'مرتجع بيع' : 'مرتجع شراء'}</span>
                      </span>
                      <strong style={{ fontSize: 14 }}>{e.party}</strong>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{e.refLabel}</span>
                    </div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 6 }}>
                      {formatDateTime(e.date)} · {e.methods.join(' / ')}
                    </div>
                  </div>
                  <strong style={{ direction: 'ltr', flexShrink: 0, fontSize: 15 }}>{formatCurrency(e.amount)}</strong>
                </div>

                <div style={{ marginTop: 10, borderTop: '1px dashed var(--color-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {e.lines.map((l, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span>
                        {l.name} × {l.qtyLabel}
                        {l.reason && <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)', marginInlineStart: 6 }}>— {l.reason}</span>}
                      </span>
                      <span style={{ direction: 'ltr', color: 'var(--color-success-light)', fontWeight: 700 }}>{formatCurrency(l.refund)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
