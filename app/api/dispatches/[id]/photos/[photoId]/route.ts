import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, photoId } = await params

  // dispatch が同テナントに属するか確認
  const dispatch = await prisma.dispatch.findFirst({
    where: { id, tenantId: session.user.tenantId },
  })
  if (!dispatch) {
    return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
  }

  // 写真レコードを取得
  const photo = await prisma.dispatchPhoto.findFirst({
    where: { id: photoId, dispatchId: id },
  })
  if (!photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }

  try {
    // Vercel Blob から削除
    await del(photo.photoUrl)
  } catch (err) {
    // Blob 削除失敗はログのみ（DB レコードは削除する）
    console.error('Failed to delete blob:', err)
  }

  // DB レコード削除
  await prisma.dispatchPhoto.delete({
    where: { id: photoId },
  })

  return NextResponse.json({ success: true })
}
