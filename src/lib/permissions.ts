/**
 * src/lib/permissions.ts
 * Server-side permission checks. NEVER trust client-side role.
 * Import and call these in route handlers and server components.
 */

import { UserRole } from '@prisma/client'
import { prisma } from './prisma'

export type PermissionContext = {
  userId: string
  role: UserRole
}

// ─── Role Guards ─────────────────────────────────────────────────────────────

export function isSuperAdmin(ctx: PermissionContext) {
  return ctx.role === UserRole.SUPER_ADMIN
}

export function isDepartmentAdmin(ctx: PermissionContext) {
  return ctx.role === UserRole.DEPARTMENT_ADMIN
}

export function isAdmin(ctx: PermissionContext) {
  return ctx.role === UserRole.SUPER_ADMIN || ctx.role === UserRole.DEPARTMENT_ADMIN
}

export function isTeacher(ctx: PermissionContext) {
  return ctx.role === UserRole.TEACHER
}

export function isStudent(ctx: PermissionContext) {
  return ctx.role === UserRole.STUDENT
}

type StudentExamAccessProfile = Awaited<ReturnType<typeof loadStudentExamAccessProfile>>

async function loadStudentExamAccessProfile(studentUserId: string) {
  return prisma.studentProfile.findUnique({
    where: { userId: studentUserId },
    include: {
      subjects: true,
      enrollments: {
        orderBy: [{ isActive: 'desc' }, { enrolledAt: 'desc' }],
        take: 5,
      },
      leaveRecords: {
        where: {
          OR: [
            { readmittedAt: null },
            { readmittedAt: { isSet: false } },
          ],
        },
        take: 1,
      },
      graduationRecords: {
        orderBy: { graduatedAt: 'desc' },
        take: 1,
      },
    },
  })
}

function getStudentExamBlockReason(profile: NonNullable<StudentExamAccessProfile>) {
  const latestEnrollment = profile.enrollments[0] ?? null

  if (profile.leaveRecords.length > 0) {
    return 'Student is on active leave'
  }
  if (profile.graduationRecords.length > 0) {
    return 'Student has graduated'
  }
  if (latestEnrollment && ['GRADUATED', 'DROPPED', 'ALUMNI', 'LEAVE'].includes(latestEnrollment.status)) {
    return `Student enrollment is ${latestEnrollment.status.toLowerCase()}`
  }

  return null
}

export async function getStudentExamCatalogScope(studentUserId: string) {
  const profile = await loadStudentExamAccessProfile(studentUserId)
  if (!profile) {
    return {
      profile: null,
      activeEnrollment: null,
      blockedReason: 'Student profile not found',
      subjectScopes: [],
    }
  }

  const activeEnrollment = profile.enrollments.find((item) => item.status === 'ACTIVE' && item.isActive) ?? null
  const blockedReason = getStudentExamBlockReason(profile)

  const subjectScopes = activeEnrollment
    ? profile.subjects.filter((subject) =>
        subject.groupId === activeEnrollment.groupId &&
        subject.semesterId === activeEnrollment.semesterId &&
        (!activeEnrollment.academicYearId || subject.academicYearId === activeEnrollment.academicYearId) &&
        (!activeEnrollment.languageId || subject.languageId === activeEnrollment.languageId)
      )
    : profile.subjects

  return {
    profile,
    activeEnrollment,
    blockedReason,
    subjectScopes,
  }
}

function buildStudentExamScopeConditions(
  profile: NonNullable<StudentExamAccessProfile>,
  subjectScopes: Array<{
    subjectId: string
    languageId: string
    groupId: string
    academicYearId: string
    semesterId: string
  }>
) {
  return subjectScopes.map((subject) => ({
    subjectId: subject.subjectId,
    languageId: subject.languageId,
    groupId: subject.groupId,
    academicYearId: subject.academicYearId,
    semesterId: subject.semesterId,
    departmentId: profile.departmentId,
  }))
}

export async function getStudentExamQueryScope(studentUserId: string) {
  const scope = await getStudentExamCatalogScope(studentUserId)
  return {
    ...scope,
    examWhereClauses: scope.profile ? buildStudentExamScopeConditions(scope.profile, scope.subjectScopes) : [],
  }
}

// ─── Department Admin can only manage their assigned department ───────────────

export async function canManageDepartment(ctx: PermissionContext, departmentId: string) {
  if (ctx.role === UserRole.SUPER_ADMIN) return true
  if (ctx.role === UserRole.DEPARTMENT_ADMIN) {
    const dept = await prisma.department.findFirst({
      where: { id: departmentId, adminId: ctx.userId },
    })
    return !!dept
  }
  return false
}

// ─── Teacher Permission Checks ───────────────────────────────────────────────

/**
 * Verify teacher is assigned to a specific subject/group/year combo.
 * Used before allowing exam/question creation.
 */
export async function teacherCanAccessAssignment(
  ctx: PermissionContext,
  opts: {
    academicOfferingId?: string | null
    subjectId: string
    languageId: string
    groupId: string
    academicYearId: string
    semesterId: string
  }
) {
  if (!isTeacher(ctx)) return false
  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: ctx.userId },
  })
  if (!profile) return false

  const assignment = await prisma.teacherAssignment.findFirst({
    where: {
      teacherId: profile.id,
      ...(opts.academicOfferingId
        ? {
            OR: [
              { academicOfferingId: opts.academicOfferingId },
              {
                subjectId: opts.subjectId,
                languageId: opts.languageId,
                groupId: opts.groupId,
                academicYearId: opts.academicYearId,
                semesterId: opts.semesterId,
              },
            ],
          }
        : {
            subjectId: opts.subjectId,
            languageId: opts.languageId,
            groupId: opts.groupId,
            academicYearId: opts.academicYearId,
            semesterId: opts.semesterId,
          }),
    },
  })
  return !!assignment
}

/**
 * Verify teacher owns an exam.
 */
export async function teacherOwnsExam(ctx: PermissionContext, examId: string) {
  if (!isTeacher(ctx)) return false
  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: ctx.userId },
  })
  if (!profile) return false

  const exam = await prisma.exam.findFirst({
    where: { id: examId, teacherId: profile.id },
  })
  return !!exam
}

/**
 * Verify teacher owns a question.
 */
export async function teacherOwnsQuestion(ctx: PermissionContext, questionId: string) {
  if (!isTeacher(ctx)) return false
  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: ctx.userId },
  })
  if (!profile) return false

  const question = await prisma.question.findFirst({
    where: { id: questionId, teacherId: profile.id },
  })
  return !!question
}

// ─── Student Permission Checks ───────────────────────────────────────────────

/**
 * Verify student is allowed to access a specific exam.
 * Checks: department, subject, language, group, academic year, semester match.
 */
export async function studentCanAccessExam(
  studentUserId: string,
  examId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const profile = await loadStudentExamAccessProfile(studentUserId)
  if (!profile) return { allowed: false, reason: 'Student profile not found' }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      subjectId: true,
      languageId: true,
      groupId: true,
      academicYearId: true,
      semesterId: true,
      academicOfferingId: true,
      departmentId: true,
      status: true,
      startTime: true,
      endTime: true,
    },
  })
  if (!exam) return { allowed: false, reason: 'Exam not found' }

  // Department check
  if (exam.departmentId !== profile.departmentId) {
    return { allowed: false, reason: 'Department mismatch' }
  }

  // Students can access scheduled or live exams during the valid exam window
  if (exam.status !== 'SCHEDULED' && exam.status !== 'LIVE') {
    return { allowed: false, reason: `Exam is ${exam.status.toLowerCase()}` }
  }

  // Time check
  const now = new Date()
  if (now < exam.startTime) return { allowed: false, reason: 'Exam has not started yet' }
  if (now > exam.endTime) return { allowed: false, reason: 'Exam has ended' }

  const activeEnrollment = profile.enrollments.find((item) => item.status === 'ACTIVE' && item.isActive)
  const blockedReason = getStudentExamBlockReason(profile)
  if (blockedReason) {
    return { allowed: false, reason: blockedReason }
  }

  const enrollmentMatches = activeEnrollment
    ? (
        activeEnrollment.departmentId === exam.departmentId &&
        activeEnrollment.groupId === exam.groupId &&
        activeEnrollment.academicYearId === exam.academicYearId &&
        activeEnrollment.semesterId === exam.semesterId &&
        (!activeEnrollment.languageId || activeEnrollment.languageId === exam.languageId) &&
        activeEnrollment.academicSessionId
      )
    : false

  if (activeEnrollment && !enrollmentMatches) {
    return { allowed: false, reason: 'Active enrollment does not match this exam context' }
  }

  // Legacy subject enrollment fallback
  const enrolled = profile.subjects.some(
    (s) =>
      s.subjectId === exam.subjectId &&
      s.languageId === exam.languageId &&
      s.groupId === exam.groupId &&
      s.academicYearId === exam.academicYearId &&
      s.semesterId === exam.semesterId
  )
  const enrolledByOffering = exam.academicOfferingId
    ? profile.subjects.some((s) => s.academicOfferingId === exam.academicOfferingId)
    : false
  if (!activeEnrollment && !enrolled && !enrolledByOffering) {
    return { allowed: false, reason: 'Not enrolled in this subject/group/year/semester' }
  }
  if (activeEnrollment && !enrolledByOffering && !enrolled) {
    return { allowed: false, reason: 'No legacy subject enrollment or offering was found for this active enrollment' }
  }

  return { allowed: true }
}
