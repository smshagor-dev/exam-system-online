import { randomUUID } from 'node:crypto'
import { prisma } from './prisma'

export type ReExamRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
export type ReExamRequestSource = 'STUDENT_REQUEST' | 'TEACHER_MANUAL'
export type ReExamType = 'RETAKE' | 'SUPPLEMENTARY' | 'IMPROVEMENT' | 'BACKLOG'

export type ReExamRecord = {
  id: string
  originalExamId: string
  reExamId: string | null
  studentId: string
  studentUserId: string
  teacherId: string
  teacherUserId: string
  reason: string
  type: ReExamType
  source: ReExamRequestSource
  status: ReExamRequestStatus
  teacherResponse: string | null
  requestedAt: string
  decidedAt: string | null
  createdAt: string
  updatedAt: string
}

const COLLECTION = 're_exam_requests'
const VISIBILITY_CACHE_TTL_MS = 15_000

type RawFindResult = {
  cursor?: {
    firstBatch?: unknown[]
  }
}

let indexPromise: Promise<void> | null = null
let visibilityCache:
  | {
      expiresAt: number
      records: ReExamRecord[]
    }
  | null = null

function asRecord(value: unknown): ReExamRecord | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const id = typeof raw._id === 'string' ? raw._id : typeof raw.id === 'string' ? raw.id : null
  if (!id) return null

  return {
    id,
    originalExamId: String(raw.originalExamId ?? ''),
    reExamId: typeof raw.reExamId === 'string' ? raw.reExamId : null,
    studentId: String(raw.studentId ?? ''),
    studentUserId: String(raw.studentUserId ?? ''),
    teacherId: String(raw.teacherId ?? ''),
    teacherUserId: String(raw.teacherUserId ?? ''),
    reason: String(raw.reason ?? ''),
    type: (raw.type ?? 'RETAKE') as ReExamType,
    source: (raw.source ?? 'STUDENT_REQUEST') as ReExamRequestSource,
    status: (raw.status ?? 'PENDING') as ReExamRequestStatus,
    teacherResponse: typeof raw.teacherResponse === 'string' ? raw.teacherResponse : null,
    requestedAt: String(raw.requestedAt ?? ''),
    decidedAt: typeof raw.decidedAt === 'string' ? raw.decidedAt : null,
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  }
}

async function ensureIndexes() {
  if (!indexPromise) {
    indexPromise = (async () => {
      try {
        await prisma.$runCommandRaw({
          createIndexes: COLLECTION,
          indexes: [
            {
              key: { studentUserId: 1, status: 1, createdAt: -1 },
              name: 'reexam_student_status_created_idx',
            },
            {
              key: { teacherUserId: 1, status: 1, createdAt: -1 },
              name: 'reexam_teacher_status_created_idx',
            },
            {
              key: { originalExamId: 1, studentId: 1, status: 1 },
              name: 'reexam_original_student_status_idx',
            },
            {
              key: { reExamId: 1 },
              name: 'reexam_exam_idx',
              sparse: true,
            },
          ],
        })
      } catch (error) {
        // Reads/writes still work without secondary indexes; do not make the request flow unavailable.
        console.warn('[ReExam] Could not ensure MongoDB indexes:', error)
      }
    })()
  }

  await indexPromise
}

async function findRecords(
  filter: Record<string, unknown>,
  options: { limit?: number; sort?: Record<string, 1 | -1> } = {}
) {
  await ensureIndexes()
  const result = (await prisma.$runCommandRaw({
    find: COLLECTION,
    filter,
    sort: options.sort ?? { createdAt: -1 },
    limit: options.limit ?? 200,
  })) as unknown as RawFindResult

  const rows = result.cursor?.firstBatch ?? []
  return rows.map(asRecord).filter((record): record is ReExamRecord => Boolean(record))
}

export function invalidateReExamStoreCache() {
  visibilityCache = null
}

export async function getReExamRecord(id: string) {
  const records = await findRecords({ _id: id }, { limit: 1 })
  return records[0] ?? null
}

export async function listReExamRequestsByStudent(studentUserId: string) {
  return findRecords({ studentUserId }, { limit: 100 })
}

export async function listReExamRequestsByTeacher(teacherUserId: string) {
  return findRecords({ teacherUserId }, { limit: 200 })
}

export async function findActiveReExamRequest(originalExamId: string, studentId: string) {
  const records = await findRecords(
    {
      originalExamId,
      studentId,
      status: { $in: ['PENDING', 'APPROVED'] },
    },
    { limit: 1 }
  )
  return records[0] ?? null
}

export async function getReExamTargetForExam(reExamId: string) {
  const records = await findRecords(
    {
      reExamId,
      status: 'APPROVED',
    },
    { limit: 1 }
  )
  return records[0] ?? null
}

async function getApprovedReExamRecords() {
  if (visibilityCache && visibilityCache.expiresAt > Date.now()) {
    return visibilityCache.records
  }

  const records = await findRecords(
    {
      status: 'APPROVED',
      reExamId: { $type: 'string' },
    },
    { limit: 5000 }
  )

  visibilityCache = {
    expiresAt: Date.now() + VISIBILITY_CACHE_TTL_MS,
    records,
  }

  return records
}

export async function getReExamVisibilityForStudent(studentUserId: string) {
  const records = await getApprovedReExamRecords()
  const allReExamIds: string[] = []
  const studentReExamIds: string[] = []
  const studentRecords: ReExamRecord[] = []

  for (const record of records) {
    if (!record.reExamId) continue
    allReExamIds.push(record.reExamId)
    if (record.studentUserId === studentUserId) {
      studentReExamIds.push(record.reExamId)
      studentRecords.push(record)
    }
  }

  return { allReExamIds, studentReExamIds, studentRecords }
}

export async function createReExamRecord(input: {
  originalExamId: string
  reExamId?: string | null
  studentId: string
  studentUserId: string
  teacherId: string
  teacherUserId: string
  reason: string
  type: ReExamType
  source: ReExamRequestSource
  status: ReExamRequestStatus
  teacherResponse?: string | null
  decidedAt?: string | null
}) {
  await ensureIndexes()
  const now = new Date().toISOString()
  const record: ReExamRecord = {
    id: randomUUID(),
    originalExamId: input.originalExamId,
    reExamId: input.reExamId ?? null,
    studentId: input.studentId,
    studentUserId: input.studentUserId,
    teacherId: input.teacherId,
    teacherUserId: input.teacherUserId,
    reason: input.reason,
    type: input.type,
    source: input.source,
    status: input.status,
    teacherResponse: input.teacherResponse ?? null,
    requestedAt: now,
    decidedAt: input.decidedAt ?? null,
    createdAt: now,
    updatedAt: now,
  }

  await prisma.$runCommandRaw({
    insert: COLLECTION,
    documents: [
      {
        _id: record.id,
        originalExamId: record.originalExamId,
        reExamId: record.reExamId,
        studentId: record.studentId,
        studentUserId: record.studentUserId,
        teacherId: record.teacherId,
        teacherUserId: record.teacherUserId,
        reason: record.reason,
        type: record.type,
        source: record.source,
        status: record.status,
        teacherResponse: record.teacherResponse,
        requestedAt: record.requestedAt,
        decidedAt: record.decidedAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    ],
  })

  invalidateReExamStoreCache()
  return record
}

export async function updateReExamRecord(
  id: string,
  patch: Partial<
    Pick<
      ReExamRecord,
      'reExamId' | 'status' | 'teacherResponse' | 'decidedAt' | 'reason' | 'type' | 'source'
    >
  >
) {
  await ensureIndexes()
  const set = {
    ...patch,
    updatedAt: new Date().toISOString(),
  }

  await prisma.$runCommandRaw({
    update: COLLECTION,
    updates: [
      {
        q: { _id: id },
        u: { $set: set },
        multi: false,
        upsert: false,
      },
    ],
  })

  invalidateReExamStoreCache()
  return getReExamRecord(id)
}
