import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import { programYearSchema } from '@/lib/validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const item = await prisma.programYear.findUnique({
      where: { id },
      include: { program: true, _count: { select: { groups: true, academicOfferings: true } } },
    })
    if (!item) return NextResponse.json({ error: 'Program year not found' }, { status: 404 })
    if (!canAccessDepartment(scope, item.program.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }
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
    const scope = await getAdminScope()
    const existing = await prisma.programYear.findUnique({
      where: { id },
      include: { program: true },
    })
    if (!existing) return NextResponse.json({ error: 'Program year not found' }, { status: 404 })
    if (!canAccessDepartment(scope, existing.program.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = programYearSchema.partial().safeParse({
      ...body,
      yearNumber: body.yearNumber ? Number(body.yearNumber) : body.yearNumber,
      sortOrder: body.sortOrder ? Number(body.sortOrder) : body.sortOrder,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const program = parsed.data.programId
      ? await prisma.academicProgram.findUnique({ where: { id: parsed.data.programId } })
      : existing.program

    if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    if (!canAccessDepartment(scope, program.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }
    if (parsed.data.yearNumber && parsed.data.yearNumber > program.durationYears) {
      return NextResponse.json({ error: 'Program year exceeds the configured program duration' }, { status: 400 })
    }

    const item = await prisma.programYear.update({ where: { id }, data: parsed.data })
    return NextResponse.json(item)
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Program year already exists for this program' }, { status: 409 })
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to update program year') }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const existing = await prisma.programYear.findUnique({
      where: { id },
      include: { program: true },
    })
    if (!existing) return NextResponse.json({ error: 'Program year not found' }, { status: 404 })
    if (!canAccessDepartment(scope, existing.program.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const item = await prisma.programYear.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json(item)
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to archive program year') }, { status: 500 })
  }
}

