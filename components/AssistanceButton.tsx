'use client'

import { useRouter } from 'next/navigation'

interface Assistance {
  id: string          // DB の cuid（ナビゲーション用）
  displayKey: string  // 内部キー（'pa' など、表示設定用）
  name: string
  logo: string
  abbr: string
  logoClass?: string
  textClass?: string
  textNudge?: number
}

interface AssistanceButtonProps {
  assistance: Assistance
}

export default function AssistanceButton({ assistance }: AssistanceButtonProps) {
  const router = useRouter()

  const handleClick = () => {
    router.push(`/dispatch/new?assistanceId=${assistance.id}&type=onsite`)
  }

  return (
    <button
      className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center justify-center gap-3 hover:shadow-lg active:scale-95 transition-all"
      style={{ aspectRatio: '1 / 0.8' }}
      onClick={handleClick}
    >
      <div className="flex-1 flex items-center justify-center w-full">
        <img
          src={assistance.logo}
          alt={assistance.name}
          className={`max-w-[85%] object-contain ${assistance.logoClass ?? 'max-h-20'}`}
        />
      </div>
      <span
        className={`font-bold text-gray-800 ${assistance.textClass ?? 'text-xl'}`}
        style={assistance.textNudge ? { transform: `translateY(-${assistance.textNudge}px)` } : undefined}
      >
        {assistance.abbr}
      </span>
    </button>
  )
}
