import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getCurrentWorkSession } from '@/lib/workSession'
import { calculateUsedBreakSeconds } from '@/lib/breakUsage'
import { BREAK_DURATION_SECONDS } from '@/lib/constants/break'

/**
 * GET /api/breaks/limit-status
 *
 * 現在ログイン中ユーザーの勤務区間（Phase 1: 過去 24h）における
 * 休憩の累計消化秒と残り秒数、そして新規休憩開始可否を返す。
 *
 * Phase 2 で getCurrentWorkSession が async 化された際の互換性を保つため、
 * 呼び出し側では await を必ず付ける。
 */
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const { start, end } = await getCurrentWorkSession(session.user.userId, now)

    const records = await prisma.breakRecord.findMany({
      where: {
        userId: session.user.userId,
        tenantId: session.user.tenantId,
        startTime: { gte: start },
      },
      select: {
        startTime: true,
        endTime: true,
        pauseTime: true,
        resumeTime: true,
      },
    })

    const usedSeconds = calculateUsedBreakSeconds(records, start, end)
    const remainingSeconds = Math.max(0, BREAK_DURATION_SECONDS - usedSeconds)
    const canStartBreak = usedSeconds < BREAK_DURATION_SECONDS

    return NextResponse.json(
      {
        limitSeconds: BREAK_DURATION_SECONDS,
        usedSeconds,
        remainingSeconds,
        canStartBreak,
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (e) {
    console.error('[GET /api/breaks/limit-status]', e)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    )
  }
}
