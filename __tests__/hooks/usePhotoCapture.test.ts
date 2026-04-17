import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// image-compress モック
const mockCompressImage = vi.fn()
vi.mock('@/lib/image-compress', () => ({
  compressImage: (...args: unknown[]) => mockCompressImage(...args),
}))

// offline-db モック
const mockSavePhoto = vi.fn()
const mockGetPhotosByDispatch = vi.fn()
const mockDeletePhoto = vi.fn()

vi.mock('@/lib/offline-db', () => ({
  savePhoto: (...args: unknown[]) => mockSavePhoto(...args),
  getPhotosByDispatch: (...args: unknown[]) => mockGetPhotosByDispatch(...args),
  deletePhoto: (...args: unknown[]) => mockDeletePhoto(...args),
}))

import { usePhotoCapture } from '@/hooks/usePhotoCapture'

describe('usePhotoCapture', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const mockCreateObjectURL = vi.fn()
  const mockRevokeObjectURL = vi.fn()

  function setOnline(online: boolean) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...navigator, onLine: online },
      writable: true,
      configurable: true,
    })
  }

  beforeEach(() => {
    mockCompressImage.mockReset()
    mockSavePhoto.mockReset()
    mockGetPhotosByDispatch.mockReset()
    mockDeletePhoto.mockReset()
    mockCreateObjectURL.mockReset()
    mockRevokeObjectURL.mockReset()

    mockGetPhotosByDispatch.mockResolvedValue([])
    mockSavePhoto.mockResolvedValue('offline-photo-1')
    mockDeletePhoto.mockResolvedValue(undefined)
    mockCompressImage.mockResolvedValue(new Blob(['compressed'], { type: 'image/jpeg' }))
    mockCreateObjectURL.mockReturnValue('blob:test-url')

    globalThis.URL.createObjectURL = mockCreateObjectURL
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL
  })

  afterEach(() => {
    fetchSpy?.mockRestore()
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator)
    }
  })

  // ── 初期ロード ──

  it('dispatchId が null のとき写真をロードしない', async () => {
    const { result } = renderHook(() => usePhotoCapture(null))

    await act(async () => {})

    expect(result.current.photos).toEqual([])
    expect(result.current.photoCount).toBe(0)
  })

  it('サーバー写真 + IndexedDB 写真を統合してロードする', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        photos: [{ id: 'server-1', url: '/uploads/1.jpg' }],
      }), { status: 200 }),
    )
    mockGetPhotosByDispatch.mockResolvedValue([{
      id: 'local-1',
      dispatchId: 'd1',
      blob: new Blob(['data']),
      createdAt: 1000,
    }])

    const { result } = renderHook(() => usePhotoCapture('d1'))

    await act(async () => {})

    expect(result.current.photos).toHaveLength(2)
    expect(result.current.photos[0]).toEqual({
      id: 'server-1',
      url: '/uploads/1.jpg',
      isLocal: false,
    })
    expect(result.current.photos[1]).toEqual({
      id: 'local-1',
      url: 'blob:test-url',
      isLocal: true,
    })
  })

  it('サーバー fetch 失敗時は IndexedDB の写真だけロードする', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    mockGetPhotosByDispatch.mockResolvedValue([{
      id: 'local-1',
      dispatchId: 'd1',
      blob: new Blob(['data']),
      createdAt: 1000,
    }])

    const { result } = renderHook(() => usePhotoCapture('d1'))

    await act(async () => {})

    expect(result.current.photos).toHaveLength(1)
    expect(result.current.photos[0].isLocal).toBe(true)
  })

  // ── handleFileChange オンライン成功 ──

  it('オンラインでアップロード成功時はサーバーの写真として保存する', async () => {
    setOnline(true)
    // 初期ロード用
    fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ photos: [] }), { status: 200 }))
      // アップロード用
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'uploaded-1', url: '/uploads/uploaded.jpg' }), { status: 200 }))

    const { result } = renderHook(() => usePhotoCapture('d1'))
    await act(async () => {})

    const file = new File(['image'], 'photo.jpg', { type: 'image/jpeg' })
    const event = {
      target: { files: [file], value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>

    await act(async () => {
      await result.current.handleFileChange(event)
    })

    expect(mockCompressImage).toHaveBeenCalledWith(file)
    // アップロード成功後、tempUrl が revoke されている
    expect(mockRevokeObjectURL).toHaveBeenCalled()
    // 最終的にサーバーの写真として保存
    const uploadedPhoto = result.current.photos.find(p => p.id === 'uploaded-1')
    expect(uploadedPhoto).toBeDefined()
    expect(uploadedPhoto?.isLocal).toBe(false)
  })

  // ── handleFileChange オンラインでアップロード失敗 ──

  it('オンラインでアップロード失敗時は IndexedDB にフォールバック保存する', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ photos: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('Error', { status: 500 }))

    const { result } = renderHook(() => usePhotoCapture('d1'))
    await act(async () => {})

    const file = new File(['image'], 'photo.jpg', { type: 'image/jpeg' })
    const event = {
      target: { files: [file], value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>

    await act(async () => {
      await result.current.handleFileChange(event)
    })

    expect(mockSavePhoto).toHaveBeenCalledWith('d1', expect.any(Blob))
    const localPhoto = result.current.photos.find(p => p.isLocal)
    expect(localPhoto).toBeDefined()
  })

  // ── handleFileChange オフライン ──

  it('オフライン時は IndexedDB に直接保存する', async () => {
    setOnline(false)
    fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('offline')) // 初期ロード
    mockGetPhotosByDispatch.mockResolvedValue([])

    const { result } = renderHook(() => usePhotoCapture('d1'))
    await act(async () => {})

    setOnline(false) // handleFileChange 時もオフライン

    const file = new File(['image'], 'photo.jpg', { type: 'image/jpeg' })
    const event = {
      target: { files: [file], value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>

    await act(async () => {
      await result.current.handleFileChange(event)
    })

    expect(mockSavePhoto).toHaveBeenCalledWith('d1', expect.any(Blob))
    expect(result.current.photos).toHaveLength(1)
    expect(result.current.photos[0].isLocal).toBe(true)
  })

  // ── handleFileChange エッジケース ──

  it('ファイルが選択されていない場合は何もしない', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ photos: [] }), { status: 200 }),
    )

    const { result } = renderHook(() => usePhotoCapture('d1'))
    await act(async () => {})

    const event = {
      target: { files: [], value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>

    await act(async () => {
      await result.current.handleFileChange(event)
    })

    expect(mockCompressImage).not.toHaveBeenCalled()
  })

  it('dispatchId が null のとき handleFileChange は何もしない', async () => {
    const { result } = renderHook(() => usePhotoCapture(null))
    await act(async () => {})

    const file = new File(['image'], 'photo.jpg', { type: 'image/jpeg' })
    const event = {
      target: { files: [file], value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>

    await act(async () => {
      await result.current.handleFileChange(event)
    })

    expect(mockCompressImage).not.toHaveBeenCalled()
  })

  // ── removePhoto ──

  it('ローカル写真削除時は IndexedDB から削除する', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ photos: [] }), { status: 200 }),
    )
    mockGetPhotosByDispatch.mockResolvedValue([{
      id: 'local-1',
      dispatchId: 'd1',
      blob: new Blob(['data']),
      createdAt: 1000,
    }])

    const { result } = renderHook(() => usePhotoCapture('d1'))
    await act(async () => {})

    expect(result.current.photos).toHaveLength(1)

    await act(async () => {
      await result.current.removePhoto('local-1', true)
    })

    expect(mockDeletePhoto).toHaveBeenCalledWith('local-1')
    expect(result.current.photos).toHaveLength(0)
  })

  it('サーバー写真削除時は DELETE API を呼ぶ', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        photos: [{ id: 'server-1', url: '/uploads/1.jpg' }],
      }), { status: 200 }))
    mockGetPhotosByDispatch.mockResolvedValue([])

    const { result } = renderHook(() => usePhotoCapture('d1'))
    await act(async () => {})

    fetchSpy.mockResolvedValueOnce(new Response('ok', { status: 200 }))

    await act(async () => {
      await result.current.removePhoto('server-1', false)
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/dispatches/d1/photos/server-1',
      { method: 'DELETE' },
    )
    expect(result.current.photos).toHaveLength(0)
  })

  it('サーバー写真削除でネットワークエラー時は写真を残す', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        photos: [{ id: 'server-1', url: '/uploads/1.jpg' }],
      }), { status: 200 }))
    mockGetPhotosByDispatch.mockResolvedValue([])

    const { result } = renderHook(() => usePhotoCapture('d1'))
    await act(async () => {})

    fetchSpy.mockRejectedValueOnce(new Error('network'))

    await act(async () => {
      await result.current.removePhoto('server-1', false)
    })

    // ネットワークエラー時は早期リターンで写真が残る
    expect(result.current.photos).toHaveLength(1)
  })

  // ── openCamera ──

  it('openCamera は fileInputRef.current.click() を呼ぶ', async () => {
    const { result } = renderHook(() => usePhotoCapture('d1'))

    // fileInputRef にモックを設定
    const mockClick = vi.fn()
    Object.defineProperty(result.current.fileInputRef, 'current', {
      value: { click: mockClick },
      writable: true,
    })

    act(() => {
      result.current.openCamera()
    })

    expect(mockClick).toHaveBeenCalled()
  })
})
