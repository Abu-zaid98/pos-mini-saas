/**
 * PurchasePrint.tsx — مستند فاتورة الشراء للعرض والطباعة
 * يعيد استخدام أنماط .invoice-doc نفسها (invoice-doc/invoice-header/...)
 */
import { getPaymentMethodName, type Purchase } from '../../db/db'
import { formatCurrency } from '../../utils/currency'
import { GRAMS_PER_KG } from '../../utils/units'
import type { StoreInfo } from '../invoice/InvoicePrint'

function qtyLabel(qty: number, unit: string | undefined): string {
  if (unit === 'kg') return `${Math.round((qty / GRAMS_PER_KG) * 1000) / 1000} كغ`
  return `${qty} قطعة`
}

export function PurchasePrint({ purchase: pur, store }: { purchase: Purchase; store: StoreInfo }) {
  const date = new Date(pur.date)
  const dateStr = date.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="invoice-doc" dir="rtl">
      <div className="invoice-header">
        <div className="invoice-brand">
          <img src="/logo.jpeg" alt="ميزان" className="invoice-logo" style={{ objectFit: 'contain', boxShadow: 'none' }} />
          <div>
            <div className="invoice-store">{store.name}</div>
            <div className="invoice-contact">ميزان · نظام المبيعات والمخزون</div>
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
          <div className="invoice-no">فاتورة شراء #{pur.invoiceNumber || pur.id}</div>
          <div className="invoice-date">{dateStr} · {timeStr}</div>
        </div>
      </div>

      <div className="invoice-strip">
        <span>🚚 {pur.supplierName?.trim() || 'شراء عام'}</span>
        <span className="invoice-pay">
          {pur.paymentType === 'debt' ? 'آجل بالكامل' : pur.paymentType === 'partial' ? 'دفع جزئي' : getPaymentMethodName(pur.paymentMethod)}
        </span>
      </div>

      <table className="invoice-table">
        <thead>
          <tr>
            <th className="c">#</th>
            <th>الصنف</th>
            <th className="c">الكمية</th>
            <th className="c">التكلفة</th>
            <th className="c">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {pur.items.map((it, i) => (
            <tr key={i}>
              <td className="c muted">{i + 1}</td>
              <td className="item-name">{it.productName}</td>
              <td className="c">{qtyLabel(it.quantity, it.unit)}</td>
              <td className="c ltr">{Number(it.costPrice).toFixed(2)}</td>
              <td className="c strong ltr">{Number(it.totalCost).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="invoice-totals">
        <div className="row grand">
          <span>إجمالي الفاتورة</span>
          <span className="ltr">{formatCurrency(pur.totalAmount)}</span>
        </div>
        <div className="row">
          <span>المدفوع</span>
          <span className="ltr">{formatCurrency(pur.paidAmount || 0)}</span>
        </div>
        {(pur.debtAmount || 0) > 0 ? (
          <div className="row debt">
            <span>المتبقي دين للمورد</span>
            <span className="ltr">{formatCurrency(pur.debtAmount || 0)}</span>
          </div>
        ) : (
          <div className="row paid-full">
            <span>✓ مسددة بالكامل</span>
          </div>
        )}
      </div>

      {(pur.supplierPayments?.length || 0) > 0 && (
        <div className="invoice-note" style={{ textAlign: 'right' }}>
          💳 دفعات مسددة: {(pur.supplierPayments || []).map((p) => `${formatCurrency(p.amount)} (${new Date(p.date).toLocaleDateString('ar-EG')})`).join(' · ')}
        </div>
      )}
      {pur.notes && <div className="invoice-note">📝 {pur.notes}</div>}

      <div className="invoice-footer">
        <div className="thanks">{store.footer}</div>
        <div className="keep">مستند شراء داخلي · {store.currency}</div>
      </div>
    </div>
  )
}

