import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminLayoutShell from '@/components/admin/AdminLayoutShell'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/')

  return <AdminLayoutShell session={session}>{children}</AdminLayoutShell>
}
