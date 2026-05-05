import { put } from '@vercel/blob'

/**
 * 署名画像（PNG DataURL）を Vercel Blob にアップロードして HTTPS URL を返す純粋関数群。
 *
 * 設計書: docs/plans/p0-13-signature-blob-migration.md (4.4 / 3.1 節)
 *
 * フィールド `customerSignature` / `shopSignature` / `postApprovalSignature` の
 * 値は以下のいずれか：
 *   - null / undefined → そのまま
 *   - http(s):// で始まる文字列 → 既に Blob URL なのでそのまま
 *   - data:image/png;base64,... → Blob にアップロードして URL を返す
 *   - 上記以外 → SignatureValidationError を throw
 */

export type SignatureType = 'customer' | 'shop' | 'postApproval'

export interface ConvertSignatureParams {
  tenantId: string
  dispatchId: string
  type: SignatureType
}

/**
 * バリデーションエラー（呼び元で 400 を返す想定）。
 */
export class SignatureValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignatureValidationError'
  }
}

/**
 * DataURL の base64 部分の最大長（≒ 90KB のバイナリ）。
 * 設計書 4.5 / タスク指示で指定された 120000 文字。
 */
export const MAX_SIGNATURE_DATAURL_BASE64_LENGTH = 120_000

/** 期待する DataURL の prefix。 */
const DATAURL_PNG_PREFIX = 'data:image/png;base64,'

/**
 * PNG マジックバイト: 89 50 4E 47 0D 0A 1A 0A
 * （最初の 4 バイトのみで十分判定可能。app/api/dispatches/[id]/photos/route.ts:50-55 のロジックと整合）
 */
function isPngMagicBytes(bytes: Buffer | Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
}

/**
 * base64 文字列を Buffer にデコードする。
 * Node 18+ の Buffer.from('...', 'base64') を使用（Edge ランタイムでも利用可）。
 * `put()` の `PutBody` 型は Buffer を受け付ける一方、Uint8Array は受け付けないため Buffer のまま返す。
 */
function decodeBase64ToBytes(base64: string): Buffer {
  return Buffer.from(base64, 'base64')
}

/**
 * Blob ストア上のオブジェクトキー（パス）を生成する。
 * 設計書 3.1 採用案: `signatures/{tenantId}/{dispatchId}/{type}-{timestamp}.png`
 */
export function buildSignatureBlobPath(params: ConvertSignatureParams, now: number = Date.now()): string {
  const { tenantId, dispatchId, type } = params
  return `signatures/${tenantId}/${dispatchId}/${type}-${now}.png`
}

/**
 * 値が DataURL なら Blob にアップロードして HTTPS URL に変換する。
 *
 * - null / undefined / '' → そのまま返す（'' は「クリア」相当として保持）
 * - http(s):// で始まる文字列 → そのまま返す
 * - DataURL → Blob にアップロード、URL を返す
 * - それ以外 → SignatureValidationError を throw
 *
 * @returns 変換結果（null/undefined は維持、URL/'' はそのまま）
 */
export async function convertSignatureIfDataUrl(
  value: string | null | undefined,
  params: ConvertSignatureParams,
): Promise<string | null | undefined> {
  // null / undefined / 空文字 はそのまま
  if (value === null || value === undefined || value === '') {
    return value
  }

  // 既に URL（http or https） → そのまま
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value
  }

  // DataURL のみアップロード
  if (!value.startsWith(DATAURL_PNG_PREFIX)) {
    throw new SignatureValidationError(
      `Invalid signature value: must be a PNG DataURL or HTTPS URL (type=${params.type})`,
    )
  }

  const base64 = value.slice(DATAURL_PNG_PREFIX.length)

  // 長さ上限チェック（base64 文字数）
  if (base64.length === 0) {
    throw new SignatureValidationError(
      `Invalid signature value: base64 payload is empty (type=${params.type})`,
    )
  }
  if (base64.length > MAX_SIGNATURE_DATAURL_BASE64_LENGTH) {
    throw new SignatureValidationError(
      `Signature too large: ${base64.length} chars exceeds limit ${MAX_SIGNATURE_DATAURL_BASE64_LENGTH} (type=${params.type})`,
    )
  }

  // base64 を Buffer にデコード（@vercel/blob#put の PutBody 型に合致）
  let bytes: Buffer
  try {
    bytes = decodeBase64ToBytes(base64)
  } catch {
    throw new SignatureValidationError(
      `Invalid base64 payload (type=${params.type})`,
    )
  }

  // PNG マジックバイト検証
  if (!isPngMagicBytes(bytes)) {
    throw new SignatureValidationError(
      `Signature payload is not a valid PNG (magic bytes mismatch, type=${params.type})`,
    )
  }

  // Vercel Blob にアップロード
  const path = buildSignatureBlobPath(params)
  const blob = await put(path, bytes, {
    access: 'public',
    contentType: 'image/png',
  })

  return blob.url
}

/**
 * 3 署名フィールドを並列に変換する。
 * Confirmation API ルートから呼び出す想定。
 */
export interface ConfirmationSignatures {
  customerSignature?: string | null
  shopSignature?: string | null
  postApprovalSignature?: string | null
}

export async function convertConfirmationSignatures<
  T extends ConfirmationSignatures,
>(
  body: T,
  ctx: { tenantId: string; dispatchId: string },
): Promise<T> {
  const [customer, shop, post] = await Promise.all([
    'customerSignature' in body
      ? convertSignatureIfDataUrl(body.customerSignature, {
          tenantId: ctx.tenantId,
          dispatchId: ctx.dispatchId,
          type: 'customer',
        })
      : Promise.resolve(undefined),
    'shopSignature' in body
      ? convertSignatureIfDataUrl(body.shopSignature, {
          tenantId: ctx.tenantId,
          dispatchId: ctx.dispatchId,
          type: 'shop',
        })
      : Promise.resolve(undefined),
    'postApprovalSignature' in body
      ? convertSignatureIfDataUrl(body.postApprovalSignature, {
          tenantId: ctx.tenantId,
          dispatchId: ctx.dispatchId,
          type: 'postApproval',
        })
      : Promise.resolve(undefined),
  ])

  const next: T = { ...body }
  if ('customerSignature' in body) {
    next.customerSignature = customer as T['customerSignature']
  }
  if ('shopSignature' in body) {
    next.shopSignature = shop as T['shopSignature']
  }
  if ('postApprovalSignature' in body) {
    next.postApprovalSignature = post as T['postApprovalSignature']
  }
  return next
}
