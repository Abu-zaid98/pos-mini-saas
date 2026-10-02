import { useState, useEffect } from 'react'
import type { InvoiceItem, ProductType, SalePack, SaleUnit } from '../db/db'
import { getItemUnit, lineNet } from '../utils/units'

export interface CartItem extends InvoiceItem {
  maxStock: number
  /** نوع الصنف وقت الإضافة (للعرض والخطوات والتحقق) */
  kind?: ProductType
  /** عبوات المنتج المتاحة (لاختيار العبوة في السلة) */
  packOptions?: SalePack[]
  /** معرّف فريد للسطر — يميّز وزنات متطابقة (3×100غ مرتين = سطران) */
  lineId: string
}

export interface AddToCartInput {
  id?: number
  name: string
  salePrice: number
  costPrice?: number
  /** المخزون المتاح بالوحدات الأساسية (قطع أو جرام) — للعرض والتحقق */
  quantity: number
  /** الكمية المضافة للسلة (افتراضي 1) */
  amount?: number
  /** نوع الصنف (يُستخدم للخطوات والتحقق والعرض) */
  kind?: ProductType
  /** الوحدة المباعة بها (للموزون تُحسب من سعر الكيلو) */
  unit?: SaleUnit
  /** سعر الوحدة المعروضة (للموزون بالجرام/الكيلو) — إن لم يُمرر يُستخدم salePrice */
  unitPrice?: number
  /** تكلفة الوحدة المعروضة */
  unitCost?: number
  /** عبوة البيع المختارة (للسلع فقط) — السعر والتكلفة لوحدة العبوة */
  pack?: SalePack
  /** عبوات المنتج المتاحة للاختيار في السلة */
  packOptions?: SalePack[]
  /** مدة الخدمة بالدقائق (لقطة من الصنف وقت الإضافة) */
  durationMinutes?: number
  /** عدد القطع/الوزنات في السطر (للموزون: 3 × 100غ) — يُخزن الوزن الكلي في amount */
  pieces?: number
  /** سطر مستقل دائماً — لا يُدمج مع سطور مطابقة (لأسعار متفق عليها مختلفة) */
  unique?: boolean
}

const STORAGE_KEY = 'pos_active_cart_v1'

function genLineId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function withLineIds(items: CartItem[]): CartItem[] {
  let changed = false
  const fixed = items.map((it) => {
    if (!it.lineId) {
      changed = true
      return { ...it, lineId: genLineId() }
    }
    return it
  })
  return changed ? fixed : items
}

export function useCart() {
  const [cart, setCartState] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return withLineIds(parsed)
      }
    } catch (e) {
      console.error('Failed to load cart from storage', e)
    }
    return []
  })

  // Sync to localStorage
  useEffect(() => {
    try {
      if (cart.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cart))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch (e) {
      console.error('Failed to save cart to storage', e)
    }
  }, [cart])

  const addToCart = (product: AddToCartInput) => {
    const unit: SaleUnit = product.unit ?? 'piece'
    const qty = Number(product.amount ?? 1) || 0
    if (qty <= 0) return
    const price = product.unitPrice ?? product.salePrice
    const costPrice = product.unitCost ?? product.costPrice ?? 0
    const kind = product.kind ?? (unit === 'piece' ? 'goods' : 'weighted')
    const packKey = product.pack?.label ?? ''
    const pieces = Math.round(Number(product.pieces) || 0) || undefined
    setCartState((prev) => {
      // الدمج فقط للوزنات المفردة المتطابقة — سطور القطع تبقى مستقلة،
      // والسطور الفريدة (unique) لا تُدمج أبداً
      if (!pieces && !product.unique) {
        const existing = prev.find((item) =>
          item.productId === product.id && getItemUnit(item) === unit &&
          (item.pack?.label ?? '') === packKey && !item.pieces
        )
        if (existing) {
          return prev.map((item) =>
            item.lineId === existing.lineId
              ? { ...item, qty: Math.round((item.qty + qty) * 1000) / 1000 }
              : item
          )
        }
      }
      return [
        ...prev,
        {
          productId: product.id ?? 0,
          name: product.name,
          qty: Math.round(qty * 1000) / 1000,
          unit,
          price,
          costPrice,
          maxStock: product.quantity,
          kind,
          pack: product.pack,
          packOptions: product.packOptions,
          durationMinutes: product.durationMinutes,
          pieces,
          lineId: genLineId(),
        },
      ]
    })
  }

  const matchLine = (
    item: CartItem,
    productId: number,
    unit?: SaleUnit,
    packLabel?: string | null,
    lineId?: string | null
  ) =>
    (lineId
      ? item.lineId === lineId
      : item.productId === productId &&
        (!unit || getItemUnit(item) === unit) &&
        (packLabel === undefined || (item.pack?.label ?? null) === packLabel))

  const updateQty = (productId: number, delta: number, unit?: SaleUnit, packLabel?: string | null, lineId?: string | null) => {
    setCartState((prev) =>
      prev
        .map((item) => {
          if (matchLine(item, productId, unit, packLabel, lineId)) {
            const newQty = Math.round((item.qty + delta) * 1000) / 1000
            return newQty > 0 ? { ...item, qty: newQty } : null
          }
          return item
        })
        .filter((item): item is CartItem => item !== null)
    )
  }

  /**
   * تغيير عبوة البند (للسلع): تُشتق أسعار الحبة من السطر الحالي
   * وتُعاد الكمية إلى 1 من العبوة الجديدة
   */
  const updatePack = (productId: number, fromPackLabel: string | null, pack: SalePack | null, lineId?: string | null) => {
    setCartState((prev) =>
      prev.map((item) => {
        if (item.productId !== productId || getItemUnit(item) !== 'piece') return item
        if (lineId ? item.lineId !== lineId : (item.pack?.label ?? null) !== fromPackLabel) return item
        const factorNow = item.pack?.factor ?? 1
        const piecePrice = (Number(item.price) || 0) / factorNow
        const pieceCost = (Number(item.costPrice) || 0) / factorNow
        if (!pack) {
          return { ...item, pack: undefined, qty: 1, price: Math.round(piecePrice * 100) / 100, costPrice: Math.round(pieceCost * 100) / 100 }
        }
        return {
          ...item,
          pack,
          qty: 1,
          price: pack.price,
          costPrice: Math.round(pieceCost * pack.factor * 100) / 100,
        }
      })
    )
  }

  /**
   * تغيير عدد القطع في سطر وزن مجمّع — يحافظ على وزن القطعة
   * (3×100غ + قطعة = 4×100غ)
   */
  const setItemPieces = (lineId: string, pieces: number) => {
    setCartState((prev) =>
      prev
        .map((item) => {
          if (item.lineId !== lineId) return item
          const n = Math.round(Number(pieces) || 0)
          if (n <= 0) return null
          const perPiece = (Number(item.qty) || 0) / (Number(item.pieces) || 1)
          return {
            ...item,
            pieces: n,
            qty: Math.round(perPiece * n * 1000) / 1000,
          }
        })
        .filter((item): item is CartItem => item !== null)
    )
  }

  /**
   * ضبط خصم سطر (عرض على صنف) — undefined لمسحه
   */
  const setItemDiscount = (
    productId: number,
    discount: { type: 'percent' | 'fixed'; value: number } | undefined,
    unit?: SaleUnit,
    packLabel?: string | null,
    lineId?: string | null
  ) => {
    setCartState((prev) =>
      prev.map((item) =>
        matchLine(item, productId, unit, packLabel, lineId) ? { ...item, discount } : item
      )
    )
  }

  /**
   * تعديل سعر السطر مباشرة (لخدمات السعر المفتوح وأي تعديل وقت الفوترة)
   */
  const setItemPrice = (productId: number, price: number, unit?: SaleUnit, packLabel?: string | null, lineId?: string | null) => {
    const safe = Math.max(0, Math.round((Number(price) || 0) * 100) / 100)
    setCartState((prev) =>
      prev.map((item) =>
        matchLine(item, productId, unit, packLabel, lineId) ? { ...item, price: safe } : item
      )
    )
  }

  const setDirectQty = (productId: number, qty: number, unit?: SaleUnit, packLabel?: string | null, lineId?: string | null) => {
    if (qty <= 0) {
      removeFromCart(productId, unit, packLabel, lineId)
      return
    }
    setCartState((prev) =>
      prev.map((item) =>
        matchLine(item, productId, unit, packLabel, lineId)
          ? { ...item, qty: Math.round(qty * 1000) / 1000 }
          : item
      )
    )
  }

  const removeFromCart = (productId: number, unit?: SaleUnit, packLabel?: string | null, lineId?: string | null) => {
    setCartState((prev) =>
      prev.filter((item) => !matchLine(item, productId, unit, packLabel, lineId))
    )
  }

  const clearCart = () => {
    setCartState([])
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.error('Failed to clear cart storage', e)
    }
  }

  const cartTotal = cart.reduce((sum, item) => sum + lineNet(item), 0)
  const cartCount = cart.reduce((sum, item) => sum + (getItemUnit(item) === 'piece' && !item.pack ? item.qty : 1), 0)

  return {
    cart,
    addToCart,
    updateQty,
    updatePack,
    setItemPieces,
    setItemPrice,
    setItemDiscount,
    setDirectQty,
    removeFromCart,
    clearCart,
    cartTotal,
    cartCount,
  }
}
