import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { promoteStudent } from '@/lib/student-lifecycle'
import { studentPromotionSchema } from '@/lib/validators'

export async function POST(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const body = await req.json()
    const parsed = studentPromotionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    if (!canAccessDepartment(scope, parsed.data.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const result = await promoteStudent(parsed.data.studentId, {
      departmentId: parsed.data.departmentId,
      academicSessionId: parsed.data.academicSessionId,
      programId: parsed.data.programId,
      programYearId: parsed.data.programYearId,
      semesterId: parsed.data.semesterId,
      programSemesterId: parsed.data.programSemesterId ?? null,
      groupId: parsed.data.groupId,
      academicYearId: parsed.data.academicYearId ?? null,
      departmentLanguageId: parsed.data.departmentLanguageId ?? null,
      languageId: parsed.data.languageId ?? null,
      manualOverride: parsed.data.manualOverride,
      overrideReason: parsed.data.overrideReason ?? null,
      notes: parsed.data.notes ?? null,
    }, {
      actorUserId: scope.session.user.id,
      actorRole: scope.session.user.role,
      sourceApi: '/api/admin/promotions',
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to promote student')
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
