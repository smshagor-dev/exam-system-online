import { NextRequest, NextResponse } from 'next/server'
import { UserRole } from '@prisma/client'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { getApiErrorStatus, requireAdminApiSession } from '@/lib/academic-admin'
import { prisma } from '@/lib/prisma'
import { degreeLevelSchema } from '@/lib/validators'

export async function GET(req: NextRequest) {
  try {
    await requireAdminApiSession()
    const { searchParams } = new URL(req.url)
    const search = (searchParams.get('search') || '').trim()
    const isActive = searchParams.get('isActive')

    const items = await prisma.degreeLevel.findMany({
      where: {
        ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] } : {}),
        ...(isActive === 'true' ? { isActive: true } : isActive === 'false' ? { isActive: false } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json(items)
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdminApiSession()
    if (session.user.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: 'Only Super Admin can create degree levels' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = degreeLevelSchema.safeParse({
      ...body,
      defaultYears: body.defaultYears ? Number(body.defaultYears) : undefined,
      sortOrder: body.sortOrder ? Number(body.sortOrder) : 0,
      isActive: body.isActive ?? true,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const existing = await prisma.degreeLevel.findFirst({
      where: { code: parsed.data.code },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ error: 'Degree level code already exists' }, { status: 409 })
    }

    const item = await prisma.degreeLevel.create({ data: parsed.data })
    return NextResponse.json(item, { status: 201 })
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to create degree level')
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Degree level code already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: getApiErrorStatus(message) })
  }
}
