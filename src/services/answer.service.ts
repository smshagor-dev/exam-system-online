/**
 * src/services/answer.service.ts
 * Answer management operations.
 */

import { prisma } from '@/lib/prisma'
import { AnswerCheckStatus } from '@prisma/client'

/**
 * Save or update a student answer during an exam.
 * Enforces: attempt must be IN_PROGRESS, not already submitted.
 */
export async function saveStudentAnswer(opts: {
  attemptId: string
  questionId: string
  selectedOption?: string | null
  answerText?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const attempt = await prisma.studentExamAttempt.findUnique({
    where: { id: opts.attemptId },
    select: { status: true },
  })

  if (!attempt) return { success: false, error: 'Attempt not found' }
  if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') {
    return { success: false, error: 'Exam already submitted — answers locked' }
  }

  await prisma.studentAnswer.upsert({
    where: {
      attemptId_questionId: {
        attemptId: opts.attemptId,
        questionId: opts.questionId,
      },
    },
    create: {
      attemptId: opts.attemptId,
      questionId: opts.questionId,
      selectedOption: opts.selectedOption ?? null,
      answerText: opts.answerText ?? null,
    },
    update: {
      selectedOption: opts.selectedOption ?? null,
      answerText: opts.answerText ?? null,
      savedAt: new Date(),
    },
  })

  return { success: true }
}

/**
 * Get all answers for an attempt, with question details.
 */
export async function getAttemptAnswers(attemptId: string) {
  return prisma.studentAnswer.findMany({
    where: { attemptId },
    include: {
      question: {
        include: { options: { orderBy: { orderIndex: 'asc' } } },
      },
    },
    orderBy: { question: { text: 'asc' } },
  })
}

/**
 * Get all pending (unreviewed) answers for a teacher's exams.
 */
export async function getPendingAnswersForTeacher(teacherUserId: string) {
  const profile = await prisma.teacherProfile.findUnique({ where: { userId: teacherUserId } })
  if (!profile) return []

  return prisma.studentAnswer.findMany({
    where: {
      checkStatus: { in: [AnswerCheckStatus.UNCHECKED, AnswerCheckStatus.AI_SUGGESTED] },
      attempt: { exam: { teacherId: profile.id } },
    },
    include: {
      question: true,
      attempt: {
        include: {
          exam: { select: { title: true, id: true } },
          student: { include: { user: { select: { name: true } } } },
        },
      },
    },
  })
}
