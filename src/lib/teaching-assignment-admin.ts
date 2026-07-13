import {
  Prisma,
  TeacherWorkloadCategory,
  TeachingAssignmentRoleType,
  TeachingAssignmentStatus,
} from '@prisma/client/index'
import { prisma } from './prisma'
import {
  calculateTeacherSemesterWorkload,
  calculateTeacherWeeklyWorkload,
  getWorkloadBreakdown,
  type WorkloadPolicyConfig,
} from './teacher-workload'

export const teachingAssignmentActionMap = {
  submit: TeachingAssignmentStatus.PENDING_APPROVAL,
  approve: TeachingAssignmentStatus.APPROVED,
  reject: TeachingAssignmentStatus.REJECTED,
  activate: TeachingAssignmentStatus.ACTIVE,
  suspend: TeachingAssignmentStatus.SUSPENDED,
  complete: TeachingAssignmentStatus.COMPLETED,
  cancel: TeachingAssignmentStatus.CANCELLED,
} as const

export type TeachingAssignmentAction = keyof typeof teachingAssignmentActionMap

const allowedTransitions: Record<TeachingAssignmentStatus, TeachingAssignmentStatus[]> = {
  DRAFT: [TeachingAssignmentStatus.PENDING_APPROVAL, TeachingAssignmentStatus.CANCELLED],
  PENDING_APPROVAL: [
    TeachingAssignmentStatus.APPROVED,
    TeachingAssignmentStatus.REJECTED,
    TeachingAssignmentStatus.CANCELLED,
  ],
  APPROVED: [TeachingAssignmentStatus.ACTIVE, TeachingAssignmentStatus.CANCELLED],
  ACTIVE: [
    TeachingAssignmentStatus.SUSPENDED,
    TeachingAssignmentStatus.COMPLETED,
    TeachingAssignmentStatus.CANCELLED,
  ],
  SUSPENDED: [
    TeachingAssignmentStatus.ACTIVE,
    TeachingAssignmentStatus.COMPLETED,
    TeachingAssignmentStatus.CANCELLED,
  ],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [TeachingAssignmentStatus.DRAFT, TeachingAssignmentStatus.CANCELLED],
}

export function getAllowedAssignmentActions(status: TeachingAssignmentStatus): TeachingAssignmentAction[] {
  return (Object.entries(teachingAssignmentActionMap) as Array<[TeachingAssignmentAction, TeachingAssignmentStatus]>)
    .filter(([, nextStatus]) => allowedTransitions[status].includes(nextStatus))
    .map(([action]) => action)
}

export function validateAssignmentTransition(
  fromStatus: TeachingAssignmentStatus,
  action: TeachingAssignmentAction
) {
  const nextStatus = teachingAssignmentActionMap[action]
  const allowed = allowedTransitions[fromStatus].includes(nextStatus)
  return {
    allowed,
    nextStatus,
    message: allowed
      ? null
      : `Cannot transition teaching assignment from ${fromStatus} to ${nextStatus}`,
  }
}

export async function transitionTeachingAssignment(input: {
  assignmentId: string
  action: TeachingAssignmentAction
  actorUserId: string
  notes?: string | null
}) {
  const assignment = await prisma.teachingAssignment.findUnique({
    where: { id: input.assignmentId },
    include: {
      teacher: { include: { user: true } },
      academicOffering: {
        include: {
          subject: true,
          group: true,
          language: true,
          semester: true,
          program: true,
          academicSession: true,
        },
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

  if (!assignment) {
    throw new Error('Teaching assignment not found')
  }

  const transition = validateAssignmentTransition(assignment.status, input.action)
  if (!transition.allowed) {
    throw new Error(transition.message ?? 'Invalid assignment transition')
  }

  const nextStatus = transition.nextStatus
  const now = new Date()

  const updated = await prisma.teachingAssignment.update({
    where: { id: input.assignmentId },
    data: {
      status: nextStatus,
      approvedById:
        nextStatus === TeachingAssignmentStatus.APPROVED || nextStatus === TeachingAssignmentStatus.ACTIVE
          ? input.actorUserId
          : assignment.approvedById,
      approvedAt:
        nextStatus === TeachingAssignmentStatus.APPROVED || nextStatus === TeachingAssignmentStatus.ACTIVE
          ? now
          : assignment.approvedAt,
      approvals: {
        create: {
          action: nextStatus,
          statusFrom: assignment.status,
          statusTo: nextStatus,
          actorUserId: input.actorUserId,
          notes: input.notes ?? null,
        },
      },
      auditLogs: {
        create: {
          actorUserId: input.actorUserId,
          action: `STATUS_${input.action.toUpperCase()}`,
          details: JSON.stringify({
            statusFrom: assignment.status,
            statusTo: nextStatus,
            notes: input.notes ?? null,
          }),
        },
      },
    },
    include: {
      teacher: { include: { user: true } },
      academicOffering: {
        include: {
          subject: true,
          group: true,
          language: true,
          semester: true,
          program: true,
          academicSession: true,
        },
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

  return updated
}

type ScopedDepartmentFilter = {
  isSuperAdmin: boolean
  managedDepartmentIds: string[]
}

function buildDepartmentFilter(scope: ScopedDepartmentFilter): Prisma.TeachingAssignmentWhereInput | undefined {
  if (scope.isSuperAdmin) return undefined
  return {
    departmentId: {
      in: scope.managedDepartmentIds,
    },
  }
}

function resolvePolicyConfig(policy: {
  maxWeeklyHours: number
  maxSemesterHours: number
  defaultLectureWeight: number
  defaultLabWeight: number
  defaultAssessmentWeight: number
} | null): WorkloadPolicyConfig {
  return {
    maxWeeklyHours: policy?.maxWeeklyHours ?? null,
    maxSemesterHours: policy?.maxSemesterHours ?? null,
    defaultLectureWeight: policy?.defaultLectureWeight ?? null,
    defaultLabWeight: policy?.defaultLabWeight ?? null,
    defaultAssessmentWeight: policy?.defaultAssessmentWeight ?? null,
  }
}

export async function getTeacherReportingSnapshot(scope: ScopedDepartmentFilter) {
  const assignmentWhere = buildDepartmentFilter(scope)
  const [assignments, legacyAssignments, manualEntries, substitutions, offerings, policies] = await Promise.all([
    prisma.teachingAssignment.findMany({
      where: assignmentWhere,
      include: {
        teacher: { include: { user: true } },
        department: true,
        academicOffering: {
          include: {
            subject: true,
            group: true,
            language: true,
            semester: true,
            program: true,
            academicSession: true,
          },
        },
        roles: true,
      },
      orderBy: [{ department: { name: 'asc' } }, { createdAt: 'desc' }],
    }),
    prisma.teacherAssignment.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: {
        teacher: { include: { user: true } },
        department: true,
        subject: true,
        group: true,
        language: true,
        semester: true,
        academicYear: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.teacherWorkloadEntry.findMany({
      where: scope.isSuperAdmin
        ? undefined
        : {
            OR: [
              { teachingAssignment: { departmentId: { in: scope.managedDepartmentIds } } },
              { teacher: { departmentId: { in: scope.managedDepartmentIds } } },
            ],
          },
      include: {
        teacher: { include: { user: true } },
        teachingAssignment: true,
        semester: true,
        academicSession: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.teacherSubstitution.findMany({
      where: scope.isSuperAdmin ? undefined : { teachingAssignment: { departmentId: { in: scope.managedDepartmentIds } } },
      include: {
        originalTeacher: { include: { user: true } },
        substituteTeacher: { include: { user: true } },
        teachingAssignment: {
          include: {
            academicOffering: {
              include: {
                subject: true,
                group: true,
                language: true,
                semester: true,
                program: true,
              },
            },
          },
        },
        approvedBy: true,
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.academicOffering.findMany({
      where: scope.isSuperAdmin
        ? { isActive: true }
        : { isActive: true, departmentId: { in: scope.managedDepartmentIds } },
      include: {
        department: true,
        subject: true,
        group: true,
        language: true,
        semester: true,
        program: true,
        academicSession: true,
        teachingAssignments: {
          include: {
            roles: true,
          },
        },
      },
      orderBy: [{ department: { name: 'asc' } }, { createdAt: 'desc' }],
    }),
    prisma.teacherWorkloadPolicy.findMany({
      where: scope.isSuperAdmin ? { isActive: true } : { isActive: true, departmentId: { in: scope.managedDepartmentIds } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const policyByDepartment = new Map<string, typeof policies[number]>()
  for (const policy of policies) {
    if (!policyByDepartment.has(policy.departmentId)) {
      policyByDepartment.set(policy.departmentId, policy)
    }
  }

  const activeAssignments = assignments.filter((assignment) => assignment.status === TeachingAssignmentStatus.ACTIVE)
  const assignmentSummary = assignments.map((assignment) => ({
    assignmentId: assignment.id,
    teacherId: assignment.teacherId,
    teacherName: assignment.teacher.user.name,
    departmentName: assignment.department.name,
    offeringLabel: `${assignment.academicOffering.subject.name} / ${assignment.academicOffering.group.name} / ${assignment.academicOffering.language.name}`,
    roles: assignment.roles.map((role) => role.role),
    status: assignment.status,
    weeklyHours: assignment.weeklyHours,
    lectureHours: assignment.lectureHours,
    labHours: assignment.labHours,
    consultationHours: assignment.consultationHours,
    assessmentHours: assignment.assessmentHours,
    startsAt: assignment.startsAt,
    endsAt: assignment.endsAt,
  }))

  const teacherIds = new Set<string>([
    ...assignments.map((assignment) => assignment.teacherId),
    ...manualEntries.map((entry) => entry.teacherId),
  ])

  const teacherSummaries = Array.from(teacherIds).map((teacherId) => {
    const teacherAssignments = activeAssignments.filter((assignment) => assignment.teacherId === teacherId)
    const teacherEntries = manualEntries.filter((entry) => entry.teacherId === teacherId)
    const baseTeacher = assignments.find((assignment) => assignment.teacherId === teacherId)?.teacher
      ?? manualEntries.find((entry) => entry.teacherId === teacherId)?.teacher
      ?? null
    const departmentId = teacherAssignments[0]?.departmentId ?? baseTeacher?.departmentId ?? null
    const policy = departmentId ? policyByDepartment.get(departmentId) ?? null : null
    const policyConfig = resolvePolicyConfig(policy)
    const weekly = calculateTeacherWeeklyWorkload(teacherAssignments, teacherEntries, policyConfig)
    const semester = calculateTeacherSemesterWorkload(
      [
        ...teacherAssignments.flatMap((assignment) => {
          const calculated = assignment.lectureHours + assignment.labHours + assignment.consultationHours + assignment.assessmentHours + assignment.weeklyHours
          return [{ category: TeacherWorkloadCategory.OTHER, hours: calculated }]
        }),
        ...teacherEntries.map((entry) => ({ category: entry.category, hours: entry.hours })),
      ],
      policyConfig
    )

    return {
      teacherId,
      teacherName: baseTeacher?.user.name ?? 'Unknown Teacher',
      departmentName: assignments.find((assignment) => assignment.teacherId === teacherId)?.department.name ?? 'Unknown Department',
      assignmentCount: teacherAssignments.length,
      weeklyHours: weekly.totalHours,
      semesterHours: semester.totalHours,
      overWeeklyLimit: weekly.overLimit,
      overSemesterLimit: semester.overLimit,
      weeklyLimit: policy?.maxWeeklyHours ?? null,
      semesterLimit: policy?.maxSemesterHours ?? null,
      breakdown: getWorkloadBreakdown(teacherEntries.map((entry) => ({ category: entry.category, hours: entry.hours }))),
    }
  })

  const weeklyWorkload = teacherSummaries.map((summary) => ({
    teacherId: summary.teacherId,
    teacherName: summary.teacherName,
    departmentName: summary.departmentName,
    weeklyHours: summary.weeklyHours,
    weeklyLimit: summary.weeklyLimit,
    overWeeklyLimit: summary.overWeeklyLimit,
  }))

  const semesterWorkload = teacherSummaries.map((summary) => ({
    teacherId: summary.teacherId,
    teacherName: summary.teacherName,
    departmentName: summary.departmentName,
    semesterHours: summary.semesterHours,
    semesterLimit: summary.semesterLimit,
    overSemesterLimit: summary.overSemesterLimit,
  }))

  const overloadedTeachers = teacherSummaries.filter((summary) => summary.overWeeklyLimit || summary.overSemesterLimit)

  const unassignedOfferings = offerings.filter((offering) => {
    const assignmentStatusesWithCoverage: TeachingAssignmentStatus[] = [
      TeachingAssignmentStatus.APPROVED,
      TeachingAssignmentStatus.ACTIVE,
      TeachingAssignmentStatus.SUSPENDED,
    ]
    const hasActiveAssignment = offering.teachingAssignments.some((assignment) =>
      assignmentStatusesWithCoverage.includes(assignment.status)
    )
    return !hasActiveAssignment
  }).map((offering) => ({
    offeringId: offering.id,
    departmentName: offering.department.name,
    subjectName: offering.subject.name,
    groupName: offering.group.name,
    languageName: offering.language.name,
    semesterName: offering.semester.name,
    sessionName: offering.academicSession.name,
  }))

  const substitutionHistory = substitutions.map((substitution) => ({
    substitutionId: substitution.id,
    subjectName: substitution.teachingAssignment.academicOffering.subject.name,
    groupName: substitution.teachingAssignment.academicOffering.group.name,
    originalTeacher: substitution.originalTeacher.user.name,
    substituteTeacher: substitution.substituteTeacher.user.name,
    status: substitution.status,
    startsAt: substitution.startsAt,
    endsAt: substitution.endsAt,
    approvedBy: substitution.approvedBy?.name ?? null,
  }))

  const roleDistributionMap = new Map<TeachingAssignmentRoleType, number>()
  for (const assignment of assignments) {
    for (const role of assignment.roles) {
      roleDistributionMap.set(role.role, (roleDistributionMap.get(role.role) ?? 0) + 1)
    }
  }
  const roleDistribution = Object.values(TeachingAssignmentRoleType).map((role) => ({
    role,
    count: roleDistributionMap.get(role) ?? 0,
  }))

  return {
    assignmentSummary,
    weeklyWorkload,
    semesterWorkload,
    overloadedTeachers,
    unassignedOfferings,
    substitutionHistory,
    roleDistribution,
    legacyAssignments: legacyAssignments.map((assignment) => ({
      legacyAssignmentId: assignment.id,
      teacherName: assignment.teacher.user.name,
      departmentName: assignment.department.name,
      subjectName: assignment.subject.name,
      groupName: assignment.group.name,
      languageName: assignment.language.name,
      academicYearName: assignment.academicYear.name,
      semesterName: assignment.semester.name,
      academicOfferingId: assignment.academicOfferingId,
    })),
  }
}

export function buildMinimumAssignmentCsv(snapshot: Awaited<ReturnType<typeof getTeacherReportingSnapshot>>) {
  const lines = [
    [
      'assignmentId',
      'teacherName',
      'departmentName',
      'offeringLabel',
      'roles',
      'status',
      'weeklyHours',
      'lectureHours',
      'labHours',
      'consultationHours',
      'assessmentHours',
    ].join(','),
    ...snapshot.assignmentSummary.map((item) =>
      [
        item.assignmentId,
        escapeCsv(item.teacherName),
        escapeCsv(item.departmentName),
        escapeCsv(item.offeringLabel),
        escapeCsv(item.roles.join('|')),
        item.status,
        item.weeklyHours,
        item.lectureHours,
        item.labHours,
        item.consultationHours,
        item.assessmentHours,
      ].join(',')
    ),
  ]

  return lines.join('\n')
}

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}
