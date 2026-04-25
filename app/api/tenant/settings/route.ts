import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { tenantSettingsPatchSchema } from '@/lib/validations'

/**
 * GET /api/tenant/settings
 *
 * 現在ログイン中ユーザーが所属するテナントの設定値を返す。ADMIN 限定。
 */
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: {
        id: true,
        businessDayStartMinutes: true,
      },
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    return NextResponse.json(tenant)
  } catch (e) {
    console.error('[GET /api/tenant/settings]', e)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    )
  }
}

/**
 * PATCH /api/tenant/settings
 *
 * テナント設定を更新する。ADMIN 限定。
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const raw = await req.json()
    const parsed = tenantSettingsPatchSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const updated = await prisma.tenant.update({
      where: { id: session.user.tenantId },
      data: parsed.data,
      select: {
        id: true,
        businessDayStartMinutes: true,
      },
    })

    return NextResponse.json(updated)
  } catch (e) {
    console.error('[PATCH /api/tenant/settings]', e)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    )
  }
}
