import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { deactivateEnrollment, updateEnrollment } from '@/lib/student-lifecycle'
import { prisma } from '@/lib/prisma'
import { studentEnrollmentUpdateSchema } from '@/lib/validators'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const scope = await getAdminScope()
    const { studentId: enrollmentId } = await params
    const existing = await prisma.studentEnrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, departmentId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
    }
    if (!canAccessDepartment(scope, existing.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = studentEnrollmentUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    if (parsed.data.isActive === false) {
      const result = await deactivateEnrollment(
        enrollmentId,
        parsed.data.notes?.trim() || 'Enrollment deactivated by administrator',
        {
          actorUserId: scope.session.user.id,
          actorRole: scope.session.user.role,
          sourceApi: `/api/admin/enrollments/${enrollmentId}`,
        },
      )

      return NextResponse.json(result)
    }

    const result = await updateEnrollment(
      enrollmentId,
      {
        ...parsed.data,
        enrolledAt: parsed.data.enrolledAt ? new Date(parsed.data.enrolledAt) : undefined,
        endedAt:
          parsed.data.endedAt === undefined
            ? undefined
            : parsed.data.endedAt === null
              ? null
              : new Date(parsed.data.endedAt),
        graduationDate:
          parsed.data.graduationDate === undefined
            ? undefined
            : parsed.data.graduationDate === null
              ? null
              : new Date(parsed.data.graduationDate),
        notes: parsed.data.notes ?? null,
      },
      {
        actorUserId: scope.session.user.id,
        actorRole: scope.session.user.role,
        sourceApi: `/api/admin/enrollments/${enrollmentId}`,
      },
    )

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to update enrollment')
    const status =
      message === 'UNAUTHORIZED' ? 401 :
      message === 'FORBIDDEN' ? 403 :
      message.includes('already has another active enrollment') ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
