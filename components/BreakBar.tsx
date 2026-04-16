'use client'

import { useAtomValue } from 'jotai'
import { useRouter } from 'next/navigation'
import { FaCoffee } from 'react-icons/fa'
import { breakStateAtom } from '@/store/breakAtom'

export default function BreakBar() {
  const breakState = useAtomValue(breakStateAtom)
  const router = useRouter()

  if (breakState.status !== 'paused') return null

  const minutes = Math.floor(breakState.remainingSeconds / 60)
  const seconds = Math.floor(breakState.remainingSeconds % 60)
  const timeDisplay = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  const handleTap = () => {
    router.push('/break')
  }

  return (
    <button
      onClick={handleTap}
      className="w-full flex items-center justify-center gap-3 py-4 text-white font-bold cursor-pointer rounded-xl"
      style={{ backgroundColor: '#2FBF71' }}
    >
      <FaCoffee className="text-3xl" />
      <span className="text-xl" style={{ letterSpacing: '0.25em', paddingLeft: '0.25em' }}>休憩</span>
      <span className="text-3xl font-bold ml-2">{timeDisplay}</span>
    </button>
  )
}
