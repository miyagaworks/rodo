import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

type ReportBody = {
  departureOdo?: number | null
  recoveryDistance?: number | null
  transportDistance?: number | null
  returnDistance?: number | null
  completionOdo?: number | null
  recoveryHighway?: number | null
  transportHighway?: number | null
  returnHighway?: number | null
  totalHighway?: number | null
  departurePlaceName?: string | null
  arrivalPlaceName?: string | null
  transportPlaceName?: string | null
  transportShopName?: string | null
  transportPhone?: string | null
  transportAddress?: string | null
  transportContact?: string | null
  transportMemo?: string | null
  primaryCompletionItems?: Record<string, boolean> | null
  primaryCompletionNote?: string | null
  secondaryCompletionItems?: Record<string, boolean> | null
  secondaryCompletionNote?: string | null
  primaryAmount?: number | null
  secondaryAmount?: number | null
  totalConfirmedAmount?: number | null
  billingContactMemo?: string | null
  storageType?: string | null
  storageRequired?: boolean | null
  isDraft?: boolean
}

function buildReportData(body: ReportBody) {
  const data: Record<string, unknown> = {}
  if (body.departureOdo !== undefined) data.departureOdo = body.departureOdo
  if (body.recoveryDistance !== undefined) data.recoveryDistance = body.recoveryDistance
  if (body.transportDistance !== undefined) data.transportDistance = body.transportDistance
  if (body.returnDistance !== undefined) data.returnDistance = body.returnDistance
  if (body.completionOdo !== undefined) data.completionOdo = body.completionOdo
  if (body.recoveryHighway !== undefined) data.recoveryHighway = body.recoveryHighway
  if (body.transportHighway !== undefined) data.transportHighway = body.transportHighway
  if (body.returnHighway !== undefined) data.returnHighway = body.returnHighway
  if (body.totalHighway !== undefined) data.totalHighway = body.totalHighway
  if (body.departurePlaceName !== undefined) data.departurePlaceName = body.departurePlaceName
  if (body.arrivalPlaceName !== undefined) data.arrivalPlaceName = body.arrivalPlaceName
  if (body.transportPlaceName !== undefined) data.transportPlaceName = body.transportPlaceName
  if (body.transportShopName !== undefined) data.transportShopName = body.transportShopName
  if (body.transportPhone !== undefined) data.transportPhone = body.transportPhone
  if (body.transportAddress !== undefined) data.transportAddress = body.transportAddress
  if (body.transportContact !== undefined) data.transportContact = body.transportContact
  if (body.transportMemo !== undefined) data.transportMemo = body.transportMemo
  if (body.primaryCompletionItems !== undefined) data.primaryCompletionItems = body.primaryCompletionItems
  if (body.primaryCompletionNote !== undefined) data.primaryCompletionNote = body.primaryCompletionNote
  if (body.secondaryCompletionItems !== undefined) data.secondaryCompletionItems = body.secondaryCompletionItems
  if (body.secondaryCompletionNote !== undefined) data.secondaryCompletionNote = body.secondaryCompletionNote
  if (body.primaryAmount !== undefined) data.primaryAmount = body.primaryAmount
  if (body.secondaryAmount !== undefined) data.secondaryAmount = body.secondaryAmount
  if (body.totalConfirmedAmount !== undefined) data.totalConfirmedAmount = body.totalConfirmedAmount
  if (body.billingContactMemo !== undefined) data.billingContactMemo = body.billingContactMemo
  if (body.storageType !== undefined) data.storageType = body.storageType
  if (body.storageRequired !== undefined) data.storageRequired = body.storageRequired
  if (body.isDraft !== undefined) data.isDraft = body.isDraft
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

  const report = await prisma.report.findUnique({ where: { dispatchId: id } })
  return NextResponse.json(report)
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

  const body: ReportBody = await req.json()
  const data = buildReportData(body)

  try {
    const report = await prisma.report.upsert({
      where: { dispatchId: id },
      update: data,
      create: { dispatchId: id, ...data },
    })
    return NextResponse.json(report, { status: 201 })
  } catch (err) {
    console.error('POST /api/dispatches/[id]/report error:', err)
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

  const body: ReportBody = await req.json()
  const data = buildReportData(body)

  try {
    const report = await prisma.report.upsert({
      where: { dispatchId: id },
      update: data,
      create: { dispatchId: id, ...data },
    })
    return NextResponse.json(report)
  } catch (err) {
    console.error('PATCH /api/dispatches/[id]/report error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
