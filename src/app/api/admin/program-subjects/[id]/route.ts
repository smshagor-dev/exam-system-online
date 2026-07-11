import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { validateProgramSemester, validateProgramYear } from '@/lib/academic-scope'
import { prisma } from '@/lib/prisma'
import { programSubjectSchema } from '@/lib/validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const item = await prisma.programSubject.findUnique({
      where: { id },
      include: {
        program: true,
        programYear: true,
        semester: true,
        subject: true,
        programSemester: true,
        _count: { select: { academicOfferings: true } },
      },
    })
    if (!item) return NextResponse.json({ error: 'Program subject not found' }, { status: 404 })
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
    const existing = await prisma.programSubject.findUnique({
      where: { id },
      include: { program: true },
    })
    if (!existing) return NextResponse.json({ error: 'Program subject not found' }, { status: 404 })
    if (!canAccessDepartment(scope, existing.program.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = programSubjectSchema.partial().safeParse({
      ...body,
      creditHours: body.creditHours ? Number(body.creditHours) : body.creditHours,
      theoryHours: body.theoryHours ? Number(body.theoryHours) : body.theoryHours,
      practicalHours: body.practicalHours ? Number(body.practicalHours) : body.practicalHours,
      sortOrder: body.sortOrder ? Number(body.sortOrder) : body.sortOrder,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const nextData = { ...existing, ...parsed.data }
    await validateProgramYear(nextData, prisma)
    if (nextData.programSemesterId) {
      await validateProgramSemester(nextData, prisma)
    }

    const item = await prisma.programSubject.update({ where: { id }, data: parsed.data })
    return NextResponse.json(item)
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Program subject already exists for this curriculum slot' }, { status: 409 })
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to update program subject') }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const existing = await prisma.programSubject.findUnique({
      where: { id },
      include: { program: true },
    })
    if (!existing) return NextResponse.json({ error: 'Program subject not found' }, { status: 404 })
    if (!canAccessDepartment(scope, existing.program.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const item = await prisma.programSubject.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json(item)
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to archive program subject') }, { status: 500 })
  }
}

