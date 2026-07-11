import { NextRequest, NextResponse } from 'next/server'
import { UserRole } from '@prisma/client'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { requireAdminApiSession } from '@/lib/academic-admin'
import { prisma } from '@/lib/prisma'
import { updateAcademicSessionSchema } from '@/lib/validators'

type RouteContext = { params: Promise<{ id: string }> }

async function ensureSingleCurrentSession(id?: string) {
  await prisma.academicSession.updateMany({
    where: id ? { isCurrent: true, NOT: { id } } : { isCurrent: true },
    data: { isCurrent: false },
  })
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    await requireAdminApiSession()
    const item = await prisma.academicSession.findUnique({ where: { id } })
    if (!item) return NextResponse.json({ error: 'Academic session not found' }, { status: 404 })
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
      return NextResponse.json({ error: 'Only Super Admin can update academic sessions' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = updateAcademicSessionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    if (parsed.data.isCurrent) {
      await ensureSingleCurrentSession(id)
    }

    const item = await prisma.academicSession.update({
      where: { id },
      data: {
        ...parsed.data,
        ...(parsed.data.startDate ? { startDate: new Date(parsed.data.startDate) } : {}),
        ...(parsed.data.endDate ? { endDate: new Date(parsed.data.endDate) } : {}),
        ...(parsed.data.admissionStartDate ? { admissionStartDate: new Date(parsed.data.admissionStartDate) } : {}),
        ...(parsed.data.admissionEndDate ? { admissionEndDate: new Date(parsed.data.admissionEndDate) } : {}),
      },
    })
    return NextResponse.json(item)
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Academic session code already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to update academic session') }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const session = await requireAdminApiSession()
    if (session.user.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: 'Only Super Admin can archive academic sessions' }, { status: 403 })
    }

    const item = await prisma.academicSession.update({ where: { id }, data: { isActive: false, isCurrent: false } })
    return NextResponse.json(item)
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to archive academic session') }, { status: 500 })
  }
}
