import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { ALLOWED_PHOTO_MIME_TYPES, MAX_PHOTO_SIZE } from '@/lib/validations'

// --- マジックバイトによる画像実体検証 (#4) ---

/** 各画像フォーマットのマジックバイト定義 */
const MAGIC_SIGNATURES: { mime: string; check: (bytes: Uint8Array) => boolean }[] = [
  {
    // JPEG: FF D8 FF
    mime: 'image/jpeg',
    check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    mime: 'image/png',
    check: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    // WebP: RIFF....WEBP
    mime: 'image/webp',
    check: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    // HEIC/HEIF: offset 4 に 'ftyp' + ブランド文字列に 'heic','heix','hevc','hevx','mif1' 等を含む
    mime: 'image/heic',
    check: (b) => {
      if (b[4] !== 0x66 || b[5] !== 0x74 || b[6] !== 0x79 || b[7] !== 0x70) return false
      const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
      return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)
    },
  },
]

/**
 * ファイルのマジックバイトを検証し、実際の画像形式かどうかを判定する。
 * HEIF は HEIC と同じ ftyp ボックス構造のため heic チェックでカバー。
 */
async function validateImageMagicBytes(file: File): Promise<boolean> {
  const buffer = await file.slice(0, 16).arrayBuffer()
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 12) return false
  return MAGIC_SIGNATURES.some((sig) => sig.check(bytes))
}

/** ファイル名サニタイズ: パストラバーサル防止 + 安全な文字のみ許可 (#5) */
function sanitizeFileName(name: string): string {
  // パスセパレータを除去し、安全な文字のみ残す
  const basename = name.split(/[/\\]/).pop() || 'upload'
  return basename.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // dispatch が存在し、同テナントに属するか確認
  const dispatch = await prisma.dispatch.findFirst({
    where: { id, tenantId: session.user.tenantId },
  })
  if (!dispatch) {
    return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
  }
  if (dispatch.status === 'TRANSFERRED') {
    return NextResponse.json({ error: 'Cannot upload photos for transferred dispatch' }, { status: 403 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Content-Type による事前チェック
    const allowedTypes: readonly string[] = ALLOWED_PHOTO_MIME_TYPES
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Allowed: ${allowedTypes.join(', ')}` },
        { status: 400 },
      )
    }

    // #4 修正: マジックバイトによる実体検証
    const isValidImage = await validateImageMagicBytes(file)
    if (!isValidImage) {
      return NextResponse.json(
        { error: 'File content does not match a valid image format' },
        { status: 400 },
      )
    }

    // ファイルサイズ制限
    if (file.size > MAX_PHOTO_SIZE) {
      return NextResponse.json(
        { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 20MB` },
        { status: 400 },
      )
    }

    // 現在の最大 sortOrder を取得
    const maxSort = await prisma.dispatchPhoto.aggregate({
      where: { dispatchId: id },
      _max: { sortOrder: true },
    })
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1

    // #5 修正: ファイル名サニタイズ
    const safeName = sanitizeFileName(file.name)
    const blob = await put(`dispatches/${id}/${Date.now()}-${safeName}`, file, {
      access: 'public',
    })

    // DB レコード作成
    const photo = await prisma.dispatchPhoto.create({
      data: {
        dispatchId: id,
        photoUrl: blob.url,
        sortOrder,
      },
    })

    return NextResponse.json({
      id: photo.id,
      url: photo.photoUrl,
      sortOrder: photo.sortOrder,
    })
  } catch (err) {
    console.error('POST /api/dispatches/[id]/photos error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // dispatch が存在し、同テナントに属するか確認
  const dispatch = await prisma.dispatch.findFirst({
    where: { id, tenantId: session.user.tenantId },
  })
  if (!dispatch) {
    return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
  }

  const photos = await prisma.dispatchPhoto.findMany({
    where: { dispatchId: id },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      photoUrl: true,
      sortOrder: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    photos: photos.map((p) => ({
      id: p.id,
      url: p.photoUrl,
      sortOrder: p.sortOrder,
      createdAt: p.createdAt,
    })),
  })
}
