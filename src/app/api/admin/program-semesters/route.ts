import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import { programSemesterSchema } from '@/lib/validators'

export async function GET(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const { searchParams } = new URL(req.url)
    const programId = searchParams.get('programId') || undefined
    const programYearId = searchParams.get('programYearId') || undefined

    const items = await prisma.programSemester.findMany({
      where: {
        ...(programId ? { programId } : {}),
        ...(programYearId ? { programYearId } : {}),
        ...(scope.isSuperAdmin ? {} : { program: { departmentId: { in: scope.managedDepartmentIds } } }),
      },
      include: { program: true, programYear: true, semester: true, _count: { select: { academicOfferings: true } } },
      orderBy: [{ program: { name: 'asc' } }, { semesterNumber: 'asc' }],
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
    const parsed = programSemesterSchema.safeParse({
      ...body,
      semesterNumber: Number(body.semesterNumber),
      isActive: body.isActive ?? true,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const [program, programYear] = await Promise.all([
      prisma.academicProgram.findUnique({ where: { id: parsed.data.programId } }),
      prisma.programYear.findUnique({ where: { id: parsed.data.programYearId } }),
    ])

    if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    if (!programYear || programYear.programId !== program.id) {
      return NextResponse.json({ error: 'Program year does not belong to the selected program' }, { status: 400 })
    }
    if (!canAccessDepartment(scope, program.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const item = await prisma.programSemester.create({ data: parsed.data })
    return NextResponse.json(item, { status: 201 })
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Program semester mapping already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to create program semester') }, { status: 500 })
  }
}

