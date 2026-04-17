import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// offline-db モック
const mockAddPendingAction = vi.fn()
vi.mock('@/lib/offline-db', () => ({
  addPendingAction: (...args: unknown[]) => mockAddPendingAction(...args),
}))

import { offlineFetch } from '@/lib/offline-fetch'

describe('offlineFetch', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

  function setOnline(online: boolean) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...navigator, onLine: online },
      writable: true,
      configurable: true,
    })
  }

  beforeEach(() => {
    mockAddPendingAction.mockReset()
    mockAddPendingAction.mockResolvedValue('queued-id')
  })

  afterEach(() => {
    fetchSpy?.mockRestore()
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator)
    }
  })

  // ── GET リクエスト ──

  it('GET はキューイングせず通常の fetch を実行する', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: 1 }), { status: 200 }),
    )

    const res = await offlineFetch('/api/test', { method: 'GET' })
    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith('/api/test', { method: 'GET' })
    expect(mockAddPendingAction).not.toHaveBeenCalled()
  })

  it('method 未指定（デフォルトGET）でも通常の fetch を実行する', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }),
    )

    await offlineFetch('/api/test')
    expect(fetchSpy).toHaveBeenCalled()
    expect(mockAddPendingAction).not.toHaveBeenCalled()
  })

  // ── POST/PATCH オンライン正常系 ──

  it('オンライン POST 成功時はそのままレスポンスを返す', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '123' }), { status: 201 }),
    )

    const res = await offlineFetch('/api/dispatches', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
      offlineActionType: 'dispatch_create',
    })

    expect(res.status).toBe(201)
    expect(mockAddPendingAction).not.toHaveBeenCalled()
  })

  // ── POST/PATCH オンライン 5xx ──

  it('オンライン POST で 5xx → キューイングして楽観的レスポンスを返す', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Server Error', { status: 500 }),
    )

    const res = await offlineFetch('/api/dispatches', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
      offlineActionType: 'dispatch_create',
      offlineDispatchId: 'disp-1',
      offlineGps: { lat: 35.6, lng: 139.7 },
      offlineOptimisticData: { queued: true, id: 'temp' },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ queued: true, id: 'temp' })
    expect(mockAddPendingAction).toHaveBeenCalledTimes(1)

    const action = mockAddPendingAction.mock.calls[0][0]
    expect(action.type).toBe('dispatch_create')
    expect(action.endpoint).toBe('/api/dispatches')
    expect(action.method).toBe('POST')
    expect(action.dispatchId).toBe('disp-1')
    expect(action.gps).toEqual({ lat: 35.6, lng: 139.7 })
  })

  it('オンライン POST で 5xx かつ offlineActionType 未設定 → そのままエラーレスポンスを返す', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Server Error', { status: 500 }),
    )

    const res = await offlineFetch('/api/dispatches', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(500)
    expect(mockAddPendingAction).not.toHaveBeenCalled()
  })

  // ── POST/PATCH オンライン 4xx ──

  it('オンライン POST で 4xx → キューイングせずそのままレスポンスを返す', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Bad Request', { status: 400 }),
    )

    const res = await offlineFetch('/api/dispatches', {
      method: 'POST',
      body: JSON.stringify({}),
      offlineActionType: 'dispatch_create',
    })

    expect(res.status).toBe(400)
    expect(mockAddPendingAction).not.toHaveBeenCalled()
  })

  // ── POST/PATCH オンライン ネットワークエラー ──

  it('オンライン POST でネットワークエラー → キューイングして楽観的レスポンスを返す', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))

    const res = await offlineFetch('/api/dispatches', {
      method: 'POST',
      body: JSON.stringify({ x: 1 }),
      offlineActionType: 'dispatch_create',
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ ok: true, queued: true }) // デフォルトの楽観的データ
    expect(mockAddPendingAction).toHaveBeenCalledTimes(1)
  })

  it('オンライン POST でネットワークエラー + offlineActionType 未設定 → エラーをスロー', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))

    await expect(
      offlineFetch('/api/dispatches', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    ).rejects.toThrow('Network error and no offline handler configured')
  })

  // ── オフライン ──

  it('オフライン POST → キューイングして楽観的レスポンスを返す', async () => {
    setOnline(false)
    fetchSpy = vi.spyOn(globalThis, 'fetch')

    const res = await offlineFetch('/api/dispatches', {
      method: 'POST',
      body: JSON.stringify({ data: 'x' }),
      offlineActionType: 'dispatch_create',
    })

    expect(res.status).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockAddPendingAction).toHaveBeenCalledTimes(1)
  })

  it('オフライン POST + offlineActionType 未設定 → エラーをスロー', async () => {
    setOnline(false)

    await expect(
      offlineFetch('/api/dispatches', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    ).rejects.toThrow('Offline and no offline handler configured')
  })

  // ── エッジケース ──

  it('PATCH メソッドも POST 同様にキューイングされる', async () => {
    setOnline(false)

    const res = await offlineFetch('/api/dispatches/123', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' }),
      offlineActionType: 'dispatch_update',
    })

    expect(res.status).toBe(200)
    const action = mockAddPendingAction.mock.calls[0][0]
    expect(action.method).toBe('PATCH')
  })

  it('body が未指定の場合は空オブジェクトでキューイングする', async () => {
    setOnline(false)

    await offlineFetch('/api/dispatches', {
      method: 'POST',
      offlineActionType: 'dispatch_create',
    })

    const action = mockAddPendingAction.mock.calls[0][0]
    expect(action.data).toEqual({})
  })

  it('offlineGps/offlineDispatchId が未指定の場合は null でキューイングする', async () => {
    setOnline(false)

    await offlineFetch('/api/dispatches', {
      method: 'POST',
      body: JSON.stringify({}),
      offlineActionType: 'dispatch_create',
    })

    const action = mockAddPendingAction.mock.calls[0][0]
    expect(action.dispatchId).toBeNull()
    expect(action.gps).toBeNull()
  })
})
