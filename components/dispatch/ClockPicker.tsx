'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface ClockPickerProps {
  value: Date
  onChange: (date: Date) => void
  onClose: () => void
  /** 選択可能な最小時刻（この時刻以降のみ許可） */
  minTime?: Date | null
  /** 選択可能な最大時刻（この時刻以前のみ許可） */
  maxTime?: Date | null
}

// ── ダイアル定数 ──
const DIAL_SIZE = 280
const CENTER = DIAL_SIZE / 2   // 140
const OUTER_R = 108
const INNER_R = 70
const THRESHOLD = (OUTER_R + INNER_R) / 2  // 外周/内周の判定境界

// position 0 = 12時方向（上）、時計回り
function getPos(index: number, radius: number): { x: number; y: number } {
  const angle = (index / 12) * 2 * Math.PI - Math.PI / 2
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  }
}

// AM 外周: 12, 1, 2 … 11
const AM_HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
// PM 内周: 0(=24), 13, 14 … 23
const PM_HOURS = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
// 分目盛り
const MINUTE_MARKS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

// ── 時間値 → 回転角度（°）と半径 ──
function hourToAngleAndRadius(hour: number): { angleDeg: number; radius: number } {
  if (hour === 12 || (hour >= 1 && hour <= 11)) {
    const idx = hour === 12 ? 0 : hour
    return { angleDeg: idx * 30, radius: OUTER_R }
  }
  // 0(=24), 13-23 → 内周
  const idx = hour === 0 ? 0 : hour - 12
  return { angleDeg: idx * 30, radius: INNER_R }
}

// ── 分値 → 回転角度（°）──
function minuteToAngle(minute: number): number {
  return minute * 6  // 360 / 60 = 6°/分
}

export default function ClockPicker({ value, onChange, onClose, minTime, maxTime }: ClockPickerProps) {
  const [mode, setMode] = useState<'hour' | 'minute'>('hour')
  const [hour, setHour] = useState(value.getHours())
  const [minute, setMinute] = useState(value.getMinutes())
  const dialRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  // ── クライアント座標 → 選択値を更新 ──
  const handleDialInput = useCallback(
    (clientX: number, clientY: number) => {
      if (!dialRef.current) return
      const rect = dialRef.current.getBoundingClientRect()
      const scaleX = DIAL_SIZE / rect.width
      const scaleY = DIAL_SIZE / rect.height
      const dx = (clientX - rect.left - rect.width / 2) * scaleX
      const dy = (clientY - rect.top - rect.height / 2) * scaleY
      const distance = Math.sqrt(dx * dx + dy * dy)

      let angle = Math.atan2(dy, dx) + Math.PI / 2
      if (angle < 0) angle += 2 * Math.PI
      const index = Math.round((angle * 12) / (2 * Math.PI)) % 12

      if (mode === 'hour') {
        if (distance < THRESHOLD) {
          setHour(PM_HOURS[index])
        } else {
          setHour(AM_HOURS[index])
        }
      } else {
        // 分: 0-59 を角度から算出
        const raw = Math.round((angle * 60) / (2 * Math.PI)) % 60
        setMinute(raw < 0 ? raw + 60 : raw)
      }
    },
    [mode]
  )

  // ── Mouse handlers ──
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true
      handleDialInput(e.clientX, e.clientY)
    },
    [handleDialInput]
  )
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging.current) handleDialInput(e.clientX, e.clientY)
    },
    [handleDialInput]
  )
  const onMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false
      if (mode === 'hour') setMode('minute')
    }
  }, [mode])

  // ── Touch handlers ──
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      isDragging.current = true
      handleDialInput(e.touches[0].clientX, e.touches[0].clientY)
    },
    [handleDialInput]
  )
  const onTouchEnd = useCallback(() => {
    isDragging.current = false
    if (mode === 'hour') setMode('minute')
  }, [mode])

  // passive: false でスクロール阻止
  useEffect(() => {
    const el = dialRef.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (isDragging.current) {
        handleDialInput(e.touches[0].clientX, e.touches[0].clientY)
      }
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [handleDialInput])

  // ── 時刻を分に変換（比較用） ──
  const toMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes()

  const handleOK = () => {
    if (mode === 'hour') {
      setMode('minute')
      return
    }
    const newDate = new Date(value)
    newDate.setHours(hour, minute, 0, 0)

    // minTime / maxTime によるクランプ
    if (minTime) {
      const minMin = toMinutes(minTime)
      if (toMinutes(newDate) < minMin) {
        newDate.setHours(minTime.getHours(), minTime.getMinutes(), 0, 0)
      }
    }
    if (maxTime) {
      const maxMin = toMinutes(maxTime)
      if (toMinutes(newDate) > maxMin) {
        newDate.setHours(maxTime.getHours(), maxTime.getMinutes(), 0, 0)
      }
    }

    onChange(newDate)
    onClose()
  }

  // ── 針の角度と長さを算出 ──
  const { angleDeg, radius: needleRadius } =
    mode === 'hour'
      ? hourToAngleAndRadius(hour)
      : { angleDeg: minuteToAngle(minute), radius: OUTER_R }

  const fmtH = (h: number) => String(h).padStart(2, '0')
  const fmtM = (m: number) => String(m).padStart(2, '0')

  // 針の先端座標（selected number の div 位置計算用）
  const needleEndX = CENTER + needleRadius * Math.sin((angleDeg * Math.PI) / 180)
  const needleEndY = CENTER - needleRadius * Math.cos((angleDeg * Math.PI) / 180)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl overflow-hidden shadow-2xl"
        style={{ width: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── ヘッダー ─── */}
        <div
          className="flex items-center justify-center gap-2 py-6 px-8"
          style={{ backgroundColor: '#2FBF71' }}
        >
          <button
            className="text-5xl font-bold transition-opacity duration-150"
            style={{ color: 'white', opacity: mode === 'hour' ? 1 : 0.55 }}
            onClick={() => setMode('hour')}
          >
            {fmtH(hour)}
          </button>
          <span className="text-5xl font-bold text-white select-none">:</span>
          <button
            className="text-5xl font-bold transition-opacity duration-150"
            style={{ color: 'white', opacity: mode === 'minute' ? 1 : 0.55 }}
            onClick={() => setMode('minute')}
          >
            {fmtM(minute)}
          </button>
        </div>

        {/* モードラベル + 範囲表示 */}
        <div className="text-center py-2">
          <p className="text-sm font-medium" style={{ color: '#2FBF71' }}>
            {mode === 'hour' ? '時間を選択' : '分を選択'}
          </p>
          {(minTime || maxTime) && (
            <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>
              {minTime ? fmtH(minTime.getHours()) + ':' + fmtM(minTime.getMinutes()) : '--:--'}
              {' 〜 '}
              {maxTime ? fmtH(maxTime.getHours()) + ':' + fmtM(maxTime.getMinutes()) : '--:--'}
            </p>
          )}
        </div>

        {/* ─── ダイアル ─── */}
        <div className="flex justify-center px-4 pb-2">
          <div
            ref={dialRef}
            className="relative rounded-full select-none"
            style={{
              width: DIAL_SIZE,
              height: DIAL_SIZE,
              backgroundColor: '#F3F4F6',
              touchAction: 'none',
              cursor: 'pointer',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => { isDragging.current = false }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {/* ──── SVG: 針（回転グループでスムーズアニメーション） ──── */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={DIAL_SIZE}
              height={DIAL_SIZE}
            >
              {/* 中心ドット */}
              <circle cx={CENTER} cy={CENTER} r="6" fill="#2FBF71" />

              {/*
                回転グループ: CSS transform rotate を使うことで
                transitionが効き、針がスムーズに円弧を描いて移動する
              */}
              <g
                style={{
                  transform: `rotate(${angleDeg}deg)`,
                  transformOrigin: `${CENTER}px ${CENTER}px`,
                  transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                {/* 針（中心 → 上方向に radius の長さ） */}
                <line
                  x1={CENTER}
                  y1={CENTER}
                  x2={CENTER}
                  y2={CENTER - needleRadius}
                  stroke="#2FBF71"
                  strokeWidth="2"
                />
                {/* 分ダイアル: 先端に小さな点のみ（数字div が上に乗る） */}
                {mode === 'minute' && minute % 5 !== 0 && (
                  <circle
                    cx={CENTER}
                    cy={CENTER - needleRadius}
                    r="20"
                    fill="#2FBF71"
                  />
                )}
              </g>
            </svg>

            {/* ──── 時間: 外周 AM ──── */}
            {mode === 'hour' &&
              AM_HOURS.map((h, i) => {
                const pos = getPos(i, OUTER_R)
                const isSel = hour === h
                return (
                  <div
                    key={h}
                    className="absolute flex items-center justify-center rounded-full text-sm font-semibold pointer-events-none select-none"
                    style={{
                      width: 40, height: 40,
                      left: pos.x - 20, top: pos.y - 20,
                      backgroundColor: isSel ? '#2FBF71' : 'transparent',
                      color: isSel ? 'white' : '#374151',
                      zIndex: 1,
                    }}
                  >
                    {h}
                  </div>
                )
              })}

            {/* ──── 時間: 内周 PM ──── */}
            {mode === 'hour' &&
              PM_HOURS.map((h, i) => {
                const pos = getPos(i, INNER_R)
                const isSel = hour === h
                return (
                  <div
                    key={`pm-${h}`}
                    className="absolute flex items-center justify-center rounded-full text-xs font-semibold pointer-events-none select-none"
                    style={{
                      width: 34, height: 34,
                      left: pos.x - 17, top: pos.y - 17,
                      backgroundColor: isSel ? '#2FBF71' : 'transparent',
                      color: isSel ? 'white' : '#6B7280',
                      zIndex: 1,
                    }}
                  >
                    {h === 0 ? '24' : h}
                  </div>
                )
              })}

            {/* ──── 分目盛り ──── */}
            {mode === 'minute' &&
              MINUTE_MARKS.map((m, i) => {
                const pos = getPos(i, OUTER_R)
                const isSel = minute === m
                return (
                  <div
                    key={m}
                    className="absolute flex items-center justify-center rounded-full text-sm font-semibold pointer-events-none select-none"
                    style={{
                      width: 40, height: 40,
                      left: pos.x - 20, top: pos.y - 20,
                      backgroundColor: isSel ? '#2FBF71' : 'transparent',
                      color: isSel ? 'white' : '#374151',
                      zIndex: 1,
                    }}
                  >
                    {String(m).padStart(2, '0')}
                  </div>
                )
              })}

            {/* 分: 選択中の数字が5分刻みに一致する場合、先端緑丸 */}
            {mode === 'minute' && minute % 5 === 0 && (
              <div
                className="absolute flex items-center justify-center rounded-full pointer-events-none select-none"
                style={{
                  width: 40, height: 40,
                  left: needleEndX - 20,
                  top: needleEndY - 20,
                  backgroundColor: '#2FBF71',
                  zIndex: 2,
                  // 位置は CSS transition なしで即時追従（div は CSS transform ではなく left/top）
                }}
              >
                <span className="text-sm font-semibold text-white">
                  {String(minute).padStart(2, '0')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ─── フッター ─── */}
        <div className="flex gap-3 px-6 py-4">
          <button
            className="flex-1 py-3 rounded-md font-bold text-base"
            style={{ backgroundColor: '#E5E7EB', color: '#374151' }}
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            className="flex-1 py-3 rounded-md font-bold text-base text-white"
            style={{ backgroundColor: '#2FBF71' }}
            onClick={handleOK}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
