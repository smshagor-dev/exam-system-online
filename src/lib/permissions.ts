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
      subjectId: opts.subjectId,
      languageId: opts.languageId,
      groupId: opts.groupId,
      academicYearId: opts.academicYearId,
      semesterId: opts.semesterId,
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
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: studentUserId },
    include: { subjects: true },
  })
  if (!profile) return { allowed: false, reason: 'Student profile not found' }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      subjectId: true,
      languageId: true,
      groupId: true,
      academicYearId: true,
      semesterId: true,
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

  // Subject enrollment check
  const enrolled = profile.subjects.some(
    (s) =>
      s.subjectId === exam.subjectId &&
      s.languageId === exam.languageId &&
      s.groupId === exam.groupId &&
      s.academicYearId === exam.academicYearId &&
      s.semesterId === exam.semesterId
  )
  if (!enrolled) return { allowed: false, reason: 'Not enrolled in this subject/group/year/semester' }

  return { allowed: true }
}
