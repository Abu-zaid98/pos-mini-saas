import { useMemo, useState } from 'react'
import { CustomSelect } from '../components/ui/CustomSelect'
import { Modal } from '../components/ui/Modal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { InvoicePrint, usePrintInvoice, useStoreInfo } from '../components/invoice/InvoicePrint'
import { type Invoice, type PaymentMethod, type PaymentType } from '../db/db'
import { useCustomers } from '../hooks/useCustomers'
import { deleteInvoice, updateInvoiceDetails, useInvoices } from '../hooks/useInvoices'
import { formatCurrency } from '../utils/currency'
import { formatLineDiscount, formatLineQty, lineDiscountAmount } from '../utils/units'

type InvoiceFilter = 'all' | PaymentType

const typeLabels: Record<PaymentType, string> = {
  cash: 'نقدي / مكتمل', debt: 'دين كامل', partial: 'دفع جزئي',
}

export function InvoicesPage() {
  const invoices = useInvoices({ dateRange: 'all' })
  const customers = useCustomers()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<InvoiceFilter>('all')
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [viewMode, setViewMode] = useState<'view' | 'edit'>('view')
  const printInvoice = usePrintInvoice()
  const storeInfo = useStoreInfo()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [editing, setEditing] = useState<{
    customerId: number | null; paymentType: PaymentType; paymentMethod: PaymentMethod; paidAmount: string; note: string
  } | null>(null)

  const visible = useMemo(() => invoices.filter((invoice) => {
    const matchFilter = filter === 'all' || invoice.paymentType === filter
    const query = search.trim().toLowerCase()
    const matchSearch = !query || String(invoice.id).includes(query) || invoice.customerName?.toLowerCase().includes(query) || invoice.items.some((item) => item.name.toLowerCase().includes(query))
    return matchFilter && matchSearch
  }), [invoices, filter, search])

  const openInvoice = (invoice: Invoice) => {
    setSelected(invoice)
    setViewMode('view')
    setEditing({
      customerId: invoice.customerId,
      paymentType: invoice.paymentType,
      paymentMethod: invoice.paymentMethod || 'cash',
      paidAmount: String(invoice.paidAmount),
      note: invoice.note || '',
    })
  }

  const save = async () => {
    if (!selected || !editing) return
    const paidAmount = editing.paymentType === 'debt' ? 0 : Number(editing.paidAmount) || 0
    if (editing.paymentType === 'cash' && paidAmount < selected.total) {
      alert('للدفع الجزئي اختر «دفع جزئي» حتى يُسجّل المتبقي كدين.')
      return
    }
    if ((editing.paymentType === 'debt' || editing.paymentType === 'partial') && !editing.customerId) {
      alert('اختر العميل لتسجيل الدين.')
      return
    }
    setSaving(true)
    try {
      const customer = customers.find((item) => item.id === editing.customerId)
      await updateInvoiceDetails(selected.id!, {
        customerId: editing.customerId,
        customerName: customer?.name,
        paymentType: editing.paymentType,
        paymentMethod: editing.paymentMethod,
        paidAmount,
        note: editing.note,
      })
      setSelected(null)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر حفظ التعديلات')
    } finally { setSaving(false) }
  }

  const remove = () => {
    if (!selected?.id) return
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!selected?.id) return
    setDeleting(true)
    try {
      await deleteInvoice(selected.id)
      setDeleteConfirmOpen(false)
      setSelected(null)
    } catch (err) {
      console.error(err)
      alert('حدث خطأ أثناء حذف الفاتورة')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page-frame page-screen" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div><h2 style={{ fontSize: 17, fontWeight: 900 }}>سجل الفواتير</h2><p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 2 }}>كل الفواتير محفوظة هنا ويمكن مراجعتها وتعديلها.</p></div>
          <span className="badge badge-primary">{invoices.length} فاتورة</span>
        </div>
        <div className="input-search"><span>🔍</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="رقم فاتورة، عميل أو منتج..." /></div>
      </section>

      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
        {([['all', 'الكل'], ['cash', 'مكتملة'], ['partial', 'جزئي'], ['debt', 'ديون']] as [InvoiceFilter, string][]).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value)} style={{ flexShrink: 0, border: filter === value ? '1px solid var(--color-primary)' : '1px solid var(--color-border)', background: filter === value ? 'var(--color-primary-glow)' : 'var(--color-bg-card)', color: filter === value ? 'var(--color-primary-light)' : 'var(--color-text-secondary)', borderRadius: 99, padding: '7px 13px', font: '700 12px var(--font-main)', cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      {visible.length === 0 ? <div className="empty-state"><div className="empty-icon">🧾</div><p>لا توجد فواتير مطابقة</p></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {visible.map((invoice) => (
            <button key={invoice.id} type="button" onClick={() => openInvoice(invoice)} style={{ width: '100%', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', borderRadius: 15, padding: 13, cursor: 'pointer', textAlign: 'right', fontFamily: 'var(--font-main)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div><div style={{ display: 'flex', gap: 7, alignItems: 'center' }}><strong>فاتورة #{invoice.id}</strong><span className={`badge ${invoice.paymentType === 'cash' ? 'badge-success' : invoice.paymentType === 'debt' ? 'badge-danger' : 'badge-warning'}`}>{typeLabels[invoice.paymentType]}</span></div><div style={{ color: 'var(--color-text-muted)', fontSize: 11, marginTop: 5 }}>{invoice.customerName || 'بيع مباشر'} · {new Date(invoice.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</div></div>
                <div style={{ textAlign: 'left' }}><strong style={{ direction: 'ltr', display: 'block', fontSize: 15 }}>{formatCurrency(invoice.total)}</strong>{invoice.debtAmount > 0 && <small style={{ color: 'var(--color-danger-light)', direction: 'ltr' }}>دين {formatCurrency(invoice.debtAmount)}</small>}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && editing && <Modal open onClose={() => setSelected(null)} title={viewMode === 'view' ? `فاتورة #${selected.id}` : `تعديل فاتورة #${selected.id}`} type="sheet"><div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* View / Edit tabs */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 3, gap: 4 }}>
          {([['view', '🧾 عرض وطباعة'], ['edit', '✏️ تعديل الدفع']] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              style={{
                flex: 1, padding: '9px', borderRadius: 9, border: 'none',
                background: viewMode === mode ? 'var(--color-primary)' : 'transparent',
                color: viewMode === mode ? 'white' : 'var(--color-text-secondary)',
                fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-main)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {viewMode === 'view' ? (
          <>
            <InvoicePrint invoice={selected} store={storeInfo} />
            <button
              type="button"
              onClick={() => printInvoice(selected)}
              style={{
                width: '100%', padding: '13px', borderRadius: 12,
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                border: 'none', color: 'white', fontWeight: 800, fontSize: 15,
                cursor: 'pointer', fontFamily: 'var(--font-main)',
              }}
            >
              🖨️ طباعة الفاتورة
            </button>
          </>
        ) : (
          <>
        <div style={{ background: 'var(--color-input-bg)', borderRadius: 12, padding: 12, fontSize: 13 }}>
          {selected.items.map((item, index) => (
            <div key={index} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>
                {item.name} × {item.pack ? `${item.qty} ${item.pack.label}` : formatLineQty(item)}
                {item.discount && lineDiscountAmount(item) > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--color-warning-light)', fontWeight: 700 }}> 🏷️ {formatLineDiscount(item.discount)}</span>
                )}
              </span>
              <span style={{ direction: 'ltr' }}>{formatCurrency(item.price * item.qty - lineDiscountAmount(item))}</span>
            </div>
          ))}
          {(selected.itemDiscountAmount || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--color-warning-light)', fontSize: 12 }}>
              <span>خصم الأصناف</span>
              <span style={{ direction: 'ltr' }}>-{formatCurrency(selected.itemDiscountAmount || 0)}</span>
            </div>
          )}
          <div className="divider" /><strong style={{ display: 'flex', justifyContent: 'space-between' }}><span>إجمالي الفاتورة</span><span style={{ direction: 'ltr' }}>{formatCurrency(selected.total)}</span></strong>
        </div>
        <CustomSelect value={editing.paymentType} onChange={(paymentType) => setEditing((current) => current && ({ ...current, paymentType, paidAmount: paymentType === 'debt' ? '0' : paymentType === 'cash' ? String(selected.total) : current.paidAmount }))} label="نوع الدفع" options={(Object.entries(typeLabels) as [PaymentType, string][]).map(([value, label]) => ({ value, label }))} />
        {(editing.paymentType === 'debt' || editing.paymentType === 'partial') && <CustomSelect value={editing.customerId} placeholder="اختر العميل" label="العميل" onChange={(customerId) => setEditing((current) => current && ({ ...current, customerId }))} options={customers.filter((customer) => customer.id !== undefined).map((customer) => ({ value: customer.id!, label: customer.name, description: customer.totalDebt > 0 ? `رصيده: ${formatCurrency(customer.totalDebt)}` : undefined }))} />}
        {editing.paymentType !== 'debt' && <><CustomSelect value={editing.paymentMethod} label="طريقة القبض" onChange={(paymentMethod) => setEditing((current) => current && ({ ...current, paymentMethod }))} options={[{ value: 'cash' as PaymentMethod, label: '💵 نقداً' }, { value: 'jawwal_pay' as PaymentMethod, label: '📱 جوال باي' }, { value: 'palpay' as PaymentMethod, label: '💳 بال باي' }, { value: 'bop' as PaymentMethod, label: '🏦 بنك فلسطين' }]} />{editing.paymentType === 'partial' && <div className="input-wrap"><label className="input-label">المبلغ المقبوض</label><input className="input" type="number" min="0" max={selected.total} value={editing.paidAmount} onChange={(event) => setEditing((current) => current && ({ ...current, paidAmount: event.target.value }))} /></div>}</>}
        <div className="input-wrap"><label className="input-label">ملاحظة</label><textarea className="input" rows={2} value={editing.note} onChange={(event) => setEditing((current) => current && ({ ...current, note: event.target.value }))} /></div>
        <div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn btn-danger" style={{ paddingInline: 14 }} onClick={remove} title="حذف الفاتورة">🗑️</button><button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}</button></div>
          </>
        )}
      </div></Modal>}

      {/* Delete Invoice Confirmation Modal */}
      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        loading={deleting}
        title="حذف فاتورة المبيعات"
        icon="🧾"
        message={`هل أنت متأكد من حذف الفاتورة #${selected?.id}؟`}
        subMessage="سيتم إرجاع كافة الأصناف إلى المخزن وإلغاء أو تعديل أي ديون مرتبطة بهذه الفاتورة تلقائياً."
        confirmText="تأكيد الحذف"
        cancelText="إلغاء"
      />
    </div>
  )
}
