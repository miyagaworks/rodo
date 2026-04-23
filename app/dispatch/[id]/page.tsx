import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import DispatchClient from '@/components/dispatch/DispatchClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function DispatchPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params

  const dispatch = await prisma.dispatch.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      transferredTo: {
        select: { dispatchNumber: true, user: { select: { name: true } } },
      },
      transferredFrom: {
        select: { user: { select: { name: true } } },
      },
    },
  })

  if (!dispatch) redirect('/')

  const dispatchType = dispatch.type === 'TRANSPORT' ? 'transport' : 'onsite'

  // Date → string に変換（Client Component に渡すため）
  const serialized = {
    id: dispatch.id,
    dispatchNumber: dispatch.dispatchNumber,
    status: dispatch.status,
    type: dispatch.type,
    departureOdo: dispatch.departureOdo,
    arrivalOdo: dispatch.arrivalOdo,
    transportStartOdo: dispatch.transportStartOdo,
    completionOdo: dispatch.completionOdo,
    returnOdo: dispatch.returnOdo,
    dispatchTime: dispatch.dispatchTime?.toISOString() ?? null,
    arrivalTime: dispatch.arrivalTime?.toISOString() ?? null,
    completionTime: dispatch.completionTime?.toISOString() ?? null,
    returnTime: dispatch.returnTime?.toISOString() ?? null,
    dispatchGpsLat: dispatch.dispatchGpsLat,
    dispatchGpsLng: dispatch.dispatchGpsLng,
    arrivalGpsLat: dispatch.arrivalGpsLat,
    arrivalGpsLng: dispatch.arrivalGpsLng,
    transportStartTime: dispatch.transportStartTime?.toISOString() ?? null,
    deliveryType: dispatch.deliveryType as 'DIRECT' | 'STORAGE' | null,
    transferStatus: dispatch.transferStatus,
    transferredFromId: dispatch.transferredFromId,
    transferredToUserName: dispatch.transferredTo?.user?.name ?? null,
    transferredToDispatchNumber: dispatch.transferredTo?.dispatchNumber ?? null,
    transferredFromUserName: dispatch.transferredFrom?.user?.name ?? null,
  }

  return (
    <DispatchClient
      assistanceId={dispatch.assistanceId}
      dispatchType={dispatchType}
      session={session}
      initialDispatch={serialized}
    />
  )
}
