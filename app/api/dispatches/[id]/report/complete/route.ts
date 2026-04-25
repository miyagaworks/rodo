import { NextResponse } from 'next/server'
import { z } from 'zod/v4'
import type { Dispatch } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { completeReportSchema } from '@/lib/validations'
import {
  calculateRecoveryDistance,
  calculateTransportDistance,
  calculateReturnDistance,
} from '@/lib/reportDistance'

type CompleteReportBody = z.infer<typeof completeReportSchema>

/**
 * Report に保存する ODO 値を、クライアント入力 (body) と Dispatch の値の両方から解決する。
 * body で明示的に送られていれば優先。未送信 (undefined) なら Dispatch の値をフォールバック。
 * complete スキーマは transportDistance 等を omit しているが、ODO 入力 (departureOdo / arrivalOdo /
 * transportStartOdo / completionOdo / returnOdo) は受け付ける。
 */
function resolveOdos(body: CompleteReportBody, dispatch: Dispatch) {
  const departureOdo = body.departureOdo !== undefined ? body.departureOdo : dispatch.departureOdo
  const arrivalOdo = body.arrivalOdo !== undefined ? body.arrivalOdo : dispatch.arrivalOdo
  const transportStartOdo =
    body.transportStartOdo !== undefined ? body.transportStartOdo : dispatch.transportStartOdo
  const completionOdo = body.completionOdo !== undefined ? body.completionOdo : dispatch.completionOdo
  const returnOdo = body.returnOdo !== undefined ? body.returnOdo : dispatch.returnOdo
  return { departureOdo, arrivalOdo, transportStartOdo, completionOdo, returnOdo }
}

/**
 * Dispatch のフロー種別に応じて 3 つの距離を自動計算する。
 * - ONSITE: recovery / return のみ、transport は null
 * - TRANSPORT 1 次: 3 つすべて（transport は transportStartOdo 起点）
 * - SECONDARY TRANSPORT (isSecondaryTransport === true): transport / return のみ、recovery は null
 *   transport は departureOdo 起点（2 次は出発がそのまま搬送開始）
 */
function computeDistances(
  dispatch: Dispatch,
  odos: ReturnType<typeof resolveOdos>,
): { recoveryDistance: number | null; transportDistance: number | null; returnDistance: number | null } {
  const { departureOdo, arrivalOdo, transportStartOdo, completionOdo, returnOdo } = odos
  const isSecondary = dispatch.isSecondaryTransport === true

  if (isSecondary) {
    return {
      recoveryDistance: null,
      transportDistance: calculateTransportDistance(departureOdo, completionOdo),
      returnDistance: calculateReturnDistance(completionOdo, returnOdo),
    }
  }

  if (dispatch.type === 'ONSITE') {
    return {
      recoveryDistance: calculateRecoveryDistance(departureOdo, arrivalOdo),
      transportDistance: null,
      returnDistance: calculateReturnDistance(completionOdo, returnOdo),
    }
  }

  // TRANSPORT 1 次
  return {
    recoveryDistance: calculateRecoveryDistance(departureOdo, arrivalOdo),
    transportDistance: calculateTransportDistance(transportStartOdo, completionOdo),
    returnDistance: calculateReturnDistance(completionOdo, returnOdo),
  }
}

function buildReportData(body: CompleteReportBody, dispatch: Dispatch) {
  const data: Record<string, unknown> = {}

  // ODO は body 優先、未送信なら Dispatch 側の値を保存する（Phase B 補完）
  const odos = resolveOdos(body, dispatch)
  data.departureOdo = odos.departureOdo ?? null
  data.arrivalOdo = odos.arrivalOdo ?? null
  data.transportStartOdo = odos.transportStartOdo ?? null
  data.completionOdo = odos.completionOdo ?? null
  data.returnOdo = odos.returnOdo ?? null

  // 距離は常にサーバー側で自動計算する（クライアントからの distance は無視）
  const distances = computeDistances(dispatch, odos)
  data.recoveryDistance = distances.recoveryDistance
  data.transportDistance = distances.transportDistance
  data.returnDistance = distances.returnDistance

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
  if (dispatch.status === 'TRANSFERRED') {
    return NextResponse.json({ error: 'Cannot complete report for transferred dispatch' }, { status: 403 })
  }

  const raw = await req.json()
  const parsed = completeReportSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const body: CompleteReportBody = parsed.data
  const data = buildReportData(body, dispatch)

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
