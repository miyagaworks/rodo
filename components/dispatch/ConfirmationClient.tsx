'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { IoIosArrowBack } from 'react-icons/io'
import SignatureCanvas from 'react-signature-canvas'
import { offlineFetch } from '@/lib/offline-fetch'

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface BatteryDetails {
  electricUsage?: string
  timeUnused?: string
  voltageBefore?: string
  voltageGenerated?: string
  gravityMF?: string
  loadInspection?: 'OK' | 'NG' | ''
  restart?: 'OK' | 'NG' | ''
  difference?: 'OK' | 'NG' | ''
}

export interface SerializedConfirmation {
  workDate: string
  preApprovalChecks: boolean[] | null
  customerSignature: string | null
  customerName: string | null
  customerDate: string | null
  vehicleType: string | null
  registrationNumber: string | null
  workContent: string | null
  shopCompanyName: string | null
  shopContactName: string | null
  shopSignature: string | null
  postApprovalCheck: boolean
  postApprovalSignature: string | null
  postApprovalName: string | null
  batteryDetails: Record<string, unknown> | null
  notes: string | null
}

interface Props {
  dispatchId: string
  confirmation: SerializedConfirmation | null
  userName: string
}

// -------------------------------------------------------
// Color constants
// -------------------------------------------------------

const MAIN = '#1C2948'
const SUB = '#71A9F7'
const AUX = '#C6D8FF'
const SUCCESS = '#2FBF71'
const ERROR = '#D3170A'

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function formatDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

// -------------------------------------------------------
// Signature Pad Component
// -------------------------------------------------------

const SIG_HEIGHT = 160

function SignaturePad({
  label,
  sublabel,
  initialData,
  onSave,
  variant = 'customer',
}: {
  label: string
  sublabel?: string
  initialData?: string | null
  onSave: (data: string | null) => void
  variant?: 'customer' | 'shop'
}) {
  const sigRef = useRef<SignatureCanvas | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<string | null>(initialData ?? null)
  const [isEmpty, setIsEmpty] = useState(!initialData)

  const accent = variant === 'customer' ? SUB : SUCCESS
  const bgTint = variant === 'customer' ? '#EEF4FF' : '#EEFBF3'
  const badgeLabel = variant === 'customer' ? 'お客様' : '担当者様'

  // --- Retina canvas scaling ---
  const scaleCanvas = useCallback(() => {
    const pad = sigRef.current
    const container = containerRef.current
    if (!pad || !container) return

    const canvas = pad.getCanvas()
    const ratio = Math.max(window.devicePixelRatio || 1, 2) // at least 2x
    const w = container.offsetWidth
    const h = SIG_HEIGHT

    canvas.width = w * ratio
    canvas.height = h * ratio
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(ratio, ratio)
      // Make lines smoother
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
    }

    // Restore signature data after rescale
    if (dataRef.current) {
      pad.fromDataURL(dataRef.current, { width: w, height: h })
    }
  }, [])

  // Scale on mount + resize/orientation
  useEffect(() => {
    // Small delay so container has its final layout width
    const raf = requestAnimationFrame(() => scaleCanvas())

    const handleResize = () => scaleCanvas()
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [scaleCanvas])

  // Load initial data
  useEffect(() => {
    if (initialData && sigRef.current) {
      const w = containerRef.current?.offsetWidth || 300
      sigRef.current.fromDataURL(initialData, { width: w, height: SIG_HEIGHT })
      dataRef.current = initialData
      setIsEmpty(false)
    }
  }, [initialData])

  // Prevent iOS Safari bounce/zoom/long-press on the canvas area
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const prevent = (e: TouchEvent) => {
      // Allow single-finger draw, block everything else
      if (e.touches.length > 1) e.preventDefault()
    }
    const preventMenu = (e: Event) => e.preventDefault()

    container.addEventListener('touchmove', prevent, { passive: false })
    container.addEventListener('contextmenu', preventMenu)

    return () => {
      container.removeEventListener('touchmove', prevent)
      container.removeEventListener('contextmenu', preventMenu)
    }
  }, [])

  const handleEnd = useCallback(() => {
    if (sigRef.current) {
      const data = sigRef.current.toDataURL('image/png')
      dataRef.current = data
      onSave(data)
      setIsEmpty(false)
    }
  }, [onSave])

  const handleClear = useCallback(() => {
    sigRef.current?.clear()
    dataRef.current = null
    onSave(null)
    setIsEmpty(true)
  }, [onSave])

  return (
    <div
      className="rounded-lg p-3"
      style={{ backgroundColor: bgTint, borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: accent }}
        >
          {badgeLabel}
        </span>
        <p className="text-sm font-semibold" style={{ color: MAIN }}>{label}</p>
      </div>
      {sublabel && (
        <p className="text-xs mb-2 text-justify" style={{ color: '#555' }}>{sublabel}</p>
      )}
      <div
        ref={containerRef}
        className="relative rounded-lg overflow-hidden"
        style={{
          border: `2px solid ${accent}40`,
          backgroundColor: '#fff',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
        } as React.CSSProperties}
      >
        <SignatureCanvas
          ref={sigRef}
          penColor="#111"
          minWidth={0.8}
          maxWidth={3.2}
          velocityFilterWeight={0.6}
          throttle={0}
          canvasProps={{
            className: 'w-full',
            style: {
              height: SIG_HEIGHT,
              touchAction: 'none',
              WebkitTouchCallout: 'none',
            } as React.CSSProperties,
          }}
          onEnd={handleEnd}
          onBegin={() => setIsEmpty(false)}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-1">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="#ccc" strokeWidth="1.5">
              <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-xs" style={{ color: '#bbb' }}>こちらにご署名ください</p>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleClear}
        className="mt-1.5 text-xs px-3 py-1 rounded"
        style={{ color: ERROR, border: `1px solid ${ERROR}` }}
      >
        クリア
      </button>
    </div>
  )
}

// -------------------------------------------------------
// Toggle Button Component
// -------------------------------------------------------

function ToggleButton({
  value,
  onChange,
  labelOK,
  labelNG,
}: {
  value: 'OK' | 'NG' | ''
  onChange: (v: 'OK' | 'NG' | '') => void
  labelOK?: string
  labelNG?: string
}) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        className="px-3 py-1.5 rounded-l-lg text-sm font-semibold transition-colors"
        style={{
          backgroundColor: value === 'OK' ? SUCCESS : '#e5e7eb',
          color: value === 'OK' ? '#fff' : '#6b7280',
        }}
        onClick={() => onChange(value === 'OK' ? '' : 'OK')}
      >
        {labelOK || 'OK'}
      </button>
      <button
        type="button"
        className="px-3 py-1.5 rounded-r-lg text-sm font-semibold transition-colors"
        style={{
          backgroundColor: value === 'NG' ? ERROR : '#e5e7eb',
          color: value === 'NG' ? '#fff' : '#6b7280',
        }}
        onClick={() => onChange(value === 'NG' ? '' : 'NG')}
      >
        {labelNG || 'NG'}
      </button>
    </div>
  )
}

// -------------------------------------------------------
// Main Component
// -------------------------------------------------------

export default function ConfirmationClient({ dispatchId, confirmation, userName }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // --- Pre-approval ---
  const [preChecks, setPreChecks] = useState<boolean[]>(
    (confirmation?.preApprovalChecks as boolean[]) || [false, false, false, false, false]
  )
  const [customerSig, setCustomerSig] = useState<string | null>(confirmation?.customerSignature ?? null)

  // --- Vehicle ---
  const [vehicleType, setVehicleType] = useState(confirmation?.vehicleType ?? '')
  const [regNumber, setRegNumber] = useState(confirmation?.registrationNumber ?? '')

  // --- Work content ---
  const [workContent, setWorkContent] = useState(confirmation?.workContent ?? '')

  // --- Shop contact ---
  const [shopCompany, setShopCompany] = useState(confirmation?.shopCompanyName ?? '')
  const [shopSig, setShopSig] = useState<string | null>(confirmation?.shopSignature ?? null)

  // --- Post-approval ---
  const [postCheck, setPostCheck] = useState(confirmation?.postApprovalCheck ?? false)
  const [postSig, setPostSig] = useState<string | null>(confirmation?.postApprovalSignature ?? null)

  // --- Battery details ---
  const [batteryOpen, setBatteryOpen] = useState(false)
  const initBattery = (confirmation?.batteryDetails as BatteryDetails) || {}
  const [battery, setBattery] = useState<BatteryDetails>({
    electricUsage: initBattery.electricUsage ?? '',
    timeUnused: initBattery.timeUnused ?? '',
    voltageBefore: initBattery.voltageBefore ?? '',
    voltageGenerated: initBattery.voltageGenerated ?? '',
    gravityMF: initBattery.gravityMF ?? '',
    loadInspection: initBattery.loadInspection ?? '',
    restart: initBattery.restart ?? '',
    difference: initBattery.difference ?? '',
  })

  // --- Notes ---
  const [notes, setNotes] = useState(confirmation?.notes ?? '')

  // --- Work date ---
  const workDate = confirmation?.workDate ? new Date(confirmation.workDate) : new Date()

  const updateBattery = useCallback((field: keyof BatteryDetails, value: string) => {
    setBattery(prev => ({ ...prev, [field]: value }))
  }, [])

  const togglePreCheck = useCallback((index: number) => {
    setPreChecks(prev => {
      const next = [...prev]
      next[index] = !next[index]
      return next
    })
  }, [])

  // --- Save ---
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const method = confirmation ? 'PATCH' : 'POST'
      const body = {
        workDate: workDate.toISOString(),
        preApprovalChecks: preChecks,
        customerSignature: customerSig,
        customerName: null,
        customerDate: null,
        vehicleType: vehicleType || null,
        registrationNumber: regNumber || null,
        workContent: workContent || null,
        shopCompanyName: shopCompany || null,
        shopContactName: null,
        shopSignature: shopSig,
        postApprovalCheck: postCheck,
        postApprovalSignature: postSig,
        postApprovalName: userName || null,
        batteryDetails: battery,
        notes: notes || null,
      }
      await offlineFetch(`/api/dispatches/${dispatchId}/confirmation`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        offlineActionType: 'confirmation_save',
        offlineDispatchId: dispatchId,
      })
      router.push(`/dispatch/${dispatchId}`)
    } catch (err) {
      console.error('Save confirmation error:', err)
    } finally {
      setSaving(false)
    }
  }, [
    confirmation, dispatchId, workDate, preChecks, customerSig,
    vehicleType, regNumber, workContent, shopCompany,
    shopSig, postCheck, postSig, userName, battery, notes, router,
  ])

  const handleCancel = useCallback(() => {
    router.push(`/dispatch/${dispatchId}`)
  }, [router, dispatchId])

  // --- Pre-approval checkbox texts ---
  const preCheckLabels = [
    '不可抗力、経年劣化による作業中の車両の損傷・不具合については、責任を負いかねますのでご了承ください。',
    'バッテリージャンピング作業時における電装系（コンピューター・ナビゲーション・警告灯等）の不具合については、責任を負いかねますのでご了承ください。',
    '貴重品（現金・クレジットカード・ETCカード等）についてはお客様自身にて管理をお願いいたします。紛失・破損については責任を負いかねます。',
    '保管料金が発生する場合がございます。',
    '保管中における、盗難・損傷については責任を負いかねますのでご了承ください。',
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f0f2f5' }}>
      {/* ─── Header ─── */}
      <header
        className="sticky top-0 z-50 flex items-center px-4 py-3"
        style={{ backgroundColor: MAIN }}
      >
        <button onClick={handleCancel} className="mr-2">
          <IoIosArrowBack className="w-7 h-7 text-white" />
        </button>
        <h1 className="text-white text-lg font-bold tracking-widest flex-1 text-center pr-7">
          作業確認書
        </h1>
      </header>

      <div className="px-4 pt-4 pb-32 space-y-4 max-w-lg mx-auto">
        {/* ─── 作業日 ─── */}
        <div className="text-right text-sm" style={{ color: MAIN }}>
          作業日：{formatDate(workDate)}
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* 作業前承認欄 */}
        {/* ═══════════════════════════════════════════ */}
        <section className="rounded-lg shadow-sm p-4" style={{ backgroundColor: '#fff' }}>
          <h2 className="font-bold text-base mb-2" style={{ color: MAIN }}>
            作業前承認欄（お客様ご署名欄）
          </h2>
          <p className="text-xs mb-3 text-justify" style={{ color: '#555' }}>
            専門的な作業もございますので作業をお手伝い頂く事はご遠慮ください。（お客様の安全の為スタッフが指示する事もございます）
          </p>

          <div className="space-y-3">
            {preCheckLabels.map((label, i) => (
              <label key={i} className="flex gap-3 cursor-pointer" onClick={(e) => { e.preventDefault(); togglePreCheck(i) }}>
                <div
                  className="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 -mt-px"
                  style={{
                    borderColor: preChecks[i] ? SUB : '#ccc',
                    backgroundColor: preChecks[i] ? SUB : '#fff',
                  }}
                >
                  {preChecks[i] && (
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-xs leading-relaxed text-justify flex-1" style={{ color: '#333' }}>{label}</span>
              </label>
            ))}
          </div>

          <div className="mt-4">
            <SignaturePad
              label="ご署名欄（作業前）"
              sublabel="上記、作業前の承認事項に同意いたします。"
              initialData={customerSig}
              onSave={setCustomerSig}
              variant="customer"
            />
          </div>
        </section>

        {/* ═══════════════════════════════════════════ */}
        {/* 車両情報 */}
        {/* ═══════════════════════════════════════════ */}
        <section className="rounded-lg shadow-sm p-4" style={{ backgroundColor: '#fff' }}>
          <h2 className="font-bold text-base mb-3" style={{ color: MAIN }}>車両情報</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs" style={{ color: '#666' }}>車種名</label>
              <input
                type="text"
                value={vehicleType}
                onChange={e => setVehicleType(e.target.value)}
                placeholder="車種名を入力"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: '1px solid #ddd', color: '#333' }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: '#666' }}>登録番号</label>
              <input
                type="text"
                value={regNumber}
                onChange={e => setRegNumber(e.target.value)}
                placeholder="登録番号を入力"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: '1px solid #ddd', color: '#333' }}
              />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════ */}
        {/* 作業内容 */}
        {/* ═══════════════════════════════════════════ */}
        <section className="rounded-lg shadow-sm p-4" style={{ backgroundColor: '#fff' }}>
          <h2 className="font-bold text-base mb-3" style={{ color: MAIN }}>作業内容</h2>
          <textarea
            value={workContent}
            onChange={e => setWorkContent(e.target.value)}
            placeholder="作業内容を入力してください"
            rows={5}
            className="w-full rounded-lg px-3 py-2 text-sm resize-none"
            style={{ border: '1px solid #ddd', color: '#333' }}
          />
        </section>

        {/* ═══════════════════════════════════════════ */}
        {/* 入庫先ご担当者様記入欄 */}
        {/* ═══════════════════════════════════════════ */}
        <section className="rounded-lg shadow-sm p-4" style={{ backgroundColor: '#fff' }}>
          <h2 className="font-bold text-base mb-2" style={{ color: MAIN }}>入庫先ご担当者様記入欄</h2>
          <p className="text-xs mb-3 text-justify" style={{ color: '#555' }}>
            本紙の内容を確認の上、車両をお預かりいたしました。
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs" style={{ color: '#666' }}>会社名</label>
              <input
                type="text"
                value={shopCompany}
                onChange={e => setShopCompany(e.target.value)}
                placeholder="会社名を入力"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: '1px solid #ddd', color: '#333' }}
              />
            </div>
            <SignaturePad
              label="担当者様ご署名"
              initialData={shopSig}
              onSave={setShopSig}
              variant="shop"
            />
          </div>
        </section>

        {/* ═══════════════════════════════════════════ */}
        {/* 作業完了後承認欄 */}
        {/* ═══════════════════════════════════════════ */}
        <section className="rounded-lg shadow-sm p-4" style={{ backgroundColor: '#fff' }}>
          <h2 className="font-bold text-base mb-2" style={{ color: MAIN }}>作業完了後承認欄（お客様ご署名欄）</h2>
          <p className="text-xs mb-3 text-justify" style={{ color: '#555' }}>
            今回の作業はあくまで応急処置です。早急に修理工場での点検・整備をお勧めいたします。（点検・整備費用はロードサービス対象外となります）
          </p>

          <label className="flex gap-3 cursor-pointer mb-4" onClick={(e) => { e.preventDefault(); setPostCheck(!postCheck) }}>
            <div
              className="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 -mt-px"
              style={{
                borderColor: postCheck ? SUB : '#ccc',
                backgroundColor: postCheck ? SUB : '#fff',
              }}
            >
              {postCheck && (
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className="text-xs leading-relaxed text-justify flex-1" style={{ color: '#333' }}>
              作業が異常なく完了し、外観及び内装に新たな傷がないことを確認いたしました。
            </span>
          </label>

          <SignaturePad
            label="ご署名欄（作業後）"
            sublabel="上記、作業完了後の承認事項に同意いたします。"
            initialData={postSig}
            onSave={setPostSig}
            variant="customer"
          />
        </section>

        {/* ═══════════════════════════════════════════ */}
        {/* バッテリー作業明細（折りたたみ） */}
        {/* ═══════════════════════════════════════════ */}
        <section className="rounded-lg shadow-sm overflow-hidden" style={{ backgroundColor: '#fff' }}>
          <button
            type="button"
            className="w-full flex items-center justify-between p-4"
            onClick={() => setBatteryOpen(!batteryOpen)}
          >
            <h2 className="font-bold text-base" style={{ color: MAIN }}>バッテリー作業明細</h2>
            {batteryOpen ? (
              <ChevronUp className="w-5 h-5" style={{ color: MAIN }} />
            ) : (
              <ChevronDown className="w-5 h-5" style={{ color: MAIN }} />
            )}
          </button>

          {batteryOpen && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <label className="text-xs" style={{ color: '#666' }}>電装：使用 / 類</label>
                <input
                  type="text"
                  value={battery.electricUsage}
                  onChange={e => updateBattery('electricUsage', e.target.value)}
                  placeholder="電装の使用状況"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #ddd', color: '#333' }}
                />
              </div>
              <div>
                <label className="text-xs" style={{ color: '#666' }}>時間未乗車 / バッテリー / 年使用</label>
                <input
                  type="text"
                  value={battery.timeUnused}
                  onChange={e => updateBattery('timeUnused', e.target.value)}
                  placeholder="時間未乗車 / バッテリー使用年数"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #ddd', color: '#333' }}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs" style={{ color: '#666' }}>バッテリー電圧：作業前（V）</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={battery.voltageBefore}
                    onChange={e => updateBattery('voltageBefore', e.target.value)}
                    placeholder="0.0"
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #ddd', color: '#333' }}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs" style={{ color: '#666' }}>発生電圧（V）</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={battery.voltageGenerated}
                    onChange={e => updateBattery('voltageGenerated', e.target.value)}
                    placeholder="0.0"
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #ddd', color: '#333' }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs" style={{ color: '#666' }}>バッテリー比重：MF値</label>
                <input
                  type="text"
                  value={battery.gravityMF}
                  onChange={e => updateBattery('gravityMF', e.target.value)}
                  placeholder="MF / 1.28〜1.20 / 1.19〜1.10 / 1.09〜NG"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #ddd', color: '#333' }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#666' }}>負荷点検</span>
                <ToggleButton
                  value={battery.loadInspection || ''}
                  onChange={v => updateBattery('loadInspection', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#666' }}>再始動</span>
                <ToggleButton
                  value={battery.restart || ''}
                  onChange={v => updateBattery('restart', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#666' }}>差異</span>
                <ToggleButton
                  value={battery.difference || ''}
                  onChange={v => updateBattery('difference', v)}
                />
              </div>
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════ */}
        {/* 注意事項・その他 */}
        {/* ═══════════════════════════════════════════ */}
        <section className="rounded-lg shadow-sm p-4" style={{ backgroundColor: '#fff' }}>
          <h2 className="font-bold text-base mb-3" style={{ color: MAIN }}>注意事項・その他</h2>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="注意事項・その他を入力"
            rows={4}
            className="w-full rounded-lg px-3 py-2 text-sm resize-none"
            style={{ border: '1px solid #ddd', color: '#333' }}
          />
        </section>

        {/* ═══════════════════════════════════════════ */}
        {/* 担当者氏名（自動表示） */}
        {/* ═══════════════════════════════════════════ */}
        <section className="rounded-lg shadow-sm p-4" style={{ backgroundColor: '#fff' }}>
          <h2 className="font-bold text-base mb-2" style={{ color: MAIN }}>担当者氏名</h2>
          <p className="text-sm px-1" style={{ color: '#333' }}>{userName}</p>
        </section>
      </div>

      {/* ─── Fixed Bottom Buttons ─── */}
      <div
        className="fixed bottom-0 left-0 right-0 p-4 flex gap-3"
        style={{ backgroundColor: '#f0f2f5', borderTop: '1px solid #e0e0e0' }}
      >
        <button
          type="button"
          onClick={handleCancel}
          className="flex-1 py-3.5 rounded-lg font-bold text-base"
          style={{
            backgroundColor: '#fff',
            color: MAIN,
            border: `1px solid ${MAIN}`,
          }}
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-3.5 rounded-lg font-bold text-base text-white"
          style={{
            backgroundColor: saving ? '#999' : MAIN,
          }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}
