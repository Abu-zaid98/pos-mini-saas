import { useState, useMemo, useEffect } from 'react'
import { useProducts, deleteProduct } from '../hooks/useProducts'
import { useCategories } from '../hooks/useCategories'
import { ProductForm } from '../components/products/ProductForm'
import { CategoryManagerModal } from '../components/products/CategoryManagerModal'
import { QuickRestockModal } from '../components/products/QuickRestockModal'
import { ProductionModal } from '../components/products/ProductionModal'
import { useProductions, deleteProduction } from '../hooks/useProductions'
import { PurchasesPage } from './PurchasesPage'
import { BarcodeScanner } from '../components/ui/BarcodeScanner'
import { Badge } from '../components/ui/Badge'
import type { Product } from '../db/db'
import { PRODUCT_TYPES } from '../db/db'
import { getProductType, isLowStock, isOutOfStock, stockLabel, isExpired, isNearExpiry, daysToExpiry, formatServiceDuration } from '../utils/units'

export function ProductsPage() {
  const [mainTab, setMainTab] = useState<'inventory' | 'production' | 'purchases'>('inventory')
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
  const [produceProduct, setProduceProduct] = useState<Product | null>(null)
  const [productionModalOpen, setProductionModalOpen] = useState(false)
  const [productionToDelete, setProductionToDelete] = useState<number | null>(null)
  const productions = useProductions()

  // التبديل بين التبويبات يبدأ دائماً من الأعلى — وإلا يقفز تبويب قصير (كالإنتاج) لمنتصف الفراغ
  useEffect(() => {
    document.querySelector('.page-content')?.scrollTo({ top: 0 })
  }, [mainTab])

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
      {/* Top Segmented Hub Switcher */}
      <div style={{
        display: 'flex',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        padding: 4,
        marginBottom: 16,
        gap: 6,
      }}>
        <button
          type="button"
          onClick={() => setMainTab('inventory')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 10,
            border: 'none',
            background: mainTab === 'inventory' ? 'var(--color-primary)' : 'transparent',
            color: mainTab === 'inventory' ? '#fff' : 'var(--color-text-secondary)',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'var(--font-main)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.15s ease',
          }}
        >
          <span>📦</span>
          <span>الأصناف والمخزون</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('production')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 10,
            border: 'none',
            background: mainTab === 'production' ? 'var(--color-primary)' : 'transparent',
            color: mainTab === 'production' ? '#fff' : 'var(--color-text-secondary)',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'var(--font-main)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.15s ease',
          }}
        >
          <span>🏭</span>
          <span>سجل الإنتاج</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('purchases')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 10,
            border: 'none',
            background: mainTab === 'purchases' ? 'var(--color-primary)' : 'transparent',
            color: mainTab === 'purchases' ? '#fff' : 'var(--color-text-secondary)',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'var(--font-main)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.15s ease',
          }}
        >
          <span>📥</span>
          <span>فواتير وسجل التوريد</span>
        </button>
      </div>

      {mainTab === 'purchases' ? (
        <PurchasesPage />
      ) : mainTab === 'production' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {productions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🏭</div>
              <p style={{ fontSize: 15, fontWeight: 700 }}>لا توجد دفعات إنتاج بعد</p>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                من بطاقة أي منتج موزون بوصفة اضغط "إنتاج دفعة"
              </p>
            </div>
          ) : (
            productions.map((prod) => (
              <div
                key={prod.id}
                style={{
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 14,
                  padding: '12px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>
                    🏭 {prod.productName} — {(prod.producedQty / 1000).toFixed(2)} كغ
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
                    {new Date(prod.date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                    {' · '}تكلفة الكيلو: {prod.unitCost.toFixed(2)} ₪
                    {' · '}الإجمالي: {prod.totalCost.toFixed(2)} ₪
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProductionToDelete(prod.id!)}
                  title="حذف الدفعة وعكس أثرها على المخزون"
                  style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: 'var(--color-danger-light)',
                    cursor: 'pointer', fontSize: 15,
                  }}
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'إجمالي المنتجات', value: products.length, icon: '📦', color: '#3b82f6' },
              { label: 'مخزون منخفض', value: lowStockCount, icon: '⚠️', color: '#f59e0b' },
              { label: 'تنبيه صلاحية', value: expiryCount, icon: '⏳', color: '#ef4444' },
              { label: 'قيمة المخزون', value: `${totalValue.toFixed(0)} ₪`, icon: '💰', color: '#10b981', small: true },
            ].map((s) => (
              <div key={s.label} style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                padding: '10px 8px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 18, marginBottom: 2 }}>{s.icon}</div>
                <div style={{ fontSize: s.small ? 13 : 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Full-width Search bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--color-bg-card)',
            border: '1.5px solid var(--color-border)',
            borderRadius: 14,
            padding: '10px 16px',
            marginBottom: 10,
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
              placeholder="ابحث باسم المنتج أو الباركود..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setScannedBarcode('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 18 }}
              >
                ✕
              </button>
            )}
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
              <span>+</span>
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
                gap: 4,
                fontFamily: 'var(--font-main)',
              }}
            >
              <span>📷</span>
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
                gap: 4,
                fontFamily: 'var(--font-main)',
              }}
            >
              <span>⚙️</span>
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
                border: activeCategory === '' ? '1.5px solid rgba(59,130,246,0.6)' : '1px solid var(--color-border)',
                background: activeCategory === '' ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                color: activeCategory === '' ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
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
                    border: isActive ? '1.5px solid rgba(59,130,246,0.6)' : '1px solid var(--color-border)',
                    background: isActive ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                    color: isActive ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
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
            <div className="empty-state">
              <div className="empty-icon">🏷️</div>
              <p style={{ fontSize: 16, fontWeight: 700 }}>
                {search ? 'لا توجد نتائج' : 'لا توجد منتجات بعد'}
              </p>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {search ? 'جرّب كلمة بحث مختلفة' : 'اضغط على "+ إضافة منتج جديد" لإضافة أول صنف'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                      borderRadius: 16,
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    {/* Top Row: Category Icon, Name, Pricing, Badges */}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{
                        width: 46, height: 46,
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, flexShrink: 0,
                        overflow: 'hidden',
                      }}>
                        {p.image ? (
                          <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          catIconMap[p.category] ?? '📦'
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <p style={{ fontSize: 15, fontWeight: 800, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </p>
                          {isOut && !expired && <Badge variant="danger">نفد</Badge>}
                          {expired && <Badge variant="danger">⛔ منتهي الصلاحية</Badge>}
                          {!isOut && !expired && isLow && <Badge variant="warning">منخفض</Badge>}
                          {nearExpiry && (
                            <Badge variant="warning">
                              ⏳ ينتهي خلال {expDays} {expDays === 1 ? 'يوم' : 'أيام'}
                            </Badge>
                          )}
                          <Badge variant="purple">{typeMeta.icon} {typeMeta.label}</Badge>
                        </div>

                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--color-text-primary)', direction: 'ltr' }}>
                            {pType === 'weighted' ? `${p.salePrice.toFixed(2)} ₪/كغ` : `${p.salePrice.toFixed(2)} ₪`}
                          </span>
                          {pType === 'service' && p.openPrice && (
                            <span style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 800,
                              background: 'rgba(139,92,246,0.15)', color: 'var(--color-purple-light)',
                            }}>
                              💲 سعر مفتوح
                            </span>
                          )}
                          <span style={{ fontSize: 12, color: 'var(--color-success-light)', fontWeight: 600 }}>
                            ربح: {profit.toFixed(2)} ₪
                          </span>
                          <span style={{
                            fontSize: 11,
                            padding: '2px 8px',
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

                    {/* Produce button for weighted items */}
                    {pType === 'weighted' && (
                      <button
                        type="button"
                        onClick={() => {
                          setProduceProduct(p)
                          setProductionModalOpen(true)
                        }}
                        title={p.recipe && p.recipe.length > 0 ? 'تسجيل دفعة إنتاج جديدة' : 'أضف وصفة أولاً من تعديل المنتج'}
                        style={{
                          width: '100%',
                          height: 40,
                          borderRadius: 10,
                          background: p.recipe && p.recipe.length > 0
                            ? 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.25))'
                            : 'rgba(255,255,255,0.04)',
                          border: '1.5px solid rgba(139,92,246,0.45)',
                          color: 'var(--color-purple-light)',
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
                        <span>🏭</span>
                        <span>
                          {p.recipe && p.recipe.length > 0
                            ? `إنتاج دفعة (${p.recipe.length} مكونات)`
                            : 'إنتاج دفعة — أضف الوصفة أولاً'}
                        </span>
                      </button>
                    )}

                    {/* Bottom Action Bar: Horizontal, wide, and comfortable */}
                    <div style={{
                      display: 'flex',
                      gap: 8,
                      paddingTop: 10,
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
                          fontSize: 8,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          fontFamily: 'var(--font-main)',
                        }}
                      >
                        <span>📥</span>
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
                        <span>✏️</span>
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
                          fontSize: 16,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
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
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>حذف المنتج؟</h3>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 20 }}>
              سيتم حذف "<strong style={{ color: 'var(--color-text-primary)' }}>{deleteConfirm.name}</strong>" نهائياً
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '12px', borderRadius: 12, cursor: 'pointer', fontWeight: 700,
                  background: 'rgba(255,255,255,0.08)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)', fontFamily: 'var(--font-main)', fontSize: 14,
                }}
              >إلغاء</button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                style={{
                  padding: '12px', borderRadius: 12, cursor: 'pointer', fontWeight: 700,
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none', color: 'white', fontFamily: 'var(--font-main)', fontSize: 14,
                }}
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

      {/* Production Modal */}
      <ProductionModal
        open={productionModalOpen}
        onClose={() => { setProductionModalOpen(false); setProduceProduct(null) }}
        product={produceProduct}
      />

      {/* Delete production confirm (reverts stock effect) */}
      {productionToDelete !== null && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}
          onClick={() => setProductionToDelete(null)}
        >
          <div
            style={{
              background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
              borderRadius: 20, padding: 24, width: '100%', maxWidth: 340, textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏭</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>حذف دفعة الإنتاج؟</h3>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 20 }}>
              سيتم إنقاص المنتج وإرجاع المواد الخام للمخزون تلقائياً
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={() => setProductionToDelete(null)}
                style={{
                  padding: '12px', borderRadius: 12, cursor: 'pointer', fontWeight: 700,
                  background: 'rgba(255,255,255,0.08)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)', fontFamily: 'var(--font-main)', fontSize: 14,
                }}
              >إلغاء</button>
              <button
                onClick={async () => {
                  await deleteProduction(productionToDelete)
                  setProductionToDelete(null)
                }}
                style={{
                  padding: '12px', borderRadius: 12, cursor: 'pointer', fontWeight: 700,
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none', color: 'white', fontFamily: 'var(--font-main)', fontSize: 14,
                }}
              >حذف وعكس الأثر</button>
            </div>
          </div>
        </div>
      )}

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
