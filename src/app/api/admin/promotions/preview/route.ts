import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getErrorMessage } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { evaluatePromotionEligibility } from '@/lib/student-lifecycle'
import { studentPromotionSchema } from '@/lib/validators'

const promotionContextSchema = z.object({
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
})

const bulkPreviewSchema = promotionContextSchema.extend({
  studentIds: z.array(z.string().cuid()).min(1, 'At least one student is required'),
})

export async function POST(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const body = await req.json()
    const isBulk = Array.isArray(body?.studentIds)
    const parsed = isBulk ? bulkPreviewSchema.safeParse(body) : studentPromotionSchema.safeParse(body)

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
    }

    if ('studentId' in parsed.data) {
      const eligibility = await evaluatePromotionEligibility(parsed.data.studentId, context, parsed.data.manualOverride)
      return NextResponse.json({
        mode: 'single',
        studentId: parsed.data.studentId,
        ...eligibility,
      })
    }

    const results = await Promise.all(
      parsed.data.studentIds.map(async (studentId: string) => ({
        studentId,
        ...(await evaluatePromotionEligibility(studentId, context, parsed.data.manualOverride)),
      })),
    )

    return NextResponse.json({
      mode: 'bulk',
      total: results.length,
      eligible: results.filter((item: { eligible: boolean }) => item.eligible).length,
      blocked: results.filter((item: { eligible: boolean }) => !item.eligible).length,
      results,
    })
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to preview promotion eligibility')
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
