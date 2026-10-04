/**
 * units.ts — منطق أنواع الأصناف والوحدات في مكان واحد
 *
 * القواعد:
 * - goods: المخزون قطع (عدد صحيح)، الأسعار للحبة
 * - weighted: المخزون جرام (رقم عشري)، الأسعار للكيلوغرام
 * - service: بلا مخزون — يُباع بسعر ثابت
 * - بند الفاتورة يحفظ (qty + unit + price) حيث price سعر الوحدة نفسها،
 *   وإجمالي السطر دائماً qty × price أياً كانت الوحدة
 * - الوصفة: مكوّنات كل 1 كغ — تُضرب بوزن الدفعة عند الإنتاج
 */
import type { InvoiceItem, Product, ProductType, RecipeLine, SalePack, SaleUnit } from '../db/db'

export const GRAMS_PER_KG = 1000

export function getProductType(p: Pick<Product, 'type'> | undefined | null): ProductType {
  if (p?.type === 'weighted' || p?.type === 'service') return p.type
  return 'goods'
}

export function getItemUnit(item: Pick<InvoiceItem, 'unit'> | undefined | null): SaleUnit {
  if (item?.unit === 'kg' || item?.unit === 'g') return item.unit
  return 'piece'
}

/** تحويل كمية بوحدة معينة إلى جرام (للموزون) أو قطع */
export function toBaseQty(qty: number, unit: SaleUnit): number {
  if (unit === 'kg') return qty * GRAMS_PER_KG
  return qty
}

/** تحويل من المخزون الأساسي إلى وحدة عرض */
export function fromBaseQty(baseQty: number, unit: SaleUnit): number {
  if (unit === 'kg') return baseQty / GRAMS_PER_KG
  return baseQty
}

/** إجمالي سطر الفاتورة — يعمل لأي وحدة */
export function lineTotal(item: Pick<InvoiceItem, 'qty' | 'price'>): number {
  return (Number(item.qty) || 0) * (Number(item.price) || 0)
}

// ── خصم السطر (عرض على صنف) ──

/** مبلغ خصم السطر — محدود بإجمالي السطر ولا يتجاوزه أبداً */
export function lineDiscountAmount(item: Pick<InvoiceItem, 'qty' | 'price' | 'discount'>): number {
  const gross = lineTotal(item)
  const d = item.discount
  if (!d || !(Number(d.value) > 0)) return 0
  const amt = d.type === 'percent'
    ? (gross * Math.min(100, Number(d.value))) / 100
    : Math.min(gross, Number(d.value))
  return Math.round(amt * 100) / 100
}

/** صافي السطر بعد خصمه الخاص (قبل خصم الفاتورة) */
export function lineNet(item: Pick<InvoiceItem, 'qty' | 'price' | 'discount'>): number {
  return Math.round((lineTotal(item) - lineDiscountAmount(item)) * 100) / 100
}

/** نص مختصر للخصم: "10%" أو "5 ₪" */
export function formatLineDiscount(d: NonNullable<InvoiceItem['discount']>): string {
  return d.type === 'percent' ? `${d.value}%` : `${d.value} ₪`
}

// ── قطع الوزن (3 × 100 غ) ──

/** وزن القطعة الواحدة من سطر مجمّع — null إن لم يكن سطر قطع */
export function perPieceQty(qty: number, pieces: number | null | undefined): number | null {
  const n = Math.round(Number(pieces) || 0)
  if (n <= 1) return null
  const total = Number(qty) || 0
  return Math.round((total / n) * 1000) / 1000
}

/** عرض موحد لبند الفاتورة: عبوة | قطع وزن | كمية عادية */
export function formatLineQty(item: Pick<InvoiceItem, 'qty' | 'unit' | 'pack' | 'pieces'>): string {
  const unit = getItemUnit(item)
  if (item.pack) return `${Number(item.qty) || 0} ${item.pack.label}`
  const per = perPieceQty(Number(item.qty) || 0, item.pieces ?? null)
  if (per !== null) {
    const perStr = per % 1 === 0 ? String(per) : String(per)
    return `${item.pieces} × ${perStr} ${unitShort(unit)}`
  }
  return formatQty(Number(item.qty) || 0, unit)
}

/** ربح سطر الفاتورة */
export function lineProfit(item: Pick<InvoiceItem, 'qty' | 'price' | 'costPrice'>): number {
  return (Number(item.qty) || 0) * ((Number(item.price) || 0) - (Number(item.costPrice) || 0))
}

const UNIT_SHORT: Record<SaleUnit, string> = { piece: 'قطعة', kg: 'كغ', g: 'غ' }

export function unitShort(unit: SaleUnit): string {
  return UNIT_SHORT[unit] || 'قطعة'
}

/** تنسيق ذكي للأرقام: 0.5 كغ، 500 غ، 3 قطع — بدون أصفار زائدة */
export function formatQty(qty: number, unit: SaleUnit): string {
  const n = Number(qty) || 0
  const str = n % 1 === 0 ? String(n) : String(Math.round(n * 1000) / 1000)
  return `${str} ${unitShort(unit)}`
}

/** "2 × 25" بصيغة وحدة: "0.5 كغ × 25" */
export function formatQtyPrice(qty: number, unit: SaleUnit, unitPrice: number): string {
  const n = Number(qty) || 0
  const str = n % 1 === 0 ? String(n) : String(Math.round(n * 1000) / 1000)
  return `${str} ${unitShort(unit)} × ${unitPrice}`
}

/** سعر العرض في الكتالوج: "25 ₪" | "25 ₪/كغ" */
export function priceLabel(p: Product, currency = '₪'): string {
  const t = getProductType(p)
  if (t === 'weighted') return `${p.salePrice} ${currency}/كغ`
  return `${p.salePrice} ${currency}`
}

/** نص المخزون: "12 قطعة" | "3.5 كغ" | "خدمة" */
export function stockLabel(p: Product): string {
  const t = getProductType(p)
  if (t === 'service') return 'خدمة'
  if (t === 'weighted') return `${trimNum(p.quantity / GRAMS_PER_KG)} كغ`
  return `${p.quantity} قطعة`
}

/** هل نفد؟ الخدمات لا تنفد أبداً */
export function isOutOfStock(p: Product): boolean {
  const t = getProductType(p)
  if (t === 'service') return false
  return p.quantity <= 0
}

/** هل المخزون منخفض؟ (للخدمات: لا) */
export function isLowStock(p: Product): boolean {
  const t = getProductType(p)
  if (t === 'service') return false
  return p.quantity > 0 && p.quantity <= p.lowStockAlert
}

/**
 * المخزون الجديد بعد بيع بند — يحوّل الوحدة للوحدات الأساسية
 * (قطع للسلع، جرام للموزون، الخدمات لا تُنقص)
 * يُسمح بالسالب: البيع فوق المتاح يبقي الرصيد سالباً لحين توريد جديد
 */
export function deductStock(product: Product, qty: number, unit: SaleUnit): number {
  const t = getProductType(product)
  if (t === 'service') return product.quantity
  const deduct = toBaseQty(Number(qty) || 0, unit)
  return Math.round((product.quantity - deduct) * 1000) / 1000
}

/** عكس الخصم (عند حذف فاتورة) */
export function restoreStock(product: Product, qty: number, unit: SaleUnit): number {
  const t = getProductType(product)
  if (t === 'service') return product.quantity
  const add = toBaseQty(Number(qty) || 0, unit)
  return Math.round((product.quantity + add) * 1000) / 1000
}

/** هل كمية السلة تتجاوز المخزون؟ (مقارنة بالوحدات الأساسية) */
export function exceedsStock(cartQty: number, unit: SaleUnit, maxStockBase: number, type: ProductType): boolean {
  if (type === 'service') return false
  return toBaseQty(Number(cartQty) || 0, unit) > maxStockBase
}

/** خطوة أزرار +/− حسب الوحدة */
export function unitStep(unit: SaleUnit): number {
  if (unit === 'kg') return 0.25
  if (unit === 'g') return 100
  return 1
}

// ── وصفات الإنتاج ──

export interface RecipeCostLine {
  productId: number
  productName: string
  /** المطلوب بالوحدات الأساسية (قطع/جرام) بعد ضرب وزن الدفعة */
  requiredBase: number
  unit: SaleUnit
  unitCost: number
  lineCost: number
  availableBase: number
  enough: boolean
  missing: boolean
}

export interface RecipeCost {
  lines: RecipeCostLine[]
  materialCost: number
  wastePercent: number
  totalCost: number
  /** تكلفة الكيلو للدفعة */
  unitCostPerKg: number
  /** أسماء المكوّنات المحذوفة من المخزون */
  missingNames: string[]
  /** هل تكفي المواد؟ */
  feasible: boolean
}

/**
 * تكلفة وصفة لدفعة بوزن معين.
 * recipe: مكوّنات كل 1 كغ — تُضرب بـ batchKg.
 */
export function recipeCost(
  recipe: RecipeLine[],
  productsById: Map<number, Product>,
  batchKg: number,
  wastePercent = 0
): RecipeCost {
  const lines: RecipeCostLine[] = []
  let materialCost = 0
  const missingNames: string[] = []
  let feasible = true

  for (const line of recipe) {
    const ing = productsById.get(line.productId)
    const requiredBase = Math.round(line.qty * batchKg * 1000) / 1000
    if (!ing) {
      missingNames.push(line.productName)
      feasible = false
      lines.push({
        productId: line.productId,
        productName: line.productName,
        requiredBase,
        unit: line.unit,
        unitCost: 0,
        lineCost: 0,
        availableBase: 0,
        enough: false,
        missing: true,
      })
      continue
    }
    const ingType = getProductType(ing)
    const pricingQty = ingType === 'weighted' ? requiredBase / GRAMS_PER_KG : requiredBase
    const lineCost = Math.round(pricingQty * (Number(ing.costPrice) || 0) * 100) / 100
    materialCost += lineCost
    const enough = ing.quantity >= requiredBase
    if (!enough) feasible = false
    lines.push({
      productId: ing.id ?? line.productId,
      productName: ing.name,
      requiredBase,
      unit: line.unit,
      unitCost: Number(ing.costPrice) || 0,
      lineCost,
      availableBase: ing.quantity,
      enough,
      missing: false,
    })
  }

  materialCost = Math.round(materialCost * 100) / 100
  const totalCost = Math.round(materialCost * (1 + (Number(wastePercent) || 0) / 100) * 100) / 100
  const unitCostPerKg = batchKg > 0 ? Math.round((totalCost / batchKg) * 100) / 100 : 0

  return { lines, materialCost, wastePercent: Number(wastePercent) || 0, totalCost, unitCostPerKg, missingNames, feasible }
}

/** متوسط التكلفة المرجح بعد دفعة: (مخزون قديم×تكلفته + إنتاج×تكلفته) / الإجمالي
 * إذا كان المخزون القديم سالباً (بيع فوق المتاح) تُعتمد تكلفة التوريد الجديد فقط
 */
export function averageCostPerKg(oldStockKg: number, oldCostPerKg: number, producedKg: number, batchCostPerKg: number): number {
  if (oldStockKg <= 0) return batchCostPerKg
  const total = oldStockKg + producedKg
  if (total <= 0) return batchCostPerKg
  return Math.round((((oldStockKg * oldCostPerKg) + (producedKg * batchCostPerKg)) / total) * 100) / 100
}

// ── تواريخ الصلاحية ──

/** الأيام المتبقية على الانتهاء — null يعني بلا تاريخ */
export function daysToExpiry(p: Pick<Product, 'expiryDate'>, nowMs = Date.now()): number | null {
  if (!p.expiryDate) return null
  const t = new Date(p.expiryDate).getTime()
  if (!Number.isFinite(t)) return null
  return Math.ceil((t - nowMs) / 86_400_000)
}

/** منتهي الصلاحية؟ (الخدمات بلا صلاحية أبداً) */
export function isExpired(p: Pick<Product, 'expiryDate'> & { type?: Product['type'] }): boolean {
  if (getProductType(p) === 'service') return false
  const d = daysToExpiry(p)
  return d !== null && d < 0
}

/** تنتهي قريباً خلال N يوم (default 30) — ولا تشمل المنتهية */
export function isNearExpiry(p: Pick<Product, 'expiryDate'> & { type?: Product['type'] }, withinDays = 30): boolean {
  if (getProductType(p) === 'service') return false
  const d = daysToExpiry(p)
  return d !== null && d >= 0 && d <= withinDays
}

/** تنسيق مدة خدمة بالدقائق: "30 دقيقة"، "ساعة"، "ساعتين"، "3 ساعات و15 دقيقة" */
export function formatServiceDuration(mins: number | null | undefined): string {
  const m = Math.round(Number(mins) || 0)
  if (m <= 0) return ''
  if (m < 60) return m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتان' : `${m} دقيقة`
  const h = Math.floor(m / 60)
  const r = m % 60
  const hStr = h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : `${h} ساعات`
  return r === 0 ? hStr : `${hStr} و${r} دقيقة`
}

/** قيمة مناسبة لحقل <input type="date"> */
export function toDateInputValue(d: Date | string | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d)
  if (!Number.isFinite(dt.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

// ── عبوات البيع ──

/** القطع المخصومة من المخزون لبند بعبوة */
export function packPieces(qty: number, pack: SalePack | undefined): number {
  return (Number(qty) || 0) * (pack?.factor || 1)
}

function trimNum(n: number): string {
  const r = Math.round(n * 1000) / 1000
  return String(r)
}
