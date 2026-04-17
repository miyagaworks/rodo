import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const dispatch = await prisma.dispatch.findUnique({
    where: { id, tenantId: session.user.tenantId },
  })
  if (!dispatch) {
    return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
  }

  // 自分自身の振替は引き受けられない
  if (dispatch.userId === session.user.userId) {
    return NextResponse.json(
      { error: 'Cannot accept your own transfer request' },
      { status: 400 },
    )
  }

  // PENDING でなければ受付不可
  if (dispatch.transferStatus !== 'PENDING') {
    return NextResponse.json(
      { error: 'Transfer is not in PENDING status' },
      { status: 409 },
    )
  }

  try {
    // 引き受けた隊員の車両番号を取得
    const acceptUser = await prisma.user.findUnique({
      where: { id: session.user.userId },
      select: { vehicleNumber: true },
    })

    const result = await prisma.$transaction(async (tx) => {
      // 楽観的ロック: transferStatus が PENDING のまま残っている場合のみ更新
      const updated = await tx.dispatch.updateMany({
        where: {
          id,
          tenantId: session.user.tenantId,
          transferStatus: 'PENDING',
        },
        data: {
          status: 'TRANSFERRED',
          transferStatus: 'ACCEPTED',
        },
      })

      if (updated.count === 0) {
        throw new Error('OPTIMISTIC_LOCK_FAILED')
      }

      // 新 Dispatch を作成（振替先）
      const newDispatch = await tx.dispatch.create({
        data: {
          tenantId: session.user.tenantId,
          userId: session.user.userId,
          assistanceId: dispatch.assistanceId,
          dispatchNumber: `${dispatch.dispatchNumber}-T`,
          type: dispatch.type,
          status: 'ONSITE',
          vehicleNumber: acceptUser?.vehicleNumber ?? null,
          transferredFromId: dispatch.id,
          // 時刻・GPS
          dispatchTime: dispatch.dispatchTime,
          arrivalTime: dispatch.arrivalTime,
          completionTime: dispatch.completionTime,
          returnTime: dispatch.returnTime,
          transportStartTime: dispatch.transportStartTime,
          dispatchGpsLat: dispatch.dispatchGpsLat,
          dispatchGpsLng: dispatch.dispatchGpsLng,
          arrivalGpsLat: dispatch.arrivalGpsLat,
          arrivalGpsLng: dispatch.arrivalGpsLng,
          // ODO
          departureOdo: dispatch.departureOdo,
          completionOdo: dispatch.completionOdo,
          // 案件情報
          customerName: dispatch.customerName,
          vehicleName: dispatch.vehicleName,
          plateRegion: dispatch.plateRegion,
          plateClass: dispatch.plateClass,
          plateKana: dispatch.plateKana,
          plateNumber: dispatch.plateNumber,
          situationType: dispatch.situationType,
          situationDetail: dispatch.situationDetail,
          canDrive: dispatch.canDrive,
          deliveryType: dispatch.deliveryType,
          address: dispatch.address,
          isHighway: dispatch.isHighway,
          highwayName: dispatch.highwayName,
          highwayDirection: dispatch.highwayDirection,
          kiloPost: dispatch.kiloPost,
          areaIcName: dispatch.areaIcName,
          weather: dispatch.weather,
          trafficControl: dispatch.trafficControl,
          parkingLocation: dispatch.parkingLocation,
          insuranceCompanyId: dispatch.insuranceCompanyId,
          memo: dispatch.memo,
          // 作業時間
          workStartTime: dispatch.workStartTime,
          workEndTime: dispatch.workEndTime,
          workDuration: dispatch.workDuration,
          // type変更履歴
          originalType: dispatch.originalType,
          typeChangedAt: dispatch.typeChangedAt,
        },
      })

      // 元 Dispatch に振替先 ID を記録
      const originalDispatch = await tx.dispatch.update({
        where: { id },
        data: { transferredToId: newDispatch.id },
      })

      return { newDispatch, originalDispatch }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'OPTIMISTIC_LOCK_FAILED') {
      return NextResponse.json(
        { error: 'Transfer is no longer available' },
        { status: 409 },
      )
    }
    console.error('POST /api/dispatches/[id]/transfer/accept error:', err)
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Transfer is no longer available' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
