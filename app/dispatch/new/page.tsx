import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import DispatchClient from '@/components/dispatch/DispatchClient'

interface Props {
  searchParams: Promise<{ assistanceId?: string; type?: string }>
}

export default async function DispatchNewPage({ searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const { assistanceId, type } = await searchParams

  if (!assistanceId) redirect('/')

  // assistanceId がこのテナントに属するか確認 + ユーザーのデフォルト車両を取得
  const [assistance, user] = await Promise.all([
    prisma.assistance.findFirst({
      where: { id: assistanceId, tenantId: session.user.tenantId },
    }),
    prisma.user.findUnique({
      where: { id: session.user.userId },
      select: { vehicleId: true },
    }),
  ])

  if (!assistance) redirect('/')

  const dispatchType = type === 'transport' ? 'transport' : 'onsite'

  return (
    <DispatchClient
      assistanceId={assistanceId}
      dispatchType={dispatchType}
      session={session}
      initialVehicleId={user?.vehicleId ?? null}
    />
  )
}
