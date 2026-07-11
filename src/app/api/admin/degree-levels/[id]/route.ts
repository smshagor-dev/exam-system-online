import { NextRequest, NextResponse } from 'next/server'
import { UserRole } from '@prisma/client'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { getApiErrorStatus, requireAdminApiSession } from '@/lib/academic-admin'
import { prisma } from '@/lib/prisma'
import { degreeLevelSchema } from '@/lib/validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    await requireAdminApiSession()
    const item = await prisma.degreeLevel.findUnique({ where: { id } })
    if (!item) return NextResponse.json({ error: 'Degree level not found' }, { status: 404 })
    return NextResponse.json(item)
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const session = await requireAdminApiSession()
    if (session.user.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: 'Only Super Admin can update degree levels' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = degreeLevelSchema.partial().safeParse({
      ...body,
      defaultYears: body.defaultYears ? Number(body.defaultYears) : body.defaultYears,
      sortOrder: body.sortOrder ? Number(body.sortOrder) : body.sortOrder,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    if (parsed.data.code) {
      const existing = await prisma.degreeLevel.findFirst({
        where: {
          code: parsed.data.code,
          NOT: { id },
        },
        select: { id: true },
      })
      if (existing) {
        return NextResponse.json({ error: 'Degree level code already exists' }, { status: 409 })
      }
    }

    const item = await prisma.degreeLevel.update({ where: { id }, data: parsed.data })
    return NextResponse.json(item)
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to update degree level')
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Degree level code already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: getApiErrorStatus(message) })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const session = await requireAdminApiSession()
    if (session.user.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: 'Only Super Admin can archive degree levels' }, { status: 403 })
    }

    const activePrograms = await prisma.academicProgram.count({ where: { degreeLevelId: id, isActive: true } })
    if (activePrograms > 0) {
      return NextResponse.json({ error: 'Cannot archive degree level with active programs' }, { status: 409 })
    }

    const item = await prisma.degreeLevel.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json(item)
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to archive degree level')
    return NextResponse.json({ error: message }, { status: getApiErrorStatus(message) })
  }
}
