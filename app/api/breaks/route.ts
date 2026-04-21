import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * 休憩を新規開始する。
 *
 * 排他制御:
 *   - 同一ユーザーが「未終了の休憩」を複数持つことを禁止する。
 *   - React 19 Strict Mode の二重 useEffect / 連打などで並行 POST が到達し得るため、
 *     findFirst + create を Prisma の Serializable トランザクションで包み、
 *     競合した場合は片方のみ 201、他方は 409 を返す。
 *   - Serializable 分離レベルで衝突が発生した場合、Postgres は
 *     P2034 (Transaction failed due to a write conflict or a deadlock) を投げる。
 *     この場合は 409 として扱い、クライアントは既存休憩の復元フローへ流せる。
 */
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const breakRecord = await prisma.$transaction(
      async (tx) => {
        const activeBreak = await tx.breakRecord.findFirst({
          where: {
            userId: session.user.userId,
            tenantId: session.user.tenantId,
            endTime: null,
          },
        })
        if (activeBreak) {
          // トランザクション内では HTTP レスポンスを組み立てられないため、
          // 識別可能なシンボルを throw し、外側でキャッチして 409 を返す。
          const err = new Error('ACTIVE_BREAK_EXISTS') as Error & {
            code: 'ACTIVE_BREAK_EXISTS'
            breakRecordId: string
          }
          err.code = 'ACTIVE_BREAK_EXISTS'
          err.breakRecordId = activeBreak.id
          throw err
        }

        return tx.breakRecord.create({
          data: {
            userId: session.user.userId,
            tenantId: session.user.tenantId,
            startTime: new Date(),
          },
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )

    return NextResponse.json(breakRecord, { status: 201 })
  } catch (e) {
    // 既存休憩があった場合
    if (
      e instanceof Error &&
      (e as Error & { code?: string }).code === 'ACTIVE_BREAK_EXISTS'
    ) {
      const breakRecordId = (e as Error & { breakRecordId?: string }).breakRecordId
      return NextResponse.json(
        { error: 'Active break already exists', breakRecordId },
        { status: 409 },
      )
    }

    // Serializable 分離レベルでの書き込み競合。
    // 並行 POST の両方が findFirst を通過して create に突入した場合、
    // Postgres が片方を serialization failure (P2034) として中断する。
    // この場合は「もう一方の POST が先に作成を成功させた」ことを意味するので、
    // 409 として扱う。breakRecordId は取得できないが、クライアント側は
    // GET /api/breaks/active で復元できる設計のため支障はない。
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2034'
    ) {
      return NextResponse.json(
        { error: 'Active break already exists' },
        { status: 409 },
      )
    }

    console.error('[POST /api/breaks]', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
