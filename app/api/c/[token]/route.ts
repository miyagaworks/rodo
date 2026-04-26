import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const confirmation = await prisma.workConfirmation.findUnique({
    where: { shareToken: token },
  })

  if (!confirmation) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json(confirmation)
}
