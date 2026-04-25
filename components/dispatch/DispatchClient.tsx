'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Session } from 'next-auth'
import { IoMdCamera, IoIosArrowBack, IoIosArrowForward } from 'react-icons/io'
import { MdPeopleAlt } from 'react-icons/md'
import ClockPicker from './ClockPicker'
import OdoDialInput from '@/components/common/OdoDialInput'
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
  arrivalOdo: number | null
  transportStartOdo: number | null
  completionOdo: number | null
  returnOdo: number | null
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
  transferStatus: string | null
  transferredFromId: string | null
  transferredToUserName: string | null
  transferredToDispatchNumber: string | null
  transferredFromUserName: string | null
  vehicleId: string | null
}

interface DispatchClientProps {
  assistanceId: string
  dispatchType: 'onsite' | 'transport'
  session: Session
  initialDispatch?: SerializedDispatch | null
  initialVehicleId?: string | null
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
        <div className="flex-1 flex flex-col items-center justify-end px-1">
          <span className="mb-1 text-6xl font-bold" style={{ color: '#1C2948' }}>
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
  // GPS 自動取得は廃止（ODO メーター手動記録に変更）。
  // 関数シグネチャは維持し、常に null を返す no-op 実装。
  return Promise.resolve(null)
}

// -------------------------------------------------------
// Main component
// -------------------------------------------------------

export default function DispatchClient({
  assistanceId,
  dispatchType,
  session: _session,
  initialDispatch,
  initialVehicleId,
}: DispatchClientProps) {
  const router = useRouter()

  // 既存出動の vehicleId を優先、なければ user.vehicleId を fallback
  const vehicleId = initialDispatch?.vehicleId ?? initialVehicleId ?? null

  const [mode, setMode] = useState<'onsite' | 'transport'>(dispatchType)
  const initStep = getInitialStep(initialDispatch)
  const [step, setStep] = useState(initStep)
  const [dispatchId, setDispatchId] = useState<string | null>(initialDispatch?.id ?? null)
  const [dispatchNumber, setDispatchNumber] = useState<string | null>(
    initialDispatch?.dispatchNumber ?? null
  )
  const [departureOdo, setDepartureOdo] = useState<number | null>(
    initialDispatch?.departureOdo ?? null
  )
  const [arrivalOdo, setArrivalOdo] = useState<number | null>(
    initialDispatch?.arrivalOdo ?? null
  )
  const [transportStartOdo, setTransportStartOdo] = useState<number | null>(
    initialDispatch?.transportStartOdo ?? null
  )
  const [completionOdo, setCompletionOdo] = useState<number | null>(
    initialDispatch?.completionOdo ?? null
  )
  const [returnOdo, setReturnOdo] = useState<number | null>(
    initialDispatch?.returnOdo ?? null
  )
  const [lastReturnOdo, setLastReturnOdo] = useState<number | null>(null)
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

  // ── 振替状態 ──
  const [transferPending, setTransferPending] = useState(
    initialDispatch?.transferStatus === 'PENDING'
  )
  const [transferCompleted, setTransferCompleted] = useState(false)
  const isTransferred = initialDispatch?.status === 'TRANSFERRED'
  const isTransferredIn = !!initialDispatch?.transferredFromId

  // ── 前回帰社 ODO 取得（出発 ODO の placeholder 初期値） ──
  useEffect(() => {
    if (!vehicleId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/dispatches/last-return-odo?vehicleId=${encodeURIComponent(vehicleId)}`
        )
        if (!res.ok) return
        const data = (await res.json()) as { lastReturnOdo: number | null }
        if (!cancelled) setLastReturnOdo(data.lastReturnOdo ?? null)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [vehicleId])

  // 振替完了ポーリング（30秒間隔、PENDING 時のみ）
  useEffect(() => {
    if (!transferPending || !dispatchId) return
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/dispatches/${dispatchId}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'TRANSFERRED') {
          setTransferCompleted(true)
          clearInterval(poll)
          setTimeout(() => router.push('/'), 3000)
        }
      } catch { /* ignore */ }
    }, 30000)
    return () => clearInterval(poll)
  }, [transferPending, dispatchId, router])

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

  // ── ODO placeholder chain ──
  // 各 ODO の value が null のとき、前段 ODO の値をそのまま薄く表示する推奨値
  // 前段も null の場合はその段の placeholder を参照（連鎖）
  const departurePlaceholder: number =
    departureOdo ?? (lastReturnOdo !== null ? lastReturnOdo : 0)
  const arrivalPlaceholder: number =
    arrivalOdo ?? departurePlaceholder
  const transportStartPlaceholder: number =
    transportStartOdo ?? arrivalPlaceholder
  const completionPlaceholder: number = mode === 'transport'
    ? (completionOdo ?? transportStartPlaceholder)
    : (completionOdo ?? arrivalPlaceholder)
  const returnPlaceholder: number =
    returnOdo ?? completionPlaceholder

  // ── 単調増加違反の判定（前 ODO より小さい値で入力されているか） ──
  const isViolation = (prev: number | null, curr: number | null) =>
    prev !== null && curr !== null && curr < prev
  const arrivalViolation = isViolation(departureOdo, arrivalOdo)
  const transportStartViolation = isViolation(arrivalOdo, transportStartOdo)
  const completionViolation = mode === 'transport'
    ? isViolation(transportStartOdo, completionOdo)
    : isViolation(arrivalOdo, completionOdo)
  const returnViolation = isViolation(completionOdo, returnOdo)

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
            departureOdo: departureOdo ?? null,
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
            departureOdo: departureOdo ?? null,
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
          arrivalOdo: arrivalOdo ?? null,
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
  }, [step, dispatchId, loading, recoveryHighway, arrivalOdo])

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
          completionOdo: completionOdo ?? null,
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
          transportStartOdo: transportStartOdo ?? null,
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
  }, [step, dispatchId, loading, transportStartOdo])

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
          completionOdo: completionOdo ?? null,
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
          returnOdo: returnOdo ?? null,
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
  }, [step, mode, dispatchId, loading, returnHighway, returnOdo])

  // 搬送専用: 保管（step 4 で選択 → 押下時刻を returnTime として記録 → 出動記録へ）
  const handleStorageAtReturn = useCallback(async () => {
    if (step !== 4 || !dispatchId || loading) return
    setLoading(true)
    try {
      const now = new Date()

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

      await offlineFetch(`/api/dispatches/${dispatchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnTime: now.toISOString(),
          returnOdo: returnOdo ?? null,
          status: 'STORED',
          deliveryType: 'STORAGE',
        }),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: dispatchId,
      })

      setReturnTime({ time: now })
      setIsStoredDispatch(true)
      setStep(5)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [step, dispatchId, loading, returnHighway, returnOdo])

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
          fields: { arrivalTime: null, arrivalGpsLat: null, arrivalGpsLng: null, arrivalOdo: null, status: 'DISPATCHED' },
          prevStep: 1,
          resetState: () => { setArrivalTime(null); setArrivalOdo(null) },
        },
        transportStart: {
          fields: { transportStartTime: null, transportStartOdo: null, status: 'ONSITE' },
          prevStep: 2,
          resetState: () => { setTransportStartTime(null); setTransportStartOdo(null) },
        },
        completion: {
          fields: {
            completionTime: null, completionOdo: null, deliveryType: null,
            status: mode === 'transport' ? 'TRANSPORTING' : 'ONSITE',
          },
          prevStep: mode === 'transport' ? 3 : 2,
          resetState: () => { setCompletionTime(null); setCompletionOdo(null); setIsStoredDispatch(false) },
        },
        return: {
          fields: isStoredDispatch
            ? { returnTime: null, returnOdo: null, status: 'COMPLETED', deliveryType: null }
            : { returnTime: null, returnOdo: null, status: 'COMPLETED' },
          prevStep: mode === 'transport' ? 4 : 3,
          resetState: () => {
            setReturnTime(null)
            setReturnOdo(null)
            if (isStoredDispatch) setIsStoredDispatch(false)
          },
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
    [dispatchId, loading, mode, isStoredDispatch]
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
    if (step === 2) return { iconSrc: '/icons/work.svg', label: '作業中', color: '#ea7600' }
    return { iconSrc: '/icons/transportation.svg', label: '搬送中', color: '#71A9F7' }
  })()

  const showStatusBar = mode === 'transport' ? step <= 4 : step <= 3

  // 出動記録へボタンの有効条件: 帰社済み
  const recordReady = mode === 'transport' ? step >= 5 : step >= 4

  // ── Render ──

  return (
    <div className="h-dvh flex flex-col" style={{ backgroundColor: mode === 'onsite' ? '#FFF3E0' : '#C6D8FF' }}>
      {/* ─── Header ─── */}
      <header
        className="px-4 py-3 flex items-center gap-3 flex-shrink-0"
        style={{ backgroundColor: '#1C2948' }}
      >
        <button
          onClick={() => router.push('/')}
          className="text-white p-1 -ml-1 rounded-lg active:opacity-60"
        >
          <IoIosArrowBack className="w-6 h-6" />
        </button>
        <span className="text-white text-sm opacity-50 font-medium">出動画面</span>
      </header>

      {/* ─── Status bar (固定) ─── */}
      {showStatusBar && (
        <div className="flex-shrink-0 px-4 pt-4 pb-1" style={{ backgroundColor: mode === 'onsite' ? '#FFF3E0' : '#C6D8FF' }}>
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

      {/* ─── TRANSFERRED 読み取り専用バナー ─── */}
      {isTransferred && (
        <div className="flex-shrink-0 px-4 pt-2">
          <div className="bg-gray-500 text-white rounded-lg px-4 py-3 text-center">
            <p className="font-bold text-lg">振替済み</p>
            {initialDispatch?.transferredToDispatchNumber && (
              <p className="text-sm mt-1 opacity-80">
                振替先: {initialDispatch.transferredToDispatchNumber}（{initialDispatch.transferredToUserName}）
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── 振替案件ラベル ─── */}
      {isTransferredIn && (
        <div className="flex-shrink-0 px-4 pt-2">
          <div className="rounded-lg px-4 py-2 text-center text-sm font-bold text-white" style={{ backgroundColor: '#2FBF71' }}>
            振替案件{initialDispatch?.transferredFromUserName ? `（${initialDispatch.transferredFromUserName} より）` : ''}
          </div>
        </div>
      )}

      {/* ─── Main scroll area ─── */}
      <div className="flex-1 px-4 py-3 pb-10 space-y-3 overflow-y-auto">

        {/* ─── Type toggle ─── */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (step === 0) {
                setMode('onsite')
              } else if (mode !== 'onsite' && dispatchId) {
                const msg = step > 2
                  ? '現場対応に切り替えますか？ステータスが現着後に戻り、完了時刻・帰社時刻等はリセットされます。'
                  : '現場対応に切り替えますか？既存のデータは保持されます。'
                if (window.confirm(msg)) {
                  offlineFetch(`/api/dispatches/${dispatchId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'onsite' }),
                    offlineActionType: 'dispatch_update',
                    offlineDispatchId: dispatchId,
                  }).then((res) => {
                    if (res.ok) {
                      setMode('onsite')
                      if (step > 2) {
                        setStep(2)
                        setTransportStartTime(null)
                        setCompletionTime(null)
                        setReturnTime(null)
                        setTransportStartOdo(null)
                        setCompletionOdo(null)
                        setReturnOdo(null)
                        setIsStoredDispatch(false)
                      }
                    }
                  }).catch(console.error)
                }
              }
            }}
            className="flex-1 py-3 rounded-lg font-bold text-base text-white"
            style={{
              backgroundColor: mode === 'onsite' ? '#ea7600' : '#71A9F7',
              opacity: 1,
              letterSpacing: '0.1em',
              paddingLeft: '0.1em',
            }}
          >
            現場対応
          </button>
          <button
            onClick={() => {
              if (step === 0) {
                setMode('transport')
              } else if (mode !== 'transport' && dispatchId) {
                const msg = step > 2
                  ? '搬送に切り替えますか？ステータスが現着後に戻り、完了時刻・帰社時刻等はリセットされます。'
                  : '搬送に切り替えますか？既存のデータは保持されます。'
                if (window.confirm(msg)) {
                  offlineFetch(`/api/dispatches/${dispatchId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'transport' }),
                    offlineActionType: 'dispatch_update',
                    offlineDispatchId: dispatchId,
                  }).then((res) => {
                    if (res.ok) {
                      setMode('transport')
                      if (step > 2) {
                        setStep(2)
                        setTransportStartTime(null)
                        setCompletionTime(null)
                        setReturnTime(null)
                        setTransportStartOdo(null)
                        setCompletionOdo(null)
                        setReturnOdo(null)
                        setIsStoredDispatch(false)
                      }
                    }
                  }).catch(console.error)
                }
              }
            }}
            className="flex-1 py-3 rounded-lg font-bold text-base text-white"
            style={{
              backgroundColor: mode === 'transport' ? '#1C2948' : '#71A9F7',
              opacity: 1,
              letterSpacing: '0.25em',
              paddingLeft: '0.25em',
            }}
          >
            搬送
          </button>
        </div>

        {/* ─── ODO（出発時） ─── */}
        <OdoDialInput
          label="出発"
          value={departureOdo}
          onChange={setDepartureOdo}
          disabled={step > 0}
          placeholder={departurePlaceholder}
        />

        {/* ─── 出動ボタン ─── */}
        <div ref={dispatchBtnRef}>
          <ActionButton
            iconSrc="/icons/dispatch-truck.svg"
            label="出動"
            isActive={step === 0}
            isPressed={step >= 1}
            isDisabled={step > 0 || (step === 0 && departureOdo === null)}
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

        {/* ─── ODO（現着時） ─── */}
        <OdoDialInput
          label="現着"
          value={arrivalOdo}
          onChange={setArrivalOdo}
          disabled={step !== 1}
          placeholder={arrivalPlaceholder}
        />
        {arrivalViolation && (
          <p className="text-red-600 text-xs font-bold px-1 -mt-1">
            前のODOより小さい値です
          </p>
        )}

        {/* ─── 現着ボタン ─── */}
        <div ref={arrivalBtnRef}>
          <ActionButton
            iconSrc="/icons/arrival.svg"
            iconClassName="-translate-y-1"
            label="現着"
            isActive={step === 1}
            isPressed={step >= 2}
            isDisabled={step !== 1 || (step === 1 && arrivalOdo === null)}
            time={arrivalTime?.time}
            onPress={handleArrival}
            onCorrect={() => setClockTarget('arrival')}
            onCancel={() => handleCancelStep('arrival')}
            loading={loading && step === 1}
          />
        </div>

        {/* ─── 振替ボタン（現着後に表示・共通） ─── */}
        {transferPending ? (
          /* 振替待ち中 */
          transferCompleted ? (
            <div
              className="w-full h-[72px] flex items-center justify-center gap-4 rounded-xl font-bold text-3xl"
              style={{ backgroundColor: '#2FBF71' }}
            >
              <MdPeopleAlt className="w-12 h-12 text-white scale-x-[-1]" />
              <span className="text-white">振替が完了しました</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                className="w-full h-[72px] flex items-center justify-center gap-4 rounded-xl font-bold text-3xl"
                style={{ backgroundColor: '#2FBF71' }}
              >
                <MdPeopleAlt className="w-12 h-12 text-white scale-x-[-1]" />
                <span className="text-white">振替待ち中...</span>
              </div>
              <button
                onClick={async () => {
                  if (!dispatchId) return
                  try {
                    const res = await offlineFetch(`/api/dispatches/${dispatchId}/transfer/cancel`, {
                      method: 'POST',
                      offlineActionType: 'transfer_cancel',
                      offlineDispatchId: dispatchId,
                    })
                    if (res.ok) setTransferPending(false)
                  } catch (e) { console.error(e) }
                }}
                className="w-full py-3 rounded-lg font-bold text-lg text-center bg-white border-2 border-red-300 active:bg-red-50"
                style={{ color: '#D3170A' }}
              >
                振替キャンセル
              </button>
            </div>
          )
        ) : (
          <button
            disabled={step < 2 || isTransferred}
            onClick={async () => {
              if (!dispatchId || step < 2) return
              if (!window.confirm('この案件を他の隊員に振り替えますか？')) return
              try {
                const res = await offlineFetch(`/api/dispatches/${dispatchId}/transfer`, {
                  method: 'POST',
                  offlineActionType: 'transfer_request',
                  offlineDispatchId: dispatchId,
                })
                if (res.ok) setTransferPending(true)
              } catch (e) { console.error(e) }
            }}
            className={`w-full h-[72px] flex items-center justify-center gap-4 rounded-xl font-bold text-3xl transition-opacity ${step < 2 || isTransferred ? 'opacity-35' : 'active:brightness-90'}`}
            style={{ backgroundColor: '#2FBF71', cursor: step < 2 || isTransferred ? 'not-allowed' : 'pointer' }}
          >
            <MdPeopleAlt className="w-12 h-12 text-white scale-x-[-1]" />
            <span className="text-white" style={{ letterSpacing: '0.25em', paddingLeft: '0.25em' }}>振替</span>
          </button>
        )}

        {/* ─── 作業確認書（Phase 6） ─── */}
        <button
          disabled={step < 2 || isTransferred}
          onClick={() => { if (step >= 2 && !isTransferred) router.push(`/dispatch/${dispatchId}/confirmation`) }}
          className="w-full h-[72px] flex items-center justify-center gap-4 rounded-xl font-bold text-3xl active:brightness-90 transition-all"
          style={{
            backgroundColor: '#71A9F7',
            opacity: step < 2 || isTransferred ? 0.35 : 1,
            cursor: step < 2 || isTransferred ? 'not-allowed' : 'pointer',
          }}
        >
          <img src="/icons/confirmation.svg" alt="" className="w-10 h-10 object-contain" />
          <span className="text-white" style={{ letterSpacing: '0.1em', paddingLeft: '0.1em' }}>作業確認書</span>
        </button>

        {/* ─── 写真（Phase 10） ─── */}
        <button
          disabled={step < 2 || isTransferred}
          onClick={() => { if (!isTransferred) openCamera() }}
          className="w-full h-[72px] flex items-center justify-center gap-4 rounded-xl font-bold text-3xl active:brightness-90 transition-all"
          style={{
            backgroundColor: '#71A9F7',
            opacity: step < 2 || isTransferred ? 0.35 : 1,
            cursor: step < 2 || isTransferred ? 'not-allowed' : 'pointer',
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
            <OdoDialInput
              label="完了"
              value={completionOdo}
              onChange={setCompletionOdo}
              disabled={step !== 2}
              placeholder={completionPlaceholder}
            />
            {completionViolation && (
              <p className="text-red-600 text-xs font-bold px-1 -mt-1">
                前のODOより小さい値です
              </p>
            )}

            {/* ─── 完了ボタン ─── */}
            <div ref={completionBtnRef}>
              <ActionButton
                iconSrc="/icons/completion.svg"
                iconSize="w-10 h-10"
                label="完了"
                isActive={step === 2}
                isPressed={step >= 3}
                isDisabled={step !== 2 || (step === 2 && completionOdo === null)}
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
            {/* ODO（搬開時） — step 2 でアクティブ */}
            <OdoDialInput
              label="搬開"
              value={transportStartOdo}
              onChange={setTransportStartOdo}
              disabled={step !== 2}
              placeholder={transportStartPlaceholder}
            />
            {transportStartViolation && (
              <p className="text-red-600 text-xs font-bold px-1 -mt-1">
                前のODOより小さい値です
              </p>
            )}

            {/* 搬送開始 — step 2 でアクティブ */}
            <div ref={completionBtnRef}>
              <ActionButton
                iconSrc="/icons/transportation-start.svg"
                label="搬送開始"
                isActive={step === 2}
                isPressed={step >= 3}
                isDisabled={step !== 2 || (step === 2 && transportStartOdo === null)}
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
              <OdoDialInput
                label="完了"
                value={completionOdo}
                onChange={setCompletionOdo}
                disabled={step !== 3}
                placeholder={completionPlaceholder}
              />
              {completionViolation && (
                <p className="text-red-600 text-xs font-bold px-1 -mt-1">
                  前のODOより小さい値です
                </p>
              )}

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
                  <div className="flex-1 flex flex-col items-center justify-end px-1">
                    <span className="mb-1 text-6xl font-bold" style={{ color: '#1C2948' }}>
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
                  <div className="flex-1 flex flex-col items-center justify-end px-1">
                    <span className="mb-1 text-6xl font-bold" style={{ color: '#1C2948' }}>
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
                <button
                  onClick={step === 3 && completionOdo !== null ? handleTransportComplete : undefined}
                  disabled={step !== 3 || loading || completionOdo === null}
                  className="w-full h-[72px] flex items-center justify-center gap-4 rounded-xl font-bold text-3xl transition-all active:scale-[0.97]"
                  style={{
                    backgroundColor: '#71A9F7',
                    opacity: step !== 3 || completionOdo === null ? 0.35 : 1,
                  }}
                >
                  <img src="/icons/completion.svg" alt="" className="w-10 h-10 object-contain" />
                  <span style={{ color: 'white', letterSpacing: '0.25em', paddingLeft: '0.25em' }}>完了</span>
                </button>
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

        {/* ─── ODO（帰社時） ─── */}
        {!(mode === 'transport' && isStoredDispatch) && (() => {
          const returnActiveStep = mode === 'transport' ? 4 : 3
          return (
            <>
              <OdoDialInput
                label="帰社"
                value={returnOdo}
                onChange={setReturnOdo}
                disabled={step !== returnActiveStep}
                placeholder={returnPlaceholder}
              />
              {returnViolation && (
                <p className="text-red-600 text-xs font-bold px-1 -mt-1">
                  前のODOより小さい値です
                </p>
              )}
            </>
          )
        })()}

        {/* ─── 帰社ボタン（保管時はスキップ） ─── */}
        {!(mode === 'transport' && isStoredDispatch) && (
          <div ref={returnBtnRef}>
            {mode === 'transport' && step === 4 ? (
              /* step 4 「帰社」「保管」2択（押下前のみ表示） */
              <div className={`flex gap-3 transition-opacity ${returnOdo === null ? 'opacity-35 pointer-events-none' : ''}`}>
                <button
                  onClick={returnOdo !== null ? handleReturn : undefined}
                  disabled={loading || returnOdo === null}
                  className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-5 font-bold text-xl"
                  style={{ backgroundColor: '#71A9F7' }}
                >
                  <img src="/icons/return-truck.svg" alt="" className="w-12 h-12 object-contain" />
                  <span className="text-white text-xl font-bold" style={{ letterSpacing: '0.25em', paddingLeft: '0.25em' }}>帰社</span>
                </button>
                <button
                  onClick={returnOdo !== null ? handleStorageAtReturn : undefined}
                  disabled={loading || returnOdo === null}
                  className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-5 font-bold text-xl"
                  style={{ backgroundColor: '#71A9F7' }}
                >
                  <img src="/icons/storage.svg" alt="" className="w-12 h-12 object-contain" />
                  <span className="text-white text-xl font-bold" style={{ letterSpacing: '0.25em', paddingLeft: '0.25em' }}>保管</span>
                </button>
              </div>
            ) : (
              <ActionButton
                iconSrc="/icons/return-truck.svg"
                label="帰社"
                isActive={mode === 'transport' ? step === 4 : step === 3}
                isPressed={mode === 'transport' ? step >= 5 : step >= 4}
                isDisabled={(mode === 'transport' ? step !== 4 : step !== 3) || (returnOdo === null)}
                time={returnTime?.time}
                onPress={handleReturn}
                onCorrect={() => setClockTarget('return')}
                onCancel={() => handleCancelStep('return')}
                loading={loading && (mode === 'transport' ? step === 4 : step === 3)}
              />
            )}
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
              <IoIosArrowForward className="text-3xl" />
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
