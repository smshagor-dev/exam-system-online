import {
  Prisma,
  TeacherSubstitutionStatus,
  TeachingAssignmentRoleType,
  TeachingAssignmentStatus,
} from '@prisma/client/index'
import { prisma } from './prisma'

const ACTIVE_ASSIGNMENT_STATUSES: TeachingAssignmentStatus[] = [
  TeachingAssignmentStatus.ACTIVE,
]

const ACTIVE_SUBSTITUTION_STATUSES: TeacherSubstitutionStatus[] = [
  TeacherSubstitutionStatus.APPROVED,
  TeacherSubstitutionStatus.ACTIVE,
]

export type TeacherLegacyScope = {
  departmentId?: string | null
  subjectId?: string | null
  languageId?: string | null
  groupId?: string | null
  academicYearId?: string | null
  semesterId?: string | null
  academicOfferingId?: string | null
}

export type EffectiveTeachingAssignment = {
  source: 'teaching-assignment' | 'legacy-assignment'
  teacherProfileId: string
  teachingAssignmentId?: string
  legacyAssignmentId?: string
  academicOfferingId?: string | null
  departmentId?: string | null
  subjectId?: string | null
  languageId?: string | null
  groupId?: string | null
  academicYearId?: string | null
  semesterId?: string | null
  roles: TeachingAssignmentRoleType[]
  substitution: {
    id: string
    originalTeacherId: string
    substituteTeacherId: string
    startsAt: Date
    endsAt: Date
    status: TeacherSubstitutionStatus
  } | null
}

export function buildLegacyTeacherScope(input: TeacherLegacyScope) {
  return {
    departmentId: input.departmentId ?? null,
    subjectId: input.subjectId ?? null,
    languageId: input.languageId ?? null,
    groupId: input.groupId ?? null,
    academicYearId: input.academicYearId ?? null,
    semesterId: input.semesterId ?? null,
    academicOfferingId: input.academicOfferingId ?? null,
  }
}

export async function getTeacherProfileByUserId(userId: string) {
  return prisma.teacherProfile.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          isActive: true,
        },
      },
      departmentMemberships: true,
    },
  })
}

function isWithinRange(now: Date, startsAt?: Date | null, endsAt?: Date | null) {
  if (startsAt && now < startsAt) return false
  if (endsAt && now > endsAt) return false
  return true
}

function hasLegacyContextMatch(scope: TeacherLegacyScope, assignment: TeacherLegacyScope) {
  const hasScopedContext = Boolean(
    scope.academicOfferingId ||
    scope.subjectId ||
    scope.languageId ||
    scope.groupId ||
    scope.academicYearId ||
    scope.semesterId
  )

  if (!hasScopedContext) {
    return true
  }

  if (scope.academicOfferingId && assignment.academicOfferingId === scope.academicOfferingId) {
    return true
  }

  return (
    assignment.subjectId === scope.subjectId &&
    assignment.languageId === scope.languageId &&
    assignment.groupId === scope.groupId &&
    assignment.academicYearId === scope.academicYearId &&
    assignment.semesterId === scope.semesterId
  )
}

export async function resolveActiveSubstitute(params: {
  teacherProfileId: string
  teachingAssignmentId: string
  at?: Date
}) {
  const at = params.at ?? new Date()

  return prisma.teacherSubstitution.findFirst({
    where: {
      teachingAssignmentId: params.teachingAssignmentId,
      substituteTeacherId: params.teacherProfileId,
      status: { in: ACTIVE_SUBSTITUTION_STATUSES },
      startsAt: { lte: at },
      endsAt: { gte: at },
    },
    select: {
      id: true,
      originalTeacherId: true,
      substituteTeacherId: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
  })
}

export async function getTeacherOfferingAssignments(params: {
  teacherProfileId: string
  academicOfferingId?: string | null
  scope?: TeacherLegacyScope | null
  at?: Date
}) {
  const at = params.at ?? new Date()
  const scope = buildLegacyTeacherScope(params.scope ?? {})

  const [teachingAssignments, legacyAssignments] = await Promise.all([
    prisma.teachingAssignment.findMany({
      where: {
        OR: [
          { teacherId: params.teacherProfileId },
          {
            substitutions: {
              some: {
                substituteTeacherId: params.teacherProfileId,
                status: { in: ACTIVE_SUBSTITUTION_STATUSES },
                startsAt: { lte: at },
                endsAt: { gte: at },
              },
            },
          },
        ],
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        ...(params.academicOfferingId ? { academicOfferingId: params.academicOfferingId } : {}),
      },
      include: {
        academicOffering: true,
        roles: true,
        substitutions: {
          where: {
            substituteTeacherId: params.teacherProfileId,
            status: { in: ACTIVE_SUBSTITUTION_STATUSES },
            startsAt: { lte: at },
            endsAt: { gte: at },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.teacherAssignment.findMany({
      where: {
        teacherId: params.teacherProfileId,
        ...(params.academicOfferingId
          ? {
              OR: [
                { academicOfferingId: params.academicOfferingId },
                {
                  subjectId: scope.subjectId ?? undefined,
                  languageId: scope.languageId ?? undefined,
                  groupId: scope.groupId ?? undefined,
                  academicYearId: scope.academicYearId ?? undefined,
                  semesterId: scope.semesterId ?? undefined,
                },
              ],
            }
          : {
              subjectId: scope.subjectId ?? undefined,
              languageId: scope.languageId ?? undefined,
              groupId: scope.groupId ?? undefined,
              academicYearId: scope.academicYearId ?? undefined,
              semesterId: scope.semesterId ?? undefined,
            }),
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const normalizedNew: EffectiveTeachingAssignment[] = teachingAssignments
    .filter((assignment) => {
      if (!isWithinRange(at, assignment.startsAt, assignment.endsAt)) {
        return false
      }

      if (!params.academicOfferingId) {
        return hasLegacyContextMatch(scope, {
          departmentId: assignment.departmentId,
          academicOfferingId: assignment.academicOfferingId,
          subjectId: assignment.academicOffering.subjectId,
          languageId: assignment.academicOffering.languageId,
          groupId: assignment.academicOffering.groupId,
          academicYearId: assignment.academicOffering.programYearId,
          semesterId: assignment.academicOffering.semesterId,
        })
      }

      return true
    })
    .map((assignment) => {
      const substitution = assignment.substitutions[0] ?? null

      return {
        source: 'teaching-assignment' as const,
        teacherProfileId: params.teacherProfileId,
        teachingAssignmentId: assignment.id,
        legacyAssignmentId: assignment.legacyAssignmentId ?? undefined,
        academicOfferingId: assignment.academicOfferingId,
        departmentId: assignment.departmentId,
        subjectId: assignment.academicOffering.subjectId,
        languageId: assignment.academicOffering.languageId,
        groupId: assignment.academicOffering.groupId,
        academicYearId: assignment.academicOffering.programYearId,
        semesterId: assignment.academicOffering.semesterId,
        roles: substitution
          ? [TeachingAssignmentRoleType.SUBSTITUTE]
          : assignment.roles.map((role) => role.role),
        substitution,
      }
    })

  const normalizedLegacy: EffectiveTeachingAssignment[] = legacyAssignments
    .filter((assignment) => hasLegacyContextMatch(scope, assignment))
    .map((assignment) => ({
      source: 'legacy-assignment' as const,
      teacherProfileId: params.teacherProfileId,
      legacyAssignmentId: assignment.id,
      academicOfferingId: assignment.academicOfferingId,
      departmentId: assignment.departmentId,
      subjectId: assignment.subjectId,
      languageId: assignment.languageId,
      groupId: assignment.groupId,
      academicYearId: assignment.academicYearId,
      semesterId: assignment.semesterId,
      roles: [
        TeachingAssignmentRoleType.LEAD_TEACHER,
        TeachingAssignmentRoleType.EXAMINER,
      ],
      substitution: null,
    }))

  return [...normalizedNew, ...normalizedLegacy]
}

export async function resolveTeacherAssignment(params: {
  teacherProfileId: string
  academicOfferingId?: string | null
  scope?: TeacherLegacyScope | null
  at?: Date
}) {
  const assignments = await getTeacherOfferingAssignments(params)
  return assignments[0] ?? null
}

export async function validateTeacherOfferingAccess(params: {
  teacherProfileId: string
  academicOfferingId?: string | null
  scope?: TeacherLegacyScope | null
  allowedRoles?: TeachingAssignmentRoleType[]
  at?: Date
}) {
  const assignment = await resolveTeacherAssignment(params)
  if (!assignment) {
    return { allowed: false, assignment: null, reason: 'No active teaching assignment found' as const }
  }

  if (params.allowedRoles?.length && !assignment.roles.some((role) => params.allowedRoles?.includes(role))) {
    return { allowed: false, assignment, reason: 'Teacher role is not permitted for this action' as const }
  }

  return { allowed: true, assignment, reason: null }
}

export async function getEffectiveTeacherForAssignment(teachingAssignmentId: string, at = new Date()) {
  const assignment = await prisma.teachingAssignment.findUnique({
    where: { id: teachingAssignmentId },
    include: {
      substitutions: {
        where: {
          status: { in: ACTIVE_SUBSTITUTION_STATUSES },
          startsAt: { lte: at },
          endsAt: { gte: at },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!assignment) return null

  return assignment.substitutions[0]?.substituteTeacherId ?? assignment.teacherId
}

export async function detectLegacyAssignmentConflict(params: {
  teacherProfileId: string
  academicOfferingId?: string | null
  scope: TeacherLegacyScope
}) {
  const scope = buildLegacyTeacherScope(params.scope)
  const [legacy, modern] = await Promise.all([
    prisma.teacherAssignment.findMany({
      where: {
        teacherId: params.teacherProfileId,
        ...(params.academicOfferingId ? { academicOfferingId: params.academicOfferingId } : {}),
        subjectId: scope.subjectId ?? undefined,
        languageId: scope.languageId ?? undefined,
        groupId: scope.groupId ?? undefined,
        academicYearId: scope.academicYearId ?? undefined,
        semesterId: scope.semesterId ?? undefined,
      },
    }),
    prisma.teachingAssignment.findMany({
      where: {
        teacherId: params.teacherProfileId,
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        ...(params.academicOfferingId ? { academicOfferingId: params.academicOfferingId } : {}),
      },
      include: { academicOffering: true },
    }),
  ])

  const overlappingModern = modern.filter((assignment) =>
    hasLegacyContextMatch(scope, {
      academicOfferingId: assignment.academicOfferingId,
      departmentId: assignment.departmentId,
      subjectId: assignment.academicOffering.subjectId,
      languageId: assignment.academicOffering.languageId,
      groupId: assignment.academicOffering.groupId,
      academicYearId: assignment.academicOffering.programYearId,
      semesterId: assignment.academicOffering.semesterId,
    })
  )

  return {
    hasConflict: legacy.length > 0 && overlappingModern.length > 0,
    legacyCount: legacy.length,
    modernCount: overlappingModern.length,
  }
}

export function buildTeacherScopeWhereClause(scope: TeacherLegacyScope): Prisma.TeacherAssignmentWhereInput {
  return {
    subjectId: scope.subjectId ?? undefined,
    languageId: scope.languageId ?? undefined,
    groupId: scope.groupId ?? undefined,
    academicYearId: scope.academicYearId ?? undefined,
    semesterId: scope.semesterId ?? undefined,
    academicOfferingId: scope.academicOfferingId ?? undefined,
  }
}

export function buildAccessibleTeachingScopeFilters(
  assignments: EffectiveTeachingAssignment[]
): Array<
  | { academicOfferingId: string }
  | {
      subjectId: string
      languageId: string
      groupId: string
      academicYearId: string
      semesterId: string
    }
> {
  const filters: Array<
    | { academicOfferingId: string }
    | {
        subjectId: string
        languageId: string
        groupId: string
        academicYearId: string
        semesterId: string
      }
  > = []

  for (const assignment of assignments) {
    if (assignment.academicOfferingId) {
      filters.push({ academicOfferingId: assignment.academicOfferingId })
      continue
    }

    if (
      assignment.subjectId &&
      assignment.languageId &&
      assignment.groupId &&
      assignment.academicYearId &&
      assignment.semesterId
    ) {
      filters.push({
        subjectId: assignment.subjectId,
        languageId: assignment.languageId,
        groupId: assignment.groupId,
        academicYearId: assignment.academicYearId,
        semesterId: assignment.semesterId,
      })
    }
  }

  return filters
}
