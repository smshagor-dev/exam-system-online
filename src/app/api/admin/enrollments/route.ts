import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { listStudentEnrollments, createEnrollment } from '@/lib/student-lifecycle'
import { studentEnrollmentCreateSchema } from '@/lib/validators'
import { StudentEnrollmentStatus, type Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Number(searchParams.get('page') || '1') || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '20') || 20))
    const departmentId = searchParams.get('departmentId') || undefined
    const studentId = searchParams.get('studentId') || undefined
    const programId = searchParams.get('programId') || undefined
    const academicSessionId = searchParams.get('academicSessionId') || undefined
    const status = searchParams.get('status') as StudentEnrollmentStatus | null
    const search = (searchParams.get('search') || '').trim()

    if (departmentId && !canAccessDepartment(scope, departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const where: Prisma.StudentEnrollmentWhereInput = {
      ...(scope.isSuperAdmin ? {} : { departmentId: { in: scope.managedDepartmentIds } }),
      ...(departmentId ? { departmentId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(programId ? { programId } : {}),
      ...(academicSessionId ? { academicSessionId } : {}),
      ...(status && Object.values(StudentEnrollmentStatus).includes(status) ? { status } : {}),
      ...(search
        ? {
            OR: [
              { student: { user: { name: { contains: search, mode: 'insensitive' } } } },
              { student: { user: { email: { contains: search, mode: 'insensitive' } } } },
              { program: { name: { contains: search, mode: 'insensitive' } } },
              { group: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }

    const result = await listStudentEnrollments(where, page, limit)
    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to list enrollments')
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const body = await req.json()
    const parsed = studentEnrollmentCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    if (!canAccessDepartment(scope, parsed.data.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const result = await createEnrollment(parsed.data.studentId, {
      ...parsed.data,
      enrolledAt: parsed.data.enrolledAt ? new Date(parsed.data.enrolledAt) : undefined,
      notes: parsed.data.notes ?? null,
    }, {
      actorUserId: scope.session.user.id,
      actorRole: scope.session.user.role,
      sourceApi: '/api/admin/enrollments',
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to create enrollment')
    const status =
      message === 'UNAUTHORIZED' ? 401 :
      message === 'FORBIDDEN' ? 403 :
      message.includes('already has an active enrollment') ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
