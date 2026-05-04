'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { useRouter } from 'next/navigation'

/**
 * 進行中の出動から「ホームに戻る」操作をガードする共通フック。
 *
 * 出動中の浮き案件防止 Phase 2 (docs/plans/dispatch-floating-prevention.md §3 Phase 2 + §6.3 + §9.0-A)。
 *
 * 機能:
 *   - `safeNavigateHome(router, target?)` / `replaceLocation(target)` でホーム遷移をガード
 *   - `popstate`（ブラウザバック・スワイプバック）を抑止
 *   - `beforeunload`（タブ閉じ・リロード・外部 URL）に警告
 *
 * 設計判断:
 *   - MVP の確認ダイアログは `window.confirm`。Phase 3 で各画面が共通モーダル
 *     （`BackToHomeConfirmModal`）を `onAttemptHome` に差し込む二段階アプローチを採るため、
 *     callback 形式（`onAttemptHome: () => Promise<boolean> | boolean`）を維持する。
 *   - `onAttemptHome` 未指定時は `window.confirm` を表示するが、戻れない仕様
 *     （計画書のメッセージ「OK で戻ろうとしますが、ガードでブロックされます」に従い常に false を返す）。
 *   - Next.js 16 の `window.history.pushState` は Router と統合されるが、本用途
 *     （仮想エントリ積み）は `usePathname` / `useSearchParams` と非衝突
 *     （node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md L343-345）。
 *   - `inProgress` の true ⇄ false 変化に追従するため `useEffect` の依存配列に含める。
 *     仮想 popstate エントリは ref で多重 push を防ぐ（true 期間中は 1 回のみ積む）。
 */

type AppRouterInstance = ReturnType<typeof useRouter>

export interface UseDispatchInProgressGuardOptions {
  /** 「進行中（active）」かどうか。true のとき各種ガードが有効になる。 */
  inProgress: boolean
  /**
   * ホーム遷移を試みた際の確認 hook。
   * `true` を返すと遷移を許可、`false` を返すとブロック。
   * 未指定の場合は `window.confirm` を表示し、常に false（ブロック）を返す MVP 動作。
   */
  onAttemptHome?: () => Promise<boolean> | boolean
}

export interface UseDispatchInProgressGuardResult {
  /**
   * `router.push` のホーム遷移ラッパー。
   * inProgress=false ならそのまま push。
   * inProgress=true なら `onAttemptHome` を呼び、true なら push、false なら何もしない。
   */
  safeNavigateHome: (
    router: AppRouterInstance,
    target?: string,
  ) => Promise<void>
  /**
   * `window.location.href` 相当のフルリロード遷移ラッパー。
   * inProgress=false ならそのまま遷移、inProgress=true なら `onAttemptHome` 経由。
   */
  replaceLocation: (target: string) => Promise<void>
  /** ガードが発動した（ホーム遷移試行があった）ことを呼び出し元に伝える bool。 */
  attemptedExit: boolean
}

const DEFAULT_CONFIRM_MESSAGE =
  '進行中の案件があります。ホームに戻るには「案件キャンセル」ボタンで取り消してください。OK で戻ろうとしますが、ガードでブロックされます'

function defaultConfirm(): boolean {
  if (typeof window === 'undefined') return false
  // 戻り値は無視。常にブロックする（メッセージ仕様準拠）。
  window.confirm(DEFAULT_CONFIRM_MESSAGE)
  return false
}

export function useDispatchInProgressGuard({
  inProgress,
  onAttemptHome,
}: UseDispatchInProgressGuardOptions): UseDispatchInProgressGuardResult {
  const [attemptedExit, setAttemptedExit] = useState(false)

  // クロージャ内で常に最新値を見るための ref
  const inProgressRef = useRef(inProgress)
  const onAttemptHomeRef = useRef(onAttemptHome)
  // 仮想 popstate エントリの多重 push 防止（inProgress=true 期間中に 1 回だけ積む）
  const virtualEntryPushedRef = useRef(false)

  useEffect(() => {
    inProgressRef.current = inProgress
  }, [inProgress])

  useEffect(() => {
    onAttemptHomeRef.current = onAttemptHome
  }, [onAttemptHome])

  const tryAttempt = useCallback(async (): Promise<boolean> => {
    setAttemptedExit(true)
    const cb = onAttemptHomeRef.current
    if (cb) {
      try {
        return Boolean(await cb())
      } catch (e) {
        console.error('[useDispatchInProgressGuard] onAttemptHome threw', e)
        return false
      }
    }
    return defaultConfirm()
  }, [])

  const safeNavigateHome = useCallback(
    async (
      router: AppRouterInstance,
      target: string = '/',
    ): Promise<void> => {
      if (!inProgressRef.current) {
        router.push(target)
        return
      }
      const allow = await tryAttempt()
      if (allow) {
        router.push(target)
      }
    },
    [tryAttempt],
  )

  const replaceLocation = useCallback(
    async (target: string): Promise<void> => {
      if (!inProgressRef.current) {
        if (typeof window !== 'undefined') {
          window.location.href = target
        }
        return
      }
      const allow = await tryAttempt()
      if (allow && typeof window !== 'undefined') {
        window.location.href = target
      }
    },
    [tryAttempt],
  )

  // popstate / beforeunload リスナの登録
  useEffect(() => {
    if (typeof window === 'undefined') return

    if (inProgress) {
      // inProgress=true 期間中は仮想エントリを 1 回だけ積む
      if (!virtualEntryPushedRef.current) {
        window.history.pushState(null, '', window.location.href)
        virtualEntryPushedRef.current = true
      }
    } else {
      // inProgress=false に戻ったら次回の true 化で再 push できるようリセット
      virtualEntryPushedRef.current = false
    }

    const handlePopState = () => {
      if (!inProgressRef.current) return
      // 戻る方向を吸収するため、現在 URL の仮想エントリを再度積む
      window.history.pushState(null, '', window.location.href)
      // ガード発動を呼び出し元に通知（モーダル表示等は呼び出し元の責務）
      void tryAttempt()
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!inProgressRef.current) return
      e.preventDefault()
      // 旧仕様互換のため returnValue にも空文字を設定
      e.returnValue = ''
    }

    window.addEventListener('popstate', handlePopState)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [inProgress, tryAttempt])

  return {
    safeNavigateHome,
    replaceLocation,
    attemptedExit,
  }
}
