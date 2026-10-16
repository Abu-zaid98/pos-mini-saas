/**
 * debtsAndReturns.test.ts — اختبارات تكامل (Dexie + fake-indexeddb)
 *
 * تغطي:
 *  1. addCustomerDebt: أنواع الدين الثلاثة (رصيد/بضاعة/سلفة) وأثر السلفة على المحفظة.
 *  2. getCustomerLedger: استثناء حركات المحفظة السالبة وعرض قيود الدين بعنوانها.
 *  3. returnPurchaseItems: مرتجع المورد (خصم دين / استرداد نقدي) وأثره على المخزون والمحفظة.
 *  4. deletePurchase: منع حذف فاتورة عليها مرتجعات.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, type Purchase } from '../../db/db'
import { addCustomer, addCustomerDebt, getCustomerLedger } from '../useCustomers'
import { returnPurchaseItems, deletePurchase } from '../usePurchases'
import { computeBalances } from '../../utils/wallet'

const D = () => new Date('2026-10-10T10:00:00')

async function seedProduct(quantity = 100): Promise<number> {
  const id = await db.products.add({
    barcode: 'b1',
    name: 'سكر',
    salePrice: 10,
    costPrice: 6,
    quantity,
    lowStockAlert: 5,
    category: '',
    type: 'goods',
    createdAt: D(),
    updatedAt: D(),
  })
  return id as number
}

async function seedPurchase(productId: number, over: Partial<Purchase> = {}): Promise<number> {
  const id = await db.purchases.add({
    supplierName: 'مورد',
    items: [
      {
        productId,
        productName: 'سكر',
        barcode: 'b1',
        quantity: 20,
        oldQuantity: 80,
        newQuantity: 100,
        costPrice: 6,
        totalCost: 120,
        unit: 'piece',
      },
    ],
    totalAmount: 120,
    paidAmount: 0,
    debtAmount: 120,
    paymentType: 'debt',
    paymentMethod: 'cash',
    date: D(),
    createdAt: D(),
    ...over,
  })
  return id as number
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('addCustomerDebt — أنواع الدين اليدوي', () => {
  it('رصيد سابق: يزيد الدين بلا أي حركة على المحفظة', async () => {
    const id = await addCustomer({ name: 'علي' })
    await addCustomerDebt({ customerId: id, amount: 150, kind: 'balance' })
    const c = await db.customers.get(id)
    expect(c?.totalDebt).toBe(150)
    expect(await db.payments.count()).toBe(0)
  })

  it('بضاعة آجلة: يزيد الدين بلا أثر على المحفظة', async () => {
    const id = await addCustomer({ name: 'هدى' })
    await addCustomerDebt({ customerId: id, amount: 80, kind: 'goods' })
    const c = await db.customers.get(id)
    expect(c?.totalDebt).toBe(80)
    expect(await db.payments.count()).toBe(0)
  })

  it('سلفة نقدية: تزيد الدين وتخصم من المحفظة بحركة سالبة من نوع loan', async () => {
    const id = await addCustomer({ name: 'سالم' })
    await addCustomerDebt({ customerId: id, amount: 200, kind: 'loan', method: 'cash' })

    const c = await db.customers.get(id)
    expect(c?.totalDebt).toBe(200)

    const payments = await db.payments.toArray()
    expect(payments).toHaveLength(1)
    expect(payments[0].amount).toBe(-200)
    expect(payments[0].method).toBe('cash')
    expect(payments[0].kind).toBe('loan')
    expect(payments[0].invoiceId).toBeNull()

    // الأثر الفعلي على رصيد المحفظة: خروج 200
    const balances = computeBalances([payments[0]], [], [], [])
    expect(balances.cash).toBe(-200)
  })

  it('يرفض مبلغاً غير موجب', async () => {
    const id = await addCustomer({ name: 'زينة' })
    await expect(addCustomerDebt({ customerId: id, amount: 0 })).rejects.toThrow()
  })
})

describe('getCustomerLedger — عرض الحركات', () => {
  it('يستثني السلفة (حركة محفظة) ويعرض قيد الدين اليدوي بعنوانه', async () => {
    const id = await addCustomer({ name: 'منى' })
    await addCustomerDebt({ customerId: id, amount: 100, kind: 'loan', method: 'cash', note: 'سلفة طارئة' })

    const ledger = await getCustomerLedger(id)
    expect(ledger).toHaveLength(1)
    expect(ledger[0].type).toBe('invoice')
    expect(ledger[0].title).toBe('سلفة طارئة')
    expect(ledger[0].amount).toBe(100)
    // لا يوجد سند قبض سالب ظاهر للعميل
    expect(ledger.some((l) => l.type === 'payment')).toBe(false)
  })
})

describe('returnPurchaseItems — مرتجع المورد', () => {
  it('الخصم من دين المورد: ينقص المخزون والدين ويسجّل المرتجع', async () => {
    const pid = await seedProduct(100)
    const purId = await seedPurchase(pid)

    await returnPurchaseItems({
      purchaseId: purId,
      items: [{ productId: pid, productName: 'سكر', quantity: 5, unit: 'piece', costPrice: 6, refundAmount: 30 }],
      refundMethod: 'debt',
    })

    const prod = await db.products.get(pid)
    expect(prod?.quantity).toBe(95)

    const pur = await db.purchases.get(purId)
    expect(pur?.debtAmount).toBe(90)
    expect(pur?.returnedAmount).toBe(30)
    expect(pur?.returnedItems).toHaveLength(1)
    expect(pur?.returnedItems?.[0].refundMethod).toBe('debt')
    // لا حركة محفظة عند الخصم من الدين
    expect(pur?.supplierPayments ?? []).toHaveLength(0)
  })

  it('الاسترداد النقدي: ينقص المخزون ويضيف حركة سالبة ترفع رصيد المحفظة', async () => {
    const pid = await seedProduct(100)
    const purId = await seedPurchase(pid, { paidAmount: 120, debtAmount: 0, paymentType: 'cash' })

    await returnPurchaseItems({
      purchaseId: purId,
      items: [{ productId: pid, productName: 'سكر', quantity: 5, unit: 'piece', costPrice: 6, refundAmount: 30 }],
      refundMethod: 'cash',
      paymentMethod: 'cash',
    })

    const prod = await db.products.get(pid)
    expect(prod?.quantity).toBe(95)

    const pur = await db.purchases.get(purId)
    // تم تسجيل الدفعة الأولى (120) ثم حركة الاسترداد (-30)
    expect((pur?.supplierPayments ?? []).map((sp) => sp.amount)).toEqual([120, -30])

    const balances = computeBalances([], [pur!], [], [])
    expect(balances.cash).toBe(-90) // -(120) + 30
  })

  it('يرفض خصم دين أكبر من المتبقي على المورد', async () => {
    const pid = await seedProduct(100)
    const purId = await seedPurchase(pid, { debtAmount: 50 })

    await expect(
      returnPurchaseItems({
        purchaseId: purId,
        items: [{ productId: pid, productName: 'سكر', quantity: 20, unit: 'piece', costPrice: 6, refundAmount: 120 }],
        refundMethod: 'debt',
      }),
    ).rejects.toThrow(/أكبر من دين/)

    // لم يتغير المخزون عند الفشل
    const prod = await db.products.get(pid)
    expect(prod?.quantity).toBe(100)
  })

  it('يرفض الإرجاع بلا أصناف', async () => {
    const pid = await seedProduct()
    const purId = await seedPurchase(pid)
    await expect(returnPurchaseItems({ purchaseId: purId, items: [], refundMethod: 'debt' })).rejects.toThrow()
  })
})

describe('deletePurchase — حماية الفواتير', () => {
  it('تمنع حذف فاتورة شراء عليها مرتجعات', async () => {
    const pid = await seedProduct(100)
    // دين 30 فقط ثم نرجعه بالكامل: المتبقي صفر وبلا دفعات ⇒ الحماية الوحيدة هي وجود المرتجعات
    const purId = await seedPurchase(pid, { debtAmount: 30 })
    await returnPurchaseItems({
      purchaseId: purId,
      items: [{ productId: pid, productName: 'سكر', quantity: 5, unit: 'piece', costPrice: 6, refundAmount: 30 }],
      refundMethod: 'debt',
    })

    const afterReturn = await db.purchases.get(purId)
    expect(afterReturn?.debtAmount).toBe(0)
    expect(afterReturn?.supplierPayments ?? []).toHaveLength(0)

    await expect(deletePurchase(purId)).rejects.toThrow(/مرتجعات/)
    expect(await db.purchases.get(purId)).toBeDefined()
    // المخزون لم يُعد للحالة الأصلية لأن الحذف فشل
    expect((await db.products.get(pid))?.quantity).toBe(95)
  })

  it('تسمح بحذف فاتورة بلا دين ولا دفعات ولا مرتجعات وتعيد المخزون', async () => {
    const pid = await seedProduct(100)
    const purId = await seedPurchase(pid, { debtAmount: 0, paidAmount: 0, supplierPayments: undefined })

    await deletePurchase(purId)
    expect(await db.purchases.get(purId)).toBeUndefined()
    const prod = await db.products.get(pid)
    expect(prod?.quantity).toBe(80) // 100 − 20 (الكمية الموردة)
  })
})
