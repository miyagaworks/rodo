import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import RecordClient, { SerializedDispatch } from '@/components/dispatch/RecordClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function DispatchRecordPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params

  const [dispatch, user] = await Promise.all([
    prisma.dispatch.findFirst({
      where: { id, tenantId: session.user.tenantId },
      include: { vehicle: { select: { plateNumber: true } } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.userId },
      select: { vehicleId: true, vehicle: { select: { plateNumber: true } } },
    }),
  ])

  if (!dispatch) redirect('/')

  // 振替済みの出動は記録編集不可 → 出動詳細へリダイレクト
  if (dispatch.status === 'TRANSFERRED') redirect(`/dispatch/${id}`)

  const serialized: SerializedDispatch = {
    id: dispatch.id,
    dispatchNumber: dispatch.dispatchNumber,
    type: dispatch.type,
    assistanceId: dispatch.assistanceId,
    dispatchTime: dispatch.dispatchTime?.toISOString() ?? null,
    arrivalTime: dispatch.arrivalTime?.toISOString() ?? null,
    completionTime: dispatch.completionTime?.toISOString() ?? null,
    transportStartTime: dispatch.transportStartTime?.toISOString() ?? null,
    address: dispatch.address,
    highwayName: dispatch.highwayName,
    highwayDirection: dispatch.highwayDirection,
    kiloPost: dispatch.kiloPost,
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
    memo: dispatch.memo,
    isHighway: dispatch.isHighway,
    weather: dispatch.weather,
    trafficControl: dispatch.trafficControl,
    parkingLocation: dispatch.parkingLocation,
    areaIcName: dispatch.areaIcName,
    insuranceCompanyId: dispatch.insuranceCompanyId,
    isDraft: dispatch.isDraft,
    vehicleNumber: dispatch.vehicle?.plateNumber ?? user?.vehicle?.plateNumber ?? null,
  }

  return <RecordClient dispatch={serialized} userName={session.user.name} />
}
