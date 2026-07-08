/**
 * src/services/question.service.ts
 * Question bank operations.
 */

import { prisma } from '@/lib/prisma'
import { QuestionType } from '@prisma/client'

/**
 * Get questions for a teacher filtered by assignment scope.
 */
export async function getTeacherQuestions(
  teacherUserId: string,
  filters?: {
    subjectId?: string
    groupId?: string
    academicYearId?: string
    semesterId?: string
    type?: QuestionType
  }
) {
  const profile = await prisma.teacherProfile.findUnique({ where: { userId: teacherUserId } })
  if (!profile) return []

  const where: any = { teacherId: profile.id }
  if (filters?.subjectId) where.subjectId = filters.subjectId
  if (filters?.groupId) where.groupId = filters.groupId
  if (filters?.academicYearId) where.academicYearId = filters.academicYearId
  if (filters?.semesterId) where.semesterId = filters.semesterId
  if (filters?.type) where.type = filters.type

  return prisma.question.findMany({
    where,
    include: {
      options: { orderBy: { orderIndex: 'asc' } },
      subject: true,
      language: true,
      group: true,
      academicYear: true,
      semester: true,
      _count: { select: { examQuestions: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get questions for an exam (for exam taking — no isCorrect exposed).
 * Shuffles options for MCQ for fairness.
 */
export async function getExamQuestionsForStudent(examId: string) {
  const examQuestions = await prisma.examQuestion.findMany({
    where: { examId },
    include: {
      question: {
        include: {
          // Exclude isCorrect for students
          options: {
            select: { id: true, text: true, orderIndex: true },
            orderBy: { orderIndex: 'asc' },
          },
        },
      },
    },
    orderBy: { orderIndex: 'asc' },
  })

  return examQuestions.map((eq) => ({
    examQuestionId: eq.id,
    questionId: eq.questionId,
    marks: eq.marks,
    orderIndex: eq.orderIndex,
    type: eq.question.type,
    text: eq.question.text,
    imageUrl: eq.question.imageUrl,
    options: eq.question.options,
  }))
}
