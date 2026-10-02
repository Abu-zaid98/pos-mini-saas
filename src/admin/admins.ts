/**
 * admins.ts — إدارة حسابات المدراء من داخل لوحة التحكم
 *
 * القاعدة الذهبية: كلمة المرور تُستخدم مرة واحدة لإنشاء حساب Firebase Auth
 * عبر REST ولا تُحفظ في Firestore أبداً — مستند admins/{uid} يحمل فقط:
 * { email, displayName, active, createdAt, createdBy }
 *
 * الصلاحيات (firestore.rules):
 *  • القراءة والإنشاء: مدير فقط
 *  • التعديل/الحذف: مدير فقط + ممنوع على حسابه هو (حماية من القفل الذاتي)
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
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db, auth } from './firebase'
import { createFirebaseUser, logActivity } from './subscriptions'
import type { AdminUser } from './types'

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  if (typeof v === 'number') return new Date(v)
  if (typeof v === 'string') return new Date(v)
  return new Date()
}

/** تحويل مستند Firestore إلى AdminUser (دالة نقية — مغطاة بالاختبارات) */
export function parseAdmin(uid: string, data: Record<string, unknown>): AdminUser {
  return {
    uid,
    email: (data.email as string) || '',
    displayName: (data.displayName as string) || undefined,
    // مغلق افتراضياً: غياب الحقل = غير مفعّل
    active: data.active === true,
    createdAt: toDate(data.createdAt),
    createdBy: (data.createdBy as string) || undefined,
  }
}

/** كل المدراء (الأحدث أولاً) */
export async function getAllAdmins(): Promise<AdminUser[]> {
  const q = query(collection(db, 'admins'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => parseAdmin(d.id, d.data() as Record<string, unknown>))
}

/** إنشاء مدير جديد — كلمة المرور تذهب لـ Auth فقط ولا تُخزّن */
export async function createAdmin(params: {
  email: string
  password: string
  displayName?: string
}): Promise<AdminUser> {
  const email = params.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('البريد الإلكتروني غير صالح')

  // ❶ فحص مبكر قبل إنشاء حساب Auth يتيم: هل أستطيع الكتابة فعلاً؟
  try {
    const me = await getDoc(doc(db, 'admins', auth.currentUser?.uid || 'none'))
    if (!me.exists() || me.data()?.active !== true) {
      throw new Error('NOT_ADMIN')
    }
  } catch (e) {
    throw toFriendlyError(e, 'preflight')
  }

  // ❷ إنشاء حساب الدخول (REST signUp لا يمس جلسة الأدمن الحالية)
  const uid = await createFirebaseUser(email, params.password)

  // ❸ حفظ الصلاحيات — إن فشل هنا صار الحساب يتيماً في Auth ويجب توضيح ذلك
  try {
    const now = new Date()
    await setDoc(doc(db, 'admins', uid), {
      email,
      displayName: params.displayName?.trim() || null,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.email || 'system',
    })

    await logActivity({
      action: 'admin_created',
      subscriberId: uid,
      subscriberEmail: email,
      details: `مدير جديد: ${email}`,
    })

    return {
      uid,
      email,
      displayName: params.displayName?.trim() || undefined,
      active: true,
      createdAt: now,
      createdBy: auth.currentUser?.email || undefined,
    }
  } catch (e) {
    throw toFriendlyError(e, 'create')
  }
}

/** ترجمة أخطاء Firestore لرسائل عربية قابلة للتنفيذ */
function toFriendlyError(e: unknown, stage: 'preflight' | 'create' | 'write'): Error {
  const msg = (e as Error)?.message || ''
  if ((e as Error)?.message === 'NOT_ADMIN' || msg === 'NOT_ADMIN') {
    return new Error('⛔ حسابك غير مسجل كمدير مفعّل — لا يمكنك إنشاء مدراء')
  }
  if (msg.includes('permission-denied') || msg.includes('insufficient permissions')) {
    if (stage === 'preflight') {
      return new Error('⛔ تعذّر التحقق من صلاحياتك — انشر أحدث القواعد أولاً: npm run deploy:rules')
    }
    // stage === 'create': الحساب أُنشئ في Auth قبل فشل الحفظ
    if (stage === 'create') {
      return new Error(
        '⛔ رُفض الحفظ في قاعدة البيانات — القواعد المنشورة قديمة وتمنع الكتابة. ' +
        'انشر الأحدث: npm run deploy:rules ثم أعد المحاولة. ' +
        '⚠️ تنبيه: حساب الدخول أُنشئ في Authentication — احذفه من الكونسول قبل إعادة المحاولة بنفس الإيميل.'
      )
    }
    return new Error('⛔ رُفضت الكتابة في قاعدة البيانات — انشر أحدث القواعد: npm run deploy:rules')
  }
  return e as Error
}

/** تفعيل / إيقاف مدير — ممنوع على الحساب الحالي */
export async function setAdminActive(uid: string, active: boolean): Promise<void> {
  if (auth.currentUser?.uid === uid) {
    throw new Error('لا يمكنك تعديل صلاحيات حسابك الحالي — اطلب من مدير آخر')
  }
  const snap = await getDoc(doc(db, 'admins', uid))
  if (!snap.exists()) throw new Error('المدير غير موجود')

  try {
    await updateDoc(doc(db, 'admins', uid), { active })
  } catch (e) {
    throw toFriendlyError(e, 'write')
  }
  const email = (snap.data().email as string) || uid

  await logActivity({
    action: 'admin_updated',
    subscriberId: uid,
    subscriberEmail: email,
    details: active ? `تفعيل المدير: ${email}` : `إيقاف المدير: ${email}`,
  })
}

/**
 * حذف مدير من مجموعة admins (يفقد دخول اللوحة فوراً).
 * ملاحظة: حساب Firebase Auth يبقى موجوداً — للحذف الكامل احذفه من
 * Authentication في الكونسول. ممنوع حذف حسابك الحالي.
 */
export async function deleteAdmin(uid: string): Promise<void> {
  if (auth.currentUser?.uid === uid) {
    throw new Error('لا يمكنك حذف حسابك الحالي')
  }
  const snap = await getDoc(doc(db, 'admins', uid))
  if (!snap.exists()) throw new Error('المدير غير موجود')
  const email = (snap.data().email as string) || uid

  try {
    await deleteDoc(doc(db, 'admins', uid))
  } catch (e) {
    throw toFriendlyError(e, 'write')
  }

  await logActivity({
    action: 'admin_deleted',
    subscriberId: uid,
    subscriberEmail: email,
    details: `حذف المدير: ${email} (حساب Auth يبقى — احذفه من الكونسول للإزالة الكاملة)`,
  })
}
