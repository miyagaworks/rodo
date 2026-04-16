import { z } from 'zod/v4'

/** 許可するMIMEタイプ */
export const ALLOWED_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

/** 写真アップロード上限: 20MB */
export const MAX_PHOTO_SIZE = 20 * 1024 * 1024

/** 写真MIMEタイプのバリデーション */
export const photoMimeSchema = z.enum(ALLOWED_PHOTO_MIME_TYPES)
