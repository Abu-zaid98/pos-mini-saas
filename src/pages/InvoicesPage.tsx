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
type InvoicePeriod = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'

const quickPeriods: [Exclude<InvoicePeriod, 'custom'>, string][] = [
  ['today', 'اليوم'],
  ['yesterday', 'أمس'],
  ['week', 'آخر 7 أيام'],
  ['month', 'هذا الشهر'],
  ['all', 'الكل'],
]

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

const typeLabels: Record<PaymentType, string> = {
  cash: 'نقدي / مكتمل', debt: 'دين كامل', partial: 'دفع جزئي',
}

export function InvoicesPage() {
  const invoices = useInvoices({ dateRange: 'all' })
  const customers = useCustomers()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<InvoiceFilter>('all')
  const [period, setPeriod] = useState<InvoicePeriod>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
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

    const t = new Date(invoice.createdAt).getTime()
    const now = new Date()
    const todayStart = startOfDay(now)
    let matchPeriod = true
    if (period === 'today') matchPeriod = t >= todayStart
    else if (period === 'yesterday') matchPeriod = t >= todayStart - 86400000 && t < todayStart
    else if (period === 'week') matchPeriod = t >= todayStart - 6 * 86400000
    else if (period === 'month') matchPeriod = t >= new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    else if (period === 'custom') {
      const f = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : NaN
      const e = toDate ? new Date(toDate + 'T00:00:00').getTime() + 86400000 : NaN
      const fromOk = !fromDate || (Number.isFinite(f) && t >= f)
      const toOk = !toDate || (Number.isFinite(e) && t < e)
      matchPeriod = fromOk && toOk
    }
    return matchFilter && matchSearch && matchPeriod
  }), [invoices, filter, search, period, fromDate, toDate])

  const totals = useMemo(() => visible.reduce(
    (s, inv) => ({ total: s.total + (inv.total || 0), paid: s.paid + (inv.paidAmount || 0), debt: s.debt + (inv.debtAmount || 0) }),
    { total: 0, paid: 0, debt: 0 },
  ), [visible])

  const exportCsv = () => {
    if (visible.length === 0) {
      alert('لا توجد فواتير مطابقة للتصدير في هذه الفترة.')
      return
    }
    const rows: string[][] = [
      ['رقم الفاتورة', 'التاريخ', 'العميل', 'نوع الدفع', 'الإجمالي', 'المدفوع', 'الدين', 'الأصناف'],
      ...visible.map((inv) => [
        String(inv.id ?? ''),
        new Date(inv.createdAt).toLocaleString('ar-EG'),
        inv.customerName || 'بيع مباشر',
        typeLabels[inv.paymentType] || inv.paymentType,
        String(inv.total || 0),
        String(inv.paidAmount || 0),
        String(inv.debtAmount || 0),
        inv.items.map((i) => `${i.name} × ${i.qty}`).join(' | '),
      ]),
      [],
      ['الإجمالي', '', '', '', String(totals.total), String(totals.paid), String(totals.debt), `عدد الفواتير: ${visible.length}`],
    ]
    const esc = (c: string) => `"${String(c).replace(/"/g, '""')}"`
    const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = period === 'custom' ? `${fromDate || 'start'}_to_${toDate || 'now'}` : period
    a.href = url
    a.download = `invoices-${stamp}-${visible.length}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
    <div className="page-frame" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div><h2 style={{ fontSize: 17, fontWeight: 900 }}>سجل الفواتير</h2><p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 2 }}>كل الفواتير محفوظة هنا ويمكن مراجعتها وتعديلها.</p></div>
          <span className="badge badge-primary">{visible.length} / {invoices.length} فاتورة</span>
        </div>
        <div className="input-search"><span>🔍</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="رقم فاتورة، عميل أو منتج..." /></div>
      </section>

      <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
          {quickPeriods.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => { setPeriod(value); setFromDate(''); setToDate('') }}
              style={{ flexShrink: 0, border: period === value ? '1px solid var(--color-primary)' : '1px solid var(--color-border)', background: period === value ? 'var(--color-primary-glow)' : 'var(--color-bg-card)', color: period === value ? 'var(--color-primary-light)' : 'var(--color-text-secondary)', borderRadius: 99, padding: '7px 13px', font: '700 12px var(--font-main)', cursor: 'pointer' }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="input-wrap"><label className="input-label">من تاريخ</label><input className="input" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => { setFromDate(e.target.value); setPeriod('custom') }} /></div>
          <div className="input-wrap"><label className="input-label">إلى تاريخ</label><input className="input" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => { setToDate(e.target.value); setPeriod('custom') }} /></div>
        </div>
        {period === 'custom' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--color-primary-light)', fontWeight: 700 }}>
              ↔ فترة مخصصة: {fromDate || 'البداية'} → {toDate || 'اليوم'}
            </span>
            <button type="button" onClick={() => { setPeriod('all'); setFromDate(''); setToDate('') }} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--font-main)' }}>
              مسح الفترة
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180, display: 'flex', gap: 8, background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
            <span>💰 {formatCurrency(totals.total)}</span>
            <span style={{ color: 'var(--color-success-light)' }}>مقبوض {formatCurrency(totals.paid)}</span>
            {totals.debt > 0 && <span style={{ color: 'var(--color-danger-light)' }}>دين {formatCurrency(totals.debt)}</span>}
          </div>
          <button type="button" className="btn btn-success btn-sm" onClick={exportCsv} disabled={visible.length === 0} title="تصدير الفواتير المعروضة كملف CSV">
            ⬇️ تصدير ({visible.length})
          </button>
        </div>
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
        <div style={{ display: 'flex', background: 'var(--color-btn-ghost-bg)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 4, gap: 4 }}>
          {([['view', '🧾 عرض وطباعة'], ['edit', '✏️ تعديل الدفع']] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              style={{
                flex: 1, padding: '10px', borderRadius: 10, border: 'none',
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
                background: 'var(--brand-gradient)',
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
