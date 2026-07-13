import { Phase8DutyRoleType, UserRole } from '@prisma/client'
import { prisma } from './prisma'
import { canManageDepartment, type PermissionContext } from './permissions'

export type Phase8Permission =
  | 'exam.schedule.manage'
  | 'calendar.manage'
  | 'room.manage'
  | 'seat.manage'
  | 'invigilator.manage'
  | 'attendance.manage'
  | 'incident.manage'
  | 'reports.read'
  | 'dashboard.read'
  | 'admit.read'

const PHASE8_DUTY_PERMISSION_MAP: Record<Phase8Permission, Phase8DutyRoleType[]> = {
  'exam.schedule.manage': [Phase8DutyRoleType.SCHEDULER, Phase8DutyRoleType.SUPERVISOR],
  'calendar.manage': [Phase8DutyRoleType.SCHEDULER, Phase8DutyRoleType.SUPERVISOR],
  'room.manage': [Phase8DutyRoleType.SCHEDULER, Phase8DutyRoleType.SUPERVISOR],
  'seat.manage': [Phase8DutyRoleType.SCHEDULER, Phase8DutyRoleType.SUPERVISOR],
  'invigilator.manage': [Phase8DutyRoleType.SCHEDULER, Phase8DutyRoleType.SUPERVISOR],
  'attendance.manage': [Phase8DutyRoleType.INVIGILATOR, Phase8DutyRoleType.SUPERVISOR, Phase8DutyRoleType.SCHEDULER],
  'incident.manage': [Phase8DutyRoleType.INVIGILATOR, Phase8DutyRoleType.SUPERVISOR, Phase8DutyRoleType.SCHEDULER],
  'reports.read': [Phase8DutyRoleType.SCHEDULER, Phase8DutyRoleType.SUPERVISOR],
  'dashboard.read': [Phase8DutyRoleType.INVIGILATOR, Phase8DutyRoleType.SUPERVISOR, Phase8DutyRoleType.SCHEDULER],
  'admit.read': [],
}

function isWithinRange(now: Date, startsAt?: Date | null, endsAt?: Date | null) {
  if (startsAt && now < startsAt) return false
  if (endsAt && now > endsAt) return false
  return true
}

export async function teacherHasPhase8Permission(
  ctx: PermissionContext,
  permission: Phase8Permission,
  scope?: { departmentId?: string | null; campusId?: string | null }
) {
  if (ctx.role === UserRole.SUPER_ADMIN) {
    return true
  }

  if (scope?.departmentId && ctx.role === UserRole.DEPARTMENT_ADMIN) {
    return canManageDepartment(ctx, scope.departmentId)
  }

  if (ctx.role !== UserRole.TEACHER) {
    return false
  }

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: ctx.userId },
    select: { id: true, departmentId: true },
  })

  if (!profile) {
    return false
  }

  const now = new Date()
  const assignments = await prisma.examDutyAssignment.findMany({
    where: {
      teacherId: profile.id,
      isActive: true,
      roleType: { in: PHASE8_DUTY_PERMISSION_MAP[permission] },
      ...(scope?.departmentId ? { departmentId: scope.departmentId } : {}),
      ...(scope?.campusId ? { OR: [{ campusId: scope.campusId }, { campusId: null }] } : {}),
    },
    select: {
      startsAt: true,
      endsAt: true,
    },
    take: 10,
  })

  return assignments.some((assignment) => isWithinRange(now, assignment.startsAt, assignment.endsAt))
}

export async function studentCanAccessAdmitCard(studentUserId: string, admitCardId: string) {
  const card = await prisma.examAdmitCard.findUnique({
    where: { id: admitCardId },
    select: {
      id: true,
      student: {
        select: {
          userId: true,
          enrollments: {
            where: {
              status: 'ACTIVE',
              isActive: true,
            },
            select: {
              id: true,
            },
            take: 1,
          },
        },
      },
      revokedAt: true,
      schedulingSession: {
        select: {
          status: true,
        },
      },
    },
  })

  if (!card) {
    return { allowed: false, reason: 'Admit card not found' }
  }
  if (card.revokedAt) {
    return { allowed: false, reason: 'Admit card is revoked' }
  }
  if (card.student.userId !== studentUserId) {
    return { allowed: false, reason: 'Admit card does not belong to this student' }
  }
  if (card.student.enrollments.length === 0) {
    return { allowed: false, reason: 'Student does not have an active enrollment' }
  }
  if (card.schedulingSession.status !== 'PUBLISHED' && card.schedulingSession.status !== 'LOCKED' && card.schedulingSession.status !== 'RUNNING' && card.schedulingSession.status !== 'COMPLETED') {
    return { allowed: false, reason: 'Scheduling session is not published' }
  }

  return { allowed: true, reason: undefined }
}
