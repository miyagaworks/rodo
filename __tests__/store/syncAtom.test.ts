import { describe, it, expect } from 'vitest'
import { createStore } from 'jotai'
import { syncStateAtom, type SyncState } from '@/store/syncAtom'

describe('syncStateAtom', () => {
  // ── 正常系 ──

  it('初期状態が online / pendingCount:0 / null である', () => {
    const store = createStore()
    const state = store.get(syncStateAtom)

    expect(state).toEqual({
      status: 'online',
      pendingCount: 0,
      lastSyncAt: null,
      errorMessage: null,
    })
  })

  it('offline に変更できる', () => {
    const store = createStore()
    store.set(syncStateAtom, {
      status: 'offline',
      pendingCount: 3,
      lastSyncAt: null,
      errorMessage: null,
    })

    const state = store.get(syncStateAtom)
    expect(state.status).toBe('offline')
    expect(state.pendingCount).toBe(3)
  })

  it('syncing に変更できる', () => {
    const store = createStore()
    store.set(syncStateAtom, {
      status: 'syncing',
      pendingCount: 5,
      lastSyncAt: null,
      errorMessage: null,
    })

    const state = store.get(syncStateAtom)
    expect(state.status).toBe('syncing')
    expect(state.pendingCount).toBe(5)
  })

  it('error に変更しエラーメッセージを保持できる', () => {
    const store = createStore()
    store.set(syncStateAtom, {
      status: 'error',
      pendingCount: 2,
      lastSyncAt: null,
      errorMessage: '2件の同期に失敗しました',
    })

    const state = store.get(syncStateAtom)
    expect(state.status).toBe('error')
    expect(state.errorMessage).toBe('2件の同期に失敗しました')
    expect(state.pendingCount).toBe(2)
  })

  it('lastSyncAt にタイムスタンプを保存できる', () => {
    const store = createStore()
    const now = Date.now()

    store.set(syncStateAtom, {
      status: 'online',
      pendingCount: 0,
      lastSyncAt: now,
      errorMessage: null,
    })

    const state = store.get(syncStateAtom)
    expect(state.lastSyncAt).toBe(now)
  })

  // ── エッジケース ──

  it('error から online へ復帰できる', () => {
    const store = createStore()

    store.set(syncStateAtom, {
      status: 'error',
      pendingCount: 1,
      lastSyncAt: null,
      errorMessage: 'sync failed',
    })

    store.set(syncStateAtom, {
      status: 'online',
      pendingCount: 0,
      lastSyncAt: Date.now(),
      errorMessage: null,
    })

    const state = store.get(syncStateAtom)
    expect(state.status).toBe('online')
    expect(state.errorMessage).toBeNull()
    expect(state.pendingCount).toBe(0)
  })

  it('複数の store インスタンスが独立している', () => {
    const store1 = createStore()
    const store2 = createStore()

    store1.set(syncStateAtom, {
      status: 'offline',
      pendingCount: 5,
      lastSyncAt: null,
      errorMessage: null,
    })

    // store2 は初期値のまま
    expect(store2.get(syncStateAtom).status).toBe('online')
    expect(store2.get(syncStateAtom).pendingCount).toBe(0)
  })

  // ── 型安全性 ──

  it('SyncState の全プロパティが定義されている', () => {
    const store = createStore()
    const state = store.get(syncStateAtom)

    expect(state).toHaveProperty('status')
    expect(state).toHaveProperty('pendingCount')
    expect(state).toHaveProperty('lastSyncAt')
    expect(state).toHaveProperty('errorMessage')
  })
})
