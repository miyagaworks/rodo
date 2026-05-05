import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { BREAK_DURATION_SECONDS } from '@/lib/constants/break'

const LIMIT_MS = BREAK_DURATION_SECONDS * 1000

/**
 * 自動クローズ判定の最小サブセット。findMany の select で取得する 3 フィールドに対応。
 */
type StaleBreakCandidate = {
  id: string
  startTime: Date
  pauseTime: Date | null
}

/**
 * 1 件の候補レコードについて「上限超過していればセットすべき endTime」を返す。
 * 上限内（経過 <= 60 分）なら null を返し、呼び出し側はスキップする。
 *
 * 仕様（既存 closeStaleBreaks と同一）:
 * - elapsedMs <= LIMIT_MS は対象外（境界 = ちょうど 60 分はクローズしない）
 * - pauseTime があれば endTime = pauseTime（pause した時点で実消化が止まっている扱い）
 * - pauseTime が無ければ endTime = startTime + LIMIT_MS（上限ちょうどで切る）
 *
 * このヘルパーは closeStaleBreaks（ユーザー単位）と closeStaleBreaksForTenant（テナント一括）
 * の両方から共有される。判定ロジックの重複を避けるための内部関数。
 */
function resolveAutoCloseEndTime(
  record: StaleBreakCandidate,
  now: Date,
): Date | null {
  const elapsedMs = now.getTime() - record.startTime.getTime()
  if (elapsedMs <= LIMIT_MS) return null
  return record.pauseTime ?? new Date(record.startTime.getTime() + LIMIT_MS)
}

/**
 * 1 件の候補レコードに対して、必要なら endTime をセットする update を実行する。
 * 上限内ならスキップ（DB 書き込みは行わない）。
 */
async function applyAutoCloseToRecord(
  client: Prisma.TransactionClient | typeof prisma,
  record: StaleBreakCandidate,
  now: Date,
): Promise<void> {
  const endTime = resolveAutoCloseEndTime(record, now)
  if (!endTime) return

  await client.breakRecord.update({
    where: { id: record.id },
    data: { endTime },
  })
}

/**
 * 指定ユーザー / テナントについて、上限時間（BREAK_DURATION_SECONDS = 3600 秒）を
 * 超過した未終了 BreakRecord を自動で endTime をセットしてクローズする。
 *
 * ## 背景
 *
 * ブラウザを閉じる・電源断などで /end API が呼ばれず DB に endTime=null の古いレコードが
 * 残ると、次回 POST /api/breaks が 409 を返し続けて新規開始がブロックされる。
 * クライアント側の 409 復元フローも、古い startTime を見て remaining=0 を計算して
 * 即終了表示してしまうため、サーバー側で先に「上限超過の古いレコード」を片付ける。
 *
 * ## 仕様
 *
 * - userId / tenantId に紐づく endTime=null のレコードを検索
 * - startTime + BREAK_DURATION_SECONDS を超えていたら endTime をセット
 *   - pauseTime があれば endTime = pauseTime（pause した時点で実消化が止まっている扱い）
 *   - pauseTime が無ければ endTime = startTime + BREAK_DURATION_SECONDS（上限ちょうどで切る）
 * - 60 分未満の未終了レコードは触らない（ユーザーが意図して継続している可能性がある）
 * - 既に endTime がセットされているレコードは findFirst の where で除外しているため触らない
 *
 * ## エラー方針
 *
 * 例外は握りつぶさず呼び出し側に伝播させる。古いレコードがクローズできないと
 * 新規 POST も 409 で詰まり続けるため、サイレントに進ませるよりエラーを表に
 * 出して 500 で伝えるべき（呼び出し元の既存 try-catch が 500 として扱う）。
 */
export async function closeStaleBreaks(
  client: Prisma.TransactionClient | typeof prisma,
  args: { userId: string; tenantId: string; now?: Date },
): Promise<void> {
  const now = args.now ?? new Date()

  const stale = await client.breakRecord.findMany({
    where: {
      userId: args.userId,
      tenantId: args.tenantId,
      endTime: null,
    },
    select: {
      id: true,
      startTime: true,
      pauseTime: true,
    },
  })

  for (const record of stale) {
    await applyAutoCloseToRecord(client, record, now)
  }
}

/**
 * 指定テナント配下の全ユーザーについて、上限超過した未終了 BreakRecord を一括クローズする。
 *
 * ## 用途
 *
 * /api/admin/members-status のように tenant 単位で全隊員のステータスを返すエンドポイントで、
 * 個別ユーザーごとに closeStaleBreaks を呼ぶと N+1 になる。1 回の findMany で
 * tenant 配下の endTime=null を全件取得し、上限超過分のみ update することで
 * 10 秒ポーリングのコストを抑える。
 *
 * ## 仕様
 *
 * - tenantId に紐づく endTime=null のレコードをユーザーを問わず全件検索
 * - 各レコードについて closeStaleBreaks と同一の判定ロジック（applyAutoCloseToRecord）を適用
 * - 上限内（経過 <= 60 分）のレコードは触らない
 * - 既存 closeStaleBreaks の判定ロジックと完全に同等であることを保証する
 *   （resolveAutoCloseEndTime / applyAutoCloseToRecord を共有）
 *
 * ## エラー方針
 *
 * closeStaleBreaks と同様、例外は握りつぶさず呼び出し側に伝播させる。
 * クローズに失敗してもダッシュボードの API 自体が 500 で落ちる方が、
 * 古い「休憩中」が永続表示されるサイレント故障より安全。
 */
export async function closeStaleBreaksForTenant(
  client: Prisma.TransactionClient | typeof prisma,
  args: { tenantId: string; now?: Date },
): Promise<void> {
  const now = args.now ?? new Date()

  const stale = await client.breakRecord.findMany({
    where: {
      tenantId: args.tenantId,
      endTime: null,
    },
    select: {
      id: true,
      startTime: true,
      pauseTime: true,
    },
  })

  for (const record of stale) {
    await applyAutoCloseToRecord(client, record, now)
  }
}

/**
 * 出動開始による中断で active な BreakRecord を即時クローズする。
 *
 * ## 業務シナリオ（2026-05-04 ユーザー確認済み仕様）
 *
 * 救援業務において、隊員が休憩中に出動要請が入り、休憩を中断して出動するシナリオは
 * 業務上あり得る。その場合、休憩は自動的に終了したことになる（隊員が手で「休憩終了」を
 * 押さなくても、出動開始時に自動で終了する仕様が業務的に正しい）。
 *
 * ## closeStaleBreaks との違い
 *
 * - 上限判定（経過 > 60 分）を行わない。出動開始時刻でそのまま即時クローズする。
 * - pauseTime があれば endTime = pauseTime（pause した時点で実消化が止まっている扱い）
 * - pauseTime が無ければ endTime = interruptedAt（呼び出し元から渡される出動開始時刻）
 *
 * 「タイマー満了による終了」と「出動開始による中断終了」は業務概念として異なるため、
 * resolveAutoCloseEndTime / applyAutoCloseToRecord は流用しない（上限判定込みのため）。
 *
 * ## 防御
 *
 * 同 user に複数 active break が存在する想定外の状態でも、findMany で取得できた
 * 全件をクローズする。POST /api/breaks 側で 409 を返してはいるが、過去の事故・
 * 並行リクエスト等で複数残ってしまった場合の整合性復旧手段としても機能させる。
 *
 * ## 既知のエッジケース（過剰防御は実装しない）
 *
 * createDispatchSchema の dispatchTime は z.string().nullable().optional() で過去日時を
 * 検証なしに受け入れる。クライアントが過去日時を渡した場合、呼び出し元が
 * interruptedAt = new Date(dispatchTime) を採用すると interruptedAt < BreakRecord.startTime
 * となる稀なケースが起こりうる。本関数はこの前後関係をチェックせず、渡された
 * interruptedAt をそのまま endTime にセットする。業務 UI 上は隊員が dispatchTime を
 * 任意指定する経路は無く、実害は想定していない（API 仕様としてのみ許容される状態）。
 *
 * ## 使用例
 *
 * POST /api/dispatches の prisma.$transaction 内で Dispatch.create の前に呼ぶ。
 * 同一トランザクションで処理することで途中失敗時の整合性を確保する。
 *
 * ```ts
 * const dispatch = await prisma.$transaction(async (tx) => {
 *   const now = new Date(dispatchTime ?? new Date())
 *   await closeActiveBreakOnDispatchStart(tx, {
 *     userId: session.user.userId,
 *     tenantId: session.user.tenantId,
 *     interruptedAt: now,
 *   })
 *   // ...Dispatch.create
 * })
 * ```
 *
 * ## エラー方針
 *
 * closeStaleBreaks と同様、例外は握りつぶさず呼び出し側に伝播させる。
 * BreakRecord の更新が失敗した場合は $transaction 全体が rollback され、
 * Dispatch も作成されないことで整合性を確保する。
 */
export async function closeActiveBreakOnDispatchStart(
  client: Prisma.TransactionClient | typeof prisma,
  args: { userId: string; tenantId: string; interruptedAt: Date },
): Promise<void> {
  const active = await client.breakRecord.findMany({
    where: {
      userId: args.userId,
      tenantId: args.tenantId,
      endTime: null,
    },
    select: {
      id: true,
      pauseTime: true,
    },
  })

  for (const record of active) {
    const endTime = record.pauseTime ?? args.interruptedAt
    await client.breakRecord.update({
      where: { id: record.id },
      data: { endTime },
    })
  }
}
