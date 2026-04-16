import { atom } from 'jotai'

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'error'

export interface SyncState {
  status: SyncStatus
  pendingCount: number
  lastSyncAt: number | null
  errorMessage: string | null
}

export const syncStateAtom = atom<SyncState>({
  status: 'online',
  pendingCount: 0,
  lastSyncAt: null,
  errorMessage: null,
})
