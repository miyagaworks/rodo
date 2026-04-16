'use client'

import { useEffect } from 'react'
import SyncIndicator from '@/components/common/SyncIndicator'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[SW] registered, scope:', reg.scope)
        })
        .catch((err) => {
          console.error('[SW] registration failed:', err)
        })
    }
  }, [])

  return null
}

function SyncIndicatorWrapper() {
  const { handleRetry } = useOnlineStatus()
  return <SyncIndicator onRetry={handleRetry} />
}

export default function OfflineProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegistrar />
      <SyncIndicatorWrapper />
      {children}
    </>
  )
}
