/**
 * useSubscriptions.ts — Hook لجلب وإدارة الاشتراكات
 */
import { useState, useCallback } from 'react'
import {
  getAllSubscriptions,
  computeStatus,
  computeStats,
} from '../subscriptions'
import type { Subscription, DashboardStats } from '../types'

export function useSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const subs = await getAllSubscriptions()
      // تحديث الحالة المحسوبة
      const updated = subs.map((s) => ({ ...s, status: computeStatus(s) }))
      setSubscriptions(updated)
      setStats(computeStats(updated))
    } catch (err: unknown) {
      const msg = (err as Error).message || 'خطأ في تحميل البيانات'
      // رسالة عربية واضحة عند رفض الصلاحيات (قواعد firestore.rules)
      if (msg.includes('permission-denied') || msg.includes('insufficient permissions')) {
        setError('⛔ صلاحيات غير كافية — حسابك غير مسجل كمدير. أنشئ مستنداً له في مجموعة admins من Firebase Console (انظر firestore.rules)')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  return { subscriptions, stats, loading, error, refresh }
}
