/**
 * purchasePacks.test.ts — اختبارات تكامل للشراء/التوريد بالعبوة (علبة/كرتونة)
 *
 * تغطي:
 *  1. addPurchaseInvoice مع عبوة: المخزون + الحبات، متوسط التكلفة يستخدم تكلفة الحبة.
 *  2. حفظ لقطة العبوة (label/factor + packQty/packCost) على بند الشراء.
 *  3. تعدد العبوات (علبة ثم كرتونة) والمتوسط المرجح بين توريدين.
 *  4. addQuickRestock مع عبوة.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../db/db'
import { addPurchaseInvoice, addQuickRestock } from '../usePurchases'

const D = () => new Date('2026-10-12T10:00:00')

async function seedProduct(over: Record<string, unknown> = {}): Promise<number> {
  const id = await db.products.add({
    barcode: 'b1',
    name: 'ماء',
    salePrice: 5,
    costPrice: 0,
    quantity: 0,
    lowStockAlert: 5,
    category: '',
    type: 'goods',
    packs: [
      { label: 'علبة', factor: 12, price: 55, cost: 60 },
      { label: 'كرتونة', factor: 72, price: 300, cost: 240 },
    ],
    createdAt: D(),
    updatedAt: D(),
    ...over,
  })
  return id as number
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('addPurchaseInvoice — الشراء بالعبوة', () => {
  it('شراء 3 علب (12 حبة) بتكلفة 60 للعلبة ⟹ 36 حبة وتكلفة حبة 5', async () => {
    const pid = await seedProduct()

    const purchaseId = await addPurchaseInvoice({
      supplierName: 'مورد',
      items: [
        {
          productId: pid,
          quantity: 36, // 3 × 12
          costPrice: 5, // 60 ÷ 12
          pack: { label: 'علبة', factor: 12 },
          packQty: 3,
          packCost: 60,
        },
      ],
      paidAmount: 180,
      debtAmount: 0,
      paymentType: 'cash',
      date: D(),
    })

    const product = await db.products.get(pid)
    expect(product?.quantity).toBe(36)
    expect(product?.costPrice).toBe(5)

    const purchase = await db.purchases.get(purchaseId as number)
    expect(purchase?.totalAmount).toBe(180)
    const item = purchase?.items[0]
    expect(item?.quantity).toBe(36)
    expect(item?.costPrice).toBe(5)
    expect(item?.pack).toEqual({ label: 'علبة', factor: 12 })
    expect(item?.packQty).toBe(3)
    expect(item?.packCost).toBe(60)
  })

  it('شراء كرتونة (72 حبة) بتكلفة 240 ⟹ تكلفة الحبة تُحفظ بدقة', async () => {
    const pid = await seedProduct()
    const purchaseId = await addPurchaseInvoice({
      items: [
        {
          productId: pid,
          quantity: 72,
          costPrice: 240 / 72,
          pack: { label: 'كرتونة', factor: 72 },
          packQty: 1,
          packCost: 240,
        },
      ],
      date: D(),
    })

    const product = await db.products.get(pid)
    expect(product?.quantity).toBe(72)
    const purchase = await db.purchases.get(purchaseId as number)
    expect(purchase?.totalAmount).toBe(240)
    expect(purchase?.items[0].pack?.label).toBe('كرتونة')
  })

  it('المتوسط المرجح بين توريدين بحبتين مختلفتين', async () => {
    const pid = await seedProduct()
    // أولاً: 36 حبة بتكلفة 5 للحبة
    await addPurchaseInvoice({
      items: [{ productId: pid, quantity: 36, costPrice: 5 }],
      date: D(),
    })
    // ثانياً: 72 حبة بتكلفة 6 للحبة (كرتونة)
    await addPurchaseInvoice({
      items: [
        {
          productId: pid,
          quantity: 72,
          costPrice: 6,
          pack: { label: 'كرتونة', factor: 72 },
          packQty: 1,
          packCost: 432,
        },
      ],
      date: D(),
    })

    const product = await db.products.get(pid)
    expect(product?.quantity).toBe(108)
    // (36×5 + 72×6) ÷ 108 = 612 ÷ 108 = 5.6667 ⟹ 5.67
    expect(product?.costPrice).toBe(5.67)
  })

  it('الشراء بالحبة (بلا عبوة) لا يخزّن لقطة عبوة', async () => {
    const pid = await seedProduct()
    const purchaseId = await addPurchaseInvoice({
      items: [{ productId: pid, quantity: 10, costPrice: 4 }],
      date: D(),
    })
    const purchase = await db.purchases.get(purchaseId as number)
    expect(purchase?.items[0].pack).toBeUndefined()
    expect(purchase?.items[0].packQty).toBeUndefined()
  })
})

describe('addQuickRestock — التوريد السريع بالعبوة', () => {
  it('توريد كرتونة (72 حبة) بتكلفة عبوة 240 ⟹ 72 حبة وتكلفة ~3.33 للحبة', async () => {
    const pid = await seedProduct({ costPrice: 0, quantity: 0 })
    const unitCost = 240 / 72

    await addQuickRestock({
      productId: pid,
      addedQuantity: 72,
      newCostPrice: unitCost,
      pack: { label: 'كرتونة', factor: 72 },
      packQty: 1,
      packCost: 240,
      supplierName: 'مورد',
      paymentType: 'cash',
      date: D(),
    })

    const product = await db.products.get(pid)
    expect(product?.quantity).toBe(72)
    expect(product?.costPrice).toBe(3.33)

    const purchases = await db.purchases.toArray()
    expect(purchases).toHaveLength(1)
    expect(purchases[0].totalAmount).toBe(240)
    expect(purchases[0].items[0].pack?.label).toBe('كرتونة')
    expect(purchases[0].items[0].packQty).toBe(1)
    expect(purchases[0].items[0].packCost).toBe(240)
  })
})
