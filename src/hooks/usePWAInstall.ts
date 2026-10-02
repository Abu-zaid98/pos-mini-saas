import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isPersistent, setIsPersistent] = useState<boolean | null>(null)
  const [storageEstimate, setStorageEstimate] = useState<{
    usageMB: number
    quotaMB: number
    percentUsed: number
  } | null>(null)

  useEffect(() => {
    // Check if running standalone
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    setIsInstalled(isStandalone)

    // Capture install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleAppInstalled)

    // Check storage persistence
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((persisted) => {
        setIsPersistent(persisted)
      }).catch(() => {})
    }

    // Check storage estimate
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((estimate) => {
        const usage = estimate.usage || 0
        const quota = estimate.quota || 1
        const usageMB = +(usage / (1024 * 1024)).toFixed(2)
        const quotaMB = +(quota / (1024 * 1024)).toFixed(0)
        const percentUsed = +((usage / quota) * 100).toFixed(2)
        setStorageEstimate({ usageMB, quotaMB, percentUsed })
      }).catch(() => {})
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const installApp = async () => {
    if (!deferredPrompt) {
      return false
    }

    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setIsInstalled(true)
        setDeferredPrompt(null)
        return true
      }
      return false
    } catch (err) {
      console.error('PWA install error:', err)
      return false
    }
  }

  const requestPersistence = async () => {
    if (navigator.storage && navigator.storage.persist) {
      try {
        const granted = await navigator.storage.persist()
        setIsPersistent(granted)
        return granted
      } catch (err) {
        console.error('Storage persist error:', err)
        return false
      }
    }
    return false
  }

  return {
    canInstall: !!deferredPrompt,
    isInstalled,
    installApp,
    isPersistent,
    requestPersistence,
    storageEstimate,
  }
}
