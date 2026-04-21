import { atom } from 'jotai'
import { BREAK_DURATION_SECONDS } from '@/lib/constants/break'

export interface BreakState {
  status: 'idle' | 'breaking' | 'paused'
  startTime: number | null        // Date.now() at break start
  remainingSeconds: number         // seconds remaining (starts at 3600)
  pausedAt: number | null          // Date.now() when paused
  breakRecordId: string | null
}

export const initialBreakState: BreakState = {
  status: 'idle',
  startTime: null,
  remainingSeconds: BREAK_DURATION_SECONDS,
  pausedAt: null,
  breakRecordId: null,
}

export const breakStateAtom = atom<BreakState>(initialBreakState)

/** @deprecated 後方互換用。新しいコードでは `@/lib/constants/break` から `BREAK_DURATION_SECONDS` を import すること。 */
export const BREAK_DURATION = BREAK_DURATION_SECONDS
