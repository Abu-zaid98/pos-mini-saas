/**
 * cart-pack.test.ts — تبديل العبوة في السلة
 * يغطي البلاغ: حبة بيع 5 وتكلفة 3 + كرتونة مخفضة، ثم رجوع للحبة
 * كان يظهر سعر التكلفة (3) بدل البيع (5)
 */
import { describe, it, expect } from 'vitest'
import { applyPackChange, type CartItem } from '../useCart'

function pieceLine(): CartItem {
  return {
    productId: 1,
    name: 'صنف',
    qty: 2,
    unit: 'piece',
    price: 5,
    costPrice: 3,
    maxStock: 100,
    kind: 'goods',
    packOptions: [{ label: 'كرتونة', factor: 20, price: 60 }],
    lineId: 'l1',
    basePrice: 5,
    baseCost: 3,
  }
}

const carton = { label: 'كرتونة', factor: 20, price: 60 }

describe('تبديل العبوة حبة <-> كرتونة', () => {
  it('حبة -> كرتونة: سعر العبوة وتكلفتها المشتقة', () => {
    const out = applyPackChange(pieceLine(), carton)
    expect(out.price).toBe(60)
    expect(out.costPrice).toBe(60) // 3 × 20
    expect(out.qty).toBe(1)
    expect(out.pack?.label).toBe('كرتونة')
  })

  it('كرتونة -> حبة: يسترجع سعر البيع الأصلي 5 لا المشتق 3', () => {
    const packed = applyPackChange(pieceLine(), carton)
    const back = applyPackChange(packed, null)
    expect(back.pack).toBeUndefined()
    expect(back.price).toBe(5)
    expect(back.costPrice).toBe(3)
    expect(back.qty).toBe(1)
  })

  it('تبديلات متكررة لا تنحرف', () => {
    let line = pieceLine()
    for (let i = 0; i < 3; i++) {
      line = applyPackChange(line, carton)
      expect(line.price).toBe(60)
      line = applyPackChange(line, null)
      expect(line.price).toBe(5)
      expect(line.costPrice).toBe(3)
    }
  })

  it('سطور قديمة بلا base: اشتقاق احتياطي كما قبل', () => {
    const legacy: CartItem = { ...pieceLine(), basePrice: undefined, baseCost: undefined }
    const packed = applyPackChange(legacy, carton)
    expect(packed.price).toBe(60)
    // 60/20 = 3 اشتقاق قديم — موثق كسلوك احتياطي فقط
    expect(applyPackChange(packed, null).price).toBe(3)
  })
})
