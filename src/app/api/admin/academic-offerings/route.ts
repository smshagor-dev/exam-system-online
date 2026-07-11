import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { academicOfferingInclude, validateAcademicContext } from '@/lib/academic-scope'
import { prisma } from '@/lib/prisma'
import { academicOfferingSchema } from '@/lib/validators'

export async function GET(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const { searchParams } = new URL(req.url)
    const departmentId = searchParams.get('departmentId') || undefined
    const programId = searchParams.get('programId') || undefined
    const languageId = searchParams.get('languageId') || undefined
    const academicSessionId = searchParams.get('academicSessionId') || undefined
    const programYearId = searchParams.get('programYearId') || undefined
    const semesterId = searchParams.get('semesterId') || undefined
    const groupId = searchParams.get('groupId') || undefined
    const subjectId = searchParams.get('subjectId') || undefined

    const items = await prisma.academicOffering.findMany({
      where: {
        ...(scope.isSuperAdmin ? {} : { departmentId: { in: scope.managedDepartmentIds } }),
        ...(departmentId ? { departmentId } : {}),
        ...(programId ? { programId } : {}),
        ...(languageId ? { languageId } : {}),
        ...(academicSessionId ? { academicSessionId } : {}),
        ...(programYearId ? { programYearId } : {}),
        ...(semesterId ? { semesterId } : {}),
        ...(groupId ? { groupId } : {}),
        ...(subjectId ? { subjectId } : {}),
      },
      include: academicOfferingInclude,
      orderBy: [{ createdAt: 'desc' }],
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
    const parsed = academicOfferingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    if (!canAccessDepartment(scope, parsed.data.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    await validateAcademicContext(parsed.data, prisma)

    const item = await prisma.academicOffering.create({
      data: {
        ...parsed.data,
        startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
        endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
      },
      include: academicOfferingInclude,
    })
    return NextResponse.json(item, { status: 201 })
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Duplicate academic offering' }, { status: 409 })
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to create academic offering') }, { status: 500 })
  }
}
