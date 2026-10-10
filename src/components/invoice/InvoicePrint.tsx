/**
 * InvoicePrint.tsx — فاتورة فخمة للعرض والطباعة
 * تُستخدم في: نافذة إتمام البيع + معاينة فاتورة من السجل + الطباعة الفعلية
 *
 * الطباعة: usePrintInvoice() يضع الفاتورة في #invoice-print-root المخفية
 * على الشاشة ثم يستدعي window.print() — وCSS الطباعة في index.css
 * يُظهر الفاتورة فقط ويخفي باقي التطبيق.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getPaymentMethodName, type Invoice } from '../../db/db'
import { formatCurrency } from '../../utils/currency'
import { formatLineDiscount, formatLineQty, formatServiceDuration, lineDiscountAmount } from '../../utils/units'

export interface StoreInfo {
  name: string
  phone: string
  address: string
  currency: string
  footer: string
}

export function useStoreInfo(): StoreInfo {
  const rows = useLiveQuery(() => db.settings.toArray(), [])
  const get = (key: string, fallback = '') => {
    const found = rows?.find((r) => r.key === key)
    return typeof found?.value === 'string' && found.value ? found.value : fallback
  }
  return {
    name: get('storeName', 'ميزان'),
    phone: get('storePhone'),
    address: get('storeAddress'),
    currency: get('currency', '₪'),
    footer: get('invoiceFooter', 'شكراً لتسوقكم معنا — نراكم قريباً'),
  }
}

function paymentLabel(inv: Invoice): string {
  if (inv.paymentType === 'debt') return 'دين كامل'
  if (inv.paymentType === 'partial') return 'دفع جزئي'
  return getPaymentMethodName(inv.paymentMethod)
}

export function InvoicePrint({ invoice: inv, store }: { invoice: Invoice; store: StoreInfo }) {
  const date = new Date(inv.createdAt)
  const dateStr = date.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="invoice-doc" dir="rtl">
      {/* Header */}
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
          <div className="invoice-no">فاتورة #{inv.id}</div>
          <div className="invoice-date">{dateStr} · {timeStr}</div>
        </div>
      </div>

      {/* Customer / payment strip */}
      <div className="invoice-strip">
        <span>👤 {inv.customerName || 'بيع مباشر'}</span>
        <span className="invoice-pay">{paymentLabel(inv)}</span>
      </div>

      {/* Items */}
      <table className="invoice-table">
        <thead>
          <tr>
            <th className="c">#</th>
            <th>الصنف</th>
            <th className="c">الكمية</th>
            <th className="c">السعر</th>
            <th className="c">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((item, i) => (
            <tr key={i}>
              <td className="c muted">{i + 1}</td>
              <td className="item-name">
                {item.name}
                {item.pack && <span className="pack-tag">{item.pack.label}</span>}
                {item.durationMinutes ? (
                  <div className="item-sub">⏱ {formatServiceDuration(item.durationMinutes)}</div>
                ) : null}
                {item.discount && lineDiscountAmount(item) > 0 ? (
                  <div className="item-discount">🏷️ خصم {formatLineDiscount(item.discount)}</div>
                ) : null}
              </td>
              <td className="c">{formatLineQty(item)}</td>
              <td className="c ltr">{Number(item.price).toFixed(2)}</td>
              <td className="c strong ltr">{(item.qty * item.price - lineDiscountAmount(item)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="invoice-totals">
        <div className="row">
          <span>المجموع الفرعي</span>
          <span className="ltr">{formatCurrency(inv.subtotal)}</span>
        </div>
        {inv.discountAmount > 0 && (
          <div className="row discount">
            <span>الخصم</span>
            <span className="ltr">-{formatCurrency(inv.discountAmount)}</span>
          </div>
        )}
        {(inv.itemDiscountAmount || 0) > 0 && (
          <div className="row discount">
            <span>خصم الأصناف</span>
            <span className="ltr">-{formatCurrency(inv.itemDiscountAmount || 0)}</span>
          </div>
        )}
        <div className="row grand">
          <span>الإجمالي</span>
          <span className="ltr">{formatCurrency(inv.total)}</span>
        </div>
        <div className="row">
          <span>المدفوع</span>
          <span className="ltr">{formatCurrency(inv.paidAmount)}</span>
        </div>
        {inv.refundedAmount && inv.refundedAmount > 0 ? (
          <div className="row discount" style={{ color: 'var(--color-danger-light)', fontWeight: 800 }}>
            <span>إجمالي المرتجع ↩️</span>
            <span className="ltr">-{formatCurrency(inv.refundedAmount)}</span>
          </div>
        ) : null}
        {inv.debtAmount > 0 ? (
          <div className="row debt">
            <span>المتبقي كدين</span>
            <span className="ltr">{formatCurrency(inv.debtAmount)}</span>
          </div>
        ) : (
          <div className="row paid-full">
            <span>✓ مدفوعة بالكامل</span>
          </div>
        )}
      </div>

      {inv.note && <div className="invoice-note">📝 {inv.note}</div>}

      {/* Footer */}
      <div className="invoice-footer">
        <div className="thanks">{store.footer}</div>
        <div className="keep">يرجى الاحتفاظ بالفاتورة · {store.currency}</div>
      </div>
    </div>
  )
}

// ── Print provider: يُغلَّف به AppShell مرة واحدة ──

const PrintContext = createContext<(inv: Invoice) => void>(() => {})

export function usePrintInvoice(): (inv: Invoice) => void {
  return useContext(PrintContext)
}

export function InvoicePrintProvider({ children }: { children: React.ReactNode }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const store = useStoreInfo()

  const print = useCallback((inv: Invoice) => {
    setInvoice(inv)
    // مهلة قصيرة لرسم الفاتورة في DOM قبل فتح نافذة الطباعة
    setTimeout(() => window.print(), 120)
  }, [])

  useEffect(() => {
    const clear = () => setInvoice(null)
    window.addEventListener('afterprint', clear)
    return () => window.removeEventListener('afterprint', clear)
  }, [])

  return (
    <PrintContext.Provider value={print}>
      {children}
      <div id="invoice-print-root" aria-hidden="true">
        {invoice && <InvoicePrint invoice={invoice} store={store} />}
      </div>
    </PrintContext.Provider>
  )
}
