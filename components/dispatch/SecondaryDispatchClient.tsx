'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Session } from 'next-auth'
import { ChevronLeft } from 'lucide-react'
import { IoIosArrowDroprightCircle } from 'react-icons/io'
import ClockPicker from './ClockPicker'
import OdoDialInput from '@/components/common/OdoDialInput'
import { offlineFetch } from '@/lib/offline-fetch'

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface SerializedParentDispatch {
  id: string
  dispatchNumber: string
  assistanceId: string
  status: string
  completionOdo: number | null
}

interface SerializedSecondaryDispatch {
  id: string
  dispatchNumber: string
  status: string
  departureOdo: number | null
  completionOdo: number | null
  dispatchTime: string | null
  arrivalTime: string | null
  completionTime: string | null
  returnTime: string | null
}

interface Props {
  parentDispatch: SerializedParentDispatch
  initialSecondary: SerializedSecondaryDispatch | null
  session: Session
}

// -------------------------------------------------------
// Step 定義
// 0: 初期（2次出動前）
// 1: 出動後
// 2: 現着後
// 3: 完了後
// 4: 帰社後
// -------------------------------------------------------

function getInitialStep(d: SerializedSecondaryDispatch | null): number {
  if (!d) return 0
  if (d.returnTime) return 4
  if (d.completionTime) return 3
  if (d.arrivalTime) return 2
  if (d.dispatchTime) return 1
  return 0
}

// -------------------------------------------------------
// HighwayInput（1次搬送と同一）
// -------------------------------------------------------

function HighwayInput({ value, onChange, disabled, label }: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  label: string
}) {
  return (
    <div className={`flex items-center gap-3 px-1 transition-opacity ${disabled ? 'opacity-40' : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/etc.svg"
        alt=""
        className="w-10 h-10 object-contain flex-shrink-0"
        style={{ filter: 'brightness(0) saturate(100%) invert(12%) sepia(50%) saturate(800%) hue-rotate(200deg) brightness(90%)' }}
      />
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
// ActionButton（1次搬送と同一: onCorrect 対応）
// -------------------------------------------------------

interface ActionButtonProps {
  iconSrc?: string
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
  const bgColor = isPressed ? '#1C2948' : '#71A9F7'
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
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconSrc} alt="" className={`${iconSize} object-contain ${iconClassName ?? ''}`} />
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
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconSrc} alt="" className={`${iconSize} object-contain ${iconClassName ?? ''}`} />
      )}
      <span style={{ color: 'white', letterSpacing: tracking, paddingLeft: tracking }}>
        {loading && isActive ? '処理中...' : label}
      </span>
    </button>
  )
}

// -------------------------------------------------------
// Main component
// -------------------------------------------------------

export default function SecondaryDispatchClient({ parentDispatch, initialSecondary, session: _session }: Props) {
  const router = useRouter()

  const [step, setStep] = useState(getInitialStep(initialSecondary))
  const [secondaryId, setSecondaryId] = useState<string | null>(initialSecondary?.id ?? null)
  const [departureOdo, setDepartureOdo] = useState<number | null>(initialSecondary?.departureOdo ?? null)
  const [completionOdo, setCompletionOdo] = useState<number | null>(initialSecondary?.completionOdo ?? null)

  // ── ODO placeholder chain ──
  // 各 ODO の value が null のとき、前段 ODO の値をそのまま薄く表示
  // 2次搬送の出発は親 Dispatch の完了 ODO を初期値とする
  const secondaryDeparturePlaceholder: number =
    departureOdo ?? (parentDispatch.completionOdo ?? 0)
  const secondaryCompletionPlaceholder: number =
    completionOdo ?? secondaryDeparturePlaceholder

  const [transportHighway, setTransportHighway] = useState('')
  const [returnHighway, setReturnHighway] = useState('')
  const [loading, setLoading] = useState(false)
  const [clockTarget, setClockTarget] = useState<'dispatch' | 'arrival' | 'completion' | 'return' | null>(null)

  // 時刻記録
  const [dispatchTime, setDispatchTime] = useState<Date | null>(
    initialSecondary?.dispatchTime ? new Date(initialSecondary.dispatchTime) : null
  )
  const [arrivalTime, setArrivalTime] = useState<Date | null>(
    initialSecondary?.arrivalTime ? new Date(initialSecondary.arrivalTime) : null
  )
  const [completionTime, setCompletionTime] = useState<Date | null>(
    initialSecondary?.completionTime ? new Date(initialSecondary.completionTime) : null
  )
  const [returnTime, setReturnTime] = useState<Date | null>(
    initialSecondary?.returnTime ? new Date(initialSecondary.returnTime) : null
  )

  // ── Auto scroll refs ──
  const dispatchBtnRef = useRef<HTMLDivElement>(null)
  const arrivalBtnRef = useRef<HTMLDivElement>(null)
  const completeBtnRef = useRef<HTMLDivElement>(null)
  const returnBtnRef = useRef<HTMLDivElement>(null)
  const recordBtnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const refMap: Record<number, React.RefObject<HTMLDivElement | null>> = {
      0: dispatchBtnRef,
      1: arrivalBtnRef,
      2: completeBtnRef,
      3: returnBtnRef,
      4: recordBtnRef,
    }
    const ref = refMap[step]
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [step])

  // ── Handlers ──

  const handleDispatch = useCallback(async () => {
    if (step !== 0 || loading) return
    setLoading(true)
    try {
      const now = new Date()

      // 取消後の再出動: 既存レコードを再利用して欠番を防ぐ
      if (secondaryId) {
        const res = await offlineFetch(`/api/dispatches/${secondaryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dispatchTime: now.toISOString(),
            departureOdo: departureOdo,
            status: 'DISPATCHED',
          }),
          offlineActionType: 'dispatch_update',
          offlineDispatchId: secondaryId,
        })
        if (!res.ok) throw new Error('dispatch update failed')
        setDispatchTime(now)
        setStep(1)
      } else {
        // 初回出動: 新規作成
        const res = await offlineFetch('/api/dispatches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assistanceId: parentDispatch.assistanceId,
            type: 'transport',
            departureOdo: departureOdo,
            dispatchTime: now.toISOString(),
            parentDispatchId: parentDispatch.id,
            isSecondaryTransport: true,
          }),
          offlineActionType: 'dispatch_create',
          offlineDispatchId: parentDispatch.id,
        })
        if (!res.ok) throw new Error('dispatch create failed')
        const data = await res.json()
        setSecondaryId(data.id)
        setDispatchTime(now)
        setStep(1)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [step, loading, secondaryId, parentDispatch.assistanceId, parentDispatch.id, departureOdo])

  const handleArrival = useCallback(async () => {
    if (step !== 1 || !secondaryId || loading) return
    setLoading(true)
    try {
      const now = new Date()
      // 搬送高速を現着タイミングで保存
      if (transportHighway.trim()) {
        await offlineFetch(`/api/dispatches/${secondaryId}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transportHighway: parseInt(transportHighway) }),
          offlineActionType: 'report_save',
          offlineDispatchId: secondaryId,
        }).catch(console.error)
      }
      await offlineFetch(`/api/dispatches/${secondaryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arrivalTime: now.toISOString(), status: 'ONSITE' }),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: secondaryId,
      })
      setArrivalTime(now)
      setStep(2)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [step, secondaryId, loading, transportHighway])

  const handleComplete = useCallback(async () => {
    if (step !== 2 || !secondaryId || loading) return
    setLoading(true)
    try {
      const now = new Date()
      await offlineFetch(`/api/dispatches/${secondaryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completionTime: now.toISOString(),
          completionOdo: completionOdo,
          status: 'COMPLETED',
        }),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: secondaryId,
      })
      setCompletionTime(now)
      setStep(3)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [step, secondaryId, loading, completionOdo])

  const handleReturn = useCallback(async () => {
    if (step !== 3 || !secondaryId || loading) return
    setLoading(true)
    try {
      const now = new Date()
      if (returnHighway.trim()) {
        await offlineFetch(`/api/dispatches/${secondaryId}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnHighway: parseInt(returnHighway) }),
          offlineActionType: 'report_save',
          offlineDispatchId: secondaryId,
        }).catch(console.error)
      }
      // 2次搬送を帰社済みに
      await offlineFetch(`/api/dispatches/${secondaryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTime: now.toISOString(), status: 'RETURNED' }),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: secondaryId,
      })
      // 親を保管から解除 → 下書きに移行（報告兼請求が未完了のため）
      await offlineFetch(`/api/dispatches/${parentDispatch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RETURNED', isDraft: true }),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: parentDispatch.id,
      })
      setReturnTime(now)
      setStep(4)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [step, secondaryId, loading, returnHighway, parentDispatch.id])

  // ── 時刻修正 ──

  const handleTimeCorrection = useCallback(
    async (newDate: Date) => {
      if (!secondaryId || !clockTarget) return
      const fieldMap: Record<string, string> = {
        dispatch: 'dispatchTime',
        arrival: 'arrivalTime',
        completion: 'completionTime',
        return: 'returnTime',
      }
      try {
        await offlineFetch(`/api/dispatches/${secondaryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [fieldMap[clockTarget]]: newDate.toISOString() }),
          offlineActionType: 'dispatch_update',
          offlineDispatchId: secondaryId,
        })
        if (clockTarget === 'dispatch') setDispatchTime(newDate)
        else if (clockTarget === 'arrival') setArrivalTime(newDate)
        else if (clockTarget === 'completion') setCompletionTime(newDate)
        else if (clockTarget === 'return') setReturnTime(newDate)
      } catch (e) {
        console.error(e)
      } finally {
        setClockTarget(null)
      }
    },
    [secondaryId, clockTarget]
  )

  // ── 取消: 時刻をクリアしてステップを戻す ──

  const handleCancelStep = useCallback(
    async (target: 'dispatch' | 'arrival' | 'completion' | 'return') => {
      if (!secondaryId || loading) return
      setLoading(true)

      const configMap: Record<string, { fields: Record<string, unknown>; prevStep: number; resetState: () => void }> = {
        dispatch: {
          fields: { dispatchTime: null, status: 'STANDBY' },
          prevStep: 0,
          resetState: () => setDispatchTime(null),
        },
        arrival: {
          fields: { arrivalTime: null, status: 'DISPATCHED' },
          prevStep: 1,
          resetState: () => setArrivalTime(null),
        },
        completion: {
          fields: { completionTime: null, completionOdo: null, status: 'ONSITE' },
          prevStep: 2,
          resetState: () => setCompletionTime(null),
        },
        return: {
          fields: { returnTime: null, status: 'COMPLETED' },
          prevStep: 3,
          resetState: () => setReturnTime(null),
        },
      }

      const config = configMap[target]
      if (!config) return

      try {
        await offlineFetch(`/api/dispatches/${secondaryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config.fields),
          offlineActionType: 'dispatch_update',
          offlineDispatchId: secondaryId,
        })
        // 帰社取消の場合、親のステータスも保管に戻す
        if (target === 'return') {
          await offlineFetch(`/api/dispatches/${parentDispatch.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'STORED', isDraft: false }),
            offlineActionType: 'dispatch_update',
            offlineDispatchId: parentDispatch.id,
          })
        }
        config.resetState()
        setStep(config.prevStep)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    },
    [secondaryId, loading, parentDispatch.id]
  )

  const getClockValue = (): Date => {
    if (clockTarget === 'dispatch' && dispatchTime) return dispatchTime
    if (clockTarget === 'arrival' && arrivalTime) return arrivalTime
    if (clockTarget === 'completion' && completionTime) return completionTime
    if (clockTarget === 'return' && returnTime) return returnTime
    return new Date()
  }

  // ── 時間制約（前後の時刻で範囲を決定） ──
  const secondaryTimeOrder = ['dispatch', 'arrival', 'completion', 'return'] as const
  const secondaryTimeMap: Record<typeof secondaryTimeOrder[number], Date | null> = {
    dispatch: dispatchTime,
    arrival: arrivalTime,
    completion: completionTime,
    return: returnTime,
  }
  const getClockConstraints = (target: typeof secondaryTimeOrder[number]): { minTime: Date | null; maxTime: Date | null } => {
    const idx = secondaryTimeOrder.indexOf(target)
    let minTime: Date | null = null
    let maxTime: Date | null = null
    for (let i = idx - 1; i >= 0; i--) {
      if (secondaryTimeMap[secondaryTimeOrder[i]]) { minTime = secondaryTimeMap[secondaryTimeOrder[i]]; break }
    }
    for (let i = idx + 1; i < secondaryTimeOrder.length; i++) {
      if (secondaryTimeMap[secondaryTimeOrder[i]]) { maxTime = secondaryTimeMap[secondaryTimeOrder[i]]; break }
    }
    return { minTime, maxTime }
  }

  // ── Status ──

  type StatusConfig = { iconSrc: string; label: string; color: string }
  const statusConfig: StatusConfig = (() => {
    if (step === 0) return { iconSrc: '/icons/stand-by.svg', label: '待機中', color: '#2FBF71' }
    if (step === 1) return { iconSrc: '/icons/dispatch.svg', label: '出動中', color: '#D3170A' }
    if (step === 2) return { iconSrc: '/icons/work.svg', label: '作業中', color: '#F1A900' }
    return { iconSrc: '/icons/transportation.svg', label: '搬送中', color: '#71A9F7' }
  })()

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
      {step <= 3 && (
        <div className="flex-shrink-0 px-4 pt-2 pb-1" style={{ backgroundColor: '#C6D8FF' }}>
          <div className="flex items-center justify-between bg-white rounded-lg px-4 py-2 shadow-md">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={statusConfig.iconSrc} alt="" className="w-6 h-6 object-contain" />
              <span className="font-bold text-base" style={{ color: statusConfig.color }}>
                {statusConfig.label}
              </span>
            </div>
            <span className="text-sm font-bold" style={{ color: '#1C2948', opacity: 0.7 }}>
              {parentDispatch.dispatchNumber}
            </span>
          </div>
        </div>
      )}

      {/* ─── Main scroll area ─── */}
      <div className="flex-1 px-4 py-3 pb-10 space-y-3 overflow-y-auto">

        {/* 2次搬送ラベル */}
        <div className="w-full py-3 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1C2948' }}>
          <span className="text-white font-bold text-xl" style={{ letterSpacing: '0.1em', paddingLeft: '0.1em' }}>2次搬送</span>
        </div>

        {/* ─── ODO（出発） ─── */}
        <OdoDialInput label="搬開" value={departureOdo} onChange={setDepartureOdo} disabled={step > 0} placeholder={secondaryDeparturePlaceholder} />

        {/* ─── 搬送開始ボタン ─── */}
        <div ref={dispatchBtnRef}>
          <ActionButton
            iconSrc="/icons/transportation-start.svg"
            label="搬送開始"
            isActive={step === 0}
            isPressed={step >= 1}
            isDisabled={step > 0 || (step === 0 && departureOdo === null)}
            time={dispatchTime}
            onPress={handleDispatch}
            onCorrect={() => setClockTarget('dispatch')}
            onCancel={() => handleCancelStep('dispatch')}
            loading={loading && step === 0}
          />
        </div>

        {/* ─── 搬送高速 ─── */}
        <HighwayInput
          label="搬送高速"
          value={transportHighway}
          onChange={setTransportHighway}
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
            time={arrivalTime}
            onPress={handleArrival}
            onCorrect={() => setClockTarget('arrival')}
            onCancel={() => handleCancelStep('arrival')}
            loading={loading && step === 1}
          />
        </div>

        {/* ─── ODO（完了） ─── */}
        <OdoDialInput
          label="完了"
          value={completionOdo}
          onChange={setCompletionOdo}
          disabled={step < 2 || step >= 3}
          placeholder={secondaryCompletionPlaceholder}
        />

        {/* ─── 完了ボタン ─── */}
        <div ref={completeBtnRef}>
          <ActionButton
            iconSrc="/icons/completion.svg"
            iconSize="w-10 h-10"
            label="完了"
            isActive={step === 2}
            isPressed={step >= 3}
            isDisabled={step !== 2 || (step === 2 && completionOdo === null)}
            time={completionTime}
            onPress={handleComplete}
            onCorrect={() => setClockTarget('completion')}
            onCancel={() => handleCancelStep('completion')}
            loading={loading && step === 2}
          />
        </div>

        {/* ─── 帰社高速 ─── */}
        <HighwayInput
          label="帰社高速"
          value={returnHighway}
          onChange={setReturnHighway}
          disabled={step < 3 || step >= 4}
        />

        {/* ─── 帰社ボタン ─── */}
        <div ref={returnBtnRef}>
          <ActionButton
            iconSrc="/icons/return-truck.svg"
            label="帰社"
            isActive={step === 3}
            isPressed={step >= 4}
            isDisabled={step !== 3}
            time={returnTime}
            onPress={handleReturn}
            onCorrect={() => setClockTarget('return')}
            onCancel={() => handleCancelStep('return')}
            loading={loading && step === 3}
          />
        </div>

        {/* ─── 報告兼請求項目へ ─── */}
        {secondaryId && (
          <div ref={recordBtnRef}>
            <button
              onClick={step >= 4 ? () => router.push(`/dispatch/${parentDispatch.id}/report?type=transport`) : undefined}
              disabled={step < 4}
              className="w-full flex items-center justify-center gap-3 rounded-xl py-5 font-bold text-2xl transition-opacity"
              style={{
                backgroundColor: '#D7AF70',
                color: '#1C2948',
                opacity: step >= 4 ? 1 : 0.35,
                cursor: step >= 4 ? 'pointer' : 'not-allowed',
              }}
            >
              <span>報告兼請求項目へ</span>
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
