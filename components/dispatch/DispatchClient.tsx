'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Session } from 'next-auth'
import { IoMdCamera, IoIosArrowDroprightCircle } from 'react-icons/io'
import { MdPeopleAlt } from 'react-icons/md'
import { ChevronLeft } from 'lucide-react'
import ClockPicker from './ClockPicker'
import { offlineFetch } from '@/lib/offline-fetch'
import { usePhotoCapture } from '@/hooks/usePhotoCapture'

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface TimeRecord {
  time: Date
  gpsLat?: number | null
  gpsLng?: number | null
}

interface SerializedDispatch {
  id: string
  dispatchNumber: string
  status: string
  type: string
  departureOdo: number | null
  completionOdo: number | null
  dispatchTime: string | null
  arrivalTime: string | null
  completionTime: string | null
  returnTime: string | null
  dispatchGpsLat: number | null
  dispatchGpsLng: number | null
  arrivalGpsLat: number | null
  arrivalGpsLng: number | null
  transportStartTime: string | null
  deliveryType: 'DIRECT' | 'STORAGE' | null
}

interface DispatchClientProps {
  assistanceId: string
  dispatchType: 'onsite' | 'transport'
  session: Session
  initialDispatch?: SerializedDispatch | null
}

// -------------------------------------------------------
// Step 定義
// onsite: 0=初期, 1=出動後, 2=現着後, 3=完了後, 4=帰社後
// transport: 0=初期, 1=出動後, 2=現着後, 3=搬送開始後, 4=完了後, 5=帰社後(or 保管後→帰社スキップ)
// -------------------------------------------------------

function getInitialStep(d: SerializedDispatch | null | undefined): number {
  if (!d) return 0
  if (d.returnTime) return d.type === 'TRANSPORT' ? 5 : 4
  if (d.completionTime && d.deliveryType === 'STORAGE') return 5 // 保管済み → 帰社スキップ
  if (d.completionTime) return d.type === 'TRANSPORT' ? 4 : 3
  if (d.type === 'TRANSPORT' && d.transportStartTime) return 3
  if (d.arrivalTime) return 2
  if (d.dispatchTime) return 1
  return 0
}


// -------------------------------------------------------
// OdoInput
// -------------------------------------------------------

function OdoInput({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  label?: string
}) {
  return (
    <div className={`flex items-center gap-3 px-1 transition-opacity ${disabled ? 'opacity-40' : ''}`}>
      <img src="/icons/odo.svg" alt="" className="w-10 h-10 object-contain flex-shrink-0" />
      <span className="font-bold text-lg flex-shrink-0" style={{ color: '#1C2948' }}>
        {label && <span className="mr-1">{label}</span>}ODO
      </span>
      <div className="flex-1 bg-white rounded-lg border-2 border-gray-200 px-4 py-2.5 flex items-center">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder=""
          className="w-full text-right text-2xl font-bold outline-none bg-transparent"
          style={{ color: disabled ? '#9CA3AF' : '#1C2948' }}
        />
      </div>
      <span className="font-medium text-gray-500 flex-shrink-0 text-xl">km</span>
    </div>
  )
}

// -------------------------------------------------------
// HighwayInput
// -------------------------------------------------------

function HighwayInput({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  label: string
}) {
  return (
    <div className={`flex items-center gap-3 px-1 transition-opacity ${disabled ? 'opacity-40' : ''}`}>
      <img src="/icons/etc.svg" alt="" className="w-10 h-10 object-contain flex-shrink-0" style={{ filter: 'brightness(0) saturate(100%) invert(12%) sepia(50%) saturate(800%) hue-rotate(200deg) brightness(90%)' }} />
      <span className="font-bold text-lg flex-shrink-0" style={{ color: '#1C2948' }}>{label}</span>
      <div className="flex-1 bg-white rounded-lg border-2 border-gray-200 px-4 py-2.5 flex items-center">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0"
          className="w-full text-right text-2xl font-bold outline-none bg-transparent"
          style={{ color: disabled ? '#9CA3AF' : '#1C2948' }}
        />
      </div>
      <span className="font-medium text-gray-500 flex-shrink-0 text-xl">円</span>
    </div>
  )
}

// -------------------------------------------------------
// ActionButton
// -------------------------------------------------------

interface ActionButtonProps {
  iconSrc?: string
  iconJsx?: React.ReactNode
  iconClassName?: string
  iconSize?: string
  label: string
  isActive: boolean
  isPressed: boolean
  isDisabled: boolean
  time?: Date | null
  onPress?: () => void
  onCorrect?: () => void
  onCancel?: () => void
  loading?: boolean
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function ActionButton({
  iconSrc,
  iconJsx,
  iconClassName,
  iconSize = 'w-12 h-12',
  label,
  isActive,
  isPressed,
  isDisabled,
  time,
  onPress,
  onCorrect,
  onCancel,
  loading,
}: ActionButtonProps) {
  const bgColor = isPressed
    ? '#1C2948'
    : isActive
    ? '#71A9F7'
    : '#71A9F7'

  const buttonOpacity = isDisabled && !isPressed ? 0.35 : 1
  const bgColorFinal = isDisabled && !isPressed ? '#71A9F7' : bgColor

  // 2文字ラベルは広め、それ以外は通常幅
  const tracking = label.length <= 2 ? '0.25em' : '0.1em'

  // ── 押下済み: 50/50 レイアウト ──
  if (isPressed && time) {
    return (
      <div className="flex gap-2 w-full" style={{ height: '7rem' }}>
        {/* 左50%: アイコン + ラベル（底揃え） */}
        <div
          className="flex-1 flex flex-col items-center justify-end gap-1 rounded-xl pb-3"
          style={{ backgroundColor: '#1C2948' }}
        >
          {iconSrc && (
            <img src={iconSrc} alt="" className={`${iconSize} object-contain ${iconClassName ?? ''}`} />
          )}
          {iconJsx && (
            <span className="text-4xl leading-none text-white">{iconJsx}</span>
          )}
          <span className="text-white font-bold text-2xl" style={{ letterSpacing: tracking, paddingLeft: tracking }}>{label}</span>
        </div>

        {/* 右50%: 時刻（上）+ 修正・取消ボタン（底揃え） */}
        <div className="flex-1 flex flex-col items-center justify-between px-1 py-1">
          <span className="text-6xl font-bold" style={{ color: '#1C2948' }}>
            {formatTime(time)}
          </span>
          <div className="flex gap-2 w-full">
            {onCorrect && (
              <button
                className="flex-1 bg-white rounded-lg py-2 text-center font-bold text-lg shadow-sm border-2 border-gray-200 active:bg-gray-100"
                style={{ color: '#1C2948', letterSpacing: '0.25em', paddingLeft: '0.25em' }}
                onClick={onCorrect}
              >
                修正
              </button>
            )}
            {onCancel && (
              <button
                className="flex-1 bg-white rounded-lg py-2 text-center font-bold text-lg shadow-sm border-2 border-red-300 active:bg-red-50"
                style={{ color: '#D3170A', letterSpacing: '0.25em', paddingLeft: '0.25em' }}
                onClick={onCancel}
              >
                取消
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── 通常: フル幅ボタン ──
  return (
    <button
      onClick={!isDisabled && !loading ? onPress : undefined}
      disabled={isDisabled || loading}
      className="w-full h-[72px] flex items-center justify-center gap-4 rounded-xl font-bold text-3xl transition-all active:scale-[0.97]"
      style={{ backgroundColor: bgColorFinal, opacity: buttonOpacity }}
    >
      {iconSrc && (
        <img
          src={iconSrc}
          alt=""
          className={`${iconSize} object-contain ${iconClassName ?? ''}`}
        />
      )}
      {iconJsx && (
        <span className="text-4xl leading-none">
          {iconJsx}
        </span>
      )}
      <span style={{ color: 'white', letterSpacing: tracking, paddingLeft: tracking }}>
        {loading && isActive ? '処理中...' : label}
      </span>
    </button>
  )
}

// -------------------------------------------------------
// GPS helper
// -------------------------------------------------------

function getGPS(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    )
  })
}

// -------------------------------------------------------
// Main component
// -------------------------------------------------------

export default function DispatchClient({
  assistanceId,
  dispatchType,
  session: _session,
  initialDispatch,
}: DispatchClientProps) {
  const router = useRouter()

  const [mode, setMode] = useState<'onsite' | 'transport'>(dispatchType)
  const initStep = getInitialStep(initialDispatch)
  const [step, setStep] = useState(initStep)
  const [dispatchId, setDispatchId] = useState<string | null>(initialDispatch?.id ?? null)
  const [dispatchNumber, setDispatchNumber] = useState<string | null>(
    initialDispatch?.dispatchNumber ?? null
  )
  const [departureOdo, setDepartureOdo] = useState(
    initialDispatch?.departureOdo?.toString() ?? ''
  )
  const [completionOdo, setCompletionOdo] = useState(
    initialDispatch?.completionOdo?.toString() ?? ''
  )
  const [dispatchTime, setDispatchTime] = useState<TimeRecord | null>(
    initialDispatch?.dispatchTime
      ? {
          time: new Date(initialDispatch.dispatchTime),
          gpsLat: initialDispatch.dispatchGpsLat,
          gpsLng: initialDispatch.dispatchGpsLng,
        }
      : null
  )
  const [arrivalTime, setArrivalTime] = useState<TimeRecord | null>(
    initialDispatch?.arrivalTime
      ? {
          time: new Date(initialDispatch.arrivalTime),
          gpsLat: initialDispatch.arrivalGpsLat,
          gpsLng: initialDispatch.arrivalGpsLng,
        }
      : null
  )
  const [transportStartTime, setTransportStartTime] = useState<TimeRecord | null>(
    initialDispatch?.transportStartTime ? { time: new Date(initialDispatch.transportStartTime) } : null
  )
  const [completionTime, setCompletionTime] = useState<TimeRecord | null>(
    initialDispatch?.completionTime ? { time: new Date(initialDispatch.completionTime) } : null
  )
  const [returnTime, setReturnTime] = useState<TimeRecord | null>(
    initialDispatch?.returnTime ? { time: new Date(initialDispatch.returnTime) } : null
  )
  const [recoveryHighway, setRecoveryHighway] = useState('')
  const [returnHighway, setReturnHighway] = useState('')
  const [transportHighway, setTransportHighway] = useState('')
  const [isStoredDispatch, setIsStoredDispatch] = useState(
    initialDispatch?.status === 'STORED'
  )
  const [loading, setLoading] = useState(false)
  const [clockTarget, setClockTarget] = useState<
    'dispatch' | 'arrival' | 'transportStart' | 'completion' | 'return' | null
  >(null)

  // ── 写真（Phase 10） ──
  const { photoCount, fileInputRef, openCamera, handleFileChange } = usePhotoCapture(dispatchId)

  // ── 自動スクロール用 ref ──
  const dispatchBtnRef  = useRef<HTMLDivElement>(null)
  const arrivalBtnRef   = useRef<HTMLDivElement>(null)
  const completionBtnRef = useRef<HTMLDivElement>(null)
  const returnBtnRef    = useRef<HTMLDivElement>(null)
  const recordBtnRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode === 'transport') {
      const refs = [
        dispatchBtnRef,    // step 0
        arrivalBtnRef,     // step 1
        completionBtnRef,  // step 2
        completionBtnRef,  // step 3 (搬送開始後 → 完了付近)
        returnBtnRef,      // step 4
        recordBtnRef,      // step 5
      ]
      refs[Math.min(step, refs.length - 1)]?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      const refs = [
        dispatchBtnRef,    // step 0
        arrivalBtnRef,     // step 1
        completionBtnRef,  // step 2
        returnBtnRef,      // step 3
        recordBtnRef,      // step 4
      ]
      refs[Math.min(step, refs.length - 1)]?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [step, mode])

  // ── Handlers ──

  const handleDispatch = useCallback(async () => {
    if (step !== 0 || loading) return
    setLoading(true)
    try {
      const now = new Date()
      const gps = await getGPS()

      // 取消後の再出動: 既存レコードを再利用して欠番を防ぐ
      if (dispatchId) {
        const res = await offlineFetch(`/api/dispatches/${dispatchId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dispatchTime: now.toISOString(),
            dispatchGpsLat: gps?.lat ?? null,
            dispatchGpsLng: gps?.lng ?? null,
            departureOdo: departureOdo ? parseInt(String(departureOdo)) : null,
            status: 'DISPATCHED',
          }),
          offlineActionType: 'dispatch_update',
          offlineDispatchId: dispatchId,
          offlineGps: gps,
        })
        if (!res.ok) throw new Error('dispatch update failed')
        setDispatchTime({ time: now, gpsLat: gps?.lat, gpsLng: gps?.lng })
        setStep(1)
      } else {
        // 初回出動: 新規作成
        const res = await offlineFetch('/api/dispatches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assistanceId,
            type: mode,
            departureOdo: departureOdo || null,
            dispatchTime: now.toISOString(),
            dispatchGpsLat: gps?.lat ?? null,
            dispatchGpsLng: gps?.lng ?? null,
          }),
          offlineActionType: 'dispatch_create',
          offlineDispatchId: null,
          offlineGps: gps,
          offlineOptimisticData: { id: `offline-${Date.now()}`, dispatchNumber: '---' },
        })

        if (!res.ok) throw new Error('dispatch create failed')
        const data = await res.json()

        setDispatchId(data.id)
        setDispatchNumber(data.dispatchNumber)
        setDispatchTime({ time: now, gpsLat: gps?.lat, gpsLng: gps?.lng })
        setStep(1)
        router.replace(`/dispatch/${data.id}`)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [step, loading, dispatchId, assistanceId, mode, departureOdo, router])

  const handleArrival = useCallback(async () => {
    if (step !== 1 || !dispatchId || loading) return
    setLoading(true)
    try {
      const now = new Date()
      const gps = await getGPS()

      await offlineFetch(`/api/dispatches/${dispatchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          arrivalTime: now.toISOString(),
          arrivalGpsLat: gps?.lat ?? null,
          arrivalGpsLng: gps?.lng ?? null,
          status: 'ONSITE',
        }),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: dispatchId,
        offlineGps: gps,
      })

      // 回送高速が入力されていればReportへ保存
      if (recoveryHighway.trim()) {
        await offlineFetch(`/api/dispatches/${dispatchId}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recoveryHighway: parseInt(recoveryHighway) }),
          offlineActionType: 'report_save',
          offlineDispatchId: dispatchId,
        }).catch(console.error)
      }

      setArrivalTime({ time: now, gpsLat: gps?.lat, gpsLng: gps?.lng })
      setStep(2)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [step, dispatchId, loading, recoveryHighway])

  // 現場対応専用: 完了
  const handleCompletion = useCallback(async () => {
    if (step !== 2 || !dispatchId || loading) return
    setLoading(true)
    try {
      const now = new Date()

      await offlineFetch(`/api/dispatches/${dispatchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completionTime: now.toISOString(),
          completionOdo: completionOdo ? parseInt(completionOdo) : null,
          status: 'COMPLETED',
        }),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: dispatchId,
      })

      // 帰社高速が入力されていればReportへ保存
      if (returnHighway.trim()) {
        await offlineFetch(`/api/dispatches/${dispatchId}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnHighway: parseInt(returnHighway) }),
          offlineActionType: 'report_save',
          offlineDispatchId: dispatchId,
        }).catch(console.error)
      }

      setCompletionTime({ time: now })
      setStep(3)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [step, dispatchId, completionOdo, loading, returnHighway])

  // 搬送専用: 搬送開始
  const handleTransportStart = useCallback(async () => {
    if (step !== 2 || !dispatchId || loading) return
    setLoading(true)
    try {
      const now = new Date()
      await offlineFetch(`/api/dispatches/${dispatchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transportStartTime: now.toISOString(),
          status: 'TRANSPORTING',
        }),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: dispatchId,
      })
      setTransportStartTime({ time: now })
      setStep(3)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [step, dispatchId, loading])

  // 搬送専用: 完了（搬送高速を保存）
  const handleTransportComplete = useCallback(async () => {
    if (step !== 3 || !dispatchId || loading) return
    setLoading(true)
    try {
      const now = new Date()
      if (transportHighway.trim()) {
        await offlineFetch(`/api/dispatches/${dispatchId}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transportHighway: parseInt(transportHighway) }),
          offlineActionType: 'report_save',
          offlineDispatchId: dispatchId,
        }).catch(console.error)
      }
      await offlineFetch(`/api/dispatches/${dispatchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completionTime: now.toISOString(),
          completionOdo: completionOdo ? parseInt(completionOdo) : null,
          status: 'COMPLETED',
        }),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: dispatchId,
      })
      setCompletionTime({ time: now })
      setStep(4)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [step, dispatchId, loading, completionOdo, transportHighway])

  // 搬送専用: 保管（搬送開始後 step 3 で選択 → 帰社スキップ → 出動記録へ）
  const handleStorage = useCallback(async () => {
    if (step !== 3 || !dispatchId || loading) return
    setLoading(true)
    try {
      const now = new Date()
      // 搬送高速が入力されていればReportへ保存
      if (transportHighway.trim()) {
        await offlineFetch(`/api/dispatches/${dispatchId}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transportHighway: parseInt(transportHighway) }),
          offlineActionType: 'report_save',
          offlineDispatchId: dispatchId,
        }).catch(console.error)
      }
      await offlineFetch(`/api/dispatches/${dispatchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completionTime: now.toISOString(),
          completionOdo: completionOdo ? parseInt(completionOdo) : null,
          status: 'STORED',
          deliveryType: 'STORAGE',
        }),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: dispatchId,
      })
      setCompletionTime({ time: now })
      setIsStoredDispatch(true)
      setStep(5) // 帰社をスキップして出動記録へ
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [step, dispatchId, loading, transportHighway, completionOdo])

  const handleReturn = useCallback(async () => {
    const expectedStep = mode === 'transport' ? 4 : 3
    if (step !== expectedStep || !dispatchId || loading) return
    setLoading(true)
    try {
      const now = new Date()

      // 搬送モードでは帰社高速を帰社タイミングで保存
      if (mode === 'transport' && returnHighway.trim()) {
        await offlineFetch(`/api/dispatches/${dispatchId}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnHighway: parseInt(returnHighway) }),
          offlineActionType: 'report_save',
          offlineDispatchId: dispatchId,
        }).catch(console.error)
      }

      await offlineFetch(`/api/dispatches/${dispatchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnTime: now.toISOString(),
          status: 'RETURNED',
        }),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: dispatchId,
      })

      setReturnTime({ time: now })
      setStep(mode === 'transport' ? 5 : 4)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [step, mode, dispatchId, loading, returnHighway])

  const handleTimeCorrection = useCallback(
    async (newDate: Date) => {
      if (!dispatchId || !clockTarget) return
      const fieldMap: Record<string, string> = {
        dispatch: 'dispatchTime',
        arrival: 'arrivalTime',
        transportStart: 'transportStartTime',
        completion: 'completionTime',
        return: 'returnTime',
      }
      try {
        await offlineFetch(`/api/dispatches/${dispatchId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [fieldMap[clockTarget]]: newDate.toISOString() }),
          offlineActionType: 'dispatch_update',
          offlineDispatchId: dispatchId,
        })
        if (clockTarget === 'dispatch')
          setDispatchTime((p) => (p ? { ...p, time: newDate } : null))
        else if (clockTarget === 'arrival')
          setArrivalTime((p) => (p ? { ...p, time: newDate } : null))
        else if (clockTarget === 'transportStart')
          setTransportStartTime((p) => (p ? { ...p, time: newDate } : null))
        else if (clockTarget === 'completion')
          setCompletionTime((p) => (p ? { ...p, time: newDate } : null))
        else if (clockTarget === 'return')
          setReturnTime((p) => (p ? { ...p, time: newDate } : null))
      } catch (e) {
        console.error(e)
      } finally {
        setClockTarget(null)
      }
    },
    [dispatchId, clockTarget]
  )

  // ── 取消: 時刻をクリアしてステップを戻す ──

  const handleCancelStep = useCallback(
    async (target: 'dispatch' | 'arrival' | 'transportStart' | 'completion' | 'return') => {
      if (!dispatchId || loading) return
      setLoading(true)

      // 各ステップで戻すべきフィールドとステータス
      const configMap: Record<string, { fields: Record<string, unknown>; prevStep: number; resetState: () => void }> = {
        dispatch: {
          fields: { dispatchTime: null, status: 'STANDBY' },
          prevStep: 0,
          resetState: () => setDispatchTime(null),
        },
        arrival: {
          fields: { arrivalTime: null, arrivalGpsLat: null, arrivalGpsLng: null, status: 'DISPATCHED' },
          prevStep: 1,
          resetState: () => setArrivalTime(null),
        },
        transportStart: {
          fields: { transportStartTime: null, status: 'ONSITE' },
          prevStep: 2,
          resetState: () => setTransportStartTime(null),
        },
        completion: {
          fields: {
            completionTime: null, completionOdo: null, deliveryType: null,
            status: mode === 'transport' ? 'TRANSPORTING' : 'ONSITE',
          },
          prevStep: mode === 'transport' ? 3 : 2,
          resetState: () => { setCompletionTime(null); setIsStoredDispatch(false) },
        },
        return: {
          fields: { returnTime: null, status: isStoredDispatch ? 'STORED' : 'COMPLETED' },
          prevStep: mode === 'transport' ? 4 : 3,
          resetState: () => setReturnTime(null),
        },
      }

      const config = configMap[target]
      if (!config) return

      try {
        await offlineFetch(`/api/dispatches/${dispatchId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config.fields),
          offlineActionType: 'dispatch_update',
          offlineDispatchId: dispatchId,
        })
        config.resetState()
        setStep(config.prevStep)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    },
    [dispatchId, loading, mode]
  )

  const getClockValue = (): Date => {
    if (clockTarget === 'dispatch' && dispatchTime) return dispatchTime.time
    if (clockTarget === 'arrival' && arrivalTime) return arrivalTime.time
    if (clockTarget === 'transportStart' && transportStartTime) return transportStartTime.time
    if (clockTarget === 'completion' && completionTime) return completionTime.time
    if (clockTarget === 'return' && returnTime) return returnTime.time
    return new Date()
  }

  // ── 時間制約（前後の時刻で範囲を決定） ──
  type ClockTargetType = 'dispatch' | 'arrival' | 'transportStart' | 'completion' | 'return'
  const dispatchTimeOrder: ClockTargetType[] = mode === 'onsite'
    ? ['dispatch', 'arrival', 'completion', 'return']
    : ['dispatch', 'arrival', 'transportStart', 'completion', 'return']
  const dispatchTimeMap: Record<ClockTargetType, Date | null> = {
    dispatch: dispatchTime?.time ?? null,
    arrival: arrivalTime?.time ?? null,
    transportStart: transportStartTime?.time ?? null,
    completion: completionTime?.time ?? null,
    return: returnTime?.time ?? null,
  }
  const getClockConstraints = (target: ClockTargetType): { minTime: Date | null; maxTime: Date | null } => {
    const idx = dispatchTimeOrder.indexOf(target)
    let minTime: Date | null = null
    let maxTime: Date | null = null
    for (let i = idx - 1; i >= 0; i--) {
      if (dispatchTimeMap[dispatchTimeOrder[i]]) { minTime = dispatchTimeMap[dispatchTimeOrder[i]]; break }
    }
    for (let i = idx + 1; i < dispatchTimeOrder.length; i++) {
      if (dispatchTimeMap[dispatchTimeOrder[i]]) { maxTime = dispatchTimeMap[dispatchTimeOrder[i]]; break }
    }
    return { minTime, maxTime }
  }

  // ── Status ──
  type StatusConfig = {
    iconSrc: string
    label: string
    color: string
  }

  const statusConfig: StatusConfig = (() => {
    if (mode === 'transport') {
      if (step === 0) return { iconSrc: '/icons/stand-by.svg', label: '待機中', color: '#2FBF71' }
      if (step === 1) return { iconSrc: '/icons/dispatch.svg', label: '出動中', color: '#D3170A' }
      if (step === 2) return { iconSrc: '/icons/work.svg', label: '作業中', color: '#F1A900' }
      if (step === 3) return { iconSrc: '/icons/transportation.svg', label: '搬送中', color: '#71A9F7' }
      return { iconSrc: '/icons/transportation.svg', label: '搬送中', color: '#71A9F7' }
    }
    // 現場対応
    if (step === 0) return { iconSrc: '/icons/stand-by.svg', label: '待機中', color: '#2FBF71' }
    if (step === 1) return { iconSrc: '/icons/dispatch.svg', label: '出動中', color: '#D3170A' }
    if (step === 2) return { iconSrc: '/icons/work.svg', label: '作業中', color: '#F1A900' }
    return { iconSrc: '/icons/transportation.svg', label: '搬送中', color: '#71A9F7' }
  })()

  const showStatusBar = mode === 'transport' ? step <= 4 : step <= 3

  // 出動記録へボタンの有効条件: 帰社済み
  const recordReady = mode === 'transport' ? step >= 5 : step >= 4

  // ── Render ──

  return (
    <div className="h-dvh flex flex-col" style={{ backgroundColor: '#C6D8FF' }}>
      {/* ─── Header ─── */}
      <header
        className="px-4 py-3 flex items-center gap-3 flex-shrink-0"
        style={{ backgroundColor: '#1C2948' }}
      >
        <button
          onClick={() => router.push('/')}
          className="text-white p-1 -ml-1 rounded-lg active:opacity-60"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <span className="text-white text-sm opacity-50 font-medium">出動画面</span>
      </header>

      {/* ─── Status bar (固定) ─── */}
      {showStatusBar && (
        <div className="flex-shrink-0 px-4 pt-4 pb-1" style={{ backgroundColor: '#C6D8FF' }}>
          <div className="flex items-center justify-between bg-white rounded-lg px-4 py-2 shadow-md">
            <div className="flex items-center gap-2">
              <img src={statusConfig.iconSrc} alt="" className="w-6 h-6 object-contain" />
              <span className="font-bold text-base" style={{ color: statusConfig.color }}>
                {statusConfig.label}
              </span>
            </div>
            <span className="text-sm font-bold" style={{ color: '#1C2948', opacity: 0.7 }}>
              {dispatchNumber ?? '---'}
            </span>
          </div>
        </div>
      )}

      {/* ─── Main scroll area ─── */}
      <div className="flex-1 px-4 py-3 pb-10 space-y-3 overflow-y-auto">

        {/* ─── Type toggle ─── */}
        <div className="flex gap-2">
          <button
            onClick={() => { if (step === 0) setMode('onsite') }}
            className="flex-1 py-3 rounded-lg font-bold text-base text-white"
            style={{
              backgroundColor: mode === 'onsite' ? '#1C2948' : '#71A9F7',
              opacity: mode === 'transport' && step > 0 ? 0.4 : 1,
              letterSpacing: '0.1em',
              paddingLeft: '0.1em',
            }}
          >
            現場対応
          </button>
          <button
            onClick={() => { if (step === 0) setMode('transport') }}
            className="flex-1 py-3 rounded-lg font-bold text-base text-white"
            style={{
              backgroundColor: mode === 'transport' ? '#1C2948' : '#71A9F7',
              opacity: mode === 'onsite' && step > 0 ? 0.4 : 1,
              letterSpacing: '0.25em',
              paddingLeft: '0.25em',
            }}
          >
            搬送
          </button>
        </div>

        {/* ─── ODO（出発時） ─── */}
        <OdoInput
          label="出発"
          value={departureOdo}
          onChange={setDepartureOdo}
          disabled={step > 0}
        />

        {/* ─── 出動ボタン ─── */}
        <div ref={dispatchBtnRef}>
          <ActionButton
            iconSrc="/icons/dispatch-truck.svg"
            label="出動"
            isActive={step === 0}
            isPressed={step >= 1}
            isDisabled={step > 0 || (step === 0 && !departureOdo.trim())}
            time={dispatchTime?.time}
            onPress={handleDispatch}
            onCorrect={() => setClockTarget('dispatch')}
            onCancel={() => handleCancelStep('dispatch')}
            loading={loading && step === 0}
          />
        </div>

        {/* ─── 回送高速 ─── */}
        <HighwayInput
          label="回送高速"
          value={recoveryHighway}
          onChange={setRecoveryHighway}
          disabled={step < 1 || step >= 2}
        />

        {/* ─── 現着ボタン ─── */}
        <div ref={arrivalBtnRef}>
          <ActionButton
            iconSrc="/icons/arrival.svg"
            iconClassName="-translate-y-1"
            label="現着"
            isActive={step === 1}
            isPressed={step >= 2}
            isDisabled={step !== 1}
            time={arrivalTime?.time}
            onPress={handleArrival}
            onCorrect={() => setClockTarget('arrival')}
            onCancel={() => handleCancelStep('arrival')}
            loading={loading && step === 1}
          />
        </div>

        {/* ─── 振替ボタン（現着後に表示・共通） ─── */}
        <button
          disabled
          className="w-full h-[72px] flex items-center justify-center gap-4 rounded-xl font-bold text-3xl opacity-35"
          style={{ backgroundColor: '#2FBF71', cursor: 'not-allowed' }}
        >
          <MdPeopleAlt className="w-12 h-12 text-white scale-x-[-1]" />
          <span className="text-white" style={{ letterSpacing: '0.25em', paddingLeft: '0.25em' }}>振替</span>
        </button>

        {/* ─── 作業確認書（Phase 6） ─── */}
        <button
          disabled={step < 2}
          onClick={() => { if (step >= 2) router.push(`/dispatch/${dispatchId}/confirmation`) }}
          className="w-full h-[72px] flex items-center justify-center gap-4 rounded-xl font-bold text-3xl active:brightness-90 transition-all"
          style={{
            backgroundColor: '#71A9F7',
            opacity: step < 2 ? 0.35 : 1,
            cursor: step < 2 ? 'not-allowed' : 'pointer',
          }}
        >
          <img src="/icons/confirmation.svg" alt="" className="w-10 h-10 object-contain" />
          <span className="text-white" style={{ letterSpacing: '0.1em', paddingLeft: '0.1em' }}>作業確認書</span>
        </button>

        {/* ─── 写真（Phase 10） ─── */}
        <button
          disabled={step < 2}
          onClick={openCamera}
          className="w-full h-[72px] flex items-center justify-center gap-4 rounded-xl font-bold text-3xl active:brightness-90 transition-all"
          style={{
            backgroundColor: '#71A9F7',
            opacity: step < 2 ? 0.35 : 1,
            cursor: step < 2 ? 'not-allowed' : 'pointer',
          }}
        >
          <IoMdCamera className="w-12 h-12 text-white" />
          <span className="text-white" style={{ letterSpacing: '0.25em', paddingLeft: '0.25em' }}>写真</span>
          {photoCount > 0 && (
            <span
              className="flex items-center justify-center w-7 h-7 rounded-full bg-white text-sm font-bold flex-shrink-0"
              style={{ color: '#71A9F7' }}
            >
              {photoCount}
            </span>
          )}
        </button>
        {/* カメラ入力（hidden） */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* ─── 現場対応専用 UI ─── */}
        {mode === 'onsite' && (
          <>
            {/* ─── 帰社高速 ─── */}
            <HighwayInput
              label="帰社高速"
              value={returnHighway}
              onChange={setReturnHighway}
              disabled={step < 2 || step >= 3}
            />

            {/* ─── ODO（完了時） ─── */}
            <OdoInput
              label="完了"
              value={completionOdo}
              onChange={setCompletionOdo}
              disabled={step < 2 || step >= 3}
            />

            {/* ─── 完了ボタン ─── */}
            <div ref={completionBtnRef}>
              <ActionButton
                iconSrc="/icons/completion.svg"
                iconSize="w-10 h-10"
                label="完了"
                isActive={step === 2}
                isPressed={step >= 3}
                isDisabled={step !== 2 || (step === 2 && !completionOdo.trim())}
                time={completionTime?.time}
                onPress={handleCompletion}
                onCorrect={() => setClockTarget('completion')}
                onCancel={() => handleCancelStep('completion')}
                loading={loading && step === 2}
              />
            </div>
          </>
        )}

        {/* ─── 搬送専用 UI ─── */}
        {mode === 'transport' && (
          <>
            {/* 搬送開始 — step 2 でアクティブ */}
            <div ref={completionBtnRef}>
              <ActionButton
                iconSrc="/icons/transportation-start.svg"
                label="搬送開始"
                isActive={step === 2}
                isPressed={step >= 3}
                isDisabled={step !== 2}
                time={transportStartTime?.time}
                onPress={handleTransportStart}
                onCorrect={() => setClockTarget('transportStart')}
                onCancel={() => handleCancelStep('transportStart')}
                loading={loading && step === 2}
              />
            </div>

            {/* ─── 搬送開始フロー: 搬送高速 → 完了ODO → 完了/保管 ─── */}
            <>
              {/* 搬送高速 — step 3（搬送開始後〜完了/保管前）でアクティブ */}
              <HighwayInput
                label="搬送高速"
                value={transportHighway}
                onChange={setTransportHighway}
                disabled={step !== 3}
              />

              {/* ODO（完了時）— step 3 でアクティブ */}
              <OdoInput
                label="完了"
                value={completionOdo}
                onChange={setCompletionOdo}
                disabled={step !== 3}
              />

              {/* 完了/保管ボタン — step 3 でアクティブ */}
              {step >= 4 && completionTime && !isStoredDispatch ? (
                /* 完了済み表示 */
                <div className="flex gap-2 w-full" style={{ height: '7rem' }}>
                  <div
                    className="flex-1 flex flex-col items-center justify-end gap-1 rounded-xl pb-3"
                    style={{ backgroundColor: '#1C2948' }}
                  >
                    <img src="/icons/completion.svg" alt="" className="w-10 h-10 object-contain" />
                    <span className="text-white font-bold text-2xl" style={{ letterSpacing: '0.25em', paddingLeft: '0.25em' }}>完了</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-between px-1 py-1">
                    <span className="text-6xl font-bold" style={{ color: '#1C2948' }}>
                      {formatTime(completionTime.time)}
                    </span>
                    <div className="flex gap-2 w-full">
                      <button
                        className="flex-1 bg-white rounded-lg py-2 text-center font-bold text-lg shadow-sm border-2 border-gray-200 active:bg-gray-100"
                        style={{ color: '#1C2948', letterSpacing: '0.25em', paddingLeft: '0.25em' }}
                        onClick={() => setClockTarget('completion')}
                      >
                        修正
                      </button>
                      <button
                        className="flex-1 bg-white rounded-lg py-2 text-center font-bold text-lg shadow-sm border-2 border-red-300 active:bg-red-50"
                        style={{ color: '#D3170A', letterSpacing: '0.25em', paddingLeft: '0.25em' }}
                        onClick={() => handleCancelStep('completion')}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              ) : step >= 5 && isStoredDispatch && completionTime ? (
                /* 保管済み表示 */
                <div className="flex gap-2 w-full" style={{ height: '7rem' }}>
                  <div
                    className="flex-1 flex flex-col items-center justify-end gap-1 rounded-xl pb-3"
                    style={{ backgroundColor: '#1C2948' }}
                  >
                    <img src="/icons/storage.svg" alt="" className="w-12 h-12 object-contain" />
                    <span className="text-white font-bold text-2xl" style={{ letterSpacing: '0.25em', paddingLeft: '0.25em' }}>保管</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-between px-1 py-1">
                    <span className="text-6xl font-bold" style={{ color: '#1C2948' }}>
                      {formatTime(completionTime.time)}
                    </span>
                    <div className="flex gap-2 w-full">
                      <button
                        className="flex-1 bg-white rounded-lg py-2 text-center font-bold text-lg shadow-sm border-2 border-gray-200 active:bg-gray-100"
                        style={{ color: '#1C2948', letterSpacing: '0.25em', paddingLeft: '0.25em' }}
                        onClick={() => setClockTarget('completion')}
                      >
                        修正
                      </button>
                      <button
                        className="flex-1 bg-white rounded-lg py-2 text-center font-bold text-lg shadow-sm border-2 border-red-300 active:bg-red-50"
                        style={{ color: '#D3170A', letterSpacing: '0.25em', paddingLeft: '0.25em' }}
                        onClick={() => handleCancelStep('completion')}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`flex gap-3 transition-opacity ${step !== 3 || !completionOdo.trim() ? 'opacity-35 pointer-events-none' : ''}`}>
                  <button
                    onClick={step === 3 && completionOdo.trim() ? handleTransportComplete : undefined}
                    disabled={step !== 3 || loading || !completionOdo.trim()}
                    className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-5 font-bold text-xl"
                    style={{ backgroundColor: '#71A9F7' }}
                  >
                    <img src="/icons/completion.svg" alt="" className="w-10 h-10 object-contain" />
                    <span className="text-white text-xl font-bold" style={{ letterSpacing: '0.25em', paddingLeft: '0.25em' }}>完了</span>
                  </button>
                  <button
                    onClick={step === 3 && completionOdo.trim() ? handleStorage : undefined}
                    disabled={step !== 3 || loading || !completionOdo.trim()}
                    className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-5 font-bold text-xl"
                    style={{ backgroundColor: '#71A9F7' }}
                  >
                    <img src="/icons/storage.svg" alt="" className="w-12 h-12 object-contain" />
                    <span className="text-white text-xl font-bold" style={{ letterSpacing: '0.25em', paddingLeft: '0.25em' }}>保管</span>
                  </button>
                </div>
              )}
            </>

            {/* ─── 帰社高速 ─── */}
            {!isStoredDispatch && (
              <HighwayInput
                label="帰社高速"
                value={returnHighway}
                onChange={setReturnHighway}
                disabled={step < 4 || step >= 5}
              />
            )}

          </>
        )}

        {/* ─── 帰社ボタン（保管時はスキップ） ─── */}
        {!(mode === 'transport' && isStoredDispatch) && (
          <div ref={returnBtnRef}>
            <ActionButton
              iconSrc="/icons/return-truck.svg"
              label="帰社"
              isActive={mode === 'transport' ? step === 4 : step === 3}
              isPressed={mode === 'transport' ? step >= 5 : step >= 4}
              isDisabled={mode === 'transport' ? step !== 4 : step !== 3}
              time={returnTime?.time}
              onPress={handleReturn}
              onCorrect={() => setClockTarget('return')}
              onCancel={() => handleCancelStep('return')}
              loading={loading && (mode === 'transport' ? step === 4 : step === 3)}
            />
          </div>
        )}

        {/* ─── 出動記録へ ─── */}
        {dispatchId && (
          <div ref={recordBtnRef}>
            <button
              onClick={recordReady ? () => router.push(`/dispatch/${dispatchId}/record`) : undefined}
              disabled={!recordReady}
              className="w-full flex items-center justify-center gap-3 rounded-xl py-5 font-bold text-2xl transition-opacity"
              style={{
                backgroundColor: '#D7AF70',
                color: '#1C2948',
                opacity: recordReady ? 1 : 0.35,
                cursor: recordReady ? 'pointer' : 'not-allowed',
              }}
            >
              <span>出動記録へ</span>
              <IoIosArrowDroprightCircle className="text-3xl" />
            </button>
          </div>
        )}
      </div>

      {/* ─── Clock Picker ─── */}
      {clockTarget && (() => {
        const { minTime, maxTime } = getClockConstraints(clockTarget)
        return (
          <ClockPicker
            value={getClockValue()}
            onChange={handleTimeCorrection}
            onClose={() => setClockTarget(null)}
            minTime={minTime}
            maxTime={maxTime}
          />
        )
      })()}
    </div>
  )
}
