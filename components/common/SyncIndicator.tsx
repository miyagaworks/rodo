'use client'

import { useAtomValue } from 'jotai'
import { Loader2, WifiOff, AlertTriangle } from 'lucide-react'
import { syncStateAtom, type SyncStatus } from '@/store/syncAtom'

const STATUS_CONFIG: Record<
  Exclude<SyncStatus, 'online'>,
  { bg: string; text: string; icon?: React.ReactNode }
> = {
  offline: {
    bg: '#F59E0B',
    text: 'オフライン - データはローカルに保存されます',
    icon: <WifiOff className="w-4 h-4 shrink-0" />,
  },
  syncing: {
    bg: '#71A9F7',
    text: '同期中...',
    icon: <Loader2 className="w-4 h-4 shrink-0 animate-spin" />,
  },
  error: {
    bg: '#D3170A',
    text: '同期失敗',
    icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
  },
}

interface SyncIndicatorProps {
  onRetry?: () => void
}

export default function SyncIndicator({ onRetry }: SyncIndicatorProps) {
  const syncState = useAtomValue(syncStateAtom)

  if (syncState.status === 'online') return null

  const config = STATUS_CONFIG[syncState.status]

  return (
    <div
      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-white text-sm font-medium"
      style={{ backgroundColor: config.bg }}
      role="status"
      aria-live="polite"
    >
      {config.icon}
      <span>{config.text}</span>
      {syncState.status === 'error' && onRetry && (
        <button
          onClick={onRetry}
          className="ml-2 px-3 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors"
        >
          再試行
        </button>
      )}
      {syncState.pendingCount > 0 && (
        <span className="ml-1 text-xs opacity-80">
          ({syncState.pendingCount}件未送信)
        </span>
      )}
    </div>
  )
}
