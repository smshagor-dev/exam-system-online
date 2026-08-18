import { randomInt } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import {
  resolveExamTranslation,
  resolveQuestionOptionTranslation,
  resolveQuestionTranslation,
} from '@/lib/academic-content'

const SNAPSHOT_ACTION = 'ATTEMPT_SNAPSHOT'
const QUESTION_ALLOCATION_ACTION = 'ATTEMPT_QUESTION_ALLOCATION'

type SnapshotQuestion = {
  id: string
  examQuestionId: string
  orderIndex: number
  marks: number
  question: {
    id: string
    type: string
    text: string
    expectedAnswer: string | null
    explanation: string | null
    keywords: string | null
    options: Array<{
      id: string
      text: string
      orderIndex: number
      isCorrect: boolean
    }>
  }
}

type AttemptSnapshot = {
  version: 2
  storage: 'dedicated' | 'activity-log'
  attemptId: string
  examId: string
  studentId: string
  languageId: string
  createdAt: string
  exam: {
    id: string
    title: string
    description: string | null
    instructions: string | null
    duration: number
    totalMarks: number
    passingMarks: number
    subject: { name: string | null } | null
  }
  questions: SnapshotQuestion[]
}

function parseSnapshot(details: string | null | undefined) {
  if (!details) {
    return null
  }

  try {
    const parsed = JSON.parse(details) as AttemptSnapshot | null
    if (!parsed) {
      return null
    }

    if (!('storage' in parsed)) {
      const legacy = parsed as Omit<AttemptSnapshot, 'version' | 'storage'>
      return {
        ...legacy,
        version: 2,
        storage: 'activity-log' as const,
      } satisfies AttemptSnapshot
    }

    return parsed
  } catch {
    return null
  }
}

function shuffle<T>(items: readonly T[]) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    const current = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = current
  }
  return copy
}

function buildSnapshotPayload(model: {
  attemptId: string
  examId: string
  studentId: string
  languageId: string
  createdAt: Date
  examTitle: string
  examDescription: string | null
  examInstructions: string | null
  duration: number
  totalMarks: number
  passingMarks: number
  subjectName: string | null
  questions: Array<{
    sourceQuestionId: string
    examQuestionId: string
    orderIndex: number
    marks: number
    type: string
    text: string
    expectedAnswer: string | null
    explanation: string | null
    keywords: string | null
    options: Array<{
      sourceOptionId: string
      text: string
      orderIndex: number
      isCorrect: boolean
    }>
  }>
}): AttemptSnapshot {
  return {
    version: 2,
    storage: 'dedicated',
    attemptId: model.attemptId,
    examId: model.examId,
    studentId: model.studentId,
    languageId: model.languageId,
    createdAt: model.createdAt.toISOString(),
    exam: {
      id: model.examId,
      title: model.examTitle,
      description: model.examDescription ?? null,
      instructions: model.examInstructions ?? null,
      duration: model.duration,
      totalMarks: model.totalMarks,
      passingMarks: model.passingMarks,
      subject: model.subjectName ? { name: model.subjectName } : null,
    },
    questions: model.questions.map((entry) => ({
      id: entry.sourceQuestionId,
      examQuestionId: entry.examQuestionId,
      orderIndex: entry.orderIndex,
      marks: entry.marks,
      question: {
        id: entry.sourceQuestionId,
        type: entry.type,
        text: entry.text,
        expectedAnswer: entry.expectedAnswer ?? null,
        explanation: entry.explanation ?? null,
        keywords: entry.keywords ?? null,
        options: entry.options.map((option) => ({
          id: option.sourceOptionId,
          text: option.text,
          orderIndex: option.orderIndex,
          isCorrect: option.isCorrect,
        })),
      },
    })),
  }
}

async function loadDedicatedAttemptSnapshot(attemptId: string) {
  const snapshot = await prisma.examAttemptSnapshot.findUnique({
    where: { attemptId },
    include: {
      questions: {
        include: {
          options: {
            orderBy: { orderIndex: 'asc' },
          },
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  if (!snapshot) {
    return null
  }

  return buildSnapshotPayload(snapshot)
}

async function loadActivityLogAttemptSnapshot(attemptId: string) {
  const log = await prisma.activityLog.findFirst({
    where: {
      action: SNAPSHOT_ACTION,
      details: {
        contains: `\"attemptId\":\"${attemptId}\"`,
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return parseSnapshot(log?.details)
}

export async function loadAttemptSnapshot(attemptId: string) {
  return (await loadDedicatedAttemptSnapshot(attemptId)) ?? loadActivityLogAttemptSnapshot(attemptId)
}

export async function ensureAttemptSnapshot(input: {
  attemptId: string
  examId: string
  studentUserId: string
  studentId: string
}) {
  // Once an attempt has a snapshot, always return it unchanged. This is what keeps
  // the student's random question set stable across refreshes and reconnects.
  const existing = await loadAttemptSnapshot(input.attemptId)
  if (existing) {
    return existing
  }

  const exam = await prisma.exam.findUnique({
    where: { id: input.examId },
    include: {
      translations: true,
      subject: true,
      questions: {
        include: {
          question: {
            include: {
              translations: true,
              options: {
                include: { translations: true },
                orderBy: { orderIndex: 'asc' },
              },
            },
          },
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  if (!exam) {
    throw new Error('Exam not found')
  }
  if (exam.questions.length === 0) {
    throw new Error('Exam has no question blueprint')
  }

  const questionBank = await prisma.question.findMany({
    where: {
      subjectId: exam.subjectId,
      languageId: exam.languageId,
      groupId: exam.groupId,
      academicYearId: exam.academicYearId,
      semesterId: exam.semesterId,
      teacherId: exam.teacherId,
      isActive: true,
    },
    include: {
      translations: true,
      options: {
        include: { translations: true },
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  // Include the blueprint questions themselves so an exam can still start even if
  // some attached questions are not currently marked active in the broader bank.
  // Dedupe by question id. Questions may overlap across different students, but
  // within one student's set we prefer distinct questions.
  const candidateById = new Map<string, (typeof questionBank)[number]>()
  for (const question of questionBank) {
    candidateById.set(question.id, question)
  }
  for (const entry of exam.questions) {
    if (!candidateById.has(entry.question.id)) {
      candidateById.set(entry.question.id, entry.question)
    }
  }

  const candidates = Array.from(candidateById.values())
  const selectedQuestionIds = new Set<string>()
  const allocated: Array<{
    slot: (typeof exam.questions)[number]
    selected: (typeof candidates)[number]
  }> = []

  for (const slot of exam.questions) {
    // Preserve the teacher's blueprint question-type mix where possible, but make
    // the actual source question random for each student.
    let choices = candidates.filter(
      (candidate) => candidate.type === slot.question.type && !selectedQuestionIds.has(candidate.id)
    )

    if (choices.length === 0) {
      // Defensive fallback: keep questions distinct inside the same attempt even
      // if the bank's type distribution is unusual.
      choices = candidates.filter((candidate) => !selectedQuestionIds.has(candidate.id))
    }

    const selected = shuffle(choices)[0] ?? slot.question
    selectedQuestionIds.add(selected.id)
    allocated.push({ slot, selected })
  }

  // Randomize the visible question order independently for this student.
  const randomizedAllocation = shuffle(allocated)
  const resolvedExam = resolveExamTranslation(exam, exam.languageId)

  const immutableSnapshot = await prisma.examAttemptSnapshot.create({
    data: {
      attemptId: input.attemptId,
      examId: input.examId,
      studentId: input.studentId,
      languageId: exam.languageId,
      examTitle: resolvedExam.title,
      examDescription: resolvedExam.description ?? null,
      examInstructions: resolvedExam.instructions ?? null,
      duration: exam.duration,
      totalMarks: exam.totalMarks,
      passingMarks: exam.passingMarks,
      subjectName: exam.subject?.name ?? null,
      questions: {
        create: randomizedAllocation.map(({ slot, selected }, orderIndex) => {
          const resolvedQuestion = resolveQuestionTranslation(selected, exam.languageId)
          const randomizedOptions = shuffle(selected.options)

          return {
            sourceQuestionId: selected.id,
            examQuestionId: slot.id,
            orderIndex,
            marks: slot.marks,
            type: selected.type,
            text: resolvedQuestion.text,
            expectedAnswer: resolvedQuestion.expectedAnswer ?? null,
            explanation: resolvedQuestion.explanation ?? null,
            keywords: resolvedQuestion.keywords ?? null,
            options: {
              create: randomizedOptions.map((option, optionIndex) => {
                const resolvedOption = resolveQuestionOptionTranslation(option, exam.languageId)
                return {
                  sourceOptionId: option.id,
                  text: resolvedOption.text,
                  orderIndex: optionIndex,
                  isCorrect: option.isCorrect,
                }
              }),
            },
          }
        }),
      },
    },
    include: {
      questions: {
        include: {
          options: {
            orderBy: { orderIndex: 'asc' },
          },
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  const payload = buildSnapshotPayload(immutableSnapshot)

  await Promise.all([
    prisma.activityLog.create({
      data: {
        userId: input.studentUserId,
        examId: input.examId,
        action: SNAPSHOT_ACTION,
        details: JSON.stringify({
          ...payload,
          storage: 'activity-log',
        }),
      },
    }),
    prisma.activityLog.create({
      data: {
        userId: input.studentUserId,
        examId: input.examId,
        action: QUESTION_ALLOCATION_ACTION,
        details: JSON.stringify({
          attemptId: input.attemptId,
          studentId: input.studentId,
          strategy: 'PER_STUDENT_RANDOM_OVERLAP_ALLOWED',
          blueprintSlots: exam.questions.length,
          bankSize: candidates.length,
          allocatedQuestionIds: payload.questions.map((question) => question.id),
        }),
      },
    }),
  ])

  return payload
}

export async function verifyAttemptSnapshotIntegrity() {
  const activeAttempts = await prisma.studentExamAttempt.findMany({
    where: {
      status: {
        in: ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED'],
      },
    },
    select: {
      id: true,
      examId: true,
      studentId: true,
      status: true,
    },
  })

  const snapshots = await prisma.examAttemptSnapshot.findMany({
    include: {
      questions: {
        include: {
          options: true,
        },
      },
    },
  })

  const snapshotByAttempt = new Map<string, typeof snapshots>()
  for (const snapshot of snapshots) {
    const current = snapshotByAttempt.get(snapshot.attemptId) ?? []
    current.push(snapshot)
    snapshotByAttempt.set(snapshot.attemptId, current)
  }

  const problems: string[] = []

  for (const attempt of activeAttempts) {
    const matching = snapshotByAttempt.get(attempt.id) ?? []
    if (matching.length === 0) {
      problems.push(`active attempt without snapshot: ${attempt.id}`)
      continue
    }
    if (matching.length > 1) {
      problems.push(`duplicate snapshot: ${attempt.id}`)
    }

    const snapshot = matching[0]
    if (!snapshot || snapshot.questions.length === 0) {
      problems.push(`snapshot missing questions: ${attempt.id}`)
      continue
    }

    for (const question of snapshot.questions) {
      if (
        (question.type === 'MCQ' || question.type === 'TRUE_FALSE') &&
        question.options.length === 0
      ) {
        problems.push(`snapshot objective question missing options: ${attempt.id}:${question.id}`)
      }
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    counts: {
      activeAttempts: activeAttempts.length,
      snapshots: snapshots.length,
    },
  }
}

export type { AttemptSnapshot, SnapshotQuestion }
