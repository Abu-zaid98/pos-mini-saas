import { useState, useMemo } from 'react'
import { useProducts, getProductByBarcode } from '../hooks/useProducts'
import { useCustomers, addCustomer } from '../hooks/useCustomers'
import { createSaleInvoice, type CreateSaleInput } from '../hooks/useInvoices'
import { useCategories } from '../hooks/useCategories'
import { useCart } from '../hooks/useCart'
import { BarcodeScanner } from '../components/ui/BarcodeScanner'
import { CategoryManagerModal } from '../components/products/CategoryManagerModal'
import { ProductForm } from '../components/products/ProductForm'
import { Modal } from '../components/ui/Modal'
import { CustomSelect } from '../components/ui/CustomSelect'
import { formatCurrency } from '../utils/currency'
import {
  type Invoice,
  type PaymentType,
  type PaymentMethod,
  type DiscountType,
  type Product,
  type SaleUnit,
  getPaymentMethodName,
} from '../db/db'
import {
  GRAMS_PER_KG,
  formatLineDiscount,
  formatLineQty,
  formatServiceDuration,
  getItemUnit,
  getProductType,
  isExpired,
  isNearExpiry,
  isOutOfStock,
  lineDiscountAmount,
  lineTotal,
  packPieces,
  perPieceQty,
  priceLabel,
  stockLabel,
  unitStep,
  unitShort,
} from '../utils/units'
import { InvoicePrint, usePrintInvoice, useStoreInfo } from '../components/invoice/InvoicePrint'

export function SalePage() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'cart'>('catalog')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('')

  // Persistent cart hook
  const { cart, addToCart, updateQty, updatePack, setItemPieces, setItemPrice, setItemDiscount, setDirectQty, removeFromCart, clearCart } = useCart()

  // Inline per-line discount editor (key = productId-unit-pack)
  const [discLineKey, setDiscLineKey] = useState<string | null>(null)
  const [discType, setDiscType] = useState<'percent' | 'fixed'>('percent')
  const [discValue, setDiscValue] = useState('')

  // Dynamic categories
  const categoriesList = useCategories()
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)

  // Map category icons
  const catIconMap = useMemo(() => {
    const map: Record<string, string> = { 'الكل': '🏷️' }
    categoriesList.forEach((c) => {
      map[c.name] = c.icon
    })
    return map
  }, [categoriesList])

  // Discounts
  const [discountType, setDiscountType] = useState<DiscountType>('fixed')
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [showDiscountModal, setShowDiscountModal] = useState(false)

  // Checkout modal
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [paymentType, setPaymentType] = useState<PaymentType>('cash')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [partialPaidAmount, setPartialPaidAmount] = useState<string>('')
  const [saleNote, setSaleNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Quick customer modal
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false)
  const [newCustName, setNewCustName] = useState('')
  const [newCustPhone, setNewCustPhone] = useState('')

  // Scanner & alerts
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [scannerFeedback, setScannerFeedback] = useState<{ text: string; success: boolean } | null>(null)

  // Success Receipt modal
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null)

  // Weight picker for weighted products (kg/g)
  const [weightProduct, setWeightProduct] = useState<Product | null>(null)
  const [weightQty, setWeightQty] = useState('0.5')
  const [weightUnit, setWeightUnit] = useState<'kg' | 'g'>('kg')
  // عدد القطع بنفس الوزن: 3 × 100غ
  const [weightPieces, setWeightPieces] = useState(1)
  // وزنات متعددة مختلفة في نفس العملية: 3×100غ + 4×250غ + 1كغ
  const [weighings, setWeighings] = useState<Array<{ qty: number; unit: 'kg' | 'g'; pieces: number }>>([])

  const openWeightPicker = (p: Product) => {
    setWeightProduct(p)
    setWeightQty('0.5')
    setWeightUnit('kg')
    setWeightPieces(1)
    setWeighings([])
  }

  // Open-price service: cashier enters the price at sale time
  const [priceService, setPriceService] = useState<Product | null>(null)
  const [servicePrice, setServicePrice] = useState('')

  // Quick-add product without leaving the sale screen
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const printInvoice = usePrintInvoice()
  const storeInfo = useStoreInfo()

  const products = useProducts(search, activeCategory === 'الكل' ? '' : activeCategory)
  const customers = useCustomers('', 'all')

  const resetSaleState = () => {
    clearCart()
    setDiscountValue(0)
    setSaleNote('')
    setSelectedCustomerId(null)
    setPartialPaidAmount('')
    setPaymentType('cash')
    setPaymentMethod('cash')
  }

  // Add by type: goods +1 piece, weighted → weight picker,
  // service fixed → +1, service open-price → price prompt
  // Expired items are blocked from sale
  const handleProductClick = (p: Product) => {
    if (isExpired(p)) {
      alert('هذا الصنف منتهي الصلاحية ولا يمكن بيعه')
      return
    }
    const t = getProductType(p)
    if (t === 'weighted') {
      openWeightPicker(p)
      return
    }
    if (t === 'service' && p.openPrice) {
      setPriceService(p)
      setServicePrice(p.salePrice > 0 ? String(p.salePrice) : '')
      return
    }
    addToCart({ ...p, kind: t, amount: 1, packOptions: p.packs, durationMinutes: p.durationMinutes })
  }

  const confirmServicePrice = () => {
    if (!priceService) return
    const price = Math.max(0, parseFloat(servicePrice) || 0)
    // كل سعر متفق عليه سطر مستقل — حتى لا يندمج بسعر مختلف سابق
    addToCart({ ...priceService, kind: 'service', amount: 1, unitPrice: price, durationMinutes: priceService.durationMinutes, unique: true })
    setPriceService(null)
    setServicePrice('')
  }

  const weightUnitPrice = (p: Product, unit: 'kg' | 'g') =>
    unit === 'kg' ? p.salePrice : p.salePrice / GRAMS_PER_KG
  const weightUnitCost = (p: Product, unit: 'kg' | 'g') =>
    unit === 'kg' ? p.costPrice : p.costPrice / GRAMS_PER_KG

  const confirmWeight = () => {
    if (!weightProduct) return
    const qty = parseFloat(weightQty) || 0
    if (qty <= 0) return
    const pieces = Math.max(1, Math.round(weightPieces) || 1)
    const unit: SaleUnit = weightUnit
    addToCart({
      ...weightProduct,
      kind: 'weighted',
      // الوزن الكلي = وزن القطعة × عددها (100غ × 3 = 300غ)
      amount: Math.round(qty * pieces * 1000) / 1000,
      unit,
      unitPrice: weightUnitPrice(weightProduct, unit),
      unitCost: weightUnitCost(weightProduct, unit),
      pieces: pieces > 1 ? pieces : undefined,
    })
    setWeightProduct(null)
  }

  // إضافة الوزنة الحالية للقائمة والمتابعة لوزنة أخرى بوزن مختلف
  const pushWeighing = () => {
    const qty = parseFloat(weightQty) || 0
    if (qty <= 0) return
    const pieces = Math.max(1, Math.round(weightPieces) || 1)
    setWeighings((list) => [...list, { qty, unit: weightUnit, pieces }])
    setWeightQty('')
    setWeightPieces(1)
  }

  // تأكيد كل الوزنات دفعة واحدة — كل وزنة سطر مستقل
  const confirmAllWeighings = () => {
    if (!weightProduct) return
    const batch = [...weighings]
    const qty = parseFloat(weightQty) || 0
    if (qty > 0) {
      batch.push({ qty, unit: weightUnit, pieces: Math.max(1, Math.round(weightPieces) || 1) })
    }
    if (batch.length === 0) return
    for (const w of batch) {
      addToCart({
        ...weightProduct,
        kind: 'weighted',
        amount: Math.round(w.qty * w.pieces * 1000) / 1000,
        unit: w.unit,
        unitPrice: weightUnitPrice(weightProduct, w.unit),
        unitCost: weightUnitCost(weightProduct, w.unit),
        pieces: w.pieces > 1 ? w.pieces : undefined,
        unique: true,
      })
    }
    setWeightProduct(null)
    setWeighings([])
  }

  // Continuous Scanner handling (looks up product across entire DB)
  const handleBarcodeScan = async (barcode: string) => {
    const trimmed = barcode.trim()
    if (!trimmed) return

    let found = await getProductByBarcode(trimmed)
    if (!found) {
      found = products.find((p) => p.barcode === trimmed)
    }

    if (found) {
      if (isExpired(found)) {
        const msg = `⛔ منتهي الصلاحية: ${found.name}`
        setScanMessage(msg)
        setScannerFeedback({ text: msg, success: false })
        setTimeout(() => setScanMessage(null), 3500)
        return
      }
      const t = getProductType(found)
      if (t === 'weighted') {
        // الموزون يحتاج تحديد الوزن — نفتح منتقي الوزن
        openWeightPicker(found)
        setScanMessage(`⚖️ حدد الوزن: ${found.name}`)
      } else {
        if (t === 'service' && found.openPrice) {
          setPriceService(found)
          setServicePrice(found.salePrice > 0 ? String(found.salePrice) : '')
          return
        }
        addToCart({ ...found, kind: t, amount: 1, packOptions: found.packs, durationMinutes: found.durationMinutes })
        const msg = `✅ تمت إضافة: ${found.name}`
        setScanMessage(msg)
        setScannerFeedback({ text: msg, success: true })
        setTimeout(() => setScanMessage(null), 2500)
      }
    } else {
      const msg = `⚠️ غير مسجل: ${trimmed}`
      setScanMessage(msg)
      setScannerFeedback({ text: msg, success: false })
      setTimeout(() => setScanMessage(null), 3500)
    }
  }

  // Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + lineTotal(item), 0)
  }, [cart])

  // مجموع خصومات الأصناف (تُطرح قبل خصم الفاتورة)
  const itemDiscountTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + lineDiscountAmount(item), 0)
  }, [cart])

  const discountBase = Math.max(0, subtotal - itemDiscountTotal)

  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + (getItemUnit(item) === 'piece' ? item.qty : 1), 0)
  }, [cart])

  const discountAmount = useMemo(() => {
    if (!discountValue || discountValue <= 0) return 0
    if (discountType === 'percent') {
      return (discountBase * Math.min(100, discountValue)) / 100
    }
    return Math.min(discountBase, discountValue)
  }, [discountBase, discountType, discountValue])

  const finalTotal = useMemo(() => {
    return Math.max(0, discountBase - discountAmount)
  }, [discountBase, discountAmount])

  // Checkout handling — لا نصفّر الاختيارات عند إعادة الفتح (كانت تضيع بيانات الدين)
  const handleOpenCheckout = () => {
    if (cart.length === 0) return
    setCheckoutOpen(true)
  }

  const handleCreateQuickCustomer = async () => {
    if (!newCustName.trim()) return
    const id = await addCustomer({
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
    })
    setSelectedCustomerId(id)
    setNewCustName('')
    setNewCustPhone('')
    setQuickCustomerOpen(false)
  }

  const handleCompleteSale = async () => {
    if (cart.length === 0) return

    // Validation
    if ((paymentType === 'debt' || paymentType === 'partial') && !selectedCustomerId) {
      alert('يرجى اختيار العميل لتسجيل البيع بالدين')
      return
    }

    let paid = finalTotal
    let debt = 0

    if (paymentType === 'debt') {
      paid = 0
      debt = finalTotal
    } else if (paymentType === 'partial') {
      const parsedPaid = parseFloat(partialPaidAmount) || 0
      if (parsedPaid >= finalTotal) {
        paid = finalTotal
        debt = 0
      } else {
        paid = Math.max(0, parsedPaid)
        debt = finalTotal - paid
      }
    }

    setIsSubmitting(true)

    try {
      const selectedCustomer = customers.find((c) => c.id === selectedCustomerId)

      const saleData: CreateSaleInput = {
        customerId: (paymentType === 'cash' && !selectedCustomerId) ? null : selectedCustomerId,
        customerName: selectedCustomer?.name,
        items: cart.map(({ productId, name, qty, price, costPrice, unit, kind, pack, durationMinutes, discount, pieces }) => ({
          productId,
          name,
          qty,
          price,
          costPrice,
          unit: unit ?? 'piece',
          kind,
          pack,
          durationMinutes,
          discount,
          pieces,
        })),
        subtotal,
        discountType: discountValue > 0 ? discountType : null,
        discountValue,
        discountAmount,
        itemDiscountAmount: itemDiscountTotal,
        total: finalTotal,
        paidAmount: paid,
        debtAmount: debt,
        paymentType,
        paymentMethod: paymentType === 'debt' ? undefined : paymentMethod,
        note: saleNote,
      }

      const inv = await createSaleInvoice(saleData)
      setCompletedInvoice(inv)
      setCheckoutOpen(false)
      resetSaleState()
    } catch (err) {
      console.error(err)
      alert('حدث خطأ أثناء حفظ الفاتورة')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Format WhatsApp invoice message
  const shareWhatsApp = (inv: Invoice) => {
    const customer = customers.find((c) => c.id === inv.customerId)
    const phone = customer?.phone?.replace(/\D/g, '') || ''

    const dateStr = new Date(inv.createdAt).toLocaleString('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    const itemsText = inv.items
      .map((i) => {
        const dur = i.durationMinutes ? ` ⏱ ${formatServiceDuration(i.durationMinutes)}` : ''
        const disc = i.discount && lineDiscountAmount(i) > 0 ? ` (خصم ${formatLineDiscount(i.discount)})` : ''
        return `• ${i.name}${dur} (${formatLineQty(i)} × ${formatCurrency(i.price)}) = ${formatCurrency(i.qty * i.price)}${disc}`
      })
      .join('\n')

    const methodName = inv.paymentType === 'debt'
      ? 'دين كامل (آجل) 📝'
      : `${getPaymentMethodName(inv.paymentMethod)} ${inv.paymentType === 'partial' ? '(دفع جزئي)' : ''}`

    let msg = `🧾 *فاتورة مبيعات *\n`
    msg += `رقم الفاتورة: #${inv.id}\n`
    msg += `التاريخ: ${dateStr}\n`
    if (inv.customerName) {
      msg += `العميل: ${inv.customerName}\n`
    }
    msg += `طريقة الدفع: ${methodName}\n`
    msg += `--------------------------------\n`
    msg += `${itemsText}\n`
    msg += `--------------------------------\n`
    msg += `المجموع الفرعي: ${formatCurrency(inv.subtotal)}\n`
    if ((inv.itemDiscountAmount || 0) > 0) {
      msg += `خصم الأصناف: -${formatCurrency(inv.itemDiscountAmount || 0)}\n`
    }
    if (inv.discountAmount > 0) {
      msg += `الخصم: -${formatCurrency(inv.discountAmount)}\n`
    }
    msg += `*الإجمالي النهائي: ${formatCurrency(inv.total)}*\n`
    msg += `المبلغ المدفوع: ${formatCurrency(inv.paidAmount)}\n`
    if (inv.debtAmount > 0) {
      msg += `*المتبقي كدين: ${formatCurrency(inv.debtAmount)}*\n`
    }
    msg += `\nشكراً لزيارتكم ونتشرف بخدمتكم دائماً! 🌟`

    const encoded = encodeURIComponent(msg)

    if (phone) {
      const cleanPhone = phone.startsWith('0') ? '970' + phone.slice(1) : phone
      window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank')
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank')
    }
  }

  return (
    <div
      style={{
        padding: '12px 14px',
        paddingBottom: cart.length > 0 ? '100px' : undefined,
        maxWidth: 640,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: '100%',
        flex: '1 0 auto',
      }}
    >
      {/* Toast scan message */}
      {scanMessage && (
        <div style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-primary)',
          color: 'var(--color-text-primary)',
          padding: '10px 16px',
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 600,
          textAlign: 'center',
          boxShadow: 'var(--shadow-md)',
        }}>
          {scanMessage}
        </div>
      )}

      {/* Top Search + Barcode & Switch Tabs — ريسبونزف: البحث أولاً والتنقل بعرض كامل تحته */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: '100%',
      }}>
      <div style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        width: '100%',
      }}>

        {/* Search */}
        <div style={{
          flex: '1 1 180px',
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(255,255,255,0.05)',
          border: '1.5px solid var(--color-border)',
          borderRadius: 50,
          padding: '6px 12px',
          boxSizing: 'border-box',
          minHeight: 42,
        }}>
          <span style={{ fontSize: 16 }}>🔍</span>

          <input
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-main)',
              fontSize: 14,
            }}
            placeholder="ابحث عن منتج أو باركود..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                fontSize: 16,
                padding: 0,
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Barcode Scanner */}
        <button
          onClick={() => setScannerOpen(true)}
          title="مسح باركود بالكاميرا"
          style={{
            width: 44,
            height: 42,
            background: 'rgba(59,130,246,0.15)',
            border: '1.5px solid rgba(59,130,246,0.35)',
            borderRadius: 12,
            cursor: 'pointer',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            minHeight: 42,
          }}
        >
          📷
        </button>
      </div>

        {/* Tab switch between Catalog and Cart — full width, never clipped */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 4,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: 4,
          border: '1px solid var(--color-border)',
          width: '100%',
          boxSizing: 'border-box',
          minHeight: 48,
        }}>

          {/* Catalog Tab */}
          <button
            onClick={() => setActiveTab('catalog')}
            style={{
              width: '100%',
              padding: '9px 10px',
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 13,
              fontFamily: 'var(--font-main)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background:
                activeTab === 'catalog'
                  ? 'var(--color-primary)'
                  : 'transparent',
              color:
                activeTab === 'catalog'
                  ? 'white'
                  : 'var(--color-text-muted)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            📦 المنتجات
          </button>

          {/* Cart Tab */}
          <button
            onClick={() => setActiveTab('cart')}
            style={{
              width: '100%',
              padding: '9px 10px',
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 13,
              fontFamily: 'var(--font-main)',
              background:
                activeTab === 'cart'
                  ? 'var(--color-primary)'
                  : 'transparent',
              color:
                activeTab === 'cart'
                  ? 'white'
                  : 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            🛒 السلة

            {totalCartCount > 0 && (
              <span style={{
                background:
                  activeTab === 'cart'
                    ? 'white'
                    : 'var(--color-primary)',
                color:
                  activeTab === 'cart'
                    ? 'var(--color-primary)'
                    : 'white',
                fontSize: 11,
                fontWeight: 800,
                borderRadius: 50,
                padding: '1px 6px',
              }}>
                {totalCartCount}
              </span>
            )}
          </button>

        </div>
      </div>

      {/* VIEW 1: CATALOG TAB */}
      {activeTab === 'catalog' && (
        <div>
          {/* Dynamic Categories bar with manage button */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', paddingBottom: 6, marginBottom: 10 }}>
            {/* All option */}
            <button
              onClick={() => setActiveCategory('')}
              style={{
                flexShrink: 0,
                padding: '6px 12px',
                borderRadius: 50,
                border: activeCategory === '' ? '1.5px solid rgba(59,130,246,0.6)' : '1.5px solid var(--color-border)',
                background: activeCategory === '' ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                color: activeCategory === '' ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>🏷️</span>
              <span>الكل</span>
            </button>

            {categoriesList.map((cat) => {
              const isActive = activeCategory === cat.name
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.name)}
                  style={{
                    flexShrink: 0,
                    padding: '6px 12px',
                    borderRadius: 50,
                    border: isActive ? '1.5px solid rgba(59,130,246,0.6)' : '1.5px solid var(--color-border)',
                    background: isActive ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                    color: isActive ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              )
            })}

            {/* Quick manage categories button */}
            <button
              type="button"
              onClick={() => setCategoryModalOpen(true)}
              title="إدارة وتعديل الأقسام"
              style={{
                flexShrink: 0,
                padding: '6px 10px',
                borderRadius: 50,
                border: '1px dashed rgba(255,255,255,0.2)',
                background: 'transparent',
                color: 'var(--color-text-muted)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>⚙️</span>
              <span>الأقسام</span>
            </button>
          </div>

          {/* Product Cards Grid */}
          {products.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 10px' }}>
              <div className="empty-icon">📦</div>
              <p style={{ fontSize: 15, fontWeight: 700 }}>لا توجد منتجات مطابقة</p>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {search ? `لا يوجد صنف باسم "${search}"` : 'لا توجد أصناف بعد'}
              </p>
              <button
                type="button"
                onClick={() => setQuickAddOpen(true)}
                style={{
                  marginTop: 12,
                  padding: '12px 24px',
                  borderRadius: 14,
                  border: 'none',
                  background: 'var(--brand-gradient)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                  boxShadow: 'var(--shadow-primary)',
                }}
              >
                ➕ إضافة "{search || 'صنف جديد'}" الآن
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))',
              gap: 10,
            }}>
              {products.map((p) => {
                const pType = getProductType(p)
                const cartLines = cart.filter((item) => item.productId === p.id)
                const inCart = cartLines.length > 0
                const cartQtyBadge = pType === 'weighted'
                  ? '✓'
                  : cartLines.reduce((s, l) => s + l.qty * (l.pack?.factor ?? 1), 0)
                const expired = isExpired(p)
                const nearExpiry = !expired && isNearExpiry(p)
                const isOut = expired || isOutOfStock(p)
                return (
                  <div
                    key={p.id}
                    onClick={() => handleProductClick(p)}
                    style={{
                      background: inCart ? 'var(--color-primary-glow)' : 'var(--color-bg-card)',
                      border: inCart ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      borderRadius: 16,
                      padding: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      userSelect: 'none',
                      transition: 'transform 0.12s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                      minHeight: 164,
                      boxShadow: inCart ? 'var(--shadow-primary)' : 'var(--shadow-sm)',
                    }}
                  >
                    {inCart && (
                      <div style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        background: 'var(--color-primary)',
                        color: 'white',
                        borderRadius: 50,
                        width: 22,
                        height: 22,
                        fontSize: 12,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {typeof cartQtyBadge === 'number' && cartQtyBadge % 1 !== 0 ? cartQtyBadge.toFixed(2) : cartQtyBadge}
                      </div>
                    )}

                    <div style={{ fontSize: 28, marginBottom: 6 }}>
                      {p.image ? (
                        <img
                          src={p.image}
                          alt=""
                          style={{ width: 58, height: 58, borderRadius: 15, objectFit: 'cover', boxShadow: 'var(--shadow-sm)' }}
                        />
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 58, height: 58,
                          borderRadius: 15,
                          background: 'var(--brand-gradient-soft)',
                          border: '1px solid var(--color-border)',
                          fontSize: 28,
                        }}>
                          {catIconMap[p.category] ?? '📦'}
                        </span>
                      )}
                    </div>

                    <div>
                      <p style={{
                        fontSize: 13,
                        fontWeight: 700,
                        lineHeight: 1.3,
                        marginBottom: 4,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {p.name}
                      </p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 900, color: '#fff',
                          background: 'var(--brand-gradient)',
                          padding: '3px 10px', borderRadius: 99, direction: 'ltr',
                          boxShadow: '0 2px 10px rgba(124, 58, 237, 0.35)',
                          whiteSpace: 'nowrap',
                        }}>
                          {pType === 'service' && p.openPrice ? '💲 سعر مفتوح' : priceLabel(p)}
                        </span>
                        <span style={{
                          fontSize: 10,
                          color: isOut ? 'var(--color-danger-light)' : nearExpiry ? 'var(--color-warning-light)' : 'var(--color-text-muted)',
                          fontWeight: nearExpiry ? 800 : 400,
                        }}>
                          {expired ? '⛔ منتهي الصلاحية' : isOut ? 'نفد' : nearExpiry ? '⚠️ صلاحية قريبة' : pType === 'service' ? '🛎️ خدمة' : pType === 'weighted' ? `⚖️ ${stockLabel(p)}` : stockLabel(p)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: CART TAB */}
      {activeTab === 'cart' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cart.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 10px' }}>
              <div className="empty-icon">🛍️</div>
              <p style={{ fontSize: 16, fontWeight: 700 }}>السلة فارغة</p>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                اختر أصنافاً من الكتالوج أو امسح الباركود لإضافتها
              </p>
              <button
                onClick={() => setActiveTab('catalog')}
                style={{
                  marginTop: 14,
                  padding: '10px 20px',
                  borderRadius: 12,
                  background: 'var(--color-primary)',
                  color: 'white',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                }}
              >
                تصفح الأصناف
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 600 }}>
                  الأصناف المضافة ({cart.length}) — محفوظة دائماً ✓
                </span>
                <button
                  onClick={resetSaleState}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-danger-light)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  إفراغ السلة 🗑️
                </button>
              </div>

              {cart.map((item) => {
                const unit = getItemUnit(item)
                const kind = item.kind ?? (unit === 'piece' ? 'goods' : 'weighted')
                const packLabel = item.pack?.label ?? null
                const step = unitStep(unit)
                const baseQty = item.pack ? packPieces(item.qty, item.pack) : item.qty
                const overStock = kind === 'service' ? false : baseQty > item.maxStock
                const maxDisplay = kind === 'weighted'
                  ? `${Math.round((item.maxStock / GRAMS_PER_KG) * 1000) / 1000} كغ`
                  : kind === 'service' ? '' : `${item.maxStock} قطعة`
                const key = item.lineId
                const gross = lineTotal(item)
                const disc = lineDiscountAmount(item)
                const net = gross - disc
                const editorOpen = discLineKey === key
                const piecesCount = Math.round(Number(item.pieces) || 0) || 0
                const hasPieces = piecesCount > 1
                const perPiece = hasPieces ? perPieceQty(item.qty, piecesCount) : null
                return (
                  <div
                    key={key}
                    className="sale-cart-line"
                    style={{
                      background: 'var(--color-bg-card)',
                      border: `1px solid ${overStock ? 'rgba(239,68,68,0.4)' : 'var(--color-border)'}`,
                      borderRadius: 14,
                      padding: '12px 14px',
                    }}
                  >
                    <div className="sale-cart-line-info">
                      <p style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                        {kind === 'service' && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}> 🛎️</span>}
                        {kind === 'weighted' && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}> ⚖️</span>}
                      </p>
                      {kind === 'service' && item.durationMinutes ? (
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginTop: 2 }}>
                          ⏱ {formatServiceDuration(item.durationMinutes)}
                        </div>
                      ) : null}
                      {hasPieces && perPiece !== null ? (
                        <div style={{ fontSize: 12, color: 'var(--color-primary-light)', fontWeight: 800, marginTop: 2 }}>
                          {piecesCount} قطع × {perPiece} {unitShort(unit)} للقطعة
                        </div>
                      ) : null}
                      <div className="sale-cart-line-price">
                        {kind === 'service' ? (
                          <label className="sale-cart-service-price">
                            <span>سعر الخدمة</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.price}
                              onChange={(e) => setItemPrice(item.productId, parseFloat(e.target.value) || 0, unit, packLabel, item.lineId)}
                              title="تعديل سعر الخدمة"
                              aria-label={`سعر خدمة ${item.name}`}
                              style={{
                                width: 88,
                                minHeight: 40,
                                flexShrink: 0,
                                boxSizing: 'border-box',
                                padding: '6px 8px',
                                borderRadius: 8,
                                background: 'var(--color-input-bg)',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text-primary)',
                                fontSize: 15,
                                fontWeight: 800,
                                outline: 'none',
                                fontFamily: 'var(--font-main)',
                                direction: 'ltr',
                                textAlign: 'center',
                              }}
                            />
                            <span>₪</span>
                          </label>
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', direction: 'ltr' }}>
                            {formatCurrency(item.price)}{item.pack ? `/${item.pack.label}` : unit !== 'piece' ? `/${unitShort(unit)}` : ''}
                          </span>
                        )}
                        {/* Pack selector for goods with packs — customized dropdown */}
                        {kind === 'goods' && item.packOptions && item.packOptions.length > 0 && (
                          <div style={{ minWidth: 120, maxWidth: 170 }}>
                            <CustomSelect
                              value={packLabel ?? ''}
                              onChange={(v) => {
                                const sel = item.packOptions!.find((pk) => pk.label === v) ?? null
                                updatePack(item.productId, packLabel, sel, item.lineId)
                              }}
                              options={[
                                { value: '', label: 'قطعة' },
                                ...item.packOptions.map((pk) => ({
                                  value: pk.label,
                                  label: `${pk.label} (${pk.factor}) — ${pk.price} ₪`,
                                })),
                              ]}
                            />
                          </div>
                        )}
                        {overStock && (
                          <span style={{ fontSize: 11, color: 'var(--color-danger-light)', fontWeight: 700 }}>
                            المخزون المتوفر: {maxDisplay}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stepper */}
                    <div className="sale-cart-line-stepper" style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: 10,
                      border: '1px solid var(--color-border)',
                      padding: 2,
                    }}>
                      <button
                        onClick={() => hasPieces
                          ? setItemPieces(item.lineId, piecesCount - 1)
                          : updateQty(item.productId, -step, unit, packLabel, item.lineId)}
                        style={{
                          width: 30, height: 30,
                          border: 'none', background: 'transparent',
                          color: 'var(--color-text-primary)',
                          fontSize: 18, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >-</button>
                      <input
                        type="number"
                        step={unit === 'piece' ? '1' : 'any'}
                        value={item.qty}
                        onChange={(e) => setDirectQty(item.productId, (kind === 'weighted' ? parseFloat(e.target.value) : parseInt(e.target.value)) || 0, unit, packLabel, item.lineId)}
                        style={{
                          width: unit === 'piece' ? 36 : 56,
                          textAlign: 'center',
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--color-text-primary)',
                          fontSize: 14,
                          fontWeight: 800,
                          outline: 'none',
                        }}
                      />
                      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', paddingInlineEnd: 4 }}>{unitShort(unit)}</span>
                      <button
                        onClick={() => hasPieces
                          ? setItemPieces(item.lineId, piecesCount + 1)
                          : updateQty(item.productId, step, unit, packLabel, item.lineId)}
                        style={{
                          width: 30, height: 30,
                          border: 'none', background: 'transparent',
                          color: 'var(--color-text-primary)',
                          fontSize: 18, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >+</button>
                    </div>

                    {/* Line total */}
                    <div className="sale-cart-line-summary">
                      <div className="sale-cart-line-total">
                      {disc > 0 ? (
                        <>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textDecoration: 'line-through', direction: 'ltr', display: 'block' }}>
                            {formatCurrency(gross)}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-warning-light)', direction: 'ltr', display: 'block' }}>
                            {formatCurrency(net)}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary)', direction: 'ltr' }}>
                          {formatCurrency(gross)}
                        </span>
                      )}
                      </div>

                    {/* Per-line discount */}
                      <div className="sale-cart-line-actions">
                        <button
                          className="sale-cart-line-discount"
                          onClick={() => {
                            if (editorOpen) {
                              setDiscLineKey(null)
                            } else {
                              setDiscLineKey(key)
                              setDiscType(item.discount?.type ?? 'percent')
                              setDiscValue(item.discount ? String(item.discount.value) : '')
                            }
                          }}
                          title="خصم خاص بهذا الصنف"
                          style={{
                            background: item.discount ? 'rgba(245,158,11,0.18)' : 'none',
                            border: item.discount ? '1px solid var(--color-warning)' : 'none',
                            borderRadius: 8,
                            color: item.discount ? 'var(--color-warning-light)' : 'var(--color-text-muted)',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                            padding: '4px 6px',
                            fontFamily: 'var(--font-main)',
                          }}
                        >
                          {item.discount ? `🏷️ ${formatLineDiscount(item.discount)}` : '🏷️'}
                        </button>

                    {/* Delete */}
                        <button
                          className="sale-cart-line-delete"
                          onClick={() => removeFromCart(item.productId, unit, packLabel, item.lineId)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-text-muted)',
                            fontSize: 16,
                            cursor: 'pointer',
                            padding: 4,
                          }}
                        >✕</button>
                      </div>
                    </div>

                    {/* Inline per-line discount editor */}
                    {editorOpen && (
                      <div style={{
                        gridColumn: '1 / -1',
                        background: 'rgba(245,158,11,0.08)',
                        border: '1px dashed rgba(245,158,11,0.4)',
                        borderRadius: 10,
                        padding: '8px 10px',
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                      }}>
                        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                          {(['percent', 'fixed'] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setDiscType(t)}
                              style={{
                                padding: '6px 12px', border: 'none', cursor: 'pointer',
                                background: discType === t ? 'var(--color-warning)' : 'transparent',
                                color: discType === t ? '#1a1a1a' : 'var(--color-text-secondary)',
                                fontWeight: 800, fontSize: 12, fontFamily: 'var(--font-main)',
                              }}
                            >
                              {t === 'percent' ? '٪' : '₪'}
                            </button>
                          ))}
                        </div>
                        <input
                          type="number"
                          min="0"
                          value={discValue}
                          onChange={(e) => setDiscValue(e.target.value)}
                          placeholder={discType === 'percent' ? 'مثال: 10' : 'مثال: 5'}
                          autoFocus
                          style={{
                            flex: 1, padding: '6px 10px', borderRadius: 8,
                            background: 'var(--color-input-bg)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-primary)',
                            fontSize: 14, fontWeight: 700, outline: 'none',
                            fontFamily: 'var(--font-main)',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const v = parseFloat(discValue) || 0
                            if (v <= 0) {
                              setItemDiscount(item.productId, undefined, unit, packLabel, item.lineId)
                            } else {
                              setItemDiscount(item.productId, { type: discType, value: v }, unit, packLabel, item.lineId)
                            }
                            setDiscLineKey(null)
                          }}
                          style={{
                            padding: '6px 14px', borderRadius: 8, border: 'none',
                            background: 'var(--color-warning)', color: '#1a1a1a',
                            fontWeight: 800, fontSize: 12, cursor: 'pointer',
                            fontFamily: 'var(--font-main)',
                          }}
                        >
                          ✓
                        </button>
                        {item.discount && (
                          <button
                            type="button"
                            onClick={() => {
                              setItemDiscount(item.productId, undefined, unit, packLabel, item.lineId)
                              setDiscLineKey(null)
                            }}
                            style={{
                              padding: '6px 10px', borderRadius: 8,
                              background: 'transparent',
                              border: '1px solid var(--color-border)',
                              color: 'var(--color-danger-light)',
                              fontWeight: 700, fontSize: 12, cursor: 'pointer',
                              fontFamily: 'var(--font-main)',
                            }}
                          >
                            مسح
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Docked Bottom Bar / Summary & Checkout — fixed عائم فوق شريط التنقل، والمسافة محسوبة مرة واحدة في جذر الصفحة */}
      {cart.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(var(--bottom-bar-total-height, 72px) + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(640px, calc(100% - 20px))',
            zIndex: 45,
            background: 'var(--color-bg-elevated)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1.5px solid var(--color-border-active)',
            borderRadius: 18,
            boxShadow: 'var(--shadow-lg)',
            padding: '10px 16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              maxWidth: 640,
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {/* Discount row (shown in Cart Tab) */}
            {activeTab === 'cart' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  المجموع الفرعي ({totalCartCount} قطعة):{' '}
                  <strong style={{ color: 'var(--color-text-primary)' }}>{formatCurrency(subtotal)}</strong>
                  {itemDiscountTotal > 0 && (
                    <span style={{ color: 'var(--color-warning-light)', fontWeight: 700 }}>
                      {' '}− خصم أصناف {formatCurrency(itemDiscountTotal)}
                    </span>
                  )}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={() => setShowDiscountModal(true)}
                    style={{
                      background: discountValue > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)',
                      border: discountValue > 0 ? '1px solid var(--color-warning)' : '1px solid var(--color-border)',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                      color: discountValue > 0 ? 'var(--color-warning-light)' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                    }}
                  >
                    {discountValue > 0 ? `🏷️ خصم: ${discountValue}${discountType === 'percent' ? '%' : ' ₪'}` : '+ إضافة خصم'}
                  </button>
                  {discountAmount > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-warning-light)', direction: 'ltr' }}>
                      -{formatCurrency(discountAmount)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Main Action Row: Final Total & Complete Sale Button */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
                  {activeTab === 'catalog' ? `السلة (${totalCartCount} قطعة)` : 'المبلغ النهائي المطلوب'}
                </p>
                <p style={{ fontSize: 21, fontWeight: 900, color: '#34d399', direction: 'ltr', margin: 0, lineHeight: 1.2 }}>
                  {formatCurrency(finalTotal)}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {activeTab === 'catalog' && (
                  <button
                    onClick={() => setActiveTab('cart')}
                    style={{
                      background: 'rgba(59,130,246,0.15)',
                      border: '1.5px solid rgba(59,130,246,0.4)',
                      borderRadius: 12,
                      padding: '10px 14px',
                      color: 'var(--color-primary-light)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <span>السلة</span>
                    <span
                      style={{
                        background: 'var(--color-primary)',
                        color: 'white',
                        borderRadius: 50,
                        padding: '1px 6px',
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {totalCartCount}
                    </span>
                  </button>
                )}

                <button
                  onClick={handleOpenCheckout}
                  className="animate-pop"
                  style={{
                    background: 'var(--mint-gradient)',
                    border: 'none',
                    borderRadius: 14,
                    padding: '12px 24px',
                    color: 'white',
                    fontSize: 15,
                    fontWeight: 900,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                    boxShadow: '0 6px 20px rgba(16,185,129,0.45), inset 0 1px 0 rgba(255,255,255,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>إتمام البيع</span>
                  <span>⬅️</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* MODAL: DISCOUNT */}
      <Modal
        open={showDiscountModal}
        onClose={() => setShowDiscountModal(false)}
        title="تطبيق خصم على الفاتورة"
        type="box"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={() => setDiscountType('fixed')}
              style={{
                padding: '10px',
                borderRadius: 10,
                border: discountType === 'fixed' ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: discountType === 'fixed' ? 'rgba(59,130,246,0.2)' : 'transparent',
                color: discountType === 'fixed' ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
              }}
            >
              مبلغ ثابت (₪)
            </button>
            <button
              type="button"
              onClick={() => setDiscountType('percent')}
              style={{
                padding: '10px',
                borderRadius: 10,
                border: discountType === 'percent' ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: discountType === 'percent' ? 'rgba(59,130,246,0.2)' : 'transparent',
                color: discountType === 'percent' ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
              }}
            >
              نسبة مئوية (%)
            </button>
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
              قيمة الخصم ({discountType === 'percent' ? '%' : '₪'}):
            </label>
            <input
              type="number"
              min="0"
              value={discountValue || ''}
              onChange={(e) => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
              placeholder="0"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: 16,
                fontWeight: 700,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button
              onClick={() => { setDiscountValue(0); setShowDiscountModal(false) }}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
              }}
            >
              إلغاء الخصم
            </button>
            <button
              onClick={() => setShowDiscountModal(false)}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 10,
                background: 'var(--color-primary)',
                border: 'none',
                color: 'white',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
              }}
            >
              تأكيد الخصم
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: CHECKOUT / PAYMENT */}
      <Modal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title="إتمام عملية البيع واختيار طريقة الدفع"
        type="sheet"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '80vh', overflowY: 'auto' }}>
          {/* Total display box */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(16,185,129,0.15))',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 14,
            padding: '14px 16px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>المبلغ الإجمالي للفاتورة</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--color-text-primary)', direction: 'ltr' }}>
              {formatCurrency(finalTotal)}
            </p>
          </div>

          {/* Items recap — مراجعة سريعة قبل الدفع */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: '6px 12px',
            maxHeight: 132,
            overflowY: 'auto',
            fontSize: 12,
          }}>
            {cart.map((item) => {
              const net = lineTotal(item) - lineDiscountAmount(item)
              return (
                <div key={item.lineId} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dashed var(--color-border)' }}>
                  <span style={{ fontWeight: 700 }}>
                    {item.name} × {item.pack ? `${item.qty} ${item.pack.label}` : formatLineQty(item)}
                    {item.discount && lineDiscountAmount(item) > 0 && (
                      <span style={{ color: 'var(--color-warning-light)' }}> 🏷️</span>
                    )}
                  </span>
                  <span style={{ direction: 'ltr', fontWeight: 700 }}>{formatCurrency(net)}</span>
                </div>
              )
            })}
          </div>

          {/* Payment Method / Type Grid */}
          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8, fontWeight: 700 }}>
              اختر طريقة القبض / الدفع:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {/* Direct cash */}
              <button
                type="button"
                onClick={() => { setPaymentType('cash'); setPaymentMethod('cash') }}
                style={{
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: (paymentType === 'cash' && paymentMethod === 'cash') ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: (paymentType === 'cash' && paymentMethod === 'cash') ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                  color: (paymentType === 'cash' && paymentMethod === 'cash') ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 20 }}>💵</span>
                <span>نقداً (كاش)</span>
              </button>

              {/* Jawwal Pay */}
              <button
                type="button"
                onClick={() => { setPaymentType('cash'); setPaymentMethod('jawwal_pay') }}
                style={{
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: (paymentType === 'cash' && paymentMethod === 'jawwal_pay') ? '2px solid #10b981' : '1px solid var(--color-border)',
                  background: (paymentType === 'cash' && paymentMethod === 'jawwal_pay') ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)',
                  color: (paymentType === 'cash' && paymentMethod === 'jawwal_pay') ? 'var(--color-success-light)' : 'var(--color-text-secondary)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 20 }}>📱</span>
                <span>جوال باي</span>
              </button>

              {/* PalPay */}
              <button
                type="button"
                onClick={() => { setPaymentType('cash'); setPaymentMethod('palpay') }}
                style={{
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: (paymentType === 'cash' && paymentMethod === 'palpay') ? '2px solid #8b5cf6' : '1px solid var(--color-border)',
                  background: (paymentType === 'cash' && paymentMethod === 'palpay') ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                  color: (paymentType === 'cash' && paymentMethod === 'palpay') ? 'var(--color-purple-light)' : 'var(--color-text-secondary)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 20 }}>💳</span>
                <span>بال باي (PalPay)</span>
              </button>

              {/* Bank of Palestine */}
              <button
                type="button"
                onClick={() => { setPaymentType('cash'); setPaymentMethod('bop') }}
                style={{
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: (paymentType === 'cash' && paymentMethod === 'bop') ? '2px solid #3b82f6' : '1px solid var(--color-border)',
                  background: (paymentType === 'cash' && paymentMethod === 'bop') ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.04)',
                  color: (paymentType === 'cash' && paymentMethod === 'bop') ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 20 }}>🏦</span>
                <span>بنك فلسطين</span>
              </button>

              {/* Debt */}
              <button
                type="button"
                onClick={() => setPaymentType('debt')}
                style={{
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: paymentType === 'debt' ? '2px solid var(--color-danger)' : '1px solid var(--color-border)',
                  background: paymentType === 'debt' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
                  color: paymentType === 'debt' ? 'var(--color-danger-light)' : 'var(--color-text-secondary)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 20 }}>📝</span>
                <span>دين كامل (آجل)</span>
              </button>

              {/* Partial */}
              <button
                type="button"
                onClick={() => setPaymentType('partial')}
                style={{
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: paymentType === 'partial' ? '2px solid var(--color-warning)' : '1px solid var(--color-border)',
                  background: paymentType === 'partial' ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.04)',
                  color: paymentType === 'partial' ? 'var(--color-warning-light)' : 'var(--color-text-secondary)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 20 }}>⚖️</span>
                <span>دفع جزئي + دين</span>
              </button>
            </div>
          </div>

          {/* Customer Selection — إلزامي للدين/الجزئي، اختياري للنقدي (اسم على الفاتورة) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 700 }}>
                العميل {paymentType !== 'cash' ? <span style={{ color: 'var(--color-danger)' }}>*</span> : <span style={{ fontWeight: 400 }}>(اختياري)</span>}:
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {paymentType === 'cash' && selectedCustomerId && (
                  <button
                    type="button"
                    onClick={() => setSelectedCustomerId(null)}
                    style={{
                      background: 'none', border: 'none',
                      color: 'var(--color-text-muted)',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'var(--font-main)',
                    }}
                  >
                    بدون عميل ✕
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setQuickCustomerOpen(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary-light)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  + عميل جديد
                </button>
              </div>
            </div>

              <CustomSelect
                value={selectedCustomerId}
                placeholder="-- اختر العميل --"
                onChange={setSelectedCustomerId}
                options={customers.filter((customer) => customer.id !== undefined).map((customer) => ({
                  value: customer.id!,
                  label: customer.name,
                  description: customer.totalDebt > 0 ? `رصيده الحالي: ${formatCurrency(customer.totalDebt)}` : 'لا يوجد دين حالي',
                }))}
              />
            </div>

          {/* Partial Payment Configuration */}
          {paymentType === 'partial' && (
            <div style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 12,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              <div>
                <label style={{ fontSize: 13, color: 'var(--color-warning-light)', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                  المبلغ المقبوض حالياً:
                </label>
                <input
                  type="number"
                  min="0"
                  max={finalTotal}
                  placeholder="أدخل المبلغ المقبوض..."
                  value={partialPaidAmount}
                  onChange={(e) => setPartialPaidAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: 16,
                    fontWeight: 800,
                    outline: 'none',
                    direction: 'ltr',
                    textAlign: 'right',
                  }}
                />
              </div>

              {/* Method used for the partial payment */}
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
                  طريقة تحصيل هذا المبلغ:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    { id: 'cash' as PaymentMethod, label: 'كاش 💵' },
                    { id: 'jawwal_pay' as PaymentMethod, label: 'جوال باي 📱' },
                    { id: 'palpay' as PaymentMethod, label: 'بال باي 💳' },
                    { id: 'bop' as PaymentMethod, label: 'بنك فلسطين 🏦' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      style={{
                        padding: '8px',
                        borderRadius: 8,
                        border: paymentMethod === m.id ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: paymentMethod === m.id ? 'rgba(59,130,246,0.2)' : 'transparent',
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

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 14, fontWeight: 700 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>المتبقي كدين على العميل:</span>
                <span style={{ color: 'var(--color-danger-light)', direction: 'ltr' }}>
                  {formatCurrency(Math.max(0, finalTotal - (parseFloat(partialPaidAmount) || 0)))}
                </span>
              </div>
            </div>
          )}

          {/* Optional Note */}
          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
              ملاحظة على الفاتورة (اختياري):
            </label>
            <input
              type="text"
              placeholder="مثال: رقم الحوالة، طلب خاص..."
              value={saleNote}
              onChange={(e) => setSaleNote(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setCheckoutOpen(false)}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
              }}
            >
              تراجع
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleCompleteSale}
              style={{
                flex: 2,
                padding: '12px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                color: 'white',
                fontWeight: 800,
                fontSize: 15,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-main)',
                boxShadow: '0 4px 16px rgba(16,185,129,0.3)',
              }}
            >
              {isSubmitting ? 'جارٍ الحفظ...' : 'تأكيد وحفظ الفاتورة ✓'}
            </button>
          </div>
        </div>
      </Modal>

      {/* QUICK ADD CUSTOMER MODAL */}
      <Modal
        open={quickCustomerOpen}
        onClose={() => setQuickCustomerOpen(false)}
        title="إضافة عميل جديد سريعاً"
        type="box"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
              اسم العميل <span style={{ color: 'var(--color-danger)' }}>*</span>:
            </label>
            <input
              type="text"
              placeholder="مثال: أحمد أبو علي"
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
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

          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
              رقم الهاتف (للواتساب):
            </label>
            <input
              type="tel"
              placeholder="مثال: 0599123456"
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
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

          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button
              type="button"
              onClick={() => setQuickCustomerOpen(false)}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 10,
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
              onClick={handleCreateQuickCustomer}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 10,
                background: 'var(--color-primary)',
                border: 'none',
                color: 'white',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
              }}
            >
              إضافة
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: COMPLETED INVOICE RECEIPT */}
      {completedInvoice && (
        <Modal
          open={Boolean(completedInvoice)}
          onClose={() => setCompletedInvoice(null)}
          title="تم البيع بنجاح 🎉"
          type="box"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <InvoicePrint invoice={completedInvoice} store={storeInfo} />

            {/* Share & Print Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => shareWhatsApp(completedInvoice)}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: 12,
                  background: '#25D366',
                  border: 'none',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <span>مشاركة واتساب</span>
                <span>💬</span>
              </button>
              <button
                type="button"
                onClick={() => printInvoice(completedInvoice)}
                style={{
                  padding: '11px 16px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                }}
              >
                🖨️ طباعة
              </button>
            </div>

            <button
              type="button"
              onClick={() => setCompletedInvoice(null)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 12,
                background: 'var(--color-primary)',
                border: 'none',
                color: 'white',
                fontWeight: 800,
                fontSize: 15,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
              }}
            >
              فاتورة جديدة 🔄
            </button>
          </div>
        </Modal>
      )}

      {/* MODAL: OPEN-PRICE SERVICE */}
      {priceService && (
        <Modal
          open={Boolean(priceService)}
          onClose={() => setPriceService(null)}
          title={`🛎️ ${priceService.name}`}
          type="box"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {priceService.durationMinutes ? (
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 700 }}>
                ⏱ مدة التنفيذ: {formatServiceDuration(priceService.durationMinutes)}
              </div>
            ) : null}
            <div>
              <label className="input-label">سعر الخدمة ₪ *</label>
              <input
                type="number"
                min="0"
                step="any"
                value={servicePrice}
                onChange={(e) => setServicePrice(e.target.value)}
                autoFocus
                placeholder="أدخل السعر المتفق عليه"
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'var(--color-input-bg)',
                  border: '1.5px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: 20,
                  fontWeight: 800,
                  textAlign: 'center',
                  outline: 'none',
                  fontFamily: 'var(--font-main)',
                }}
              />
              {priceService.salePrice > 0 && (
                <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, textAlign: 'center' }}>
                  السعر الاسترشادي: {formatCurrency(priceService.salePrice)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={confirmServicePrice}
              disabled={!(parseFloat(servicePrice) >= 0 && servicePrice !== '')}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: 12,
                background: 'var(--color-primary)',
                border: 'none',
                color: 'white',
                fontWeight: 800,
                fontSize: 15,
                cursor: 'pointer',
                opacity: servicePrice !== '' ? 1 : 0.5,
                fontFamily: 'var(--font-main)',
              }}
            >
              ✓ إضافة للسلة
            </button>
          </div>
        </Modal>
      )}

      {/* MODAL: WEIGHT PICKER (weighted products) */}
      {weightProduct && (
        <Modal
          open={Boolean(weightProduct)}
          onClose={() => { setWeightProduct(null); setWeighings([]) }}
          title={`⚖️ ${weightProduct.name}`}
          type="box"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-text-secondary)' }}>
              السعر: <strong style={{ color: 'var(--color-text-primary)' }}>{formatCurrency(weightProduct.salePrice)}/كغ</strong>
              {' · '}
              المتوفر: <strong style={{ color: 'var(--color-text-primary)' }}>{stockLabel(weightProduct)}</strong>
            </div>

            {/* Unit toggle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['kg', 'g'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setWeightUnit(u)}
                  style={{
                    padding: '12px',
                    borderRadius: 12,
                    border: weightUnit === u ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: weightUnit === u ? 'var(--color-primary-glow)' : 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    fontWeight: 800,
                    fontSize: 16,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  {u === 'kg' ? 'كيلوغرام (كغ)' : 'جرام (غ)'}
                </button>
              ))}
            </div>

            {/* Quick chips */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {(weightUnit === 'kg' ? ['0.25', '0.5', '1', '2'] : ['100', '250', '500', '1000']).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setWeightQty(v)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 99,
                    border: weightQty === v ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: weightQty === v ? 'var(--color-primary-glow)' : 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  {v} {weightUnit === 'kg' ? 'كغ' : 'غ'}
                </button>
              ))}
            </div>

            {/* Pieces count: 3 × 100غ */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 12, padding: '8px 12px',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>عدد القطع بنفس الوزن</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setWeightPieces((n) => Math.max(1, n - 1))}
                  style={{
                    width: 32, height: 32, borderRadius: 10, border: '1px solid var(--color-border)',
                    background: 'transparent', color: 'var(--color-text-primary)',
                    fontSize: 18, fontWeight: 800, cursor: 'pointer',
                  }}
                >-</button>
                <span style={{ fontSize: 18, fontWeight: 900, minWidth: 28, textAlign: 'center' }}>
                  {weightPieces}
                </span>
                <button
                  type="button"
                  onClick={() => setWeightPieces((n) => Math.min(99, n + 1))}
                  style={{
                    width: 32, height: 32, borderRadius: 10, border: 'none',
                    background: 'var(--color-primary)', color: 'white',
                    fontSize: 18, fontWeight: 800, cursor: 'pointer',
                  }}
                >+</button>
              </div>
            </div>
            {weightPieces > 1 && (
              <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--color-primary-light)' }}>
                {weightPieces} قطع × {weightQty || 0} {weightUnit === 'kg' ? 'كغ' : 'غ'} للقطعة
              </div>
            )}

            {/* Manual input + live total */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input
                type="number"
                min="0"
                step="any"
                value={weightQty}
                onChange={(e) => setWeightQty(e.target.value)}
                autoFocus
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'var(--color-input-bg)',
                  border: '1.5px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: 20,
                  fontWeight: 800,
                  textAlign: 'center',
                  outline: 'none',
                  fontFamily: 'var(--font-main)',
                }}
              />
              <div style={{
                minWidth: 110,
                borderRadius: 12,
                background: 'rgba(16,185,129,0.12)',
                border: '1px solid rgba(16,185,129,0.3)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 10px',
              }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>الإجمالي</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-success-light)', direction: 'ltr' }}>
                  {formatCurrency(
                    (parseFloat(weightQty) || 0) * weightPieces *
                    (weightUnit === 'kg' ? weightProduct.salePrice : weightProduct.salePrice / GRAMS_PER_KG)
                  )}
                </span>
              </div>
            </div>

            {/* Pending weighings list */}
            {weighings.length > 0 && (
              <div style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 12, padding: '8px 10px',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                {weighings.map((w, i) => {
                  const total = w.qty * w.pieces * weightUnitPrice(weightProduct, w.unit)
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span style={{ fontWeight: 700 }}>
                        {w.pieces > 1 ? `${w.pieces} × ${w.qty} ${w.unit === 'kg' ? 'كغ' : 'غ'}` : `${w.qty} ${w.unit === 'kg' ? 'كغ' : 'غ'}`}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ direction: 'ltr', fontWeight: 800 }}>{formatCurrency(total)}</span>
                        <button
                          type="button"
                          onClick={() => setWeighings((list) => list.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', color: 'var(--color-danger-light)', cursor: 'pointer', fontSize: 14 }}
                        >✕</button>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={pushWeighing}
                disabled={!(parseFloat(weightQty) > 0)}
                title="احفظ هذه الوزنة وأضف وزنة أخرى بوزن مختلف"
                style={{
                  flex: 1,
                  padding: '13px 8px',
                  borderRadius: 12,
                  background: 'rgba(59,130,246,0.12)',
                  border: '1px solid rgba(59,130,246,0.35)',
                  color: 'var(--color-primary-light)',
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: 'pointer',
                  opacity: parseFloat(weightQty) > 0 ? 1 : 0.5,
                  fontFamily: 'var(--font-main)',
                }}
              >
                ➕ وزنة أخرى
              </button>
              <button
                type="button"
                onClick={() => (weighings.length > 0 ? confirmAllWeighings() : confirmWeight())}
                disabled={!(parseFloat(weightQty) > 0) && weighings.length === 0}
                style={{
                  flex: 2,
                  padding: '13px',
                  borderRadius: 12,
                  background: 'var(--color-primary)',
                  border: 'none',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: 'pointer',
                  opacity: (parseFloat(weightQty) > 0 || weighings.length > 0) ? 1 : 0.5,
                  fontFamily: 'var(--font-main)',
                }}
              >
                {weighings.length > 0
                  ? `✓ تأكيد الكل (${weighings.length + (parseFloat(weightQty) > 0 ? 1 : 0)} وزنات)`
                  : '✓ إضافة للسلة'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Barcode Scanner */}
      <BarcodeScanner
        open={scannerOpen}
        onDetected={handleBarcodeScan}
        onClose={() => {
          setScannerOpen(false)
          setScannerFeedback(null)
        }}
        continuous={true}
        cartCount={totalCartCount}
        cartTotal={finalTotal}
        onFinishInvoice={handleOpenCheckout}
        lastScannedMessage={scannerFeedback}
      />

      {/* Category Manager Modal */}
      <CategoryManagerModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
      />

      {/* Quick-add product (same screen, prefilled from search) */}
      <ProductForm
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        initialBarcode={/^\d{3,}$/.test(search.trim()) ? search.trim() : undefined}
        initialName={/^\d{3,}$/.test(search.trim()) ? undefined : search.trim() || undefined}
      />
    </div>
  )
}
