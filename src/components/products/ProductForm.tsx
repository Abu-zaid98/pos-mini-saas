import { useState, useEffect } from 'react'
import type React from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { BarcodeScanner } from '../ui/BarcodeScanner'
import { CustomSelect } from '../ui/CustomSelect'
import { addProduct, updateProduct } from '../../hooks/useProducts'
import { useCategories } from '../../hooks/useCategories'
import { db, PRODUCT_TYPES, type Product, type ProductType, type SalePack } from '../../db/db'
import { GRAMS_PER_KG, getProductType, toDateInputValue } from '../../utils/units'
import { fileToThumbnail } from '../../utils/image'

interface ProductFormProps {
  open: boolean
  onClose: () => void
  product?: Product | null
  initialBarcode?: string
  initialName?: string
  defaultQuantity?: string
  onSaved?: (product: Product) => void
}

const EMPTY = {
  barcode: '',
  name: '',
  salePrice: '',
  costPrice: '',
  quantity: '',
  lowStockAlert: '5',
  category: 'أخرى',
}

export function ProductForm({
  open,
  onClose,
  product,
  initialBarcode,
  initialName,
  defaultQuantity,
  onSaved,
}: ProductFormProps) {
  const categories = useCategories()
  const [form, setForm] = useState(EMPTY)
  const [itemType, setItemType] = useState<ProductType>('goods')
  // عبوات البيع (للسلع): {label, factor, price} كنصوص للإدخال
  const [packs, setPacks] = useState<{ label: string; factor: string; price: string }[]>([])
  // تاريخ الصلاحية (للسلع والموزون)
  const [expiryDate, setExpiryDate] = useState('')
  // للخدمات: سعر مفتوح + مدة بالدقائق
  const [openPrice, setOpenPrice] = useState(false)
  const [duration, setDuration] = useState('')
  // صورة الصنف (مصغرة من كاميرا الجهاز)
  const [imageData, setImageData] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)

  useEffect(() => {
    if (open) {
      if (product) {
        const t = getProductType(product)
        setItemType(t)
        setPacks((product.packs ?? []).map((pk) => ({ label: pk.label, factor: String(pk.factor), price: String(pk.price) })))
        setExpiryDate(toDateInputValue(product.expiryDate))
        setOpenPrice(product.openPrice === true)
        setDuration(product.durationMinutes ? String(product.durationMinutes) : '')
        setImageData(product.image ?? null)
        setForm({
          barcode: product.barcode,
          name: product.name,
          salePrice: String(product.salePrice),
          costPrice: String(product.costPrice),
          // الموزون مخزن بالجرام — يُعرض بالكيلو
          quantity: t === 'weighted' ? String(Math.round((product.quantity / GRAMS_PER_KG) * 1000) / 1000) : String(product.quantity),
          lowStockAlert: t === 'weighted' ? String(Math.round((product.lowStockAlert / GRAMS_PER_KG) * 1000) / 1000) : String(product.lowStockAlert),
          category: product.category,
        })
      } else {
        setItemType('goods')
        setPacks([])
        setExpiryDate('')
        setOpenPrice(false)
        setDuration('')
        setImageData(null)
        setForm({
          ...EMPTY,
          barcode: initialBarcode ?? '',
          name: initialName ?? '',
          quantity: defaultQuantity !== undefined ? defaultQuantity : '',
        })
      }
      setErrors({})
    }
  }, [open, product, initialBarcode, initialName, defaultQuantity])

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((er) => ({ ...er, [key]: '' }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'الاسم مطلوب'
    // السعر الثابت مطلوب دائماً إلا للخدمة ذات السعر المفتوح (يبقى كاسترشادي)
    const needFixedPrice = itemType !== 'service' || !openPrice
    if (needFixedPrice && (!form.salePrice || isNaN(+form.salePrice) || +form.salePrice < 0))
      errs.salePrice = itemType === 'weighted' ? 'سعر الكيلو غير صالح' : 'السعر غير صالح'
    if (itemType !== 'service' && (!form.costPrice || isNaN(+form.costPrice) || +form.costPrice < 0))
      errs.costPrice = itemType === 'weighted' ? 'تكلفة الكيلو غير صالحة' : 'سعر التكلفة غير صالح'
    if (itemType !== 'service' && (!form.quantity || isNaN(+form.quantity) || +form.quantity < 0))
      errs.quantity = itemType === 'weighted' ? 'المخزون بالكيلو غير صالح' : 'الكمية غير صالحة'
    if (itemType === 'goods') {
      packs.forEach((pk, i) => {
        if (!pk.label.trim() || !(+pk.factor >= 2) || !(+pk.price > 0)) {
          errs[`pack${i}`] = 'عبوة غير صالحة'
        }
      })
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setLoading(true)
    const cost = form.costPrice === '' ? 0 : parseFloat(form.costPrice)
    const salePrice = form.salePrice === '' ? 0 : parseFloat(form.salePrice)
    const parsedPacks: SalePack[] = itemType === 'goods'
      ? packs
        .filter((pk) => pk.label.trim() && +pk.factor >= 2 && +pk.price > 0)
        .map((pk) => ({
          label: pk.label.trim(),
          factor: Math.floor(+pk.factor),
          price: Math.round(+pk.price * 100) / 100,
        }))
      : []
    const data = {
      barcode: form.barcode.trim(),
      name: form.name.trim(),
      salePrice,
      costPrice: cost,
      quantity: itemType === 'weighted'
        ? Math.round(parseFloat(form.quantity) * GRAMS_PER_KG)
        : itemType === 'service' ? 0 : parseInt(form.quantity),
      lowStockAlert: itemType === 'weighted'
        ? Math.round((parseFloat(form.lowStockAlert) || 0) * GRAMS_PER_KG)
        : itemType === 'service' ? 0 : parseInt(form.lowStockAlert) || 5,
      category: form.category,
      type: itemType,
      packs: parsedPacks,
      expiryDate: !isService && expiryDate ? new Date(`${expiryDate}T00:00:00`) : null,
      openPrice: isService ? openPrice : false,
      durationMinutes: isService && parseInt(duration) > 0 ? parseInt(duration) : undefined,
      image: imageData,
    }
    let savedProduct: Product | undefined
    if (product?.id) {
      await updateProduct(product.id, data)
      savedProduct = { ...product, ...data, updatedAt: new Date() }
    } else {
      const newId = await addProduct(data)
      const fetched = await db.products.get(Number(newId))
      savedProduct = fetched
    }
    setLoading(false)
    onClose()
    if (savedProduct && onSaved) {
      onSaved(savedProduct)
    }
  }

  const typeMeta = PRODUCT_TYPES.find((t) => t.id === itemType)!
  const isWeighted = itemType === 'weighted'
  const isService = itemType === 'service'

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={product ? 'تعديل صنف' : 'إضافة صنف جديد'}
        type="sheet"
        footer={
          <div style={{ display: 'flex', gap: 10, flexDirection: 'row-reverse', alignItems: 'center', width: '100%' }}>
            <Button
              variant="primary"
              loading={loading}
              onClick={handleSubmit}
              style={{ flex: 2, minHeight: 46, width: '100%' }}
            >
              {product ? 'حفظ التعديلات' : '✓ إضافة الصنف'}
            </Button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              style={{ flex: 1, minHeight: 46 }}
            >
              إلغاء
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Type selector */}
          {!product && (
            <div>
              <label className="input-label">نوع الصنف *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 6 }}>
                {PRODUCT_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setItemType(t.id)}
                    style={{
                      border: itemType === t.id ? '2px solid var(--color-primary)' : '1.5px solid var(--color-border)',
                      background: itemType === t.id ? 'var(--color-primary-glow)' : 'var(--color-input-bg)',
                      borderRadius: 12,
                      padding: '10px 4px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                      fontFamily: 'var(--font-main)',
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{t.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-primary)' }}>{t.label}</span>
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>{typeMeta.desc}</p>
            </div>
          )}
          {product && (
            <div style={{
              background: 'var(--color-input-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 12,
              color: 'var(--color-text-secondary)',
            }}>
              {typeMeta.icon} النوع: <strong>{typeMeta.label}</strong> (لا يمكن تغيير النوع بعد الإنشاء)
            </div>
          )}

          {/* Barcode (optional for services) */}
          <div>
            <label className="input-label">الباركود{isService ? ' (اختياري)' : ''}</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="أدخل الباركود يدوياً"
                value={form.barcode}
                onChange={set('barcode')}
                inputMode="numeric"
              />
              <button
                onClick={() => setScannerOpen(true)}
                style={{
                  width: 48,
                  height: 48,
                  background: 'rgba(59,130,246,0.15)',
                  border: '1.5px solid rgba(59,130,246,0.3)',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontSize: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                📷
              </button>
            </div>
          </div>

          {/* Name */}
          <Input
            label={isService ? 'اسم الخدمة *' : 'اسم الصنف *'}
            placeholder={isService ? 'مثال: توصيل للمنازل' : isWeighted ? 'مثال: كنافة نابلسية' : 'مثال: شيبس ليز كبير'}
            value={form.name}
            onChange={set('name')}
            error={errors.name}
          />

          {/* Photo (all types) */}
          <div>
            <label className="input-label">صورة الصنف (اختياري — من كاميرا الجهاز)</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
              {imageData ? (
                <img
                  src={imageData}
                  alt=""
                  style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover', border: '2px solid var(--color-primary)', flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: 64, height: 64, borderRadius: 14, flexShrink: 0,
                  background: 'var(--color-input-bg)', border: '1.5px dashed var(--color-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
                }}>
                  📷
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flex: 1 }}>
                <label
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1, justifyContent: 'center', cursor: 'pointer', textAlign: 'center' }}
                >
                  {imageLoading ? 'جارٍ المعالجة...' : imageData ? 'تغيير الصورة' : 'التقاط / اختيار'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={imageLoading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (!file) return
                      setImageLoading(true)
                      const thumb = await fileToThumbnail(file)
                      setImageLoading(false)
                      if (thumb) setImageData(thumb)
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
                {imageData && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImageData(null)}>
                    إزالة
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Category */}
          <CustomSelect
            label="التصنيف"
            value={form.category}
            onChange={(category) => setForm((current) => ({ ...current, category }))}
            options={categories.map((category) => ({ value: category.name, label: `${category.icon} ${category.name}` }))}
          />

          {/* Prices */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label={isWeighted ? 'سعر البيع للكيلو ₪ *' : isService ? (openPrice ? 'سعر استرشادي ₪ (اختياري)' : 'سعر الخدمة الثابت ₪ *') : 'سعر البيع ₪ *'}
              placeholder="0.00"
              value={form.salePrice}
              onChange={set('salePrice')}
              inputMode="decimal"
              error={errors.salePrice}
            />
            <Input
              label={isWeighted ? 'تكلفة الإنتاج للكيلو ₪ *' : isService ? 'التكلفة ₪ (اختياري)' : 'سعر التكلفة ₪ *'}
              placeholder="0.00"
              value={form.costPrice}
              onChange={set('costPrice')}
              inputMode="decimal"
              error={errors.costPrice}
            />
          </div>

          {/* Service options: open price + duration */}
          {isService && (
            <div style={{
              background: 'rgba(139,92,246,0.07)',
              border: '1.5px solid rgba(139,92,246,0.3)',
              borderRadius: 12,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={openPrice}
                  onChange={(e) => setOpenPrice(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
                />
                💲 سعر مفتوح — يُدخل الكاشير السعر وقت البيع
              </label>
              <Input
                label="مدة التنفيذ بالدقائق (اختياري — تُطبع على الفاتورة)"
                placeholder="مثال: 30"
                value={duration}
                onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
              />
            </div>
          )}

          {/* Stock (hidden for services) */}
          {!isService && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input
                label={isWeighted ? 'المخزون الحالي (كغ) *' : 'الكمية الحالية *'}
                placeholder="0"
                value={form.quantity}
                onChange={set('quantity')}
                inputMode="decimal"
                error={errors.quantity}
                hint={defaultQuantity === '0' ? 'اتركها 0 إذا كنت تقوم بتوريد الكمية الآن عبر الفاتورة' : undefined}
              />
              <Input
                label={isWeighted ? 'تنبيه المخزون (كغ)' : 'تنبيه مخزون منخفض'}
                placeholder={isWeighted ? '1' : '5'}
                value={form.lowStockAlert}
                onChange={set('lowStockAlert')}
                inputMode="decimal"
              />
            </div>
          )}

          {/* Packs (goods only) — علبة/كرتونة بسعر خاص */}
          {!isService && !isWeighted && (
            <div style={{
              background: 'rgba(59,130,246,0.06)',
              border: '1.5px solid rgba(59,130,246,0.25)',
              borderRadius: 12,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <strong style={{ fontSize: 13 }}>📦 عبوات البيع <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(اختياري — علبة/كرتونة)</span></strong>
              {packs.map((pk, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    className="input"
                    placeholder="الاسم: علبة"
                    value={pk.label}
                    onChange={(e) => setPacks((arr) => arr.map((r, i) => i === idx ? { ...r, label: e.target.value } : r))}
                    style={{ flex: 1.2 }}
                  />
                  <input
                    className="input"
                    type="number"
                    min="2"
                    placeholder="العدد"
                    title="عدد القطع في العبوة"
                    value={pk.factor}
                    onChange={(e) => setPacks((arr) => arr.map((r, i) => i === idx ? { ...r, factor: e.target.value } : r))}
                    style={{ flex: 1 }}
                  />
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="السعر ₪"
                    value={pk.price}
                    onChange={(e) => setPacks((arr) => arr.map((r, i) => i === idx ? { ...r, price: e.target.value } : r))}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => setPacks((arr) => arr.filter((_, i) => i !== idx))}
                    style={{ background: 'none', border: 'none', color: 'var(--color-danger-light)', cursor: 'pointer', fontSize: 15 }}
                  >✕</button>
                </div>
              ))}
              {packs.some((_, i) => errors[`pack${i}`]) && (
                <span style={{ fontSize: 12, color: 'var(--color-danger-light)' }}>⚠ كل عبوة تحتاج اسماً وعدداً ≥ 2 وسعراً أكبر من صفر</span>
              )}
              {packs.length < 3 && (
                <button
                  type="button"
                  onClick={() => setPacks((arr) => [...arr, { label: '', factor: '', price: '' }])}
                  className="btn btn-ghost btn-sm"
                >
                  + إضافة عبوة
                </button>
              )}
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
                مثال: علبة = 12 قطعة بسعر 55 ₪ — تُخصم 12 من المخزون عند بيع علبة
              </p>
            </div>
          )}

          {/* Expiry date (goods + weighted) */}
          {!isService && (
            <Input
              label="تاريخ انتهاء الصلاحية (اختياري)"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              hint="يمنع البيع بعد الانتهاء وينبه قبلها بـ 30 يوم"
            />
          )}



          {/* Profit preview */}
          {form.salePrice && (form.costPrice || isService) && (
            <div style={{
              background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 10,
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {isWeighted ? 'الربح من كل كيلو' : isService ? 'الربح من الخدمة' : 'الربح من كل وحدة'}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-success-light)' }}>
                {(parseFloat(form.salePrice || '0') - parseFloat(form.costPrice || '0')).toFixed(2)} ₪
              </span>
            </div>
          )}
        </div>
      </Modal>

      <BarcodeScanner
        open={scannerOpen}
        onDetected={(code) => {
          setForm((f) => ({ ...f, barcode: code }))
          setScannerOpen(false)
        }}
        onClose={() => setScannerOpen(false)}
      />
    </>
  )
}
