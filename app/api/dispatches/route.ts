import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const where: Record<string, unknown> = {
    tenantId: session.user.tenantId,
  }

  if (status === 'draft') {
    where.isDraft = true
  } else if (status === 'stored') {
    where.status = 'STORED'
  } else if (status === 'completed') {
    where.status = { in: ['COMPLETED', 'RETURNED'] }
    where.report = { isDraft: false }
  } else if (status === 'transfer') {
    // 振替はPhase 5ではまだ未実装
    where.status = 'TRANSFER'
  }

  try {
    const dispatches = await prisma.dispatch.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: where as any,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        dispatchNumber: true,
        isDraft: true,
        status: true,
        type: true,
        updatedAt: true,
        plateRegion: true,
        plateClass: true,
        plateKana: true,
        plateNumber: true,
      },
    })
    return NextResponse.json(dispatches)
  } catch (e) {
    console.error('[GET /api/dispatches]', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { assistanceId, type, departureOdo, dispatchTime, dispatchGpsLat, dispatchGpsLng, parentDispatchId, isSecondaryTransport } = body

  if (!assistanceId || !type) {
    return NextResponse.json({ error: 'assistanceId and type are required' }, { status: 400 })
  }

  // ログインユーザーの車両番号を取得
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.userId },
    select: { vehicleNumber: true },
  })

  // 出動番号採番: YYYYMMDD + 3桁連番（テナントごと・同日内でリセット）
  const dispatch = await prisma.$transaction(async (tx) => {
    const now = new Date(dispatchTime ?? new Date())
    // JSTでの日付文字列を生成
    const jstOffset = 9 * 60 * 60 * 1000
    const jstDate = new Date(now.getTime() + jstOffset)
    const dateStr = jstDate.toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD

    const count = await tx.dispatch.count({
      where: {
        tenantId: session.user.tenantId,
        dispatchNumber: { startsWith: dateStr },
      },
    })

    const sequence = String(count + 1).padStart(3, '0')
    const newDispatchNumber = `${dateStr}${sequence}`

    // 2次搬送の場合、親の案件情報を引き継ぐ
    let inheritedFields: Record<string, unknown> = {}
    if (isSecondaryTransport && parentDispatchId) {
      const parent = await tx.dispatch.findUnique({
        where: { id: parentDispatchId },
      })
      if (parent) {
        // 2次搬送の出動番号: 親の番号 + サフィックス (-2, -3, ...)
        const siblingCount = await tx.dispatch.count({
          where: {
            parentDispatchId: parentDispatchId,
          },
        })
        const suffix = siblingCount + 2 // 最初の2次搬送は -2

        inheritedFields = {
          dispatchNumber: `${parent.dispatchNumber}-${suffix}`,
          // 顧客・車両情報
          customerName: parent.customerName,
          vehicleName: parent.vehicleName,
          plateRegion: parent.plateRegion,
          plateClass: parent.plateClass,
          plateKana: parent.plateKana,
          plateNumber: parent.plateNumber,
          // 状況
          situationType: parent.situationType,
          situationDetail: parent.situationDetail,
          canDrive: parent.canDrive,
          // 現場情報
          address: parent.address,
          isHighway: parent.isHighway,
          highwayName: parent.highwayName,
          highwayDirection: parent.highwayDirection,
          kiloPost: parent.kiloPost,
          areaIcName: parent.areaIcName,
          // 保険会社
          insuranceCompanyId: parent.insuranceCompanyId,
          // メモ
          memo: parent.memo,
        }
      }
    }

    return tx.dispatch.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.userId,
        assistanceId,
        type: type === 'onsite' ? 'ONSITE' : 'TRANSPORT',
        status: 'DISPATCHED',
        dispatchNumber: newDispatchNumber,
        vehicleNumber: currentUser?.vehicleNumber ?? null,
        departureOdo: departureOdo != null ? parseInt(String(departureOdo)) : null,
        dispatchTime: now,
        dispatchGpsLat: dispatchGpsLat ?? null,
        dispatchGpsLng: dispatchGpsLng ?? null,
        parentDispatchId: parentDispatchId ?? null,
        isSecondaryTransport: isSecondaryTransport ?? false,
        // 親の案件情報を上書き（dispatchNumber はサフィックス付き）
        ...inheritedFields,
      },
    })
  })

  return NextResponse.json(dispatch, { status: 201 })
}
