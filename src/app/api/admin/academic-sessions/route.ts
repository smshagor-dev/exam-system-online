import { NextRequest, NextResponse } from 'next/server'
import { UserRole } from '@prisma/client'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { requireAdminApiSession } from '@/lib/academic-admin'
import { prisma } from '@/lib/prisma'
import { academicSessionSchema } from '@/lib/validators'

async function ensureSingleCurrentSession(id?: string) {
  await prisma.academicSession.updateMany({
    where: id ? { isCurrent: true, NOT: { id } } : { isCurrent: true },
    data: { isCurrent: false },
  })
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminApiSession()
    const { searchParams } = new URL(req.url)
    const search = (searchParams.get('search') || '').trim()

    const items = await prisma.academicSession.findMany({
      where: search
        ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] }
        : undefined,
      orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
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
      return NextResponse.json({ error: 'Only Super Admin can create academic sessions' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = academicSessionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    if (parsed.data.isCurrent) {
      await ensureSingleCurrentSession()
    }

    const item = await prisma.academicSession.create({
      data: {
        ...parsed.data,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        admissionStartDate: parsed.data.admissionStartDate ? new Date(parsed.data.admissionStartDate) : null,
        admissionEndDate: parsed.data.admissionEndDate ? new Date(parsed.data.admissionEndDate) : null,
      },
    })
    return NextResponse.json(item, { status: 201 })
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Academic session code already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to create academic session') }, { status: 500 })
  }
}
