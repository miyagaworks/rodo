import { atom } from 'jotai'

export interface BreakState {
  status: 'idle' | 'breaking' | 'paused'
  startTime: number | null        // Date.now() at break start
  remainingSeconds: number         // seconds remaining (starts at 3600)
  pausedAt: number | null          // Date.now() when paused
  breakRecordId: string | null
}

const BREAK_DURATION_SECONDS = 60 * 60 // 60 minutes

export const initialBreakState: BreakState = {
  status: 'idle',
  startTime: null,
  remainingSeconds: BREAK_DURATION_SECONDS,
  pausedAt: null,
  breakRecordId: null,
}

export const breakStateAtom = atom<BreakState>(initialBreakState)

export const BREAK_DURATION = BREAK_DURATION_SECONDS
