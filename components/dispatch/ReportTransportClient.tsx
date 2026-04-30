'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FaPen, FaCheckSquare } from 'react-icons/fa'
import { FaCircleArrowRight } from 'react-icons/fa6'
import { IoIosArrowBack } from 'react-icons/io'
import { Check } from 'lucide-react'
import ClockPicker from './ClockPicker'
import TransportShopAutocomplete from './TransportShopAutocomplete'
import VehicleSelector from './VehicleSelector'
import { offlineFetch } from '@/lib/offline-fetch'
import { useFormAutoSave } from '@/hooks/useFormAutoSave'
import { useVehicles } from '@/hooks/useVehicles'
import { formatCurrentVehicleLabel } from '@/lib/vehicle-label'
import type { SerializedDispatchForReport, SerializedReport } from './ReportOnsiteClient'

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface SecondaryData {
  dispatch: {
    id: string
    dispatchTime: string | null
    arrivalTime: string | null
    completionTime: string | null
    returnTime: string | null
    departureOdo: number | null
    arrivalOdo: number | null
    completionOdo: number | null
    returnOdo: number | null
    userName: string
    vehicleId: string | null
    vehicle: { plateNumber: string; displayName: string | null } | null
  }
  report: {
    recoveryDistance: number | null
    transportDistance: number | null
    returnDistance: number | null
    departureOdo: number | null
    arrivalOdo: number | null
    completionOdo: number | null
    returnOdo: number | null
    transportHighway: number | null
    returnHighway: number | null
  } | null
}

interface Props {
  dispatch: SerializedDispatchForReport
  report: SerializedReport
  userName: string
  secondaryData?: SecondaryData | null
}

type TimeField = 'dispatch' | 'arrival' | 'transportStart' | 'completion' | 'return'

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

function RequiredDot() {
  return <span className="w-2 h-2 rounded-full flex-shrink-0 inline-block" style={{ backgroundColor: '#D3170A' }} />
}

// -------------------------------------------------------
// Main Component
// -------------------------------------------------------

export default function ReportTransportClient({ dispatch, report, userName, secondaryData }: Props) {
  const router = useRouter()

  // ── 時間 ──
  const [dispatchTime, setDispatchTime] = useState<Date | null>(
    dispatch.dispatchTime ? new Date(dispatch.dispatchTime) : null
  )
  const [arrivalTime, setArrivalTime] = useState<Date | null>(
    dispatch.arrivalTime ? new Date(dispatch.arrivalTime) : null
  )
  const [transportStartTime, setTransportStartTime] = useState<Date | null>(
    dispatch.transportStartTime ? new Date(dispatch.transportStartTime) : null
  )
  const [completionTime, setCompletionTime] = useState<Date | null>(
    dispatch.completionTime ? new Date(dispatch.completionTime) : null
  )
  const [returnTime, setReturnTime] = useState<Date | null>(
    dispatch.returnTime ? new Date(dispatch.returnTime) : null
  )
  const [clockPickerFor, setClockPickerFor] = useState<TimeField | null>(null)

  // ── 保管（2次搬送）判定 ──
  const isStored = dispatch.deliveryType === 'STORAGE'

  // ── 2次搬送 時間 ──
  const [secondaryTransportStartTime, setSecondaryTransportStartTime] = useState<Date | null>(
    secondaryData?.dispatch.dispatchTime ? new Date(secondaryData.dispatch.dispatchTime) : null
  )
  const [secondaryArrivalTime, setSecondaryArrivalTime] = useState<Date | null>(
    secondaryData?.dispatch.arrivalTime ? new Date(secondaryData.dispatch.arrivalTime) : null
  )
  const [secondaryCompletionTime, setSecondaryCompletionTime] = useState<Date | null>(
    secondaryData?.dispatch.completionTime ? new Date(secondaryData.dispatch.completionTime) : null
  )
  const [secondaryReturnTime, setSecondaryReturnTime] = useState<Date | null>(
    secondaryData?.dispatch.returnTime ? new Date(secondaryData.dispatch.returnTime) : null
  )

  // ── 距離・ODO ──
  const [departureOdo, setDepartureOdo] = useState(
    (report.departureOdo ?? dispatch.departureOdo)?.toString() ?? ''
  )
  const [recoveryDistance, setRecoveryDistance] = useState(
    report.recoveryDistance?.toString() ?? ''
  )
  const [transportDistance, setTransportDistance] = useState(
    report.transportDistance?.toString() ?? ''
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

  // ── 2次距離・ODO ──
  const [secondaryDepartureOdo, setSecondaryDepartureOdo] = useState(
    (secondaryData?.report?.departureOdo ?? secondaryData?.dispatch.departureOdo)?.toString() ?? ''
  )
  const [secondaryArrivalOdo, setSecondaryArrivalOdo] = useState(
    (secondaryData?.report?.arrivalOdo ?? secondaryData?.dispatch.arrivalOdo)?.toString() ?? ''
  )
  const [secondaryTransportDistance, setSecondaryTransportDistance] = useState(
    secondaryData?.report?.transportDistance?.toString() ?? ''
  )
  const [secondaryReturnDistance, setSecondaryReturnDistance] = useState(
    secondaryData?.report?.returnDistance?.toString() ?? ''
  )
  const [secondaryCompletionOdo, setSecondaryCompletionOdo] = useState(
    (secondaryData?.report?.completionOdo ?? secondaryData?.dispatch.completionOdo)?.toString() ?? ''
  )
  const [secondaryReturnOdo, setSecondaryReturnOdo] = useState(
    (secondaryData?.report?.returnOdo ?? secondaryData?.dispatch.returnOdo)?.toString() ?? ''
  )

  // ── 高速代 ──
  const [recoveryHighway, setRecoveryHighway] = useState(
    report.recoveryHighway?.toString() ?? ''
  )
  const [transportHighway, setTransportHighway] = useState(
    report.transportHighway?.toString() ?? ''
  )
  const [returnHighway, setReturnHighway] = useState(
    report.returnHighway?.toString() ?? ''
  )

  // ── 2次高���代 ──
  const [secondaryTransportHighway, setSecondaryTransportHighway] = useState(
    secondaryData?.report?.transportHighway?.toString() ?? ''
  )
  const [secondaryReturnHighway, setSecondaryReturnHighway] = useState(
    secondaryData?.report?.returnHighway?.toString() ?? ''
  )

  const totalHighway = useMemo(() => {
    const a = parseInt(recoveryHighway) || 0
    const b = parseInt(transportHighway) || 0
    const c = parseInt(returnHighway) || 0
    const d = isStored ? (parseInt(secondaryTransportHighway) || 0) : 0
    const e = isStored ? (parseInt(secondaryReturnHighway) || 0) : 0
    return a + b + c + d + e
  }, [recoveryHighway, transportHighway, returnHighway, secondaryTransportHighway, secondaryReturnHighway, isStored])

  // ── インライン編集 ──
  const [editingField, setEditingField] = useState<string | null>(null)

  // ── 出動場所 ──
  const [departurePlaceName, setDeparturePlaceName] = useState(report.departurePlaceName ?? '')
  const [arrivalPlaceName, setArrivalPlaceName] = useState(report.arrivalPlaceName ?? '')
  const [transportPlaceName, setTransportPlaceName] = useState(report.transportPlaceName ?? '')

  // ── 搬送先情報 ──
  const [transportShopName, setTransportShopName] = useState(report.transportShopName ?? '')
  const [transportPhone, setTransportPhone] = useState(report.transportPhone ?? '')
  const [transportAddress, setTransportAddress] = useState(report.transportAddress ?? '')
  const [transportContact, setTransportContact] = useState(report.transportContact ?? '')
  const [transportMemo, setTransportMemo] = useState(report.transportMemo ?? '')

  // ── 1次完了 ──
  const [completionItems, setCompletionItems] = useState({
    doily: report.primaryCompletionItems?.doily ?? false,
    cleaning: report.primaryCompletionItems?.cleaning ?? false,
    protection: report.primaryCompletionItems?.protection ?? false,
  })
  const [completionNote, setCompletionNote] = useState(report.primaryCompletionNote ?? '')

  // ── 2次完了 ──
  const [secondaryCompletionItems, setSecondaryCompletionItems] = useState({
    reloading: report.secondaryCompletionItems?.reloading ?? false,
    dolly: report.secondaryCompletionItems?.dolly ?? false,
  })
  const [secondaryCompletionNote, setSecondaryCompletionNote] = useState(report.secondaryCompletionNote ?? '')
  const [storageRequired, setStorageRequired] = useState<boolean | null>(report.storageRequired ?? null)

  // ── 金額 ──
  const [primaryAmount, setPrimaryAmount] = useState(
    report.primaryAmount?.toString() ?? ''
  )
  const [secondaryAmount, setSecondaryAmount] = useState(
    report.secondaryAmount?.toString() ?? ''
  )
  // ── 連絡事項 ──
  const [billingContactMemo, setBillingContactMemo] = useState(report.billingContactMemo ?? '')

  // ── 車両 ──
  const [vehicleId, setVehicleId] = useState<string | null>(dispatch.vehicleId ?? null)
  const [editingVehicle, setEditingVehicle] = useState(false)

  // ── 2次車両（未設定なら1次の車両を初期値にする） ──
  const [secondaryVehicleId, setSecondaryVehicleId] = useState<string | null>(
    secondaryData?.dispatch.vehicleId ?? dispatch.vehicleId ?? null
  )
  const [editingSecondaryVehicle, setEditingSecondaryVehicle] = useState(false)

  // ── 車両一覧と表示ラベル ──
  const { vehicles: allVehicles } = useVehicles()
  const buildVehicleLabel = (
    id: string | null,
    fallback: { plateNumber: string; displayName: string | null } | null | undefined,
    fallbackId: string | null | undefined,
  ): string => {
    if (!id) return '---'
    const v = allVehicles.find((x) => x.id === id)
    if (v) return formatCurrentVehicleLabel(v)
    if (fallback && fallbackId === id) return formatCurrentVehicleLabel(fallback)
    return '---'
  }
  const primaryVehicleLabel = buildVehicleLabel(vehicleId, dispatch.vehicle, dispatch.vehicleId)
  const secondaryVehicleLabel = buildVehicleLabel(
    secondaryVehicleId,
    secondaryData?.dispatch.vehicle ?? dispatch.vehicle,
    secondaryData?.dispatch.vehicleId ?? dispatch.vehicleId,
  )

  const [loading, setLoading] = useState(false)

  // ── 必須バリデーション ──
  const isTimesComplete = isStored
    ? (dispatchTime !== null && arrivalTime !== null && transportStartTime !== null && completionTime !== null)
    : (dispatchTime !== null && arrivalTime !== null && transportStartTime !== null && completionTime !== null && returnTime !== null)
  const isDistancesComplete =
    departureOdo !== '' &&
    recoveryDistance !== '' &&
    transportDistance !== '' &&
    returnDistance !== '' &&
    completionOdo !== '' &&
    returnOdo !== ''
  const isPlacesComplete =
    departurePlaceName.trim() !== '' &&
    arrivalPlaceName.trim() !== '' &&
    transportPlaceName.trim() !== ''
  const isTransportInfoComplete =
    transportShopName.trim() !== '' &&
    transportPhone.trim() !== '' &&
    transportAddress.trim() !== ''
  const isComplete = isTimesComplete && isDistancesComplete && isPlacesComplete && isTransportInfoComplete

  // ── ClockPicker 用 ──
  const timeMap: Record<TimeField, Date | null> = {
    dispatch: dispatchTime,
    arrival: arrivalTime,
    transportStart: transportStartTime,
    completion: completionTime,
    return: returnTime,
  }
  const setTimeMap: Record<TimeField, (d: Date) => void> = {
    dispatch: setDispatchTime,
    arrival: setArrivalTime,
    transportStart: setTransportStartTime,
    completion: setCompletionTime,
    return: setReturnTime,
  }

  const handleTimeChange = (field: TimeField, date: Date) => {
    setTimeMap[field](date)
    setClockPickerFor(null)
  }

  // ── 時間制約（前後の時刻で範囲を決定） ──
  const timeOrder: TimeField[] = ['dispatch', 'arrival', 'transportStart', 'completion', 'return']
  const getTimeConstraints = (field: TimeField): { minTime: Date | null; maxTime: Date | null } => {
    const idx = timeOrder.indexOf(field)
    let minTime: Date | null = null
    let maxTime: Date | null = null
    // 前方向: 直前の設定済み時刻
    for (let i = idx - 1; i >= 0; i--) {
      if (timeMap[timeOrder[i]]) { minTime = timeMap[timeOrder[i]]; break }
    }
    // 後方向: 直後の設定済み時刻
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
    transportDistance: transportDistance ? parseFloat(transportDistance) : null,
    returnDistance: returnDistance ? parseFloat(returnDistance) : null,
    completionOdo: completionOdo ? parseInt(completionOdo) : null,
    returnOdo: returnOdo ? parseInt(returnOdo) : null,
    recoveryHighway: recoveryHighway ? parseInt(recoveryHighway) : null,
    transportHighway: transportHighway ? parseInt(transportHighway) : null,
    returnHighway: returnHighway ? parseInt(returnHighway) : null,
    totalHighway: totalHighway > 0 ? totalHighway : null,
    departurePlaceName: departurePlaceName || null,
    arrivalPlaceName: arrivalPlaceName || null,
    transportPlaceName: transportPlaceName || null,
    transportShopName: transportShopName || null,
    transportPhone: transportPhone || null,
    transportAddress: transportAddress || null,
    transportContact: transportContact || null,
    transportMemo: transportMemo || null,
    primaryCompletionItems: completionItems,
    primaryCompletionNote: completionNote || null,
    secondaryCompletionItems: isStored ? secondaryCompletionItems : null,
    secondaryCompletionNote: isStored ? (secondaryCompletionNote || null) : null,
    storageRequired: isStored ? storageRequired : null,
    primaryAmount: primaryAmount ? parseInt(primaryAmount) : null,
    secondaryAmount: secondaryAmount ? parseInt(secondaryAmount) : null,
    totalConfirmedAmount: (() => {
      const p = parseInt(primaryAmount) || 0
      const s = parseInt(secondaryAmount) || 0
      const total = p + s
      return total > 0 ? total : null
    })(),
    billingContactMemo: billingContactMemo || null,
    isDraft,
  })

  // ── フォーム自動保存（デバウンス1秒） ──
  const { saveFormData, clearDraft } = useFormAutoSave(`report-transport-${dispatch.id}`)

  useEffect(() => {
    saveFormData({
      dispatch: buildDispatchPayload(true),
      report: buildReportPayload(true),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dispatchTime, arrivalTime, transportStartTime, completionTime, returnTime,
    departureOdo, recoveryDistance, transportDistance, returnDistance, completionOdo, returnOdo,
    recoveryHighway, transportHighway, returnHighway,
    secondaryTransportStartTime, secondaryArrivalTime, secondaryCompletionTime, secondaryReturnTime,
    secondaryDepartureOdo, secondaryArrivalOdo, secondaryTransportDistance, secondaryReturnDistance, secondaryCompletionOdo, secondaryReturnOdo,
    secondaryTransportHighway, secondaryReturnHighway,
    departurePlaceName, arrivalPlaceName, transportPlaceName,
    transportShopName, transportPhone, transportAddress, transportContact, transportMemo,
    completionItems, completionNote, secondaryCompletionItems, secondaryCompletionNote,
    storageRequired, primaryAmount, secondaryAmount, billingContactMemo, vehicleId,
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

      // 2次搬送の車両を保存
      if (secondaryData) {
        await offlineFetch(`/api/dispatches/${secondaryData.dispatch.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId: secondaryVehicleId }),
          offlineActionType: 'dispatch_update',
          offlineDispatchId: secondaryData.dispatch.id,
        })
      }

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
            className="text-sm font-bold px-3 py-1 rounded-full"
            style={{ backgroundColor: '#1C2948', color: 'white' }}
          >
            搬送
          </span>
        </div>

        {/* 出動番号 */}
        <div className="text-sm mb-2" style={{ color: '#1C2948' }}>
          <span className="opacity-60">出動番号</span>
          <span className="font-bold ml-3">{dispatch.dispatchNumber}</span>
        </div>

        {/* 1次出動者 + 車両 */}
        <div className="flex items-center gap-4 text-sm" style={{ color: '#1C2948' }}>
          <div>
            <span className="opacity-60">{isStored ? '1次出動者' : '出動者名'}</span>
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
                <span className="font-bold">{primaryVehicleLabel}</span>
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

        {/* 2次出動者 + 車両（保管時のみ）*/}
        {isStored && secondaryData && (
          <div className="flex items-center gap-4 text-sm mt-2" style={{ color: '#1C2948' }}>
            <div>
              <span className="opacity-60">2次出動者</span>
              <span className="font-bold ml-2">{secondaryData.dispatch.userName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="opacity-60">車両</span>
              {editingSecondaryVehicle ? (
                <div className="flex items-center gap-1">
                  <VehicleSelector
                    value={secondaryVehicleId}
                    onChange={setSecondaryVehicleId}
                    vehicles={allVehicles}
                    className="border rounded px-2 py-0.5 text-sm font-bold"
                    style={{ borderColor: 'rgba(28,41,72,0.3)', color: '#1C2948', backgroundColor: 'rgba(255,255,255,0.5)' }}
                  />
                  <button onClick={() => setEditingSecondaryVehicle(false)}>
                    <Check className="w-4 h-4" style={{ color: '#2FBF71' }} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="font-bold">{secondaryVehicleLabel}</span>
                  <button
                    onClick={() => setEditingSecondaryVehicle(true)}
                    className="text-xs text-white px-2 py-0.5 rounded font-bold active:opacity-70"
                    style={{ backgroundColor: '#71A9F7' }}
                  >
                    修正
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── スクロールコンテンツ ─── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 pb-44 space-y-3">

        {/* ── 時間セクション ── */}
        {isStored ? (
          <>
            {/* 1次 時間 */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-xs font-bold mb-3 px-1" style={{ color: '#71A9F7' }}>1次</p>
              <div className="flex gap-3">
                <div className="flex flex-col items-center flex-shrink-0" style={{ width: 36 }}>
                  <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#D3170A' }} />
                  <div className="w-px flex-1 my-2" style={{ backgroundColor: '#D1D5DB' }} />
                  <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/time.svg" alt="time" className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex-1 space-y-3 pt-0.5">
                  {[
                    { label: '出動時間', field: 'dispatch' as TimeField, value: dispatchTime },
                    { label: '現着時間', field: 'arrival' as TimeField, value: arrivalTime },
                    { label: '搬送開始', field: 'transportStart' as TimeField, value: transportStartTime },
                    { label: '完了時間', field: 'completion' as TimeField, value: completionTime },
                    { label: '帰社時間', field: 'return' as TimeField, value: returnTime },
                  ].map(({ label, field, value }, i) => (
                    <div key={`primary-time-${i}`} className="flex items-center gap-2">
                      <RequiredDot />
                      <span className="text-sm flex-shrink-0 w-[72px]" style={{ color: '#1C2948', opacity: 0.65 }}>
                        {label}
                      </span>
                      <span className="text-sm font-bold flex-1" style={{ color: '#1C2948' }}>
                        {formatTime(value)}
                      </span>
                      {field && <EditButton onClick={() => setClockPickerFor(field)} />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* 2次 時間 */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-xs font-bold mb-3 px-1" style={{ color: '#71A9F7' }}>2次</p>
              <div className="flex gap-3">
                <div className="flex flex-col items-center flex-shrink-0" style={{ width: 36 }}>
                  <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#D3170A' }} />
                  <div className="w-px flex-1 my-2" style={{ backgroundColor: '#D1D5DB' }} />
                  <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/time.svg" alt="time" className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex-1 space-y-3 pt-0.5">
                  {[
                    { label: '搬送開始', value: secondaryTransportStartTime, setter: setSecondaryTransportStartTime },
                    { label: '現着時間', value: secondaryArrivalTime, setter: setSecondaryArrivalTime },
                    { label: '完了時間', value: secondaryCompletionTime, setter: setSecondaryCompletionTime },
                    { label: '帰社時間', value: secondaryReturnTime, setter: setSecondaryReturnTime },
                  ].map(({ label, value }, i) => (
                    <div key={`secondary-time-${i}`} className="flex items-center gap-2">
                      <RequiredDot />
                      <span className="text-sm flex-shrink-0 w-[72px]" style={{ color: '#1C2948', opacity: 0.65 }}>
                        {label}
                      </span>
                      <span className="text-sm font-bold flex-1" style={{ color: '#1C2948' }}>
                        {formatTime(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex gap-3">
              <div className="flex flex-col items-center flex-shrink-0" style={{ width: 36 }}>
                <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#D3170A' }} />
                <div className="w-px flex-1 my-2" style={{ backgroundColor: '#D1D5DB' }} />
                <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/time.svg" alt="time" className="w-5 h-5" />
                </div>
              </div>
              <div className="flex-1 space-y-3 pt-0.5">
                {(
                  [
                    { label: '出動時間', field: 'dispatch' as TimeField, value: dispatchTime },
                    { label: '現着時間', field: 'arrival' as TimeField, value: arrivalTime },
                    { label: '搬送開始', field: 'transportStart' as TimeField, value: transportStartTime },
                    { label: '完了時間', field: 'completion' as TimeField, value: completionTime },
                    { label: '帰社時間', field: 'return' as TimeField, value: returnTime },
                  ] as const
                ).map(({ label, field, value }) => (
                  <div key={field} className="flex items-center gap-2">
                    <RequiredDot />
                    <span className="text-sm flex-shrink-0 w-[72px]" style={{ color: '#1C2948', opacity: 0.65 }}>
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
        )}

        {/* ── 距離セクション ── */}
        {isStored ? (
          <>
            {/* 1次 距離 */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-xs font-bold mb-3 px-1" style={{ color: '#71A9F7' }}>1次</p>
              <div className="flex gap-3">
                <div className="flex flex-col items-center flex-shrink-0" style={{ width: 36 }}>
                  <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#D3170A' }} />
                  <div className="w-px flex-1 my-2" style={{ backgroundColor: '#D1D5DB' }} />
                  <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/distance.svg" alt="distance" className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex-1 space-y-3 pt-0.5">
                  {[
                    { label: '出発 ODO', key: 'departureOdo', value: departureOdo, setValue: setDepartureOdo, suffix: 'km', decimal: false },
                    { label: '回送距離', key: 'recoveryDistance', value: recoveryDistance, setValue: setRecoveryDistance, suffix: 'km', decimal: true },
                    { label: '搬送距離', key: 'transportDistance', value: transportDistance, setValue: setTransportDistance, suffix: 'km', decimal: true },
                    { label: '完了 ODO', key: 'completionOdo', value: completionOdo, setValue: setCompletionOdo, suffix: 'km', decimal: false },
                    { label: '帰社距離', key: 'returnDistance', value: returnDistance, setValue: setReturnDistance, suffix: 'km', decimal: true },
                    { label: '帰社 ODO', key: 'returnOdo', value: returnOdo, setValue: setReturnOdo, suffix: 'km', decimal: false },
                  ].map(({ label, key, value, setValue, suffix, decimal }) => (
                    <div key={key} className="flex items-center gap-2">
                      <RequiredDot />
                      <span className="text-sm flex-shrink-0 w-[72px]" style={{ color: '#1C2948', opacity: 0.65 }}>
                        {label}
                      </span>
                      <InlineNumericField fieldKey={key} value={value} setValue={setValue} suffix={suffix} decimal={decimal} />
                      <EditButton onClick={() => setEditingField(editingField === key ? null : key)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* 2次 距離 */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-xs font-bold mb-3 px-1" style={{ color: '#71A9F7' }}>2次</p>
              <div className="flex gap-3">
                <div className="flex flex-col items-center flex-shrink-0" style={{ width: 36 }}>
                  <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#D3170A' }} />
                  <div className="w-px flex-1 my-2" style={{ backgroundColor: '#D1D5DB' }} />
                  <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/distance.svg" alt="distance" className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex-1 space-y-3 pt-0.5">
                  {[
                    { label: '搬開 ODO', key: 'sec_departureOdo', value: secondaryDepartureOdo, setValue: setSecondaryDepartureOdo, suffix: 'km', decimal: false },
                    { label: '搬送距離', key: 'sec_transportDistance', value: secondaryTransportDistance, setValue: setSecondaryTransportDistance, suffix: 'km', decimal: true },
                    { label: '現着 ODO', key: 'sec_arrivalOdo', value: secondaryArrivalOdo, setValue: setSecondaryArrivalOdo, suffix: 'km', decimal: false },
                    { label: '完了 ODO', key: 'sec_completionOdo', value: secondaryCompletionOdo, setValue: setSecondaryCompletionOdo, suffix: 'km', decimal: false },
                    { label: '帰社距離', key: 'sec_returnDistance', value: secondaryReturnDistance, setValue: setSecondaryReturnDistance, suffix: 'km', decimal: true },
                    { label: '帰社 ODO', key: 'sec_returnOdo', value: secondaryReturnOdo, setValue: setSecondaryReturnOdo, suffix: 'km', decimal: false },
                  ].map(({ label, key, value, setValue, suffix, decimal }) => (
                    <div key={key} className="flex items-center gap-2">
                      <RequiredDot />
                      <span className="text-sm flex-shrink-0 w-[72px]" style={{ color: '#1C2948', opacity: 0.65 }}>
                        {label}
                      </span>
                      <InlineNumericField fieldKey={key} value={value} setValue={setValue} suffix={suffix} decimal={decimal} />
                      <EditButton onClick={() => setEditingField(editingField === key ? null : key)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex gap-3">
              <div className="flex flex-col items-center flex-shrink-0" style={{ width: 36 }}>
                <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#D3170A' }} />
                <div className="w-px flex-1 my-2" style={{ backgroundColor: '#D1D5DB' }} />
                <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/distance.svg" alt="distance" className="w-5 h-5" />
                </div>
              </div>
              <div className="flex-1 space-y-3 pt-0.5">
                {[
                  { label: '出発 ODO', key: 'departureOdo', value: departureOdo, setValue: setDepartureOdo, suffix: 'km', decimal: false },
                  { label: '回送距離', key: 'recoveryDistance', value: recoveryDistance, setValue: setRecoveryDistance, suffix: 'km', decimal: true },
                  { label: '搬送距離', key: 'transportDistance', value: transportDistance, setValue: setTransportDistance, suffix: 'km', decimal: true },
                  { label: '完了 ODO', key: 'completionOdo', value: completionOdo, setValue: setCompletionOdo, suffix: 'km', decimal: false },
                  { label: '帰社距離', key: 'returnDistance', value: returnDistance, setValue: setReturnDistance, suffix: 'km', decimal: true },
                  { label: '帰社 ODO', key: 'returnOdo', value: returnOdo, setValue: setReturnOdo, suffix: 'km', decimal: false },
                ].map(({ label, key, value, setValue, suffix, decimal }) => (
                  <div key={key} className="flex items-center gap-2">
                    <RequiredDot />
                    <span className="text-sm flex-shrink-0 w-[72px]" style={{ color: '#1C2948', opacity: 0.65 }}>
                      {label}
                    </span>
                    <InlineNumericField fieldKey={key} value={value} setValue={setValue} suffix={suffix} decimal={decimal} />
                    <EditButton onClick={() => setEditingField(editingField === key ? null : key)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── 高速代セクション ── */}
        {isStored ? (
          <>
            {/* 1次 高速代 */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-xs font-bold mb-3 px-1" style={{ color: '#71A9F7' }}>1次</p>
              <div className="flex gap-3">
                <div className="flex flex-col items-center justify-center flex-shrink-0" style={{ width: 36 }}>
                  <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/etc.svg" alt="ETC" className="w-6 h-6 brightness-0 opacity-40" />
                  </div>
                </div>
                <div className="flex-1 space-y-3 pt-0.5">
                  {[
                    { label: '回送高速', key: 'recoveryHighway', value: recoveryHighway, setValue: setRecoveryHighway },
                    { label: '搬送高速', key: 'transportHighway', value: transportHighway, setValue: setTransportHighway },
                    { label: '帰社高速', key: 'returnHighway', value: returnHighway, setValue: setReturnHighway },
                  ].map(({ label, key, value, setValue }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-sm flex-shrink-0 w-[80px]" style={{ color: '#1C2948', opacity: 0.65 }}>
                        {label}
                      </span>
                      <InlineNumericField fieldKey={key} value={value} setValue={setValue} suffix=" 円" />
                      <EditButton onClick={() => setEditingField(editingField === key ? null : key)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* 2次 高速代 */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-xs font-bold mb-3 px-1" style={{ color: '#71A9F7' }}>2次</p>
              <div className="flex gap-3">
                <div className="flex flex-col items-center justify-center flex-shrink-0" style={{ width: 36 }}>
                  <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/etc.svg" alt="ETC" className="w-6 h-6 brightness-0 opacity-40" />
                  </div>
                </div>
                <div className="flex-1 space-y-3 pt-0.5">
                  {[
                    { label: '搬送高速', key: 'sec_transportHighway', value: secondaryTransportHighway, setValue: setSecondaryTransportHighway },
                    { label: '帰社高速', key: 'sec_returnHighway', value: secondaryReturnHighway, setValue: setSecondaryReturnHighway },
                  ].map(({ label, key, value, setValue }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-sm flex-shrink-0 w-[80px]" style={{ color: '#1C2948', opacity: 0.65 }}>
                        {label}
                      </span>
                      <InlineNumericField fieldKey={key} value={value} setValue={setValue} suffix=" 円" />
                      <EditButton onClick={() => setEditingField(editingField === key ? null : key)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* 高速代 合計 */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold flex-shrink-0" style={{ color: '#1C2948' }}>
                  高速代 合計金額
                </span>
                <span className="text-sm font-bold flex-1 text-right" style={{ color: '#1C2948' }}>
                  {totalHighway > 0 ? `${totalHighway} 円` : '--'}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex gap-3">
              <div className="flex flex-col items-center justify-center flex-shrink-0" style={{ width: 36 }}>
                <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/etc.svg" alt="ETC" className="w-6 h-6 brightness-0 opacity-40" />
                </div>
              </div>
              <div className="flex-1 space-y-3 pt-0.5">
                {[
                  { label: '1次回送高速', key: 'recoveryHighway', value: recoveryHighway, setValue: setRecoveryHighway },
                  { label: '1次搬送高速', key: 'transportHighway', value: transportHighway, setValue: setTransportHighway },
                  { label: '1次帰社高速', key: 'returnHighway', value: returnHighway, setValue: setReturnHighway },
                ].map(({ label, key, value, setValue }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-sm flex-shrink-0 w-[80px]" style={{ color: '#1C2948', opacity: 0.65 }}>
                      {label}
                    </span>
                    <InlineNumericField fieldKey={key} value={value} setValue={setValue} suffix=" 円" />
                    <EditButton onClick={() => setEditingField(editingField === key ? null : key)} />
                  </div>
                ))}
                {/* 合計（自動計算） */}
                <div className="flex items-center gap-2">
                  <span className="text-sm flex-shrink-0 w-[80px]" style={{ color: '#1C2948', opacity: 0.65 }}>
                    合計金額
                  </span>
                  <span className="text-sm font-bold flex-1" style={{ color: '#1C2948' }}>
                    {totalHighway > 0 ? `${totalHighway} 円` : '--'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 出動場所（3箇所） ── */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <RequiredDot />
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
            <FaCircleArrowRight className="flex-shrink-0 text-xl" style={{ color: '#888888' }} />
            <input
              type="text"
              value={arrivalPlaceName}
              onChange={(e) => setArrivalPlaceName(e.target.value)}
              placeholder="現場"
              className="flex-1 min-w-0 border-2 rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: arrivalPlaceName.trim() !== '' ? '#C6D8FF' : '#D3170A', color: '#1C2948' }}
            />
            <FaCircleArrowRight className="flex-shrink-0 text-xl" style={{ color: '#888888' }} />
            <input
              type="text"
              value={transportPlaceName}
              onChange={(e) => setTransportPlaceName(e.target.value)}
              placeholder="搬送先"
              className="flex-1 min-w-0 border-2 rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: transportPlaceName.trim() !== '' ? '#C6D8FF' : '#D3170A', color: '#1C2948' }}
            />
          </div>
        </div>

        {/* ── 搬送先情報 ── */}
        <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <RequiredDot />
            <span className="text-sm font-bold" style={{ color: '#1C2948' }}>搬送先情報</span>
          </div>

          {/* 搬送先店名（必須） */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <RequiredDot />
              <span className="text-xs" style={{ color: '#1C2948', opacity: 0.65 }}>搬送先店名</span>
            </div>
            <TransportShopAutocomplete
              key={dispatch.id}
              value={transportShopName}
              onChange={setTransportShopName}
              onSelect={(data) => {
                setTransportShopName(data.shopName)
                if (data.phone) setTransportPhone(data.phone)
                if (data.address) setTransportAddress(data.address)
                if (data.contact) setTransportContact(data.contact)
              }}
              borderColor={transportShopName.trim() !== '' ? '#C6D8FF' : '#D3170A'}
            />
          </div>

          {/* 電話番号（必須） */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <RequiredDot />
              <span className="text-xs" style={{ color: '#1C2948', opacity: 0.65 }}>電話番号</span>
            </div>
            <input
              type="tel"
              value={transportPhone}
              onChange={(e) => setTransportPhone(e.target.value)}
              placeholder="000-0000-0000"
              className="w-full border-2 rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: transportPhone.trim() !== '' ? '#C6D8FF' : '#D3170A', color: '#1C2948' }}
            />
          </div>

          {/* 住所（必須） */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <RequiredDot />
              <span className="text-xs" style={{ color: '#1C2948', opacity: 0.65 }}>住所</span>
            </div>
            <input
              type="text"
              value={transportAddress}
              onChange={(e) => setTransportAddress(e.target.value)}
              placeholder="住所"
              className="w-full border-2 rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: transportAddress.trim() !== '' ? '#C6D8FF' : '#D3170A', color: '#1C2948' }}
            />
          </div>

          {/* 担当者（任意） */}
          <div>
            <span className="text-xs mb-1 block" style={{ color: '#1C2948', opacity: 0.65 }}>担当者</span>
            <input
              type="text"
              value={transportContact}
              onChange={(e) => setTransportContact(e.target.value)}
              placeholder="担当者名（任意）"
              className="w-full border-2 rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
            />
          </div>

          {/* 2次搬送者への連絡事項（任意） */}
          <div>
            <span className="text-xs mb-1 block" style={{ color: '#1C2948', opacity: 0.65 }}>2次搬送者への連絡事項</span>
            <textarea
              value={transportMemo}
              onChange={(e) => setTransportMemo(e.target.value)}
              rows={3}
              placeholder="連絡事項（任意）"
              className="w-full border-2 rounded-lg px-3 py-2.5 text-sm resize-none"
              style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
            />
          </div>
        </div>

        {/* 区切り線 */}
        <div className="border-t-2 border-white/60 mx-1" />

        {/* ── 1次完了・協定金額 ── */}
        <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
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
                <span className="text-sm" style={{ color: '#1C2948' }}>{label}</span>
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
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold flex-shrink-0" style={{ color: '#1C2948' }}>1次金額</span>
            <input
              type="text"
              inputMode="numeric"
              value={primaryAmount}
              onChange={(e) => setPrimaryAmount(e.target.value)}
              placeholder="0"
              className="flex-1 border-2 rounded-lg px-3 py-2 text-sm text-right"
              style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
            />
            <span className="text-sm flex-shrink-0" style={{ color: '#1C2948' }}>円</span>
          </div>
        </div>

        {/* ── 2次完了・協定金額 ── */}
        {isStored && (
          <>
            <div className="border-t-2 border-white/60 mx-1" />
            <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
              <p className="text-sm font-bold" style={{ color: '#1C2948' }}>
                2次完了・協定金額
              </p>
              <div className="flex items-center gap-5">
                {(
                  [
                    { key: 'reloading', label: '再積込' },
                    { key: 'dolly', label: 'ドーリー' },
                  ] as const
                ).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={secondaryCompletionItems[key]}
                      onChange={(e) =>
                        setSecondaryCompletionItems((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                      className="w-4 h-4 accent-current rounded"
                      style={{ accentColor: '#1C2948' }}
                    />
                    <span className="text-sm" style={{ color: '#1C2948' }}>{label}</span>
                  </label>
                ))}
              </div>

              {/* 保管料 有/無 */}
              <div className="flex items-center gap-3">
                <span className="text-sm" style={{ color: '#1C2948', opacity: 0.65 }}>保管料</span>
                <div className="flex gap-2">
                  {([
                    { value: true, label: '有' },
                    { value: false, label: '無' },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setStorageRequired(value)}
                      className="px-4 py-1.5 rounded-md text-sm font-bold transition-all"
                      style={{
                        backgroundColor: storageRequired === value ? '#1C2948' : '#F3F4F6',
                        color: storageRequired === value ? 'white' : '#1C2948',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="text"
                value={secondaryCompletionNote}
                onChange={(e) => setSecondaryCompletionNote(e.target.value)}
                placeholder="メモ"
                className="w-full border-2 rounded-lg px-3 py-2 text-sm"
                style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
              />
            </div>

            {/* ── 2次金額（協定金額） ── */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold flex-shrink-0" style={{ color: '#1C2948' }}>2次金額</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={secondaryAmount}
                  onChange={(e) => setSecondaryAmount(e.target.value)}
                  placeholder="0"
                  className="flex-1 border-2 rounded-lg px-3 py-2 text-sm text-right"
                  style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
                />
                <span className="text-sm flex-shrink-0" style={{ color: '#1C2948' }}>円</span>
              </div>
            </div>
          </>
        )}

        {/* ── 請求合計確定金額 ── */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold" style={{ color: '#1C2948' }}>請求合計確定金額</span>
            <div className="flex items-center gap-1">
              <span className="text-base font-bold" style={{ color: '#1C2948' }}>
                {(() => {
                  const p = parseInt(primaryAmount) || 0
                  const s = parseInt(secondaryAmount) || 0
                  const total = p + s
                  return total > 0 ? total : ''
                })()}
              </span>
              <span className="text-sm" style={{ color: '#1C2948' }}>円</span>
            </div>
          </div>
        </div>

        {/* ── 請求担当者への連絡事項 ── */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-sm font-bold mb-2" style={{ color: '#1C2948' }}>請求担当者への連絡事項</p>
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
      <div className="fixed bottom-0 left-0 right-0 px-3 py-3 space-y-2" style={{ backgroundColor: '#E5E5E5' }}>
        {/* Row 1: 下書き保存 + 完了 */}
        <div className="flex gap-3">
          {report.isDraft && (
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={loading}
              className="flex-none flex items-center gap-2 px-6 py-3.5 rounded-md font-bold text-white text-base active:opacity-80 transition-opacity"
              style={{ backgroundColor: '#D3170A' }}
            >
              <FaPen className="text-lg" />
              <span>下書き保存</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={!isComplete || loading}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-md font-bold text-lg transition-all active:opacity-80"
            style={{
              backgroundColor: isComplete ? '#1C2948' : '#9CA3AF',
              color: isComplete ? '#D7AF70' : 'white',
              cursor: isComplete ? 'pointer' : 'not-allowed',
            }}
          >
            <FaCheckSquare className="text-xl" />
            <span>完　了</span>
          </button>
        </div>

        {/* Row 2: 出動記録へ */}
        <button
          type="button"
          onClick={() => router.push(`/dispatch/${dispatch.id}/record`)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md font-bold text-white text-base active:opacity-80"
          style={{ backgroundColor: '#1C2948' }}
        >
          <IoIosArrowBack className="text-lg" />
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
