/**
 * BreakRecord[] から pause/resume 期間を差し引いた累計消化時間（秒）を算出する純関数。
 *
 * 1 勤務あたりの休憩上限制御（Phase 1）で使用する。
 *
 * ## 計算ロジック
 *
 * 各 record について以下の effective な開始/終了を求め、その差分をミリ秒で合算する。
 *
 *   effectiveStart = max(record.startTime, windowStart)
 *   effectiveEnd   = min(
 *                      record.endTime ?? (record.pauseTime ?? now),
 *                      windowEnd
 *                    )
 *
 * - pause 中（endTime === null && pauseTime !== null && resumeTime === null）の場合、
 *   実消化は pauseTime で止まったものとして扱う（以降の「停止中」時間は加算しない）。
 * - resume 済み（endTime === null && pauseTime === null && resumeTime !== null）の場合、
 *   現在までカウント継続（※ pause されていた期間の情報は API 上失われているため、
 *   Phase 1 ではそのままカウントする設計を採用）。
 * - endTime === null の未終了休憩も対象。now までの経過を計算する。
 *
 * ## 注意
 *
 * 既存 pause/resume API は「resume 時に pauseTime=null にクリアして resumeTime をセット」
 * する実装で、resume された record は pause されていた時間を後から知る手段がない。
 * 本タスクのスコープ外として、この設計を前提にしている。
 *
 * Phase 2 で BreakRecord に pauseDurationMs 等の累積カラムが追加された際は、
 * 本関数の内部ロジックを差し替える想定。
 */

export interface BreakRecordLike {
  startTime: Date
  endTime: Date | null
  pauseTime: Date | null
  resumeTime: Date | null
}

/**
 * 指定ウィンドウ内の実消化休憩時間（秒、切り捨て）を返す。
 *
 * @param records 対象 BreakRecord の配列
 * @param windowStart ウィンドウ開始時刻（含む）
 * @param windowEnd ウィンドウ終了時刻（含む）。通常は現在時刻。
 */
export function calculateUsedBreakSeconds(
  records: BreakRecordLike[],
  windowStart: Date,
  windowEnd: Date,
): number {
  const totalMs = calculateUsedBreakMs(records, windowStart, windowEnd)
  return Math.floor(totalMs / 1000)
}

/**
 * 指定ウィンドウ内の実消化休憩時間（ミリ秒）を返す。
 * 秒単位で丸める前の値が必要な場合に使用する。
 */
export function calculateUsedBreakMs(
  records: BreakRecordLike[],
  windowStart: Date,
  windowEnd: Date,
): number {
  const windowStartMs = windowStart.getTime()
  const windowEndMs = windowEnd.getTime()

  let totalMs = 0

  for (const record of records) {
    const startMs = record.startTime.getTime()

    // この record の「実消化終了時刻」候補を決定する。
    //   1. endTime があれば endTime（終了済み）
    //   2. pauseTime があれば pauseTime（pause 中なので停止時点で止める）
    //   3. それ以外は windowEnd（アクティブな休憩。現在時刻までカウント）
    let candidateEndMs: number
    if (record.endTime !== null) {
      candidateEndMs = record.endTime.getTime()
    } else if (record.pauseTime !== null) {
      candidateEndMs = record.pauseTime.getTime()
    } else {
      candidateEndMs = windowEndMs
    }

    // ウィンドウでクリップする
    const effectiveStartMs = Math.max(startMs, windowStartMs)
    const effectiveEndMs = Math.min(candidateEndMs, windowEndMs)

    if (effectiveEndMs > effectiveStartMs) {
      totalMs += effectiveEndMs - effectiveStartMs
    }
  }

  return totalMs
}
