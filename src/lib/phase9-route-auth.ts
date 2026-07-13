import {
  Phase9OfficerRoleType,
  TeachingAssignmentRoleType,
  UserRole,
} from '@prisma/client'
import { auth } from './auth'
import { canManageDepartment, type PermissionContext } from './permissions'
import { prisma } from './prisma'
import { getTeacherProfileByUserId, validateTeacherOfferingAccess } from './teacher-assignment'

export type Phase9Permission =
  | 'gradebook.manage'
  | 'results.calculate'
  | 'results.verify'
  | 'results.publish'
  | 'transcript.generate'
  | 'certificate.generate'
  | 'graduation.manage'
  | 'appeals.manage'
  | 'analytics.read'

const PHASE9_OFFICER_PERMISSION_MAP: Record<Phase9Permission, Phase9OfficerRoleType[]> = {
  'gradebook.manage': [
    Phase9OfficerRoleType.CONTROLLER_OF_EXAMINATION,
    Phase9OfficerRoleType.MODERATOR,
  ],
  'results.calculate': [
    Phase9OfficerRoleType.CONTROLLER_OF_EXAMINATION,
    Phase9OfficerRoleType.RESULT_VERIFIER,
  ],
  'results.verify': [
    Phase9OfficerRoleType.CONTROLLER_OF_EXAMINATION,
    Phase9OfficerRoleType.RESULT_VERIFIER,
  ],
  'results.publish': [Phase9OfficerRoleType.CONTROLLER_OF_EXAMINATION],
  'transcript.generate': [
    Phase9OfficerRoleType.CONTROLLER_OF_EXAMINATION,
    Phase9OfficerRoleType.TRANSCRIPT_OFFICER,
  ],
  'certificate.generate': [
    Phase9OfficerRoleType.CONTROLLER_OF_EXAMINATION,
    Phase9OfficerRoleType.GRADUATION_OFFICER,
  ],
  'graduation.manage': [
    Phase9OfficerRoleType.CONTROLLER_OF_EXAMINATION,
    Phase9OfficerRoleType.GRADUATION_OFFICER,
  ],
  'appeals.manage': [
    Phase9OfficerRoleType.CONTROLLER_OF_EXAMINATION,
    Phase9OfficerRoleType.RESULT_VERIFIER,
    Phase9OfficerRoleType.MODERATOR,
  ],
  'analytics.read': [
    Phase9OfficerRoleType.CONTROLLER_OF_EXAMINATION,
    Phase9OfficerRoleType.RESULT_VERIFIER,
  ],
}

const PHASE9_TEACHING_PERMISSION_MAP: Partial<Record<Phase9Permission, TeachingAssignmentRoleType[]>> = {
  'gradebook.manage': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.ASSISTANT_TEACHER,
    TeachingAssignmentRoleType.COURSE_COORDINATOR,
    TeachingAssignmentRoleType.EXAMINER,
    TeachingAssignmentRoleType.MODERATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
  'results.calculate': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.EXAMINER,
    TeachingAssignmentRoleType.COURSE_COORDINATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
  'appeals.manage': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.EXAMINER,
    TeachingAssignmentRoleType.MODERATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
}

function isWithinRange(now: Date, startsAt?: Date | null, endsAt?: Date | null) {
  if (startsAt && now < startsAt) return false
  if (endsAt && now > endsAt) return false
  return true
}

export async function getPhase9SessionContext() {
  const session = await auth()
  if (!session?.user?.id || !session.user.role) {
    return null
  }

  return {
    session,
    ctx: {
      userId: session.user.id,
      role: session.user.role,
    } satisfies PermissionContext,
  }
}

export async function requirePhase9Permission(
  permission: Phase9Permission,
  scope?: {
    departmentId?: string | null
    academicOfferingId?: string | null
    subjectId?: string | null
    languageId?: string | null
    groupId?: string | null
    academicYearId?: string | null
    semesterId?: string | null
  }
) {
  const payload = await getPhase9SessionContext()
  if (!payload) return null

  if (payload.ctx.role === UserRole.SUPER_ADMIN) {
    return payload
  }

  if (payload.ctx.role === UserRole.DEPARTMENT_ADMIN) {
    if (!scope?.departmentId) {
      return payload
    }
    return (await canManageDepartment(payload.ctx, scope.departmentId)) ? payload : null
  }

  if (payload.ctx.role !== UserRole.TEACHER) {
    return null
  }

  const teacher = await getTeacherProfileByUserId(payload.ctx.userId)
  if (!teacher) return null

  const now = new Date()
  const officerAssignments = await prisma.phase9OfficerAssignment.findMany({
    where: {
      teacherId: teacher.id,
      isActive: true,
      roleType: { in: PHASE9_OFFICER_PERMISSION_MAP[permission] },
      ...(scope?.departmentId ? { departmentId: scope.departmentId } : {}),
    },
    select: {
      startsAt: true,
      endsAt: true,
    },
    take: 10,
  })

  if (officerAssignments.some((assignment) => isWithinRange(now, assignment.startsAt, assignment.endsAt))) {
    return payload
  }

  const allowedTeachingRoles = PHASE9_TEACHING_PERMISSION_MAP[permission]
  if (!allowedTeachingRoles?.length) {
    return null
  }

  const access = await validateTeacherOfferingAccess({
    teacherProfileId: teacher.id,
    academicOfferingId: scope?.academicOfferingId,
    scope: {
      departmentId: scope?.departmentId,
      subjectId: scope?.subjectId,
      languageId: scope?.languageId,
      groupId: scope?.groupId,
      academicYearId: scope?.academicYearId,
      semesterId: scope?.semesterId,
      academicOfferingId: scope?.academicOfferingId,
    },
    allowedRoles: allowedTeachingRoles,
  })

  return access.allowed ? payload : null
}

export async function getPhase9AccessibleDepartmentIds(
  payload: NonNullable<Awaited<ReturnType<typeof getPhase9SessionContext>>>
) {
  if (payload.ctx.role === UserRole.SUPER_ADMIN) {
    return null
  }

  if (payload.ctx.role === UserRole.DEPARTMENT_ADMIN) {
    const departments = await prisma.department.findMany({
      where: { adminId: payload.session.user.id },
      select: { id: true },
    })
    return departments.map((department) => department.id)
  }

  if (payload.ctx.role === UserRole.TEACHER) {
    const teacher = await prisma.teacherProfile.findUnique({
      where: { userId: payload.session.user.id },
      select: { departmentId: true },
    })
    return teacher?.departmentId ? [teacher.departmentId] : []
  }

  return []
}

export async function getPhase9DepartmentScopeWhere(
  payload: NonNullable<Awaited<ReturnType<typeof getPhase9SessionContext>>>,
  requestedDepartmentId?: string | null
) {
  const departmentIds = await getPhase9AccessibleDepartmentIds(payload)
  if (departmentIds === null) {
    return requestedDepartmentId ? { departmentId: requestedDepartmentId } : {}
  }

  const allowedDepartmentIds = requestedDepartmentId
    ? departmentIds.filter((departmentId) => departmentId === requestedDepartmentId)
    : departmentIds

  return {
    departmentId: {
      in: allowedDepartmentIds,
    },
  }
}
