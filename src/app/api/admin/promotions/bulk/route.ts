import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getErrorMessage } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { promoteStudent } from '@/lib/student-lifecycle'

const bulkPromotionSchema = z.object({
  departmentId: z.string().cuid(),
  academicSessionId: z.string().cuid(),
  programId: z.string().cuid(),
  programYearId: z.string().cuid(),
  semesterId: z.string().cuid(),
  programSemesterId: z.string().cuid().nullable().optional(),
  groupId: z.string().cuid(),
  academicYearId: z.string().cuid().nullable().optional(),
  departmentLanguageId: z.string().cuid().nullable().optional(),
  languageId: z.string().cuid().nullable().optional(),
  manualOverride: z.boolean().default(false),
  overrideReason: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  studentIds: z.array(z.string().cuid()).min(1, 'At least one student is required'),
})

export async function POST(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const body = await req.json()
    const parsed = bulkPromotionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    if (!canAccessDepartment(scope, parsed.data.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const context = {
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
    }

    const results = [] as Array<
      | { studentId: string; success: true; promotionId: string; enrollmentId: string }
      | { studentId: string; success: false; error: string }
    >

    for (const studentId of parsed.data.studentIds) {
      try {
        const result = await promoteStudent(studentId, context, {
          actorUserId: scope.session.user.id,
          actorRole: scope.session.user.role,
          sourceApi: '/api/admin/promotions/bulk',
        })
        results.push({
          studentId,
          success: true,
          promotionId: result.promotion.id,
          enrollmentId: result.enrollment.id,
        })
      } catch (error: unknown) {
        results.push({
          studentId,
          success: false,
          error: getErrorMessage(error, 'Failed to promote student'),
        })
      }
    }

    return NextResponse.json({
      total: results.length,
      succeeded: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
      results,
    })
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to promote selected students')
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
