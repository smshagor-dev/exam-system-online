import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import { departmentLanguageSchema } from '@/lib/validators'

export async function GET(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const { searchParams } = new URL(req.url)
    const departmentId = searchParams.get('departmentId') || undefined

    const items = await prisma.departmentLanguage.findMany({
      where: {
        ...(scope.isSuperAdmin ? {} : { departmentId: { in: scope.managedDepartmentIds } }),
        ...(departmentId ? { departmentId } : {}),
      },
      include: { department: true, language: true, _count: { select: { academicOfferings: true } } },
      orderBy: [{ department: { name: 'asc' } }, { language: { name: 'asc' } }],
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
    const scope = await getAdminScope()
    const body = await req.json()
    const parsed = departmentLanguageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    if (!canAccessDepartment(scope, parsed.data.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const item = await prisma.departmentLanguage.create({ data: parsed.data })
    return NextResponse.json(item, { status: 201 })
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Department-language combination already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to create department language') }, { status: 500 })
  }
}
