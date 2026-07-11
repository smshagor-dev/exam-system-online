import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { academicOfferingInclude, validateAcademicContext } from '@/lib/academic-scope'
import { prisma } from '@/lib/prisma'
import { updateAcademicOfferingSchema } from '@/lib/validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const item = await prisma.academicOffering.findUnique({
      where: { id },
      include: academicOfferingInclude,
    })
    if (!item) return NextResponse.json({ error: 'Academic offering not found' }, { status: 404 })
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
    const existing = await prisma.academicOffering.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Academic offering not found' }, { status: 404 })
    if (!canAccessDepartment(scope, existing.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = updateAcademicOfferingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const nextData = { ...existing, ...parsed.data }
    await validateAcademicContext(nextData, prisma)

    const item = await prisma.academicOffering.update({
      where: { id },
      data: {
        ...parsed.data,
        ...(parsed.data.startsAt ? { startsAt: new Date(parsed.data.startsAt) } : {}),
        ...(parsed.data.endsAt ? { endsAt: new Date(parsed.data.endsAt) } : {}),
      },
      include: academicOfferingInclude,
    })
    return NextResponse.json(item)
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Duplicate academic offering' }, { status: 409 })
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to update academic offering') }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const existing = await prisma.academicOffering.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Academic offering not found' }, { status: 404 })
    if (!canAccessDepartment(scope, existing.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const item = await prisma.academicOffering.update({ where: { id }, data: { isActive: false, status: 'ARCHIVED' } })
    return NextResponse.json(item)
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to archive academic offering') }, { status: 500 })
  }
}
