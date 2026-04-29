import { auth } from '@/auth'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { IoIosArrowBack } from 'react-icons/io'
import { prisma } from '@/lib/prisma'
import DispatchEditForm, {
  type DispatchEditFormInitial,
} from '@/components/admin/DispatchEditForm'

/**
 * 案件編集ページ (/admin/dispatches/[id])
 *
 * Phase 4-B。Server Component で auth + tenant スコープの fetch を行い、
 * <DispatchEditForm /> に initialValues + 隊員リスト + AS リストを渡す。
 *
 * Next.js 16.x: dynamic route の `params` は Promise<>。`await params` で解決する。
 */

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminDispatchEditPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/')

  const { id } = await params

  const dispatch = await prisma.dispatch.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: {
      id: true,
      dispatchNumber: true,
      userId: true,
      assistanceId: true,
      status: true,
      isDraft: true,
      dispatchTime: true,
      arrivalTime: true,
      completionTime: true,
      returnTime: true,
      departureOdo: true,
      arrivalOdo: true,
      completionOdo: true,
      returnOdo: true,
      customerName: true,
      vehicleName: true,
      plateRegion: true,
      plateClass: true,
      plateKana: true,
      plateNumber: true,
      scheduledSecondaryAt: true,
    },
  })

  if (!dispatch) notFound()

  const [users, assistances] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: session.user.tenantId },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.assistance.findMany({
      where: { tenantId: session.user.tenantId },
      select: { id: true, name: true, displayAbbreviation: true },
      orderBy: { displayAbbreviation: 'asc' },
    }),
  ])

  const initial: DispatchEditFormInitial = {
    id: dispatch.id,
    dispatchNumber: dispatch.dispatchNumber,
    userId: dispatch.userId,
    assistanceId: dispatch.assistanceId,
    status: dispatch.status,
    isDraft: dispatch.isDraft,
    dispatchTime: dispatch.dispatchTime?.toISOString() ?? null,
    arrivalTime: dispatch.arrivalTime?.toISOString() ?? null,
    completionTime: dispatch.completionTime?.toISOString() ?? null,
    returnTime: dispatch.returnTime?.toISOString() ?? null,
    departureOdo: dispatch.departureOdo,
    arrivalOdo: dispatch.arrivalOdo,
    completionOdo: dispatch.completionOdo,
    returnOdo: dispatch.returnOdo,
    customerName: dispatch.customerName,
    vehicleName: dispatch.vehicleName,
    plateRegion: dispatch.plateRegion,
    plateClass: dispatch.plateClass,
    plateKana: dispatch.plateKana,
    plateNumber: dispatch.plateNumber,
    scheduledSecondaryAt: dispatch.scheduledSecondaryAt?.toISOString() ?? null,
  }

  return (
    <div className="max-w-6xl mx-auto w-full space-y-3">
      <Link
        href="/admin/dispatches"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 hover:underline"
      >
        <IoIosArrowBack className="text-base" />
        <span>案件管理に戻る</span>
      </Link>
      <DispatchEditForm
        initial={initial}
        users={users}
        assistances={assistances}
      />
    </div>
  )
}
