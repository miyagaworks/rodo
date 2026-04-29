import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminLayoutShell from '@/components/admin/AdminLayoutShell'
import AdminQueryProvider from '@/components/admin/AdminQueryProvider'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/')

  return (
    <AdminLayoutShell session={session}>
      <AdminQueryProvider>{children}</AdminQueryProvider>
    </AdminLayoutShell>
  )
}
