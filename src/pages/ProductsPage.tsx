import { useState, useMemo } from 'react'
import { useProducts, deleteProduct } from '../hooks/useProducts'
import { useCategories } from '../hooks/useCategories'
import { ProductForm } from '../components/products/ProductForm'
import { CategoryManagerModal } from '../components/products/CategoryManagerModal'
import { QuickRestockModal } from '../components/products/QuickRestockModal'
import { BarcodeScanner } from '../components/ui/BarcodeScanner'
import { Badge, StatCard, SearchBar, EmptyState, Icon } from '../components/ui'
import type { Product } from '../db/db'
import { PRODUCT_TYPES } from '../db/db'
import { getProductType, isLowStock, isOutOfStock, stockLabel, isExpired, isNearExpiry, daysToExpiry, formatServiceDuration } from '../utils/units'

export function ProductsPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [restockProduct, setRestockProduct] = useState<Product | null>(null)
  const [restockModalOpen, setRestockModalOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannedBarcode, setScannedBarcode] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<Product | null>(null)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)

  const categoriesList = useCategories()
  const catIconMap = useMemo(() => {
    const map: Record<string, string> = { 'الكل': '🏷️' }
    categoriesList.forEach((c) => { map[c.name] = c.icon })
    return map
  }, [categoriesList])

  const products = useProducts(search, activeCategory === 'الكل' ? '' : activeCategory)

  const handleEdit = (p: Product) => {
    setEditProduct(p)
    setFormOpen(true)
  }

  const handleDelete = async (p: Product) => {
    if (p.id) await deleteProduct(p.id)
    setDeleteConfirm(null)
  }

  const handleScanResult = (barcode: string) => {
    setScannedBarcode(barcode)
    setSearch(barcode)
    setScannerOpen(false)
    // If product found with this barcode, it'll show in list
    // If not found, open form to add it
    setTimeout(() => {
      const found = products.find((p) => p.barcode === barcode)
      if (!found) {
        setEditProduct(null)
        setFormOpen(true)
      }
    }, 300)
  }

  const totalValue = products.reduce((sum, p) => sum + p.salePrice * (getProductType(p) === 'weighted' ? p.quantity / 1000 : p.quantity), 0)
  const lowStockCount = products.filter((p) => isLowStock(p) || isOutOfStock(p)).length
  const expiryCount = products.filter((p) => isExpired(p) || isNearExpiry(p)).length

  return (
    <div className="page-frame">
      {/* Stats bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, margin: '14px 0' }}>
            <StatCard label="إجمالي المنتجات" value={products.length} icon="package" variant="info" />
            <StatCard label="مخزون منخفض" value={lowStockCount} icon="warning" variant="warning" />
            <StatCard label="تنبيه صلاحية" value={expiryCount} icon="clock" variant="danger" />
            <StatCard label="قيمة المخزون" value={`${totalValue.toFixed(0)} ₪`} icon="banknotes" variant="success" />
          </div>

          {/* Full-width Search bar */}
          <div style={{ marginBottom: 12 }}>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="ابحث باسم المنتج أو الباركود..."
              actions={
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  title="مسح باركود بالكاميرا"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-primary-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 4,
                  }}
                >
                  <Icon name="camera" size={20} />
                </button>
              }
            />
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => { setEditProduct(null); setScannedBarcode(''); setFormOpen(true) }}
              style={{
                flex: 2,
                height: 44,
                background: 'var(--brand-gradient)',
                border: 'none',
                borderRadius: 12,
                cursor: 'pointer',
                color: 'white',
                fontSize: 13,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: 'var(--shadow-primary), inset 0 1px 0 rgba(255,255,255,0.25)',
                fontFamily: 'var(--font-main)',
              }}
            >
              <Icon name="plus" size={16} />
              <span>إضافة منتج جديد</span>
            </button>

            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              style={{
                flex: 1,
                height: 44,
                background: 'var(--color-primary-glow)',
                border: '1px solid var(--color-border-active)',
                borderRadius: 12,
                cursor: 'pointer',
                color: 'var(--color-primary-light)',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                fontFamily: 'var(--font-main)',
              }}
            >
              <Icon name="camera" size={16} />
              <span>باركود</span>
            </button>

            <button
              type="button"
              onClick={() => setCategoryModalOpen(true)}
              style={{
                flex: 1,
                height: 44,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                fontFamily: 'var(--font-main)',
              }}
            >
              <Icon name="tag" size={15} />
              <span>الأقسام</span>
            </button>
          </div>

          {/* Category filter */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14, alignItems: 'center' }}>
            <button
              onClick={() => setActiveCategory('')}
              style={{
                flexShrink: 0,
                padding: '6px 14px',
                borderRadius: 50,
                border: activeCategory === '' ? '1px solid transparent' : '1px solid var(--color-border)',
                background: activeCategory === '' ? 'var(--brand-gradient)' : 'var(--color-bg-card)',
                color: activeCategory === '' ? '#fff' : 'var(--color-text-muted)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--font-main)',
                display: 'flex', alignItems: 'center', gap: 5,
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
                    padding: '6px 14px',
                    borderRadius: 50,
                    border: isActive ? '1px solid transparent' : '1px solid var(--color-border)',
                    background: isActive ? 'var(--brand-gradient)' : 'var(--color-bg-card)',
                    color: isActive ? '#fff' : 'var(--color-text-muted)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              )
            })}
          </div>

          {/* Product list */}
          {products.length === 0 ? (
            <EmptyState
              icon="package"
              title={search ? 'لا توجد نتائج بحث' : 'لا توجد منتجات مسجلة بعد'}
              description={search ? 'جرّب كلمة بحث مختلفة أو امسح الفلتر' : 'اضغط على زر "إضافة منتج جديد" أعلاه للبدء بإضافة الأصناف'}
              action={
                <button
                  type="button"
                  onClick={() => { setEditProduct(null); setScannedBarcode(''); setFormOpen(true) }}
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
                  <span>إضافة منتج جديد</span>
                </button>
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {products.map((p) => {
                const pType = getProductType(p)
                const typeMeta = PRODUCT_TYPES.find((t) => t.id === pType)!
                const expired = isExpired(p)
                const nearExpiry = !expired && isNearExpiry(p)
                const expDays = daysToExpiry(p)
                const isLow = isLowStock(p)
                const isOut = expired || isOutOfStock(p)
                const profit = p.salePrice - p.costPrice

                return (
                  <div
                    key={p.id}
                    style={{
                      background: 'var(--color-bg-card)',
                      border: `1px solid ${isOut ? 'rgba(239,68,68,0.35)' : isLow ? 'rgba(245,158,11,0.35)' : 'var(--color-border)'}`,
                      borderRadius: 12,
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    {/* Top Row: Category Icon, Name, Pricing, Badges */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{
                        width: 38, height: 38,
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20, flexShrink: 0,
                        overflow: 'hidden',
                      }}>
                        {p.image ? (
                          <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          catIconMap[p.category] ?? '📦'
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'wrap' }}>
                          <p style={{ fontSize: 14, fontWeight: 800, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </p>
                          {isOut && !expired && <Badge variant="danger">نفد</Badge>}
                          {expired && <Badge variant="danger">⛔ منتهي</Badge>}
                          {!isOut && !expired && isLow && <Badge variant="warning">منخفض</Badge>}
                          {nearExpiry && (
                            <Badge variant="warning">
                              ⏳ {expDays}{expDays === 1 ? 'ي' : 'أ'}
                            </Badge>
                          )}
                          <Badge variant="purple">{typeMeta.icon} {typeMeta.label}</Badge>
                        </div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--color-text-primary)', direction: 'ltr' }}>
                            {pType === 'weighted' ? `${p.salePrice.toFixed(2)} ₪/كغ` : `${p.salePrice.toFixed(2)} ₪`}
                          </span>
                          {pType === 'service' && p.openPrice && (
                            <span style={{
                              fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 800,
                              background: 'rgba(139,92,246,0.15)', color: 'var(--color-purple-light)',
                            }}>
                              💲 مفتوح
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--color-success-light)', fontWeight: 600 }}>
                            ربح: {profit.toFixed(2)} ₪
                          </span>
                          <span style={{
                            fontSize: 10,
                            padding: '1px 7px',
                            borderRadius: 20,
                            background: isOut ? 'rgba(239,68,68,0.12)' : isLow ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
                            color: isOut ? 'var(--color-danger-light)' : isLow ? 'var(--color-warning-light)' : 'var(--color-success-light)',
                            fontWeight: 700,
                          }}>
                            المخزون: {stockLabel(p)}
                          </span>
                        </div>

                        {p.barcode && (
                          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, direction: 'ltr', textAlign: 'right' }}>
                            🔖 {p.barcode}
                          </p>
                        )}
                        {pType === 'service' && p.durationMinutes ? (
                          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                            ⏱ مدة التنفيذ: {formatServiceDuration(p.durationMinutes)}
                          </p>
                        ) : null}
                      </div>
                    </div>


                    {/* Bottom Action Bar: Horizontal, wide, and comfortable */}
                    <div style={{
                      display: 'flex',
                      gap: 6,
                      paddingTop: 8,
                      borderTop: '1px solid var(--color-border)',
                      alignItems: 'center',
                    }}>
                      {pType !== 'service' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRestockProduct(p)
                          setRestockModalOpen(true)
                        }}
                        title="توريد بضاعة وزيادة المخزون"
                        style={{
                          flex: 2,
                          height: 38,
                          borderRadius: 10,
                          background: 'rgba(16,185,129,0.15)',
                          border: '1.5px solid rgba(16,185,129,0.4)',
                          color: 'var(--color-success-light)',
                          fontWeight: 800,
                          fontSize: 13,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          fontFamily: 'var(--font-main)',
                        }}
                      >
                        <Icon name="arrow-down" size={15} strokeWidth={2.2} />
                        <span>توريد كمية</span>
                      </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleEdit(p)}
                        title="تعديل بيانات المنتج"
                        style={{
                          flex: 1,
                          height: 38,
                          borderRadius: 10,
                          background: 'rgba(59,130,246,0.12)',
                          border: '1px solid rgba(59,130,246,0.3)',
                          color: 'var(--color-primary-light)',
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          fontFamily: 'var(--font-main)',
                        }}
                      >
                        <Icon name="pencil" size={14} />
                        <span>تعديل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(p)}
                        title="حذف المنتج"
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.25)',
                          color: 'var(--color-danger-light)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            style={{
              background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
              borderRadius: 20, padding: 24, width: '100%', maxWidth: 340, textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 18,
                background: 'rgba(239, 68, 68, 0.14)',
                border: '1px solid rgba(239, 68, 68, 0.28)',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 14px',
              }}
            >
              <Icon name="trash" size={28} color="var(--color-danger)" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>حذف المنتج؟</h3>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 20 }}>
              سيتم حذف "<strong style={{ color: 'var(--color-text-primary)' }}>{deleteConfirm.name}</strong>" نهائياً
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn btn-ghost"
              >إلغاء</button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="btn btn-danger"
              >حذف</button>
            </div>
          </div>
        </div>
      )}

      {/* Product form */}
      <ProductForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditProduct(null); setScannedBarcode('') }}
        product={editProduct}
        initialBarcode={scannedBarcode}
      />

      {/* Quick Restock Modal */}
      <QuickRestockModal
        open={restockModalOpen}
        onClose={() => { setRestockModalOpen(false); setRestockProduct(null) }}
        product={restockProduct}
      />



      {/* Barcode scanner */}
      <BarcodeScanner
        open={scannerOpen}
        onDetected={handleScanResult}
        onClose={() => setScannerOpen(false)}
      />

      {/* Category Manager Modal */}
      <CategoryManagerModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
      />
    </div>
  )
}
