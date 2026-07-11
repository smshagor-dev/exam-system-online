import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import { departmentLanguageSchema } from '@/lib/validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const item = await prisma.departmentLanguage.findUnique({
      where: { id },
      include: { department: true, language: true, _count: { select: { academicOfferings: true } } },
    })
    if (!item) return NextResponse.json({ error: 'Department language not found' }, { status: 404 })
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
    const existing = await prisma.departmentLanguage.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Department language not found' }, { status: 404 })
    if (!canAccessDepartment(scope, existing.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = departmentLanguageSchema.partial().safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const item = await prisma.departmentLanguage.update({ where: { id }, data: parsed.data })
    return NextResponse.json(item)
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to update department language') }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const existing = await prisma.departmentLanguage.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Department language not found' }, { status: 404 })
    if (!canAccessDepartment(scope, existing.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const item = await prisma.departmentLanguage.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json(item)
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to archive department language') }, { status: 500 })
  }
}
