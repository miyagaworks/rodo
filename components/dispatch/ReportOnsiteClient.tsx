'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FaPen, FaCheckSquare } from 'react-icons/fa'
import { FaCircleArrowRight } from 'react-icons/fa6'
import { IoIosArrowDropleftCircle } from 'react-icons/io'
import { Check } from 'lucide-react'
import ClockPicker from './ClockPicker'
import VehicleSelector from './VehicleSelector'
import { offlineFetch } from '@/lib/offline-fetch'
import { useFormAutoSave } from '@/hooks/useFormAutoSave'
import { useVehicles } from '@/hooks/useVehicles'
import { formatCurrentVehicleLabel } from '@/lib/vehicle-label'

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export interface SerializedDispatchForReport {
  id: string
  dispatchNumber: string
  type: 'ONSITE' | 'TRANSPORT'
  dispatchTime: string | null
  arrivalTime: string | null
  transportStartTime?: string | null
  completionTime: string | null
  returnTime: string | null
  departureOdo: number | null
  completionOdo: number | null
  returnOdo: number | null
  vehicleId: string | null
  vehicle: { plateNumber: string; displayName: string | null } | null
  deliveryType?: 'DIRECT' | 'STORAGE' | null
}

export interface SerializedReport {
  id: string | null
  departureOdo: number | null
  recoveryDistance: number | null
  transportDistance?: number | null
  returnDistance: number | null
  completionOdo: number | null
  returnOdo: number | null
  recoveryHighway: number | null
  transportHighway?: number | null
  returnHighway: number | null
  totalHighway: number | null
  departurePlaceName: string | null
  arrivalPlaceName: string | null
  transportPlaceName?: string | null
  transportShopName?: string | null
  transportPhone?: string | null
  transportAddress?: string | null
  transportContact?: string | null
  transportMemo?: string | null
  primaryCompletionItems: { doily: boolean; cleaning: boolean; protection: boolean } | null
  primaryCompletionNote: string | null
  secondaryCompletionItems: { reloading: boolean; dolly: boolean } | null
  secondaryCompletionNote: string | null
  primaryAmount: number | null
  secondaryAmount: number | null
  totalConfirmedAmount: number | null
  storageRequired: boolean | null
  billingContactMemo: string | null
  isDraft: boolean
}

interface Props {
  dispatch: SerializedDispatchForReport
  report: SerializedReport
  userName: string
}

type TimeField = 'dispatch' | 'arrival' | 'completion' | 'return'

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function formatTime(d: Date | null): string {
  if (!d) return '--:--'
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// -------------------------------------------------------
// Sub-components
// -------------------------------------------------------

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 text-xs text-white px-2.5 py-1 rounded font-bold active:opacity-70"
      style={{ backgroundColor: '#71A9F7' }}
    >
      修正
    </button>
  )
}

// -------------------------------------------------------
// Main Component
// -------------------------------------------------------

export default function ReportOnsiteClient({ dispatch, report, userName }: Props) {
  const router = useRouter()

  // ── 時間 ──
  const [dispatchTime, setDispatchTime] = useState<Date | null>(
    dispatch.dispatchTime ? new Date(dispatch.dispatchTime) : null
  )
  const [arrivalTime, setArrivalTime] = useState<Date | null>(
    dispatch.arrivalTime ? new Date(dispatch.arrivalTime) : null
  )
  const [completionTime, setCompletionTime] = useState<Date | null>(
    dispatch.completionTime ? new Date(dispatch.completionTime) : null
  )
  const [returnTime, setReturnTime] = useState<Date | null>(
    dispatch.returnTime ? new Date(dispatch.returnTime) : null
  )
  const [clockPickerFor, setClockPickerFor] = useState<TimeField | null>(null)

  // ── 距離・ODO ──
  const [departureOdo, setDepartureOdo] = useState(
    (report.departureOdo ?? dispatch.departureOdo)?.toString() ?? ''
  )
  const [recoveryDistance, setRecoveryDistance] = useState(
    report.recoveryDistance?.toString() ?? ''
  )
  const [returnDistance, setReturnDistance] = useState(
    report.returnDistance?.toString() ?? ''
  )
  const [completionOdo, setCompletionOdo] = useState(
    (report.completionOdo ?? dispatch.completionOdo)?.toString() ?? ''
  )
  const [returnOdo, setReturnOdo] = useState(
    (report.returnOdo ?? dispatch.returnOdo)?.toString() ?? ''
  )

  // ── 高速代 ──
  const [recoveryHighway, setRecoveryHighway] = useState(
    report.recoveryHighway?.toString() ?? ''
  )
  const [returnHighway, setReturnHighway] = useState(
    report.returnHighway?.toString() ?? ''
  )
  const totalHighway = useMemo(() => {
    const a = parseInt(recoveryHighway) || 0
    const b = parseInt(returnHighway) || 0
    return a + b
  }, [recoveryHighway, returnHighway])

  // ── インライン編集対象フィールド ──
  const [editingField, setEditingField] = useState<string | null>(null)

  // ── 出動場所 ──
  const [departurePlaceName, setDeparturePlaceName] = useState(report.departurePlaceName ?? '')
  const [arrivalPlaceName, setArrivalPlaceName] = useState(report.arrivalPlaceName ?? '')

  // ── 1次完了 ──
  const [completionItems, setCompletionItems] = useState({
    doily: report.primaryCompletionItems?.doily ?? false,
    cleaning: report.primaryCompletionItems?.cleaning ?? false,
    protection: report.primaryCompletionItems?.protection ?? false,
  })
  const [completionNote, setCompletionNote] = useState(report.primaryCompletionNote ?? '')

  // ── 1次金額 ──
  const [primaryAmount, setPrimaryAmount] = useState(
    report.primaryAmount?.toString() ?? ''
  )

  // ── 連絡事項 ──
  const [billingContactMemo, setBillingContactMemo] = useState(report.billingContactMemo ?? '')

  // ── 車両 ──
  const [vehicleId, setVehicleId] = useState<string | null>(dispatch.vehicleId ?? null)
  const [editingVehicle, setEditingVehicle] = useState(false)
  const { vehicles: allVehicles } = useVehicles()
  const currentVehicleLabel = (() => {
    if (!vehicleId) return '---'
    const v = allVehicles.find((x) => x.id === vehicleId)
    if (v) return formatCurrentVehicleLabel(v)
    if (dispatch.vehicle && dispatch.vehicleId === vehicleId) {
      return formatCurrentVehicleLabel(dispatch.vehicle)
    }
    return '---'
  })()

  const [loading, setLoading] = useState(false)

  // ── 必須バリデーション ──
  const isTimesComplete =
    dispatchTime !== null &&
    arrivalTime !== null &&
    completionTime !== null &&
    returnTime !== null
  const isDistancesComplete =
    departureOdo !== '' &&
    recoveryDistance !== '' &&
    returnDistance !== '' &&
    completionOdo !== '' &&
    returnOdo !== ''
  const isPlacesComplete =
    departurePlaceName.trim() !== '' && arrivalPlaceName.trim() !== ''
  const isComplete = isTimesComplete && isDistancesComplete && isPlacesComplete

  // ── ClockPicker 用 ──
  const timeMap: Record<TimeField, Date | null> = {
    dispatch: dispatchTime,
    arrival: arrivalTime,
    completion: completionTime,
    return: returnTime,
  }
  const setTimeMap: Record<TimeField, (d: Date) => void> = {
    dispatch: setDispatchTime,
    arrival: setArrivalTime,
    completion: setCompletionTime,
    return: setReturnTime,
  }

  const handleTimeChange = (field: TimeField, date: Date) => {
    setTimeMap[field](date)
    setClockPickerFor(null)
  }

  // ── 時間制約（前後の時刻で範囲を決定） ──
  const timeOrder: TimeField[] = ['dispatch', 'arrival', 'completion', 'return']
  const getTimeConstraints = (field: TimeField): { minTime: Date | null; maxTime: Date | null } => {
    const idx = timeOrder.indexOf(field)
    let minTime: Date | null = null
    let maxTime: Date | null = null
    for (let i = idx - 1; i >= 0; i--) {
      if (timeMap[timeOrder[i]]) { minTime = timeMap[timeOrder[i]]; break }
    }
    for (let i = idx + 1; i < timeOrder.length; i++) {
      if (timeMap[timeOrder[i]]) { maxTime = timeMap[timeOrder[i]]; break }
    }
    return { minTime, maxTime }
  }

  // ── ペイロード ──
  const buildDispatchPayload = (isDraft: boolean) => ({
    dispatchTime: dispatchTime?.toISOString() ?? null,
    arrivalTime: arrivalTime?.toISOString() ?? null,
    completionTime: completionTime?.toISOString() ?? null,
    returnTime: returnTime?.toISOString() ?? null,
    vehicleId: vehicleId,
    isDraft,
  })

  const buildReportPayload = (isDraft: boolean) => ({
    departureOdo: departureOdo ? parseInt(departureOdo) : null,
    recoveryDistance: recoveryDistance ? parseFloat(recoveryDistance) : null,
    returnDistance: returnDistance ? parseFloat(returnDistance) : null,
    completionOdo: completionOdo ? parseInt(completionOdo) : null,
    returnOdo: returnOdo ? parseInt(returnOdo) : null,
    recoveryHighway: recoveryHighway ? parseInt(recoveryHighway) : null,
    returnHighway: returnHighway ? parseInt(returnHighway) : null,
    totalHighway: totalHighway > 0 ? totalHighway : null,
    departurePlaceName: departurePlaceName || null,
    arrivalPlaceName: arrivalPlaceName || null,
    primaryCompletionItems: completionItems,
    primaryCompletionNote: completionNote || null,
    primaryAmount: primaryAmount ? parseInt(primaryAmount) : null,
    totalConfirmedAmount: primaryAmount ? parseInt(primaryAmount) : null,
    billingContactMemo: billingContactMemo || null,
    isDraft,
  })

  // ── フォーム自動保存（デバウンス1秒） ──
  const { saveFormData, clearDraft } = useFormAutoSave(`report-${dispatch.id}`)

  useEffect(() => {
    saveFormData({
      dispatch: buildDispatchPayload(true),
      report: buildReportPayload(true),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dispatchTime, arrivalTime, completionTime, returnTime,
    departureOdo, recoveryDistance, returnDistance, completionOdo, returnOdo,
    recoveryHighway, returnHighway, departurePlaceName, arrivalPlaceName,
    completionItems, completionNote, primaryAmount, billingContactMemo,
    vehicleId,
  ])

  // ── 保存処理 ──
  const handleSave = async (isDraft: boolean) => {
    if (!isDraft && !isComplete) return
    if (loading) return
    setLoading(true)
    try {
      const dispatchRes = await offlineFetch(`/api/dispatches/${dispatch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDispatchPayload(isDraft)),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: dispatch.id,
      })
      if (!dispatchRes.ok) throw new Error('出動情報の保存に失敗しました')

      const reportEndpoint = isDraft
        ? `/api/dispatches/${dispatch.id}/report`
        : `/api/dispatches/${dispatch.id}/report/complete`

      const reportRes = await offlineFetch(reportEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildReportPayload(isDraft)),
        offlineActionType: isDraft ? 'report_save' : 'report_complete',
        offlineDispatchId: dispatch.id,
      })
      if (!reportRes.ok) throw new Error('報告の保存に失敗しました')

      await clearDraft()
      // ルーターキャッシュをクリアして処理バーを確実に更新する
      window.location.href = '/'
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // ── Inline edit field component ──
  const InlineNumericField = ({
    fieldKey,
    value,
    setValue,
    suffix,
    decimal = false,
  }: {
    fieldKey: string
    value: string
    setValue: (v: string) => void
    suffix: string
    decimal?: boolean
  }) => {
    const isEditing = editingField === fieldKey
    return isEditing ? (
      <input
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="text-sm font-bold flex-1 border-b-2 outline-none px-1 py-0.5 min-w-0"
        style={{ borderColor: '#71A9F7', color: '#1C2948' }}
        autoFocus
        onBlur={() => setEditingField(null)}
        onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
      />
    ) : (
      <span className="text-sm font-bold flex-1" style={{ color: '#1C2948' }}>
        {value ? `${value}${suffix}` : '--'}
      </span>
    )
  }

  // ── Render ──
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#E5E5E5' }}>

      {/* ─── ヘッダー ─── */}
      <div className="px-4 pt-4 pb-3 shadow-sm flex-shrink-0" style={{ backgroundColor: '#D7AF70' }}>
        {/* タイトル行 */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rodo-square-logo.svg" alt="RODO" className="w-8 h-8" />
            <span className="text-lg font-bold" style={{ color: '#1C2948' }}>
              報告兼請求項目
            </span>
          </div>
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: '#2FBF71', color: 'white' }}
          >
            現場対応
          </span>
        </div>

        {/* 出動番号 */}
        <div className="text-sm mb-1" style={{ color: '#1C2948' }}>
          <span className="opacity-60">出動番号</span>
          <span className="font-bold ml-3">{dispatch.dispatchNumber}</span>
        </div>

        {/* 出動者名 + 車両 */}
        <div className="flex items-center gap-4 text-sm" style={{ color: '#1C2948' }}>
          <div>
            <span className="opacity-60">出動者名</span>
            <span className="font-bold ml-2">{userName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-60">車両</span>
            {editingVehicle ? (
              <div className="flex items-center gap-1">
                <VehicleSelector
                  value={vehicleId}
                  onChange={setVehicleId}
                  vehicles={allVehicles}
                  className="border rounded px-2 py-0.5 text-sm font-bold"
                  style={{ borderColor: 'rgba(28,41,72,0.3)', color: '#1C2948', backgroundColor: 'rgba(255,255,255,0.5)' }}
                />
                <button onClick={() => setEditingVehicle(false)}>
                  <Check className="w-4 h-4" style={{ color: '#2FBF71' }} />
                </button>
              </div>
            ) : (
              <>
                <span className="font-bold">{currentVehicleLabel}</span>
                <button
                  onClick={() => setEditingVehicle(true)}
                  className="text-xs text-white px-2 py-0.5 rounded font-bold active:opacity-70"
                  style={{ backgroundColor: '#71A9F7' }}
                >
                  修正
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── スクロールコンテンツ ─── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 pb-44 space-y-3">

        {/* ── 時間セクション ── */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex gap-3">
            {/* 左カラム: 赤丸 + 縦線 + 時計アイコン */}
            <div className="flex flex-col items-center flex-shrink-0" style={{ width: 36 }}>
              <span
                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: '#D3170A' }}
              />
              <div className="w-px flex-1 my-2" style={{ backgroundColor: '#D1D5DB' }} />
              <div
                className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: '#F3F4F6' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/time.svg" alt="time" className="w-5 h-5" />
              </div>
            </div>

            {/* 右カラム: 時間行 */}
            <div className="flex-1 space-y-3 pt-0.5">
              {(
                [
                  { label: '出動時間', field: 'dispatch' as TimeField, value: dispatchTime },
                  { label: '現着時間', field: 'arrival' as TimeField, value: arrivalTime },
                  { label: '完了時間', field: 'completion' as TimeField, value: completionTime },
                  { label: '帰社時間', field: 'return' as TimeField, value: returnTime },
                ] as const
              ).map(({ label, field, value }) => (
                <div key={field} className="flex items-center gap-2">
                  <span
                    className="text-sm flex-shrink-0 w-[72px]"
                    style={{ color: '#1C2948', opacity: 0.65 }}
                  >
                    {label}
                  </span>
                  <span className="text-sm font-bold flex-1" style={{ color: '#1C2948' }}>
                    {formatTime(value)}
                  </span>
                  <EditButton onClick={() => setClockPickerFor(field)} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 距離セクション ── */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex gap-3">
            {/* 左カラム: 赤丸 + 縦線 + 距離アイコン */}
            <div className="flex flex-col items-center flex-shrink-0" style={{ width: 36 }}>
              <span
                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: '#D3170A' }}
              />
              <div className="w-px flex-1 my-2" style={{ backgroundColor: '#D1D5DB' }} />
              <div
                className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: '#F3F4F6' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/distance.svg" alt="distance" className="w-5 h-5" />
              </div>
            </div>

            {/* 右カラム: 距離行 */}
            <div className="flex-1 space-y-3 pt-0.5">
              {[
                {
                  label: '出発 ODO',
                  key: 'departureOdo',
                  value: departureOdo,
                  setValue: setDepartureOdo,
                  suffix: 'km',
                  decimal: false,
                },
                {
                  label: '回送距離',
                  key: 'recoveryDistance',
                  value: recoveryDistance,
                  setValue: setRecoveryDistance,
                  suffix: 'km',
                  decimal: true,
                },
                {
                  label: '完了 ODO',
                  key: 'completionOdo',
                  value: completionOdo,
                  setValue: setCompletionOdo,
                  suffix: 'km',
                  decimal: false,
                },
                {
                  label: '帰社距離',
                  key: 'returnDistance',
                  value: returnDistance,
                  setValue: setReturnDistance,
                  suffix: 'km',
                  decimal: true,
                },
                {
                  label: '帰社 ODO',
                  key: 'returnOdo',
                  value: returnOdo,
                  setValue: setReturnOdo,
                  suffix: 'km',
                  decimal: false,
                },
              ].map(({ label, key, value, setValue, suffix, decimal }) => (
                <div key={key} className="flex items-center gap-2">
                  <span
                    className="text-sm flex-shrink-0 w-[72px]"
                    style={{ color: '#1C2948', opacity: 0.65 }}
                  >
                    {label}
                  </span>
                  <InlineNumericField
                    fieldKey={key}
                    value={value}
                    setValue={setValue}
                    suffix={suffix}
                    decimal={decimal}
                  />
                  <EditButton onClick={() => setEditingField(editingField === key ? null : key)} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 高速代セクション ── */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex gap-3">
            {/* ETCアイコン */}
            <div className="flex flex-col items-center justify-center flex-shrink-0" style={{ width: 36 }}>
              <div
                className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: '#F3F4F6' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/etc.svg" alt="ETC" className="w-6 h-6 brightness-0 opacity-40" />
              </div>
            </div>

            {/* 高速代行 */}
            <div className="flex-1 space-y-3 pt-0.5">
              {[
                {
                  label: '回送高速',
                  key: 'recoveryHighway',
                  value: recoveryHighway,
                  setValue: setRecoveryHighway,
                },
                {
                  label: '帰社高速',
                  key: 'returnHighway',
                  value: returnHighway,
                  setValue: setReturnHighway,
                },
              ].map(({ label, key, value, setValue }) => (
                <div key={key} className="flex items-center gap-2">
                  <span
                    className="text-sm flex-shrink-0 w-[72px]"
                    style={{ color: '#1C2948', opacity: 0.65 }}
                  >
                    {label}
                  </span>
                  <InlineNumericField
                    fieldKey={key}
                    value={value}
                    setValue={setValue}
                    suffix=" 円"
                  />
                  <EditButton onClick={() => setEditingField(editingField === key ? null : key)} />
                </div>
              ))}

              {/* 合計（自動計算） */}
              <div className="flex items-center gap-2">
                <span
                  className="text-sm flex-shrink-0 w-[72px]"
                  style={{ color: '#1C2948', opacity: 0.65 }}
                >
                  合計金額
                </span>
                <span className="text-sm font-bold flex-1" style={{ color: '#1C2948' }}>
                  {totalHighway > 0 ? `${totalHighway} 円` : '--'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 出動場所 ── */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-3.5 h-3.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: '#D3170A' }}
            />
            <span className="text-sm font-bold" style={{ color: '#1C2948' }}>
              出動場所
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={departurePlaceName}
              onChange={(e) => setDeparturePlaceName(e.target.value)}
              placeholder="出発地"
              className="flex-1 min-w-0 border-2 rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: departurePlaceName.trim() !== '' ? '#C6D8FF' : '#D3170A', color: '#1C2948' }}
            />
            <FaCircleArrowRight
              className="flex-shrink-0 text-xl"
              style={{ color: '#888888' }}
            />
            <input
              type="text"
              value={arrivalPlaceName}
              onChange={(e) => setArrivalPlaceName(e.target.value)}
              placeholder="現場"
              className="flex-1 min-w-0 border-2 rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: arrivalPlaceName.trim() !== '' ? '#C6D8FF' : '#D3170A', color: '#1C2948' }}
            />
          </div>
        </div>

        {/* 区切り線 */}
        <div className="border-t-2 border-white/60 mx-1" />

        {/* ── 1次完了・協定金額 ── */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <p className="text-sm font-bold" style={{ color: '#1C2948' }}>
            1次完了・協定金額
          </p>
          <div className="flex items-center gap-5">
            {(
              [
                { key: 'doily', label: 'ドーリー' },
                { key: 'cleaning', label: '現場清掃' },
                { key: 'protection', label: '養生' },
              ] as const
            ).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={completionItems[key]}
                  onChange={(e) =>
                    setCompletionItems((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  className="w-4 h-4 accent-current rounded"
                  style={{ accentColor: '#1C2948' }}
                />
                <span className="text-sm" style={{ color: '#1C2948' }}>
                  {label}
                </span>
              </label>
            ))}
          </div>
          <input
            type="text"
            value={completionNote}
            onChange={(e) => setCompletionNote(e.target.value)}
            placeholder="メモ"
            className="w-full border-2 rounded-lg px-3 py-2 text-sm"
            style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
          />
        </div>

        {/* ── 1次金額 ── */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold flex-shrink-0" style={{ color: '#1C2948' }}>
              1次金額
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={primaryAmount}
              onChange={(e) => setPrimaryAmount(e.target.value)}
              placeholder="0"
              className="flex-1 border-2 rounded-lg px-3 py-2 text-sm text-right"
              style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
            />
            <span className="text-sm flex-shrink-0" style={{ color: '#1C2948' }}>
              円
            </span>
          </div>
        </div>

        {/* ── 請求合計確定金額 ── */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold" style={{ color: '#1C2948' }}>
              請求合計確定金額
            </span>
            <div className="flex items-center gap-1">
              <span className="text-base font-bold" style={{ color: '#1C2948' }}>
                {primaryAmount || ''}
              </span>
              <span className="text-sm" style={{ color: '#1C2948' }}>
                円
              </span>
            </div>
          </div>
        </div>

        {/* ── 請求担当者への連絡事項 ── */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm font-bold mb-2" style={{ color: '#1C2948' }}>
            請求担当者への連絡事項
          </p>
          <textarea
            value={billingContactMemo}
            onChange={(e) => setBillingContactMemo(e.target.value)}
            rows={4}
            className="w-full border-2 rounded-lg px-3 py-2.5 text-sm resize-none"
            style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
          />
        </div>
      </div>

      {/* ─── 下部ボタン（固定） ─── */}
      <div
        className="fixed bottom-0 left-0 right-0 px-3 py-3 space-y-2"
        style={{ backgroundColor: '#E5E5E5' }}
      >
        {/* Row 1: 下書き保存 + 完了 */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={loading}
            className="flex-none flex items-center gap-2 px-5 py-3.5 rounded-lg font-bold text-white text-sm active:opacity-80 transition-opacity"
            style={{ backgroundColor: '#D3170A' }}
          >
            <FaPen />
            <span>下書き保存</span>
          </button>

          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={!isComplete || loading}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-lg font-bold text-sm transition-all active:opacity-80"
            style={{
              backgroundColor: isComplete ? '#1C2948' : '#9CA3AF',
              color: isComplete ? '#D7AF70' : 'white',
              cursor: isComplete ? 'pointer' : 'not-allowed',
            }}
          >
            <FaCheckSquare className="text-base" />
            <span>完　了</span>
          </button>
        </div>

        {/* Row 2: 出動記録へ */}
        <button
          type="button"
          onClick={() => router.push(`/dispatch/${dispatch.id}/record`)}
          className="w-full flex items-center gap-2 px-4 py-3 rounded-lg font-bold text-white text-sm active:opacity-80"
          style={{ backgroundColor: '#1C2948' }}
        >
          <IoIosArrowDropleftCircle className="text-lg" />
          <span>出動記録へ</span>
        </button>
      </div>

      {/* ─── ClockPicker モーダル ─── */}
      {clockPickerFor && (() => {
        const { minTime, maxTime } = getTimeConstraints(clockPickerFor)
        return (
          <ClockPicker
            value={timeMap[clockPickerFor] ?? new Date()}
            onChange={(date) => handleTimeChange(clockPickerFor, date)}
            onClose={() => setClockPickerFor(null)}
            minTime={minTime}
            maxTime={maxTime}
          />
        )
      })()}
    </div>
  )
}
