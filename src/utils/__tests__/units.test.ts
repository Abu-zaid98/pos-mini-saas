/**
 * units.test.ts — اختبارات منطق الأصناف والوحدات
 * أي انكسار هنا = مخزون خاطئ أو أسعار خاطئة في الفواتير
 */
import { describe, it, expect } from 'vitest'
import {
  getProductType,
  getItemUnit,
  toBaseQty,
  fromBaseQty,
  lineTotal,
  lineProfit,
  formatQty,
  priceLabel,
  stockLabel,
  isOutOfStock,
  isLowStock,
  deductStock,
  restoreStock,
  exceedsStock,
  unitStep,
  recipeCost,
  averageCostPerKg,
  daysToExpiry,
  isExpired,
  isNearExpiry,
  toDateInputValue,
  packPieces,
  formatServiceDuration,
  lineDiscountAmount,
  lineNet,
  formatLineDiscount,
  perPieceQty,
  formatLineQty,
} from '../units'
import type { Product } from '../../db/db'

function goods(over: Partial<Product> = {}): Product {
  return {
    id: 1, barcode: '1', name: 'شيبس', salePrice: 5, costPrice: 3,
    quantity: 10, lowStockAlert: 5, category: 'x',
    createdAt: new Date(), updatedAt: new Date(),
    type: 'goods', ...over,
  }
}

describe('back-compat: الأصناف والبنود القديمة بدون نوع/وحدة', () => {
  it('صنف بلا type = سلعة', () => {
    expect(getProductType({} as Product)).toBe('goods')
    expect(getProductType(undefined)).toBe('goods')
  })
  it('بند بلا unit = قطعة', () => {
    expect(getItemUnit({})).toBe('piece')
    expect(getItemUnit(undefined)).toBe('piece')
  })
})

describe('التحويل بين الوحدات', () => {
  it('كيلو إلى جرام وبالعكس', () => {
    expect(toBaseQty(0.5, 'kg')).toBe(500)
    expect(toBaseQty(250, 'g')).toBe(250)
    expect(toBaseQty(3, 'piece')).toBe(3)
    expect(fromBaseQty(1500, 'kg')).toBe(1.5)
  })
  it('إجمالي السطر يعمل لأي وحدة', () => {
    expect(lineTotal({ qty: 2, price: 5 })).toBe(10)
    expect(lineTotal({ qty: 0.5, price: 40 })).toBe(20)
    expect(lineTotal({ qty: 250, price: 0.04 })).toBe(10)
  })
  it('الربح = الكمية × (سعر − تكلفة)', () => {
    expect(lineProfit({ qty: 0.5, price: 40, costPrice: 25 })).toBe(7.5)
  })
})

describe('العرض', () => {
  it('تنسيق الكمية بدون أصفار زائدة', () => {
    expect(formatQty(2, 'piece')).toBe('2 قطعة')
    expect(formatQty(0.5, 'kg')).toBe('0.5 كغ')
    expect(formatQty(250, 'g')).toBe('250 غ')
  })
  it('سعر الكتالوج حسب النوع', () => {
    expect(priceLabel(goods())).toBe('5 ₪')
    expect(priceLabel(goods({ type: 'weighted', salePrice: 40 }))).toBe('40 ₪/كغ')
  })
  it('نص المخزون حسب النوع', () => {
    expect(stockLabel(goods())).toBe('10 قطعة')
    expect(stockLabel(goods({ type: 'weighted', quantity: 3500 }))).toBe('3.5 كغ')
    expect(stockLabel(goods({ type: 'service' }))).toBe('خدمة')
  })
})

describe('المخزون', () => {
  it('الخدمات لا تنفد ولا تنخفض ولا تُخصم', () => {
    const s = goods({ type: 'service', quantity: 0 })
    expect(isOutOfStock(s)).toBe(false)
    expect(isLowStock(s)).toBe(false)
    expect(deductStock(s, 5, 'piece')).toBe(0)
    expect(exceedsStock(999, 'piece', 0, 'service')).toBe(false)
  })
  it('خصم القطع مع حد صفري', () => {
    expect(deductStock(goods({ quantity: 10 }), 3, 'piece')).toBe(7)
    expect(deductStock(goods({ quantity: 2 }), 5, 'piece')).toBe(0)
  })
  it('خصم الوزن بالجرام من مخزون الجرامات', () => {
    const w = goods({ type: 'weighted', quantity: 2000 })
    expect(deductStock(w, 0.5, 'kg')).toBe(1500)
    expect(deductStock(w, 250, 'g')).toBe(1750)
  })
  it('استرجاع المخزون عند حذف فاتورة', () => {
    expect(restoreStock(goods({ quantity: 7 }), 3, 'piece')).toBe(10)
    expect(restoreStock(goods({ type: 'weighted', quantity: 1500 }), 0.5, 'kg')).toBe(2000)
  })
  it('تجاوز المخزون يقارن بالوحدات الأساسية', () => {
    expect(exceedsStock(2.5, 'kg', 2000, 'weighted')).toBe(true)
    expect(exceedsStock(1.5, 'kg', 2000, 'weighted')).toBe(false)
    expect(exceedsStock(11, 'piece', 10, 'goods')).toBe(true)
  })
  it('خطوات الأزرار', () => {
    expect(unitStep('piece')).toBe(1)
    expect(unitStep('kg')).toBe(0.25)
    expect(unitStep('g')).toBe(100)
  })
})

describe('وصفات الإنتاج', () => {
  const sugar = goods({ id: 10, name: 'سكر', type: 'weighted', quantity: 5000, costPrice: 4 })
  const boxes = goods({ id: 11, name: 'علب', quantity: 100, costPrice: 1 })
  const byId = new Map([[10, sugar], [11, boxes]])
  // وصفة 1 كغ كنافة: 600غ سكر + علبتان
  const recipe = [
    { productId: 10, productName: 'سكر', qty: 600, unit: 'g' as const },
    { productId: 11, productName: 'علب', qty: 2, unit: 'piece' as const },
  ]

  it('تضرب الوصفة بوزن الدفعة وتحسب التكلفة', () => {
    const c = recipeCost(recipe, byId, 5, 10)
    // سكر: 600غ × 5 = 3000غ = 3كغ × 4 = 12 + علب: 10 × 1 = 10 → مواد 22 + هالك 10% = 24.2
    expect(c.materialCost).toBe(22)
    expect(c.totalCost).toBe(24.2)
    expect(c.unitCostPerKg).toBe(4.84)
    expect(c.feasible).toBe(true)
    expect(c.lines[0].requiredBase).toBe(3000)
  })

  it('تكشف نقص المواد والمكوّنات المحذوفة', () => {
    const c = recipeCost(recipe, byId, 20, 0)
    expect(c.feasible).toBe(false) // سكر يحتاج 12كغ والمتوفر 5كغ
    expect(c.lines[0].enough).toBe(false)
    const c2 = recipeCost([{ productId: 99, productName: 'مفقود', qty: 1, unit: 'piece' as const }], byId, 1, 0)
    expect(c2.feasible).toBe(false)
    expect(c2.missingNames).toEqual(['مفقود'])
  })

  it('متوسط التكلفة المرجح', () => {
    // مخزون 2كغ بتكلفة 4 + إنتاج 3كغ بتكلفة 5 → (8+15)/5 = 4.6
    expect(averageCostPerKg(2, 4, 3, 5)).toBe(4.6)
    expect(averageCostPerKg(0, 0, 3, 5)).toBe(5)
    // يعمل للقطع أيضاً: 10 قطع بتكلفة 3 + توريد 10 بتكلفة 5 → 4
    expect(averageCostPerKg(10, 3, 10, 5)).toBe(4)
  })
})

describe('الصلاحية', () => {
  const day = 86_400_000
  const now = Date.now()
  it('بلا تاريخ = بلا تنبيه', () => {
    expect(daysToExpiry({})).toBeNull()
    expect(isExpired(goods())).toBe(false)
    expect(isNearExpiry(goods())).toBe(false)
  })
  it('منتهي وقريب', () => {
    expect(isExpired(goods({ expiryDate: new Date(now - 2 * day) }))).toBe(true)
    expect(isNearExpiry(goods({ expiryDate: new Date(now + 10 * day) }))).toBe(true)
    expect(isNearExpiry(goods({ expiryDate: new Date(now + 60 * day) }))).toBe(false)
    expect(isNearExpiry(goods({ expiryDate: new Date(now - day) }))).toBe(false)
  })
  it('الخدمات بلا صلاحية', () => {
    expect(isExpired(goods({ type: 'service', expiryDate: new Date(now - day) }))).toBe(false)
  })
  it('تنسيق حقل التاريخ', () => {
    expect(toDateInputValue(new Date(2026, 4, 9))).toBe('2026-05-09')
    expect(toDateInputValue(null)).toBe('')
  })
})

describe('العبوات', () => {
  it('الخصم بالحبة = الكمية × المعامل', () => {
    expect(packPieces(2, { label: 'علبة', factor: 12, price: 55 })).toBe(24)
    expect(packPieces(3, undefined)).toBe(3)
  })
})

describe('مدة الخدمة', () => {
  it('تنسيق الدقائق والساعات', () => {
    expect(formatServiceDuration(30)).toBe('30 دقيقة')
    expect(formatServiceDuration(60)).toBe('ساعة')
    expect(formatServiceDuration(120)).toBe('ساعتان')
    expect(formatServiceDuration(90)).toBe('ساعة و30 دقيقة')
    expect(formatServiceDuration(0)).toBe('')
    expect(formatServiceDuration(null)).toBe('')
  })
})

describe('خصم السطر', () => {
  it('نسبة من السطر', () => {
    expect(lineDiscountAmount({ qty: 2, price: 50, discount: { type: 'percent', value: 10 } })).toBe(10)
    expect(lineNet({ qty: 2, price: 50, discount: { type: 'percent', value: 10 } })).toBe(90)
  })
  it('مبلغ ثابت محدود بالإجمالي', () => {
    expect(lineDiscountAmount({ qty: 1, price: 20, discount: { type: 'fixed', value: 5 } })).toBe(5)
    expect(lineDiscountAmount({ qty: 1, price: 20, discount: { type: 'fixed', value: 99 } })).toBe(20)
    expect(lineNet({ qty: 1, price: 20, discount: { type: 'fixed', value: 99 } })).toBe(0)
  })
  it('النسبة فوق 100 تُحصر', () => {
    expect(lineDiscountAmount({ qty: 1, price: 40, discount: { type: 'percent', value: 150 } })).toBe(40)
  })
  it('بلا خصم = الإجمالي الكامل', () => {
    expect(lineDiscountAmount({ qty: 3, price: 7 })).toBe(0)
    expect(lineNet({ qty: 3, price: 7 })).toBe(21)
  })
  it('نص الخصم', () => {
    expect(formatLineDiscount({ type: 'percent', value: 10 })).toBe('10%')
    expect(formatLineDiscount({ type: 'fixed', value: 5 })).toBe('5 ₪')
  })
})

describe('قطع الوزن (3 × 100 غ)', () => {
  it('وزن القطعة = الكلي ÷ العدد', () => {
    expect(perPieceQty(300, 3)).toBe(100)
    expect(perPieceQty(0.3, 3)).toBe(0.1)
    expect(perPieceQty(500, null)).toBeNull()
    expect(perPieceQty(500, 1)).toBeNull()
  })
  it('عرض السطر الموحد', () => {
    expect(formatLineQty({ qty: 300, unit: 'g', pieces: 3 })).toBe('3 × 100 غ')
    expect(formatLineQty({ qty: 0.3, unit: 'kg', pieces: 3 })).toBe('3 × 0.1 كغ')
    expect(formatLineQty({ qty: 2, unit: 'piece', pack: { label: 'علبة', factor: 12, price: 55 } })).toBe('2 علبة')
    expect(formatLineQty({ qty: 2, unit: 'piece' })).toBe('2 قطعة')
    expect(formatLineQty({ qty: 250, unit: 'g' })).toBe('250 غ')
  })
})
