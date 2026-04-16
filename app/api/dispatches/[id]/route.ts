import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  // 更新可能フィールドを明示的にフィルタリング
  const allowed: Record<string, unknown> = {}

  // 出動画面フィールド
  if (body.arrivalTime !== undefined) allowed.arrivalTime = body.arrivalTime ? new Date(body.arrivalTime) : null
  if (body.arrivalGpsLat !== undefined) allowed.arrivalGpsLat = body.arrivalGpsLat
  if (body.arrivalGpsLng !== undefined) allowed.arrivalGpsLng = body.arrivalGpsLng
  if (body.completionTime !== undefined) allowed.completionTime = body.completionTime ? new Date(body.completionTime) : null
  if (body.transportStartTime !== undefined) allowed.transportStartTime = body.transportStartTime ? new Date(body.transportStartTime) : null
  if (body.completionOdo !== undefined) allowed.completionOdo = body.completionOdo
  if (body.returnTime !== undefined) allowed.returnTime = body.returnTime ? new Date(body.returnTime) : null
  if (body.dispatchTime !== undefined) allowed.dispatchTime = body.dispatchTime ? new Date(body.dispatchTime) : null
  if (body.status !== undefined) allowed.status = body.status

  // 出動記録フィールド
  if (body.address !== undefined) allowed.address = body.address
  if (body.highwayName !== undefined) allowed.highwayName = body.highwayName
  if (body.highwayDirection !== undefined) allowed.highwayDirection = body.highwayDirection
  if (body.kiloPost !== undefined) allowed.kiloPost = body.kiloPost
  if (body.customerName !== undefined) allowed.customerName = body.customerName
  if (body.vehicleName !== undefined) allowed.vehicleName = body.vehicleName
  if (body.plateRegion !== undefined) allowed.plateRegion = body.plateRegion
  if (body.plateClass !== undefined) allowed.plateClass = body.plateClass
  if (body.plateKana !== undefined) allowed.plateKana = body.plateKana
  if (body.plateNumber !== undefined) allowed.plateNumber = body.plateNumber
  if (body.situationType !== undefined) allowed.situationType = body.situationType
  if (body.situationDetail !== undefined) allowed.situationDetail = body.situationDetail
  if (body.canDrive !== undefined) allowed.canDrive = body.canDrive
  if (body.deliveryType !== undefined) allowed.deliveryType = body.deliveryType
  if (body.memo !== undefined) allowed.memo = body.memo
  if (body.isHighway !== undefined) allowed.isHighway = body.isHighway
  if (body.weather !== undefined) allowed.weather = body.weather
  if (body.trafficControl !== undefined) allowed.trafficControl = body.trafficControl
  if (body.parkingLocation !== undefined) allowed.parkingLocation = body.parkingLocation
  if (body.areaIcName !== undefined) allowed.areaIcName = body.areaIcName
  if (body.insuranceCompanyId !== undefined) allowed.insuranceCompanyId = body.insuranceCompanyId
  if (body.isDraft !== undefined) allowed.isDraft = body.isDraft
  if (body.vehicleNumber !== undefined) allowed.vehicleNumber = body.vehicleNumber

  try {
    const dispatch = await prisma.dispatch.update({
      where: {
        id,
        tenantId: session.user.tenantId,
      },
      data: allowed,
    })
    return NextResponse.json(dispatch)
  } catch (err) {
    console.error('PATCH /api/dispatches/[id] error:', err)
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
