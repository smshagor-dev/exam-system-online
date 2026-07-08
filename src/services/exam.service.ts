/**
 * src/services/exam.service.ts
 * Business logic for exam operations — used in API routes and server actions.
 */

import { prisma } from '@/lib/prisma'
import { ExamStatus } from '@prisma/client'

/**
 * Fetch all exams a student is eligible to see.
 * Matches on department + all enrolled subject combos.
 */
export async function getStudentEligibleExams(studentUserId: string) {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: studentUserId },
    include: { subjects: true },
  })

  if (!profile || profile.subjects.length === 0) return []

  const orConditions = profile.subjects.map((s) => ({
    subjectId: s.subjectId,
    languageId: s.languageId,
    groupId: s.groupId,
    academicYearId: s.academicYearId,
    semesterId: s.semesterId,
    departmentId: profile.departmentId,
  }))

  return prisma.exam.findMany({
    where: {
      OR: orConditions,
      status: { in: [ExamStatus.SCHEDULED, ExamStatus.LIVE] },
    },
    include: {
      subject: true,
      language: true,
      group: true,
      academicYear: true,
      semester: true,
      _count: { select: { questions: true } },
    },
    orderBy: { startTime: 'asc' },
  })
}

/**
 * Get a teacher's exams with stats.
 */
export async function getTeacherExamsWithStats(teacherUserId: string) {
  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: teacherUserId },
  })
  if (!profile) return []

  return prisma.exam.findMany({
    where: { teacherId: profile.id },
    include: {
      subject: true,
      group: true,
      academicYear: true,
      semester: true,
      _count: { select: { questions: true, attempts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Change exam status with validation.
 * Enforces allowed state transitions.
 */
export async function transitionExamStatus(
  examId: string,
  newStatus: ExamStatus
): Promise<void> {
  const exam = await prisma.exam.findUnique({ where: { id: examId } })
  if (!exam) throw new Error('Exam not found')

  const allowed: Record<ExamStatus, ExamStatus[]> = {
    DRAFT: [ExamStatus.SCHEDULED],
    SCHEDULED: [ExamStatus.LIVE, ExamStatus.DRAFT],
    LIVE: [ExamStatus.COMPLETED],
    COMPLETED: [ExamStatus.RESULT_PUBLISHED],
    RESULT_PUBLISHED: [],
  }

  if (!allowed[exam.status].includes(newStatus)) {
    throw new Error(`Cannot transition from ${exam.status} to ${newStatus}`)
  }

  await prisma.exam.update({ where: { id: examId }, data: { status: newStatus } })
}

/**
 * Check if an exam is currently within its scheduled time window.
 */
export function isExamInTimeWindow(exam: { startTime: Date; endTime: Date }): boolean {
  const now = new Date()
  return now >= exam.startTime && now <= exam.endTime
}
