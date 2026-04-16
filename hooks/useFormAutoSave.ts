'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { saveDraft, getDraft, deleteDraft } from '@/lib/offline-db'

/**
 * フォームデータを IndexedDB に自動保存するフック。
 * デバウンス1秒で dispatchDraft ストアに保存。
 *
 * @param key dispatchId or 'new'
 * @param enabled 自動保存の有効/無効（デフォルト: true）
 */
export function useFormAutoSave(key: string, enabled = true) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [restored, setRestored] = useState(false)
  const restoredDataRef = useRef<Record<string, unknown> | null>(null)

  // 保存済みの下書きを復元
  const restoreDraft = useCallback(async (): Promise<Record<string, unknown> | null> => {
    try {
      const draft = await getDraft(key)
      if (draft) {
        restoredDataRef.current = draft.formData
        setRestored(true)
        return draft.formData
      }
    } catch (e) {
      console.error('[autoSave] Failed to restore draft:', e)
    }
    setRestored(true)
    return null
  }, [key])

  // デバウンス付き保存
  const saveFormData = useCallback(
    (formData: Record<string, unknown>) => {
      if (!enabled) return

      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }

      timerRef.current = setTimeout(async () => {
        try {
          await saveDraft(key, formData)
        } catch (e) {
          console.error('[autoSave] Failed to save draft:', e)
        }
      }, 1000) // 1秒デバウンス
    },
    [key, enabled],
  )

  // 下書きを削除（送信成功後に呼ぶ）
  const clearDraft = useCallback(async () => {
    try {
      await deleteDraft(key)
    } catch (e) {
      console.error('[autoSave] Failed to clear draft:', e)
    }
  }, [key])

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return {
    saveFormData,
    restoreDraft,
    clearDraft,
    restored,
    restoredData: restoredDataRef.current,
  }
}
