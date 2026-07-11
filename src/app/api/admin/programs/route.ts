import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import { academicProgramSchema } from '@/lib/validators'

export async function GET(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const { searchParams } = new URL(req.url)
    const search = (searchParams.get('search') || '').trim()
    const departmentId = searchParams.get('departmentId') || undefined
    const degreeLevelId = searchParams.get('degreeLevelId') || undefined

    const items = await prisma.academicProgram.findMany({
      where: {
        ...(scope.isSuperAdmin ? {} : { departmentId: { in: scope.managedDepartmentIds } }),
        ...(departmentId ? { departmentId } : {}),
        ...(degreeLevelId ? { degreeLevelId } : {}),
        ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] } : {}),
      },
      include: { degreeLevel: true, department: true, _count: { select: { groups: true, academicOfferings: true } } },
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
    const parsed = academicProgramSchema.safeParse({
      ...body,
      durationYears: Number(body.durationYears),
      totalSemesters: Number(body.totalSemesters),
      isActive: body.isActive ?? true,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    if (!canAccessDepartment(scope, parsed.data.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const item = await prisma.academicProgram.create({ data: parsed.data })
    return NextResponse.json(item, { status: 201 })
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') {
      return NextResponse.json({ error: 'Program code already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to create program') }, { status: 500 })
  }
}
