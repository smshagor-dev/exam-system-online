import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { readmitStudent } from '@/lib/student-lifecycle'
import { studentReadmissionSchema } from '@/lib/validators'

export async function POST(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const body = await req.json()
    const parsed = studentReadmissionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    if (!canAccessDepartment(scope, parsed.data.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const result = await readmitStudent(parsed.data.studentId, {
      ...parsed.data,
      readmittedAt: parsed.data.readmittedAt ? new Date(parsed.data.readmittedAt) : undefined,
      approvalReason: parsed.data.approvalReason ?? null,
      notes: parsed.data.notes ?? null,
    }, {
      actorUserId: scope.session.user.id,
      actorRole: scope.session.user.role,
      sourceApi: '/api/admin/readmissions',
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to readmit student')
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
