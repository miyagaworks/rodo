import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

type ReportBody = {
  departureOdo?: number | null
  recoveryDistance?: number | null
  returnDistance?: number | null
  completionOdo?: number | null
  recoveryHighway?: number | null
  returnHighway?: number | null
  totalHighway?: number | null
  departurePlaceName?: string | null
  arrivalPlaceName?: string | null
  primaryCompletionItems?: Record<string, boolean> | null
  primaryCompletionNote?: string | null
  secondaryCompletionItems?: Record<string, boolean> | null
  secondaryCompletionNote?: string | null
  primaryAmount?: number | null
  secondaryAmount?: number | null
  totalConfirmedAmount?: number | null
  billingContactMemo?: string | null
  storageRequired?: boolean | null
}

function buildReportData(body: ReportBody) {
  const data: Record<string, unknown> = {}
  if (body.departureOdo !== undefined) data.departureOdo = body.departureOdo
  if (body.recoveryDistance !== undefined) data.recoveryDistance = body.recoveryDistance
  if (body.returnDistance !== undefined) data.returnDistance = body.returnDistance
  if (body.completionOdo !== undefined) data.completionOdo = body.completionOdo
  if (body.recoveryHighway !== undefined) data.recoveryHighway = body.recoveryHighway
  if (body.returnHighway !== undefined) data.returnHighway = body.returnHighway
  if (body.totalHighway !== undefined) data.totalHighway = body.totalHighway
  if (body.departurePlaceName !== undefined) data.departurePlaceName = body.departurePlaceName
  if (body.arrivalPlaceName !== undefined) data.arrivalPlaceName = body.arrivalPlaceName
  if (body.primaryCompletionItems !== undefined) data.primaryCompletionItems = body.primaryCompletionItems
  if (body.primaryCompletionNote !== undefined) data.primaryCompletionNote = body.primaryCompletionNote
  if (body.secondaryCompletionItems !== undefined) data.secondaryCompletionItems = body.secondaryCompletionItems
  if (body.secondaryCompletionNote !== undefined) data.secondaryCompletionNote = body.secondaryCompletionNote
  if (body.primaryAmount !== undefined) data.primaryAmount = body.primaryAmount
  if (body.secondaryAmount !== undefined) data.secondaryAmount = body.secondaryAmount
  if (body.totalConfirmedAmount !== undefined) data.totalConfirmedAmount = body.totalConfirmedAmount
  if (body.billingContactMemo !== undefined) data.billingContactMemo = body.billingContactMemo
  if (body.storageRequired !== undefined) data.storageRequired = body.storageRequired
  return data
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const dispatch = await prisma.dispatch.findFirst({
    where: { id, tenantId: session.user.tenantId },
  })
  if (!dispatch) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body: ReportBody = await req.json()
  const data = buildReportData(body)

  try {
    const report = await prisma.report.upsert({
      where: { dispatchId: id },
      update: { ...data, isDraft: false },
      create: { dispatchId: id, ...data, isDraft: false },
    })
    return NextResponse.json(report)
  } catch (err) {
    console.error('POST /api/dispatches/[id]/report/complete error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
