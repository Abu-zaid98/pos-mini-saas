/**
 * StatementPrint.tsx — كشف حساب عميل للطباعة والتصدير
 * جدول الحركات (فواتير/سندات) + الإجماليات — يُطبع عبر #statement-print-root
 */
import type { Customer } from '../../db/db'
import type { CustomerLedgerItem } from '../../hooks/useCustomers'
import { useStoreInfo } from '../invoice/InvoicePrint'
import { formatCurrency } from '../../utils/currency'
import { formatDate, formatDateTime } from '../../utils/datetime'
import { downloadXlsx, type XlsxCell } from '../../utils/xlsx'

export function useStatementData(customer: Customer | null, items: CustomerLedgerItem[]) {
  const totalInvoices = items
    .filter((i) => i.type === 'invoice')
    .reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const totalPayments = items
    .filter((i) => i.type === 'payment')
    .reduce((s, i) => s + (Number(i.amount) || 0), 0)
  return { totalInvoices, totalPayments, debt: customer?.totalDebt || 0 }
}

/** صفوف كشف الحساب للتصدير إلى إكسل */
export function statementToRows(customer: Customer, items: CustomerLedgerItem[]): XlsxCell[][] {
  const header = ['#', 'التاريخ', 'الحركة', 'البيان', 'مدين', 'دائن', 'ملاحظة']
  const rows = [...items]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((i, idx) => [
      idx + 1,
      formatDateTime(i.date),
      i.type === 'invoice' ? 'فاتورة' : 'سند قبض',
      i.title,
      i.type === 'invoice' ? Number(i.amount) || 0 : '',
      i.type === 'payment' ? Number(i.amount) || 0 : '',
      (i.note || '').replace(/\n/g, ' '),
    ])
  return [header, ...rows, [], ['إجمالي الدين المستحق', '', '', '', '', '', Number(customer.totalDebt) || 0]]
}

export function downloadStatementXlsx(customer: Customer, items: CustomerLedgerItem[]) {
  const rows = statementToRows(customer, items)
  downloadXlsx(`كشف-حساب-${customer.name}.xlsx`, [
    { name: 'كشف الحساب', rows, columnWidths: [5, 20, 10, 26, 14, 14, 24] },
  ])
}

export function StatementPrintHost({ customer, items }: {
  customer: Customer | null
  items: CustomerLedgerItem[]
}) {
  const store = useStoreInfo()
  if (!customer) return null
  const { totalInvoices, totalPayments } = useStatementData(customer, items)
  const dateStr = formatDate(new Date())
  const ordered = [...items].sort((a, b) => a.date.getTime() - b.date.getTime())

  return (
    <div id="statement-print-root" aria-hidden="true">
      <div className="invoice-doc" dir="rtl">
        <div className="invoice-header">
          <div className="invoice-brand">
            <img
              src="/logo.jpeg"
              alt="ميزان"
              className="invoice-logo"
              style={{ objectFit: 'contain', padding: 2, boxShadow: 'none' }}
            />
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
            <div className="invoice-no">كشف حساب</div>
            <div className="invoice-date">{dateStr}</div>
          </div>
        </div>

        <div className="invoice-strip">
          <span>👤 {customer.name}</span>
          {customer.phone && <span dir="ltr">{customer.phone}</span>}
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th className="c">#</th>
              <th>البيان</th>
              <th className="c">التاريخ</th>
              <th className="c">مدين 🧾</th>
              <th className="c">دائن 💰</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((item, i) => (
              <tr key={item.id}>
                <td className="c muted">{i + 1}</td>
                <td className="item-name">
                  {item.title}
                  {item.note && <div className="item-sub">{item.note}</div>}
                </td>
                <td className="c">{formatDate(item.date)}</td>
                <td className="c ltr">{item.type === 'invoice' ? Number(item.amount).toFixed(2) : '—'}</td>
                <td className="c ltr">{item.type === 'payment' ? Number(item.amount).toFixed(2) : '—'}</td>
              </tr>
            ))}
            {ordered.length === 0 && (
              <tr>
                <td className="c muted" colSpan={5}>لا توجد حركات مسجلة</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="invoice-totals">
          <div className="row">
            <span>مجموع الفواتير</span>
            <span className="ltr">{formatCurrency(totalInvoices)}</span>
          </div>
          <div className="row">
            <span>مجموع السندات المقبوضة</span>
            <span className="ltr">{formatCurrency(totalPayments)}</span>
          </div>
          <div className="row grand debt">
            <span>الرصيد المستحق</span>
            <span className="ltr">{formatCurrency(customer.totalDebt || 0)}</span>
          </div>
        </div>

        <div className="invoice-footer">
          <div className="thanks">{store.footer}</div>
          <div className="keep">كشف حساب تفصيلي · {store.currency}</div>
        </div>
      </div>
    </div>
  )
}
