import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { validateProgramSemester, validateProgramYear } from '@/lib/academic-scope'
import { prisma } from '@/lib/prisma'
import { programSubjectSchema } from '@/lib/validators'

export async function GET(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const { searchParams } = new URL(req.url)
    const programId = searchParams.get('programId') || undefined
    const programYearId = searchParams.get('programYearId') || undefined
    const semesterId = searchParams.get('semesterId') || undefined

    const items = await prisma.programSubject.findMany({
      where: {
        ...(programId ? { programId } : {}),
        ...(programYearId ? { programYearId } : {}),
        ...(semesterId ? { semesterId } : {}),
        ...(scope.isSuperAdmin ? {} : { program: { departmentId: { in: scope.managedDepartmentIds } } }),
      },
      include: {
        program: true,
        programYear: true,
        semester: true,
        subject: true,
        programSemester: true,
        _count: { select: { academicOfferings: true } },
      },
      orderBy: [{ program: { name: 'asc' } }, { sortOrder: 'asc' }, { subject: { name: 'asc' } }],
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
    const parsed = programSubjectSchema.safeParse({
      ...body,
      creditHours: body.creditHours ? Number(body.creditHours) : undefined,
      theoryHours: body.theoryHours ? Number(body.theoryHours) : undefined,
      practicalHours: body.practicalHours ? Number(body.practicalHours) : undefined,
      sortOrder: body.sortOrder ? Number(body.sortOrder) : 0,
      isElective: body.isElective ?? false,
      isRequired: body.isRequired ?? true,
      isActive: body.isActive ?? true,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const program = await prisma.academicProgram.findUnique({ where: { id: parsed.data.programId } })
    if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    if (!canAccessDepartment(scope, program.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    await validateProgramYear(parsed.data, prisma)
    if (parsed.data.programSemesterId) {
      await validateProgramSemester(parsed.data, prisma)
    }

    const subject = await prisma.subject.findUnique({ where: { id: parsed.data.subjectId } })
    if (!subject || subject.departmentId !== program.departmentId) {
      return NextResponse.json({ error: 'Subject does not belong to the selected program department' }, { status: 400 })
    }

    const item = await prisma.programSubject.create({ data: parsed.data })
    return NextResponse.json(item, { status: 201 })
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Program subject already exists for this curriculum slot' }, { status: 409 })
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to create program subject') }, { status: 500 })
  }
}
