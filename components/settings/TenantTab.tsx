'use client'

import { useEffect, useState } from 'react'
import { FaSave } from 'react-icons/fa'

/**
 * テナント設定タブ
 *
 * 運営日の開始時刻（businessDayStartMinutes, 0〜1439）を「時」「分」の
 * 2 つの select で入力して保存する。内部値は分の総量として管理。
 *
 * 用途は出動番号の日付計算のみ。休憩時間上限制御には影響しない。
 */
export default function TenantTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hour, setHour] = useState<number>(0)
  const [minute, setMinute] = useState<number>(0)
  const [message, setMessage] = useState<{
    kind: 'success' | 'error'
    text: string
  } | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/tenant/settings')
        if (!res.ok) {
          throw new Error(`GET failed: ${res.status}`)
        }
        const data = (await res.json()) as { businessDayStartMinutes: number }
        if (!cancelled) {
          const minutes = Number.isInteger(data.businessDayStartMinutes)
            ? data.businessDayStartMinutes
            : 0
          setHour(Math.floor(minutes / 60))
          setMinute(minutes % 60)
        }
      } catch (err) {
        console.error('[TenantTab] fetch failed:', err)
        if (!cancelled) {
          setFetchError(
            err instanceof Error ? err.message : '読み込みに失敗しました',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    const businessDayStartMinutes = hour * 60 + minute
    try {
      const res = await fetch('/api/tenant/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessDayStartMinutes }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          typeof data?.error === 'string'
            ? data.error
            : `保存に失敗しました (${res.status})`,
        )
      }
      setMessage({ kind: 'success', text: '保存しました' })
    } catch (err) {
      console.error('[TenantTab] save failed:', err)
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : '保存に失敗しました',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-500">読み込み中...</div>
  }

  if (fetchError) {
    return (
      <div className="text-center py-8 text-red-500">
        読み込みに失敗しました: {fetchError}
      </div>
    )
  }

  const hourOptions = Array.from({ length: 24 }, (_, i) => i)
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i)

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="font-medium text-gray-800 mb-1">運営日の開始時刻</h2>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed text-justify">
          出動番号の日付計算に使用されます。休憩時間制御には影響しません。
          夜勤を含む運用では、シフト開始前の時刻に設定してください。
        </p>

        <div className="flex items-center gap-2 mb-4">
          <select
            aria-label="時"
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {hourOptions.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-600">時</span>
          <select
            aria-label="分"
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {minuteOptions.map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, '0')}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-600">分</span>
        </div>

        {message && (
          <div
            role="status"
            className={`text-sm mb-3 ${
              message.kind === 'success' ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {message.text}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2.5 disabled:opacity-60"
          style={{ backgroundColor: '#1C2948', color: 'white' }}
        >
          <FaSave className="w-4 h-4" />
          <span style={{ letterSpacing: '0.15em' }}>
            {saving ? '保存中...' : '保存'}
          </span>
        </button>
      </div>
    </div>
  )
}
