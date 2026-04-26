import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ConfirmationView } from '@/components/confirmation/ConfirmationView'

export default async function PublicConfirmationPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const confirmation = await prisma.workConfirmation.findUnique({
    where: { shareToken: token },
  })

  if (!confirmation) notFound()

  return <ConfirmationView token={token} confirmation={confirmation} />
}
