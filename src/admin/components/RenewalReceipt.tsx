/**
 * RenewalReceipt.tsx — إيصال تجديد الاشتراك
 * معاينة فخمة + زر طباعة (يطبع الإيصال فقط) + إرسال واتساب
 */
import { buildReceiptWhatsApp } from '../billing'
import type { PaymentRecord } from '../types'

export function RenewalReceipt({ payment: p, onClose }: { payment: PaymentRecord; onClose: () => void }) {
  const waLink = buildReceiptWhatsApp({
    phone: p.phone,
    name: p.subscriberName || p.subscriberEmail,
    receiptNo: p.receiptNo,
    periodLabel: p.periodLabel,
    fromDate: p.fromDate,
    toDate: p.toDate,
    amount: p.amount,
    currency: p.currency,
    methodLabel: p.methodLabel || p.method,
  })

  return (
    <>
      {/* مطبوع فقط — مخفي على الشاشة */}
      <div id="renewal-receipt-print-root" aria-hidden="true">
        <ReceiptDoc payment={p} />
      </div>

      <div className="admin-modal-overlay" onClick={onClose}>
        <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="إيصال التجديد">
          <div className="admin-modal-header">
            <h2 className="admin-modal-title">🧾 إيصال {p.receiptNo}</h2>
            <button className="admin-modal-close" onClick={onClose}>✕</button>
          </div>

          <ReceiptDoc payment={p} />

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <a href={waLink} target="_blank" rel="noreferrer" className="admin-btn-wa" style={{ flex: 1, justifyContent: 'center', padding: 10 }}>
              💬 إرسال واتساب
            </a>
            <button className="admin-btn-primary" style={{ flex: 1 }} onClick={() => window.print()}>
              🖨️ طباعة
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function ReceiptDoc({ payment: p }: { payment: PaymentRecord }) {
  return (
    <div className="receipt-doc" dir="rtl">
      <div className="receipt-header">
        <div className="receipt-brand">
          <div className="receipt-logo">🧾</div>
          <div>
            <div className="receipt-title">إيصال تجديد اشتراك</div>
            <div className="receipt-no">{p.receiptNo}</div>
          </div>
        </div>
        <div className="receipt-date">{p.createdAt.toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' })}</div>
      </div>

      <dl className="receipt-rows">
        <div><dt>المشترك</dt><dd><strong>{p.subscriberName || p.subscriberEmail}</strong></dd></div>
        <div><dt>البريد</dt><dd className="admin-mono">{p.subscriberEmail}</dd></div>
        <div><dt>المدة</dt><dd>{p.periodLabel}</dd></div>
        <div><dt>من</dt><dd>{p.fromDate.toLocaleDateString('ar')}</dd></div>
        <div><dt>إلى</dt><dd>{p.toDate.toLocaleDateString('ar')}</dd></div>
        <div><dt>طريقة الدفع</dt><dd>{p.methodLabel || p.method}</dd></div>
        {p.notes && <div><dt>ملاحظات</dt><dd>{p.notes}</dd></div>}
      </dl>

      <div className="receipt-total">
        <span>المبلغ المستلم</span>
        <strong>{p.amount} {p.currency}</strong>
      </div>

      <div className="receipt-footer">
        شكراً لثقتكم 🌟
        {p.adminEmail && <span> · بواسطة {p.adminEmail}</span>}
      </div>
    </div>
  )
}
