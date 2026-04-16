import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import HomeClient from '@/components/HomeClient'

export default async function HomePage() {
  const session = await auth()
  if (!session) redirect('/login')

  return <HomeClient session={session} />
}
