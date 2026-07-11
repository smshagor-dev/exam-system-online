import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import { academicProgramSchema } from '@/lib/validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const item = await prisma.academicProgram.findUnique({
      where: { id },
      include: { degreeLevel: true, department: true, _count: { select: { groups: true, academicOfferings: true } } },
    })
    if (!item) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    if (!canAccessDepartment(scope, item.departmentId)) {
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
    const existing = await prisma.academicProgram.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    if (!canAccessDepartment(scope, existing.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = academicProgramSchema.partial().safeParse({
      ...body,
      durationYears: body.durationYears ? Number(body.durationYears) : body.durationYears,
      totalSemesters: body.totalSemesters ? Number(body.totalSemesters) : body.totalSemesters,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    if (parsed.data.departmentId && !canAccessDepartment(scope, parsed.data.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const item = await prisma.academicProgram.update({ where: { id }, data: parsed.data })
    return NextResponse.json(item)
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Program code already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to update program') }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const existing = await prisma.academicProgram.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    if (!canAccessDepartment(scope, existing.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const activeOfferings = await prisma.academicOffering.count({ where: { programId: id, isActive: true } })
    if (activeOfferings > 0) {
      return NextResponse.json({ error: 'Cannot archive program with active offerings' }, { status: 409 })
    }

    const item = await prisma.academicProgram.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json(item)
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to archive program') }, { status: 500 })
  }
}
