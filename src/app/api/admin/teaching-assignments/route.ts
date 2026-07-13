import { NextRequest, NextResponse } from 'next/server'
import { TeachingAssignmentRoleType, TeachingAssignmentStatus } from '@prisma/client/index'
import { z } from 'zod'
import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import { detectLegacyAssignmentConflict } from '@/lib/teacher-assignment'
import { getAllowedAssignmentActions } from '@/lib/teaching-assignment-admin'

const assignmentSchema = z.object({
  teacherId: z.string().cuid(),
  membershipId: z.string().cuid().optional().nullable(),
  departmentId: z.string().cuid(),
  academicOfferingId: z.string().cuid(),
  status: z.nativeEnum(TeachingAssignmentStatus).default(TeachingAssignmentStatus.DRAFT),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  weeklyHours: z.number().min(0).default(0),
  lectureHours: z.number().min(0).default(0),
  labHours: z.number().min(0).default(0),
  consultationHours: z.number().min(0).default(0),
  assessmentHours: z.number().min(0).default(0),
  isPrimary: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional().nullable(),
  roles: z.array(z.nativeEnum(TeachingAssignmentRoleType)).min(1),
})

export async function GET(req: NextRequest) {
  const scope = await getAdminScope()
  const { searchParams } = new URL(req.url)
  const teacherId = searchParams.get('teacherId')
  const departmentId = searchParams.get('departmentId')
  const status = searchParams.get('status') as TeachingAssignmentStatus | null

  const items = await prisma.teachingAssignment.findMany({
    where: {
      ...(teacherId ? { teacherId } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(status ? { status } : {}),
      ...(scope.isSuperAdmin ? {} : { departmentId: { in: scope.managedDepartmentIds } }),
    },
    include: {
      teacher: { include: { user: true } },
      department: true,
      academicOffering: {
        include: { subject: true, group: true, language: true, semester: true, program: true },
      },
      membership: true,
      roles: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const scope = await getAdminScope()
  const parsed = assignmentSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const input = parsed.data
  if (!scope.isSuperAdmin && !scope.managedDepartmentIds.includes(input.departmentId)) {
    return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
  }
  if (input.startsAt && input.endsAt && new Date(input.endsAt) < new Date(input.startsAt)) {
    return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
  }

  const offering = await prisma.academicOffering.findUnique({
    where: { id: input.academicOfferingId },
    include: { subject: true },
  })
  if (!offering || !offering.isActive || offering.departmentId !== input.departmentId) {
    return NextResponse.json({ error: 'Invalid academic offering for department' }, { status: 400 })
  }

  const membership = input.membershipId
    ? await prisma.teacherDepartmentMembership.findUnique({ where: { id: input.membershipId } })
    : await prisma.teacherDepartmentMembership.findFirst({
        where: {
          teacherId: input.teacherId,
          departmentId: input.departmentId,
          isActive: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      })

  if (!membership) {
    return NextResponse.json({ error: 'Teacher has no active department membership for this offering' }, { status: 400 })
  }

  const duplicate = await prisma.teachingAssignment.findFirst({
    where: {
      teacherId: input.teacherId,
      academicOfferingId: input.academicOfferingId,
      status: {
        in: [
          TeachingAssignmentStatus.DRAFT,
          TeachingAssignmentStatus.PENDING_APPROVAL,
          TeachingAssignmentStatus.APPROVED,
          TeachingAssignmentStatus.ACTIVE,
          TeachingAssignmentStatus.SUSPENDED,
        ],
      },
      roles: {
        some: {
          role: { in: input.roles },
        },
      },
    },
  })
  if (duplicate) {
    return NextResponse.json({ error: 'Duplicate active teaching assignment role detected' }, { status: 409 })
  }

  const legacyConflict = await detectLegacyAssignmentConflict({
    teacherProfileId: input.teacherId,
    academicOfferingId: input.academicOfferingId,
    scope: {
      departmentId: input.departmentId,
      subjectId: offering.subjectId,
      languageId: offering.languageId,
      groupId: offering.groupId,
      academicYearId: offering.programYearId,
      semesterId: offering.semesterId,
    },
  })

  const assignment = await prisma.teachingAssignment.create({
    data: {
      teacherId: input.teacherId,
      membershipId: membership.id,
      departmentId: input.departmentId,
      academicOfferingId: input.academicOfferingId,
      status: input.status,
      startsAt: input.startsAt ? new Date(input.startsAt) : offering.startsAt ?? null,
      endsAt: input.endsAt ? new Date(input.endsAt) : offering.endsAt ?? null,
      weeklyHours: input.weeklyHours,
      lectureHours: input.lectureHours,
      labHours: input.labHours,
      consultationHours: input.consultationHours,
      assessmentHours: input.assessmentHours,
      isPrimary: input.isPrimary,
      notes: [input.notes, legacyConflict.hasConflict ? 'Legacy/new assignment overlap detected' : null].filter(Boolean).join('\n') || null,
      roles: {
        create: input.roles.map((role, index) => ({
          role,
          isPrimary: index === 0,
        })),
      },
      approvals: {
        create: {
          action: input.status,
          statusTo: input.status,
          actorUserId: scope.session.user.id,
          notes: 'Created via Phase 4 admin API',
        },
      },
      auditLogs: {
        create: {
          actorUserId: scope.session.user.id,
          action: 'STATUS_CREATED',
          details: JSON.stringify({
            statusTo: input.status,
            notes: 'Created via Phase 4 admin API',
          }),
        },
      },
    },
    include: {
      teacher: { include: { user: true } },
      academicOffering: {
        include: { subject: true, group: true, language: true, semester: true, program: true },
      },
      roles: true,
      approvals: {
        include: { actor: true },
        orderBy: { createdAt: 'desc' },
      },
      auditLogs: {
        include: { actor: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  return NextResponse.json({ assignment: { ...assignment, allowedActions: getAllowedAssignmentActions(assignment.status) }, legacyConflict }, { status: 201 })
}
