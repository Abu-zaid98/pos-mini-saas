/**
 * subscriptions.ts — خدمة إدارة الاشتراكات عبر Firestore + Firebase Auth REST
 * 
 * هيكل Firestore:
 *   subs/{uid}_{appId}  — بيانات الاشتراك (token, status, dates...)
 *   apps/{appId}        — بيانات التطبيقات
 *   activity/{id}       — سجل النشاط
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db, auth } from './firebase'
import { issueToken, calcExpiryMsPrecise, addDurationMs } from './crypto'
import { formatTemplate, getTemplates } from './templates'
import type { Subscription, SubscriptionStatus, DashboardStats, ActivityLog } from './types'

const APP_ID = import.meta.env.VITE_LIC_APP_ID || '1374790599531web0b22b9db833219122b122e'
const FB_API_KEY = import.meta.env.VITE_FB_API_KEY || 'AIzaSyB4RMwer7fmPM4dzfBj0CHkkayc5ExcaJk'

// ─────────────────────────────────────────────────────────────────
// Firebase Auth REST — إنشاء مستخدمين (يتطلب Admin SDK عادةً)
// نستخدم REST API مع idToken للأدمن المسجل دخوله
// ─────────────────────────────────────────────────────────────────

/** إنشاء مستخدم جديد عبر Firebase Auth REST API */
export async function createFirebaseUser(email: string, password: string): Promise<string> {
  // نستخدم signUp endpoint — يُنشئ مستخدم جديد
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB_API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    const code = err.error?.message || 'UNKNOWN'
    if (code.includes('EMAIL_EXISTS')) throw new Error('هذا البريد الإلكتروني مستخدم بالفعل')
    if (code.includes('WEAK_PASSWORD')) throw new Error('كلمة المرور ضعيفة — 6 أحرف على الأقل')
    throw new Error(`خطأ في إنشاء المستخدم: ${code}`)
  }

  const data = await res.json() as { localId: string }
  return data.localId
}

/** تعطيل/تفعيل مستخدم عبر Firebase Auth Admin REST */
export async function setUserDisabled(uid: string, disabled: boolean): Promise<void> {
  // نستخدم Firebase Auth REST مع idToken للتحقق — هذا يعمل مع Security Rules
  // في الإنتاج: استخدم Cloud Functions لتنفيذ Admin SDK
  // هنا نحدث حقل suspended في Firestore كبديل عملي
  const subId = `${uid}_${APP_ID}`
  await updateDoc(doc(db, 'subs', subId), {
    disabled,
    updatedAt: serverTimestamp(),
  })
}

// ─────────────────────────────────────────────────────────────────
// Subscriptions CRUD
// ─────────────────────────────────────────────────────────────────

function tsToDate(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate()
  if (ts instanceof Date) return ts
  if (typeof ts === 'number') return new Date(ts)
  if (typeof ts === 'string') return new Date(ts)
  return new Date()
}

function parseSubscription(id: string, data: Record<string, unknown>): Subscription {
  return {
    id,
    uid: data.uid as string || '',
    appId: data.appId as string || APP_ID,
    username: data.username as string || '',
    email: data.email as string || '',
    displayName: data.displayName as string | undefined,
    phone: data.phone as string | undefined,
    token: data.token as string || '',
    status: data.status as SubscriptionStatus || 'active',
    startDate: tsToDate(data.startDate),
    expiryDate: tsToDate(data.expiryDate),
    graceDays: Number(data.graceDays) || 0,
    notes: data.notes as string | undefined,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  }
}

/** الحصول على جميع الاشتراكات */
export async function getAllSubscriptions(): Promise<Subscription[]> {
  const q = query(collection(db, 'subs'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => parseSubscription(d.id, d.data() as Record<string, unknown>))
}

/** الحصول على اشتراك واحد */
export async function getSubscription(id: string): Promise<Subscription | null> {
  const snap = await getDoc(doc(db, 'subs', id))
  if (!snap.exists()) return null
  return parseSubscription(snap.id, snap.data() as Record<string, unknown>)
}

/** إنشاء مشترك جديد مع token */
export async function createSubscriber(params: {
  username: string
  password: string
  displayName?: string
  phone?: string
  durationDays: number
  durationHours?: number
  graceDays: number
  customExpiryMs?: number
  isTrial: boolean
  notes?: string
  privateKeyJwk: JsonWebKey
}): Promise<Subscription> {
  const { username, password, displayName, phone, durationDays, durationHours = 0, graceDays, customExpiryMs, isTrial, notes, privateKeyJwk } = params

  // البريد الإلكتروني
  const email = `${username.trim().toLowerCase()}@lic.local`

  // إنشاء مستخدم في Firebase Auth
  const uid = await createFirebaseUser(email, password)

  // حساب تواريخ الاشتراك — تاريخ مخصص أو مدة (أيام + ساعات بدقة)
  const now = new Date()
  const expiryMs = customExpiryMs && customExpiryMs > Date.now()
    ? customExpiryMs
    : calcExpiryMsPrecise(now, durationDays, durationHours)

  // إصدار token موقّع
  const token = await issueToken({ uid, appId: APP_ID, expiryMs, graceDays, privateKeyJwk })

  // تحديد الحالة
  const status: SubscriptionStatus = isTrial ? 'trial' : 'active'

  // حفظ في Firestore
  const subId = `${uid}_${APP_ID}`
  const subData = {
    uid,
    appId: APP_ID,
    username: username.trim().toLowerCase(),
    email,
    displayName: displayName || null,
    phone: phone || null,
    token,
    status,
    startDate: Timestamp.fromDate(now),
    expiryDate: Timestamp.fromMillis(expiryMs),
    graceDays,
    notes: notes || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(doc(db, 'subs', subId), subData)

  // تسجيل النشاط
  const durLabel = customExpiryMs
    ? `حتى ${new Date(expiryMs).toLocaleString('ar')}`
    : `${durationDays} يوم${durationHours ? ` + ${durationHours} ساعة` : ''}`
  await logActivity({
    action: 'created',
    subscriberId: subId,
    subscriberEmail: email,
    details: `اشتراك جديد - ${durLabel}${isTrial ? ' (تجريبي)' : ''}`,
  })

  return parseSubscription(subId, { ...subData, createdAt: now, updatedAt: now })
}

/** إعادة إصدار التوكن بعد أي تغيير على تاريخ الانتهاء */
async function reissueTokenFor(
  existing: Subscription,
  newExpiryMs: number,
  graceDays: number,
  privateKeyJwk: JsonWebKey,
): Promise<string> {
  return issueToken({
    uid: existing.uid,
    appId: APP_ID,
    expiryMs: newExpiryMs,
    graceDays,
    privateKeyJwk,
  })
}

/** تجديد اشتراك — تمديد أو تعيين تاريخ محدد */
export async function renewSubscription(params: {
  subscriptionId: string
  durationDays: number
  durationHours?: number
  graceDays: number
  mode?: 'extend' | 'set'
  customExpiryMs?: number
  extendFrom?: 'expiry' | 'now'
  notes?: string
  privateKeyJwk: JsonWebKey
}): Promise<Subscription> {
  const { subscriptionId, durationDays, durationHours = 0, graceDays, mode = 'extend', customExpiryMs, extendFrom = 'expiry', notes, privateKeyJwk } = params

  const existing = await getSubscription(subscriptionId)
  if (!existing) throw new Error('الاشتراك غير موجود')

  let expiryMs: number
  if (mode === 'set') {
    if (!customExpiryMs || customExpiryMs <= 0) throw new Error('حدد تاريخ انتهاء صحيحاً')
    expiryMs = customExpiryMs
  } else {
    // تمديد من تاريخ الانتهاء (إن كان مستقبلياً) أو من الآن
    const fromDate = extendFrom === 'now'
      ? new Date()
      : (existing.expiryDate > new Date() ? existing.expiryDate : new Date())
    expiryMs = calcExpiryMsPrecise(fromDate, durationDays, durationHours)
  }

  // إصدار token جديد
  const token = await reissueTokenFor(existing, expiryMs, graceDays, privateKeyJwk)

  const updates = {
    token,
    status: 'active' as SubscriptionStatus,
    expiryDate: Timestamp.fromMillis(expiryMs),
    graceDays,
    notes: notes || existing.notes || null,
    updatedAt: serverTimestamp(),
  }

  await updateDoc(doc(db, 'subs', subscriptionId), updates)

  // تسجيل النشاط
  const detail = mode === 'set'
    ? `تعيين الانتهاء إلى ${new Date(expiryMs).toLocaleString('ar')}`
    : `تجديد ${durationDays} يوم${durationHours ? ` + ${durationHours} ساعة` : ''}`
  await logActivity({
    action: 'renewed',
    subscriberId: subscriptionId,
    subscriberEmail: existing.email,
    details: detail,
  })

  return { ...existing, token, status: 'active', expiryDate: new Date(expiryMs), graceDays, notes: (notes || existing.notes || undefined) as string | undefined, updatedAt: new Date() }
}

/** تعديل سريع: زيادة أو إنقاص أيام/ساعات من تاريخ الانتهاء الحالي */
export async function adjustSubscription(params: {
  subscriptionId: string
  deltaDays: number
  deltaHours?: number
  graceDays?: number
  notes?: string
  privateKeyJwk: JsonWebKey
}): Promise<Subscription> {
  const { subscriptionId, deltaDays, deltaHours = 0, graceDays, notes, privateKeyJwk } = params
  if (!deltaDays && !deltaHours) throw new Error('لا يوجد تغيير — أدخل أياماً أو ساعات')

  const existing = await getSubscription(subscriptionId)
  if (!existing) throw new Error('الاشتراك غير موجود')

  const newExpiryMs = addDurationMs(existing.expiryDate, deltaDays, deltaHours)
  if (newExpiryMs <= 0) throw new Error('التاريخ الناتج غير صالح')

  const finalGrace = graceDays ?? existing.graceDays
  const token = await reissueTokenFor(existing, newExpiryMs, finalGrace, privateKeyJwk)

  const updates = {
    token,
    expiryDate: Timestamp.fromMillis(newExpiryMs),
    graceDays: finalGrace,
    notes: notes || existing.notes || null,
    updatedAt: serverTimestamp(),
  }
  await updateDoc(doc(db, 'subs', subscriptionId), updates)

  const sign = (deltaDays > 0 || deltaHours > 0) ? '+' : ''
  await logActivity({
    action: 'adjusted',
    subscriberId: subscriptionId,
    subscriberEmail: existing.email,
    details: `تعديل المدة ${sign}${deltaDays} يوم ${sign}${deltaHours} ساعة → ${new Date(newExpiryMs).toLocaleString('ar')}`,
  })

  return { ...existing, token, expiryDate: new Date(newExpiryMs), graceDays: finalGrace, notes: (notes || existing.notes || undefined) as string | undefined, updatedAt: new Date() }
}

/** تعيين تاريخ انتهاء دقيق (يوم + ساعة + دقيقة) */
export async function setSubscriptionExpiry(params: {
  subscriptionId: string
  expiryMs: number
  graceDays?: number
  notes?: string
  privateKeyJwk: JsonWebKey
}): Promise<Subscription> {
  const { subscriptionId, expiryMs, graceDays, notes, privateKeyJwk } = params
  if (!expiryMs || expiryMs <= 0) throw new Error('حدد تاريخ انتهاء صحيحاً')

  const existing = await getSubscription(subscriptionId)
  if (!existing) throw new Error('الاشتراك غير موجود')

  const finalGrace = graceDays ?? existing.graceDays
  const token = await reissueTokenFor(existing, expiryMs, finalGrace, privateKeyJwk)

  const updates = {
    token,
    expiryDate: Timestamp.fromMillis(expiryMs),
    graceDays: finalGrace,
    notes: notes || existing.notes || null,
    updatedAt: serverTimestamp(),
  }
  await updateDoc(doc(db, 'subs', subscriptionId), updates)

  await logActivity({
    action: 'expiry_set',
    subscriberId: subscriptionId,
    subscriberEmail: existing.email,
    details: `تعيين الانتهاء إلى ${new Date(expiryMs).toLocaleString('ar')}`,
  })

  return { ...existing, token, expiryDate: new Date(expiryMs), graceDays: finalGrace, notes: (notes || existing.notes || undefined) as string | undefined, updatedAt: new Date() }
}

/** تعليق اشتراك */
export async function suspendSubscription(id: string): Promise<void> {
  const existing = await getSubscription(id)
  if (!existing) throw new Error('الاشتراك غير موجود')

  await updateDoc(doc(db, 'subs', id), {
    status: 'suspended',
    updatedAt: serverTimestamp(),
  })

  await logActivity({
    action: 'suspended',
    subscriberId: id,
    subscriberEmail: existing.email,
    details: 'تم تعليق الاشتراك',
  })
}

/** إعادة تفعيل اشتراك */
export async function reactivateSubscription(id: string): Promise<void> {
  const existing = await getSubscription(id)
  if (!existing) throw new Error('الاشتراك غير موجود')

  const newStatus: SubscriptionStatus = existing.expiryDate > new Date() ? 'active' : 'expired'

  await updateDoc(doc(db, 'subs', id), {
    status: newStatus,
    updatedAt: serverTimestamp(),
  })

  await logActivity({
    action: 'reactivated',
    subscriberId: id,
    subscriberEmail: existing.email,
    details: 'تمت إعادة التفعيل',
  })
}

/** حذف اشتراك */
export async function deleteSubscription(id: string): Promise<void> {
  const existing = await getSubscription(id)
  if (!existing) throw new Error('الاشتراك غير موجود')

  await deleteDoc(doc(db, 'subs', id))

  await logActivity({
    action: 'deleted',
    subscriberId: id,
    subscriberEmail: existing.email,
    details: 'تم حذف الاشتراك',
  })
}

/** تحديث حالات الاشتراكات المنتهية تلقائياً */
export function computeStatus(sub: Subscription): SubscriptionStatus {
  if (sub.status === 'suspended') return 'suspended'

  const now = Date.now()
  const expMs = sub.expiryDate.getTime()
  const graceEnd = expMs + sub.graceDays * 86_400_000

  if (now <= expMs) {
    return sub.status === 'trial' ? 'trial' : 'active'
  }
  if (now <= graceEnd) return 'grace'
  return 'expired'
}

// ─────────────────────────────────────────────────────────────────
// Dashboard Stats
// ─────────────────────────────────────────────────────────────────

export function computeStats(subs: Subscription[]): DashboardStats {
  const stats: DashboardStats = {
    total: subs.length,
    active: 0,
    trial: 0,
    grace: 0,
    expired: 0,
    suspended: 0,
    expiringSoon: 0,
  }

  const now = Date.now()
  const sevenDaysMs = 7 * 86_400_000

  for (const sub of subs) {
    const status = computeStatus(sub)
    stats[status]++

    // تنتهي خلال 7 أيام
    const expMs = sub.expiryDate.getTime()
    if (status === 'active' || status === 'trial') {
      if (expMs - now <= sevenDaysMs && expMs > now) {
        stats.expiringSoon++
      }
    }
  }

  return stats
}

// ─────────────────────────────────────────────────────────────────
// Activity Log
// ─────────────────────────────────────────────────────────────────

export async function logActivity(params: Omit<ActivityLog, 'id' | 'adminEmail' | 'timestamp'>): Promise<void> {
  try {
    const adminEmail = auth.currentUser?.email || 'system'
    const logRef = doc(collection(db, 'activity'))
    await setDoc(logRef, {
      ...params,
      adminEmail,
      timestamp: serverTimestamp(),
    })
  } catch {
    // لا نوقف العملية إذا فشل تسجيل النشاط
  }
}

export async function getActivityLog(limit = 50): Promise<ActivityLog[]> {
  const q = query(collection(db, 'activity'), orderBy('timestamp', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.slice(0, limit).map((d) => {
    const data = d.data() as Record<string, unknown>
    return {
      id: d.id,
      action: data.action as ActivityLog['action'],
      subscriberId: data.subscriberId as string,
      subscriberEmail: data.subscriberEmail as string,
      adminEmail: data.adminEmail as string,
      details: data.details as string | undefined,
      timestamp: tsToDate(data.timestamp),
    }
  })
}

// ─────────────────────────────────────────────────────────────────
// WhatsApp
// ─────────────────────────────────────────────────────────────────

const WA_NUMBER = import.meta.env.VITE_LIC_WHATSAPP || '972592133357'

export function buildRenewalWhatsApp(sub: Subscription): string {
  const msg = formatTemplate(getTemplates().renewal, {
    name: sub.displayName || sub.username,
    date: sub.expiryDate.toLocaleDateString('ar'),
    uid: sub.uid,
    days: Math.max(0, Math.ceil((sub.expiryDate.getTime() - Date.now()) / 86400000)),
  })

  return `https://wa.me/${sub.phone?.replace(/\D/g, '') || WA_NUMBER}?text=${encodeURIComponent(msg)}`
}

/** تذكير سريع بانتهاء قريب (يستخدم قالب expiring) */
export function buildExpiringWhatsApp(sub: Subscription): string {
  const days = Math.max(0, Math.ceil((sub.expiryDate.getTime() - Date.now()) / 86400000))
  const msg = formatTemplate(getTemplates().expiring, {
    name: sub.displayName || sub.username,
    date: sub.expiryDate.toLocaleDateString('ar'),
    uid: sub.uid,
    days,
  })

  return `https://wa.me/${sub.phone?.replace(/\D/g, '') || WA_NUMBER}?text=${encodeURIComponent(msg)}`
}

export function buildExpiredWhatsApp(sub: Subscription): string {
  const msg = formatTemplate(getTemplates().expired, {
    name: sub.displayName || sub.username,
    date: sub.expiryDate.toLocaleDateString('ar'),
    uid: sub.uid,
    days: 0,
  })

  return `https://wa.me/${sub.phone?.replace(/\D/g, '') || WA_NUMBER}?text=${encodeURIComponent(msg)}`
}
