/**
 * src/lib/result-engine.ts
 * 
 * Automatic result calculation engine.
 * Handles AUTO, TEACHER_REVIEW, and AI_ASSISTED_OPTIONAL modes.
 * 
 * AUTO mode:     MCQ/T-F/Short-Answer auto-checked. Written pending.
 * TEACHER_REVIEW: MCQ/T-F auto-checked. Short/Written shown to teacher.
 * AI_ASSISTED:   Like TEACHER_REVIEW but with AI mark suggestions injected.
 */

import { prisma } from './prisma'
import {
  resolveQuestionOptionTranslation,
  resolveQuestionTranslation,
} from './academic-content'
import {
  QuestionType,
  ResultMode,
  ResultStatus,
  AnswerCheckStatus,
  AttemptStatus,
} from '@prisma/client'
import { aiEvaluationService } from '@/services/ai-evaluation.service'
import { loadAttemptSnapshot } from '@/server/exam-attempt-snapshot'

// Grade boundaries
const GRADE_BANDS = [
  { min: 90, grade: 'A+' },
  { min: 80, grade: 'A' },
  { min: 70, grade: 'B+' },
  { min: 60, grade: 'B' },
  { min: 50, grade: 'C' },
  { min: 40, grade: 'D' },
  { min: 0, grade: 'F' },
]

function calculateGrade(percentage: number): string {
  for (const band of GRADE_BANDS) {
    if (percentage >= band.min) return band.grade
  }
  return 'F'
}

/**
 * Check a short answer against expected answer and keywords.
 * Returns a confidence score [0, 1].
 */
function checkShortAnswer(
  studentAnswer: string,
  expectedAnswer: string | null,
  keywordsJson: string | null
): { isCorrect: boolean; confidence: number } {
  if (!studentAnswer || studentAnswer.trim() === '') {
    return { isCorrect: false, confidence: 0 }
  }

  const cleaned = studentAnswer.toLowerCase().trim()

  // Exact match (case-insensitive)
  if (expectedAnswer && cleaned === expectedAnswer.toLowerCase().trim()) {
    return { isCorrect: true, confidence: 1.0 }
  }

  // Keyword matching
  if (keywordsJson) {
    try {
      const keywords: string[] = JSON.parse(keywordsJson)
      const matchedKeywords = keywords.filter((kw) =>
        cleaned.includes(kw.toLowerCase())
      )
      const confidence = matchedKeywords.length / keywords.length
      return {
        isCorrect: confidence >= 0.7, // 70% keyword match = correct
        confidence,
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return { isCorrect: false, confidence: 0 }
}

/**
 * Process a single student answer for AUTO mode.
 * Returns the marks to award.
 */
async function processAnswer(
  answer: {
    id: string
    questionId: string
    selectedOption: string | null
    answerText: string | null
  },
  question: {
    type: QuestionType
    expectedAnswer: string | null
    keywords: string | null
    marks: number
    options: { id: string; isCorrect: boolean }[]
  },
  examMarks: number,
  resultMode: ResultMode
): Promise<{
  checkStatus: AnswerCheckStatus
  isCorrect: boolean | null
  marksAwarded: number
}> {
  const maxMarks = examMarks

  switch (question.type) {
    case QuestionType.MCQ:
    case QuestionType.TRUE_FALSE: {
      if (!answer.selectedOption) {
        return { checkStatus: AnswerCheckStatus.AUTO_CHECKED, isCorrect: false, marksAwarded: 0 }
      }
      const selectedOpt = question.options.find((o) => o.id === answer.selectedOption)
      const isCorrect = selectedOpt?.isCorrect ?? false
      return {
        checkStatus: AnswerCheckStatus.AUTO_CHECKED,
        isCorrect,
        marksAwarded: isCorrect ? maxMarks : 0,
      }
    }

    case QuestionType.SHORT_ANSWER: {
      if (resultMode === ResultMode.AUTO) {
        const { isCorrect } = checkShortAnswer(
          answer.answerText ?? '',
          question.expectedAnswer,
          question.keywords
        )
        return {
          checkStatus: AnswerCheckStatus.AUTO_CHECKED,
          isCorrect,
          marksAwarded: isCorrect ? maxMarks : 0,
        }
      }
      return { checkStatus: AnswerCheckStatus.UNCHECKED, isCorrect: null, marksAwarded: 0 }
    }

    case QuestionType.WRITTEN_ANSWER: {
      return { checkStatus: AnswerCheckStatus.UNCHECKED, isCorrect: null, marksAwarded: 0 }
    }

    default:
      return { checkStatus: AnswerCheckStatus.UNCHECKED, isCorrect: null, marksAwarded: 0 }
  }
}

/**
 * Main entry point: calculate and persist result for a completed attempt.
 * Called when student submits (manually or auto-submit).
 */
export async function calculateResult(attemptId: string): Promise<void> {
  const attempt = await prisma.studentExamAttempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: {
        include: {
          questions: {
            include: {
              question: {
                include: {
                  translations: true,
                  options: {
                    include: { translations: true },
                  },
                },
              },
            },
          },
        },
      },
      answers: true,
    },
  })

  if (!attempt) throw new Error('Attempt not found')
  if (attempt.status !== AttemptStatus.SUBMITTED && attempt.status !== AttemptStatus.AUTO_SUBMITTED) {
    throw new Error('Attempt is not in a submitted state')
  }

  const { exam } = attempt
  const resultMode = exam.resultMode
  const snapshot = await loadAttemptSnapshot(attemptId)

  let totalMarksAwarded = 0
  let pendingAnswers = 0

  // Snapshot questions are authoritative because each student can receive a
  // different question from the database for the same blueprint slot.
  for (const answer of attempt.answers) {
    const snapshotQuestion = snapshot?.questions.find(
      (entry: (typeof snapshot.questions)[number]) => entry.id === answer.questionId
    )
    const examQuestion = exam.questions.find((eq) => eq.questionId === answer.questionId)

    if (!snapshotQuestion && !examQuestion) {
      continue
    }

    const resolvedFallbackQuestion = examQuestion
      ? resolveQuestionTranslation(examQuestion.question, exam.languageId)
      : null

    const question = snapshotQuestion
      ? {
          type: snapshotQuestion.question.type as QuestionType,
          expectedAnswer: snapshotQuestion.question.expectedAnswer,
          keywords: snapshotQuestion.question.keywords,
          marks: snapshotQuestion.marks,
          options: snapshotQuestion.question.options,
        }
      : {
          type: examQuestion!.question.type,
          expectedAnswer: resolvedFallbackQuestion?.expectedAnswer ?? null,
          keywords: resolvedFallbackQuestion?.keywords ?? null,
          marks: examQuestion!.question.marks,
          options: examQuestion!.question.options.map((option) =>
            resolveQuestionOptionTranslation(option, exam.languageId)
          ),
        }

    const result = await processAnswer(
      {
        id: answer.id,
        questionId: answer.questionId,
        selectedOption: answer.selectedOption,
        answerText: answer.answerText,
      },
      question,
      snapshotQuestion?.marks ?? examQuestion!.marks,
      resultMode
    )

    try {
      await prisma.studentAnswer.update({
        where: { id: answer.id },
        data: {
          checkStatus: result.checkStatus,
          isCorrect: result.isCorrect,
          marksAwarded: result.marksAwarded,
        },
      })
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        return
      }
      throw error
    }

    totalMarksAwarded += result.marksAwarded
    if (result.checkStatus === AnswerCheckStatus.UNCHECKED) {
      pendingAnswers++
    }
  }

  let resultStatus: ResultStatus
  if (resultMode === ResultMode.AUTO && pendingAnswers === 0) {
    resultStatus = ResultStatus.REVIEWED
  } else {
    resultStatus = ResultStatus.PENDING_REVIEW
  }

  const percentage = exam.totalMarks > 0 ? (totalMarksAwarded / exam.totalMarks) * 100 : 0
  const isPassed = totalMarksAwarded >= exam.passingMarks
  const grade = calculateGrade(percentage)

  await prisma.examResult.upsert({
    where: { attemptId },
    create: {
      examId: exam.id,
      attemptId,
      studentId: attempt.studentId,
      totalMarks: exam.totalMarks,
      marksObtained: totalMarksAwarded,
      percentage,
      grade,
      isPassed,
      status: resultStatus,
    },
    update: {
      marksObtained: totalMarksAwarded,
      percentage,
      grade,
      isPassed,
      status: resultStatus,
    },
  })

  if (exam.autoPublish && resultStatus === ResultStatus.REVIEWED) {
    await publishResult(attemptId, exam.id, attempt.studentId)
  }

  if (resultMode === ResultMode.AI_ASSISTED_OPTIONAL && pendingAnswers > 0) {
    requestAiEvaluation(attemptId).catch((err) => {
      console.error('[AI] AI evaluation failed:', err)
    })
  }
}

/**
 * Recalculate result totals after teacher review.
 * Call this after teacher updates marks on individual answers.
 */
export async function recalculateAfterReview(attemptId: string): Promise<void> {
  const attempt = await prisma.studentExamAttempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: true,
      answers: true,
    },
  })
  if (!attempt) throw new Error('Attempt not found')

  let totalMarksAwarded = 0
  for (const answer of attempt.answers) {
    const marks = answer.teacherMarks ?? answer.marksAwarded ?? 0
    totalMarksAwarded += marks
  }

  const percentage = attempt.exam.totalMarks > 0
    ? (totalMarksAwarded / attempt.exam.totalMarks) * 100
    : 0
  const isPassed = totalMarksAwarded >= attempt.exam.passingMarks
  const grade = calculateGrade(percentage)

  await prisma.examResult.update({
    where: { attemptId },
    data: {
      marksObtained: totalMarksAwarded,
      percentage,
      grade,
      isPassed,
      status: ResultStatus.REVIEWED,
    },
  })
}

/**
 * Publish a result - makes it visible to the student.
 */
export async function publishResult(
  attemptId: string,
  _examId: string,
  _studentId: string
): Promise<void> {
  void _examId
  void _studentId

  const existing = await prisma.examResult.findUnique({
    where: { attemptId },
    select: {
      id: true,
      publishedAt: true,
      isPassed: true,
      percentage: true,
      attempt: {
        select: {
          student: {
            select: {
              userId: true,
            },
          },
        },
      },
    },
  })

  if (!existing) {
    throw new Error('Result not found')
  }

  if (existing.publishedAt) {
    return
  }

  const result = await prisma.examResult.update({
    where: { attemptId },
    data: {
      status: ResultStatus.PUBLISHED,
      publishedAt: new Date(),
    },
    include: { attempt: { include: { student: { include: { user: true } } } } },
  })

  const existingNotification = await prisma.notification.findFirst({
    where: {
      userId: result.attempt.student.userId,
      link: `/student/results/${result.id}`,
      title: 'Exam Result Published',
    },
    select: { id: true },
  })

  if (!existingNotification) {
    await prisma.notification.create({
      data: {
        userId: result.attempt.student.userId,
        title: 'Exam Result Published',
        message: `Your result for the exam is now available. You ${result.isPassed ? 'passed' : 'did not pass'} with ${result.percentage.toFixed(1)}% (${result.grade}).`,
        type: result.isPassed ? 'success' : 'warning',
        link: `/student/results/${result.id}`,
      },
    })
  }
}

async function requestAiEvaluation(attemptId: string): Promise<void> {
  if (!(await aiEvaluationService.isEnabled())) {
    console.log('[AI] AI evaluation disabled, skipping')
    return
  }
  await aiEvaluationService.evaluateAttempt(attemptId)
}
