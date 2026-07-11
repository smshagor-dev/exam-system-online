import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import { programYearSchema } from '@/lib/validators'

export async function GET(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const { searchParams } = new URL(req.url)
    const programId = searchParams.get('programId') || undefined

    const items = await prisma.programYear.findMany({
      where: {
        ...(programId ? { programId } : {}),
        ...(scope.isSuperAdmin ? {} : { program: { departmentId: { in: scope.managedDepartmentIds } } }),
      },
      include: { program: true, _count: { select: { groups: true, academicOfferings: true } } },
      orderBy: [{ program: { name: 'asc' } }, { yearNumber: 'asc' }],
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
    const parsed = programYearSchema.safeParse({
      ...body,
      yearNumber: Number(body.yearNumber),
      sortOrder: body.sortOrder ? Number(body.sortOrder) : 0,
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
    if (parsed.data.yearNumber > program.durationYears) {
      return NextResponse.json({ error: 'Program year exceeds the configured program duration' }, { status: 400 })
    }

    const item = await prisma.programYear.create({ data: parsed.data })
    return NextResponse.json(item, { status: 201 })
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Program year already exists for this program' }, { status: 409 })
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to create program year') }, { status: 500 })
  }
}
