import { NextRequest, NextResponse } from 'next/server'
import { TeacherSubstitutionStatus } from '@prisma/client/index'
import { z } from 'zod'
import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'

const substitutionSchema = z.object({
  originalTeacherId: z.string().cuid(),
  substituteTeacherId: z.string().cuid(),
  teachingAssignmentId: z.string().cuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().trim().max(1000).optional().nullable(),
  status: z.nativeEnum(TeacherSubstitutionStatus).default(TeacherSubstitutionStatus.PENDING),
})

export async function GET(req: NextRequest) {
  const scope = await getAdminScope()
  const { searchParams } = new URL(req.url)
  const teacherId = searchParams.get('teacherId')

  const items = await prisma.teacherSubstitution.findMany({
    where: {
      ...(teacherId
        ? {
            OR: [
              { originalTeacherId: teacherId },
              { substituteTeacherId: teacherId },
            ],
          }
        : {}),
      ...(scope.isSuperAdmin ? {} : { teachingAssignment: { departmentId: { in: scope.managedDepartmentIds } } }),
    },
    include: {
      originalTeacher: { include: { user: true } },
      substituteTeacher: { include: { user: true } },
      teachingAssignment: {
        include: {
          academicOffering: { include: { subject: true, group: true } },
        },
      },
    },
    orderBy: { startsAt: 'desc' },
  })

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const scope = await getAdminScope()
  const parsed = substitutionSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const input = parsed.data
  if (new Date(input.endsAt) < new Date(input.startsAt)) {
    return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
  }

  const assignment = await prisma.teachingAssignment.findUnique({
    where: { id: input.teachingAssignmentId },
    include: { academicOffering: true },
  })

  if (!assignment) {
    return NextResponse.json({ error: 'Teaching assignment not found' }, { status: 404 })
  }
  if (!scope.isSuperAdmin && !scope.managedDepartmentIds.includes(assignment.departmentId)) {
    return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
  }
  if (assignment.startsAt && new Date(input.startsAt) < assignment.startsAt) {
    return NextResponse.json({ error: 'Substitution starts before the assignment window' }, { status: 400 })
  }
  if (assignment.endsAt && new Date(input.endsAt) > assignment.endsAt) {
    return NextResponse.json({ error: 'Substitution ends after the assignment window' }, { status: 400 })
  }

  const overlap = await prisma.teacherSubstitution.findFirst({
    where: {
      teachingAssignmentId: input.teachingAssignmentId,
      status: { in: [TeacherSubstitutionStatus.PENDING, TeacherSubstitutionStatus.APPROVED, TeacherSubstitutionStatus.ACTIVE] },
      OR: [
        {
          startsAt: { lte: new Date(input.endsAt) },
          endsAt: { gte: new Date(input.startsAt) },
        },
      ],
    },
  })

  if (overlap) {
    return NextResponse.json({ error: 'Overlapping substitution already exists' }, { status: 409 })
  }

  const substitute = await prisma.teacherDepartmentMembership.findFirst({
    where: {
      teacherId: input.substituteTeacherId,
      departmentId: assignment.departmentId,
      isActive: true,
    },
  })

  if (!substitute) {
    return NextResponse.json({ error: 'Substitute teacher does not have an active department membership' }, { status: 400 })
  }

  const record = await prisma.teacherSubstitution.create({
    data: {
      ...input,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      approvedById: input.status === TeacherSubstitutionStatus.APPROVED || input.status === TeacherSubstitutionStatus.ACTIVE
        ? scope.session.user.id
        : null,
      approvedAt: input.status === TeacherSubstitutionStatus.APPROVED || input.status === TeacherSubstitutionStatus.ACTIVE
        ? new Date()
        : null,
    },
    include: {
      originalTeacher: { include: { user: true } },
      substituteTeacher: { include: { user: true } },
      teachingAssignment: true,
    },
  })

  return NextResponse.json(record, { status: 201 })
}
