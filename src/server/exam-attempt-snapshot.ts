import { prisma } from '@/lib/prisma'
import {
  resolveExamTranslation,
  resolveQuestionOptionTranslation,
  resolveQuestionTranslation,
} from '@/lib/academic-content'

const SNAPSHOT_ACTION = 'ATTEMPT_SNAPSHOT'

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
        contains: `"attemptId":"${attemptId}"`,
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
        create: exam.questions.map((entry) => {
          const resolvedQuestion = resolveQuestionTranslation(entry.question, exam.languageId)

          return {
            sourceQuestionId: entry.question.id,
            examQuestionId: entry.id,
            orderIndex: entry.orderIndex,
            marks: entry.marks,
            type: entry.question.type,
            text: resolvedQuestion.text,
            expectedAnswer: resolvedQuestion.expectedAnswer ?? null,
            explanation: resolvedQuestion.explanation ?? null,
            keywords: resolvedQuestion.keywords ?? null,
            options: {
              create: entry.question.options.map((option) => {
                const resolvedOption = resolveQuestionOptionTranslation(option, exam.languageId)
                return {
                  sourceOptionId: option.id,
                  text: resolvedOption.text,
                  orderIndex: option.orderIndex,
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

  await prisma.activityLog.create({
    data: {
      userId: input.studentUserId,
      examId: input.examId,
      action: SNAPSHOT_ACTION,
      details: JSON.stringify({
        ...payload,
        storage: 'activity-log',
      }),
    },
  })

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
      if (question.options.length === 0) {
        problems.push(`snapshot question missing options: ${attempt.id}:${question.id}`)
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
