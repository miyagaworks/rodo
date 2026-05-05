'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check } from 'lucide-react'
import { FaPen } from 'react-icons/fa'
import { IoIosArrowForward } from 'react-icons/io'
import { TiHome } from 'react-icons/ti'
import NumberPlateInput, { PlateValue } from './NumberPlateInput'
import ClockPicker from './ClockPicker'
import VehicleSelector from './VehicleSelector'
import { offlineFetch } from '@/lib/offline-fetch'
import { useFormAutoSave } from '@/hooks/useFormAutoSave'
import { usePhotoCapture } from '@/hooks/usePhotoCapture'
import { useVehicles } from '@/hooks/useVehicles'
import { formatCurrentVehicleLabel } from '@/lib/vehicle-label'
import PhotoThumbnails from './PhotoThumbnails'
import PhotoModal from './PhotoModal'
import type { PhotoItem } from './PhotoThumbnails'

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export interface SerializedDispatch {
  id: string
  dispatchNumber: string
  type: 'ONSITE' | 'TRANSPORT'
  assistanceId: string
  dispatchTime: string | null
  arrivalTime: string | null
  completionTime: string | null
  transportStartTime: string | null
  // 既存入力値（下書きから再開時）
  address: string | null
  highwayName: string | null
  highwayDirection: 'UP' | 'DOWN' | null
  kiloPost: number | null
  customerName: string | null
  vehicleName: string | null
  plateRegion: string | null
  plateClass: string | null
  plateKana: string | null
  plateNumber: string | null
  situationType: 'ACCIDENT' | 'BREAKDOWN' | null
  situationDetail: string | null
  canDrive: boolean | null
  deliveryType: 'DIRECT' | 'STORAGE' | null
  memo: string | null
  isHighway: boolean
  weather: string | null
  trafficControl: boolean | null
  parkingLocation: 'EMERGENCY_PARKING' | 'SHOULDER' | 'DRIVING_LANE' | null
  areaIcName: string | null
  insuranceCompanyId: string | null
  isDraft: boolean
  vehicleId: string | null
  vehicle: { plateNumber: string; displayName: string | null } | null
}

interface RecordClientProps {
  dispatch: SerializedDispatch
  userName: string
  /** 報告書が確定済みかどうかの判定に使う。null = 未作成。 */
  report?: { isDraft: boolean } | null
}

interface InsuranceCompany {
  id: string
  name: string
}

// -------------------------------------------------------
// 高速道路マスタ
// -------------------------------------------------------

const HIGHWAY_OPTIONS = [
  'なし',
  '広島高速1号線', '広島高速2号線', '広島高速3号線', '広島高速4号線', '広島高速5号線',
  '広島自動車道', '山陽自動車道', '西広島バイパス', '広島呉道路', '東広島呉自動車道',
  '中国自動車道', '浜田自動車道', '尾道自動車道', '西瀬戸自動車道（しまなみ海道）',
  '松江自動車道', '山陰自動車道', '岡山自動車道', '米子自動車道', '播磨自動車道',
  '今治小松自動車道', '松山自動車道', '高松自動車道', '徳島自動車道', '高知自動車道',
  '瀬戸中央自動車道（瀬戸大橋）', '神戸淡路鳴門自動車道',
  '阪神高速', '第二神明道路', '名神高速道路', '新名神高速道路', '近畿自動車道',
  '西名阪自動車道', '阪和自動車道', '舞鶴若狭自動車道', '京都縦貫自動車道',
  '第二京阪道路', '京滋バイパス', '関西空港自動車道', '南阪奈道路', '第二阪奈道路',
  '関門橋（関門自動車道）', '北九州都市高速', '福岡都市高速', '九州自動車道',
  '東九州自動車道', '大分自動車道', '長崎自動車道', '宮崎自動車道', '九州中央自動車道',
]

// -------------------------------------------------------
// 現場状況マスタ
// -------------------------------------------------------

const ACCIDENT_DETAILS = [
  '高速事故', '事故', '脱輪', '乗り上げ', '横転', '転覆', '路外脱輪', '落車', '2次搬送', 'キャンセル',
]

const BREAKDOWN_DETAILS = [
  '高速故障', '故障', 'バンク', 'スペア交換', 'ジャンピング', '電圧測定', 'ガス欠', 'インロック',
  '事故駆けつけサポート', 'キャンセル',
]

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function formatDate(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}年${m}月${day}日（${days[d.getDay()]}）`
}

function formatTime(iso: string | null): string {
  if (!iso) return '--:--'
  const d = new Date(iso)
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function timeStrToIso(timeStr: string, baseIso: string | null): string {
  const base = baseIso ? new Date(baseIso) : new Date()
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

function plateSummary(plate: PlateValue): string {
  if (!plate.region && !plate.serial) return ''
  let serialDisplay: string
  if (plate.serial.length === 4) {
    serialDisplay = `${plate.serial.slice(0, 2)}-${plate.serial.slice(2)}`
  } else {
    serialDisplay = plate.serial.padStart(4, '・')
  }
  return [plate.region, plate.classNum, plate.kana, serialDisplay].filter(Boolean).join(' ')
}

// -------------------------------------------------------
// Section wrapper
// -------------------------------------------------------

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg shadow-sm p-4 ${className}`}>
      {children}
    </div>
  )
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex items-center gap-1 mb-1.5">
      {required && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#D3170A' }} />}
      <span className="text-xs font-bold" style={{ color: '#1C2948', opacity: 0.6 }}>
        {children}
      </span>
    </div>
  )
}

function ToggleButton({
  label,
  active,
  onClick,
  color = '#1C2948',
}: {
  label: string
  active: boolean
  onClick: () => void
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2.5 rounded-md font-bold text-sm transition-all active:opacity-80"
      style={{
        backgroundColor: active ? color : '#E8EDF5',
        color: active ? 'white' : '#9CA3AF',
      }}
    >
      {label}
    </button>
  )
}

// -------------------------------------------------------
// Main Component
// -------------------------------------------------------

export default function RecordClient({ dispatch, userName, report }: RecordClientProps) {
  const router = useRouter()

  // ── State ──
  const [address, setAddress] = useState(dispatch.address ?? '')
  const [highwayName, setHighwayName] = useState(dispatch.highwayName ?? 'なし')
  const [highwayDirection, setHighwayDirection] = useState<'UP' | 'DOWN' | null>(
    dispatch.highwayDirection ?? null
  )
  const [kiloPost, setKiloPost] = useState(dispatch.kiloPost?.toString() ?? '')
  const [customerName, setCustomerName] = useState(dispatch.customerName ?? '')
  const [vehicleName, setVehicleName] = useState(dispatch.vehicleName ?? '')
  const [plate, setPlate] = useState<PlateValue>({
    region: dispatch.plateRegion ?? '',
    classNum: dispatch.plateClass ?? '',
    kana: dispatch.plateKana ?? '',
    serial: dispatch.plateNumber ?? '',
  })
  const [showPlatePicker, setShowPlatePicker] = useState(false)
  const [situationType, setSituationType] = useState<'ACCIDENT' | 'BREAKDOWN' | null>(
    dispatch.situationType ?? null
  )
  const [situationDetails, setSituationDetails] = useState<string[]>(
    dispatch.situationDetail ? dispatch.situationDetail.split(',') : []
  )
  const [canDrive, setCanDrive] = useState<boolean | null>(dispatch.canDrive ?? null)
  const [deliveryType, setDeliveryType] = useState<'DIRECT' | 'STORAGE' | null>(
    dispatch.deliveryType ?? null
  )
  const [memo, setMemo] = useState(dispatch.memo ?? '')
  const [weather, setWeather] = useState(dispatch.weather ?? '')
  const [trafficControl, setTrafficControl] = useState<boolean | null>(
    dispatch.trafficControl ?? null
  )
  const [parkingLocation, setParkingLocation] = useState<
    'EMERGENCY_PARKING' | 'SHOULDER' | 'DRIVING_LANE' | null
  >(dispatch.parkingLocation ?? null)
  const [areaIcFrom, setAreaIcFrom] = useState(() => {
    if (!dispatch.areaIcName) return ''
    return dispatch.areaIcName.split(' → ')[0] ?? ''
  })
  const [areaIcTo, setAreaIcTo] = useState(() => {
    if (!dispatch.areaIcName) return ''
    return dispatch.areaIcName.split(' → ')[1] ?? ''
  })
  const [insuranceCompanyId, setInsuranceCompanyId] = useState(
    dispatch.insuranceCompanyId ?? ''
  )
  const [vehicleId, setVehicleId] = useState<string | null>(dispatch.vehicleId ?? null)
  const [editingVehicle, setEditingVehicle] = useState(false)
  const { vehicles: allVehicles } = useVehicles()
  const currentVehicleLabel = (() => {
    if (!vehicleId) return '---'
    const v = allVehicles.find((x) => x.id === vehicleId)
    if (v) return formatCurrentVehicleLabel(v)
    // fallback: SSR から流された dispatch.vehicle（vehicles fetch 前の初期表示）
    if (dispatch.vehicle && dispatch.vehicleId === vehicleId) {
      return formatCurrentVehicleLabel(dispatch.vehicle)
    }
    return '---'
  })()
  const [loading, setLoading] = useState(false)
  const [insuranceCompanies, setInsuranceCompanies] = useState<InsuranceCompany[]>([])
  const [workStartStr, setWorkStartStr] = useState<string | null>(
    dispatch.arrivalTime ? formatTime(dispatch.arrivalTime) : null
  )
  const [workEndStr, setWorkEndStr] = useState<string | null>(() => {
    const endIso = dispatch.type === 'ONSITE' ? dispatch.completionTime : dispatch.transportStartTime
    return endIso ? formatTime(endIso) : null
  })
  const [showWorkStartPicker, setShowWorkStartPicker] = useState(false)
  const [showWorkEndPicker, setShowWorkEndPicker] = useState(false)

  // ── 写真（Phase 10） ──
  const { photos, removePhoto } = usePhotoCapture(dispatch.id)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null)

  // ── 損保会社ロード ──
  useEffect(() => {
    fetch(`/api/insurance-companies?assistanceId=${dispatch.assistanceId}`)
      .then((res) => res.json())
      .then((data: InsuranceCompany[]) => {
        if (Array.isArray(data)) setInsuranceCompanies(data)
      })
      .catch(console.error)
  }, [dispatch.assistanceId])

  // ── 作業時間（手動上書き対応） ──
  const workTime = useMemo(() => {
    if (!workStartStr || !workEndStr) return null
    const [sh, sm] = workStartStr.split(':').map(Number)
    const [eh, em] = workEndStr.split(':').map(Number)
    const startMin = sh * 60 + sm
    const endMin = eh * 60 + em
    const minutes = Math.max(0, endMin - startMin)
    return { start: workStartStr, end: workEndStr, minutes }
  }, [workStartStr, workEndStr])

  // ── 高速情報セクション表示判定 ──
  const showHighwaySection = highwayName !== 'なし' && highwayName !== ''

  // ── 必須チェック ──
  const isPlateComplete = plate.region !== '' && plate.serial !== ''
  const isInsuranceComplete = insuranceCompanyId !== ''
  const isComplete = isPlateComplete && isInsuranceComplete

  // ── 詳細リスト（事故/故障切り替え） ──
  const detailList = situationType === 'ACCIDENT' ? ACCIDENT_DETAILS : BREAKDOWN_DETAILS

  // ── ペイロード構築 ──
  const buildPayload = (isDraft: boolean) => ({
    address: address || null,
    highwayName: highwayName === 'なし' ? null : (highwayName || null),
    highwayDirection: showHighwaySection ? (highwayDirection || null) : null,
    kiloPost: kiloPost ? parseFloat(kiloPost) : null,
    customerName: customerName || null,
    vehicleName: vehicleName || null,
    plateRegion: plate.region || null,
    plateClass: plate.classNum || null,
    plateKana: plate.kana || null,
    plateNumber: plate.serial || null,
    situationType: situationType || null,
    situationDetail: situationDetails.length > 0 ? situationDetails.join(',') : null,
    canDrive: canDrive,
    deliveryType: deliveryType,
    memo: memo || null,
    isHighway: showHighwaySection,
    weather: showHighwaySection ? (weather || null) : null,
    trafficControl: showHighwaySection ? trafficControl : null,
    parkingLocation: showHighwaySection ? (parkingLocation || null) : null,
    areaIcName:
      showHighwaySection && (areaIcFrom || areaIcTo)
        ? `${areaIcFrom} → ${areaIcTo}`
        : null,
    insuranceCompanyId: insuranceCompanyId || null,
    isDraft,
    vehicleId: vehicleId,
    ...(workStartStr ? { arrivalTime: timeStrToIso(workStartStr, dispatch.arrivalTime) } : {}),
    ...(workEndStr
      ? dispatch.type === 'ONSITE'
        ? { completionTime: timeStrToIso(workEndStr, dispatch.arrivalTime) }
        : { transportStartTime: timeStrToIso(workEndStr, dispatch.arrivalTime) }
      : {}),
  })

  // ── フォーム自動保存（デバウンス1秒） ──
  const { saveFormData, clearDraft } = useFormAutoSave(dispatch.id)

  useEffect(() => {
    saveFormData(buildPayload(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    address, highwayName, highwayDirection, kiloPost, customerName,
    vehicleName, plate, situationType, situationDetails, canDrive,
    deliveryType, memo, weather, trafficControl, parkingLocation,
    areaIcFrom, areaIcTo, insuranceCompanyId, vehicleId,
    workStartStr, workEndStr,
  ])

  // ── 下書き保存 ──
  const handleDraftSave = async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await offlineFetch(`/api/dispatches/${dispatch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(true)),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: dispatch.id,
      })
      if (!res.ok) throw new Error('下書きの保存に失敗しました')
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

  // ── 報告へ進む ──
  const handleProceed = async () => {
    if (!isComplete || loading) return
    setLoading(true)
    try {
      // dispatch.isDraft は維持（true）。最終確定は報告兼請求項目ページの完了押下で
      // report.isDraft=false となった時点に統一する。
      const res = await offlineFetch(`/api/dispatches/${dispatch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(true)),
        offlineActionType: 'dispatch_update',
        offlineDispatchId: dispatch.id,
      })
      if (!res.ok) throw new Error('保存に失敗しました')
      await clearDraft()
      router.push(`/dispatch/${dispatch.id}/report`)
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ──
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#E5E5E5' }}>

      {/* ─── Header ─── */}
      <div
        className="px-4 pt-4 pb-3 shadow-sm flex-shrink-0 sticky top-0 z-30"
        style={{ backgroundColor: '#D7AF70' }}
      >
        {/* 1行目: ホーム / タイトル / バッジ / 日付 */}
        <div className="flex items-center gap-2 mb-2.5">
          <button
            onClick={async () => {
              if (loading) return
              setLoading(true)
              try {
                const res = await offlineFetch(`/api/dispatches/${dispatch.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(buildPayload(true)),
                  offlineActionType: 'dispatch_update',
                  offlineDispatchId: dispatch.id,
                })
                if (!res.ok) throw new Error('下書きの保存に失敗しました')
                await clearDraft()
                router.push('/')
              } catch (e) {
                console.error(e)
                alert(e instanceof Error ? e.message : '保存に失敗しました')
              } finally {
                setLoading(false)
              }
            }}
            disabled={loading}
            aria-label="ホームに戻る"
            className="inline-flex items-center justify-center p-2 rounded-md active:opacity-70 disabled:opacity-50"
            style={{ backgroundColor: '#71A9F7', color: '#FFFFFF' }}
          >
            <TiHome className="w-4 h-4" />
          </button>
          <span className="text-lg font-bold whitespace-nowrap" style={{ color: '#1C2948' }}>出動記録</span>
          <span
            className="text-sm font-bold px-3 py-1 rounded-full whitespace-nowrap"
            style={{
              backgroundColor: dispatch.type === 'ONSITE' ? '#ea7600' : '#1C2948',
              color: 'white',
            }}
          >
            {dispatch.type === 'ONSITE' ? '現場対応' : '搬送'}
          </span>
          <div className="flex-1" />
          <span className="text-xs whitespace-nowrap" style={{ color: '#1C2948' }}>
            {formatDate(dispatch.dispatchTime)}
          </span>
        </div>

        {/* 出動番号 / 出動者 / 車両 */}
        <div className="flex items-center gap-3 text-sm" style={{ color: '#1C2948' }}>
          <span>
            <span style={{ opacity: 0.7 }}>出動番号: </span>
            <span className="font-bold">{dispatch.dispatchNumber}</span>
          </span>
          <span>
            <span style={{ opacity: 0.7 }}>出動者: </span>
            <span className="font-bold">{userName}</span>
          </span>
        </div>

        {/* 車両 */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-sm" style={{ color: '#1C2948', opacity: 0.7 }}>車両</span>
          {editingVehicle ? (
            <div className="flex items-center gap-1.5 flex-1">
              <VehicleSelector
                value={vehicleId}
                onChange={setVehicleId}
                vehicles={allVehicles}
                className="rounded-lg px-2 py-1 text-sm font-bold border"
                style={{ backgroundColor: 'rgba(255,255,255,0.5)', color: '#1C2948', borderColor: 'rgba(28,41,72,0.3)' }}
              />
              <button onClick={() => setEditingVehicle(false)} style={{ color: '#1C2948' }}>
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <span className="font-bold text-sm" style={{ color: '#1C2948' }}>{currentVehicleLabel}</span>
              <button
                onClick={() => setEditingVehicle(true)}
                className="text-xs rounded px-1.5 py-0.5 active:opacity-60 border"
                style={{ color: '#1C2948', borderColor: 'rgba(28,41,72,0.3)' }}
              >
                修正
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── スクロールコンテンツ ─── */}
      <div className="flex-1 overflow-y-auto pb-28 px-3 py-3 space-y-3">

        {/* 写真サムネイル（Phase 10） */}
        <Section>
          <p className="text-xs font-bold mb-2" style={{ color: '#1C2948', opacity: 0.5 }}>
            撮影写真
          </p>
          <PhotoThumbnails
            photos={photos}
            onPhotoClick={(photo) => setSelectedPhoto(photo)}
          />
        </Section>

        {/* ─── 入力セクション ─── */}
        <Section className="space-y-4">
          {/* 現場住所 */}
          <div>
            <FieldLabel>現場住所</FieldLabel>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="住所を入力"
              className="w-full border-2 rounded-lg px-3 py-2.5 text-sm"
              style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
            />
          </div>

          {/* 高速道路 + 上下 + KP */}
          <div>
            <FieldLabel>高速道路</FieldLabel>
            <div className="flex flex-col gap-2">
              <select
                value={highwayName}
                onChange={(e) => {
                  setHighwayName(e.target.value)
                  if (e.target.value === 'なし') setHighwayDirection(null)
                }}
                className="w-full border-2 rounded-lg px-2 py-2.5 text-sm"
                style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
              >
                {HIGHWAY_OPTIONS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              {showHighwaySection && (
                <div className="flex gap-1">
                  {(['UP', 'DOWN'] as const).map((dir) => (
                    <button
                      key={dir}
                      onClick={() => setHighwayDirection(dir)}
                      className="flex-1 py-2.5 rounded-md text-sm font-bold"
                      style={{
                        backgroundColor: highwayDirection === dir ? '#1C2948' : '#E8EDF5',
                        color: highwayDirection === dir ? 'white' : '#9CA3AF',
                      }}
                    >
                      {dir === 'UP' ? '上り' : '下り'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* KP */}
          <div>
            <FieldLabel>KP（キロポスト）</FieldLabel>
            <input
              type="text"
              inputMode="numeric"
              value={kiloPost}
              onChange={(e) => setKiloPost(e.target.value)}
              placeholder="0.0"
              className="w-full border-2 rounded-lg px-3 py-2.5 text-sm"
              style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
            />
          </div>

          {/* 顧客名 */}
          <div>
            <FieldLabel>顧客名</FieldLabel>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="顧客名を入力"
              className="w-full border-2 rounded-lg px-3 py-2.5 text-sm"
              style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
            />
          </div>

          {/* 車名 */}
          <div>
            <FieldLabel>車名</FieldLabel>
            <input
              type="text"
              value={vehicleName}
              onChange={(e) => setVehicleName(e.target.value)}
              placeholder="車名を入力"
              className="w-full border-2 rounded-lg px-3 py-2.5 text-sm"
              style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
            />
          </div>

          {/* ナンバープレート */}
          <div>
            <FieldLabel required>ナンバー</FieldLabel>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold flex-1" style={{ color: '#1C2948' }}>
                {plateSummary(plate) || (
                  <span className="text-gray-400">未入力</span>
                )}
              </span>
              <button
                onClick={() => setShowPlatePicker(true)}
                className="px-4 py-2 rounded-md font-bold text-sm text-white active:opacity-80"
                style={{ backgroundColor: '#71A9F7' }}
              >
                プレート
              </button>
            </div>
          </div>
        </Section>

        {/* ─── 現場状況 ─── */}
        <Section>
          <p className="text-sm font-bold mb-3" style={{ color: '#1C2948' }}>現場状況</p>

          {/* 現場対応 / 搬送 表示 */}
          <div className="mb-3">
            <span
              className="inline-block px-5 py-2 rounded-full text-base font-bold text-white"
              style={{ backgroundColor: dispatch.type === 'ONSITE' ? '#E67E22' : '#3B82F6' }}
            >
              {dispatch.type === 'ONSITE' ? '現場対応' : '搬送'}
            </span>
          </div>

          {/* 事故 / 故障 */}
          <div className="mb-3">
            <FieldLabel>区分</FieldLabel>
            <div className="flex gap-2">
              <ToggleButton
                label="事故"
                active={situationType === 'ACCIDENT'}
                onClick={() => {
                  setSituationType('ACCIDENT')
                  setSituationDetails([])
                }}
                color="#D3170A"
              />
              <ToggleButton
                label="故障"
                active={situationType === 'BREAKDOWN'}
                onClick={() => {
                  setSituationType('BREAKDOWN')
                  setSituationDetails([])
                }}
                color="#1C2948"
              />
            </div>
          </div>

          {/* 種類リスト（複数選択可） */}
          {situationType && (
            <div>
              <FieldLabel>種類（複数選択可）</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {detailList.map((detail) => {
                  const isSelected = situationDetails.includes(detail)
                  return (
                    <button
                      key={detail}
                      onClick={() => {
                        setSituationDetails((prev) =>
                          isSelected
                            ? prev.filter((d) => d !== detail)
                            : [...prev, detail]
                        )
                      }}
                      className="px-3 py-1.5 rounded-md text-sm font-bold transition-colors active:opacity-80"
                      style={{
                        backgroundColor: isSelected
                          ? (situationType === 'ACCIDENT' ? '#D3170A' : '#1C2948')
                          : '#E8EDF5',
                        color: isSelected ? 'white' : '#9CA3AF',
                      }}
                    >
                      {detail}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </Section>

        {/* ─── 作業時間 ─── */}
        <Section>
          <p className="text-sm font-bold mb-2" style={{ color: '#1C2948' }}>作業時間</p>
          <p className="text-xs mb-2" style={{ color: '#1C2948', opacity: 0.5 }}>
            {dispatch.type === 'ONSITE' ? '現着〜完了まで自動取得' : '現着〜搬送開始まで自動取得'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowWorkStartPicker(true)}
              className="text-xl font-bold px-2 py-1 rounded-md text-white active:opacity-70"
              style={{ backgroundColor: '#71A9F7' }}
            >
              {workStartStr ?? '--:--'}
            </button>
            <span className="font-bold" style={{ color: '#1C2948' }}>〜</span>
            <button
              onClick={() => setShowWorkEndPicker(true)}
              className="text-xl font-bold px-2 py-1 rounded-md text-white active:opacity-70"
              style={{ backgroundColor: '#71A9F7' }}
            >
              {workEndStr ?? '--:--'}
            </button>
            {workTime && (
              <span className="text-xl font-bold ml-2" style={{ color: '#1C2948' }}>
                計{workTime.minutes}分
              </span>
            )}
          </div>

          {/* 作業確認書ボタン: 現着済み（arrivalTime あり）のときのみ表示。
              振替済みは page.tsx 側で /dispatch/[id] へリダイレクトするため
              record ページでは isTransferred を考慮不要。 */}
          {dispatch.arrivalTime && (
            <button
              onClick={() => router.push(`/dispatch/${dispatch.id}/confirmation?from=record`)}
              className="mt-3 w-full h-12 flex items-center justify-center gap-2 rounded-md font-bold text-base active:opacity-80"
              style={{ backgroundColor: '#71A9F7', color: '#FFFFFF' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/confirmation.svg" alt="" className="w-5 h-5" />
              作業確認書
            </button>
          )}
        </Section>

        {/* ─── 自走・搬送（搬送のみ表示） ─── */}
        {dispatch.type !== 'ONSITE' && (
        <Section>
          <p className="text-sm font-bold mb-3" style={{ color: '#1C2948' }}>自走・搬送</p>
          <div className="flex gap-4">
            <div className="flex-1">
              <FieldLabel>自走</FieldLabel>
              <div className="flex gap-2">
                <ToggleButton
                  label="可"
                  active={canDrive === true}
                  onClick={() => setCanDrive(true)}
                  color="#2FBF71"
                />
                <ToggleButton
                  label="不可"
                  active={canDrive === false}
                  onClick={() => setCanDrive(false)}
                  color="#D3170A"
                />
              </div>
            </div>
            <div className="flex-1">
              <FieldLabel>搬送先</FieldLabel>
              <div className="flex gap-2">
                <ToggleButton
                  label="直送"
                  active={deliveryType === 'DIRECT'}
                  onClick={() => setDeliveryType('DIRECT')}
                />
                <ToggleButton
                  label="保管"
                  active={deliveryType === 'STORAGE'}
                  onClick={() => setDeliveryType('STORAGE')}
                />
              </div>
            </div>
          </div>
        </Section>
        )}

        {/* ─── 状況メモ ─── */}
        <Section>
          <FieldLabel>状況メモ</FieldLabel>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="メモを入力"
            rows={3}
            className="w-full border-2 rounded-lg px-3 py-2.5 text-sm resize-none"
            style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
          />
        </Section>

        {/* ─── 高速情報セクション（条件表示） ─── */}
        {showHighwaySection && (
          <Section>
            <p className="text-sm font-bold mb-3" style={{ color: '#1C2948' }}>高速情報</p>
            <div className="space-y-4">

              {/* 天気 */}
              <div>
                <FieldLabel>天気</FieldLabel>
                <div className="flex gap-2">
                  {['晴れ', '曇り', '雨', '雪'].map((w) => (
                    <ToggleButton
                      key={w}
                      label={w}
                      active={weather === w}
                      onClick={() => setWeather(w)}
                    />
                  ))}
                </div>
              </div>

              {/* 管理隊 */}
              <div>
                <FieldLabel>管理隊</FieldLabel>
                <div className="flex gap-2">
                  <ToggleButton
                    label="有"
                    active={trafficControl === true}
                    onClick={() => setTrafficControl(true)}
                    color="#2FBF71"
                  />
                  <ToggleButton
                    label="無"
                    active={trafficControl === false}
                    onClick={() => setTrafficControl(false)}
                  />
                </div>
              </div>

              {/* 停車場所 */}
              <div>
                <FieldLabel>停車場所</FieldLabel>
                <div className="flex gap-2">
                  {(
                    [
                      { value: 'EMERGENCY_PARKING', label: '非常駐車帯' },
                      { value: 'SHOULDER', label: '路肩' },
                      { value: 'DRIVING_LANE', label: '走行車線' },
                    ] as const
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setParkingLocation(value)}
                      className="flex-1 py-2 rounded-md text-sm font-bold transition-colors active:opacity-80 text-center"
                      style={{
                        backgroundColor: parkingLocation === value ? '#1C2948' : '#E8EDF5',
                        color: parkingLocation === value ? 'white' : '#9CA3AF',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* エリア IC名 〜 IC名 */}
              <div>
                <FieldLabel>エリア</FieldLabel>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={areaIcFrom}
                    onChange={(e) => setAreaIcFrom(e.target.value)}
                    placeholder="IC名"
                    className="min-w-0 flex-1 border-2 rounded-lg px-2 py-2.5 text-sm"
                    style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
                  />
                  <span className="flex-shrink-0 font-bold px-1" style={{ color: '#1C2948' }}>〜</span>
                  <input
                    type="text"
                    value={areaIcTo}
                    onChange={(e) => setAreaIcTo(e.target.value)}
                    placeholder="IC名"
                    className="min-w-0 flex-1 border-2 rounded-lg px-2 py-2.5 text-sm"
                    style={{ borderColor: '#C6D8FF', color: '#1C2948' }}
                  />
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* ─── 損保会社 ─── */}
        <Section>
          <FieldLabel required>損保会社</FieldLabel>
          <select
            value={insuranceCompanyId}
            onChange={(e) => setInsuranceCompanyId(e.target.value)}
            className="w-full border-2 rounded-lg px-3 py-2.5 text-sm"
            style={{
              borderColor: isInsuranceComplete ? '#2FBF71' : '#D3170A',
              color: '#1C2948',
            }}
          >
            <option value="">損保会社を選択</option>
            {insuranceCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Section>

        {/* 必須項目ガイド */}
        {!isComplete && (
          <div className="flex gap-2 text-xs px-1">
            <span
              className="flex items-center gap-1"
              style={{ color: isPlateComplete ? '#2FBF71' : '#D3170A' }}
            >
              {isPlateComplete ? '✓' : '●'} ナンバー
            </span>
            <span
              className="flex items-center gap-1"
              style={{ color: isInsuranceComplete ? '#2FBF71' : '#D3170A' }}
            >
              {isInsuranceComplete ? '✓' : '●'} 損保会社
            </span>
          </div>
        )}
      </div>

      {/* ─── 下部ボタン（固定） ─── */}
      <div
        className="fixed bottom-0 left-0 right-0 flex gap-3 px-3 py-3"
        style={{ backgroundColor: '#E5E5E5' }}
      >
        {/* 下書き保存（報告書未確定なら表示。report 未作成 or report.isDraft=true のとき） */}
        {(!report || report.isDraft) && (
          <button
            onClick={handleDraftSave}
            disabled={loading}
            className="flex-none flex items-center gap-2 px-6 py-4 rounded-md font-bold text-white text-base active:opacity-80 transition-opacity"
            style={{ backgroundColor: '#D3170A' }}
          >
            <FaPen className="text-lg" />
            <span>下書き保存</span>
          </button>
        )}

        {/* 報告兼請求項目へ */}
        <button
          onClick={handleProceed}
          disabled={!isComplete || loading}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-md font-bold text-base transition-all"
          style={{
            backgroundColor: isComplete ? '#1C2948' : '#9CA3AF',
            color: 'white',
            cursor: isComplete ? 'pointer' : 'not-allowed',
          }}
        >
          <span>報告兼請求項目へ</span>
          <IoIosArrowForward className="text-xl" />
        </button>
      </div>

      {/* ─── ナンバープレートポップアップ ─── */}
      {showPlatePicker && (
        <NumberPlateInput
          value={plate}
          onChange={(v) => setPlate(v)}
          onClose={() => setShowPlatePicker(false)}
        />
      )}
      {showWorkStartPicker && (() => {
        // min: 現着時間、max: 作業終了時間
        const minTime = dispatch.arrivalTime ? new Date(dispatch.arrivalTime) : null
        const maxTime = (() => {
          if (!workEndStr) return dispatch.type === 'ONSITE'
            ? (dispatch.completionTime ? new Date(dispatch.completionTime) : null)
            : (dispatch.transportStartTime ? new Date(dispatch.transportStartTime) : null)
          const d = new Date(); const [h, m] = workEndStr.split(':').map(Number); d.setHours(h, m, 0, 0); return d
        })()
        return (
          <ClockPicker
            value={(() => {
              const d = new Date()
              if (workStartStr) { const [h, m] = workStartStr.split(':').map(Number); d.setHours(h, m, 0, 0) }
              return d
            })()}
            onChange={(d) => setWorkStartStr(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`)}
            onClose={() => setShowWorkStartPicker(false)}
            minTime={minTime}
            maxTime={maxTime}
          />
        )
      })()}
      {showWorkEndPicker && (() => {
        // min: 作業開始時間、max: 完了時間 or 搬送開始時間
        const minTime = (() => {
          if (!workStartStr) return dispatch.arrivalTime ? new Date(dispatch.arrivalTime) : null
          const d = new Date(); const [h, m] = workStartStr.split(':').map(Number); d.setHours(h, m, 0, 0); return d
        })()
        const maxTime = dispatch.type === 'ONSITE'
          ? (dispatch.completionTime ? new Date(dispatch.completionTime) : null)
          : (dispatch.transportStartTime ? new Date(dispatch.transportStartTime) : null)
        return (
          <ClockPicker
            value={(() => {
              const d = new Date()
              if (workEndStr) { const [h, m] = workEndStr.split(':').map(Number); d.setHours(h, m, 0, 0) }
              return d
            })()}
            onChange={(d) => setWorkEndStr(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`)}
            onClose={() => setShowWorkEndPicker(false)}
            minTime={minTime}
            maxTime={maxTime}
          />
        )
      })()}

      {/* 写真拡大モーダル（Phase 10） */}
      <PhotoModal
        photo={selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        onDelete={async (id, isLocal) => {
          await removePhoto(id, isLocal)
          setSelectedPhoto(null)
        }}
      />

    </div>
  )
}
