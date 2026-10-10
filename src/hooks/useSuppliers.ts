import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Purchase } from '../db/db'

/** مفتاح التجميع: الاسم بعد التقليم — فارغ يعني "بدون مورد" */
export function supplierKey(name: string | undefined | null): string {
  const t = (name || '').trim()
  return t ? t.toLocaleLowerCase('ar') : ''
}

export interface SupplierStats {
  key: string
  /** الاسم المعروض (أول صيغة ظهرت) */
  name: string
  invoices: number
  totalAmount: number
  totalPaid: number
  totalDebt: number
  lastDate: Date
}

/**
 * يجمع حسابات كل مورد من فواتير الشراء بالاسم.
 * السجلات القديمة بلا paidAmount/debtAmount تُعامل كمسددة بالكامل.
 */
export function buildSupplierStats(purchases: Purchase[]): SupplierStats[] {
  const map = new Map<string, SupplierStats & { lastMs: number }>()

  for (const p of purchases) {
    const raw = (p.supplierName || '').trim()
    const key = supplierKey(raw)
    const total = Number(p.totalAmount) || 0
    // سجل قديم بلا حقول دفع = مدفوع بالكامل
    const paid = p.paidAmount !== undefined || p.debtAmount !== undefined
      ? Number(p.paidAmount) || 0
      : total
    const debt = p.debtAmount !== undefined || p.paidAmount !== undefined
      ? Number(p.debtAmount) || 0
      : 0
    const dateMs = new Date(p.date).getTime()

    const cur = map.get(key)
    if (!cur) {
      map.set(key, {
        key,
        name: raw || 'بدون مورد',
        invoices: 1,
        totalAmount: total,
        totalPaid: paid,
        totalDebt: debt,
        lastDate: new Date(p.date),
        lastMs: Number.isFinite(dateMs) ? dateMs : 0,
      })
    } else {
      cur.invoices += 1
      cur.totalAmount = Math.round((cur.totalAmount + total) * 100) / 100
      cur.totalPaid = Math.round((cur.totalPaid + paid) * 100) / 100
      cur.totalDebt = Math.round((cur.totalDebt + debt) * 100) / 100
      if (Number.isFinite(dateMs) && dateMs > cur.lastMs) {
        cur.lastMs = dateMs
        cur.lastDate = new Date(p.date)
      }
    }
  }

  return [...map.values()]
    .map(({ lastMs: _drop, ...s }) => s)
    .sort((a, b) => (b.totalDebt - a.totalDebt) || (b.totalAmount - a.totalAmount))
}

export interface SupplierCard extends SupplierStats {
  id?: number
  phone?: string
  notes?: string
  /** مسجل في سجل الموردين أم ظهر من الفواتير فقط */
  registered: boolean
}

/** كل الموردين: المسجلون أولاً ثم أسماء الفواتير غير المسجلة */
export function useSuppliers(search = ''): SupplierCard[] {
  const suppliers = useLiveQuery(() => db.suppliers.orderBy('name').toArray(), []) ?? []
  const purchases = useLiveQuery(() => db.purchases.toArray(), []) ?? []

  const stats = buildSupplierStats(purchases)
  const byKey = new Map(stats.map((s) => [s.key, s]))

  const cards: SupplierCard[] = suppliers.map((s) => {
    const st = byKey.get(supplierKey(s.name))
    byKey.delete(supplierKey(s.name))
    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      notes: s.notes,
      registered: true,
      key: supplierKey(s.name),
      invoices: st?.invoices ?? 0,
      totalAmount: st?.totalAmount ?? 0,
      totalPaid: st?.totalPaid ?? 0,
      totalDebt: st?.totalDebt ?? 0,
      lastDate: st?.lastDate ?? s.createdAt,
    }
  })

  // أسماء من الفواتير بلا تسجيل — للتعريف بها وتسجيلها بضغطة
  for (const st of byKey.values()) {
    if (!st.key) continue // "بدون مورد" ليست مورداً
    cards.push({ ...st, registered: false })
  }

  const term = search.trim().toLocaleLowerCase('ar')
  const filtered = term
    ? cards.filter((c) =>
      c.name.toLocaleLowerCase('ar').includes(term) ||
      (c.phone || '').includes(search.trim()),
    )
    : cards

  return filtered.sort((a, b) => (b.totalDebt - a.totalDebt) || (b.totalAmount - a.totalAmount))
}

/** كل الأسماء المعروفة (مسجلة + من الفواتير) لمنتقي المورد — مرتبة */
export function useSupplierNames(): string[] {
  const suppliers = useLiveQuery(() => db.suppliers.orderBy('name').toArray(), []) ?? []
  const purchases = useLiveQuery(() => db.purchases.toArray(), []) ?? []

  const set = new Map<string, string>()
  for (const s of suppliers) {
    const k = supplierKey(s.name)
    if (k && !set.has(k)) set.set(k, s.name.trim())
  }
  for (const p of purchases) {
    const raw = (p.supplierName || '').trim()
    const k = supplierKey(raw)
    if (k && !set.has(k)) set.set(k, raw)
  }
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'ar'))
}

export async function addSupplier(data: { name: string; phone?: string; notes?: string }): Promise<number> {
  const name = data.name.trim()
  if (!name) throw new Error('يرجى كتابة اسم المورد')

  const dup = await db.suppliers.toArray()
  if (dup.some((s) => supplierKey(s.name) === supplierKey(name))) {
    throw new Error('مورد بهذا الاسم مسجل بالفعل')
  }

  return Number(await db.suppliers.add({
    name,
    phone: data.phone?.trim() || '',
    notes: data.notes?.trim() || '',
    createdAt: new Date(),
  }))
}

export async function updateSupplier(id: number, data: { name: string; phone?: string; notes?: string }) {
  const name = data.name.trim()
  if (!name) throw new Error('يرجى كتابة اسم المورد')

  const all = await db.suppliers.toArray()
  if (all.some((s) => s.id !== id && supplierKey(s.name) === supplierKey(name))) {
    throw new Error('مورد بهذا الاسم مسجل بالفعل')
  }

  // تنبيه: الفواتير مرتبطة بالاسم — إعادة التسمية تفصل السجل عن فواتيره القديمة
  return db.suppliers.update(id, {
    name,
    phone: data.phone?.trim() || '',
    notes: data.notes?.trim() || '',
  })
}

/** حذف المورد المسجل — ممنوع إن كانت له فواتير (حتى لا تُيتم حساباته) */
export async function deleteSupplier(id: number): Promise<{ blocked: true; invoices: number } | { blocked: false }> {
  const supplier = await db.suppliers.get(id)
  if (!supplier) return { blocked: false }

  const linked = await db.purchases.toArray()
  const count = linked.filter((p) => supplierKey(p.supplierName) === supplierKey(supplier.name)).length
  if (count > 0) return { blocked: true, invoices: count }

  await db.suppliers.delete(id)
  return { blocked: false }
}

/** تسجيل اسم ظهر في فاتورة كمورد رسمي (نفس الاسم) */
export async function registerSupplierName(name: string): Promise<number> {
  return addSupplier({ name })
}
