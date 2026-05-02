import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { closeStaleBreaks } from '@/lib/breakAutoClose'
import { calculateUsedBreakMs } from '@/lib/breakUsage'
import { BREAK_DURATION_SECONDS } from '@/lib/constants/break'

/**
 * 現在ログイン中ユーザーの未終了休憩（endTime === null）を返す。
 * クライアント側の atom が失われた状態で、DB に休憩が残っている場合に
 * 状態を復元するためのエンドポイント。
 *
 * レスポンスには既存の BreakRecord フィールドに加え、サーバー側で算出した
 * `remainingSeconds`（pause を考慮した「この個別休憩の残り秒数」）と
 * `serverNow`（計算基準のサーバー時刻）を含める。クライアントはこれをそのまま
 * atom にセットすることで、独自に startTime からの経過秒を計算する必要がなくなる。
 */
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const now = new Date()

    // 上限超過した古い未終了レコードがあれば先にクローズしておく。
    // 失敗時は例外を伝播させて 500 として扱う（握り潰さない方針）。
    await closeStaleBreaks(prisma, {
      userId: session.user.userId,
      tenantId: session.user.tenantId,
      now,
    })

    const activeBreak = await prisma.breakRecord.findFirst({
      where: {
        userId: session.user.userId,
        tenantId: session.user.tenantId,
        endTime: null,
      },
      orderBy: { startTime: 'desc' },
    })

    if (!activeBreak) {
      return NextResponse.json({ error: 'No active break' }, { status: 404 })
    }

    // この個別休憩の実消化ミリ秒を、limit-status と同じ純関数で算出する。
    // pauseTime ありレコードでも実消化のみがカウントされ、remaining が正しく出る。
    const usedMs = calculateUsedBreakMs(
      [activeBreak],
      activeBreak.startTime,
      now,
    )
    const remainingSeconds = Math.max(
      0,
      Math.floor(BREAK_DURATION_SECONDS - usedMs / 1000),
    )

    return NextResponse.json({
      ...activeBreak,
      remainingSeconds,
      serverNow: now.toISOString(),
    })
  } catch (e) {
    console.error('[GET /api/breaks/active]', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
