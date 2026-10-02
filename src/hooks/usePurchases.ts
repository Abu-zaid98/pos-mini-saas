import { useLiveQuery } from 'dexie-react-hooks'
import { db, type PurchaseItem, type PaymentMethod, type SaleUnit } from '../db/db'
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
}) {
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
  const totalCost = pricingQty * costPrice

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
    supplierName: params.supplierName?.trim() || 'توريد سريع',
    items: [item],
    totalAmount: totalCost,
    paymentMethod: params.paymentMethod || 'cash',
    date: params.date || new Date(),
    notes: params.notes?.trim() || '',
    createdAt: new Date(),
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
  date?: Date
  notes?: string
}) {
  if (!params.items.length) throw new Error('لا توجد أصناف في فاتورة المشتريات')

  const purchaseItems: PurchaseItem[] = []
  let totalAmount = 0

  for (const it of params.items) {
    const product = await db.products.get(it.productId)
    if (!product) continue

    const pType = getProductType(product)
    const oldQuantity = product.quantity
    const newQuantity = oldQuantity + it.quantity
    const pricingQty = pType === 'weighted' ? it.quantity / GRAMS_PER_KG : it.quantity
    const itemTotal = pricingQty * it.costPrice
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

  return db.purchases.add({
    supplierName: params.supplierName?.trim() || '',
    invoiceNumber: params.invoiceNumber?.trim() || '',
    items: purchaseItems,
    totalAmount,
    paymentMethod: params.paymentMethod || 'cash',
    date: params.date || new Date(),
    notes: params.notes?.trim() || '',
    createdAt: new Date(),
  })
}

export async function deletePurchase(id: number) {
  return db.purchases.delete(id)
}
