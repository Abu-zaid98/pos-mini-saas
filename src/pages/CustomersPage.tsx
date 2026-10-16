import { useRef, useState } from 'react'
import {
  useCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  recordPayment,
  getCustomerLedger,
  addCustomerDebt,
  getInitialDebt,
  updateInitialDebt,
  type CustomerLedgerItem,
  type DebtKind,
} from '../hooks/useCustomers'
import { Modal, StatCard, SearchBar, Tabs, EmptyState, Icon, PageHeader } from '../components/ui'
import { printElementById } from '../components/print/printDocument'
import { StatementPrintHost, downloadStatementXlsx } from '../components/customer/StatementPrint'
import { InvoicePrint, usePrintInvoice, useStoreInfo } from '../components/invoice/InvoicePrint'
import { InvoiceExportActions } from '../components/invoice/InvoiceExportActions'
import { formatCurrency } from '../utils/currency'
import { formatDate, formatDateTime } from '../utils/datetime'
import { type Customer, type Invoice, type PaymentMethod, getPaymentMethodName, db } from '../db/db'
import { useStoreName } from '../hooks/useStoreName'
import { useWallets, activeWallets } from '../hooks/useWallets'

export function CustomersPage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'debt' | 'settled'>('all')

  // Modals state
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [initialDebt, setInitialDebt] = useState('')

  const [debtModalOpen, setDebtModalOpen] = useState(false)
  const [debtCustomer, setDebtCustomer] = useState<Customer | null>(null)
  const [newDebtAmount, setNewDebtAmount] = useState('')
  const [newDebtNote, setNewDebtNote] = useState('')
  const [newDebtKind, setNewDebtKind] = useState<DebtKind>('balance')
  const [newDebtMethod, setNewDebtMethod] = useState<PaymentMethod>('cash')
  const [isSavingDebt, setIsSavingDebt] = useState(false)

  // Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentNote, setPaymentNote] = useState('')
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false)
  // هل فُتح السداد من داخل كشف الحساب؟ (لإعادة فتح الكشف بعد الحفظ)
  const [returnToLedgerAfterPayment, setReturnToLedgerAfterPayment] = useState(false)

  // Ledger modal state
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false)
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null)
  const [ledgerItems, setLedgerItems] = useState<CustomerLedgerItem[]>([])
  const [isLoadingLedger, setIsLoadingLedger] = useState(false)
  // الفاتورة المعروضة داخل كشف الحساب (null = عرض قائمة الحركات)
  const [ledgerInvoice, setLedgerInvoice] = useState<Invoice | null>(null)
  const ledgerInvoiceRef = useRef<HTMLDivElement>(null)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null)

  const customers = useCustomers(search, filter)
  const storeName = useStoreName()
  const storeInfo = useStoreInfo()
  const printInvoice = usePrintInvoice()
  const allWallets = useWallets()
  const activeList = activeWallets(allWallets)
  const wallets = activeList.length ? activeList : allWallets

  // Aggregate stats
  const totalOutstandingDebt = customers.reduce((sum, c) => sum + (c.totalDebt || 0), 0)
  const indebtedCount = customers.filter((c) => (c.totalDebt || 0) > 0).length

  // Open add / edit modal
  const handleOpenAdd = () => {
    setEditingCustomer(null)
    setName('')
    setPhone('')
    setInitialDebt('')
    setCustomerModalOpen(true)
  }

  const handleOpenEdit = async (c: Customer) => {
    setEditingCustomer(c)
    setName(c.name)
    setPhone(c.phone || '')
    setInitialDebt(String(await getInitialDebt(c.id!)))
    setCustomerModalOpen(true)
  }

  const handleSaveCustomer = async () => {
    if (!name.trim()) {
      alert('يرجى كتابة اسم العميل')
      return
    }

    if (editingCustomer?.id) {
      await updateCustomer(editingCustomer.id, {
        name: name.trim(),
        phone: phone.trim(),
      })
      await updateInitialDebt(editingCustomer.id, parseFloat(initialDebt) || 0)
    } else {
      await addCustomer({
        name: name.trim(),
        phone: phone.trim(),
        initialDebt: parseFloat(initialDebt) || 0,
      })
    }

    setCustomerModalOpen(false)
  }

  const handleOpenAddDebt = (customer: Customer) => {
    setDebtCustomer(customer)
    setNewDebtAmount('')
    setNewDebtNote('')
    setNewDebtKind('balance')
    setNewDebtMethod(wallets[0]?.id || 'cash')
    setDebtModalOpen(true)
  }

  const handleSaveDebt = async () => {
    if (!debtCustomer?.id) return
    if (newDebtKind === 'loan' && !newDebtMethod) {
      alert('يرجى تحديد المحفظة التي صُرفت منها السلفة')
      return
    }
    setIsSavingDebt(true)
    try {
      await addCustomerDebt({
        customerId: debtCustomer.id,
        amount: parseFloat(newDebtAmount),
        note: newDebtNote,
        kind: newDebtKind,
        method: newDebtKind === 'loan' ? newDebtMethod : undefined,
      })
      setDebtModalOpen(false)
      if (ledgerCustomer?.id === debtCustomer.id) await handleOpenLedger(debtCustomer)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر إضافة الدين')
    } finally { setIsSavingDebt(false) }
  }

  const handleDelete = async (c: Customer, force = false) => {
    if (!c.id) return
    try {
      const result = await deleteCustomer(c.id, force)
      if ('blocked' in result && result.blocked) {
        alert(result.reason)
        return
      }
      setDeleteConfirm(null)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر حذف العميل')
    }
  }

  // Open payment modal
  // ملاحظة: بدل ترك كشف الحساب مفتوحاً (فيحجب نافذة السداد بنفس z-index)،
  // نغلق الكشف ثم نعيد فتحه بعد حفظ الدفعة — فيعمل زر «+ دفعة» بشكل صحيح.
  const handleOpenPayment = (c: Customer, fromLedger = false) => {
    setPaymentCustomer(c)
    setPaymentAmount(c.totalDebt > 0 ? c.totalDebt.toString() : '')
    setPaymentMethod('cash')
    setPaymentNote('سداد دفعة من الحساب')
    setReturnToLedgerAfterPayment(fromLedger)
    if (fromLedger) {
      setLedgerModalOpen(false)
      setLedgerInvoice(null)
    }
    setPaymentModalOpen(true)
  }

  const handleSavePayment = async () => {
    if (!paymentCustomer?.id) return
    const amt = parseFloat(paymentAmount) || 0
    if (amt <= 0) {
      alert('يرجى إدخال مبلغ صحيح أكبر من 0')
      return
    }

    setIsSubmittingPayment(true)
    try {
      await recordPayment({
        customerId: paymentCustomer.id,
        amount: amt,
        method: paymentMethod,
        note: paymentNote,
      })
      setPaymentModalOpen(false)
      // إن كان السداد قد بدأ من داخل كشف الحساب، نعيد فتح الكشف بالبيانات المحدّثة
      if (returnToLedgerAfterPayment) {
        setReturnToLedgerAfterPayment(false)
        await handleOpenLedger(paymentCustomer)
      }
    } catch (err) {
      console.error(err)
      alert('حدث خطأ أثناء تسجيل الدفعة')
    } finally {
      setIsSubmittingPayment(false)
    }
  }

  // Open ledger
  const handleOpenLedger = async (c: Customer) => {
    setLedgerCustomer(c)
    setLedgerInvoice(null)
    setLedgerModalOpen(true)
    setIsLoadingLedger(true)
    try {
      if (c.id) {
        const [items, fresh] = await Promise.all([
          getCustomerLedger(c.id),
          db.customers.get(c.id),
        ])
        setLedgerItems(items)
        // نحدّث بيانات العميل من قاعدة البيانات حتى يظهر الرصيد الصحيح بعد أي سداد
        if (fresh) setLedgerCustomer(fresh)
      }
    } finally {
      setIsLoadingLedger(false)
    }
  }

  // Share ledger statement via WhatsApp
  const shareLedgerWhatsApp = (c: Customer) => {
    const phone = c.phone?.replace(/\D/g, '') || ''
    const today = formatDate(new Date())

    let msg = `📋 *كشف حساب — ${c.name}*\n`
    if (storeName) msg += `المتجر: ${storeName}\n`
    msg += `📅 التاريخ: ${today}\n`
    msg += `--------------------------------\n`

    if (ledgerItems.length === 0) {
      msg += `لا توجد حركات مسجلة\n`
    } else {
      ledgerItems.slice(0, 10).forEach((item) => {
        const itemDate = formatDate(item.date)
        if (item.type === 'invoice') {
          msg += `🧾 ${item.title} (${itemDate}): ${formatCurrency(item.amount)}`
          if (item.debt > 0) {
            msg += ` (متبقي: ${formatCurrency(item.debt)})\n`
          } else {
            msg += ` (مدفوعة)\n`
          }
        } else {
          msg += `💰 سند قبض (${itemDate}): -${formatCurrency(item.amount)}\n`
        }
      })
      if (ledgerItems.length > 10) {
        msg += `... والمزيد من الحركات السابقة\n`
      }
    }

    msg += `--------------------------------\n`
    msg += `💰 *إجمالي الرصيد المستحق: ${formatCurrency(c.totalDebt || 0)}*\n`
    msg += `يرجى مراجعة الحساب شاكرين حسن تعاونكم معنا! 🌟`

    const encoded = encodeURIComponent(msg)

    if (phone) {
      const cleanPhone = phone.startsWith('0') ? '970' + phone.slice(1) : phone
      window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank')
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank')
    }
  }

  return (
    <div className="page-frame" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader
        icon="users"
        title="العملاء والديون"
        subtitle="متابعة حسابات العملاء والديون المستحقة"
      />

      {/* Top Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        <StatCard
          label="إجمالي الديون"
          value={formatCurrency(totalOutstandingDebt)}
          icon="banknotes"
          variant="danger"
          ltr
        />
        <StatCard
          label="عليهم ديون"
          value={indebtedCount}
          icon="warning"
          variant="warning"
        />
        <StatCard
          label="إجمالي العملاء"
          value={customers.length}
          icon="users"
          variant="brand"
        />
      </div>

      {/* Search Bar + Add Button */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="ابحث باسم العميل أو رقم هاتفه..."
          />
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          style={{
            height: 46,
            padding: '0 16px',
            background: 'var(--brand-gradient)',
            border: 'none',
            borderRadius: 'var(--radius-xl)',
            color: 'white',
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'var(--font-main)',
            boxShadow: 'var(--shadow-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <Icon name="plus" size={16} />
          <span>عميل جديد</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <Tabs
        tabs={[
          { value: 'all', label: 'جميع العملاء' },
          { value: 'debt', label: 'عليهم ديون', badge: indebtedCount > 0 ? indebtedCount : undefined },
          { value: 'settled', label: 'حسابات مسددة' },
        ]}
        value={filter}
        onChange={(v) => setFilter(v as 'all' | 'debt' | 'settled')}
      />

      {/* Customers List */}
      {customers.length === 0 ? (
        <EmptyState
          icon="users"
          title={search ? 'لا توجد نتائج بحث' : 'لا يوجد عملاء مضافين بعد'}
          description={search ? 'جرّب كتابة اسم أو رقم هاتف آخر' : 'اضغط زر "عميل جديد" لإضافة أول عميل ومتابعة حساباته'}
          action={
            <button
              type="button"
              onClick={handleOpenAdd}
              style={{
                background: 'var(--brand-gradient)',
                border: 'none',
                borderRadius: 10,
                padding: '8px 18px',
                color: '#fff',
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'var(--font-main)',
              }}
            >
              <Icon name="plus" size={16} />
              <span>عميل جديد</span>
            </button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {customers.map((c) => {
            const hasDebt = (c.totalDebt || 0) > 0
            const hasCredit = (c.creditBalance || 0) > 0
            const cleanPhone = c.phone?.replace(/\D/g, '')

            return (
              <div
                key={c.id}
                style={{
                  background: 'var(--color-bg-card)',
                  border: hasDebt ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--color-border)',
                  borderRadius: 16,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {/* Header: Name + Debt Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{c.name}</h3>
                    {c.phone ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, color: 'var(--color-text-muted)', direction: 'ltr' }}>
                          {c.phone}
                        </span>
                        {/* WhatsApp quick button */}
                        <button
                          onClick={() => {
                            const p = cleanPhone?.startsWith('0') ? '970' + cleanPhone.slice(1) : cleanPhone
                            window.open(`https://wa.me/${p}`, '_blank')
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 16,
                            padding: 0,
                          }}
                          title="محادثة واتساب"
                        >
                          💬
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>لا يوجد هاتف</span>
                    )}
                  </div>

                  <div style={{ textAlign: 'left' }}>
                    <div style={{
                      padding: '4px 12px',
                      borderRadius: 50,
                      background: hasDebt ? 'rgba(239,68,68,0.15)' : hasCredit ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                      border: hasDebt ? '1px solid rgba(239,68,68,0.3)' : hasCredit ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(16,185,129,0.3)',
                      color: hasDebt ? 'var(--color-danger-light)' : hasCredit ? 'var(--color-primary-light)' : 'var(--color-success-light)',
                      fontWeight: 800,
                      fontSize: 14,
                      direction: 'ltr',
                      display: 'inline-block',
                    }}>
                      {formatCurrency(hasDebt ? c.totalDebt || 0 : hasCredit ? -(c.creditBalance || 0) : 0)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, textAlign: 'right' }}>
                      {hasDebt ? 'مبلغ الدين' : hasCredit ? 'رصيد زائد' : 'حساب خالص ✓'}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{
                  display: 'flex',
                  gap: 8,
                  borderTop: '1px solid var(--color-border)',
                  paddingTop: 10,
                  flexWrap: 'wrap',
                }}>
                  <button
                    type="button"
                    onClick={() => handleOpenPayment(c)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: '1px solid rgba(16,185,129,0.5)',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      boxShadow: '0 6px 18px rgba(16,185,129,0.22)',
                    }}
                  >
                    <Icon name="banknotes" size={15} />
                    <span>سداد دفعة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenLedger(c)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: 'rgba(59,130,246,0.15)',
                      border: '1px solid rgba(59,130,246,0.3)',
                      color: 'var(--color-primary-light)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                    }}
                  >
                    <Icon name="document" size={15} />
                    <span>كشف حساب</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenAddDebt(c)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      color: 'var(--color-danger-light)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <Icon name="plus" size={13} />
                    <span>إضافة دين</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(c)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--color-border)',
                      cursor: 'pointer',
                      color: 'var(--color-text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    title="تعديل بيانات العميل"
                  >
                    <Icon name="pencil" size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(c)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      color: 'var(--color-danger-light)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    title="حذف العميل"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL: ADD / EDIT CUSTOMER */}
      <Modal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        title={editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
        type="box"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4, fontWeight: 700 }}>
              اسم العميل <span style={{ color: 'var(--color-danger)' }}>*</span>:
            </label>
            <input
              type="text"
              placeholder="مثال: أحمد أبو علي"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
              رقم الهاتف (لإرسال كشف الحساب عبر واتساب):
            </label>
            <input
              type="tel"
              placeholder="مثال: 0599123456"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: 14,
                outline: 'none',
                direction: 'ltr',
                textAlign: 'right',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
              رصيد الدين الافتتاحي:
            </label>
            <input
              type="number"
              min="0"
              placeholder="0.00 ₪"
              value={initialDebt}
              onChange={(e) => setInitialDebt(e.target.value)}
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: 14,
                outline: 'none', direction: 'ltr', textAlign: 'right',
              }}
            />
            {editingCustomer && <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 5 }}>هذا يعدّل الدين الافتتاحي فقط؛ أضف الديون اللاحقة عبر زر «إضافة دين» ليظهر كل شيء في السجل.</p>}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setCustomerModalOpen(false)}
              className="btn btn-ghost"
              style={{ flex: 1 }}
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSaveCustomer}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              {editingCustomer ? 'حفظ التعديلات' : 'إضافة العميل'}
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: ADD A MANUAL DEBT ENTRY */}
      <Modal
        open={debtModalOpen}
        onClose={() => setDebtModalOpen(false)}
        title={debtCustomer ? `إضافة دين — ${debtCustomer.name}` : 'إضافة دين'}
        type="box"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6, fontWeight: 700 }}>نوع الدين *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {([
                { id: 'balance' as DebtKind, label: 'رصيد سابق', icon: '🗂️' },
                { id: 'goods' as DebtKind, label: 'بضاعة آجلة', icon: '📦' },
                { id: 'loan' as DebtKind, label: 'سلفة نقدية', icon: '🤲' },
              ]).map((k) => {
                const active = newDebtKind === k.id
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setNewDebtKind(k.id)}
                    style={{
                      padding: '9px 6px',
                      borderRadius: 10,
                      border: active ? '1px solid transparent' : '1px solid var(--color-border)',
                      background: active ? 'var(--brand-gradient)' : 'rgba(255,255,255,0.04)',
                      color: active ? '#fff' : 'var(--color-text-secondary)',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{k.icon}</span>
                    <span>{k.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{
            background: newDebtKind === 'loan' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.08)',
            border: newDebtKind === 'loan' ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(239,68,68,0.2)',
            borderRadius: 12, padding: 12, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.7,
          }}>
            {newDebtKind === 'loan'
              ? '🤲 سلفة نقدية: سيُخصم المبلغ فعلياً من المحفظة المختارة ويُضاف ديناً على العميل.'
              : newDebtKind === 'goods'
                ? '📦 بضاعة آجلة بدون فاتورة: تُضاف ديناً على العميل (لا تُخصم من المخزون هنا — الأفضل تسجيلها كفاتورة بيع).'
                : '🗂️ رصيد سابق / تسوية: يُضاف ديناً على العميل بلا أي أثر على المحفظة أو المخزون.'}
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5, fontWeight: 700 }}>المبلغ *</label>
            <input type="number" min="0.01" step="0.01" placeholder="0.00 ₪" value={newDebtAmount} onChange={(event) => setNewDebtAmount(event.target.value)} className="input" style={{ direction: 'ltr', textAlign: 'right' }} />
          </div>

          {newDebtKind === 'loan' && (
            <div>
              <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6, fontWeight: 700 }}>
                المحفظة التي صُرفت منها السلفة *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {wallets.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setNewDebtMethod(m.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: newDebtMethod === m.id ? '1px solid transparent' : '1px solid var(--color-border)',
                      background: newDebtMethod === m.id ? 'var(--brand-gradient)' : 'rgba(255,255,255,0.04)',
                      color: newDebtMethod === m.id ? '#fff' : 'var(--color-text-secondary)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                    }}
                  >
                    {m.icon} {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>سبب الدين / ملاحظة</label>
            <input type="text" placeholder="مثال: بضاعة آجلة خارج الفاتورة" value={newDebtNote} onChange={(event) => setNewDebtNote(event.target.value)} className="input" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setDebtModalOpen(false)}>إلغاء</button>
            <button type="button" className="btn btn-danger" style={{ flex: 1 }} disabled={isSavingDebt} onClick={handleSaveDebt}>{isSavingDebt ? 'جارٍ الحفظ...' : 'إضافة الدين'}</button>
          </div>
        </div>
      </Modal>

      {/* MODAL: RECORD PAYMENT */}
      <Modal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title="تسجيل سداد دفعة من الدين"
        type="box"
      >
        {paymentCustomer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 12,
              padding: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{paymentCustomer.name}</span>
              <span style={{ fontSize: 13, color: 'var(--color-danger-light)', fontWeight: 800, direction: 'ltr' }}>
                الدين الحالي: {formatCurrency(paymentCustomer.totalDebt || 0)}
                {(paymentCustomer.creditBalance || 0) > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--color-primary-light)', marginTop: 4 }}>رصيد زائد: {formatCurrency(paymentCustomer.creditBalance || 0)}</div>
                )}
              </span>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 700 }}>
                  المبلغ المسدد (₪) <span style={{ color: 'var(--color-danger)' }}>*</span>:
                </label>
                {paymentCustomer.totalDebt > 0 && (
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(paymentCustomer.totalDebt.toString())}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-success-light)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                    }}
                  >
                    سداد الدين كاملاً ✓
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="أدخل المبلغ المسدد..."
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1.5px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: 18,
                  fontWeight: 800,
                  outline: 'none',
                  direction: 'ltr',
                  textAlign: 'right',
                }}
              />
            </div>

            {/* Payment Method Selector */}
            <div>
              <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6, fontWeight: 700 }}>
                طريقة القبض المستلمة:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {wallets.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: paymentMethod === m.id ? '1px solid transparent' : '1px solid var(--color-border)',
                      background: paymentMethod === m.id ? 'var(--brand-gradient)' : 'rgba(255,255,255,0.04)',
                      color: paymentMethod === m.id ? '#fff' : 'var(--color-text-secondary)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                    }}
                  >
                    {m.icon} {m.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                ملاحظة السند:
              </label>
              <input
                type="text"
                placeholder="مثال: دفعة كاش، تحويل بنكي..."
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="btn btn-ghost"
                style={{ flex: 1 }}
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSubmittingPayment}
                onClick={handleSavePayment}
                style={{
                  flex: 1.5,
                  padding: '11px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: isSubmittingPayment ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-main)',
                }}
              >
                {isSubmittingPayment ? 'جارٍ الحفظ...' : 'تأكيد السند ✓'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: CUSTOMER LEDGER (كشف الحساب) */}
      <Modal
        open={ledgerModalOpen}
        onClose={() => { setLedgerModalOpen(false); setLedgerInvoice(null) }}
        title={
          ledgerInvoice
            ? `فاتورة #${ledgerInvoice.id}`
            : ledgerCustomer
              ? `كشف حساب: ${ledgerCustomer.name}`
              : 'كشف الحساب'
        }
        type="sheet"
      >
        {ledgerCustomer && ledgerInvoice ? (
          /* ── عرض فاتورة من داخل كشف الحساب + تنزيلها كصورة / طباعة ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '80vh', overflowY: 'auto' }}>
            <button
              type="button"
              onClick={() => setLedgerInvoice(null)}
              className="btn btn-ghost btn-sm"
              style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="arrow-right" size={16} />
              <span>رجوع إلى كشف الحساب</span>
            </button>

            <InvoicePrint invoice={ledgerInvoice} store={storeInfo} containerRef={ledgerInvoiceRef} />

            <InvoiceExportActions
              getTarget={() => ledgerInvoiceRef.current}
              filenameBase={`invoice-${ledgerInvoice.id ?? ''}`}
              whatsappPhone={ledgerCustomer.phone}
              whatsappText={`فاتورة مبيعات #${ledgerInvoice.id ?? ''}`}
            />

            <button
              type="button"
              onClick={() => printInvoice(ledgerInvoice)}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Icon name="printer" size={18} />
              <span>طباعة الفاتورة</span>
            </button>
          </div>
        ) : ledgerCustomer ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '80vh', overflowY: 'auto' }}>
            {/* Summary Box */}
            <div style={{
              background: 'var(--kpi-danger-bg)',
              border: '1px solid var(--kpi-danger-border)',
              borderRadius: 16,
              padding: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>إجمالي الدين المستحق الآن</span>
                <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-danger-light)', direction: 'ltr' }}>
                  {formatCurrency(ledgerCustomer.totalDebt || 0)}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => shareLedgerWhatsApp(ledgerCustomer)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: '#25D366',
                    border: 'none',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>واتساب</span>
                  <span>💬</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenPayment(ledgerCustomer, true)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: 'var(--color-primary)',
                    border: 'none',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  + دفعة
                </button>
              </div>
            </div>

            {/* Export & Print row */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => printElementById('statement-print-root')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <span>🖨️ طباعة الكشف</span>
              </button>
              <button
                type="button"
                onClick={() => downloadStatementXlsx(ledgerCustomer, ledgerItems)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <span>⬇️ تصدير إكسل</span>
              </button>
            </div>

            {/* History List */}
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
                سجل الفواتير وسندات القبض:
              </h4>

              {isLoadingLedger ? (
                <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 20 }}>جارٍ التحميل...</p>
              ) : ledgerItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--color-text-muted)' }}>
                  <div style={{ fontSize: 30, marginBottom: 6 }}>📜</div>
                  <p>لا توجد حركات مسجلة لهذا العميل حتى الآن</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ledgerItems.map((item) => {
                    // فاتورة البيع الحقيقية فقط تُفتح للعرض/الطباعة (لا قيود الدين اليدوية)
                    const isRealSale = !!item.invoice && item.invoice.items.some((it) => it.productId !== 0)
                    const openable = item.type === 'invoice' && isRealSale
                    const openInvoice = () => { if (item.invoice) setLedgerInvoice(item.invoice) }
                    return (
                      <div
                        key={item.id}
                        onClick={openable ? openInvoice : undefined}
                        role={openable ? 'button' : undefined}
                        tabIndex={openable ? 0 : undefined}
                        onKeyDown={openable ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openInvoice() }
                        } : undefined}
                        style={{
                          background: 'var(--color-bg-card)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 12,
                          padding: '12px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                          cursor: openable ? 'pointer' : 'default',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 16 }}>{item.type === 'invoice' ? '🧾' : '💰'}</span>
                            <span style={{ fontSize: 14, fontWeight: 700 }}>{item.title}</span>
                            {item.payment?.method && (
                              <span style={{
                                fontSize: 10,
                                background: 'rgba(255,255,255,0.08)',
                                padding: '2px 6px',
                                borderRadius: 6,
                                color: 'var(--color-text-muted)',
                              }}>
                                {getPaymentMethodName(item.payment.method)}
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
                            {formatDateTime(item.date)}
                            {item.note && ` • ${item.note}`}
                          </p>
                          {openable && (
                            <span style={{ fontSize: 11, color: 'var(--color-primary-light)', fontWeight: 700 }}>
                              اضغط لعرض الفاتورة وتنزيلها كصورة
                            </span>
                          )}
                        </div>

                        <div style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <div>
                            <div style={{
                              fontSize: 14,
                              fontWeight: 800,
                              color: item.type === 'invoice' ? 'var(--color-text-primary)' : 'var(--color-success-light)',
                              direction: 'ltr',
                            }}>
                              {item.type === 'payment' ? `-${formatCurrency(item.amount)}` : formatCurrency(item.amount)}
                            </div>
                            {item.type === 'invoice' && item.debt > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--color-danger-light)', direction: 'ltr' }}>
                                دين: {formatCurrency(item.debt)}
                              </div>
                            )}
                          </div>
                          {openable && (
                            <Icon name="chevron-left" size={16} color="var(--color-text-muted)" />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Hidden statement print root */}
      <StatementPrintHost customer={ledgerModalOpen ? ledgerCustomer : null} items={ledgerItems} />

      {/* MODAL: DELETE CONFIRM */}
      {deleteConfirm && (
        <Modal
          open={Boolean(deleteConfirm)}
          onClose={() => setDeleteConfirm(null)}
          title="حذف العميل"
          type="box"
        >
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 36 }}>{(deleteConfirm.totalDebt || 0) > 0 ? '⚠️' : '🗑️'}</div>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              هل أنت متأكد من حذف العميل "<strong style={{ color: 'var(--color-text-primary)' }}>{deleteConfirm.name}</strong>"؟
            </p>

            {(deleteConfirm.totalDebt || 0) > 0 ? (
              // Customer has debt — show warning + two options
              <>
                <div style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  textAlign: 'right',
                }}>
                  <p style={{ fontSize: 13, color: 'var(--color-danger-light)', fontWeight: 700, marginBottom: 4 }}>
                    ⚠️ هذا العميل لديه ديون مستحقة!
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--color-danger-light)', direction: 'ltr', fontWeight: 800 }}>
                    {formatCurrency(deleteConfirm.totalDebt)}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                    لا يمكن حذف عميل مدين حفاظاً على تطابق الحسابات — الفواتير والسندات تبقى في السجلات.
                    حصّل الدين من زر «سداد دفعة» ثم احذفه.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(null)}
                    style={{
                      padding: '11px',
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                      border: 'none',
                      color: 'white',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                    }}
                  >
                    فهمت — سأحصّل الدين أولاً
                  </button>
                </div>
              </>
            ) : (
              // No debt — simple confirm
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  style={{
                    flex: 1,
                    padding: '11px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deleteConfirm, false)}
                  style={{
                    flex: 1,
                    padding: '11px',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    border: 'none',
                    color: 'white',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  نعم، احذف
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
