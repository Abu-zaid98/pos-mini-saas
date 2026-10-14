import { useMemo, useState } from 'react'
import { CustomSelect } from '../components/ui/CustomSelect'
import { Modal } from '../components/ui/Modal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { InvoicePrint, usePrintInvoice, useStoreInfo } from '../components/invoice/InvoicePrint'
import { InvoiceReturnModal } from '../components/invoice/InvoiceReturnModal'
import { db, type Invoice, type PaymentMethod, type PaymentType } from '../db/db'
import { useCustomers } from '../hooks/useCustomers'
import { deleteInvoice, updateInvoiceDetails, useInvoices } from '../hooks/useInvoices'
import { formatCurrency } from '../utils/currency'
import { formatLineDiscount, formatLineQty, lineDiscountAmount } from '../utils/units'
import { Icon, SearchBar, Tabs, StatCard, EmptyState, SectionHeader } from '../components/ui'

type InvoiceFilter = 'all' | PaymentType
type InvoicePeriod = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'

const periodTabs = [
  { value: 'all', label: 'الكل' },
  { value: 'today', label: 'اليوم' },
  { value: 'yesterday', label: 'أمس' },
  { value: 'week', label: 'آخر 7 أيام' },
  { value: 'month', label: 'هذا الشهر' },
  { value: 'custom', label: 'مخصص' },
]

const filterTabs = [
  { value: 'all', label: 'الكل' },
  { value: 'cash', label: 'مكتمل' },
  { value: 'partial', label: 'جزئي' },
  { value: 'debt', label: 'ديون' },
]

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

const typeLabels: Record<PaymentType, string> = {
  cash: 'نقدي / مكتمل',
  debt: 'دين كامل',
  partial: 'دفع جزئي',
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
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [editing, setEditing] = useState<{
    customerId: number | null
    paymentType: PaymentType
    paymentMethod: PaymentMethod
    paidAmount: string
    note: string
  } | null>(null)

  const visible = useMemo(() => invoices.filter((invoice) => {
    // استبعاد فواتير الديون الافتتاحية واليدوية (حيث جميع البنود productId === 0)
    const isRealSale = invoice.items.length === 0 || invoice.items.some((item) => item.productId !== 0)
    if (!isRealSale) return false

    const matchFilter = filter === 'all' || invoice.paymentType === filter
    const query = search.trim().toLowerCase()
    const matchSearch = !query ||
      String(invoice.id).includes(query) ||
      invoice.customerName?.toLowerCase().includes(query) ||
      invoice.items.some((item) => item.name.toLowerCase().includes(query))

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
    (s, inv) => ({
      total: s.total + (inv.total || 0),
      paid: s.paid + (inv.paidAmount || 0),
      debt: s.debt + (inv.debtAmount || 0),
    }),
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
      {/* Header section with Search */}
      <section className="card" style={{ padding: 16 }}>
        <SectionHeader
          title="سجل الفواتير"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge badge-primary">{visible.length} / {invoices.length}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={exportCsv}
                disabled={visible.length === 0}
                title="تصدير الفواتير المعروضة كملف CSV"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name="download" size={15} />
                <span>تصدير</span>
              </button>
            </div>
          }
        />
        <div style={{ marginTop: 12 }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="ابحث برقم الفاتورة، العميل أو اسم المنتج..."
          />
        </div>
      </section>

      {/* Filter & Period Controls */}
      <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8 }}>الفترة الزمنية</div>
          <Tabs
            tabs={periodTabs}
            value={period}
            onChange={(p) => {
              setPeriod(p as InvoicePeriod)
              if (p !== 'custom') {
                setFromDate('')
                setToDate('')
              }
            }}
          />
        </div>

        {period === 'custom' && (
          <div style={{
            background: 'var(--color-input-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 14,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="input-wrap">
                <label className="input-label">من تاريخ</label>
                <input
                  className="input"
                  type="date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="input-wrap">
                <label className="input-label">إلى تاريخ</label>
                <input
                  className="input"
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>
            {(fromDate || toDate) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--color-primary-light)', fontWeight: 700 }}>
                  الفترة: {fromDate || 'البداية'} ← {toDate || 'اليوم'}
                </span>
                <button
                  type="button"
                  onClick={() => { setFromDate(''); setToDate('') }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    fontSize: 12,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  مسح التاريخ
                </button>
              </div>
            )}
          </div>
        )}

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8 }}>نوع الدفع</div>
          <Tabs
            tabs={filterTabs}
            value={filter}
            onChange={(f) => setFilter(f as InvoiceFilter)}
          />
        </div>
      </section>

      {/* KPI Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <StatCard
          label="المبيعات"
          value={formatCurrency(totals.total)}
          variant="brand"
          ltr
        />
        <StatCard
          label="المقبوض"
          value={formatCurrency(totals.paid)}
          variant="success"
          ltr
        />
        <StatCard
          label="الديون"
          value={formatCurrency(totals.debt)}
          variant={totals.debt > 0 ? 'danger' : 'default'}
          ltr
        />
      </div>

      {/* Invoice List */}
      {visible.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="لا توجد فواتير مطابقة"
          description={search ? `لم نجد أي فاتورة مطابقة لبحثك "${search}"` : 'لم يتم تسجيل فواتير في هذه الفترة'}
          action={
            (search || period !== 'all' || filter !== 'all') ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setSearch('')
                  setPeriod('all')
                  setFilter('all')
                  setFromDate('')
                  setToDate('')
                }}
              >
                إعادة ضبط الفلاتر
              </button>
            ) : undefined
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((invoice) => {
            const isCash = invoice.paymentType === 'cash'
            const isDebt = invoice.paymentType === 'debt'
            return (
              <button
                key={invoice.id}
                type="button"
                onClick={() => openInvoice(invoice)}
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
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>فاتورة #{invoice.id}</strong>
                      <span className={`badge ${isCash ? 'badge-success' : isDebt ? 'badge-danger' : 'badge-warning'}`}>
                        {typeLabels[invoice.paymentType]}
                      </span>
                      {invoice.refundedAmount && invoice.refundedAmount > 0 ? (
                        <span style={{
                          fontSize: 10.5,
                          fontWeight: 800,
                          background: 'rgba(239,68,68,0.12)',
                          color: 'var(--color-danger-light)',
                          border: '1px solid rgba(239,68,68,0.25)',
                          borderRadius: 50,
                          padding: '1px 8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}>
                          <Icon name="arrow-left" size={11} />
                          <span>مرتجع {formatCurrency(invoice.refundedAmount)}</span>
                        </span>
                      ) : null}
                    </div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        {invoice.customerName || 'بيع مباشر'}
                      </span>
                      <span>·</span>
                      <span>
                        {new Date(invoice.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                      <span>·</span>
                      <span>{invoice.items.length} أصناف</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'left', flexShrink: 0 }}>
                    <strong style={{ direction: 'ltr', display: 'block', fontSize: 16, color: 'var(--color-text-primary)' }}>
                      {formatCurrency(invoice.total)}
                    </strong>
                    {invoice.debtAmount > 0 && (
                      <small style={{ color: 'var(--color-danger-light)', direction: 'ltr', display: 'block', fontWeight: 800, fontSize: 11 }}>
                        دين {formatCurrency(invoice.debtAmount)}
                      </small>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Invoice Details & Edit Modal */}
      {selected && editing && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={viewMode === 'view' ? `فاتورة #${selected.id}` : `تعديل فاتورة #${selected.id}`}
          type="sheet"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* View / Edit Mode Switcher */}
            <Tabs
              tabs={[
                { value: 'view', label: 'عرض وطباعة', icon: 'receipt' },
                { value: 'edit', label: 'تعديل الدفع', icon: 'pencil' },
              ]}
              value={viewMode}
              onChange={(m) => setViewMode(m as 'view' | 'edit')}
            />

            {viewMode === 'view' ? (
              <>
                <InvoicePrint invoice={selected} store={storeInfo} />
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => printInvoice(selected)}
                    style={{
                      flex: 2,
                      padding: '14px',
                      borderRadius: 14,
                      background: 'var(--brand-gradient)',
                      border: 'none',
                      color: 'white',
                      fontWeight: 800,
                      fontSize: 15,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
                    }}
                  >
                    <Icon name="printer" size={18} />
                    <span>طباعة الفاتورة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReturnModal(true)}
                    style={{
                      flex: 1,
                      padding: '14px',
                      borderRadius: 14,
                      background: 'var(--kpi-danger-bg)',
                      border: '1px solid var(--kpi-danger-border)',
                      color: 'var(--color-danger-light)',
                      fontWeight: 800,
                      fontSize: 14,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Icon name="arrow-left" size={16} />
                    <span>إرجاع</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: 'var(--color-input-bg)', borderRadius: 14, padding: 14, fontSize: 13, border: '1px solid var(--color-border)' }}>
                  {selected.items.map((item, index) => (
                    <div key={index} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: index < selected.items.length - 1 ? '1px dashed var(--color-border)' : 'none' }}>
                      <span>
                        {item.name} × {item.pack ? `${item.qty} ${item.pack.label}` : formatLineQty(item)}
                        {item.discount && lineDiscountAmount(item) > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--color-warning-light)', fontWeight: 700, marginInlineStart: 6 }}>
                            خصم {formatLineDiscount(item.discount)}
                          </span>
                        )}
                      </span>
                      <span style={{ direction: 'ltr', fontWeight: 700 }}>
                        {formatCurrency(item.price * item.qty - lineDiscountAmount(item))}
                      </span>
                    </div>
                  ))}
                  {(selected.itemDiscountAmount || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', color: 'var(--color-warning-light)', fontSize: 12 }}>
                      <span>خصم الأصناف</span>
                      <span style={{ direction: 'ltr' }}>-{formatCurrency(selected.itemDiscountAmount || 0)}</span>
                    </div>
                  )}
                  <div className="divider" style={{ margin: '8px 0' }} />
                  <strong style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                    <span>إجمالي الفاتورة</span>
                    <span style={{ direction: 'ltr', color: 'var(--color-primary-light)' }}>{formatCurrency(selected.total)}</span>
                  </strong>
                </div>

                <CustomSelect
                  value={editing.paymentType}
                  onChange={(paymentType) => setEditing((current) => current && ({
                    ...current,
                    paymentType,
                    paidAmount: paymentType === 'debt' ? '0' : paymentType === 'cash' ? String(selected.total) : current.paidAmount,
                  }))}
                  label="نوع الدفع"
                  options={(Object.entries(typeLabels) as [PaymentType, string][]).map(([value, label]) => ({ value, label }))}
                />

                {(editing.paymentType === 'debt' || editing.paymentType === 'partial') && (
                  <CustomSelect
                    value={editing.customerId}
                    placeholder="اختر العميل"
                    label="العميل"
                    searchable
                    onChange={(customerId) => setEditing((current) => current && ({ ...current, customerId }))}
                    options={customers.filter((customer) => customer.id !== undefined).map((customer) => ({
                      value: customer.id!,
                      label: customer.name,
                      description: `${customer.phone ? `${customer.phone} · ` : ''}${customer.totalDebt > 0 ? `رصيده: ${formatCurrency(customer.totalDebt)}` : 'لا دين'}`,
                    }))}
                  />
                )}

                {editing.paymentType !== 'debt' && (
                  <>
                    <CustomSelect
                      value={editing.paymentMethod}
                      label="طريقة القبض"
                      onChange={(paymentMethod) => setEditing((current) => current && ({ ...current, paymentMethod }))}
                      options={[
                        { value: 'cash' as PaymentMethod, label: 'نقداً' },
                        { value: 'jawwal_pay' as PaymentMethod, label: 'جوال باي' },
                        { value: 'palpay' as PaymentMethod, label: 'بال باي' },
                        { value: 'bop' as PaymentMethod, label: 'بنك فلسطين' },
                      ]}
                    />
                    {editing.paymentType === 'partial' && (
                      <div className="input-wrap">
                        <label className="input-label">المبلغ المقبوض</label>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          max={selected.total}
                          value={editing.paidAmount}
                          onChange={(event) => setEditing((current) => current && ({ ...current, paidAmount: event.target.value }))}
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="input-wrap">
                  <label className="input-label">ملاحظة</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={editing.note}
                    onChange={(event) => setEditing((current) => current && ({ ...current, note: event.target.value }))}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ paddingInline: 16 }}
                    onClick={remove}
                    title="حذف الفاتورة"
                  >
                    <Icon name="trash" size={18} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={save}
                    disabled={saving}
                  >
                    {saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

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

      {/* Invoice Return Modal */}
      {showReturnModal && selected && (
        <InvoiceReturnModal
          open
          invoice={selected}
          onClose={() => setShowReturnModal(false)}
          onSuccess={async () => {
            setShowReturnModal(false)
            const updated = await db.invoices.get(selected.id!)
            if (updated) setSelected(updated)
          }}
        />
      )}
    </div>
  )
}
