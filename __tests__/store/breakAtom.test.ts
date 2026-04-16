import { describe, it, expect } from 'vitest'
import { createStore } from 'jotai'
import { breakStateAtom, initialBreakState, BREAK_DURATION } from '@/store/breakAtom'

describe('breakStateAtom', () => {
  it('should have correct initial state', () => {
    const store = createStore()
    const state = store.get(breakStateAtom)

    expect(state).toEqual(initialBreakState)
    expect(state.status).toBe('idle')
    expect(state.startTime).toBeNull()
    expect(state.remainingSeconds).toBe(BREAK_DURATION)
    expect(state.pausedAt).toBeNull()
    expect(state.breakRecordId).toBeNull()
  })

  it('should have 60 minutes as BREAK_DURATION', () => {
    expect(BREAK_DURATION).toBe(3600)
  })

  it('should update to breaking state', () => {
    const store = createStore()
    const now = Date.now()

    store.set(breakStateAtom, {
      status: 'breaking',
      startTime: now,
      remainingSeconds: BREAK_DURATION,
      pausedAt: null,
      breakRecordId: 'test-id',
    })

    const state = store.get(breakStateAtom)
    expect(state.status).toBe('breaking')
    expect(state.startTime).toBe(now)
    expect(state.breakRecordId).toBe('test-id')
  })

  it('should update to paused state with remaining time', () => {
    const store = createStore()
    const now = Date.now()

    store.set(breakStateAtom, {
      status: 'paused',
      startTime: null,
      remainingSeconds: 2400, // 40 minutes
      pausedAt: now,
      breakRecordId: 'test-id',
    })

    const state = store.get(breakStateAtom)
    expect(state.status).toBe('paused')
    expect(state.remainingSeconds).toBe(2400)
    expect(state.pausedAt).toBe(now)
    expect(state.startTime).toBeNull()
  })

  it('should reset to initial state', () => {
    const store = createStore()

    store.set(breakStateAtom, {
      status: 'breaking',
      startTime: Date.now(),
      remainingSeconds: 1800,
      pausedAt: null,
      breakRecordId: 'test-id',
    })

    store.set(breakStateAtom, initialBreakState)

    const state = store.get(breakStateAtom)
    expect(state).toEqual(initialBreakState)
  })
})
