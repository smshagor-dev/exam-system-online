import { prisma } from './prisma'
import {
  createClassTestAttempt,
  getClassTest,
  getClassTestAttempt,
  getClassTestAttemptById,
  listClassTestAttemptsByStudent,
  listClassTestsForScope,
  updateClassTestAttempt,
  type ClassTestAnswer,
  type ClassTestAttemptRecord,
  type ClassTestRecord,
  type ClassTestSecurityEvent,
  type ClassTestSnapshotQuestion,
} from './class-test-store'

export const CLASS_TEST_MAX_WARNINGS = 3

function shuffle<T>(input: T[]) {
  const result = [...input]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

function normalizeAnswer(value: string | null | undefined) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function getClassTestLifecycle(test: ClassTestRecord, now = new Date()) {
  if (test.status === 'CANCELLED') return 'CANCELLED' as const
  const start = new Date(test.startTime)
  const end = new Date(test.endTime)
  if (now < start) return 'UPCOMING' as const
  if (now > end) return 'CLOSED' as const
  return 'LIVE' as const
}

export function getClassTestRemainingSeconds(attempt: ClassTestAttemptRecord, test: ClassTestRecord) {
  if (attempt.status !== 'IN_PROGRESS') return 0
  const deadline = Math.min(new Date(attempt.deadlineAt).getTime(), new Date(test.endTime).getTime())
  return Math.max(0, Math.floor((deadline - Date.now()) / 1000))
}

export function sanitizeClassTestAttemptForStudent(attempt: ClassTestAttemptRecord) {
  return {
    ...attempt,
    snapshot: attempt.snapshot.map((question) => ({
      sourceQuestionId: question.sourceQuestionId,
      orderIndex: question.orderIndex,
      marks: question.marks,
      type: question.type,
      text: question.text,
      options: question.options.map((option) => ({
        id: option.id,
        text: option.text,
        orderIndex: option.orderIndex,
      })),
    })),
  }
}

async function getStudentContext(userId: string) {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    include: {
      subjects: true,
      enrollments: {
        where: { isActive: true, status: 'ACTIVE' },
        orderBy: { enrolledAt: 'desc' },
        take: 1,
      },
    },
  })
  if (!profile) throw new Error('Student profile not found')
  return profile
}

function studentSubjectMatches(test: ClassTestRecord, student: Awaited<ReturnType<typeof getStudentContext>>) {
  return student.subjects.some((subject) => {
    if (subject.subjectId !== test.subjectId) return false
    if (subject.groupId !== test.groupId) return false
    if (subject.semesterId !== test.semesterId) return false
    if (subject.languageId !== test.languageId) return false
    if (subject.academicYearId !== test.academicYearId) return false
    if (test.academicOfferingId && subject.academicOfferingId && subject.academicOfferingId !== test.academicOfferingId) {
      return false
    }
    return true
  })
}

export async function assertStudentCanAccessClassTest(test: ClassTestRecord, userId: string) {
  const student = await getStudentContext(userId)
  const existingAttempt = await getClassTestAttempt(test.id, student.id)
  if (existingAttempt) return { student, attempt: existingAttempt }
  if (!studentSubjectMatches(test, student)) {
    throw new Error('This class test is not assigned to your current subject scope')
  }
  return { student, attempt: null }
}

export async function listStudentClassTests(userId: string) {
  const student = await getStudentContext(userId)
  const activeEnrollment = student.enrollments[0] ?? null
  const attempted = await listClassTestAttemptsByStudent(userId)
  const attemptedIds = new Set(attempted.map((attempt) => attempt.classTestId))
  const byId = new Map<string, ClassTestRecord>()

  if (activeEnrollment) {
    const scoped = await listClassTestsForScope({
      groupId: activeEnrollment.groupId,
      academicYearId: activeEnrollment.academicYearId ?? '',
      semesterId: activeEnrollment.semesterId,
      languageId: activeEnrollment.languageId,
    })
    for (const test of scoped) {
      if (studentSubjectMatches(test, student)) byId.set(test.id, test)
    }
  }

  for (const id of attemptedIds) {
    const test = await getClassTest(id)
    if (test) byId.set(test.id, test)
  }

  const attemptMap = new Map(attempted.map((attempt) => [attempt.classTestId, attempt]))
  return [...byId.values()]
    .sort((left, right) => new Date(right.startTime).getTime() - new Date(left.startTime).getTime())
    .map((test) => ({ test, attempt: attemptMap.get(test.id) ?? null, lifecycle: getClassTestLifecycle(test) }))
}

async function buildAttemptSnapshot(test: ClassTestRecord): Promise<ClassTestSnapshotQuestion[]> {
  const questionIds = test.questionPool.map((entry) => entry.questionId)
  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds }, isActive: true },
    include: { options: { orderBy: { orderIndex: 'asc' } } },
  })
  const questionMap = new Map(questions.map((question) => [question.id, question]))
  const validPool = test.questionPool.filter((entry) => questionMap.has(entry.questionId))
  if (validPool.length < test.questionsPerStudent) {
    throw new Error(`Class test needs ${test.questionsPerStudent} active questions but only ${validPool.length} are available`)
  }

  return shuffle(validPool)
    .slice(0, test.questionsPerStudent)
    .map((entry, index) => {
      const question = questionMap.get(entry.questionId)!
      return {
        sourceQuestionId: question.id,
        orderIndex: index,
        marks: entry.marks,
        type: question.type,
        text: question.text,
        expectedAnswer: question.expectedAnswer ?? null,
        explanation: question.explanation ?? null,
        options: shuffle(question.options).map((option, optionIndex) => ({
          id: option.id,
          text: option.text,
          orderIndex: optionIndex,
          isCorrect: option.isCorrect,
        })),
      }
    })
}

export async function startClassTestAttempt(classTestId: string, userId: string) {
  const test = await getClassTest(classTestId)
  if (!test) throw new Error('Class test not found')
  const lifecycle = getClassTestLifecycle(test)
  if (lifecycle !== 'LIVE') {
    throw new Error(lifecycle === 'UPCOMING' ? 'Class test has not started yet' : 'Class test time has ended')
  }

  const { student, attempt } = await assertStudentCanAccessClassTest(test, userId)
  if (attempt) {
    if (attempt.status === 'IN_PROGRESS' && getClassTestRemainingSeconds(attempt, test) <= 0) {
      return finalizeClassTestAttempt(attempt.id, true)
    }
    return attempt
  }

  const snapshot = await buildAttemptSnapshot(test)
  const deadlineMs = Math.min(Date.now() + test.duration * 60_000, new Date(test.endTime).getTime())
  return createClassTestAttempt({
    classTestId: test.id,
    studentId: student.id,
    studentUserId: userId,
    deadlineAt: new Date(deadlineMs).toISOString(),
    snapshot,
  })
}

function upsertAnswer(
  answers: ClassTestAnswer[],
  questionId: string,
  patch: { selectedOption?: string | null; answerText?: string | null }
) {
  const now = new Date().toISOString()
  const current = answers.find((answer) => answer.questionId === questionId)
  const next: ClassTestAnswer = current
    ? {
        ...current,
        selectedOption: patch.selectedOption !== undefined ? patch.selectedOption : current.selectedOption,
        answerText: patch.answerText !== undefined ? patch.answerText : current.answerText,
        savedAt: now,
      }
    : {
        questionId,
        selectedOption: patch.selectedOption ?? null,
        answerText: patch.answerText ?? null,
        marksAwarded: null,
        teacherMarks: null,
        teacherFeedback: null,
        isCorrect: null,
        reviewed: false,
        savedAt: now,
      }
  return [...answers.filter((answer) => answer.questionId !== questionId), next]
}

export async function saveClassTestAnswer(input: {
  attemptId: string
  userId: string
  questionId: string
  selectedOption?: string | null
  answerText?: string | null
}) {
  const attempt = await getClassTestAttemptById(input.attemptId)
  if (!attempt || attempt.studentUserId !== input.userId) throw new Error('Class test attempt not found')
  if (attempt.status !== 'IN_PROGRESS') throw new Error('Class test is already submitted')
  const test = await getClassTest(attempt.classTestId)
  if (!test) throw new Error('Class test not found')
  if (getClassTestRemainingSeconds(attempt, test) <= 0) {
    return finalizeClassTestAttempt(attempt.id, true)
  }
  if (!attempt.snapshot.some((question) => question.sourceQuestionId === input.questionId)) {
    throw new Error('Question does not belong to this class test attempt')
  }

  return updateClassTestAttempt(attempt.id, {
    answers: upsertAnswer(attempt.answers, input.questionId, {
      selectedOption: input.selectedOption,
      answerText: input.answerText,
    }),
  })
}

function gradeAttempt(test: ClassTestRecord, attempt: ClassTestAttemptRecord) {
  let needsReview = test.resultMode === 'TEACHER_REVIEW'
  const answers: ClassTestAnswer[] = attempt.snapshot.map((question) => {
    const current = attempt.answers.find((answer) => answer.questionId === question.sourceQuestionId)
    const selectedOption = current?.selectedOption ?? null
    const answerText = current?.answerText ?? null
    const hasText = Boolean(answerText?.trim())
    const hasSelection = Boolean(selectedOption)

    if (question.type === 'MCQ' || question.type === 'TRUE_FALSE') {
      const correctOption = question.options.find((option) => option.isCorrect)
      const isCorrect = Boolean(selectedOption && correctOption?.id === selectedOption)
      return {
        ...current,
        questionId: question.sourceQuestionId,
        selectedOption,
        answerText,
        marksAwarded: isCorrect ? question.marks : 0,
        teacherMarks: current?.teacherMarks ?? null,
        teacherFeedback: current?.teacherFeedback ?? null,
        isCorrect,
        reviewed: true,
        savedAt: current?.savedAt ?? new Date().toISOString(),
      }
    }

    if (question.type === 'SHORT_ANSWER' && question.expectedAnswer?.trim()) {
      const isCorrect = normalizeAnswer(answerText) === normalizeAnswer(question.expectedAnswer)
      return {
        ...current,
        questionId: question.sourceQuestionId,
        selectedOption,
        answerText,
        marksAwarded: isCorrect ? question.marks : 0,
        teacherMarks: current?.teacherMarks ?? null,
        teacherFeedback: current?.teacherFeedback ?? null,
        isCorrect,
        reviewed: true,
        savedAt: current?.savedAt ?? new Date().toISOString(),
      }
    }

    if (!hasText && !hasSelection) {
      return {
        ...current,
        questionId: question.sourceQuestionId,
        selectedOption,
        answerText,
        marksAwarded: 0,
        teacherMarks: current?.teacherMarks ?? 0,
        teacherFeedback: current?.teacherFeedback ?? null,
        isCorrect: null,
        reviewed: true,
        savedAt: current?.savedAt ?? new Date().toISOString(),
      }
    }

    needsReview = true
    return {
      ...current,
      questionId: question.sourceQuestionId,
      selectedOption,
      answerText,
      marksAwarded: current?.marksAwarded ?? null,
      teacherMarks: current?.teacherMarks ?? null,
      teacherFeedback: current?.teacherFeedback ?? null,
      isCorrect: current?.isCorrect ?? null,
      reviewed: current?.reviewed ?? false,
      savedAt: current?.savedAt ?? new Date().toISOString(),
    }
  })

  const marksObtained = answers.reduce((total, answer) => total + (answer.teacherMarks ?? answer.marksAwarded ?? 0), 0)
  const percentage = test.totalMarks > 0 ? (marksObtained / test.totalMarks) * 100 : 0
  return {
    answers,
    marksObtained,
    percentage,
    isPassed: marksObtained >= test.passingMarks,
    resultStatus: needsReview ? ('PENDING_REVIEW' as const) : ('PUBLISHED' as const),
  }
}

export async function finalizeClassTestAttempt(attemptId: string, autoSubmit = false) {
  const attempt = await getClassTestAttemptById(attemptId)
  if (!attempt) throw new Error('Class test attempt not found')
  if (attempt.status !== 'IN_PROGRESS') return attempt
  const test = await getClassTest(attempt.classTestId)
  if (!test) throw new Error('Class test not found')
  const graded = gradeAttempt(test, attempt)
  const submittedAt = new Date().toISOString()
  return updateClassTestAttempt(attempt.id, {
    status: autoSubmit ? 'AUTO_SUBMITTED' : 'SUBMITTED',
    submittedAt,
    answers: graded.answers,
    resultStatus: graded.resultStatus,
    marksObtained: graded.marksObtained,
    percentage: graded.percentage,
    isPassed: graded.isPassed,
    publishedAt: graded.resultStatus === 'PUBLISHED' ? submittedAt : null,
  })
}

export async function reportClassTestSecurityViolation(input: {
  attemptId: string
  userId: string
  type: ClassTestSecurityEvent['type']
}) {
  const attempt = await getClassTestAttemptById(input.attemptId)
  if (!attempt || attempt.studentUserId !== input.userId) throw new Error('Class test attempt not found')
  if (attempt.status !== 'IN_PROGRESS') return attempt

  const warningCount = attempt.warningCount + 1
  const event = { type: input.type, createdAt: new Date().toISOString() }
  const updated = await updateClassTestAttempt(attempt.id, {
    warningCount,
    tabSwitchCount: attempt.tabSwitchCount + (input.type === 'TAB_SWITCH' ? 1 : 0),
    securityEvents: [...attempt.securityEvents, event],
  })
  if (!updated) throw new Error('Could not update class test warning')
  if (warningCount >= CLASS_TEST_MAX_WARNINGS) return finalizeClassTestAttempt(attempt.id, true)
  return updated
}

export async function reviewClassTestAnswer(input: {
  classTestId: string
  attemptId: string
  teacherUserId: string
  questionId: string
  marks: number
  feedback?: string | null
}) {
  const test = await getClassTest(input.classTestId)
  if (!test || test.teacherUserId !== input.teacherUserId) throw new Error('Class test not found')
  const attempt = await getClassTestAttemptById(input.attemptId)
  if (!attempt || attempt.classTestId !== test.id || attempt.status === 'IN_PROGRESS') {
    throw new Error('Submitted class test attempt not found')
  }
  const question = attempt.snapshot.find((entry) => entry.sourceQuestionId === input.questionId)
  if (!question) throw new Error('Question not found in this attempt')
  if (input.marks < 0 || input.marks > question.marks) throw new Error(`Marks must be between 0 and ${question.marks}`)

  const answer = attempt.answers.find((entry) => entry.questionId === input.questionId) ?? {
    questionId: input.questionId,
    selectedOption: null,
    answerText: null,
    marksAwarded: 0,
    teacherMarks: null,
    teacherFeedback: null,
    isCorrect: null,
    reviewed: false,
    savedAt: new Date().toISOString(),
  }
  const answers = [
    ...attempt.answers.filter((entry) => entry.questionId !== input.questionId),
    { ...answer, teacherMarks: input.marks, teacherFeedback: input.feedback ?? null, reviewed: true },
  ]
  const marksObtained = answers.reduce((total, entry) => total + (entry.teacherMarks ?? entry.marksAwarded ?? 0), 0)
  const percentage = test.totalMarks > 0 ? (marksObtained / test.totalMarks) * 100 : 0
  return updateClassTestAttempt(attempt.id, {
    answers,
    marksObtained,
    percentage,
    isPassed: marksObtained >= test.passingMarks,
  })
}

export async function publishClassTestResult(input: {
  classTestId: string
  attemptId: string
  teacherUserId: string
}) {
  const test = await getClassTest(input.classTestId)
  if (!test || test.teacherUserId !== input.teacherUserId) throw new Error('Class test not found')
  const attempt = await getClassTestAttemptById(input.attemptId)
  if (!attempt || attempt.classTestId !== test.id || attempt.status === 'IN_PROGRESS') {
    throw new Error('Submitted class test attempt not found')
  }
  const pending = attempt.answers.some((answer) => !answer.reviewed)
  if (pending) throw new Error('Review all written/code answers before publishing the result')
  const marksObtained = attempt.answers.reduce((total, answer) => total + (answer.teacherMarks ?? answer.marksAwarded ?? 0), 0)
  const percentage = test.totalMarks > 0 ? (marksObtained / test.totalMarks) * 100 : 0
  return updateClassTestAttempt(attempt.id, {
    resultStatus: 'PUBLISHED',
    marksObtained,
    percentage,
    isPassed: marksObtained >= test.passingMarks,
    publishedAt: new Date().toISOString(),
  })
}
