import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Production, type RecipeLine } from '../db/db'
import { GRAMS_PER_KG, averageCostPerKg, getProductType, recipeCost } from '../utils/units'

export function useProductions(productId?: number) {
  const productions = useLiveQuery(async () => {
    let all = await db.productions.orderBy('date').reverse().toArray()
    if (productId) all = all.filter((p) => p.productId === productId)
    return all
  }, [productId])

  return productions ?? []
}

export async function addProduction(params: {
  productId: number
  /** وزن الدفعة بالكيلو */
  batchKg: number
  date?: Date
  notes?: string
}): Promise<Production> {
  const batchKg = Number(params.batchKg) || 0
  if (batchKg <= 0) throw new Error('أدخل وزن الدفعة بالكيلو')

  const product = await db.products.get(params.productId)
  if (!product) throw new Error('المنتج غير موجود')
  if (getProductType(product) === 'service') throw new Error('الخدمات لا تُنتَج')
  const recipe: RecipeLine[] = product.recipe ?? []
  if (recipe.length === 0) throw new Error('لا توجد وصفة لهذا المنتج — أضف المكوّنات أولاً')

  // تحميل المكوّنات الحالية
  const ingredients = await db.products.where('id').anyOf(recipe.map((r) => r.productId)).toArray()
  const byId = new Map(ingredients.map((p) => [p.id!, p]))
  const cost = recipeCost(recipe, byId, batchKg, product.wastePercent || 0)

  if (cost.missingNames.length > 0) {
    throw new Error(`مكوّنات محذوفة من المخزون: ${cost.missingNames.join('، ')} — عدّل الوصفة أولاً`)
  }
  const lacking = cost.lines.filter((l) => !l.enough)
  if (lacking.length > 0) {
    throw new Error(`مواد غير كافية: ${lacking.map((l) => l.productName).join('، ')} — ورّد المواد أولاً`)
  }

  const now = new Date()
  const producedQty = Math.round(batchKg * GRAMS_PER_KG)

  return db.transaction('rw', [db.products, db.productions], async () => {
    // 1. خصم المكوّنات
    for (const line of cost.lines) {
      const ing = byId.get(line.productId)!
      await db.products.update(line.productId, {
        quantity: Math.max(0, Math.round((ing.quantity - line.requiredBase) * 1000) / 1000),
        updatedAt: now,
      })
    }

    // 2. زيادة المنتج + متوسط التكلفة المرجح
    const fresh = (await db.products.get(params.productId))!
    const oldStockKg = fresh.quantity / GRAMS_PER_KG
    const newCost = averageCostPerKg(oldStockKg, Number(fresh.costPrice) || 0, batchKg, cost.unitCostPerKg)
    await db.products.update(params.productId, {
      quantity: Math.round((fresh.quantity + producedQty) * 1000) / 1000,
      costPrice: newCost,
      updatedAt: now,
    })

    // 3. سجل الدفعة
    const id = await db.productions.add({
      productId: params.productId,
      productName: product.name,
      producedQty,
      ingredients: cost.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        qty: l.requiredBase,
        unit: l.unit,
        unitCost: l.unitCost,
        lineCost: l.lineCost,
      })),
      materialCost: cost.materialCost,
      wastePercent: cost.wastePercent,
      totalCost: cost.totalCost,
      unitCost: cost.unitCostPerKg,
      date: params.date || now,
      notes: params.notes?.trim() || '',
      createdAt: now,
    })

    return {
      id: Number(id),
      productId: params.productId,
      productName: product.name,
      producedQty,
      ingredients: cost.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        qty: l.requiredBase,
        unit: l.unit,
        unitCost: l.unitCost,
        lineCost: l.lineCost,
      })),
      materialCost: cost.materialCost,
      wastePercent: cost.wastePercent,
      totalCost: cost.totalCost,
      unitCost: cost.unitCostPerKg,
      date: params.date || now,
      notes: params.notes?.trim() || '',
      createdAt: now,
    }
  })
}

/** حذف دفعة إنتاج مع عكس أثرها (إنقاص المنتج وإرجاع المكوّنات) */
export async function deleteProduction(id: number) {
  return db.transaction('rw', [db.products, db.productions], async () => {
    const prod = await db.productions.get(id)
    if (!prod) return

    const product = await db.products.get(prod.productId)
    if (product) {
      await db.products.update(prod.productId, {
        quantity: Math.max(0, Math.round((product.quantity - prod.producedQty) * 1000) / 1000),
        updatedAt: new Date(),
      })
    }
    for (const ing of prod.ingredients) {
      const p = await db.products.get(ing.productId)
      if (p) {
        await db.products.update(ing.productId, {
          quantity: Math.round((p.quantity + ing.qty) * 1000) / 1000,
          updatedAt: new Date(),
        })
      }
    }
    await db.productions.delete(id)
  })
}
