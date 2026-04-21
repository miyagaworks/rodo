'use client'

import { useState, useEffect } from 'react'
import { Session } from 'next-auth'
import { signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useAtomValue } from 'jotai'
import { FaCoffee } from 'react-icons/fa'
import { HiOutlineLogout } from 'react-icons/hi'
import AssistanceButton from '@/components/AssistanceButton'
import ProcessingBar from '@/components/ProcessingBar'
import BreakBar from '@/components/BreakBar'
import { breakStateAtom } from '@/store/breakAtom'

// displayAbbreviation → ロゴ・表示設定のマッピング
const DISPLAY_CONFIG: Record<string, {
  logo: string
  logoClass?: string
  textClass?: string
  textNudge?: number
}> = {
  'PA':    { logo: '/logos/assistance-pa.svg',          logoClass: 'max-h-28', textClass: 'text-2xl', textNudge: 10 },
  'SC':    { logo: '/logos/assistance-sc.svg',          logoClass: 'max-h-28', textClass: 'text-2xl', textNudge: 10 },
  'プライム': { logo: '/logos/assistance-prime.svg',    logoClass: 'max-h-14', textClass: 'text-xl' },
  'AWP':   { logo: '/logos/assistance-awp.svg',         logoClass: 'max-h-14', textClass: 'text-2xl' },
  '東京海上': { logo: '/logos/assistance-tokiomarine.png', logoClass: 'max-h-14', textClass: 'text-xl' },
  'グラン': { logo: '/logos/assistance-gran.svg',        logoClass: 'max-h-14', textClass: 'text-xl' },
}

interface DbAssistance {
  id: string
  name: string
  displayAbbreviation: string
  logoUrl: string | null
  sortOrder: number
}

interface HomeClientProps {
  session: Session
}

export default function HomeClient({ session }: HomeClientProps) {
  const router = useRouter()
  const breakState = useAtomValue(breakStateAtom)
  const [assistances, setAssistances] = useState<DbAssistance[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  // 休憩上限（残時間 > 0 で true）。取得前は null、フェイルクローズで false。
  const [canStartBreak, setCanStartBreak] = useState<boolean | null>(null)
  const [limitStatusError, setLimitStatusError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setFetchError(null)
        const res = await fetch('/api/assistances')
        if (res.status === 401) {
          // セッション切れ → ログイン画面へ
          router.push('/login')
          return
        }
        if (!res.ok) {
          throw new Error(`API error: ${res.status}`)
        }
        const data = await res.json()
        if (!cancelled && Array.isArray(data)) {
          setAssistances(data)
        }
      } catch (err) {
        console.error('[HomeClient] fetch failed:', err)
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : '読み込みに失敗しました')
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [router])

  // 休憩上限状態の取得。マウント時と、休憩状態が変わったタイミング
  // （特に breaking → idle に戻ったとき）で再取得。
  useEffect(() => {
    let cancelled = false
    async function loadLimit() {
      try {
        setLimitStatusError(null)
        const res = await fetch('/api/breaks/limit-status')
        if (!res.ok) {
          throw new Error(`API error: ${res.status}`)
        }
        const data = (await res.json()) as { canStartBreak?: unknown }
        if (!cancelled) {
          setCanStartBreak(typeof data.canStartBreak === 'boolean' ? data.canStartBreak : false)
        }
      } catch (err) {
        console.error('[HomeClient] limit-status fetch failed:', err)
        if (!cancelled) {
          // フェイルクローズ: 勤務時間を保護するため非表示にする
          setCanStartBreak(false)
          setLimitStatusError(
            err instanceof Error ? err.message : '休憩可否の取得に失敗しました',
          )
        }
      }
    }
    loadLimit()
    return () => { cancelled = true }
  }, [breakState.status])

  // DB データ + 表示設定を合成
  const displayAssistances = assistances.map((a) => {
    const config = DISPLAY_CONFIG[a.displayAbbreviation] ?? {
      logo: a.logoUrl ?? '',
      logoClass: 'max-h-20',
      textClass: 'text-xl',
    }
    return {
      id: a.id,           // DB の cuid
      displayKey: a.displayAbbreviation,
      name: a.name,
      abbr: a.displayAbbreviation,
      ...config,
    }
  })

  return (
    <div className="min-h-screen flex flex-col pb-16" style={{ backgroundColor: '#C6D8FF' }}>
      {/* ヘッダー */}
      <header className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#1C2948' }}>
        <img src="/rodo-logo.svg" alt="RODO" className="h-6" />
        <div className="flex items-center gap-3">
          {session.user.role === 'ADMIN' && (
            <a href="/settings" className="text-white text-sm">設定</a>
          )}
          <span className="text-white text-sm">{session.user.name}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-white opacity-70 hover:opacity-100 transition-opacity"
            title="ログアウト"
          >
            <HiOutlineLogout className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 p-4">
        {/* 休憩中バー（ポーズ中のみ表示） */}
        <div className="mb-3">
          <BreakBar />
        </div>

        {/* アシスタンスボタングリッド */}
        {displayAssistances.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 mb-3">
            {displayAssistances.map((assistance) => (
              <AssistanceButton key={assistance.id} assistance={assistance} />
            ))}
          </div>
        ) : fetchError ? (
          /* エラー表示 + リトライ */
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-gray-600 text-sm">{fetchError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-white rounded-lg shadow text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              再読み込み
            </button>
          </div>
        ) : (
          /* ローディングスケルトン */
          <div className="grid grid-cols-2 gap-3 mb-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl shadow-md animate-pulse"
                style={{ aspectRatio: '1 / 0.8' }}
              />
            ))}
          </div>
        )}

        {/* 休憩上限取得エラー通知（フェイルクローズした旨を案内） */}
        {limitStatusError && (
          <div
            role="status"
            className="mb-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs"
          >
            休憩可否の取得に失敗しました。休憩を一時停止しています。
          </div>
        )}

        {/* 休憩ボタン（ポーズ中 / 取得中 / 消化済みは非表示） */}
        {breakState.status !== 'paused' && canStartBreak === true && (
          <button
            className="w-full flex items-center justify-center gap-3 py-5 rounded-xl text-white text-xl font-bold"
            style={{ backgroundColor: '#888888' }}
            onClick={() => router.push('/break')}
          >
            <FaCoffee className="text-3xl" />
            <span style={{ letterSpacing: '0.25em', paddingLeft: '0.25em' }}>休憩</span>
          </button>
        )}
      </main>

      {/* 処理バー（固定） */}
      <ProcessingBar />
    </div>
  )
}
