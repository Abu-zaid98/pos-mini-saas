/**
 * usePWAUpdate.ts — رصد نسخة جديدة من التطبيق وتطبيقها بضغطة
 * يعمل في الإنتاج فقط (بلا Service Worker في التطوير)
 */
import { useCallback, useEffect, useState } from 'react'
import { Workbox } from 'workbox-window'

let sharedWb: Workbox | null = null
let sharedWaiting = false
const listeners = new Set<(waiting: boolean) => void>()

function getWb(): Workbox | null {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator)) return null
  if (!import.meta.env.PROD) return null
  if (!sharedWb) {
    try {
      sharedWb = new Workbox('/sw.js')
      sharedWb.addEventListener('waiting', () => {
        sharedWaiting = true
        listeners.forEach((fn) => fn(true))
      })
      sharedWb.addEventListener('controlling', () => {
        window.location.reload()
      })
      void sharedWb.register().catch(() => null)
    } catch {
      return null
    }
  }
  return sharedWb
}

export function usePWAUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(sharedWaiting)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const wb = getWb()
    if (!wb) return
    const fn = (waiting: boolean) => setUpdateAvailable(waiting)
    listeners.add(fn)
    // إن كانت نسخة بانتظار التفعيل من جلسة سابقة (فاتنا حدث waiting) — نكتشفها مباشرة
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          if (reg?.waiting) {
            sharedWaiting = true
            listeners.forEach((l) => l(true))
          }
        })
        .catch(() => null)
    }
    // فحص دوري + عند العودة للتطبيق — لالتقاط التحديث أثناء الاستخدام الطويل
    const interval = setInterval(() => {
      void wb.update().catch(() => null)
    }, 60 * 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void wb.update().catch(() => null)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      listeners.delete(fn)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const applyUpdate = useCallback(async () => {
    const wb = getWb()
    if (!wb) {
      window.location.reload()
      return
    }
    try {
      await wb.messageSkipWaiting()
    } catch {
      window.location.reload()
    }
    // احتياط: إن لم يحدث controlling خلال ثانيتين حدّث يدوياً
    setTimeout(() => window.location.reload(), 2500)
  }, [])

  /** فحص يدوي فوري — يُرجع true إن وُجد تحديث */
  const checkNow = useCallback(async (): Promise<boolean> => {
    const wb = getWb()
    if (!wb) return false
    setChecking(true)
    try {
      await wb.update()
      // مهلة قصيرة لوصول حدث waiting
      await new Promise((r) => setTimeout(r, 2500))
      return sharedWaiting
    } catch {
      return false
    } finally {
      setChecking(false)
    }
  }, [])

  /**
   * تحديث قسري — الحل الأخير المضمون: إلغاء Service Workers ومسح كل الكاش
   * ثم إعادة التحميل من الشبكة. يعمل حتى لو تعطل نظام التحديث نفسه.
   */
  const forceRefresh = useCallback(async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)))
      }
    } finally {
      window.location.reload()
    }
  }, [])

  return { updateAvailable, applyUpdate, checkNow, forceRefresh, checking }
}
