import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import SettingsClient from '@/components/SettingsClient'

export default async function SettingsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/')

  return <SettingsClient session={session} />
}
