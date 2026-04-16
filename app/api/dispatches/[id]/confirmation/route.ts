import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

type ConfirmationBody = {
  workDate?: string
  preApprovalChecks?: boolean[]
  customerSignature?: string | null
  customerName?: string | null
  customerDate?: string | null
  vehicleType?: string | null
  registrationNumber?: string | null
  workContent?: string | null
  shopCompanyName?: string | null
  shopContactName?: string | null
  shopSignature?: string | null
  postApprovalCheck?: boolean
  postApprovalSignature?: string | null
  postApprovalName?: string | null
  batteryDetails?: Record<string, unknown> | null
  notes?: string | null
}

function buildData(body: ConfirmationBody) {
  const data: Record<string, unknown> = {}
  if (body.workDate !== undefined) data.workDate = new Date(body.workDate)
  if (body.preApprovalChecks !== undefined) data.preApprovalChecks = body.preApprovalChecks
  if (body.customerSignature !== undefined) data.customerSignature = body.customerSignature
  if (body.customerName !== undefined) data.customerName = body.customerName
  if (body.customerDate !== undefined) data.customerDate = body.customerDate ? new Date(body.customerDate) : null
  if (body.vehicleType !== undefined) data.vehicleType = body.vehicleType
  if (body.registrationNumber !== undefined) data.registrationNumber = body.registrationNumber
  if (body.workContent !== undefined) data.workContent = body.workContent
  if (body.shopCompanyName !== undefined) data.shopCompanyName = body.shopCompanyName
  if (body.shopContactName !== undefined) data.shopContactName = body.shopContactName
  if (body.shopSignature !== undefined) data.shopSignature = body.shopSignature
  if (body.postApprovalCheck !== undefined) data.postApprovalCheck = body.postApprovalCheck
  if (body.postApprovalSignature !== undefined) data.postApprovalSignature = body.postApprovalSignature
  if (body.postApprovalName !== undefined) data.postApprovalName = body.postApprovalName
  if (body.batteryDetails !== undefined) data.batteryDetails = body.batteryDetails
  if (body.notes !== undefined) data.notes = body.notes
  return data
}

async function verifyDispatch(id: string, tenantId: string) {
  return prisma.dispatch.findFirst({ where: { id, tenantId } })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const dispatch = await verifyDispatch(id, session.user.tenantId)
  if (!dispatch) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const confirmation = await prisma.workConfirmation.findUnique({ where: { dispatchId: id } })
  return NextResponse.json(confirmation)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const dispatch = await verifyDispatch(id, session.user.tenantId)
  if (!dispatch) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body: ConfirmationBody = await req.json()
  const data = buildData(body)

  try {
    const confirmation = await prisma.workConfirmation.upsert({
      where: { dispatchId: id },
      update: data,
      create: { dispatchId: id, ...data },
    })
    return NextResponse.json(confirmation, { status: 201 })
  } catch (err) {
    console.error('POST /api/dispatches/[id]/confirmation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const dispatch = await verifyDispatch(id, session.user.tenantId)
  if (!dispatch) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body: ConfirmationBody = await req.json()
  const data = buildData(body)

  try {
    const confirmation = await prisma.workConfirmation.upsert({
      where: { dispatchId: id },
      update: data,
      create: { dispatchId: id, ...data },
    })
    return NextResponse.json(confirmation)
  } catch (err) {
    console.error('PATCH /api/dispatches/[id]/confirmation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
