/**
 * sessions.ts — إدارة أجهزة المشتركين من اللوحة
 * collection: sessions/{uid} — { devices: [{id, seen}], max: number }
 *
 * القواعد (firestore.rules): المالك يقرأ/يكتب مستنده فقط، والأدمن كل شيء.
 * كلمات المرور لا تُمس هنا إطلاقاً — فقط فك الارتباط وحد الأجهزة.
 */
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { logActivity } from './subscriptions'
import { SESSION_DEFAULT_MAX } from '../lib/session-policy'

export interface AdminSessionDevice {
  id: string
  seen: Date
}

export interface AdminSession {
  uid: string
  devices: AdminSessionDevice[]
  max: number
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v
  if (typeof v === 'number') return new Date(v)
  // Firestore Timestamp
  const t = v as { toDate?: () => Date } | null
  if (t && typeof t.toDate === 'function') {
    try {
      return t.toDate()
    } catch {
      return new Date(0)
    }
  }
  return new Date(0)
}

/** قراءة جلسة مشترك (null = لم يسجل دخوله من أي جهاز بعد) */
export async function getSession(uid: string): Promise<AdminSession | null> {
  const snap = await getDoc(doc(db, 'sessions', uid))
  if (!snap.exists()) return null
  return parseSession(uid, snap.data() as Record<string, unknown>)
}

function parseSession(uid: string, data: Record<string, unknown>): AdminSession {
  const rawDevices = (data.devices as Array<{ id?: string; seen?: unknown }>) || []
  return {
    uid,
    devices: rawDevices
      .filter((d) => typeof d?.id === 'string' && d.id)
      .map((d) => ({ id: d.id as string, seen: toDate(d.seen) })),
    max: Math.max(1, Math.round(Number(data.max) || SESSION_DEFAULT_MAX)),
  }
}

/** كل الجلسات (للتقارير: رصد الأجهزة المتعددة النشطة) */
export async function getAllSessions(): Promise<AdminSession[]> {
  const snap = await getDocs(query(collection(db, 'sessions')))
  return snap.docs.map((d) => parseSession(d.id, d.data() as Record<string, unknown>))
}

/** تغيير الحد الأقصى للأجهزة (1-1000 — يشمل باقات الشركات حتى 100 جهاز) */
export async function setMaxDevices(uid: string, max: number, email: string): Promise<void> {
  const safe = Math.min(1000, Math.max(1, Math.round(max) || SESSION_DEFAULT_MAX))
  const ref = doc(db, 'sessions', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      devices: [],
      max: safe,
      updatedAt: serverTimestamp(),
    })
  } else {
    await updateDoc(ref, { max: safe, updatedAt: serverTimestamp() })
  }

  await logActivity({
    action: 'devices_reset',
    subscriberId: uid,
    subscriberEmail: email,
    details: `تحديد حد الأجهزة إلى ${safe}`,
  })
}

/** فك ارتباط جهاز واحد — يُحرر المقعد فوراً (إن عاد الجهاز وسجّل نبضة سيظهر مجدداً) */
export async function removeDevice(uid: string, deviceId: string, email: string): Promise<void> {
  const session = await getSession(uid)
  if (!session) throw new Error('لا توجد جلسات لهذا المشترك')
  const remaining = session.devices.filter((d) => d.id !== deviceId)

  await updateDoc(doc(db, 'sessions', uid), {
    devices: remaining.map((d) => ({ id: d.id, seen: d.seen })),
    updatedAt: serverTimestamp(),
  })

  await logActivity({
    action: 'devices_reset',
    subscriberId: uid,
    subscriberEmail: email,
    details: `فك ارتباط الجهاز ${deviceId.slice(0, 8).toUpperCase()}`,
  })
}

/** إعادة تعيين كاملة — تحرير كل الأجهزة (للجهاز الجديد/المفقود) */
export async function resetDevices(uid: string, email: string): Promise<void> {
  await deleteDoc(doc(db, 'sessions', uid))

  await logActivity({
    action: 'devices_reset',
    subscriberId: uid,
    subscriberEmail: email,
    details: 'إعادة تعيين الأجهزة — تحرير كل الجلسات',
  })
}
