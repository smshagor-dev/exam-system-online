import { prisma } from './prisma'
import { getReExamTargetForExam } from './reexam-store'
import type { QuestionType } from '@prisma/client'

export type UniqueQuestionCapacityDetail = {
  type: QuestionType
  slotsPerStudent: number
  eligibleStudents: number
  requiredQuestions: number
  availableQuestions: number
  shortage: number
}

export type UniqueQuestionCapacityResult = {
  ok: boolean
  eligibleStudents: number
  questionSlotsPerStudent: number
  requiredTotalQuestions: number
  availableTotalQuestions: number
  details: UniqueQuestionCapacityDetail[]
}

export async function validateUniqueQuestionCapacity(examId: string): Promise<UniqueQuestionCapacityResult> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      teacherId: true,
      departmentId: true,
      subjectId: true,
      languageId: true,
      groupId: true,
      academicYearId: true,
      semesterId: true,
      academicOfferingId: true,
      questions: {
        select: {
          question: { select: { type: true } },
        },
      },
    },
  })

  if (!exam) {
    throw new Error('Exam not found')
  }

  const reExamTarget = await getReExamTargetForExam(exam.id)
  let eligibleStudents = reExamTarget ? 1 : 0

  if (!reExamTarget) {
    const enrolled = await prisma.studentSubject.findMany({
      where: exam.academicOfferingId
        ? { academicOfferingId: exam.academicOfferingId }
        : {
            subjectId: exam.subjectId,
            languageId: exam.languageId,
            groupId: exam.groupId,
            academicYearId: exam.academicYearId,
            semesterId: exam.semesterId,
            student: { departmentId: exam.departmentId },
          },
      select: { studentId: true },
    })
    eligibleStudents = new Set(enrolled.map((item) => item.studentId)).size
  }

  const slotsByType = new Map<QuestionType, number>()
  for (const entry of exam.questions) {
    slotsByType.set(entry.question.type, (slotsByType.get(entry.question.type) ?? 0) + 1)
  }

  const bank = await prisma.question.findMany({
    where: {
      subjectId: exam.subjectId,
      languageId: exam.languageId,
      groupId: exam.groupId,
      academicYearId: exam.academicYearId,
      semesterId: exam.semesterId,
      teacherId: exam.teacherId,
      isActive: true,
    },
    select: { id: true, type: true },
  })

  const availableByType = new Map<QuestionType, number>()
  for (const question of bank) {
    availableByType.set(question.type, (availableByType.get(question.type) ?? 0) + 1)
  }

  const details: UniqueQuestionCapacityDetail[] = Array.from(slotsByType.entries()).map(
    ([type, slotsPerStudent]) => {
      const requiredQuestions = slotsPerStudent * eligibleStudents
      const availableQuestions = availableByType.get(type) ?? 0
      return {
        type,
        slotsPerStudent,
        eligibleStudents,
        requiredQuestions,
        availableQuestions,
        shortage: Math.max(0, requiredQuestions - availableQuestions),
      }
    }
  )

  return {
    ok: eligibleStudents > 0 && exam.questions.length > 0 && details.every((detail) => detail.shortage === 0),
    eligibleStudents,
    questionSlotsPerStudent: exam.questions.length,
    requiredTotalQuestions: exam.questions.length * eligibleStudents,
    availableTotalQuestions: bank.length,
    details,
  }
}

export function formatUniqueQuestionCapacityError(capacity: UniqueQuestionCapacityResult) {
  if (capacity.eligibleStudents === 0) {
    return 'No eligible students were found for this exam scope.'
  }
  if (capacity.questionSlotsPerStudent === 0) {
    return 'The exam has no question blueprint.'
  }

  const shortages = capacity.details
    .filter((detail) => detail.shortage > 0)
    .map(
      (detail) =>
        `${detail.type}: need ${detail.requiredQuestions}, have ${detail.availableQuestions} (short ${detail.shortage})`
    )

  return `Strict unique-question delivery cannot be guaranteed. ${shortages.join('; ')}`
}
