import { useEffect, useState } from 'react'
import { usePurchases, addPurchaseInvoice, deletePurchase, updatePurchaseMeta } from '../hooks/usePurchases'
import { useSupplierNames } from '../hooks/useSuppliers'
import { useProducts } from '../hooks/useProducts'
import { useAccountBalances } from '../hooks/useInvoices'
import { getPaymentMethodName, PAYMENT_METHODS, type PaymentMethod, type PaymentType, type Product } from '../db/db'
import { formatCurrency } from '../utils/currency'
import { GRAMS_PER_KG, averageCostPerKg, getProductType, stockLabel } from '../utils/units'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { BarcodeScanner } from '../components/ui/BarcodeScanner'
import { ProductForm } from '../components/products/ProductForm'
import { CustomSelect } from '../components/ui/CustomSelect'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { Modal } from '../components/ui/Modal'
import { SupplierPaymentModal } from '../components/purchases/SupplierPaymentModal'
import { PurchasePrint } from '../components/purchases/PurchasePrint'
import { useStoreInfo } from '../components/invoice/InvoicePrint'

export function PurchasesPage() {
  const purchases = usePurchases()
  const allProducts = useProducts()
  const balances = useAccountBalances()
  const supplierNames = useSupplierNames()

  const [purchaseToDelete, setPurchaseToDelete] = useState<number | null>(null)
  const [deletingPurchase, setDeletingPurchase] = useState(false)
  const [payingPurchase, setPayingPurchase] = useState<import('../db/db').Purchase | null>(null)
  const [selectedPurchase, setSelectedPurchase] = useState<import('../db/db').Purchase | null>(null)
  const [detailMode, setDetailMode] = useState<'view' | 'edit'>('view')
  const [printPurchase, setPrintPurchase] = useState<import('../db/db').Purchase | null>(null)
  const [editSupplier, setEditSupplier] = useState('')
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('')
  const [editDateStr, setEditDateStr] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('cash')
  const [savingMeta, setSavingMeta] = useState(false)
  const [metaError, setMetaError] = useState('')
  const storeInfo = useStoreInfo()

  useEffect(() => {
    const clear = () => setPrintPurchase(null)
    window.addEventListener('afterprint', clear)
    return () => window.removeEventListener('afterprint', clear)
  }, [])

  const openPurchaseDetail = (p: import('../db/db').Purchase) => {
    setSelectedPurchase(p)
    setDetailMode('view')
    setEditSupplier(p.supplierName || '')
    setEditInvoiceNumber(p.invoiceNumber || '')
    const d = new Date(p.date)
    const pad = (n: number) => String(n).padStart(2, '0')
    setEditDateStr(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
    setEditNotes(p.notes || '')
    setEditPaymentMethod(p.paymentMethod || 'cash')
    setMetaError('')
  }

  const handlePrintPurchase = (p: import('../db/db').Purchase) => {
    setPrintPurchase(p)
    setTimeout(() => window.print(), 120)
  }

  const handleSaveMeta = async () => {
    if (!selectedPurchase?.id) return
    setSavingMeta(true)
    setMetaError('')
    try {
      const t = editDateStr ? new Date(editDateStr) : undefined
      if (editDateStr && !Number.isFinite(t!.getTime())) throw new Error('تاريخ غير صالح')
      await updatePurchaseMeta(selectedPurchase.id, {
        supplierName: editSupplier,
        invoiceNumber: editInvoiceNumber,
        date: t,
        notes: editNotes,
        paymentMethod: editPaymentMethod,
      })
      setDetailMode('view')
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'تعذر حفظ التعديلات')
    } finally {
      setSavingMeta(false)
    }
  }

  const [activeTab, setActiveTab] = useState<'history' | 'new'>('history')
  const [search, setSearch] = useState('')

  // New Invoice Form state
  const [supplierName, setSupplierName] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType>('cash')
  const [partialPaidAmount, setPartialPaidAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 16))
  const [notes, setNotes] = useState('')
  const [selectedItems, setSelectedItems] = useState<
    Array<{ product: Product; quantity: number; costPrice: number }>
  >([])

  // Product selection modal/picker
  const [productSearch, setProductSearch] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // New product inline creation
  const [newProductModalOpen, setNewProductModalOpen] = useState(false)
  const [newProductInitialBarcode, setNewProductInitialBarcode] = useState('')
  const [newProductInitialName, setNewProductInitialName] = useState('')

  const handleOpenNewProduct = (initialText = '') => {
    const text = initialText.trim()
    if (text) {
      if (/^\d{3,}$/.test(text)) {
        setNewProductInitialBarcode(text)
        setNewProductInitialName('')
      } else {
        setNewProductInitialBarcode('')
        setNewProductInitialName(text)
      }
    } else {
      setNewProductInitialBarcode('')
      setNewProductInitialName('')
    }
    setNewProductModalOpen(true)
  }

  // Filtered purchases
  const filteredPurchases = purchases.filter((p) => {
    if (!search) return true
    const term = search.toLowerCase()
    const matchSupplier = p.supplierName?.toLowerCase().includes(term)
    const matchInv = p.invoiceNumber?.toLowerCase().includes(term)
    const matchItem = p.items.some((it) => it.productName.toLowerCase().includes(term) || it.barcode.includes(term))
    return matchSupplier || matchInv || matchItem
  })

  // Total stats
  const totalSpent = purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0)
  const totalItemsCount = purchases.reduce(
    (sum, p) => sum + p.items.reduce((iSum, it) => iSum + (it.unit === 'kg' ? it.quantity / GRAMS_PER_KG : it.quantity), 0),
    0
  )

  const handleAddProductToInvoice = (p: Product) => {
    // الخدمات بلا مخزون — لا تُورَّد
    if (getProductType(p) === 'service') {
      setFormError('الخدمات بلا مخزون ولا تحتاج توريد')
      return
    }
    const existingIndex = selectedItems.findIndex((it) => it.product.id === p.id)
    if (existingIndex >= 0) {
      const updated = [...selectedItems]
      updated[existingIndex].quantity += 1
      setSelectedItems(updated)
    } else {
      setSelectedItems([...selectedItems, { product: p, quantity: 1, costPrice: p.costPrice }])
    }
  }

  const handleUpdateItemQty = (index: number, qty: number) => {
    if (qty <= 0) {
      setSelectedItems(selectedItems.filter((_, i) => i !== index))
      return
    }
    const updated = [...selectedItems]
    updated[index].quantity = qty
    setSelectedItems(updated)
  }

  const handleUpdateItemCost = (index: number, cost: number) => {
    const updated = [...selectedItems]
    updated[index].costPrice = Math.max(0, cost)
    setSelectedItems(updated)
  }

  const handleRemoveItem = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index))
  }

  const invoiceTotal = selectedItems.reduce(
    (sum, it) => sum + it.quantity * it.costPrice,
    0
  )

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (selectedItems.length === 0) {
      setFormError('يرجى إضافة صنف واحد على الأقل لفاتورة الشراء')
      return
    }

    let paid = invoiceTotal
    let debt = 0
    if (paymentType === 'debt') {
      paid = 0
      debt = invoiceTotal
    } else if (paymentType === 'partial') {
      const parsed = parseFloat(partialPaidAmount) || 0
      paid = Math.min(invoiceTotal, Math.max(0, parsed))
      debt = Math.max(0, invoiceTotal - paid)
    }

    setSubmitting(true)
    try {
      await addPurchaseInvoice({
        supplierName: supplierName.trim(),
        invoiceNumber: invoiceNumber.trim(),
        items: selectedItems.map((it) => ({
          productId: it.product.id!,
          // الموزون يُدخل بالكيلو ويُخزن بالجرام
          quantity: getProductType(it.product) === 'weighted' ? Math.round(it.quantity * GRAMS_PER_KG) : it.quantity,
          costPrice: it.costPrice,
        })),
        paymentMethod: paymentType === 'debt' ? undefined : paymentMethod,
        paidAmount: paid,
        debtAmount: debt,
        paymentType,
        date: dateStr ? new Date(dateStr) : new Date(),
        notes: notes.trim(),
      })

      // Reset
      setSelectedItems([])
      setSupplierName('')
      setInvoiceNumber('')
      setPaymentType('cash')
      setPartialPaidAmount('')
      setNotes('')
      setDateStr(new Date().toISOString().slice(0, 16))
      setActiveTab('history')
    } catch (err) {
      console.error(err)
      setFormError('حدث خطأ أثناء حفظ فاتورة المشتريات')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-frame">
      {/* Top Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          padding: '12px 10px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, marginBottom: 4 }}>📥</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-primary-light)' }}>
            {purchases.length}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
            عمليات الشراء
          </div>
        </div>

        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          padding: '12px 10px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, marginBottom: 4 }}>📦</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-purple)' }}>
            {totalItemsCount}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
            إجمالي القطع المشتراة
          </div>
        </div>

        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          padding: '12px 10px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, marginBottom: 4 }}>💰</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#f59e0b' }}>
            {formatCurrency(totalSpent)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
            إجمالي المشتريات
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        background: 'var(--color-btn-ghost-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        padding: 4,
        marginBottom: 12,
        gap: 4,
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: 10,
            border: 'none',
            background: activeTab === 'history' ? 'var(--brand-gradient)' : 'transparent',
            color: activeTab === 'history' ? '#fff' : 'var(--color-text-secondary)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          📜 سجل المشتريات ({purchases.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('new')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: 10,
            border: 'none',
            background: activeTab === 'new' ? 'var(--brand-gradient)' : 'transparent',
            color: activeTab === 'new' ? '#fff' : 'var(--color-text-secondary)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          ➕ فاتورة شراء جديدة
        </button>
      </div>

      {/* TAB 1: HISTORY */}
      {activeTab === 'history' && (
        <div>
          {/* Search bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 50,
            padding: '10px 16px',
            marginBottom: 16,
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
              placeholder="ابحث باسم الصنف، المورد، رقم الفاتورة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
              >
                ✕
              </button>
            )}
          </div>

          {filteredPurchases.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              <p style={{ fontSize: 16, fontWeight: 700 }}>
                {search ? 'لا توجد فواتير مطابقة لبحثك' : 'لا توجد فواتير مشتريات مسجلة بعد'}
              </p>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {search ? 'جرّب كلمة بحث أخرى' : 'اضغط على "فاتورة شراء جديدة" أو زر "توريد" بجانب أي صنف في صفحة المنتجات'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredPurchases.map((purchase) => {
                const dateObj = new Date(purchase.date)
                const dateFormatted = dateObj.toLocaleDateString('ar-EG', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
                const timeFormatted = dateObj.toLocaleTimeString('ar-EG', {
                  hour: '2-digit',
                  minute: '2-digit',
                })

                return (
                  <div
                    key={purchase.id}
                    style={{
                      background: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 14,
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>📥</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                            {purchase.supplierName || 'شراء عام'}
                          </span>
                          {purchase.invoiceNumber && (
                            <span style={{
                              background: 'rgba(255,255,255,0.06)',
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              color: 'var(--color-text-muted)',
                            }}>
                              رقم #{purchase.invoiceNumber}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                          📅 {dateFormatted} — 🕒 {timeFormatted}
                        </div>
                      </div>

                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-primary-light)' }}>
                          {formatCurrency(purchase.totalAmount)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                          {purchase.paymentType === 'debt'
                            ? 'آجل بالكامل 📝'
                            : purchase.paymentType === 'partial'
                              ? `مدفوع ${formatCurrency(purchase.paidAmount ?? 0)} (دين ${formatCurrency(purchase.debtAmount ?? 0)})`
                              : getPaymentMethodName(purchase.paymentMethod)}
                        </div>
                      </div>
                    </div>

                    {/* Items List */}
                    <div style={{
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}>
                      {purchase.items.map((it, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: 13,
                            borderBottom: idx < purchase.items.length - 1 ? '1px dashed var(--color-border)' : 'none',
                            paddingBottom: idx < purchase.items.length - 1 ? 6 : 0,
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                              {it.productName}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginRight: 8 }}>
                              (المخزون: {it.unit === 'kg' ? `${Math.round((it.oldQuantity / GRAMS_PER_KG) * 1000) / 1000} كغ` : it.oldQuantity} ➔ <strong style={{ color: 'var(--color-success-light)' }}>{it.unit === 'kg' ? `${Math.round((it.newQuantity / GRAMS_PER_KG) * 1000) / 1000} كغ` : it.newQuantity}</strong>)
                            </span>
                          </div>

                          <div style={{ textAlign: 'left' }}>
                            <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                              +{it.unit === 'kg' ? `${Math.round((it.quantity / GRAMS_PER_KG) * 1000) / 1000} كغ` : `${it.quantity} حبة`}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginRight: 6 }}>
                              × {it.costPrice.toFixed(2)} ₪ = {it.totalCost.toFixed(2)} ₪
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {purchase.notes && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                        💬 ملاحظات: {purchase.notes}
                      </div>
                    )}

                    {purchase.supplierPayments && purchase.supplierPayments.length > 0 && (
                      <div style={{
                        fontSize: 11,
                        color: 'var(--color-text-muted)',
                        background: 'rgba(255,255,255,0.02)',
                        padding: '6px 10px',
                        borderRadius: 8,
                      }}>
                        <span>سجل الدفعات: </span>
                        {purchase.supplierPayments.map((p, pIdx) => (
                          <span key={pIdx} style={{ marginRight: 6 }}>
                            [{new Date(p.date).toLocaleDateString('ar-EG')}: {formatCurrency(p.amount)}]
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => openPurchaseDetail(purchase)}
                        style={{
                          background: 'var(--color-primary-glow)',
                          border: '1px solid var(--color-border-active)',
                          color: 'var(--color-primary-light)',
                          borderRadius: 8,
                          padding: '5px 12px',
                          fontSize: 12.5,
                          fontWeight: 800,
                          cursor: 'pointer',
                          fontFamily: 'var(--font-main)',
                        }}
                      >
                        👁️ عرض / طباعة / تعديل
                      </button>
                      {(purchase.debtAmount ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setPayingPurchase(purchase)}
                          style={{
                            background: 'var(--color-primary-glow)',
                            border: '1px solid var(--color-border-active)',
                            color: 'var(--color-primary-light)',
                            borderRadius: 8,
                            padding: '5px 12px',
                            fontSize: 12.5,
                            fontWeight: 800,
                            cursor: 'pointer',
                            fontFamily: 'var(--font-main)',
                          }}
                        >
                          💳 سداد دفعة للمورد ({formatCurrency(purchase.debtAmount || 0)})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (purchase.id) setPurchaseToDelete(purchase.id)
                        }}
                        style={{
                          background: 'rgba(239,68,68,0.1)',
                          border: 'none',
                          color: 'var(--color-danger-light)',
                          borderRadius: 8,
                          padding: '5px 12px',
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'var(--font-main)',
                        }}
                      >
                        🗑️ حذف من الأرشيف
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: NEW PURCHASE INVOICE */}
      {activeTab === 'new' && (
        <form onSubmit={handleSaveInvoice} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {formError && (
            <div style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              padding: '10px 14px',
              color: 'var(--color-danger-light)',
              fontSize: 13,
              fontWeight: 700,
            }}>
              ⚠ {formError}
            </div>
          )}

          {/* Supplier & Invoice metadata */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 14,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
              1. بيانات الشراء والمورد
            </h3>

            <div className="form-grid-two">
              <div>
                <Input
                  label="اسم المورد أو الشركة"
                  placeholder="مثال: شركة سنقرط، شركة المشروبات..."
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                />
                {supplierNames.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginTop: 6 }}>
                    {supplierNames.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSupplierName(n)}
                        style={{
                          flexShrink: 0, padding: '4px 12px', borderRadius: 50,
                          border: supplierName.trim() === n ? '1px solid transparent' : '1px solid var(--color-border)',
                          background: supplierName.trim() === n ? 'var(--brand-gradient)' : 'var(--color-bg-card)',
                          color: supplierName.trim() === n ? '#fff' : 'var(--color-text-muted)',
                          fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-main)',
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Input
                label="رقم فاتورة المورد (اختياري)"
                placeholder="مثال: INV-1049"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>

            <div className="form-grid-two">
              <div>
                <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>
                  التاريخ والوقت
                </label>
                <input
                  type="datetime-local"
                  className="input"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  style={{ width: '100%', fontSize: 13 }}
                />
              </div>

              <div>
                <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>
                  حالة الدفع للمورد *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {[
                    { id: 'cash' as PaymentType, label: '💵 نقداً كاش' },
                    { id: 'debt' as PaymentType, label: '📝 آجل (دين)' },
                    { id: 'partial' as PaymentType, label: '⚖️ جزئي' },
                  ].map((t) => {
                    const active = paymentType === t.id
                    const activeStyle =
                      t.id === 'debt'
                        ? { border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.15)', color: 'var(--color-danger-light)' }
                        : t.id === 'partial'
                          ? { border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.12)', color: 'var(--color-warning-light)' }
                          : { border: '1px solid transparent', background: 'var(--brand-gradient)', color: '#fff' }
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setPaymentType(t.id)}
                        style={{
                          padding: '8px 4px',
                          borderRadius: 8,
                          border: active ? activeStyle.border : '1px solid var(--color-border)',
                          background: active ? activeStyle.background : 'var(--color-bg-card)',
                          color: active ? activeStyle.color : 'var(--color-text-secondary)',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'var(--font-main)',
                        }}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* If partial, input for paid amount */}
            {paymentType === 'partial' && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                background: 'rgba(255,255,255,0.03)',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--color-border)',
              }}>
                <Input
                  label="المبلغ المدفوع كاش ₪ *"
                  placeholder="0.00"
                  value={partialPaidAmount}
                  onChange={(e) => setPartialPaidAmount(e.target.value)}
                  inputMode="decimal"
                  required
                />
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>المتبقي دين للمورد:</span>
                  <strong style={{ fontSize: 15, color: 'var(--color-danger-light)', marginTop: 2 }}>
                    {formatCurrency(Math.max(0, invoiceTotal - (parseFloat(partialPaidAmount) || 0)))}
                  </strong>
                </div>
              </div>
            )}

            {/* Payment Method (only if there is cash paid) */}
            {paymentType !== 'debt' && (
              <div>
                <CustomSelect<PaymentMethod>
                  label="محفظة / صندوق الدفع"
                  value={paymentMethod}
                  onChange={(val) => setPaymentMethod(val)}
                  options={PAYMENT_METHODS.map((m) => ({
                    value: m.id,
                    label: `${m.icon} ${m.label}`,
                    description: `الرصيد المتاح: ${formatCurrency(balances[m.id])}`,
                  }))}
                />
                <div style={{
                  marginTop: 6,
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--color-text-muted)'
                }}>
                  <span>الخصم من المحفظة:</span>
                  <strong style={{
                    color: balances[paymentMethod] < (paymentType === 'cash' ? invoiceTotal : (parseFloat(partialPaidAmount) || 0))
                      ? 'var(--color-danger-light)'
                      : 'var(--color-success-light)'
                  }}>
                    {formatCurrency(paymentType === 'cash' ? invoiceTotal : (parseFloat(partialPaidAmount) || 0))}
                  </strong>
                </div>
              </div>
            )}
          </div>

          {/* Product Picker */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 14,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
              2. اختيار الأصناف للشراء
            </h3>

            {/* Search / Scan bar / Add Product button */}
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255,255,255,0.05)',
                border: '1.5px solid var(--color-border)',
                borderRadius: 12,
                padding: '8px 8px',
              }}>
                <span>🔍</span>
                <input
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-main)',
                    fontSize: 13,
                  }}
                  placeholder="ابحث عن صنف لإضافته للفاتورة..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => setProductSearch('')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: 2,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                title="مسح باركود بالكاميرا"
                style={{
                  width: 44,
                  height: 44,
                  background: 'rgba(59,130,246,0.15)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontSize: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                📷
              </button>

              <button
                type="button"
                onClick={() => handleOpenNewProduct(productSearch)}
                title="إضافة صنف جديد تماماً إلى المخزن وإدراجه بالفاتورة"
                style={{
                  height: 44,
                  padding: '0 4px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: 'var(--color-success-light)',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-main)',
                }}
              >
                <span>➕</span>
                <span>جديد</span>
              </button>
            </div>

            {/* Quick search suggestions — تظهر دائماً: الكل عند عدم البحث */}
            {(() => {
              const term = productSearch.trim().toLowerCase()
              const matches = allProducts
                .filter((p) =>
                  getProductType(p) !== 'service' && (
                    !term ||
                    p.name.toLowerCase().includes(term) ||
                    p.barcode.includes(productSearch)
                  )
                )
                .slice(0, 8)
              return (
                <div style={{
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                  maxHeight: 240,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                }}>
                  {matches.length === 0 ? (
                    <div style={{ padding: '14px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                      لا توجد أصناف مطابقة{term ? ` لـ "${productSearch}"` : ''}
                    </div>
                  ) : (
                    matches.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          handleAddProductToInvoice(p)
                          setProductSearch('')
                        }}
                        style={{
                          padding: '10px 14px',
                          border: 'none',
                          borderBottom: '1px solid var(--color-border)',
                          background: 'transparent',
                          color: 'var(--color-text-primary)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                          textAlign: 'right',
                          fontFamily: 'var(--font-main)',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                            المخزون الحالي: {stockLabel(p)} | تكلفة: {p.costPrice.toFixed(2)} ₪{getProductType(p) === 'weighted' ? '/كغ' : ''}
                          </div>
                        </div>
                        <span style={{ color: 'var(--color-primary-light)', fontWeight: 800, fontSize: 14 }}>
                          + إضافة
                        </span>
                      </button>
                    ))
                  )}

                  {/* Option to add new product */}
                  {term && (
                    <button
                      type="button"
                      onClick={() => handleOpenNewProduct(productSearch)}
                      style={{
                        padding: '12px 14px',
                        border: 'none',
                        background: 'rgba(16, 185, 129, 0.1)',
                        color: 'var(--color-success-light)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: 13,
                        fontFamily: 'var(--font-main)',
                      }}
                    >
                      <span>✨ غير موجود في المخزن؟ اضغط هنا لإنشاء "{productSearch}" وإدراجه</span>
                    </button>
                  )}
                </div>
              )
            })()}

            {/* Selected Items Table */}
            {selectedItems.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '24px',
                color: 'var(--color-text-muted)',
                fontSize: 13,
                border: '1px dashed var(--color-border)',
                borderRadius: 10,
              }}>
                لم تقم بإضافة أي أصناف بعد. ابحث في الحقل أعلاه لإضافة الأصناف المشتراة.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedItems.map((item, idx) => {
                  const isWeighted = getProductType(item.product) === 'weighted'
                  // quantity هنا بوحدات العرض (قطع أو كغ)
                  const addedBase = isWeighted ? Math.round(item.quantity * GRAMS_PER_KG) : item.quantity
                  const newQty = item.product.quantity + addedBase
                  const subtotal = item.quantity * item.costPrice
                  const projectedAvg = item.quantity > 0
                    ? averageCostPerKg(
                      isWeighted ? item.product.quantity / GRAMS_PER_KG : item.product.quantity,
                      Number(item.product.costPrice) || 0,
                      item.quantity,
                      item.costPrice
                    )
                    : Number(item.product.costPrice) || 0

                  const fmtStock = (base: number) =>
                    isWeighted ? `${Math.round((base / GRAMS_PER_KG) * 1000) / 1000} كغ` : String(base)

                  return (
                    <div
                      key={idx}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 12,
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>{item.product.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                            المخزون: {fmtStock(item.product.quantity)} ➔ <strong style={{ color: 'var(--color-success-light)' }}>{fmtStock(newQty)}</strong>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          style={{
                            background: 'rgba(239,68,68,0.1)',
                            border: 'none',
                            color: 'var(--color-danger-light)',
                            borderRadius: 8,
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          ✕ إزالة
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>
                            {isWeighted ? 'الكمية المضافة (كغ)' : 'الكمية المضافة'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step={isWeighted ? '0.1' : '1'}
                            value={item.quantity}
                            onChange={(e) => handleUpdateItemQty(idx, parseFloat(e.target.value) || 0)}
                            className="input"
                            style={{ height: 38, padding: '4px 8px', fontSize: 13, fontWeight: 700 }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>
                            {isWeighted ? 'تكلفة الكيلو ₪' : 'سعر التكلفة ₪'}
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={item.costPrice}
                            onChange={(e) => handleUpdateItemCost(idx, parseFloat(e.target.value) || 0)}
                            className="input"
                            style={{ height: 38, padding: '4px 8px', fontSize: 13, fontWeight: 700 }}
                          />
                        </div>

                        <div style={{ textAlign: 'left', minWidth: 80 }}>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>الإجمالي</div>
                          <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--color-primary-light)' }}>
                            {subtotal.toFixed(2)} ₪
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                            متوسط جديد: {projectedAvg.toFixed(2)} ₪
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Total Invoice Card */}
                <div style={{
                  background: 'rgba(59,130,246,0.12)',
                  border: '1.5px solid rgba(59,130,246,0.3)',
                  borderRadius: 12,
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>إجمالي فاتورة الشراء</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginRight: 8 }}>
                        ({selectedItems.length} أصناف)
                      </span>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--color-primary-light)' }}>
                      {formatCurrency(invoiceTotal)}
                    </div>
                  </div>

                  {invoiceTotal > 0 && (
                    <div style={{
                      paddingTop: 8,
                      borderTop: '1px dashed rgba(59,130,246,0.25)',
                      fontSize: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      color: 'var(--color-text-secondary)',
                    }}>
                      <span>
                        💳 سيتم خصم المبلغ من: <strong>{getPaymentMethodName(paymentMethod)}</strong>
                      </span>
                      <span>
                        الرصيد المتبقي المتوقع: <strong style={{
                          color: (balances[paymentMethod] - invoiceTotal) < 0 ? 'var(--color-danger-light)' : 'var(--color-success-light)'
                        }}>
                          {formatCurrency(balances[paymentMethod] - invoiceTotal)}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 14,
            padding: '16px',
          }}>
            <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>
              ملاحظات الفاتورة (اختياري)
            </label>
            <input
              className="input"
              placeholder="مثال: وصول شحنة صباحية، بضاعة كرتونة..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            variant="primary"
            full
            loading={submitting}
            style={{ height: 50, borderRadius: 14, fontSize: 16 }}
          >
            ✓ حفظ فاتورة الشراء وتحديث المخزون
          </Button>
        </form>
      )}

      {/* Barcode Scanner */}
      <BarcodeScanner
        open={scannerOpen}
        onDetected={(code) => {
          setScannerOpen(false)
          const found = allProducts.find((p) => p.barcode === code)
          if (found) {
            handleAddProductToInvoice(found)
          } else {
            handleOpenNewProduct(code)
          }
        }}
        onClose={() => setScannerOpen(false)}
      />

      {/* Product Form Modal for adding brand-new products directly */}
      <ProductForm
        open={newProductModalOpen}
        onClose={() => {
          setNewProductModalOpen(false)
          setNewProductInitialBarcode('')
          setNewProductInitialName('')
        }}
        initialBarcode={newProductInitialBarcode}
        initialName={newProductInitialName}
        defaultQuantity="0"
        onSaved={(newProduct) => {
          handleAddProductToInvoice(newProduct)
          setProductSearch('')
          setNewProductInitialBarcode('')
          setNewProductInitialName('')
        }}
      />

      {/* Delete Purchase Invoice Confirmation Modal */}
      <ConfirmModal
        open={purchaseToDelete !== null}
        onClose={() => setPurchaseToDelete(null)}
        onConfirm={async () => {
          if (!purchaseToDelete) return
          setDeletingPurchase(true)
          try {
            await deletePurchase(purchaseToDelete)
            setPurchaseToDelete(null)
          } catch (err) {
            console.error(err)
            alert('حدث خطأ أثناء حذف سجل الشراء')
          } finally {
            setDeletingPurchase(false)
          }
        }}
        loading={deletingPurchase}
        title="حذف سجل الشراء"
        icon="📦"
        message="هل أنت متأكد من حذف سجل هذه الفاتورة من الأرشيف؟"
        subMessage="سيتم حذف السجل المالي وخصم الكميات الموردة من المخزون تلقائياً."
        confirmText="تأكيد الحذف"
        cancelText="إلغاء"
      />

      {/* Supplier Debt Payment Modal */}
      {payingPurchase && (
        <SupplierPaymentModal
          open
          purchase={payingPurchase}
          onClose={() => setPayingPurchase(null)}
          onSuccess={() => setPayingPurchase(null)}
        />
      )}

      {/* Purchase Detail: view / print / edit */}
      {selectedPurchase && (
        <Modal
          open
          onClose={() => setSelectedPurchase(null)}
          title={detailMode === 'view' ? `فواتورة شراء #${selectedPurchase.invoiceNumber || selectedPurchase.id}` : '✏️ تعديل بيانات الفاتورة'}
          type="sheet"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', background: 'var(--color-btn-ghost-bg)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 4, gap: 4 }}>
              {([['view', '🧾 عرض وطباعة'], ['edit', '✏️ تعديل البيانات']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDetailMode(mode)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                    background: detailMode === mode ? 'var(--brand-gradient)' : 'transparent',
                    color: detailMode === mode ? '#fff' : 'var(--color-text-secondary)',
                    fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-main)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {detailMode === 'view' ? (
              <>
                <PurchasePrint purchase={selectedPurchase} store={storeInfo} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" style={{ flex: 2 }} onClick={() => handlePrintPurchase(selectedPurchase)}>
                    🖨️ طباعة الفاتورة
                  </button>
                  {(selectedPurchase.debtAmount || 0) > 0 && (
                    <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setPayingPurchase(selectedPurchase)}>
                      💳 سداد
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: 'var(--color-danger-light)' }}
                    onClick={() => {
                      if (selectedPurchase.id) {
                        setSelectedPurchase(null)
                        setPurchaseToDelete(selectedPurchase.id)
                      }
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </>
            ) : (
              <>
                {metaError && (
                  <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', color: 'var(--color-danger-light)', fontSize: 13, fontWeight: 600 }}>
                    ⚠ {metaError}
                  </div>
                )}
                <div className="input-wrap">
                  <label className="input-label">اسم المورد أو الشركة</label>
                  <input className="input" value={editSupplier} onChange={(e) => setEditSupplier(e.target.value)} placeholder="اسم المورد" />
                </div>
                <div className="form-grid-two">
                  <div className="input-wrap">
                    <label className="input-label">رقم فاتورة المورد</label>
                    <input className="input" value={editInvoiceNumber} onChange={(e) => setEditInvoiceNumber(e.target.value)} placeholder="اختياري" />
                  </div>
                  <div className="input-wrap">
                    <label className="input-label">التاريخ والوقت</label>
                    <input className="input" type="datetime-local" value={editDateStr} onChange={(e) => setEditDateStr(e.target.value)} style={{ width: '100%' }} />
                  </div>
                </div>
                <CustomSelect
                  label="طريقة الدفع (محفظة المبلغ المدفوع)"
                  value={editPaymentMethod}
                  onChange={(v) => setEditPaymentMethod(v as PaymentMethod)}
                  options={PAYMENT_METHODS.map((m) => ({ value: m.id, label: `${m.icon} ${m.label}` }))}
                />
                <div className="input-wrap">
                  <label className="input-label">ملاحظات</label>
                  <input className="input" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="اختياري" />
                </div>
                <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
                  التعديل للبيانات فقط — الأصناف والكميات والتكلفة لا تُمس (لحماية المخزون ومتوسط التكلفة).
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setDetailMode('view')}>رجوع</button>
                  <button type="button" className="btn btn-primary" style={{ flex: 2 }} onClick={handleSaveMeta} disabled={savingMeta}>
                    {savingMeta ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Hidden purchase print root */}
      <div id="purchase-print-root" aria-hidden="true">
        {printPurchase && <PurchasePrint purchase={printPurchase} store={storeInfo} />}
      </div>
    </div>
  )
}
