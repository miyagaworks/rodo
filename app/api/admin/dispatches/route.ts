import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/admin/dispatches
 *
 * 全テナント案件の一覧（ページング・フィルタ対応）。
 * 認可: ADMIN ロールのみ。
 *
 * Query:
 *   from         YYYY-MM-DD       dispatchTime 下限
 *   to           YYYY-MM-DD       dispatchTime 上限（その日 23:59:59.999 まで含む）
 *   status       'draft' | 'active' | 'completed' | 'unbilled' | 'billed' | 'stored' | 'all'
 *   userId       担当隊員フィルタ
 *   assistanceId アシスタンス会社フィルタ
 *   page         ページ番号（1 始まり、デフォ 1）
 *   pageSize     ページサイズ（デフォ 50、上限 200）
 */

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

export async function GET(req: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)

  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const status = searchParams.get('status')
  const userId = searchParams.get('userId')
  const assistanceId = searchParams.get('assistanceId')

  const pageRaw = parseInt(searchParams.get('page') ?? '1', 10)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
  const pageSizeRaw = parseInt(
    searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE),
    10,
  )
  const pageSize = Math.min(
    Math.max(Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  )

  const where: Prisma.DispatchWhereInput = {
    tenantId: session.user.tenantId,
  }

  // 期間フィルタ（dispatchTime ベース）
  if (from || to) {
    const dispatchTime: Prisma.DateTimeNullableFilter = {}
    if (from) {
      const d = new Date(`${from}T00:00:00.000+09:00`)
      if (!Number.isNaN(d.getTime())) dispatchTime.gte = d
    }
    if (to) {
      const d = new Date(`${to}T23:59:59.999+09:00`)
      if (!Number.isNaN(d.getTime())) dispatchTime.lte = d
    }
    if (dispatchTime.gte || dispatchTime.lte) {
      where.dispatchTime = dispatchTime
    }
  }

  // ステータスフィルタ
  switch (status) {
    case 'draft':
      where.isDraft = true
      break
    case 'active':
      // 進行中: STANDBY 以外で完了前
      where.status = { in: ['DISPATCHED', 'ONSITE', 'TRANSPORTING'] }
      where.isDraft = false
      break
    case 'completed':
      where.status = { in: ['COMPLETED', 'RETURNED', 'STORED'] }
      where.isDraft = false
      break
    case 'unbilled':
      where.billedAt = null
      where.isDraft = false
      break
    case 'billed':
      where.billedAt = { not: null }
      break
    case 'stored':
      // 保管中（二次搬送待ち）。Phase 3.5 で追加。
      where.status = 'STORED'
      where.isDraft = false
      break
    case 'all':
    case null:
    case undefined:
      break
    default:
      // 未知の status は無視
      break
  }

  if (userId) where.userId = userId
  if (assistanceId) where.assistanceId = assistanceId

  const [total, dispatches] = await prisma.$transaction([
    prisma.dispatch.count({ where }),
    prisma.dispatch.findMany({
      where,
      orderBy: [{ dispatchTime: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        dispatchNumber: true,
        dispatchTime: true,
        status: true,
        isDraft: true,
        billedAt: true,
        scheduledSecondaryAt: true,
        type: true,
        customerName: true,
        plateRegion: true,
        plateClass: true,
        plateKana: true,
        plateNumber: true,
        user: { select: { id: true, name: true } },
        assistance: {
          select: { id: true, name: true, displayAbbreviation: true },
        },
        report: {
          select: {
            id: true,
            isDraft: true,
            totalConfirmedAmount: true,
          },
        },
      },
    }),
  ])

  // plate を専用構造体にまとめる（API 利用側のラッピング負荷を下げる）
  const items = dispatches.map((d) => {
    const plate =
      d.plateRegion || d.plateClass || d.plateKana || d.plateNumber
        ? {
            region: d.plateRegion ?? '',
            class: d.plateClass ?? '',
            kana: d.plateKana ?? '',
            number: d.plateNumber ?? '',
          }
        : null
    return {
      id: d.id,
      dispatchNumber: d.dispatchNumber,
      dispatchTime: d.dispatchTime,
      status: d.status,
      isDraft: d.isDraft,
      billedAt: d.billedAt,
      scheduledSecondaryAt: d.scheduledSecondaryAt,
      type: d.type,
      user: d.user,
      assistance: d.assistance,
      customerName: d.customerName,
      plate,
      report: d.report,
    }
  })

  return NextResponse.json({
    dispatches: items,
    total,
    page,
    pageSize,
  })
}
