import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import { programSemesterSchema } from '@/lib/validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const item = await prisma.programSemester.findUnique({
      where: { id },
      include: { program: true, programYear: true, semester: true, _count: { select: { academicOfferings: true } } },
    })
    if (!item) return NextResponse.json({ error: 'Program semester not found' }, { status: 404 })
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
    const existing = await prisma.programSemester.findUnique({
      where: { id },
      include: { program: true },
    })
    if (!existing) return NextResponse.json({ error: 'Program semester not found' }, { status: 404 })
    if (!canAccessDepartment(scope, existing.program.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = programSemesterSchema.partial().safeParse({
      ...body,
      semesterNumber: body.semesterNumber ? Number(body.semesterNumber) : body.semesterNumber,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const item = await prisma.programSemester.update({ where: { id }, data: parsed.data })
    return NextResponse.json(item)
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Program semester mapping already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to update program semester') }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const existing = await prisma.programSemester.findUnique({
      where: { id },
      include: { program: true },
    })
    if (!existing) return NextResponse.json({ error: 'Program semester not found' }, { status: 404 })
    if (!canAccessDepartment(scope, existing.program.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const item = await prisma.programSemester.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json(item)
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to archive program semester') }, { status: 500 })
  }
}
