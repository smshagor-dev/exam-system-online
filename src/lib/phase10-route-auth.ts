import { TeachingAssignmentRoleType, UserRole } from '@prisma/client'
import { auth } from './auth'
import { canManageDepartment, type PermissionContext } from './permissions'
import { getTeacherProfileByUserId, validateTeacherOfferingAccess } from './teacher-assignment'

export type Phase10Permission =
  | 'lms.course.manage'
  | 'lms.material.manage'
  | 'lms.lesson.publish'
  | 'lms.liveclass.manage'
  | 'lms.discussion.moderate'
  | 'lms.progress.read'

const PHASE10_PERMISSION_ROLE_MAP: Record<Phase10Permission, TeachingAssignmentRoleType[]> = {
  'lms.course.manage': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.ASSISTANT_TEACHER,
    TeachingAssignmentRoleType.LECTURER,
    TeachingAssignmentRoleType.LAB_INSTRUCTOR,
    TeachingAssignmentRoleType.COURSE_COORDINATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
  'lms.material.manage': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.ASSISTANT_TEACHER,
    TeachingAssignmentRoleType.LECTURER,
    TeachingAssignmentRoleType.LAB_INSTRUCTOR,
    TeachingAssignmentRoleType.COURSE_COORDINATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
  'lms.lesson.publish': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.COURSE_COORDINATOR,
    TeachingAssignmentRoleType.LECTURER,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
  'lms.liveclass.manage': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.ASSISTANT_TEACHER,
    TeachingAssignmentRoleType.LECTURER,
    TeachingAssignmentRoleType.COURSE_COORDINATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
  'lms.discussion.moderate': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.REVIEWER,
    TeachingAssignmentRoleType.MODERATOR,
    TeachingAssignmentRoleType.COURSE_COORDINATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
  'lms.progress.read': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.ASSISTANT_TEACHER,
    TeachingAssignmentRoleType.LECTURER,
    TeachingAssignmentRoleType.REVIEWER,
    TeachingAssignmentRoleType.MODERATOR,
    TeachingAssignmentRoleType.COURSE_COORDINATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
}

export async function getPhase10SessionContext() {
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

export async function requirePhase10Permission(
  permission: Phase10Permission,
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
  const payload = await getPhase10SessionContext()
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
  if (!teacher) {
    return null
  }

  const access = await validateTeacherOfferingAccess({
    teacherProfileId: teacher.id,
    academicOfferingId: scope?.academicOfferingId,
    scope: {
      departmentId: scope?.departmentId,
      academicOfferingId: scope?.academicOfferingId,
      subjectId: scope?.subjectId,
      languageId: scope?.languageId,
      groupId: scope?.groupId,
      academicYearId: scope?.academicYearId,
      semesterId: scope?.semesterId,
    },
    allowedRoles: PHASE10_PERMISSION_ROLE_MAP[permission],
  })

  return access.allowed ? payload : null
}
