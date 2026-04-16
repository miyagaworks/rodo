import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import BreakScreen from '@/components/BreakScreen'
import ProcessingBar from '@/components/ProcessingBar'

export default async function BreakPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <>
      <BreakScreen />
      <ProcessingBar />
    </>
  )
}
