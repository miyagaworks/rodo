import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

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

  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // 現在の最大 sortOrder を取得
    const maxSort = await prisma.dispatchPhoto.aggregate({
      where: { dispatchId: id },
      _max: { sortOrder: true },
    })
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1

    // Vercel Blob にアップロード
    const blob = await put(`dispatches/${id}/${Date.now()}-${file.name}`, file, {
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
