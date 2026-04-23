import { describe, it, expect, vi } from 'vitest'

// browser-image-compression をモック
const mockImageCompression = vi.fn()
vi.mock('browser-image-compression', () => ({
  default: (...args: unknown[]) => mockImageCompression(...args),
}))

import { compressImage } from '@/lib/image-compress'

describe('compressImage', () => {
  beforeEach(() => {
    mockImageCompression.mockReset()
  })

  // ── 正常系 ──

  it('正しいオプションで browser-image-compression を呼び出す', async () => {
    const inputFile = new File(['dummy'], 'photo.png', { type: 'image/png' })
    const outputBlob = new Blob(['compressed'], { type: 'image/jpeg' })
    mockImageCompression.mockResolvedValue(outputBlob)

    await compressImage(inputFile)

    expect(mockImageCompression).toHaveBeenCalledTimes(1)
    const [file, options] = mockImageCompression.mock.calls[0]
    expect(file).toBe(inputFile)
    expect(options).toEqual({
      maxWidthOrHeight: 1200,
      initialQuality: 0.8,
      useWebWorker: false,
      fileType: 'image/jpeg',
      preserveExif: false,
    })
  })

  it('圧縮結果を File にラップして返す（MIME は image/jpeg、ファイル名は photo.jpg）', async () => {
    const inputFile = new File(['dummy'], 'photo.png', { type: 'image/png' })
    const outputBlob = new Blob(['compressed'], { type: 'image/jpeg' })
    mockImageCompression.mockResolvedValue(outputBlob)

    const result = await compressImage(inputFile)
    expect(result).toBeInstanceOf(File)
    expect(result.type).toBe('image/jpeg')
    expect(result.name).toBe('photo.jpg')
  })

  // ── 異常系 ──

  it('圧縮に失敗した場合エラーをスローする', async () => {
    const inputFile = new File(['dummy'], 'photo.png', { type: 'image/png' })
    mockImageCompression.mockRejectedValue(new Error('Compression failed'))

    await expect(compressImage(inputFile)).rejects.toThrow('Compression failed')
  })

  // ── エッジケース ──

  it('0バイトのファイルでも呼び出しが成功する', async () => {
    const emptyFile = new File([], 'empty.png', { type: 'image/png' })
    const outputBlob = new Blob([], { type: 'image/jpeg' })
    mockImageCompression.mockResolvedValue(outputBlob)

    const result = await compressImage(emptyFile)
    expect(result).toBeInstanceOf(File)
    expect(result.type).toBe('image/jpeg')
    expect(mockImageCompression).toHaveBeenCalledWith(emptyFile, expect.any(Object))
  })
})
