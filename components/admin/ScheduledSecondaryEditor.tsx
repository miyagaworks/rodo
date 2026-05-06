'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * 二次搬送予定日時の編集 UI。
 *
 * 行内展開方式: StoredVehicleList の各行下に展開される小さなフォーム。
 * - input[type="datetime-local"] で日時入力（外部ライブラリ非依存）
 * - 「未定にする」で NULL クリア
 * - PATCH /api/admin/dispatches/[id] を呼び、成功時に admin/dispatches クエリを invalidate
 *
 * タイムゾーン:
 *   input[type="datetime-local"] はローカル（ブラウザ JST 想定）の文字列を返す。
 *   送信時に Date 経由で ISO 化（UTC）して保存。
 *   表示時の JST 整形は呼出側で行う。
 */

interface ScheduledSecondaryEditorProps {
  dispatchId: string
  /** 現在値（ISO 文字列、null = 未定）。未指定なら空フォーム。 */
  initialValue: string | null
  onClose: () => void
}

/**
 * ISO 文字列 (UTC) を input[type="datetime-local"] が要求する
 * "YYYY-MM-DDTHH:mm" 形式 (JST ローカル) に変換。
 */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // JST に補正
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const y = jst.getUTCFullYear()
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(jst.getUTCDate()).padStart(2, '0')
  const hh = String(jst.getUTCHours()).padStart(2, '0')
  const mm = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}`
}

/**
 * datetime-local の "YYYY-MM-DDTHH:mm" (JST ローカル想定) を ISO 文字列 (UTC) に変換。
 */
function localInputToIso(local: string): string | null {
  if (!local) return null
  // 末尾に +09:00 を付け JST として解釈
  const d = new Date(`${local}:00+09:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function ScheduledSecondaryEditor({
  dispatchId,
  initialValue,
  onClose,
}: ScheduledSecondaryEditorProps) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState<string>(() => isoToLocalInput(initialValue))
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (payload: { scheduledSecondaryAt: string | null }) => {
      const res = await fetch(`/api/admin/dispatches/${dispatchId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        throw new Error(`PATCH failed: ${res.status}`)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'dispatches'] })
      // 案件管理カレンダーの「2予」バッジは scheduledSecondaryAt の変更で再集計される。
      // ['admin', 'calendar', year, month] の prefix マッチで全月を invalidate。
      queryClient.invalidateQueries({ queryKey: ['admin', 'calendar'] })
      onClose()
    },
    onError: (e: Error) => {
      setError(e.message)
    },
  })

  const handleSave = () => {
    setError(null)
    const iso = localInputToIso(value)
    mutation.mutate({ scheduledSecondaryAt: iso })
  }

  const handleClear = () => {
    setError(null)
    setValue('')
    mutation.mutate({ scheduledSecondaryAt: null })
  }

  const isSaving = mutation.isPending

  return (
    <div
      className="border-t border-gray-100 bg-gray-50 px-4 py-3"
      data-testid="scheduled-secondary-editor"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <label className="text-xs text-gray-600 sm:w-32 flex-shrink-0">
          二次搬送予定日時
        </label>
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isSaving}
          className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm"
          data-testid="scheduled-secondary-input"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !value}
            className="rounded px-3 py-1 text-xs text-white disabled:opacity-50"
            style={{ backgroundColor: '#1C2948' }}
            data-testid="scheduled-secondary-save"
          >
            {isSaving ? '保存中…' : '保存'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={isSaving}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 disabled:opacity-50"
            data-testid="scheduled-secondary-clear"
          >
            未定にする
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded px-3 py-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
            data-testid="scheduled-secondary-cancel"
          >
            閉じる
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-red-600">
          <span>保存に失敗しました ({error})</span>
          <button
            type="button"
            onClick={handleSave}
            className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-red-600"
          >
            再試行
          </button>
        </div>
      )}
    </div>
  )
}
