/**
 * businessDayStartMinutes を考慮した「業務日」の計算ユーティリティ。
 *
 * businessDayStartMinutes: 0 = 0:00, 360 = 6:00 のように、
 * その分を超えたら翌日の業務日として扱う。
 *
 * 例: businessDayStartMinutes = 360（6:00 AM）で現在時刻が 4:00 AM → 業務日は「前日」。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * JST の現在時刻から業務日の日付文字列 (YYYY-MM-DD) を返す。
 *
 * @param now         現在の Date
 * @param startMinutes businessDayStartMinutes（0〜1439）
 */
export function getBusinessDayDate(
  now: Date,
  startMinutes: number,
): string {
  // UTC ベースで JST に変換
  const jstMs = now.getTime() + JST_OFFSET_MS
  const jst = new Date(jstMs)

  // JST 午前 0 時からの経過分数
  const minutesFromMidnight = jst.getUTCHours() * 60 + jst.getUTCMinutes()

  // 業務日開始前なら前日扱い
  if (minutesFromMidnight < startMinutes) {
    jst.setUTCDate(jst.getUTCDate() - 1)
  }

  const y = jst.getUTCFullYear()
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(jst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 業務日の「昨日」を返す（持ち越し案件の上限日付）。
 */
export function getBusinessDayYesterday(
  now: Date,
  startMinutes: number,
): string {
  const todayStr = getBusinessDayDate(now, startMinutes)
  const yesterday = new Date(`${todayStr}T00:00:00.000+09:00`)
  yesterday.setDate(yesterday.getDate() - 1)

  const y = yesterday.getFullYear()
  const m = String(yesterday.getMonth() + 1).padStart(2, '0')
  const d = String(yesterday.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
