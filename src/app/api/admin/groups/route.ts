import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { validateGroupAcademicContext } from '@/lib/academic-scope'
import { prisma } from '@/lib/prisma'
import { groupSchema } from '@/lib/validators'

export async function GET(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const { searchParams } = new URL(req.url)
    const departmentId = searchParams.get('departmentId') || undefined
    const programId = searchParams.get('programId') || undefined
    const programYearId = searchParams.get('programYearId') || undefined
    const languageId = searchParams.get('languageId') || undefined
    const academicSessionId = searchParams.get('academicSessionId') || undefined

    const items = await prisma.group.findMany({
      where: {
        ...(scope.isSuperAdmin ? {} : { departmentId: { in: scope.managedDepartmentIds } }),
        ...(departmentId ? { departmentId } : {}),
        ...(programId ? { programId } : {}),
        ...(programYearId ? { programYearId } : {}),
        ...(languageId ? { languageId } : {}),
        ...(academicSessionId ? { academicSessionId } : {}),
      },
      include: {
        academicYear: true,
        department: true,
        program: true,
        language: true,
        academicSession: true,
        programYear: true,
        currentProgramSemester: true,
      },
      orderBy: [{ name: 'asc' }],
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
    const parsed = groupSchema.safeParse({
      ...body,
      isActive: body.isActive ?? true,
    })
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    if (!canAccessDepartment(scope, parsed.data.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    await validateGroupAcademicContext(parsed.data, prisma)

    return NextResponse.json(await prisma.group.create({ data: parsed.data }), { status: 201 })
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') return NextResponse.json({ error: 'Already exists' }, { status: 409 })
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to create group') }, { status: 500 })
  }
}
