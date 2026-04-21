import { describe, it, expect } from 'vitest'
import {
  calculateUsedBreakSeconds,
  calculateUsedBreakMs,
  type BreakRecordLike,
} from '@/lib/breakUsage'

// 便利関数: 指定秒だけずらした Date を返す
const at = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000)

const BASE = new Date('2026-04-21T12:00:00.000Z')
const WINDOW_START = new Date('2026-04-21T00:00:00.000Z') // BASE の 12h 前
const WINDOW_END = new Date('2026-04-21T12:00:00.000Z') // BASE と同一

describe('calculateUsedBreakSeconds', () => {
  it('空配列 → 0 を返す', () => {
    const result = calculateUsedBreakSeconds([], WINDOW_START, WINDOW_END)
    expect(result).toBe(0)
  })

  it('通常の完了済み休憩 (pause なし) — 10 分消化で 600 秒', () => {
    const records: BreakRecordLike[] = [
      {
        startTime: at(BASE, -600), // 10 分前
        endTime: BASE,
        pauseTime: null,
        resumeTime: null,
      },
    ]
    const result = calculateUsedBreakSeconds(records, WINDOW_START, WINDOW_END)
    expect(result).toBe(600)
  })

  it('pause 中の record — startTime から pauseTime までしかカウントしない', () => {
    // startTime の 3 分後に pause。現在時刻 (WINDOW_END) までさらに 5 分経過。
    // 実消化は 3 分 = 180 秒。
    const start = at(BASE, -480) // 8 分前
    const pauseAt = at(BASE, -300) // 5 分前
    const records: BreakRecordLike[] = [
      {
        startTime: start,
        endTime: null,
        pauseTime: pauseAt,
        resumeTime: null,
      },
    ]
    const result = calculateUsedBreakSeconds(records, WINDOW_START, WINDOW_END)
    expect(result).toBe(180)
  })

  it('pause 中に時間が進んでも累計は増えない', () => {
    const start = at(BASE, -480)
    const pauseAt = at(BASE, -300)
    const records: BreakRecordLike[] = [
      {
        startTime: start,
        endTime: null,
        pauseTime: pauseAt,
        resumeTime: null,
      },
    ]
    // WINDOW_END を 10 分進めても結果は pauseTime で止まる
    const later = new Date(WINDOW_END.getTime() + 10 * 60 * 1000)
    const result = calculateUsedBreakSeconds(records, WINDOW_START, later)
    expect(result).toBe(180)
  })

  it('resume 後の未終了 record — 現在時刻まで累計が増える', () => {
    // resume 後は pauseTime=null になっている想定
    // startTime から現在時刻 (windowEnd) まで全区間カウントされる
    const start = at(BASE, -600) // 10 分前
    const records: BreakRecordLike[] = [
      {
        startTime: start,
        endTime: null,
        pauseTime: null,
        resumeTime: at(BASE, -120), // 2 分前に resume された
      },
    ]
    const result = calculateUsedBreakSeconds(records, WINDOW_START, WINDOW_END)
    // Phase 1 仕様: pause で失われた時間は追跡できないため、全区間カウント
    expect(result).toBe(600)
  })

  it('resume 後に windowEnd を進めれば再び累計が増える', () => {
    const start = at(BASE, -600)
    const records: BreakRecordLike[] = [
      {
        startTime: start,
        endTime: null,
        pauseTime: null,
        resumeTime: at(BASE, -120),
      },
    ]
    const later = new Date(WINDOW_END.getTime() + 60 * 1000) // 1 分進める
    const result = calculateUsedBreakSeconds(records, WINDOW_START, later)
    expect(result).toBe(660)
  })

  it('複数 record を跨いだ合算', () => {
    const records: BreakRecordLike[] = [
      {
        // 10 分
        startTime: at(BASE, -3600),
        endTime: at(BASE, -3000),
        pauseTime: null,
        resumeTime: null,
      },
      {
        // 5 分
        startTime: at(BASE, -1800),
        endTime: at(BASE, -1500),
        pauseTime: null,
        resumeTime: null,
      },
      {
        // pause 中 — 実消化 2 分
        startTime: at(BASE, -600),
        endTime: null,
        pauseTime: at(BASE, -480),
        resumeTime: null,
      },
    ]
    const result = calculateUsedBreakSeconds(records, WINDOW_START, WINDOW_END)
    expect(result).toBe(600 + 300 + 120)
  })

  it('ウィンドウ境界: record.startTime < windowStart の場合、windowStart でクリップ', () => {
    const windowStart = new Date('2026-04-21T11:00:00.000Z')
    const windowEnd = new Date('2026-04-21T12:00:00.000Z')
    const records: BreakRecordLike[] = [
      {
        // startTime は windowStart の 5 分前
        startTime: new Date('2026-04-21T10:55:00.000Z'),
        endTime: new Date('2026-04-21T11:10:00.000Z'),
        pauseTime: null,
        resumeTime: null,
      },
    ]
    // 実消化は 15 分だが、ウィンドウ内は 10 分 = 600 秒
    const result = calculateUsedBreakSeconds(records, windowStart, windowEnd)
    expect(result).toBe(600)
  })

  it('ウィンドウ境界: record.endTime > windowEnd の場合、windowEnd でクリップ', () => {
    const windowStart = new Date('2026-04-21T11:00:00.000Z')
    const windowEnd = new Date('2026-04-21T12:00:00.000Z')
    const records: BreakRecordLike[] = [
      {
        startTime: new Date('2026-04-21T11:55:00.000Z'),
        endTime: new Date('2026-04-21T12:10:00.000Z'),
        pauseTime: null,
        resumeTime: null,
      },
    ]
    // ウィンドウ内は 5 分 = 300 秒
    const result = calculateUsedBreakSeconds(records, windowStart, windowEnd)
    expect(result).toBe(300)
  })

  it('ウィンドウ境界: record 全体がウィンドウ外 (before) → 0', () => {
    const windowStart = new Date('2026-04-21T11:00:00.000Z')
    const windowEnd = new Date('2026-04-21T12:00:00.000Z')
    const records: BreakRecordLike[] = [
      {
        startTime: new Date('2026-04-21T09:00:00.000Z'),
        endTime: new Date('2026-04-21T10:00:00.000Z'),
        pauseTime: null,
        resumeTime: null,
      },
    ]
    const result = calculateUsedBreakSeconds(records, windowStart, windowEnd)
    expect(result).toBe(0)
  })

  it('ウィンドウ境界: record 全体がウィンドウ外 (after) → 0', () => {
    const windowStart = new Date('2026-04-21T11:00:00.000Z')
    const windowEnd = new Date('2026-04-21T12:00:00.000Z')
    const records: BreakRecordLike[] = [
      {
        startTime: new Date('2026-04-21T13:00:00.000Z'),
        endTime: new Date('2026-04-21T14:00:00.000Z'),
        pauseTime: null,
        resumeTime: null,
      },
    ]
    const result = calculateUsedBreakSeconds(records, windowStart, windowEnd)
    expect(result).toBe(0)
  })

  it('未終了・pause なし・resume なし — 現在時刻までカウント', () => {
    const records: BreakRecordLike[] = [
      {
        startTime: at(BASE, -180), // 3 分前に開始
        endTime: null,
        pauseTime: null,
        resumeTime: null,
      },
    ]
    const result = calculateUsedBreakSeconds(records, WINDOW_START, WINDOW_END)
    expect(result).toBe(180)
  })

  it('境界値: startTime === windowStart の record', () => {
    const start = new Date(WINDOW_START.getTime())
    const end = new Date(WINDOW_START.getTime() + 60 * 1000)
    const records: BreakRecordLike[] = [
      {
        startTime: start,
        endTime: end,
        pauseTime: null,
        resumeTime: null,
      },
    ]
    const result = calculateUsedBreakSeconds(records, WINDOW_START, WINDOW_END)
    expect(result).toBe(60)
  })

  it('境界値: endTime === windowEnd の record', () => {
    const start = new Date(WINDOW_END.getTime() - 60 * 1000)
    const end = new Date(WINDOW_END.getTime())
    const records: BreakRecordLike[] = [
      {
        startTime: start,
        endTime: end,
        pauseTime: null,
        resumeTime: null,
      },
    ]
    const result = calculateUsedBreakSeconds(records, WINDOW_START, WINDOW_END)
    expect(result).toBe(60)
  })

  it('pause 中の record でウィンドウ外 pauseTime — windowEnd でクリップ', () => {
    // 未終了だが pauseTime が windowEnd より後にあるケース（通常起こりにくいが境界テスト）
    const windowStart = new Date('2026-04-21T11:00:00.000Z')
    const windowEnd = new Date('2026-04-21T12:00:00.000Z')
    const records: BreakRecordLike[] = [
      {
        startTime: new Date('2026-04-21T11:30:00.000Z'),
        endTime: null,
        pauseTime: new Date('2026-04-21T12:30:00.000Z'),
        resumeTime: null,
      },
    ]
    // windowEnd でクリップされるので 30 分 = 1800 秒
    const result = calculateUsedBreakSeconds(records, windowStart, windowEnd)
    expect(result).toBe(1800)
  })

  it('ミリ秒精度: 切り捨てが発生するケース', () => {
    const records: BreakRecordLike[] = [
      {
        startTime: BASE,
        endTime: new Date(BASE.getTime() + 1500), // 1.5 秒後
        pauseTime: null,
        resumeTime: null,
      },
    ]
    const windowStart = BASE
    const windowEnd = new Date(BASE.getTime() + 10_000)
    const seconds = calculateUsedBreakSeconds(records, windowStart, windowEnd)
    // 1.5 秒 → floor(1500/1000) = 1
    expect(seconds).toBe(1)

    const ms = calculateUsedBreakMs(records, windowStart, windowEnd)
    expect(ms).toBe(1500)
  })
})
