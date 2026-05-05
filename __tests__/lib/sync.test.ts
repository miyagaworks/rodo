import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// offline-db モック
const mockGetAllPendingActions = vi.fn()
const mockDeletePendingAction = vi.fn()
const mockGetPendingActionCount = vi.fn()
const mockSetSyncMeta = vi.fn()
const mockGetAllOfflinePhotos = vi.fn()
const mockDeletePhoto = vi.fn()

vi.mock('@/lib/offline-db', () => ({
  getAllPendingActions: (...args: unknown[]) => mockGetAllPendingActions(...args),
  deletePendingAction: (...args: unknown[]) => mockDeletePendingAction(...args),
  getPendingActionCount: (...args: unknown[]) => mockGetPendingActionCount(...args),
  setSyncMeta: (...args: unknown[]) => mockSetSyncMeta(...args),
  getAllOfflinePhotos: (...args: unknown[]) => mockGetAllOfflinePhotos(...args),
  deletePhoto: (...args: unknown[]) => mockDeletePhoto(...args),
}))

import { syncPendingActions, syncOfflinePhotos, getPendingCount } from '@/lib/sync'

describe('sync', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    mockGetAllPendingActions.mockReset()
    mockDeletePendingAction.mockReset()
    mockGetPendingActionCount.mockReset()
    mockSetSyncMeta.mockReset()
    mockGetAllOfflinePhotos.mockReset()
    mockDeletePhoto.mockReset()
    mockDeletePendingAction.mockResolvedValue(undefined)
    mockSetSyncMeta.mockResolvedValue(undefined)
    mockDeletePhoto.mockResolvedValue(undefined)
  })

  afterEach(() => {
    fetchSpy?.mockRestore()
    vi.useRealTimers()
  })

  // ── syncPendingActions ──

  describe('syncPendingActions', () => {
    const makeAction = (id: string, endpoint: string) => ({
      id,
      type: 'dispatch_create' as const,
      dispatchId: null,
      timestamp: Date.now(),
      data: { name: 'test' },
      endpoint,
      method: 'POST' as const,
    })

    it('pending が 0 件なら何もしない', async () => {
      mockGetAllPendingActions.mockResolvedValue([])
      fetchSpy = vi.spyOn(globalThis, 'fetch')

      const result = await syncPendingActions()

      expect(result).toEqual({ synced: 0, failed: 0 })
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(mockSetSyncMeta).not.toHaveBeenCalled()
    })

    it('全件成功時に各アクションを削除し lastSync を更新する', async () => {
      const actions = [makeAction('a1', '/api/d/1'), makeAction('a2', '/api/d/2')]
      mockGetAllPendingActions.mockResolvedValue(actions)
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 }),
      )

      const result = await syncPendingActions()

      expect(result).toEqual({ synced: 2, failed: 0 })
      expect(mockDeletePendingAction).toHaveBeenCalledWith('a1')
      expect(mockDeletePendingAction).toHaveBeenCalledWith('a2')
      expect(mockSetSyncMeta).toHaveBeenCalledWith('lastSync', expect.any(Number))
    })

    it('onProgress コールバックが呼ばれる', async () => {
      const actions = [makeAction('a1', '/api/d/1'), makeAction('a2', '/api/d/2')]
      mockGetAllPendingActions.mockResolvedValue(actions)
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 }),
      )

      const progress: [number, number][] = []
      await syncPendingActions((synced, total) => progress.push([synced, total]))

      expect(progress).toEqual([[1, 2], [2, 2]])
    })

    it('4xx エラー（409以外）はリトライせずスキップする', async () => {
      const actions = [makeAction('a1', '/api/d/1')]
      mockGetAllPendingActions.mockResolvedValue(actions)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Not Found', { status: 404 }),
      )

      const result = await syncPendingActions()

      expect(result).toEqual({ synced: 0, failed: 1 })
      expect(fetchSpy).toHaveBeenCalledTimes(1) // リトライなし
      expect(mockDeletePendingAction).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('5xx エラーは exponential backoff でリトライする', async () => {
      const actions = [makeAction('a1', '/api/d/1')]
      mockGetAllPendingActions.mockResolvedValue(actions)
      fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('Error', { status: 500 }))
        .mockResolvedValueOnce(new Response('Error', { status: 500 }))
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))

      const syncPromise = syncPendingActions()

      // 1回目失敗 → 1秒待機
      await vi.advanceTimersByTimeAsync(1000)
      // 2回目失敗 → 2秒待機
      await vi.advanceTimersByTimeAsync(2000)

      const result = await syncPromise

      expect(result).toEqual({ synced: 1, failed: 0 })
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it('ネットワークエラーも exponential backoff でリトライする', async () => {
      const actions = [makeAction('a1', '/api/d/1')]
      mockGetAllPendingActions.mockResolvedValue(actions)
      fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new Error('network'))
        .mockRejectedValueOnce(new Error('network'))
        .mockRejectedValueOnce(new Error('network'))

      const syncPromise = syncPendingActions()

      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(2000)

      const result = await syncPromise

      expect(result).toEqual({ synced: 0, failed: 1 })
      expect(fetchSpy).toHaveBeenCalledTimes(3) // 最大3回
    })

    it('一部成功・一部失敗の混在', async () => {
      const actions = [makeAction('a1', '/api/d/1'), makeAction('a2', '/api/d/2')]
      mockGetAllPendingActions.mockResolvedValue(actions)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))
        .mockResolvedValueOnce(new Response('Bad', { status: 400 }))

      const result = await syncPendingActions()

      expect(result).toEqual({ synced: 1, failed: 1 })
      expect(mockDeletePendingAction).toHaveBeenCalledTimes(1)
      expect(mockDeletePendingAction).toHaveBeenCalledWith('a1')
      expect(mockSetSyncMeta).toHaveBeenCalled() // synced > 0 なので呼ばれる
      consoleSpy.mockRestore()
    })
  })

  // ── syncOfflinePhotos ──

  describe('syncOfflinePhotos', () => {
    const makePhoto = (id: string, dispatchId: string) => ({
      id,
      dispatchId,
      blob: new Blob(['photo'], { type: 'image/jpeg' }),
      createdAt: Date.now(),
    })

    it('写真が 0 件なら何もしない', async () => {
      mockGetAllOfflinePhotos.mockResolvedValue([])
      fetchSpy = vi.spyOn(globalThis, 'fetch')

      const result = await syncOfflinePhotos()

      expect(result).toEqual({ synced: 0, failed: 0 })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('全件アップロード成功時に各写真を削除する', async () => {
      const photos = [makePhoto('p1', 'd1'), makePhoto('p2', 'd2')]
      mockGetAllOfflinePhotos.mockResolvedValue(photos)
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 }),
      )

      const result = await syncOfflinePhotos()

      expect(result).toEqual({ synced: 2, failed: 0 })
      expect(mockDeletePhoto).toHaveBeenCalledWith('p1')
      expect(mockDeletePhoto).toHaveBeenCalledWith('p2')
      expect(mockSetSyncMeta).toHaveBeenCalledWith('lastSync', expect.any(Number))
    })

    it('FormData で正しいエンドポイントに POST する', async () => {
      const photos = [makePhoto('p1', 'dispatch-abc')]
      mockGetAllOfflinePhotos.mockResolvedValue(photos)
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 }),
      )

      await syncOfflinePhotos()

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/dispatches/dispatch-abc/photos',
        expect.objectContaining({
          method: 'POST',
        }),
      )
      // FormData body を検証
      const callArgs = fetchSpy.mock.calls[0]
      expect(callArgs[1]?.body).toBeInstanceOf(FormData)
    })

    it('onProgress コールバックが呼ばれる', async () => {
      const photos = [makePhoto('p1', 'd1')]
      mockGetAllOfflinePhotos.mockResolvedValue(photos)
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 }),
      )

      const progress: [number, number][] = []
      await syncOfflinePhotos((synced, total) => progress.push([synced, total]))

      expect(progress).toEqual([[1, 1]])
    })

    it('4xx エラー（409以外）はスキップする', async () => {
      const photos = [makePhoto('p1', 'd1')]
      mockGetAllOfflinePhotos.mockResolvedValue(photos)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Bad', { status: 400 }),
      )

      const result = await syncOfflinePhotos()

      expect(result).toEqual({ synced: 0, failed: 1 })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      consoleSpy.mockRestore()
    })
  })

  // ── getPendingCount ──

  describe('getPendingCount', () => {
    it('getPendingActionCount のラッパーとして動作する', async () => {
      mockGetPendingActionCount.mockResolvedValue(7)

      const count = await getPendingCount()
      expect(count).toBe(7)
    })
  })
})
