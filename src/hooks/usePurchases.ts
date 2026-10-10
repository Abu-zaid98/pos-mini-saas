import { useLiveQuery } from 'dexie-react-hooks'
import { db, type PurchaseItem, type PaymentMethod, type PaymentType, type SaleUnit } from '../db/db'
import { GRAMS_PER_KG, averageCostPerKg, getProductType } from '../utils/units'

export function usePurchases() {
  const purchases = useLiveQuery(async () => {
    return db.purchases.orderBy('date').reverse().toArray()
  }, [])

  return purchases ?? []
}

export async function addQuickRestock(params: {
  productId: number
  /** الكمية بالوحدات الأساسية (قطع للسلع، جرام للموزون) */
  addedQuantity: number
  /** سعر التكلفة بوحدة التسعير (للحبة أو للكيلو) */
  newCostPrice?: number
  supplierName?: string
  notes?: string
  date?: Date
  paymentMethod?: PaymentMethod
  paidAmount?: number
  debtAmount?: number
  paymentType?: PaymentType
}) {
  return db.transaction('rw', [db.products, db.purchases], async () => {
    const product = await db.products.get(params.productId)
    if (!product) throw new Error('المنتج غير موجود')

    const pType = getProductType(product)
    const unit: SaleUnit = pType === 'weighted' ? 'kg' : 'piece'
    const oldQuantity = product.quantity
    const newQuantity = oldQuantity + params.addedQuantity
    const inputCost = params.newCostPrice !== undefined && params.newCostPrice > 0
      ? params.newCostPrice
      : product.costPrice
    // متوسط التكلفة المرجح (بنفس الوحدة: قطع أو كغ)
    const toPricing = (base: number) => pType === 'weighted' ? base / GRAMS_PER_KG : base
    const costPrice = Math.round(averageCostPerKg(toPricing(oldQuantity), Number(product.costPrice) || 0, toPricing(params.addedQuantity), inputCost) * 100) / 100

    // الإجمالي بوحدات التسعير (كيلو للموزون حتى لا يتضخم ×1000)
    const pricingQty = pType === 'weighted' ? params.addedQuantity / GRAMS_PER_KG : params.addedQuantity
    const totalCost = Math.round(pricingQty * costPrice * 100) / 100

    const paid = params.paidAmount !== undefined ? Math.max(0, params.paidAmount) : totalCost
    const debt = params.debtAmount !== undefined ? Math.max(0, params.debtAmount) : Math.max(0, totalCost - paid)
    const paymentType = params.paymentType || (debt > 0 ? (paid > 0 ? 'partial' : 'debt') : 'cash')

    // 1. Update product quantity and costPrice
    await db.products.update(params.productId, {
      quantity: newQuantity,
      costPrice,
      updatedAt: new Date(),
    })

    // 2. Create purchase log item
    const item: PurchaseItem = {
      productId: product.id!,
      productName: product.name,
      barcode: product.barcode,
      quantity: params.addedQuantity,
      oldQuantity,
      newQuantity,
      costPrice,
      totalCost,
      unit,
    }

    // 3. Record purchase invoice
    return db.purchases.add({
      supplierName: params.supplierName?.trim() || 'شراء سريع',
      items: [item],
      totalAmount: totalCost,
      paidAmount: paid,
      debtAmount: debt,
      paymentType,
      paymentMethod: params.paymentMethod || 'cash',
      date: params.date || new Date(),
      notes: params.notes?.trim() || '',
      createdAt: new Date(),
    })
  })
}

export async function addPurchaseInvoice(params: {
  supplierName?: string
  invoiceNumber?: string
  items: Array<{
    productId: number
    /** الكمية بالوحدات الأساسية (قطع أو جرام) */
    quantity: number
    /** التكلفة بوحدة التسعير (للحبة أو للكيلو) */
    costPrice: number
  }>
  paymentMethod?: PaymentMethod
  paidAmount?: number
  debtAmount?: number
  paymentType?: PaymentType
  date?: Date
  notes?: string
}) {
  if (!params.items.length) throw new Error('لا توجد أصناف في فاتورة المشتريات')

  return db.transaction('rw', [db.products, db.purchases], async () => {
    const purchaseItems: PurchaseItem[] = []
    let totalAmount = 0

    for (const it of params.items) {
      const product = await db.products.get(it.productId)
      if (!product) continue

      const pType = getProductType(product)
      const oldQuantity = product.quantity
      const newQuantity = oldQuantity + it.quantity
      const pricingQty = pType === 'weighted' ? it.quantity / GRAMS_PER_KG : it.quantity
      const itemTotal = Math.round(pricingQty * it.costPrice * 100) / 100
      // متوسط التكلفة المرجح بدل آخر سعر
      const toPricing = (base: number) => pType === 'weighted' ? base / GRAMS_PER_KG : base
      const avgCost = Math.round(averageCostPerKg(toPricing(oldQuantity), Number(product.costPrice) || 0, pricingQty, it.costPrice) * 100) / 100

      // Update product stock and average cost price
      await db.products.update(it.productId, {
        quantity: newQuantity,
        costPrice: avgCost,
        updatedAt: new Date(),
      })

      purchaseItems.push({
        productId: product.id!,
        productName: product.name,
        barcode: product.barcode,
        quantity: it.quantity,
        oldQuantity,
        newQuantity,
        costPrice: it.costPrice,
        totalCost: itemTotal,
        unit: pType === 'weighted' ? 'kg' : 'piece',
      })

      totalAmount += itemTotal
    }

    totalAmount = Math.round(totalAmount * 100) / 100
    const paid = params.paidAmount !== undefined ? Math.max(0, params.paidAmount) : totalAmount
    const debt = params.debtAmount !== undefined ? Math.max(0, params.debtAmount) : Math.max(0, totalAmount - paid)
    const paymentType = params.paymentType || (debt > 0 ? (paid > 0 ? 'partial' : 'debt') : 'cash')

    return db.purchases.add({
      supplierName: params.supplierName?.trim() || '',
      invoiceNumber: params.invoiceNumber?.trim() || '',
      items: purchaseItems,
      totalAmount,
      paidAmount: paid,
      debtAmount: debt,
      paymentType,
      paymentMethod: params.paymentMethod || 'cash',
      date: params.date || new Date(),
      notes: params.notes?.trim() || '',
      createdAt: new Date(),
    })
  })
}

export async function deletePurchase(id: number) {
  return db.transaction('rw', [db.purchases, db.products], async () => {
    const purchase = await db.purchases.get(id)
    if (!purchase) return

    // Revert product quantities added by this purchase
    for (const item of purchase.items) {
      if (item.productId > 0) {
        const product = await db.products.get(item.productId)
        if (product) {
          const newQty = Math.max(0, (product.quantity || 0) - (item.quantity || 0))
          await db.products.update(item.productId, {
            quantity: newQty,
            updatedAt: new Date(),
          })
        }
      }
    }

    await db.purchases.delete(id)
  })
}

export interface AddSupplierDebtPaymentParams {
  purchaseId: number
  amount: number
  paymentMethod: PaymentMethod
  date?: Date
  notes?: string
}

/**
 * تسجيل دفعة سداد لدين مورد على فاتورة توريد:
 * - تخصم المبلغ من المحفظة المختارة.
 * - تخفض دين المورد المتبقي على الفاتورة.
 * - تحفظ حركة السداد في سجل مدفوعات المورد.
 */
export async function addSupplierDebtPayment(params: AddSupplierDebtPaymentParams) {
  const amount = Number(params.amount) || 0
  if (amount <= 0) throw new Error('مبلغ السداد يجب أن يكون أكبر من صفر')

  return db.transaction('rw', [db.purchases], async () => {
    const purchase = await db.purchases.get(params.purchaseId)
    if (!purchase) throw new Error('فاتورة التوريد غير موجودة')

    const currentDebt = purchase.debtAmount || 0
    if (currentDebt <= 0) throw new Error('هذه الفاتورة مسددة بالكامل ولا يوجد دين متبقٍ')

    if (amount > currentDebt) {
      throw new Error(`مبلغ السداد (${amount} ₪) أكبر من الدين المتبقي (${currentDebt} ₪)`)
    }

    const now = params.date || new Date()
    const newPayment: import('../db/db').SupplierPayment = {
      amount,
      paymentMethod: params.paymentMethod,
      date: now,
      notes: params.notes?.trim() || '',
    }

    // إذا لم تكن هناك دفعات مسجلة ولكن كان هناك مدفوع أولي، نحفظ الدفعة الأولى للأرشيف
    const existingPayments = [...(purchase.supplierPayments || [])]
    if (existingPayments.length === 0 && (purchase.paidAmount || 0) > 0) {
      existingPayments.push({
        amount: purchase.paidAmount!,
        paymentMethod: purchase.paymentMethod || 'cash',
        date: purchase.date,
        notes: 'الدفعة الأولى عند التوريد',
      })
    }

    existingPayments.push(newPayment)

    const newPaid = Math.round(((purchase.paidAmount || 0) + amount) * 100) / 100
    const newDebt = Math.max(0, Math.round((currentDebt - amount) * 100) / 100)
    const newPaymentType = newDebt === 0 ? 'cash' : 'partial'

    await db.purchases.update(params.purchaseId, {
      supplierPayments: existingPayments,
      paidAmount: newPaid,
      debtAmount: newDebt,
      paymentType: newPaymentType,
    })
  })
}
