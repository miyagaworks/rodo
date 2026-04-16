import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import SecondaryDispatchClient from '@/components/dispatch/SecondaryDispatchClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SecondaryDispatchPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params

  // 1次搬送（親）を取得
  const parentDispatch = await prisma.dispatch.findFirst({
    where: { id, tenantId: session.user.tenantId },
  })

  if (!parentDispatch || parentDispatch.status !== 'STORED') redirect('/')

  // 既存の2次搬送があるか確認
  const existingSecondary = await prisma.dispatch.findFirst({
    where: {
      parentDispatchId: id,
      tenantId: session.user.tenantId,
      isSecondaryTransport: true,
    },
  })

  const serializedParent = {
    id: parentDispatch.id,
    dispatchNumber: parentDispatch.dispatchNumber,
    assistanceId: parentDispatch.assistanceId,
    status: parentDispatch.status,
  }

  const serializedSecondary = existingSecondary ? {
    id: existingSecondary.id,
    dispatchNumber: existingSecondary.dispatchNumber,
    status: existingSecondary.status,
    departureOdo: existingSecondary.departureOdo,
    completionOdo: existingSecondary.completionOdo,
    dispatchTime: existingSecondary.dispatchTime?.toISOString() ?? null,
    arrivalTime: existingSecondary.arrivalTime?.toISOString() ?? null,
    completionTime: existingSecondary.completionTime?.toISOString() ?? null,
    returnTime: existingSecondary.returnTime?.toISOString() ?? null,
  } : null

  return (
    <SecondaryDispatchClient
      parentDispatch={serializedParent}
      initialSecondary={serializedSecondary}
      session={session}
    />
  )
}
