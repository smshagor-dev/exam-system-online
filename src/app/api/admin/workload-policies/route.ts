import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'

const policySchema = z.object({
  departmentId: z.string().cuid(),
  programId: z.string().cuid().optional().nullable(),
  academicSessionId: z.string().cuid().optional().nullable(),
  maxWeeklyHours: z.number().positive().default(24),
  maxSemesterHours: z.number().positive().default(320),
  defaultLectureWeight: z.number().positive().default(1),
  defaultLabWeight: z.number().positive().default(1),
  defaultAssessmentWeight: z.number().positive().default(1),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
})

export async function GET() {
  const scope = await getAdminScope()
  const items = await prisma.teacherWorkloadPolicy.findMany({
    where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
    include: {
      department: true,
      program: true,
      academicSession: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const scope = await getAdminScope()
  const parsed = policySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const input = parsed.data
  if (!scope.isSuperAdmin && !scope.managedDepartmentIds.includes(input.departmentId)) {
    return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
  }

  const policy = await prisma.teacherWorkloadPolicy.create({
    data: {
      ...input,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
    },
    include: {
      department: true,
      program: true,
      academicSession: true,
    },
  })

  return NextResponse.json(policy, { status: 201 })
}
