/**
 * SupplierStatementPrint.tsx — كشف حساب مورد (كامل عمليات التوريد والسداد)
 * جدول الحركات الموحّد + الإجماليات + الرصيد الجاري — يُطبع عبر #supplier-statement-print-root
 */
import type { Purchase } from '../../db/db'
import { useStoreInfo } from '../invoice/InvoicePrint'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/datetime'
import { rangeLabel, withinRange } from '../../utils/dateRange'
import { downloadXlsx, type XlsxCell } from '../../utils/xlsx'

/** فلتر فترة «من – إلى» اختياري لكشف المورد */
export interface DateRangeFilter {
  from: string
  to: string
}

export interface SupplierStatementItem {
  key: string
  date: Date
  type: 'purchase' | 'payment'
  /** رقم الفاتورة أو بيان الدفعة */
  ref: string
  amount: number
  note?: string
  method?: string
  /** الرصيد الجاري بعد الحركة */
  balance: number
}

/**
 * يبني كشف حركات المورد من فواتير التوريد ودفعات السداد.
 * - كل فاتورة توريد = حركة "مدين" (يزيد ما نستحقه للمورد).
 * - دفعات السداد = حركة "دائن" (تنقص الرصيد). تشمل الدفعة الأولى عند التوريد
 *   إن لم تُؤرشف في سجل الدفعات، وتُعامل السجلات القديمة بلا حقول دفع كمسددة.
 */
export function buildSupplierStatement(purchases: Purchase[]): SupplierStatementItem[] {
  const flat: Omit<SupplierStatementItem, 'balance'>[] = []

  for (const p of purchases) {
    const total = Number(p.totalAmount) || 0
    const hasPaymentFields = p.paidAmount !== undefined || p.debtAmount !== undefined
    const paid = hasPaymentFields ? Number(p.paidAmount) || 0 : total
    const payments = p.supplierPayments ?? []

    flat.push({
      key: `purchase-${p.id}`,
      date: new Date(p.date),
      type: 'purchase',
      ref: p.invoiceNumber ? `#${p.invoiceNumber}` : `#${p.id}`,
      amount: total,
      note: `${p.items.length} أصناف`,
    })

    if (payments.length > 0) {
      payments.forEach((pay, i) => {
        flat.push({
          key: `payment-${p.id}-${i}`,
          date: new Date(pay.date),
          type: 'payment',
          ref: p.invoiceNumber ? `سداد #${p.invoiceNumber}` : `سداد #${p.id}`,
          amount: Number(pay.amount) || 0,
          method: pay.paymentMethod,
          note: pay.notes,
        })
      })
    } else if (paid > 0) {
      flat.push({
        key: `payment-first-${p.id}`,
        date: new Date(p.date),
        type: 'payment',
        ref: p.invoiceNumber ? `سداد #${p.invoiceNumber}` : `سداد #${p.id}`,
        amount: paid,
        method: p.paymentMethod,
        note: hasPaymentFields ? 'الدفعة الأولى عند التوريد' : 'مسددة (سجل قديم)',
      })
    }
  }

  flat.sort((a, b) => a.date.getTime() - b.date.getTime())

  let running = 0
  return flat.map((row) => {
    running += row.type === 'purchase' ? row.amount : -row.amount
    return { ...row, balance: Math.round(running * 100) / 100 }
  })
}

export function useSupplierStatementData(purchases: Purchase[], range?: DateRangeFilter) {
  const all = buildSupplierStatement(purchases)
  const items = range && (range.from || range.to)
    ? all.filter((i) => withinRange(i.date, range.from, range.to))
    : all
  const totalPurchases = items.filter((i) => i.type === 'purchase').reduce((s, i) => s + i.amount, 0)
  const totalPaid = items.filter((i) => i.type === 'payment').reduce((s, i) => s + i.amount, 0)
  const balance = Math.round((totalPurchases - totalPaid) * 100) / 100
  return { items, totalPurchases, totalPaid, balance, isFiltered: items.length !== all.length }
}

export function supplierStatementToRows(supplierName: string, purchases: Purchase[], range?: DateRangeFilter): XlsxCell[][] {
  const { items, totalPurchases, totalPaid, balance } = useSupplierStatementData(purchases, range)
  const header = ['#', 'التاريخ', 'الحركة', 'البيان', 'مدين', 'دائن', 'الرصيد', 'ملاحظات']
  const rows = items.map((i, idx) => [
    idx + 1,
    formatDate(i.date),
    i.type === 'purchase' ? 'توريد' : 'سداد',
    i.ref,
    i.type === 'purchase' ? i.amount : '',
    i.type === 'payment' ? i.amount : '',
    i.balance,
    (i.note || '').replace(/\n/g, ' '),
  ])
  return [
    [`كشف حساب مورد: ${supplierName}`],
    ...(range && (range.from || range.to) ? [[`الفترة: ${rangeLabel(range.from, range.to)}`]] : []),
    header,
    ...rows,
    [],
    ['الإجمالي', '', '', '', totalPurchases, totalPaid, balance, ''],
  ]
}

export function downloadSupplierStatementXlsx(supplierName: string, purchases: Purchase[], range?: DateRangeFilter) {
  const rows = supplierStatementToRows(supplierName, purchases, range)
  downloadXlsx(`كشف-حساب-مورد-${supplierName}.xlsx`, [
    { name: 'كشف المورد', rows, columnWidths: [5, 14, 10, 22, 14, 14, 14, 30] },
  ])
}

export function SupplierStatementPrintHost({ supplierName, purchases, range }: {
  supplierName: string | null
  purchases: Purchase[]
  range?: DateRangeFilter
}) {
  const store = useStoreInfo()
  if (!supplierName) return null
  const { items, totalPurchases, totalPaid, balance } = useSupplierStatementData(purchases, range)
  const dateStr = formatDate(new Date())
  const hasRange = !!(range && (range.from || range.to))

  return (
    <div id="supplier-statement-print-root" aria-hidden="true">
      <div className="invoice-doc" dir="rtl">
        <div className="invoice-header">
          <div className="invoice-brand">
            <img src="/logo.jpeg" alt="ميزان" className="invoice-logo" style={{ objectFit: 'contain', padding: 2, boxShadow: 'none' }} />
            <div>
              {store.name && <div className="invoice-store">{store.name}</div>}
              {(store.phone || store.address) && (
                <div className="invoice-contact">
                  {store.phone && <span dir="ltr">{store.phone}</span>}
                  {store.phone && store.address && <span> · </span>}
                  {store.address && <span>{store.address}</span>}
                </div>
              )}
            </div>
          </div>
          <div className="invoice-meta">
            <div className="invoice-no">كشف حساب مورد</div>
            <div className="invoice-date">{dateStr}</div>
          </div>
        </div>

        <div className="invoice-strip">
          <span>🏭 {supplierName}</span>
          {hasRange && <span>الفترة: {rangeLabel(range!.from, range!.to)}</span>}
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th className="c">#</th>
              <th>البيان</th>
              <th className="c">التاريخ</th>
              <th className="c">مدين 🧾</th>
              <th className="c">دائن 💰</th>
              <th className="c">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.key}>
                <td className="c muted">{i + 1}</td>
                <td className="item-name">
                  {item.ref}
                  {item.note && <div className="item-sub">{item.note}</div>}
                </td>
                <td className="c">{formatDate(item.date)}</td>
                <td className="c ltr">{item.type === 'purchase' ? item.amount.toFixed(2) : '—'}</td>
                <td className="c ltr">{item.type === 'payment' ? item.amount.toFixed(2) : '—'}</td>
                <td className="c ltr strong">{item.balance.toFixed(2)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="c muted" colSpan={6}>لا توجد حركات مسجلة</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="invoice-totals">
          <div className="row">
            <span>إجمالي عمليات التوريد</span>
            <span className="ltr">{formatCurrency(totalPurchases)}</span>
          </div>
          <div className="row">
            <span>إجمالي السداد</span>
            <span className="ltr">{formatCurrency(totalPaid)}</span>
          </div>
          <div className="row grand debt">
            <span>الرصيد المستحق للمورد</span>
            <span className="ltr">{formatCurrency(balance)}</span>
          </div>
        </div>

        <div className="invoice-footer">
          <div className="thanks">{store.footer}</div>
          <div className="keep">كشف حساب تفصيلي للمورد · {store.currency}</div>
        </div>
      </div>
    </div>
  )
}
