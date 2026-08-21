import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export type ClassTestStatus = 'SCHEDULED' | 'CANCELLED'
export type ClassTestAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED'
export type ClassTestResultStatus = 'NOT_READY' | 'PENDING_REVIEW' | 'PUBLISHED'
export type ClassTestResultMode = 'AUTO' | 'TEACHER_REVIEW'

export type ClassTestQuestionRef = {
  questionId: string
  marks: number
}

export type ClassTestRecord = {
  id: string
  teacherId: string
  teacherUserId: string
  departmentId: string
  subjectId: string
  languageId: string
  groupId: string
  academicYearId: string
  semesterId: string
  academicOfferingId: string | null
  testNumber: number
  title: string
  instructions: string | null
  duration: number
  totalMarks: number
  passingMarks: number
  startTime: string
  endTime: string
  resultMode: ClassTestResultMode
  questionsPerStudent: number
  questionPool: ClassTestQuestionRef[]
  status: ClassTestStatus
  createdAt: string
  updatedAt: string
}

export type ClassTestSnapshotOption = {
  id: string
  text: string
  orderIndex: number
  isCorrect: boolean
}

export type ClassTestSnapshotQuestion = {
  sourceQuestionId: string
  orderIndex: number
  marks: number
  type: string
  text: string
  expectedAnswer: string | null
  explanation: string | null
  options: ClassTestSnapshotOption[]
}

export type ClassTestAnswer = {
  questionId: string
  selectedOption: string | null
  answerText: string | null
  marksAwarded: number | null
  teacherMarks: number | null
  teacherFeedback: string | null
  isCorrect: boolean | null
  reviewed: boolean
  savedAt: string
}

export type ClassTestSecurityEvent = {
  type: 'TAB_SWITCH' | 'COPY' | 'SCREENSHOT' | 'DEVTOOLS'
  createdAt: string
}

export type ClassTestAttemptRecord = {
  id: string
  classTestId: string
  studentId: string
  studentUserId: string
  status: ClassTestAttemptStatus
  startedAt: string
  deadlineAt: string
  submittedAt: string | null
  snapshot: ClassTestSnapshotQuestion[]
  answers: ClassTestAnswer[]
  warningCount: number
  tabSwitchCount: number
  securityEvents: ClassTestSecurityEvent[]
  resultStatus: ClassTestResultStatus
  marksObtained: number | null
  percentage: number | null
  isPassed: boolean | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

const TESTS_COLLECTION = 'class_tests'
const ATTEMPTS_COLLECTION = 'class_test_attempts'

type RawFindResult = {
  cursor?: { firstBatch?: unknown[] }
}

let indexPromise: Promise<void> | null = null

function toJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonObject
}

function parseQuestionPool(value: unknown): ClassTestQuestionRef[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      if (typeof row.questionId !== 'string') return null
      return {
        questionId: row.questionId,
        marks: Number(row.marks ?? 1),
      }
    })
    .filter((value): value is ClassTestQuestionRef => Boolean(value))
}

function parseSnapshot(value: unknown): ClassTestSnapshotQuestion[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      if (typeof row.sourceQuestionId !== 'string') return null
      const options = Array.isArray(row.options)
        ? row.options
            .map((option) => {
              if (!option || typeof option !== 'object') return null
              const raw = option as Record<string, unknown>
              if (typeof raw.id !== 'string') return null
              return {
                id: raw.id,
                text: String(raw.text ?? ''),
                orderIndex: Number(raw.orderIndex ?? 0),
                isCorrect: Boolean(raw.isCorrect),
              }
            })
            .filter((option): option is ClassTestSnapshotOption => Boolean(option))
        : []

      return {
        sourceQuestionId: row.sourceQuestionId,
        orderIndex: Number(row.orderIndex ?? 0),
        marks: Number(row.marks ?? 1),
        type: String(row.type ?? 'WRITTEN_ANSWER'),
        text: String(row.text ?? ''),
        expectedAnswer: typeof row.expectedAnswer === 'string' ? row.expectedAnswer : null,
        explanation: typeof row.explanation === 'string' ? row.explanation : null,
        options,
      }
    })
    .filter((question): question is ClassTestSnapshotQuestion => Boolean(question))
}

function parseAnswers(value: unknown): ClassTestAnswer[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      if (typeof row.questionId !== 'string') return null
      return {
        questionId: row.questionId,
        selectedOption: typeof row.selectedOption === 'string' ? row.selectedOption : null,
        answerText: typeof row.answerText === 'string' ? row.answerText : null,
        marksAwarded: typeof row.marksAwarded === 'number' ? row.marksAwarded : null,
        teacherMarks: typeof row.teacherMarks === 'number' ? row.teacherMarks : null,
        teacherFeedback: typeof row.teacherFeedback === 'string' ? row.teacherFeedback : null,
        isCorrect: typeof row.isCorrect === 'boolean' ? row.isCorrect : null,
        reviewed: Boolean(row.reviewed),
        savedAt: String(row.savedAt ?? ''),
      }
    })
    .filter((answer): answer is ClassTestAnswer => Boolean(answer))
}

function parseSecurityEvents(value: unknown): ClassTestSecurityEvent[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const type = String(row.type ?? '') as ClassTestSecurityEvent['type']
      if (!['TAB_SWITCH', 'COPY', 'SCREENSHOT', 'DEVTOOLS'].includes(type)) return null
      return { type, createdAt: String(row.createdAt ?? '') }
    })
    .filter((event): event is ClassTestSecurityEvent => Boolean(event))
}

function asTest(value: unknown): ClassTestRecord | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const id = typeof row._id === 'string' ? row._id : typeof row.id === 'string' ? row.id : null
  if (!id) return null

  return {
    id,
    teacherId: String(row.teacherId ?? ''),
    teacherUserId: String(row.teacherUserId ?? ''),
    departmentId: String(row.departmentId ?? ''),
    subjectId: String(row.subjectId ?? ''),
    languageId: String(row.languageId ?? ''),
    groupId: String(row.groupId ?? ''),
    academicYearId: String(row.academicYearId ?? ''),
    semesterId: String(row.semesterId ?? ''),
    academicOfferingId: typeof row.academicOfferingId === 'string' ? row.academicOfferingId : null,
    testNumber: Number(row.testNumber ?? 1),
    title: String(row.title ?? ''),
    instructions: typeof row.instructions === 'string' ? row.instructions : null,
    duration: Number(row.duration ?? 10),
    totalMarks: Number(row.totalMarks ?? 0),
    passingMarks: Number(row.passingMarks ?? 0),
    startTime: String(row.startTime ?? ''),
    endTime: String(row.endTime ?? ''),
    resultMode: (row.resultMode ?? 'AUTO') as ClassTestResultMode,
    questionsPerStudent: Number(row.questionsPerStudent ?? 0),
    questionPool: parseQuestionPool(row.questionPool),
    status: (row.status ?? 'SCHEDULED') as ClassTestStatus,
    createdAt: String(row.createdAt ?? ''),
    updatedAt: String(row.updatedAt ?? ''),
  }
}

function asAttempt(value: unknown): ClassTestAttemptRecord | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const id = typeof row._id === 'string' ? row._id : typeof row.id === 'string' ? row.id : null
  if (!id) return null

  return {
    id,
    classTestId: String(row.classTestId ?? ''),
    studentId: String(row.studentId ?? ''),
    studentUserId: String(row.studentUserId ?? ''),
    status: (row.status ?? 'IN_PROGRESS') as ClassTestAttemptStatus,
    startedAt: String(row.startedAt ?? ''),
    deadlineAt: String(row.deadlineAt ?? ''),
    submittedAt: typeof row.submittedAt === 'string' ? row.submittedAt : null,
    snapshot: parseSnapshot(row.snapshot),
    answers: parseAnswers(row.answers),
    warningCount: Number(row.warningCount ?? 0),
    tabSwitchCount: Number(row.tabSwitchCount ?? 0),
    securityEvents: parseSecurityEvents(row.securityEvents),
    resultStatus: (row.resultStatus ?? 'NOT_READY') as ClassTestResultStatus,
    marksObtained: typeof row.marksObtained === 'number' ? row.marksObtained : null,
    percentage: typeof row.percentage === 'number' ? row.percentage : null,
    isPassed: typeof row.isPassed === 'boolean' ? row.isPassed : null,
    publishedAt: typeof row.publishedAt === 'string' ? row.publishedAt : null,
    createdAt: String(row.createdAt ?? ''),
    updatedAt: String(row.updatedAt ?? ''),
  }
}

async function ensureIndexes() {
  if (!indexPromise) {
    indexPromise = (async () => {
      try {
        await prisma.$runCommandRaw({
          createIndexes: TESTS_COLLECTION,
          indexes: [
            { key: { teacherUserId: 1, startTime: -1 }, name: 'class_test_teacher_start_idx' },
            { key: { groupId: 1, academicYearId: 1, semesterId: 1, startTime: -1 }, name: 'class_test_scope_start_idx' },
            { key: { sequenceKey: 1 }, name: 'class_test_sequence_unique_idx', unique: true },
          ],
        })
        await prisma.$runCommandRaw({
          createIndexes: ATTEMPTS_COLLECTION,
          indexes: [
            { key: { attemptKey: 1 }, name: 'class_test_attempt_unique_idx', unique: true },
            { key: { classTestId: 1, createdAt: -1 }, name: 'class_test_attempt_test_idx' },
            { key: { studentUserId: 1, createdAt: -1 }, name: 'class_test_attempt_student_idx' },
          ],
        })
      } catch (error) {
        console.warn('[ClassTest] Could not ensure MongoDB indexes:', error)
      }
    })()
  }
  await indexPromise
}

async function findTests(filter: Prisma.InputJsonObject, limit = 300) {
  await ensureIndexes()
  const result = (await prisma.$runCommandRaw({
    find: TESTS_COLLECTION,
    filter,
    sort: { startTime: -1 },
    limit,
  })) as unknown as RawFindResult
  return (result.cursor?.firstBatch ?? []).map(asTest).filter((value): value is ClassTestRecord => Boolean(value))
}

async function findAttempts(filter: Prisma.InputJsonObject, limit = 500) {
  await ensureIndexes()
  const result = (await prisma.$runCommandRaw({
    find: ATTEMPTS_COLLECTION,
    filter,
    sort: { createdAt: -1 },
    limit,
  })) as unknown as RawFindResult
  return (result.cursor?.firstBatch ?? []).map(asAttempt).filter((value): value is ClassTestAttemptRecord => Boolean(value))
}

export async function getClassTest(id: string) {
  return (await findTests(toJson({ _id: id }), 1))[0] ?? null
}

export async function listClassTestsByTeacher(teacherUserId: string) {
  return findTests(toJson({ teacherUserId }), 300)
}

export async function listClassTestsForScope(input: {
  groupId: string
  academicYearId: string
  semesterId: string
  languageId?: string | null
}) {
  return findTests(
    toJson({
      groupId: input.groupId,
      academicYearId: input.academicYearId,
      semesterId: input.semesterId,
      status: 'SCHEDULED',
      ...(input.languageId ? { languageId: input.languageId } : {}),
    }),
    300
  )
}

export async function getNextClassTestNumber(input: {
  teacherId: string
  subjectId: string
  groupId: string
  academicYearId: string
  semesterId: string
}) {
  const records = await findTests(
    toJson({
      teacherId: input.teacherId,
      subjectId: input.subjectId,
      groupId: input.groupId,
      academicYearId: input.academicYearId,
      semesterId: input.semesterId,
    }),
    300
  )
  return records.reduce((max, test) => Math.max(max, test.testNumber), 0) + 1
}

export async function createClassTest(input: Omit<ClassTestRecord, 'id' | 'createdAt' | 'updatedAt' | 'status'>) {
  await ensureIndexes()
  const now = new Date().toISOString()
  const record: ClassTestRecord = {
    ...input,
    id: randomUUID(),
    status: 'SCHEDULED',
    createdAt: now,
    updatedAt: now,
  }
  const sequenceKey = `${record.teacherId}:${record.subjectId}:${record.groupId}:${record.academicYearId}:${record.semesterId}:${record.testNumber}`

  await prisma.$runCommandRaw({
    insert: TESTS_COLLECTION,
    documents: [
      {
        _id: record.id,
        ...record,
        id: undefined,
        sequenceKey,
      },
    ],
  })
  return record
}

export async function cancelClassTest(id: string) {
  await ensureIndexes()
  await prisma.$runCommandRaw({
    update: TESTS_COLLECTION,
    updates: [
      {
        q: { _id: id },
        u: { $set: { status: 'CANCELLED', updatedAt: new Date().toISOString() } },
        multi: false,
        upsert: false,
      },
    ],
  })
  return getClassTest(id)
}

export async function getClassTestAttempt(classTestId: string, studentId: string) {
  return (await findAttempts(toJson({ classTestId, studentId }), 1))[0] ?? null
}

export async function getClassTestAttemptById(id: string) {
  return (await findAttempts(toJson({ _id: id }), 1))[0] ?? null
}

export async function listClassTestAttempts(classTestId: string) {
  return findAttempts(toJson({ classTestId }), 500)
}

export async function listClassTestAttemptsByStudent(studentUserId: string) {
  return findAttempts(toJson({ studentUserId }), 500)
}

export async function createClassTestAttempt(input: {
  classTestId: string
  studentId: string
  studentUserId: string
  deadlineAt: string
  snapshot: ClassTestSnapshotQuestion[]
}) {
  await ensureIndexes()
  const now = new Date().toISOString()
  const record: ClassTestAttemptRecord = {
    id: randomUUID(),
    classTestId: input.classTestId,
    studentId: input.studentId,
    studentUserId: input.studentUserId,
    status: 'IN_PROGRESS',
    startedAt: now,
    deadlineAt: input.deadlineAt,
    submittedAt: null,
    snapshot: input.snapshot,
    answers: [],
    warningCount: 0,
    tabSwitchCount: 0,
    securityEvents: [],
    resultStatus: 'NOT_READY',
    marksObtained: null,
    percentage: null,
    isPassed: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  }

  await prisma.$runCommandRaw({
    insert: ATTEMPTS_COLLECTION,
    documents: [
      {
        _id: record.id,
        ...record,
        id: undefined,
        attemptKey: `${input.classTestId}:${input.studentId}`,
      },
    ],
  })
  return record
}

export async function updateClassTestAttempt(
  id: string,
  patch: Partial<Omit<ClassTestAttemptRecord, 'id' | 'classTestId' | 'studentId' | 'studentUserId' | 'createdAt'>>
) {
  await ensureIndexes()
  await prisma.$runCommandRaw({
    update: ATTEMPTS_COLLECTION,
    updates: [
      {
        q: { _id: id },
        u: { $set: { ...patch, updatedAt: new Date().toISOString() } },
        multi: false,
        upsert: false,
      },
    ],
  })
  return getClassTestAttemptById(id)
}
