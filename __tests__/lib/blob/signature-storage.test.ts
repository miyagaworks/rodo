import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * lib/blob/signature-storage.ts の単体テスト。
 *
 * 設計書 8.1 / 8.2 節に従い、@vercel/blob を必ずモックする。
 * 本物のネットワーク呼出しは絶対に発生させない。
 */

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
}))

import { put } from '@vercel/blob'
import {
  convertSignatureIfDataUrl,
  convertConfirmationSignatures,
  buildSignatureBlobPath,
  SignatureValidationError,
  MAX_SIGNATURE_DATAURL_BASE64_LENGTH,
} from '@/lib/blob/signature-storage'

const mockedPut = put as unknown as ReturnType<typeof vi.fn>

/**
 * 最小有効 PNG (透明 1×1 px、67 bytes) を base64 化したもの。
 * https://www.w3.org/TR/PNG/ 準拠の有効な PNG。
 */
const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII='
const VALID_DATAURL = `data:image/png;base64,${MINIMAL_PNG_BASE64}`

describe('lib/blob/signature-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedPut.mockResolvedValue({
      url: 'https://example.public.blob.vercel-storage.com/signatures/t1/d1/customer-1.png',
    })
  })

  describe('buildSignatureBlobPath', () => {
    it('signatures/{tenantId}/{dispatchId}/{type}-{timestamp}.png 形式で生成する', () => {
      const path = buildSignatureBlobPath(
        { tenantId: 't1', dispatchId: 'd1', type: 'customer' },
        1730358000000,
      )
      expect(path).toBe('signatures/t1/d1/customer-1730358000000.png')
    })

    it('type=shop / postApproval も同様にパスを生成する', () => {
      expect(
        buildSignatureBlobPath(
          { tenantId: 't1', dispatchId: 'd1', type: 'shop' },
          1,
        ),
      ).toBe('signatures/t1/d1/shop-1.png')
      expect(
        buildSignatureBlobPath(
          { tenantId: 't1', dispatchId: 'd1', type: 'postApproval' },
          1,
        ),
      ).toBe('signatures/t1/d1/postApproval-1.png')
    })
  })

  describe('convertSignatureIfDataUrl - 入力分岐', () => {
    const ctx = { tenantId: 't1', dispatchId: 'd1', type: 'customer' as const }

    it('null はそのまま null を返す（put は呼ばない）', async () => {
      const result = await convertSignatureIfDataUrl(null, ctx)
      expect(result).toBeNull()
      expect(mockedPut).not.toHaveBeenCalled()
    })

    it('undefined はそのまま undefined を返す（put は呼ばない）', async () => {
      const result = await convertSignatureIfDataUrl(undefined, ctx)
      expect(result).toBeUndefined()
      expect(mockedPut).not.toHaveBeenCalled()
    })

    it('空文字はそのまま空文字を返す（put は呼ばない）', async () => {
      const result = await convertSignatureIfDataUrl('', ctx)
      expect(result).toBe('')
      expect(mockedPut).not.toHaveBeenCalled()
    })

    it('https URL はそのまま返す（put は呼ばない）', async () => {
      const url =
        'https://example.public.blob.vercel-storage.com/signatures/t1/d1/customer-100.png'
      const result = await convertSignatureIfDataUrl(url, ctx)
      expect(result).toBe(url)
      expect(mockedPut).not.toHaveBeenCalled()
    })

    it('http URL もそのまま返す（put は呼ばない）', async () => {
      const url = 'http://example.com/sig.png'
      const result = await convertSignatureIfDataUrl(url, ctx)
      expect(result).toBe(url)
      expect(mockedPut).not.toHaveBeenCalled()
    })

    it('正常な PNG DataURL は put を呼んで URL を返す', async () => {
      const result = await convertSignatureIfDataUrl(VALID_DATAURL, ctx)

      expect(mockedPut).toHaveBeenCalledTimes(1)
      const [path, payload, options] = mockedPut.mock.calls[0]
      expect(path).toMatch(/^signatures\/t1\/d1\/customer-\d+\.png$/)
      // @vercel/blob#put の PutBody 型に合致する Buffer を渡す（Buffer は Uint8Array のサブクラス）
      expect(Buffer.isBuffer(payload)).toBe(true)
      // PNG の最初の 4 バイトが正しいことも検証
      expect((payload as Buffer)[0]).toBe(0x89)
      expect((payload as Buffer)[1]).toBe(0x50)
      expect(options).toEqual({ access: 'public', contentType: 'image/png' })

      expect(result).toBe(
        'https://example.public.blob.vercel-storage.com/signatures/t1/d1/customer-1.png',
      )
    })
  })

  describe('convertSignatureIfDataUrl - バリデーションエラー', () => {
    const ctx = { tenantId: 't1', dispatchId: 'd1', type: 'customer' as const }

    it('未知のスキームは SignatureValidationError を throw する', async () => {
      await expect(
        convertSignatureIfDataUrl('foo:bar', ctx),
      ).rejects.toBeInstanceOf(SignatureValidationError)
      expect(mockedPut).not.toHaveBeenCalled()
    })

    it('image/jpeg DataURL は throw する（PNG 限定）', async () => {
      await expect(
        convertSignatureIfDataUrl('data:image/jpeg;base64,xxxxx', ctx),
      ).rejects.toBeInstanceOf(SignatureValidationError)
      expect(mockedPut).not.toHaveBeenCalled()
    })

    it('base64 が空のとき throw する', async () => {
      await expect(
        convertSignatureIfDataUrl('data:image/png;base64,', ctx),
      ).rejects.toBeInstanceOf(SignatureValidationError)
      expect(mockedPut).not.toHaveBeenCalled()
    })

    it('base64 が上限を超えるとき throw する', async () => {
      const tooLong = 'A'.repeat(MAX_SIGNATURE_DATAURL_BASE64_LENGTH + 1)
      await expect(
        convertSignatureIfDataUrl(`data:image/png;base64,${tooLong}`, ctx),
      ).rejects.toBeInstanceOf(SignatureValidationError)
      expect(mockedPut).not.toHaveBeenCalled()
    })

    it('PNG マジックバイトに合致しないペイロードは throw する', async () => {
      // "AAAA" の base64 デコードは 0x00 0x00 0x00 で PNG マジックバイトに合致しない
      await expect(
        convertSignatureIfDataUrl('data:image/png;base64,AAAAAAAA', ctx),
      ).rejects.toBeInstanceOf(SignatureValidationError)
      expect(mockedPut).not.toHaveBeenCalled()
    })
  })

  describe('convertConfirmationSignatures - 3 署名の並列処理', () => {
    const ctx = { tenantId: 't1', dispatchId: 'd1' }

    it('3 署名すべて DataURL なら put が 3 回呼ばれ、URL に置換される', async () => {
      mockedPut
        .mockResolvedValueOnce({
          url: 'https://example.public.blob.vercel-storage.com/signatures/t1/d1/customer-1.png',
        })
        .mockResolvedValueOnce({
          url: 'https://example.public.blob.vercel-storage.com/signatures/t1/d1/shop-1.png',
        })
        .mockResolvedValueOnce({
          url: 'https://example.public.blob.vercel-storage.com/signatures/t1/d1/postApproval-1.png',
        })

      const body = {
        customerSignature: VALID_DATAURL,
        shopSignature: VALID_DATAURL,
        postApprovalSignature: VALID_DATAURL,
      }

      const result = await convertConfirmationSignatures(body, ctx)

      expect(mockedPut).toHaveBeenCalledTimes(3)
      expect(result.customerSignature).toMatch(/customer-1\.png$/)
      expect(result.shopSignature).toMatch(/shop-1\.png$/)
      expect(result.postApprovalSignature).toMatch(/postApproval-1\.png$/)
    })

    it('URL が混在する場合は DataURL のみアップロードされる', async () => {
      const existingUrl =
        'https://example.public.blob.vercel-storage.com/signatures/t1/d1/customer-old.png'

      const body = {
        customerSignature: existingUrl,
        shopSignature: null,
        postApprovalSignature: VALID_DATAURL,
      }

      mockedPut.mockResolvedValueOnce({
        url: 'https://example.public.blob.vercel-storage.com/signatures/t1/d1/postApproval-1.png',
      })

      const result = await convertConfirmationSignatures(body, ctx)

      expect(mockedPut).toHaveBeenCalledTimes(1)
      expect(result.customerSignature).toBe(existingUrl)
      expect(result.shopSignature).toBeNull()
      expect(result.postApprovalSignature).toMatch(/postApproval-1\.png$/)
    })

    it('フィールドが body に含まれない場合は put を呼ばず、結果にも含めない', async () => {
      const body = {
        customerSignature: null,
      }

      const result = await convertConfirmationSignatures(body, ctx)

      expect(mockedPut).not.toHaveBeenCalled()
      expect(result.customerSignature).toBeNull()
      expect('shopSignature' in result).toBe(false)
      expect('postApprovalSignature' in result).toBe(false)
    })
  })
})
