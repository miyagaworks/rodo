/**
 * 勤務区間を返す抽象レイヤ。
 *
 * Phase 1 実装: 「過去 24 時間のスライディングウィンドウ」を返す。
 * 引数の userId は Phase 1 では使用しない。
 *
 * Phase 2 で Shift テーブルを参照する実装に差し替える予定。
 * その際は本関数のシグネチャ（返り値の { start, end } 形状）を維持しつつ、
 * 内部で prisma.shift.findFirst などを呼ぶ形に書き換える。
 * 呼び出し側（API 層）は差し替え時に変更不要な設計とする。
 */

export interface WorkSessionRange {
  start: Date
  end: Date
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * 指定ユーザーの現在の勤務区間を返す。
 *
 * Phase 1: userId は無視され、end = now / start = now - 24h を返す。
 * Phase 2: Shift テーブル参照に差し替え予定。
 *
 * @param userId 対象ユーザー ID（Phase 1 では未使用だがシグネチャは維持）
 * @param now 基準時刻（省略時は new Date()）
 */
export function getCurrentWorkSession(
  userId: string,
  now: Date = new Date(),
): WorkSessionRange {
  // Phase 1: userId を無視する（Phase 2 で Shift テーブル参照に差し替える）
  void userId

  const end = new Date(now.getTime())
  const start = new Date(now.getTime() - ONE_DAY_MS)
  return { start, end }
}
