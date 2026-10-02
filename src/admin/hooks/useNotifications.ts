/**
 * useNotifications.ts — تنبيهات اللوحة: انتهاء قريب + أجهزة متعددة نشطة
 */
import { useCallback, useEffect, useState } from 'react'
import { getAllSubscriptions, computeStatus } from '../subscriptions'
import { getAllSessions } from '../sessions'
import { activeDevices } from '../../lib/session-policy'
import type { Subscription } from '../types'

export interface DeviceAlert {
  uid: string
  email: string
  name: string
  subId: string
  count: number
}

export function useNotifications() {
  const [expiring, setExpiring] = useState<Subscription[]>([])
  const [multiDevice, setMultiDevice] = useState<DeviceAlert[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [subs, sessions] = await Promise.all([getAllSubscriptions(), getAllSessions()])
      const now = Date.now()
      const byUid = new Map(subs.map((s) => [s.uid, s]))

      setExpiring(
        subs.filter((s) => {
          const status = computeStatus(s)
          if (status !== 'active' && status !== 'trial') return false
          const days = Math.ceil((s.expiryDate.getTime() - now) / 86400000)
          return days <= 2 && days >= 0
        })
      )

      const alerts: DeviceAlert[] = []
      for (const sess of sessions) {
        const live = activeDevices(
          sess.devices.map((d) => ({ id: d.id, seen: d.seen.getTime() })),
          now
        )
        if (live.length >= 2) {
          const sub = byUid.get(sess.uid)
          alerts.push({
            uid: sess.uid,
            email: sub?.email || sess.uid,
            name: sub?.displayName || sub?.username || sess.uid,
            subId: sub?.id || '',
            count: live.length,
          })
        }
      }
      setMultiDevice(alerts)
    } catch {
      // التنبيهات اختيارية — لا تكسر اللوحة
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { expiring, multiDevice, loading, refresh, total: expiring.length + multiDevice.length }
}
