import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import ConfirmationClient from '@/components/dispatch/ConfirmationClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ConfirmationPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params

  const dispatch = await prisma.dispatch.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: { workConfirmation: true },
  })

  if (!dispatch) redirect('/')

  // 振替済みの出動は確認書作成不可 → 出動詳細へリダイレクト
  if (dispatch.status === 'TRANSFERRED') redirect(`/dispatch/${id}`)

  const confirmation = dispatch.workConfirmation
    ? {
        workDate: dispatch.workConfirmation.workDate.toISOString(),
        preApprovalChecks: dispatch.workConfirmation.preApprovalChecks as boolean[] | null,
        customerSignature: dispatch.workConfirmation.customerSignature,
        customerName: dispatch.workConfirmation.customerName,
        customerDate: dispatch.workConfirmation.customerDate?.toISOString() ?? null,
        vehicleType: dispatch.workConfirmation.vehicleType,
        registrationNumber: dispatch.workConfirmation.registrationNumber,
        workContent: dispatch.workConfirmation.workContent,
        shopCompanyName: dispatch.workConfirmation.shopCompanyName,
        shopContactName: dispatch.workConfirmation.shopContactName,
        shopSignature: dispatch.workConfirmation.shopSignature,
        postApprovalCheck: dispatch.workConfirmation.postApprovalCheck,
        postApprovalSignature: dispatch.workConfirmation.postApprovalSignature,
        postApprovalName: dispatch.workConfirmation.postApprovalName,
        batteryDetails: dispatch.workConfirmation.batteryDetails as Record<string, unknown> | null,
        notes: dispatch.workConfirmation.notes,
      }
    : null

  return (
    <ConfirmationClient
      dispatchId={dispatch.id}
      confirmation={confirmation}
      userName={session.user.name}
    />
  )
}
