import { useState } from 'react'
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
} from '../hooks/useCustomers'
import { Modal } from '../components/ui/Modal'
import { StatementPrintHost, downloadStatementCSV } from '../components/customer/StatementPrint'
import { formatCurrency } from '../utils/currency'
import { type Customer, type PaymentMethod, getPaymentMethodName } from '../db/db'
import { useStoreName } from '../hooks/useStoreName'

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
  const [isSavingDebt, setIsSavingDebt] = useState(false)

  // Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentNote, setPaymentNote] = useState('')
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false)

  // Ledger modal state
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false)
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null)
  const [ledgerItems, setLedgerItems] = useState<CustomerLedgerItem[]>([])
  const [isLoadingLedger, setIsLoadingLedger] = useState(false)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null)

  const customers = useCustomers(search, filter)
  const storeName = useStoreName()

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
    setNewDebtNote('دين إضافي على الحساب')
    setDebtModalOpen(true)
  }

  const handleSaveDebt = async () => {
    if (!debtCustomer?.id) return
    setIsSavingDebt(true)
    try {
      await addCustomerDebt({ customerId: debtCustomer.id, amount: parseFloat(newDebtAmount), note: newDebtNote })
      setDebtModalOpen(false)
      if (ledgerCustomer?.id === debtCustomer.id) await handleOpenLedger(debtCustomer)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر إضافة الدين')
    } finally { setIsSavingDebt(false) }
  }

  const handleDelete = async (c: Customer, force = false) => {
    if (!c.id) return
    const result = await deleteCustomer(c.id, force)
    if ('blocked' in result && result.blocked) {
      // Show the modal again — it already shows debt warning and force-delete button
      return
    }
    setDeleteConfirm(null)
  }

  // Open payment modal
  const handleOpenPayment = (c: Customer) => {
    setPaymentCustomer(c)
    setPaymentAmount(c.totalDebt > 0 ? c.totalDebt.toString() : '')
    setPaymentMethod('cash')
    setPaymentNote('سداد دفعة من الحساب')
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
      // If ledger is also open for this customer, refresh it
      if (ledgerCustomer?.id === paymentCustomer.id) {
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
    setLedgerModalOpen(true)
    setIsLoadingLedger(true)
    try {
      if (c.id) {
        const items = await getCustomerLedger(c.id)
        setLedgerItems(items)
      }
    } finally {
      setIsLoadingLedger(false)
    }
  }

  // Share ledger statement via WhatsApp
  const shareLedgerWhatsApp = (c: Customer) => {
    const phone = c.phone?.replace(/\D/g, '') || ''
    const today = new Date().toLocaleDateString('ar-EG', { dateStyle: 'medium' })

    let msg = `📋 *كشف حساب — ${c.name}*\n`
    msg += `المتجر: ${storeName}\n`
    msg += `📅 التاريخ: ${today}\n`
    msg += `--------------------------------\n`

    if (ledgerItems.length === 0) {
      msg += `لا توجد حركات مسجلة\n`
    } else {
      ledgerItems.slice(0, 10).forEach((item) => {
        const itemDate = item.date.toLocaleDateString('ar-EG')
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
    <div className="page-frame page-screen" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Top Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 14,
          padding: '12px 10px',
          textAlign: 'center',
          minHeight: 96,
        }}>
          <div style={{ fontSize: 20, marginBottom: 2 }}>💰</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--color-danger-light)', direction: 'ltr' }}>
            {formatCurrency(totalOutstandingDebt)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>إجمالي الديون</div>
        </div>

        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          padding: '12px 10px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, marginBottom: 2 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-warning-light)' }}>
            {indebtedCount}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>عليهم ديون</div>
        </div>

        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          padding: '12px 10px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, marginBottom: 2 }}>👥</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-primary-light)' }}>
            {customers.length}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>إجمالي العملاء</div>
        </div>
      </div>

      {/* Search Bar + Add Button */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(255,255,255,0.05)',
          border: '1.5px solid var(--color-border)',
          borderRadius: 50,
          padding: '10px 16px',
        }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <input
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-main)',
              fontSize: 14,
            }}
            placeholder="ابحث باسم العميل أو رقم هاتفه..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 16 }}
            >
              ✕
            </button>
          )}
        </div>

        <button
          onClick={handleOpenAdd}
          style={{
            height: 48,
            padding: '0 18px',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            border: 'none',
            borderRadius: 14,
            color: 'white',
            fontWeight: 800,
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'var(--font-main)',
            boxShadow: '0 4px 16px rgba(59,130,246,0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
          }}
        >
          <span>+</span>
          <span>عميل جديد</span>
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { key: 'all' as const, label: 'جميع العملاء' },
          { key: 'debt' as const, label: 'عليهم ديون فقط' },
          { key: 'settled' as const, label: 'حسابات مسددة' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '7px 14px',
              borderRadius: 50,
              border: filter === f.key ? '1.5px solid rgba(59,130,246,0.6)' : '1px solid var(--color-border)',
              background: filter === f.key ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
              color: filter === f.key ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--font-main)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Customers List */}
      {customers.length === 0 ? (
        <div className="empty-state" style={{ padding: '40px 10px' }}>
          <div className="empty-icon">👥</div>
          <p style={{ fontSize: 16, fontWeight: 700 }}>
            {search ? 'لا توجد نتائج بحث' : 'لا يوجد عملاء مضافين بعد'}
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
            {search ? 'جرّب كتابة اسم آخر' : 'اضغط زر "عميل جديد" لإضافة عميل وتتبع ديونه'}
          </p>
        </div>
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
                    onClick={() => handleOpenPayment(c)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: '1px solid rgba(16,185,129,0.5)',
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      boxShadow: '0 6px 18px rgba(16,185,129,0.22)',
                    }}
                  >
                    <span>💰</span>
                    <span>سداد دفعة</span>
                  </button>

                  <button
                    onClick={() => handleOpenLedger(c)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: 'rgba(59,130,246,0.15)',
                      border: '1px solid rgba(59,130,246,0.3)',
                      color: 'var(--color-primary-light)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <span>📜</span>
                    <span>كشف حساب</span>
                  </button>

                  <button
                    onClick={() => handleOpenAddDebt(c)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      color: 'var(--color-danger-light)',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-main)',
                    }}
                  >
                    + إضافة دين
                  </button>

                  <button
                    onClick={() => handleOpenEdit(c)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--color-border)',
                      cursor: 'pointer',
                      fontSize: 15,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="تعديل العميل"
                  >
                    ✏️
                  </button>

                  <button
                    onClick={() => setDeleteConfirm(c)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      cursor: 'pointer',
                      fontSize: 15,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="حذف العميل"
                  >
                    🗑️
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
              onClick={handleSaveCustomer}
              style={{
                flex: 1,
                padding: '11px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                border: 'none',
                color: 'white',
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
              }}
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
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 12, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            سيُضاف المبلغ إلى دين العميل ويظهر كحركة مستقلة في كشف الحساب.
          </div>
          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5, fontWeight: 700 }}>المبلغ *</label>
            <input type="number" min="0.01" step="0.01" placeholder="0.00 ₪" value={newDebtAmount} onChange={(event) => setNewDebtAmount(event.target.value)} className="input" style={{ direction: 'ltr', textAlign: 'right' }} />
          </div>
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
                {[
                  { id: 'cash' as PaymentMethod, label: 'نقداً (كاش) 💵' },
                  { id: 'jawwal_pay' as PaymentMethod, label: 'جوال باي 📱' },
                  { id: 'palpay' as PaymentMethod, label: 'بال باي 💳' },
                  { id: 'bop' as PaymentMethod, label: 'بنك فلسطين 🏦' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: paymentMethod === m.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: paymentMethod === m.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                      color: paymentMethod === m.id ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                    }}
                  >
                    {m.label}
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
        onClose={() => setLedgerModalOpen(false)}
        title={ledgerCustomer ? `كشف حساب: ${ledgerCustomer.name}` : 'كشف الحساب'}
        type="sheet"
      >
        {ledgerCustomer && (
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
                  onClick={() => handleOpenPayment(ledgerCustomer)}
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
                onClick={() => window.print()}
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
                onClick={() => downloadStatementCSV(ledgerCustomer, ledgerItems)}
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
                <span>⬇️ تصدير CSV</span>
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
                  {ledgerItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        background: 'var(--color-bg-card)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 12,
                        padding: '12px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
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
                          {item.date.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
                          {item.note && ` • ${item.note}`}
                        </p>
                      </div>

                      <div style={{ textAlign: 'left' }}>
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
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
                    حذفه مع ديونه سيمسح جميع فواتيره وسنداته من السجلات نهائياً.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(null)}
                    style={{
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
                    إلغاء (يُنصح بتصفير الديون أولاً)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(deleteConfirm, true)}
                    style={{
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
                    🗑️ حذف مع جميع ديونه وفواتيره
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
