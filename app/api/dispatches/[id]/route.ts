import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { updateDispatchSchema } from '@/lib/validations'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const dispatch = await prisma.dispatch.findUnique({
    where: { id, tenantId: session.user.tenantId },
    include: {
      user: { select: { name: true } },
      assistance: { select: { name: true } },
      transferredTo: {
        select: {
          id: true,
          dispatchNumber: true,
          user: { select: { name: true } },
        },
      },
      transferredFrom: {
        select: {
          id: true,
          dispatchNumber: true,
          user: { select: { name: true } },
        },
      },
    },
  })
  if (!dispatch) {
    return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
  }

  return NextResponse.json(dispatch)
}

/** 許可されたステータス遷移マップ */
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  STANDBY:      ['DISPATCHED'],
  DISPATCHED:   ['ONSITE', 'STANDBY'],
  ONSITE:       ['TRANSPORTING', 'COMPLETED', 'DISPATCHED', 'TRANSFERRED'],
  TRANSPORTING: ['COMPLETED', 'STORED', 'ONSITE'],
  COMPLETED:    ['RETURNED', 'TRANSPORTING', 'ONSITE'],
  STORED:       ['RETURNED', 'TRANSPORTING'],
  RETURNED:     ['COMPLETED', 'STORED'],
  CANCELLED:    ['STANDBY'],
  TRANSFERRED:  [],
}

const VALID_STATUSES = new Set(Object.keys(VALID_STATUS_TRANSITIONS))

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const raw = await req.json()
  const parsed = updateDispatchSchema
    .refine(obj => Object.keys(obj).length > 0, 'Empty body')
    .safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const body = parsed.data

  // ステータス遷移バリデーション
  if (body.status !== undefined) {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 })
    }

    const current = await prisma.dispatch.findUnique({
      where: { id, tenantId: session.user.tenantId },
      select: { status: true },
    })
    if (!current) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
    }

    const allowedTransitions = VALID_STATUS_TRANSITIONS[current.status] ?? []
    if (!allowedTransitions.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status transition: ${current.status} → ${body.status}` },
        { status: 400 },
      )
    }
  }

  // type 変更バリデーション（全ステータスで許可、TRANSFERRED除外）
  if (body.type !== undefined) {
    const current = await prisma.dispatch.findUnique({
      where: { id, tenantId: session.user.tenantId },
      select: { status: true, type: true, originalType: true },
    })
    if (!current) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
    }
    if (current.status === 'TRANSFERRED') {
      return NextResponse.json(
        { error: '振替済みの出動はタイプ変更できません' },
        { status: 400 },
      )
    }
  }

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

  // type 変更時: DB enum 形式に変換し、originalType / typeChangedAt を自動記録
  if (body.type !== undefined) {
    const dbType = body.type === 'onsite' ? 'ONSITE' : 'TRANSPORT'
    allowed.type = dbType
    // まだ originalType が記録されていない場合のみセット（上の current クエリで取得済み）
    const currentForType = await prisma.dispatch.findUnique({
      where: { id, tenantId: session.user.tenantId },
      select: { originalType: true, type: true, status: true },
    })
    if (currentForType && !currentForType.originalType) {
      allowed.originalType = currentForType.type
    }
    allowed.typeChangedAt = new Date()

    // ONSITE 以降のステータスの場合、ONSITE に戻しデータをクリア
    const AFTER_ONSITE_STATUSES = ['TRANSPORTING', 'COMPLETED', 'STORED', 'RETURNED']
    if (currentForType && AFTER_ONSITE_STATUSES.includes(currentForType.status)) {
      allowed.status = 'ONSITE'
      allowed.transportStartTime = null
      allowed.completionTime = null
      allowed.returnTime = null
      allowed.workStartTime = null
      allowed.workEndTime = null
      allowed.workDuration = null
      allowed.completionOdo = null
      allowed.canDrive = null
      allowed.deliveryType = null
    }
  }

  // insuranceCompanyId のテナント検証
  if (body.insuranceCompanyId) {
    const ic = await prisma.insuranceCompany.findFirst({
      where: { id: body.insuranceCompanyId, tenantId: session.user.tenantId },
      select: { id: true },
    })
    if (!ic) {
      return NextResponse.json({ error: 'Insurance company not found' }, { status: 404 })
    }
  }

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
