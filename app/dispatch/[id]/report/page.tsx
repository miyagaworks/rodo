import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import ReportOnsiteClient, {
  SerializedDispatchForReport,
  SerializedReport,
} from '@/components/dispatch/ReportOnsiteClient'
import ReportTransportClient from '@/components/dispatch/ReportTransportClient'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string }>
}

export default async function DispatchReportPage({ params, searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params
  const { type: typeParam } = await searchParams

  const [dispatch, report] = await Promise.all([
    prisma.dispatch.findFirst({
      where: { id, tenantId: session.user.tenantId },
    }),
    prisma.report.findUnique({
      where: { dispatchId: id },
    }),
  ])

  if (!dispatch) redirect('/')

  // 出動記録の必須項目（ナンバープレート・損保会社）が未入力なら出動記録へ飛ばす
  const isRecordComplete =
    dispatch.plateRegion && dispatch.plateNumber && dispatch.insuranceCompanyId
  if (!isRecordComplete) redirect(`/dispatch/${id}/record`)

  // 2次搬送データ取得（保管時のみ存在）
  const secondaryDispatch = dispatch.deliveryType === 'STORAGE'
    ? await prisma.dispatch.findFirst({
        where: { parentDispatchId: dispatch.id, isSecondaryTransport: true },
        include: { report: true, user: true },
      })
    : null

  // 搬送モードかどうか判定
  const isTransport = typeParam === 'transport' || dispatch.type === 'TRANSPORT'

  const serializedDispatch: SerializedDispatchForReport = {
    id: dispatch.id,
    dispatchNumber: dispatch.dispatchNumber,
    type: dispatch.type,
    dispatchTime: dispatch.dispatchTime?.toISOString() ?? null,
    arrivalTime: dispatch.arrivalTime?.toISOString() ?? null,
    transportStartTime: dispatch.transportStartTime?.toISOString() ?? null,
    completionTime: dispatch.completionTime?.toISOString() ?? null,
    returnTime: dispatch.returnTime?.toISOString() ?? null,
    departureOdo: dispatch.departureOdo,
    completionOdo: dispatch.completionOdo,
    vehicleNumber: dispatch.vehicleNumber,
    deliveryType: dispatch.deliveryType,
  }

  // primaryCompletionItems は Prisma の JsonValue 型なので安全にキャスト
  const rawItems = report?.primaryCompletionItems as
    | { doily?: boolean; cleaning?: boolean; protection?: boolean }
    | null
    | undefined

  const serializedReport: SerializedReport = {
    id: report?.id ?? null,
    departureOdo: report?.departureOdo ?? null,
    recoveryDistance: report?.recoveryDistance ?? null,
    transportDistance: report?.transportDistance ?? null,
    returnDistance: report?.returnDistance ?? null,
    completionOdo: report?.completionOdo ?? null,
    recoveryHighway: report?.recoveryHighway ?? null,
    transportHighway: report?.transportHighway ?? null,
    returnHighway: report?.returnHighway ?? null,
    totalHighway: report?.totalHighway ?? null,
    departurePlaceName: report?.departurePlaceName ?? null,
    arrivalPlaceName: report?.arrivalPlaceName ?? null,
    transportPlaceName: report?.transportPlaceName ?? null,
    transportShopName: report?.transportShopName ?? null,
    transportPhone: report?.transportPhone ?? null,
    transportAddress: report?.transportAddress ?? null,
    transportContact: report?.transportContact ?? null,
    transportMemo: report?.transportMemo ?? null,
    primaryCompletionItems: rawItems
      ? {
          doily: rawItems.doily ?? false,
          cleaning: rawItems.cleaning ?? false,
          protection: rawItems.protection ?? false,
        }
      : null,
    primaryCompletionNote: report?.primaryCompletionNote ?? null,
    secondaryCompletionItems: (() => {
      const secItems = report?.secondaryCompletionItems as
        | { reloading?: boolean; dolly?: boolean }
        | null
        | undefined
      return secItems
        ? { reloading: secItems.reloading ?? false, dolly: secItems.dolly ?? false }
        : null
    })(),
    secondaryCompletionNote: report?.secondaryCompletionNote ?? null,
    primaryAmount: report?.primaryAmount ?? null,
    secondaryAmount: report?.secondaryAmount ?? null,
    totalConfirmedAmount: report?.totalConfirmedAmount ?? null,
    storageRequired: report?.storageRequired ?? null,
    billingContactMemo: report?.billingContactMemo ?? null,
    isDraft: report?.isDraft ?? true,
  }

  if (isTransport) {
    // 2次搬送のシリアライズ
    const serializedSecondary = secondaryDispatch ? {
      dispatch: {
        id: secondaryDispatch.id,
        dispatchTime: secondaryDispatch.dispatchTime?.toISOString() ?? null,
        arrivalTime: secondaryDispatch.arrivalTime?.toISOString() ?? null,
        completionTime: secondaryDispatch.completionTime?.toISOString() ?? null,
        returnTime: secondaryDispatch.returnTime?.toISOString() ?? null,
        departureOdo: secondaryDispatch.departureOdo,
        completionOdo: secondaryDispatch.completionOdo,
        userName: secondaryDispatch.user.name,
        vehicleNumber: secondaryDispatch.vehicleNumber,
      },
      report: secondaryDispatch.report ? {
        transportDistance: secondaryDispatch.report.transportDistance,
        returnDistance: secondaryDispatch.report.returnDistance,
        departureOdo: secondaryDispatch.report.departureOdo,
        completionOdo: secondaryDispatch.report.completionOdo,
        transportHighway: secondaryDispatch.report.transportHighway,
        returnHighway: secondaryDispatch.report.returnHighway,
      } : null,
    } : null

    return (
      <ReportTransportClient
        dispatch={serializedDispatch}
        report={serializedReport}
        userName={session.user.name}
        secondaryData={serializedSecondary}
      />
    )
  }

  return (
    <ReportOnsiteClient
      dispatch={serializedDispatch}
      report={serializedReport}
      userName={session.user.name}
    />
  )
}
