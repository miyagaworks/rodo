import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { adminUpdateDispatchSchema } from '@/lib/validations'

/**
 * PATCH /api/admin/dispatches/[id]
 *
 * ADMIN 専用 案件編集エンドポイント。
 * 認可: ADMIN ロールのみ。
 *
 * 既存 `/api/dispatches/[id]` は隊員フローのステータス遷移ガード付きだが、
 * 本エンドポイントは「業務上明らかな誤りの訂正」を主目的とするため、
 * Dispatch モデルのほぼ全項目を一括で上書き可能とする（遷移ガードなし）。
 *
 * テナント境界: where に tenantId を必ず含める。
 */

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const raw = await req.json()
  const parsed = adminUpdateDispatchSchema
    .refine((obj) => Object.keys(obj).length > 0, 'Empty body')
    .safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const body = parsed.data

  // 関連 ID のテナント検証（指定された場合のみ）
  if (body.userId) {
    const u = await prisma.user.findFirst({
      where: { id: body.userId, tenantId: session.user.tenantId },
      select: { id: true },
    })
    if (!u) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
  }
  if (body.assistanceId) {
    const a = await prisma.assistance.findFirst({
      where: { id: body.assistanceId, tenantId: session.user.tenantId },
      select: { id: true },
    })
    if (!a) {
      return NextResponse.json({ error: 'Assistance not found' }, { status: 404 })
    }
  }
  if (body.insuranceCompanyId) {
    const ic = await prisma.insuranceCompany.findFirst({
      where: { id: body.insuranceCompanyId, tenantId: session.user.tenantId },
      select: { id: true },
    })
    if (!ic) {
      return NextResponse.json(
        { error: 'Insurance company not found' },
        { status: 404 },
      )
    }
  }
  if (body.vehicleId) {
    const v = await prisma.vehicle.findFirst({
      where: { id: body.vehicleId, tenantId: session.user.tenantId },
      select: { id: true },
    })
    if (!v) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
    }
  }

  const allowed: Record<string, unknown> = {}

  // 関連
  if (body.userId !== undefined) allowed.userId = body.userId
  if (body.assistanceId !== undefined) allowed.assistanceId = body.assistanceId
  if (body.insuranceCompanyId !== undefined) allowed.insuranceCompanyId = body.insuranceCompanyId
  if (body.vehicleId !== undefined) allowed.vehicleId = body.vehicleId
  if (body.dispatchNumber !== undefined) allowed.dispatchNumber = body.dispatchNumber

  // ステータス・タイプ
  if (body.status !== undefined) allowed.status = body.status
  if (body.type !== undefined) allowed.type = body.type === 'onsite' ? 'ONSITE' : 'TRANSPORT'
  if (body.isDraft !== undefined) allowed.isDraft = body.isDraft

  // タイムスタンプ
  if (body.arrivalTime !== undefined) allowed.arrivalTime = body.arrivalTime ? new Date(body.arrivalTime) : null
  if (body.completionTime !== undefined) allowed.completionTime = body.completionTime ? new Date(body.completionTime) : null
  if (body.transportStartTime !== undefined) allowed.transportStartTime = body.transportStartTime ? new Date(body.transportStartTime) : null
  if (body.returnTime !== undefined) allowed.returnTime = body.returnTime ? new Date(body.returnTime) : null
  if (body.dispatchTime !== undefined) allowed.dispatchTime = body.dispatchTime ? new Date(body.dispatchTime) : null

  // GPS
  if (body.dispatchGpsLat !== undefined) allowed.dispatchGpsLat = body.dispatchGpsLat
  if (body.dispatchGpsLng !== undefined) allowed.dispatchGpsLng = body.dispatchGpsLng
  if (body.arrivalGpsLat !== undefined) allowed.arrivalGpsLat = body.arrivalGpsLat
  if (body.arrivalGpsLng !== undefined) allowed.arrivalGpsLng = body.arrivalGpsLng

  // ODO
  if (body.departureOdo !== undefined) allowed.departureOdo = body.departureOdo
  if (body.arrivalOdo !== undefined) allowed.arrivalOdo = body.arrivalOdo
  if (body.transportStartOdo !== undefined) allowed.transportStartOdo = body.transportStartOdo
  if (body.completionOdo !== undefined) allowed.completionOdo = body.completionOdo
  if (body.returnOdo !== undefined) allowed.returnOdo = body.returnOdo

  // 案件情報
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

  // 作業時間
  if (body.workStartTime !== undefined) allowed.workStartTime = body.workStartTime ? new Date(body.workStartTime) : null
  if (body.workEndTime !== undefined) allowed.workEndTime = body.workEndTime ? new Date(body.workEndTime) : null
  if (body.workDuration !== undefined) allowed.workDuration = body.workDuration

  // 請求
  if (body.billedAt !== undefined) allowed.billedAt = body.billedAt ? new Date(body.billedAt) : null

  // 二次搬送予定日時 (STORED 案件用)
  if (body.scheduledSecondaryAt !== undefined) {
    allowed.scheduledSecondaryAt = body.scheduledSecondaryAt
      ? new Date(body.scheduledSecondaryAt)
      : null
  }

  try {
    const dispatch = await prisma.dispatch.update({
      where: { id, tenantId: session.user.tenantId },
      data: allowed,
    })
    return NextResponse.json(dispatch)
  } catch (err) {
    console.error('PATCH /api/admin/dispatches/[id] error:', err)
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
