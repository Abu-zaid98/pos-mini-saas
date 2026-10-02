/**
 * billing.ts — الفوترة: خطط الأسعار + سجل المدفوعات + أرقام الإيصالات + القوالب
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  runTransaction,
} from 'firebase/firestore'
import { db, auth } from './firebase'
import { logActivity } from './subscriptions'
import { formatTemplate, getTemplates } from './templates'
import type { Plan, PaymentRecord } from './types'

// ── دوال نقية (مغطاة بالاختبارات) ──

/** رقم الإيصال: R-202610-0042 */
export function formatReceiptNo(yearMonth: string, seq: number): string {
  return `R-${yearMonth}-${String(seq).padStart(4, '0')}`
}

/** مفتاح الشهر YYYYMM من تاريخ */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** تجميع عناصر حسب الشهر: [{key, label, count, sum}] مرتبة تصاعدياً */
export function bucketByMonth<T>(
  items: T[],
  getDate: (t: T) => Date,
  getAmount: (t: T) => number = () => 0
): Array<{ key: string; label: string; count: number; sum: number }> {
  const map = new Map<string, { count: number; sum: number; date: Date }>()
  for (const item of items) {
    const d = getDate(item)
    if (!d || !Number.isFinite(d.getTime())) continue
    const key = monthKey(d)
    const prev = map.get(key) || { count: 0, sum: 0, date: new Date(d.getFullYear(), d.getMonth(), 1) }
    prev.count++
    prev.sum += Number(getAmount(item)) || 0
    map.set(key, prev)
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, v]) => ({
      key,
      label: v.date.toLocaleDateString('ar', { month: 'long' }),
      count: v.count,
      sum: Math.round(v.sum * 100) / 100,
    }))
}

// ── القوالب (templates.ts: cache متزامن + تحميل) ──

export { getTemplates, loadTemplates, saveTemplates, DEFAULT_TEMPLATES } from './templates'
export { formatTemplate } from './templates'

// ── العملة الافتراضية ──

export async function getDefaultCurrency(): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'general'))
    const cur = (snap.data() as { currency?: string } | undefined)?.currency
    if (cur) return cur
  } catch {
    // تجاهل
  }
  return '₪'
}

export async function saveDefaultCurrency(currency: string): Promise<void> {
  await setDoc(doc(db, 'settings', 'general'), { currency }, { merge: true })
}

// ── الخطط ──

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  if (typeof v === 'number' || typeof v === 'string') {
    const d = new Date(v)
    if (Number.isFinite(d.getTime())) return d
  }
  return new Date()
}

export async function getPlans(): Promise<Plan[]> {
  const snap = await getDocs(query(collection(db, 'plans'), orderBy('createdAt', 'desc')))
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>
    return {
      id: d.id,
      name: (data.name as string) || '',
      durationDays: Number(data.durationDays) || 0,
      durationHours: Number(data.durationHours) || 0,
      price: Number(data.price) || 0,
      currency: (data.currency as string) || '₪',
      trial: data.trial === true,
      active: data.active !== false,
      createdAt: toDate(data.createdAt),
    }
  })
}

export async function createPlan(p: Omit<Plan, 'id' | 'createdAt'>): Promise<string> {
  if (!p.name.trim()) throw new Error('اسم الخطة مطلوب')
  const ref = doc(collection(db, 'plans'))
  await setDoc(ref, { ...p, name: p.name.trim(), createdAt: serverTimestamp() })
  return ref.id
}

export async function updatePlan(id: string, patch: Partial<Plan>): Promise<void> {
  await updateDoc(doc(db, 'plans', id), { ...patch })
}

export async function deletePlan(id: string): Promise<void> {
  await deleteDoc(doc(db, 'plans', id))
}

export const PLAN_PRESETS: Array<Omit<Plan, 'id' | 'createdAt' | 'currency'>> = [
  { name: 'تجريبي 3 أيام', durationDays: 3, durationHours: 0, price: 0, trial: true, active: true },
  { name: 'شهري', durationDays: 30, durationHours: 0, price: 0, trial: false, active: true },
  { name: 'ربع سنوي', durationDays: 90, durationHours: 0, price: 0, trial: false, active: true },
  { name: 'سنوي', durationDays: 365, durationHours: 0, price: 0, trial: false, active: true },
]

// ── المدفوعات والإيصالات ──

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'نقدي' },
  { id: 'transfer', label: 'تحويل' },
  { id: 'other', label: 'أخرى' },
] as const

export type PaymentMethodId = 'cash' | 'transfer' | 'other'

function parsePayment(id: string, data: Record<string, unknown>): PaymentRecord {
  return {
    id,
    subscriptionId: (data.subscriptionId as string) || '',
    subscriberEmail: (data.subscriberEmail as string) || '',
    subscriberName: (data.subscriberName as string) || undefined,
    phone: (data.phone as string) || undefined,
    amount: Number(data.amount) || 0,
    currency: (data.currency as string) || '₪',
    method: ((data.method as string) === 'transfer' || (data.method as string) === 'other' ? data.method : 'cash') as PaymentMethodId,
    methodLabel: (data.methodLabel as string) || undefined,
    periodLabel: (data.periodLabel as string) || '',
    fromDate: toDate(data.fromDate),
    toDate: toDate(data.toDate),
    receiptNo: (data.receiptNo as string) || '',
    notes: (data.notes as string) || undefined,
    adminEmail: (data.adminEmail as string) || undefined,
    createdAt: toDate(data.createdAt),
  }
}

export async function getPayments(max = 300): Promise<PaymentRecord[]> {
  const snap = await getDocs(query(collection(db, 'payments'), orderBy('createdAt', 'desc'), limit(max)))
  return snap.docs.map((d) => parsePayment(d.id, d.data() as Record<string, unknown>))
}

export async function getPaymentsBySubscription(subscriptionId: string): Promise<PaymentRecord[]> {
  const all = await getPayments(500)
  return all.filter((p) => p.subscriptionId === subscriptionId)
}

/** تسجيل دفعة برقم إيصال متسلسل — transaction على عدّاد */
export async function recordPayment(params: {
  subscriptionId: string
  subscriberEmail: string
  subscriberName?: string
  phone?: string
  amount: number
  currency: string
  method: PaymentMethodId
  methodLabel?: string
  periodLabel: string
  fromDate: Date
  toDate: Date
  notes?: string
}): Promise<PaymentRecord> {
  if (!(params.amount > 0)) throw new Error('المبلغ يجب أن يكون أكبر من صفر')

  const now = new Date()
  const ym = monthKey(now)

  const receiptNo = await runTransaction(db, async (tx) => {
    const counterRef = doc(db, 'counters', 'receipts')
    const snap = await tx.get(counterRef)
    const seq = ((snap.data() as { seq?: number } | undefined)?.seq || 0) + 1
    tx.set(counterRef, { seq }, { merge: true })
    return formatReceiptNo(ym, seq)
  })

  const ref = doc(collection(db, 'payments'))
  const data = {
    subscriptionId: params.subscriptionId,
    subscriberEmail: params.subscriberEmail,
    subscriberName: params.subscriberName || null,
    phone: params.phone || null,
    amount: Math.round(params.amount * 100) / 100,
    currency: params.currency || '₪',
    method: params.method,
    methodLabel: params.methodLabel || null,
    periodLabel: params.periodLabel,
    fromDate: Timestamp.fromDate(params.fromDate),
    toDate: Timestamp.fromDate(params.toDate),
    receiptNo,
    notes: params.notes || null,
    adminEmail: auth.currentUser?.email || 'system',
    createdAt: serverTimestamp(),
  }
  await setDoc(ref, data)

  await logActivity({
    action: 'payment_recorded',
    subscriberId: params.subscriptionId,
    subscriberEmail: params.subscriberEmail,
    details: `إيصال ${receiptNo} — ${data.amount} ${data.currency}`,
  })

  return parsePayment(ref.id, { ...data, fromDate: params.fromDate, toDate: params.toDate, createdAt: now })
}

/** رابط واتساب للإيصال بقالب قابل للتخصيص */
export function buildReceiptWhatsApp(p: {
  phone?: string
  name: string
  uid?: string
  receiptNo: string
  periodLabel: string
  fromDate: Date
  toDate: Date
  amount: number
  currency: string
  methodLabel: string
}): string {
  const fallback = import.meta.env.VITE_LIC_WHATSAPP || '972592133357'
  const text = formatTemplate(getTemplates().receipt, {
    receipt: p.receiptNo,
    name: p.name,
    uid: p.uid || '',
    period: p.periodLabel,
    from: p.fromDate.toLocaleDateString('ar'),
    to: p.toDate.toLocaleDateString('ar'),
    amount: p.amount,
    currency: p.currency,
    method: p.methodLabel,
  })
  const to = (p.phone?.replace(/\D/g, '') || fallback).replace(/\D/g, '')
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`
}
