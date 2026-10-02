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

  useEffect(() => {
    const wb = getWb()
    if (!wb) return
    const fn = (waiting: boolean) => setUpdateAvailable(waiting)
    listeners.add(fn)
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

  return { updateAvailable, applyUpdate }
}
