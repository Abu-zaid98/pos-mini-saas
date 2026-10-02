/**
 * useAdminAuth.ts — Hook لإدارة جلسة الأدمن
 * الدخول وحده لا يكفي: يجب أن يكون الحساب مسجلاً في مجموعة admins
 * (مستند admins/{uid} بحقل active=true) — وإلا يُعتبر زائراً غير مخوّل
 */
import { useState, useEffect } from 'react'
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

interface AdminAuthState {
  user: User | null
  /** null = لم يُتحقق بعد، true = مدير، false = حساب عادي (مشترك مثلاً) */
  isAdmin: boolean | null
  loading: boolean
  error: string
}

async function checkAdminMembership(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'admins', uid))
    return snap.exists() && snap.data()?.active === true
  } catch {
    // رفض الصلاحيات من القواعد يعني: ليس مديراً
    return false
  }
}

export function useAdminAuth() {
  const [state, setState] = useState<AdminAuthState>({
    user: null,
    isAdmin: null,
    loading: true,
    error: '',
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState((s) => ({ ...s, user: null, isAdmin: null, loading: false }))
        return
      }
      const admin = await checkAdminMembership(user.uid)
      setState((s) => ({ ...s, user, isAdmin: admin, loading: false }))
    })
    return unsub
  }, [])

  const login = async (email: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: '' }))
    try {
      await signInWithEmailAndPassword(auth, email, password)
      // التحقق من العضوية يتم عبر onAuthStateChanged أعلاه
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || ''
      let msg = 'خطأ في تسجيل الدخول'
      if (code.includes('wrong-password') || code.includes('invalid-credential')) {
        msg = 'كلمة المرور غير صحيحة'
      } else if (code.includes('user-not-found')) {
        msg = 'البريد الإلكتروني غير مسجّل'
      } else if (code.includes('too-many-requests')) {
        msg = 'تم حظر الحساب مؤقتاً بسبب المحاولات الكثيرة'
      }
      setState((s) => ({ ...s, loading: false, error: msg }))
    }
  }

  const logout = async () => {
    await signOut(auth)
  }

  return { ...state, login, logout }
}
