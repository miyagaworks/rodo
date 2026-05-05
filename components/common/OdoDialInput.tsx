'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FaCheckCircle } from 'react-icons/fa'

// -------------------------------------------------------
// OdoDialInput
// -------------------------------------------------------
// 6 桁のダイヤル式 ODO 入力コンポーネント（iPhone アラーム風）
//
// UX:
//   - 通常時: コンパクトな枠 (h-12 相当) に現在値を表示
//   - タップ時:
//     - タッチデバイス (pointer: coarse) → ボトムシート + 6桁ダイヤル（黒背景 + 円筒風グラデーション）
//     - マウス環境 (PC) → 枠内の <input type="number"> にフォーカス
//
// タッチ判定は window.matchMedia('(pointer: coarse)') で検出し、
// MediaQueryList の change イベントも購読（DevTools エミュレーション等に対応）。
// SSR 時は isTouchDevice = null（不明）でコンパクト表示のみ描画。
//
// ボトムシートは自前実装（Radix dialog 非依存）:
//   - fixed inset-0 オーバーレイ、背景タップ = キャンセル
//   - 下からスライドイン（transform: translateY）
//   - ESC キーで閉じる
//   - body の overflow を一時的に hidden
//
// ダイヤル部分は CSS scroll-snap + キーボード操作。
//
// ── 無限ループ (バッファ方式) ──
// 各桁は 0-9 を 5 セット (計 50 セル) 並べる。初期位置は中央セット (2 セット目、index 20-29)。
// onScroll 中、現在位置が端のセット (0-9 or 40-49) に入ったら、中央セットの
// 同じ数字位置にワープ (scrollTop を瞬時に書き換え) する。
// ユーザーには切れ目なく 9→0→1 と回り続けているように見える。
//
// ── 連続 tick (ギア音) ──
// onScroll イベントで現在の数字を毎フレーム算出し、前回と変化した瞬間に playTick()。
// onChange (親通知) は従来どおり debounce 150ms でスクロール停止後に 1 回だけ確定。
//
// jsdom ではスクロール経由の tick / ワープ検証は困難なため、
// キーボード (ArrowUp/ArrowDown/数字) で単体検証可能な設計を維持。
// -------------------------------------------------------

export interface OdoDialInputProps {
  label: string
  value: number | null
  onChange: (next: number) => void
  disabled?: boolean
  /** value が null のときに薄く表示するガイド値 */
  placeholder?: number
}

const DIGIT_COUNT = 6
const CELL_HEIGHT = 48 // px（ボトムシート内は大きめ）
const VISIBLE_CELLS = 5 // 中央 + 上下 2 つずつ（円筒感を出すため広げる）
const CONTAINER_HEIGHT = CELL_HEIGHT * VISIBLE_CELLS // 240px
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

// ── バッファ方式パラメータ ──
// 5 セット並べ、中央 (index 2) を初期・ワープ先とする。
// ワープ閾値: 現在位置が最上端セット (0) or 最下端セット (最後) に入ったら中央へ戻す。
const SET_COUNT = 5
const TOTAL_CELLS = SET_COUNT * 10 // 50
const CENTER_SET_INDEX = Math.floor(SET_COUNT / 2) // 2
const CENTER_SET_START = CENTER_SET_INDEX * 10 // 20
// 「端に近づいたら」= 最上位セット or 最下位セットに入ったら
const WARP_LOWER_THRESHOLD = 10 // この index 未満ならワープ（= 最上位セット 0-9）
const WARP_UPPER_THRESHOLD = (SET_COUNT - 1) * 10 // この index 以上ならワープ（= 最下位セット 40-49）

function numberToDigits(n: number): number[] {
  const clamped = Math.max(0, Math.min(999999, Math.trunc(n)))
  const s = String(clamped).padStart(DIGIT_COUNT, '0')
  return s.split('').map((c) => Number(c))
}

function digitsToNumber(digits: number[]): number {
  return digits.reduce((acc, d) => acc * 10 + d, 0)
}

function formatNumber(n: number): string {
  return String(Math.max(0, Math.min(999999, Math.trunc(n)))).padStart(DIGIT_COUNT, '0')
}

// -------------------------------------------------------
// Web Audio API で "カチッ" 音を合成再生
// - iOS Safari はユーザー操作起点のみ再生可（タップ/キー入力から呼ぶ想定）
// - jsdom では AudioContext が存在しないため、ガードで無視
// - 連続スクロール中に多数回呼ばれる想定のため、音量/時間は控えめ。
// -------------------------------------------------------
function playTick() {
  if (typeof window === 'undefined') return
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.type = 'square'
    // 機械的なギア音に近づけるため周波数を下げる（1800→1400Hz）
    oscillator.frequency.value = 1400
    // 連続再生でうるさくならないよう音量を下げる（0.08→0.05）
    gain.gain.setValueAtTime(0.05, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.012)
    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.012)
    // リーク防止のため短時間後に close
    setTimeout(() => {
      try {
        ctx.close().catch(() => {})
      } catch {
        // noop
      }
    }, 100)
  } catch {
    // 音再生失敗しても機能には影響させない
  }
}

// -------------------------------------------------------
// DialColumn: 1 桁の縦スクロール（無限ループ + 連続 tick）
// -------------------------------------------------------

interface DialColumnProps {
  digitIndex: number
  digitValue: number
  label: string
  disabled: boolean
  onChangeDigit: (digitIndex: number, newDigitValue: number) => void
}

function DialColumn({
  digitIndex,
  digitValue,
  label,
  disabled,
  onChangeDigit,
}: DialColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // スクロール中に tick を鳴らすため、最後に通過した数字を保持
  const lastTickDigitRef = useRef<number>(digitValue)
  // ワープ直後に scroll イベントが再発火してループしないよう、
  // 最後にプログラマティックにセットした scrollTop を記録しておく。
  // onScroll 時に scrollTop が同値ならワープ起因とみなしスキップ。
  const lastProgrammaticScrollTopRef = useRef<number | null>(null)

  // scrollTop をサイレント更新（次の onScroll での再処理を抑止）
  const setScrollTopSilently = useCallback((el: HTMLDivElement, top: number) => {
    if (typeof el.scrollTo === 'function') {
      try {
        el.scrollTo({ top, behavior: 'instant' as ScrollBehavior })
      } catch {
        el.scrollTop = top
      }
    } else {
      el.scrollTop = top
    }
    // ブラウザ差吸収: scrollTo が無視された環境では直代入で再設定
    if (Math.abs(el.scrollTop - top) > 1) {
      el.scrollTop = top
    }
    lastProgrammaticScrollTopRef.current = top
  }, [])

  // 数字値 → 中央セット内の絶対 index（例: digitValue=3 → 23）
  const centerIndexFor = useCallback((d: number) => CENTER_SET_START + d, [])

  // 現在の scrollTop から論理 index (0〜TOTAL_CELLS-1) と数字 (0〜9) を取得
  const readCurrent = useCallback((scrollTop: number) => {
    const absIndex = Math.round(scrollTop / CELL_HEIGHT)
    const clampedAbs = Math.max(0, Math.min(TOTAL_CELLS - 1, absIndex))
    const digit = ((clampedAbs % 10) + 10) % 10
    return { absIndex: clampedAbs, digit }
  }, [])

  // 端に近づいたら中央セットへワープ（数字は保ったまま scrollTop を瞬時書き換え）
  const maybeWarp = useCallback((el: HTMLDivElement) => {
    const { absIndex, digit } = readCurrent(el.scrollTop)
    if (absIndex < WARP_LOWER_THRESHOLD || absIndex >= WARP_UPPER_THRESHOLD) {
      const target = centerIndexFor(digit) * CELL_HEIGHT
      setScrollTopSilently(el, target)
    }
  }, [centerIndexFor, readCurrent, setScrollTopSilently])

  // キーボード操作（値変化時に tick）
  // キー押下は「確定操作」なので、連続音ではなく 1 キー = 1 tick のまま。
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const next = ((digitValue - 1) % 10 + 10) % 10
        if (next !== digitValue) {
          playTick()
          lastTickDigitRef.current = next
          onChangeDigit(digitIndex, next)
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = (digitValue + 1) % 10
        if (next !== digitValue) {
          playTick()
          lastTickDigitRef.current = next
          onChangeDigit(digitIndex, next)
        }
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        const next = Number(e.key)
        if (next !== digitValue) {
          playTick()
          lastTickDigitRef.current = next
          onChangeDigit(digitIndex, next)
        }
      }
    },
    [digitIndex, digitValue, disabled, onChangeDigit]
  )

  // onScroll: 連続 tick + ワープ + debounce 確定通知
  const handleScroll = useCallback(() => {
    if (disabled) return
    const el = containerRef.current
    if (!el) return

    // ワープ起因の scroll イベントは tick / 再ワープをスキップ
    // （最後にプログラマティックにセットした scrollTop と一致していれば無視）
    if (
      lastProgrammaticScrollTopRef.current !== null &&
      Math.abs(el.scrollTop - lastProgrammaticScrollTopRef.current) <= 1
    ) {
      lastProgrammaticScrollTopRef.current = null
      return
    }
    lastProgrammaticScrollTopRef.current = null

    const { digit } = readCurrent(el.scrollTop)

    // 連続 tick: 数字が変わった瞬間に即時鳴らす（ギア感）
    if (digit !== lastTickDigitRef.current) {
      lastTickDigitRef.current = digit
      playTick()
    }

    // 端に近づいたら中央セットへワープ
    maybeWarp(el)

    // 確定通知は debounce 150ms（スクロール停止時のみ）
    if (scrollTimer.current) clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => {
      const el2 = containerRef.current
      if (!el2) return
      const { digit: finalDigit } = readCurrent(el2.scrollTop)
      if (finalDigit !== digitValue) {
        onChangeDigit(digitIndex, finalDigit)
      }
    }, 150)
  }, [digitIndex, digitValue, disabled, maybeWarp, onChangeDigit, readCurrent])

  // value 変化時: 中央セット内の該当位置へスクロール（初回マウント含む）
  // 中央セットに既に正しい位置がある場合は何もしない。
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const target = centerIndexFor(digitValue) * CELL_HEIGHT
    const current = readCurrent(el.scrollTop)
    if (current.digit === digitValue) {
      // 同じ数字を指しているなら基本触らないが、端セットにいる場合は中央に寄せる
      if (
        current.absIndex < WARP_LOWER_THRESHOLD ||
        current.absIndex >= WARP_UPPER_THRESHOLD
      ) {
        setScrollTopSilently(el, target)
      }
      lastTickDigitRef.current = digitValue
      return
    }
    // 数字が違えば中央セットの該当位置へ移動
    setScrollTopSilently(el, target)
    lastTickDigitRef.current = digitValue
  }, [centerIndexFor, digitValue, readCurrent, setScrollTopSilently])

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
    }
  }, [])

  // 中央からの距離ベースで色/不透明度を変化させる（円筒感）
  const padCells = Math.floor(VISIBLE_CELLS / 2)

  // 5 セット分のセルを並べる。React の key は「セット番号 + 数字」で一意。
  const cells = useMemo(() => {
    const arr: Array<{ key: string; digit: number }> = []
    for (let s = 0; s < SET_COUNT; s++) {
      for (const d of DIGITS) {
        arr.push({ key: `${s}-${d}`, digit: d })
      }
    }
    return arr
  }, [])

  return (
    <div
      ref={containerRef}
      role="spinbutton"
      aria-label={`${label}ODO ${digitIndex + 1} 桁目`}
      aria-valuemin={0}
      aria-valuemax={9}
      aria-valuenow={digitValue}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onScroll={handleScroll}
      className="relative outline-none focus:ring-2 focus:ring-orange-400/60 rounded-lg"
      style={{
        width: 48,
        height: CONTAINER_HEIGHT,
        overflowY: disabled ? 'hidden' : 'auto',
        scrollSnapType: 'y mandatory',
        touchAction: 'pan-y',
        overscrollBehavior: 'contain',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      <div style={{ paddingTop: CELL_HEIGHT * padCells, paddingBottom: CELL_HEIGHT * padCells }}>
        {cells.map(({ key, digit }) => {
          const isSelected = digit === digitValue
          return (
            <div
              key={key}
              data-digit={digit}
              style={{
                height: CELL_HEIGHT,
                scrollSnapAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
                fontWeight: isSelected ? 600 : 400,
                color: isSelected ? '#FFFFFF' : 'rgba(235, 235, 245, 0.45)',
                fontVariantNumeric: 'tabular-nums',
                fontFamily: 'var(--font-metrophobic), sans-serif',
                transition: 'color 120ms, font-weight 120ms',
                userSelect: 'none',
              }}
            >
              {digit}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// -------------------------------------------------------
// BottomSheet: 自前ボトムシート
// -------------------------------------------------------

interface BottomSheetProps {
  label: string
  initialValue: number
  onConfirm: (next: number) => void
  onCancel: () => void
}

function BottomSheet({
  label,
  initialValue,
  onConfirm,
  onCancel,
}: BottomSheetProps) {
  const [digits, setDigits] = useState<number[]>(() => numberToDigits(initialValue))
  const [entered, setEntered] = useState(false)

  // 表示時のスライドイン
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // body overflow 抑止
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // ESC で閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  const handleChangeDigit = useCallback(
    (digitIndex: number, newDigitValue: number) => {
      setDigits((current) => {
        if (current[digitIndex] === newDigitValue) return current
        const next = [...current]
        next[digitIndex] = newDigitValue
        return next
      })
    },
    []
  )

  const handleConfirm = () => {
    onConfirm(digitsToNumber(digits))
  }

  const currentNumber = digitsToNumber(digits)

  // 円筒風グラデーション（上下が暗く、中央が明るい）
  const cylinderBg =
    'linear-gradient(to bottom, #0a0a0a 0%, #2c2c2e 50%, #0a0a0a 100%)'
  // 上下フェード用マスク（数字が端でフェードアウト）
  const cylinderMask =
    'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)'

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={`${label}ODO 入力`}
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
      data-testid="odo-bottom-sheet-overlay"
    >
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-2xl shadow-2xl"
        style={{
          backgroundColor: '#1c1c1e',
          transform: entered ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* グラブハンドル（iOS 風） */}
        <div className="flex justify-center pt-2 pb-1">
          <div
            aria-hidden="true"
            className="rounded-full"
            style={{
              width: 36,
              height: 5,
              backgroundColor: 'rgba(235, 235, 245, 0.3)',
            }}
          />
        </div>

        {/* ヘッダー: キャンセル / タイトル / 確定 */}
        <div className="relative flex items-center justify-between px-4 py-3">
          <button
            type="button"
            aria-label="キャンセル"
            onClick={onCancel}
            className="w-10 h-10 flex items-center justify-center rounded-full text-2xl font-medium text-gray-300 hover:text-white active:bg-white/10 transition-colors"
          >
            ×
          </button>
          {/* 中央タイトル（絶対配置でセンタリング） */}
          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none">
            <span className="font-semibold text-base text-white tracking-wide">
              <span className="mr-1">{label}</span>ODO
            </span>
          </div>
          <button
            type="button"
            aria-label="確定"
            onClick={handleConfirm}
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-white/10 hover:scale-105 active:scale-95 transition-transform"
          >
            <FaCheckCircle
              data-icon="check-circle"
              className="w-8 h-8"
              style={{ color: '#2FBF71' }}
              aria-hidden="true"
            />
          </button>
        </div>

        {/* 現在値（大きく表示） */}
        <div className="px-4 pt-2 pb-3 text-center">
          <span
            className="font-semibold text-2xl tracking-widest text-white"
            style={{
              fontFamily: 'var(--font-metrophobic), sans-serif',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatNumber(currentNumber)}
          </span>
          <span className="ml-2 text-base text-gray-400">km</span>
        </div>

        {/* ダイヤル本体（黒背景 + 円筒風グラデーション） */}
        <div
          role="group"
          aria-label={`${label}ODO ダイヤル`}
          className="mx-4 mb-4 rounded-xl"
          style={{
            background: cylinderBg,
            boxShadow:
              'inset 0 2px 6px rgba(0,0,0,0.8), inset 0 -2px 6px rgba(0,0,0,0.8)',
          }}
        >
          <div className="relative flex items-center justify-center py-4">
            {/* 選択中央ハイライト帯 */}
            <div
              aria-hidden="true"
              className="absolute left-3 right-3 pointer-events-none rounded-lg"
              style={{
                top: '50%',
                transform: 'translateY(-50%)',
                height: CELL_HEIGHT,
                backgroundColor: 'rgba(255,255,255,0.08)',
                boxShadow:
                  '0 0 0 1px rgba(255,255,255,0.08)',
              }}
            />
            {/* マスクで上下フェード */}
            <div
              className="flex items-center justify-center gap-2"
              style={{
                WebkitMaskImage: cylinderMask,
                maskImage: cylinderMask,
              }}
            >
              {digits.map((digitValue, digitIndex) => (
                <DialColumn
                  key={digitIndex}
                  digitIndex={digitIndex}
                  digitValue={digitValue}
                  label={label}
                  disabled={false}
                  onChangeDigit={handleChangeDigit}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 下部セーフエリア */}
        <div style={{ height: 'env(safe-area-inset-bottom, 16px)' }} />
      </div>
    </div>
  )
}

// -------------------------------------------------------
// OdoDialInput (main)
// -------------------------------------------------------

export default function OdoDialInput({
  label,
  value,
  onChange,
  disabled = false,
  placeholder,
}: OdoDialInputProps) {
  // タッチデバイス判定
  // SSR / 初回 render: null (不明)
  // クライアントで matchMedia を購読
  const [isTouchDevice, setIsTouchDevice] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(pointer: coarse)')
    setIsTouchDevice(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches)
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    } else if (typeof (mql as unknown as { addListener?: (h: (e: MediaQueryListEvent) => void) => void }).addListener === 'function') {
      // 古い Safari フォールバック
      const legacy = mql as unknown as {
        addListener: (h: (e: MediaQueryListEvent) => void) => void
        removeListener: (h: (e: MediaQueryListEvent) => void) => void
      }
      legacy.addListener(handler)
      return () => legacy.removeListener(handler)
    }
  }, [])

  // ボトムシートの開閉
  const [sheetOpen, setSheetOpen] = useState(false)

  // PC 用 input の状態
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const [draftInput, setDraftInput] = useState<string>('')
  // Escape 時に次の blur で commit を抑制するためのフラグ
  const suppressNextCommitRef = useRef(false)

  const baseValue = value ?? placeholder ?? 0

  // コンパクト枠タップ
  const handleCompactActivate = useCallback(() => {
    if (disabled) return
    if (isTouchDevice === true) {
      setSheetOpen(true)
    } else {
      // PC (isTouchDevice === false) or 未判定 (null): input にフォーカス
      inputRef.current?.focus()
    }
  }, [disabled, isTouchDevice])

  const handleSheetConfirm = useCallback(
    (next: number) => {
      setSheetOpen(false)
      onChange(next)
    },
    [onChange]
  )

  const handleSheetCancel = useCallback(() => {
    setSheetOpen(false)
  }, [])

  // PC input 値コミット
  const commitInput = useCallback(() => {
    const trimmed = draftInput.trim()
    if (trimmed === '') {
      return // 空は無視
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.max(0, Math.min(999999, Math.trunc(parsed)))
    if (clamped !== value) {
      onChange(clamped)
    }
  }, [draftInput, onChange, value])

  const handleInputFocus = () => {
    setInputFocused(true)
    setDraftInput(value != null ? String(value) : '')
  }

  const handleInputBlur = () => {
    if (suppressNextCommitRef.current) {
      suppressNextCommitRef.current = false
    } else {
      commitInput()
    }
    setInputFocused(false)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitInput()
      inputRef.current?.blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // draft を破棄して commit をスキップ
      suppressNextCommitRef.current = true
      setDraftInput(value != null ? String(value) : '')
      inputRef.current?.blur()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    // 数値のみ許可
    if (raw === '' || /^[0-9]+$/.test(raw)) {
      setDraftInput(raw)
    }
  }

  // 表示値（PC input フォーカス中は input が表示を担う）
  const renderedText = useMemo(() => {
    if (value !== null) return formatNumber(value)
    if (placeholder !== undefined) return formatNumber(placeholder)
    return '------'
  }, [value, placeholder])

  const isEmpty = value === null

  return (
    <>
      <div
        role="group"
        aria-label={`${label}ODO 入力`}
        aria-disabled={disabled || undefined}
        className={`flex items-center gap-3 px-1 transition-opacity ${
          disabled ? 'opacity-40' : ''
        }`}
      >
        {/* icon */}
        <img
          src="/icons/odo.svg"
          alt=""
          className="w-10 h-10 object-contain flex-shrink-0"
        />

        {/* label */}
        <span
          className="font-bold text-lg flex-shrink-0"
          style={{ color: '#1C2948' }}
        >
          <span className="mr-1">{label}</span>ODO
        </span>

        {/* コンパクト表示コンテナ
            クリック可能だが、中に実 input を内包する必要があるため
            <button> ではなく <div role="button"> にする（HTML 仕様違反回避） */}
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          aria-label={`${label}ODO を編集`}
          onClick={handleCompactActivate}
          onKeyDown={(e) => {
            if (disabled) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleCompactActivate()
            }
          }}
          className="flex-1 bg-white rounded-md border-2 border-gray-200 h-12 px-4 flex items-center justify-end gap-2 relative"
          style={{
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          data-testid="odo-compact"
        >
          {/* PC 用 input: 常に DOM に存在。フォーカス時のみ可視 */}
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            value={inputFocused ? draftInput : (value ?? '')}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            min={0}
            max={999999}
            disabled={disabled}
            tabIndex={-1}
            aria-hidden={!inputFocused}
            className="absolute inset-0 w-full h-full px-4 text-right text-2xl font-bold outline-none bg-transparent rounded-lg"
            style={{
              color: '#1C2948',
              opacity: inputFocused ? 1 : 0,
              pointerEvents: inputFocused ? 'auto' : 'none',
              fontFamily: 'var(--font-metrophobic), sans-serif',
              fontVariantNumeric: 'tabular-nums',
              // focus 時以外は見えない（表示は下の span が担う）
            }}
            data-testid="odo-native-input"
          />

          {!inputFocused && (
            <span
              className="font-bold text-2xl tracking-wider pointer-events-none"
              style={{
                color: isEmpty ? '#9CA3AF' : '#1C2948',
                fontFamily: 'var(--font-metrophobic), sans-serif',
                fontVariantNumeric: 'tabular-nums',
              }}
              data-testid="odo-display-value"
            >
              {renderedText}
            </span>
          )}
          <span className="text-gray-500 text-lg font-medium pointer-events-none">km</span>
        </div>
      </div>

      {/* ボトムシート（タッチデバイス時） */}
      {sheetOpen && (
        <BottomSheet
          label={label}
          initialValue={value ?? baseValue}
          onConfirm={handleSheetConfirm}
          onCancel={handleSheetCancel}
        />
      )}
    </>
  )
}
