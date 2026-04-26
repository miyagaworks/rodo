'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAtom } from 'jotai'
import { FaCoffee } from 'react-icons/fa'
import { breakStateAtom, BREAK_DURATION, initialBreakState } from '@/store/breakAtom'

export default function BreakScreen() {
  const router = useRouter()
  const [breakState, setBreakState] = useAtom(breakStateAtom)
  const initMinutes = Math.floor(breakState.remainingSeconds / 60)
  const initSeconds = Math.floor(breakState.remainingSeconds % 60)
  const [displayTime, setDisplayTime] = useState(
    `${String(initMinutes).padStart(2, '0')}:${String(initSeconds).padStart(2, '0')}`
  )
  const [isFinished, setIsFinished] = useState(false)
  const rafRef = useRef<number | null>(null)
  // React 19 Strict Mode では dev 時に useEffect が二重実行される。
  // initRef に初回実行済みフラグを持たせて startBreak / resumeBreak の二重呼び出しを防ぐ。
  // useRef は再マウント間で初期値に戻るため、真に新しい休憩開始時のみリセットされる。
  const initRef = useRef(false)

  // 休憩開始: APIコール + atom更新
  // - 201: 正常作成（新規休憩）
  // - 409: DB に未終了の休憩が残っている → GET /api/breaks/active で復元
  // - その他: エラー扱い
  const startBreak = useCallback(async () => {
    try {
      const res = await fetch('/api/breaks', { method: 'POST' })

      if (res.ok) {
        // 正常系（201）: 新規休憩として開始
        const data = await res.json()
        setBreakState({
          status: 'breaking',
          startTime: Date.now(),
          remainingSeconds: BREAK_DURATION,
          pausedAt: null,
          breakRecordId: data.id,
        })
        return
      }

      if (res.status === 409) {
        // 既存休憩が残っている → GET で詳細取得して復元
        const activeRes = await fetch('/api/breaks/active')
        if (!activeRes.ok) {
          console.error('Failed to fetch active break:', activeRes.status)
          return
        }
        const active = await activeRes.json()

        // 経過時間を逆算して残り秒を計算（サーバーの startTime 起点）
        const serverStartMs = new Date(active.startTime).getTime()
        const elapsedSec = Math.max(0, (Date.now() - serverStartMs) / 1000)
        const remaining = Math.max(0, BREAK_DURATION - elapsedSec)

        setBreakState({
          status: 'breaking',
          startTime: Date.now(),
          remainingSeconds: remaining,
          pausedAt: null,
          breakRecordId: active.id,
        })
        return
      }

      console.error('Failed to start break: HTTP', res.status)
    } catch (e) {
      console.error('Failed to start break:', e)
    }
  }, [setBreakState])

  // ポーズからの再開
  const resumeBreak = useCallback(async () => {
    if (!breakState.breakRecordId) return

    try {
      await fetch(`/api/breaks/${breakState.breakRecordId}/resume`, { method: 'PATCH' })
    } catch (e) {
      console.error('Failed to resume break:', e)
    }

    setBreakState((prev) => ({
      ...prev,
      status: 'breaking',
      startTime: Date.now(),
      // remainingSeconds は pause 時に保存済み
      pausedAt: null,
    }))
  }, [breakState.breakRecordId, setBreakState])

  // 初期化
  // Strict Mode 対策:
  //   - Strict Mode dev 時は同じマウント内で useEffect が 2 回実行される。
  //   - useRef のフラグで「同じ React マウントサイクル内での二重実行」を防ぐ。
  //   - cleanup では初期化済みフラグはリセットしない（Strict Mode 二度目の実行時にフラグが
  //     既に true なので skip される想定）。
  //   - useRef は真にコンポーネントが unmount/remount された場合には初期値 (false) に戻るため、
  //     ユーザー操作による再マウント時は正しく再初期化される。
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    if (breakState.status === 'idle') {
      startBreak()
    } else if (breakState.status === 'paused') {
      resumeBreak()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // タイマー更新ループ
  useEffect(() => {
    if (breakState.status !== 'breaking' || !breakState.startTime) return

    const tick = () => {
      // startTimeからの経過時間を使って残りを計算（バックグラウンド復帰でも正確）
      const elapsed = (Date.now() - breakState.startTime!) / 1000
      const remaining = Math.max(0, breakState.remainingSeconds - elapsed)

      const minutes = Math.floor(remaining / 60)
      const seconds = Math.floor(remaining % 60)
      setDisplayTime(
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      )

      if (remaining <= 0) {
        setIsFinished(true)
        // 休憩終了API
        if (breakState.breakRecordId) {
          fetch(`/api/breaks/${breakState.breakRecordId}/end`, { method: 'PATCH' }).catch(console.error)
        }
        setBreakState(initialBreakState)
        setTimeout(() => router.push('/'), 3000)
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [breakState.status, breakState.startTime, breakState.remainingSeconds, breakState.breakRecordId, setBreakState, router])

  // 出動対応ボタン
  const handleDispatch = useCallback(async () => {
    if (!breakState.startTime || !breakState.breakRecordId) return

    // 残り時間を計算してポーズ
    const elapsed = (Date.now() - breakState.startTime) / 1000
    const remaining = Math.max(0, breakState.remainingSeconds - elapsed)

    try {
      await fetch(`/api/breaks/${breakState.breakRecordId}/pause`, { method: 'PATCH' })
    } catch (e) {
      console.error('Failed to pause break:', e)
    }

    setBreakState((prev) => ({
      ...prev,
      status: 'paused',
      remainingSeconds: remaining,
      pausedAt: Date.now(),
      startTime: null,
    }))

    router.push('/')
  }, [breakState.startTime, breakState.remainingSeconds, breakState.breakRecordId, setBreakState, router])

  if (isFinished) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center z-50"
        style={{ backgroundColor: '#888888' }}
      >
        <FaCoffee className="text-white text-7xl mb-4" />
        <p className="text-white text-2xl font-bold">休憩終了</p>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50"
      style={{ backgroundColor: '#888888' }}
    >
      {/* コーヒーカップアイコン */}
      <FaCoffee className="text-white text-7xl mb-4" />

      {/* 休憩中テキスト */}
      <p className="text-white text-2xl font-bold mb-8">休憩中</p>

      {/* カウントダウンタイマー */}
      <p className="text-white font-bold mb-6" style={{ fontSize: '5rem', lineHeight: 1 }}>
        {displayTime}
      </p>

      {/* 出動対応ボタン */}
      <button
        onClick={handleDispatch}
        className="flex items-center gap-3 px-8 py-4 rounded-md text-white text-xl font-bold"
        style={{ backgroundColor: '#D3170A' }}
      >
        <img src="/icons/dispatch-truck.svg" alt="出動" className="w-8 h-8" />
        <span style={{ letterSpacing: '0.15em', paddingLeft: '0.15em' }}>出動対応</span>
      </button>
    </div>
  )
}
