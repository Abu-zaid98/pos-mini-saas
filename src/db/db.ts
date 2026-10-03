import Dexie, { type EntityTable } from 'dexie'

// ===========================
// Types
// ===========================

export interface Product {
  id?: number
  barcode: string
  name: string
  salePrice: number
  costPrice: number
  quantity: number
  lowStockAlert: number
  category: string
  createdAt: Date
  updatedAt: Date
  /**
   * نوع الصنف:
   * - goods: سلعة بالحبة (quantity = قطع، الأسعار للحبة) — الافتراضي للأصناف القديمة
   * - weighted: منتج بالوزن (quantity = مخزون بالجرام، الأسعار للكيلو)
   * - service: خدمة (بلا مخزون ولا باركود إلزامي)
   */
  type?: ProductType
  /**
   * وصفة الإنتاج (للموزون غالباً): مكوّنات كل 1 كغ من المنتج.
   * تُخصم تلقائياً عند تسجيل دفعة إنتاج مضروبة بوزن الدفعة.
   */
  recipe?: RecipeLine[]
  /** نسبة الهالك % — تُضاف على تكلفة المواد عند حساب تكلفة الكيلو */
  wastePercent?: number
  /**
   * عبوات البيع (للسلع فقط): علبة/كرتونة — تُخصم بالحبة (الكمية × المعامل)
   */
  packs?: SalePack[]
  /** تاريخ انتهاء الصلاحية (للأصناف الغذائية) — فارغ يعني بلا تاريخ */
  expiryDate?: Date | null
  /**
   * للخدمات: سعر مفتوح يُدخل وقت البيع (مع بقاء سعر ثابت استرشادي قابل للتعديل)
   */
  openPrice?: boolean
  /** للخدمات الزمنية: مدة التنفيذ بالدقائق — تُطبع على الفاتورة */
  durationMinutes?: number
  /** صورة الصنف (مصغرة JPEG base64 من كاميرا الجهاز) — فارغ يعني أيقونة التصنيف */
  image?: string | null
}

/** نوع الصنف: سلعة | منتج بالوزن | خدمة */
export type ProductType = 'goods' | 'weighted' | 'service'

export const PRODUCT_TYPES: { id: ProductType; label: string; icon: string; desc: string }[] = [
  { id: 'goods', label: 'سلعة بالحبة', icon: '📦', desc: 'تُباع بالحبة ويُخصم عدد القطع من المخزون' },
  { id: 'weighted', label: 'سلعة بالوزن', icon: '⚖️', desc: 'سعرها بالكيلو ومخزونها بالجرام، مع دعم الإنتاج والوصفات' },
  { id: 'service', label: 'خدمة', icon: '🛎️', desc: 'بلا مخزون — سعر ثابت' },
]

/** وحدة البيع في بند الفاتورة */
export type SaleUnit = 'piece' | 'kg' | 'g'

export const SALE_UNITS: { id: SaleUnit; label: string; short: string }[] = [
  { id: 'piece', label: 'قطعة', short: 'قطعة' },
  { id: 'kg', label: 'كيلوغرام', short: 'كغ' },
  { id: 'g', label: 'جرام', short: 'غ' },
]

/**
 * عبوة بيع (للسلع): علبة/كرتونة بسعر خاص — تُخصم من المخزون بالحبة
 * مثال: علبة = 12 حبة بسعر 55
 */
export interface SalePack {
  label: string
  /** عدد القطع في العبوة */
  factor: number
  /** سعر العبوة */
  price: number
}

/**
 * سطر وصفة إنتاج — الكمية اللازمة لإنتاج 1 كغ من المنتج
 * (تُضرب تلقائياً بوزن الدفعة عند الإنتاج)
 */
export interface RecipeLine {
  productId: number
  productName: string
  /** الكمية بالوحدات الأساسية (قطع أو جرام) */
  qty: number
  /** وحدة العرض/الإدخال */
  unit: SaleUnit
}

/** سجل دفعة إنتاج */
export interface Production {
  id?: number
  productId: number
  productName: string
  /** الوزن المنتج بالجرام */
  producedQty: number
  /** نسخة من الوصفة مع التكاليف وقت الإنتاج */
  ingredients: Array<RecipeLine & { unitCost: number; lineCost: number }>
  /** تكلفة المواد الخام */
  materialCost: number
  /** نسبة الهالك المطبقة */
  wastePercent: number
  /** التكلفة الكلية بعد الهالك */
  totalCost: number
  /** تكلفة الكيلو الفعلية للدفعة */
  unitCost: number
  date: Date
  notes?: string
  createdAt: Date
}

export interface Customer {
  id?: number
  name: string
  phone: string
  totalDebt: number
  creditBalance?: number
  createdAt: Date
}

export interface InvoiceItem {
  productId: number
  name: string
  qty: number
  price: number
  costPrice: number
  /**
   * وحدة البند: piece (الكمية قطع) | kg (الكمية كيلو والسعر للكيلو) | g (الكمية جرام والسعر للجرام)
   * الأصناف القديمة بدون unit تُعامل كقطع — إجمالي السطر دائماً qty × price
   */
  unit?: SaleUnit
  /** نوع الصنف وقت البيع (للعرض حتى لو حُذف الصنف لاحقاً) */
  kind?: ProductType
  /**
   * عبوة البيع المختارة (للسلع): إجمالي السطر = qty × pack.price
   * والخصم من المخزون = qty × pack.factor بالحبة
   */
  pack?: SalePack
  /** مدة الخدمة بالدقائق (لقطة وقت البيع — للخدمات الزمنية) */
  durationMinutes?: number
  /**
   * عدد القطع/الوزنات في السطر (للموزون): السطر "3 × 100 غ" يُخزن
   * qty = الوزن الكلي (300 غ) + pieces = 3 — والخصم من المخزون على الكلي
   */
  pieces?: number
  /**
   * خصم خاص بهذا السطر (عرض/صنف): يُطرح من إجمالي السطر قبل خصم الفاتورة
   * صافي السطر = qty × price − خصم السطر
   */
  discount?: ItemDiscount
}

/** خصم سطر: نسبة % من السطر أو مبلغ ثابت */
export interface ItemDiscount {
  type: DiscountType
  value: number
}

export type PaymentType = 'cash' | 'debt' | 'partial'
export type PaymentMethod = 'cash' | 'jawwal_pay' | 'palpay' | 'bop'
export type DiscountType = 'percent' | 'fixed'

export const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: string }[] = [
  { id: 'cash', label: 'نقداً (كاش)', icon: '💵' },
  { id: 'jawwal_pay', label: 'جوال باي', icon: '📱' },
  { id: 'palpay', label: 'بال باي', icon: '💳' },
  { id: 'bop', label: 'بنك فلسطين', icon: '🏦' },
]

export function getPaymentMethodName(method?: PaymentMethod): string {
  switch (method) {
    case 'jawwal_pay': return 'جوال باي 📱'
    case 'palpay': return 'بال باي 💳'
    case 'bop': return 'بنك فلسطين 🏦'
    case 'cash':
    default:
      return 'نقداً (كاش) 💵'
  }
}

export interface Invoice {
  id?: number
  customerId: number | null
  customerName?: string
  items: InvoiceItem[]
  subtotal: number
  discountType: DiscountType | null
  discountValue: number
  discountAmount: number
  /** مجموع خصومات الأصناف (تُطرح قبل خصم الفاتورة) — الفواتير القديمة 0 */
  itemDiscountAmount?: number
  total: number
  paidAmount: number
  debtAmount: number
  paymentType: PaymentType
  paymentMethod?: PaymentMethod
  note: string
  createdAt: Date
}

export interface Payment {
  id?: number
  customerId: number
  invoiceId: number | null
  amount: number
  method?: PaymentMethod
  note: string
  createdAt: Date
}

export interface Setting {
  key: string
  value: unknown
}

export interface Expense {
  id?: number
  title: string
  category: string
  amount: number
  date: Date
  paymentMethod?: PaymentMethod
  notes?: string
  createdAt: Date
}

export const EXPENSE_CATEGORIES = [
  { id: 'electricity', name: 'كهرباء', icon: '⚡', active: true },
  { id: 'water', name: 'ماء', icon: '💧', active: true },
  { id: 'rent', name: 'إيجار المحل', icon: '🏪', active: true },
  { id: 'salaries', name: 'رواتب', icon: '👥', active: true },
  { id: 'maintenance', name: 'صيانة', icon: '🔧', active: true },
  { id: 'transport', name: 'مواصلات', icon: '🚚', active: true },
  { id: 'internet', name: 'إنترنت', icon: '📶', active: true },
  { id: 'marketing', name: 'تسويق', icon: '📢', active: true },
  { id: 'operations', name: 'مشتريات تشغيلية', icon: '📦', active: true },
  { id: 'other', name: 'أخرى', icon: '💼', active: true },
]

export interface PurchaseItem {
  productId: number
  productName: string
  barcode: string
  /** الكمية بالوحدات الأساسية (قطع للسلع، جرام للموزون) */
  quantity: number
  oldQuantity: number
  newQuantity: number
  /** التكلفة بوحدة التسعير (للحبة أو للكيلو) */
  costPrice: number
  totalCost: number
  /** وحدة التسعير/العرض — للسجلات القديمة تُعامل كقطع */
  unit?: SaleUnit
}

export interface Purchase {
  id?: number
  invoiceNumber?: string
  supplierName?: string
  items: PurchaseItem[]
  totalAmount: number
  paymentMethod?: PaymentMethod
  date: Date
  notes?: string
  createdAt: Date
}

// ===========================
// Database
// ===========================

export class PosDatabase extends Dexie {
  products!: EntityTable<Product, 'id'>
  customers!: EntityTable<Customer, 'id'>
  invoices!: EntityTable<Invoice, 'id'>
  payments!: EntityTable<Payment, 'id'>
  settings!: EntityTable<Setting, 'key'>
  expenses!: EntityTable<Expense, 'id'>
  purchases!: EntityTable<Purchase, 'id'>
  productions!: EntityTable<Production, 'id'>

  constructor() {
    super('MallBilToulPOS')

    this.version(1).stores({
      products: '++id, barcode, name, category',
      customers: '++id, name, phone',
      invoices: '++id, customerId, createdAt, paymentType',
      payments: '++id, customerId, invoiceId, createdAt',
      settings: 'key',
    })

    this.version(2).stores({
      payments: '++id, customerId, invoiceId, createdAt, method',
      invoices: '++id, customerId, createdAt, paymentType, paymentMethod',
    })

    // Version 3: explicitly declare all stores together to avoid missing-table errors
    this.version(3).stores({
      products: '++id, barcode, name, category',
      customers: '++id, name, phone',
      invoices: '++id, customerId, createdAt, paymentType, paymentMethod',
      payments: '++id, customerId, invoiceId, createdAt, method',
      settings: 'key',
    })

    // Version 4: add expenses and purchases stores
    this.version(4).stores({
      products: '++id, barcode, name, category',
      customers: '++id, name, phone',
      invoices: '++id, customerId, createdAt, paymentType, paymentMethod',
      payments: '++id, customerId, invoiceId, createdAt, method',
      settings: 'key',
      expenses: '++id, category, date, paymentMethod, createdAt',
      purchases: '++id, supplierName, date, createdAt',
    })

    // Version 5: add optional customer credit balance while keeping debt logic intact.
    this.version(5).stores({
      products: '++id, barcode, name, category',
      customers: '++id, name, phone',
      invoices: '++id, customerId, createdAt, paymentType, paymentMethod',
      payments: '++id, customerId, invoiceId, createdAt, method',
      settings: 'key',
      expenses: '++id, category, date, paymentMethod, createdAt',
      purchases: '++id, supplierName, date, createdAt',
    })

    // Version 6: item types (goods/weighted/service) — backfill old products as goods.
    // Indexes unchanged; upgrade only patches missing `type` fields.
    this.version(6).stores({
      products: '++id, barcode, name, category',
      customers: '++id, name, phone',
      invoices: '++id, customerId, createdAt, paymentType, paymentMethod',
      payments: '++id, customerId, invoiceId, createdAt, method',
      settings: 'key',
      expenses: '++id, category, date, paymentMethod, createdAt',
      purchases: '++id, supplierName, date, createdAt',
    }).upgrade((tx) => {
      return tx.table('products').toCollection().modify((p) => {
        if (!p.type) p.type = 'goods'
      })
    })

    // Version 7: production batches (manufacturing) — new productions store.
    this.version(7).stores({
      products: '++id, barcode, name, category',
      customers: '++id, name, phone',
      invoices: '++id, customerId, createdAt, paymentType, paymentMethod',
      payments: '++id, customerId, invoiceId, createdAt, method',
      settings: 'key',
      expenses: '++id, category, date, paymentMethod, createdAt',
      purchases: '++id, supplierName, date, createdAt',
      productions: '++id, productId, date, createdAt',
    })
  }
}

export const db = new PosDatabase()

// ===========================
// Seed: Default Settings
// ===========================

export async function initSettings() {
  const storeName = await db.settings.get('storeName')
  if (!storeName) {
    await db.settings.bulkPut([
      { key: 'storeName', value: 'ميزان' },
      { key: 'ownerName', value: '' },
      { key: 'currency', value: '₪' },
      { key: 'passwordHash', value: null },
      { key: 'lastBackupAt', value: null },
      { key: 'categories', value: ['مشروبات', 'حاجات أطفال', 'مواد تنظيف', 'ألبان وأجبان', 'خبز ومعجنات', 'أخرى'] },
      { key: 'lowStockDefault', value: 5 },
    ])
  }

  // Ensure categories_list always exists (for CategoryManagerModal)
  const catList = await db.settings.get('categories_list')
  if (!catList) {
    const defaultCats = [
      { id: 'beverages', name: 'مشروبات', icon: '🥤' },
      { id: 'snacks', name: 'حاجات أطفال ', icon: '🍿' },
      { id: 'cleaning', name: 'مواد تنظيف', icon: '🧹' },
      { id: 'dairy', name: 'ألبان وأجبان', icon: '🧀' },
      { id: 'bakery', name: 'خبز ومعجنات', icon: '🍞' },
      { id: 'other', name: 'أخرى', icon: '📦' },
    ]
    await db.settings.put({ key: 'categories_list', value: defaultCats })
  }
}
