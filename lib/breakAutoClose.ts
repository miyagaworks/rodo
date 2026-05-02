import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { BREAK_DURATION_SECONDS } from '@/lib/constants/break'

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
  const limitMs = BREAK_DURATION_SECONDS * 1000

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
    const elapsedMs = now.getTime() - record.startTime.getTime()
    if (elapsedMs <= limitMs) continue

    const endTime =
      record.pauseTime ?? new Date(record.startTime.getTime() + limitMs)

    await client.breakRecord.update({
      where: { id: record.id },
      data: { endTime },
    })
  }
}
