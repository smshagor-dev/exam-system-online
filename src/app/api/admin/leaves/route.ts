import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import { placeStudentOnLeave } from '@/lib/student-lifecycle'
import { studentLeaveSchema } from '@/lib/validators'

export async function POST(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const body = await req.json()
    const parsed = studentLeaveSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const student = await prisma.studentProfile.findUnique({
      where: { id: parsed.data.studentId },
      select: { departmentId: true },
    })
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }
    if (!canAccessDepartment(scope, student.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const result = await placeStudentOnLeave(parsed.data.studentId, {
      leaveType: parsed.data.leaveType,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
      status: parsed.data.status,
      reason: parsed.data.reason ?? null,
      supportingNote: parsed.data.supportingNote ?? null,
      notes: parsed.data.notes ?? null,
    }, {
      actorUserId: scope.session.user.id,
      actorRole: scope.session.user.role,
      sourceApi: '/api/admin/leaves',
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to place student on leave')
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
