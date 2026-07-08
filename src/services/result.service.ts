/**
 * src/services/result.service.ts
 * Result retrieval and summary helpers.
 */

import { prisma } from '@/lib/prisma'

/**
 * Get a student's published results with exam details.
 */
export async function getStudentResults(studentUserId: string) {
  const profile = await prisma.studentProfile.findUnique({ where: { userId: studentUserId } })
  if (!profile) return []

  return prisma.examResult.findMany({
    where: { studentId: profile.id, status: 'PUBLISHED' },
    include: {
      exam: { include: { subject: true } },
    },
    orderBy: { publishedAt: 'desc' },
  })
}

/**
 * Get aggregated stats for a teacher's exams.
 */
export async function getTeacherResultStats(teacherUserId: string) {
  const profile = await prisma.teacherProfile.findUnique({ where: { userId: teacherUserId } })
  if (!profile) return null

  const results = await prisma.examResult.findMany({
    where: { exam: { teacherId: profile.id } },
    select: {
      marksObtained: true,
      totalMarks: true,
      percentage: true,
      isPassed: true,
      status: true,
    },
  })

  const total = results.length
  const published = results.filter((r) => r.status === 'PUBLISHED').length
  const pending = results.filter((r) => r.status === 'PENDING_REVIEW').length
  const passCount = results.filter((r) => r.isPassed).length
  const avgPercentage = total > 0
    ? results.reduce((s, r) => s + r.percentage, 0) / total
    : 0

  return { total, published, pending, passCount, avgPercentage }
}

/**
 * Get exam leaderboard (top students by marks).
 */
export async function getExamLeaderboard(examId: string, limit = 10) {
  return prisma.examResult.findMany({
    where: { examId, status: 'PUBLISHED' },
    include: {
      attempt: {
        include: {
          student: { include: { user: { select: { name: true } } } },
        },
      },
    },
    orderBy: { marksObtained: 'desc' },
    take: limit,
  })
}
