import { renderToBuffer } from '@react-pdf/renderer'
import { prisma } from '@/lib/prisma'
import { registerFonts } from '@/lib/pdf/fonts'
import { ConfirmationPdf } from '@/lib/pdf/confirmation-template'

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

  registerFonts()

  const buffer = await renderToBuffer(
    ConfirmationPdf({
      workDate: confirmation.workDate,
      preApprovalChecks: confirmation.preApprovalChecks as boolean[] | null,
      customerSignature: confirmation.customerSignature,
      vehicleType: confirmation.vehicleType,
      registrationNumber: confirmation.registrationNumber,
      workContent: confirmation.workContent,
      shopCompanyName: confirmation.shopCompanyName,
      shopSignature: confirmation.shopSignature,
      postApprovalCheck: confirmation.postApprovalCheck,
      postApprovalSignature: confirmation.postApprovalSignature,
      postApprovalName: confirmation.postApprovalName,
      batteryDetails: confirmation.batteryDetails as Record<string, unknown> | null,
      notes: confirmation.notes,
    })
  )

  const dateStr = confirmation.workDate
    ? new Date(confirmation.workDate).toISOString().slice(0, 10)
    : 'unknown'

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="work-confirmation-${dateStr}.pdf"`,
    },
  })
}
