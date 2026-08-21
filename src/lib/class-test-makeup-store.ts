import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export type ClassTestMakeupStatus = 'ACTIVE' | 'CANCELLED'

export type ClassTestMakeupRecord = {
  id: string
  classTestId: string
  studentId: string
  studentUserId: string
  studentEmail: string
  assignedByUserId: string
  startTime: string
  endTime: string
  status: ClassTestMakeupStatus
  createdAt: string
  updatedAt: string
}

const COLLECTION = 'class_test_makeup_assignments'

type RawFindResult = {
  cursor?: { firstBatch?: unknown[] }
}

let indexPromise: Promise<void> | null = null

function asRecord(value: unknown): ClassTestMakeupRecord | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const id = typeof row._id === 'string' ? row._id : typeof row.id === 'string' ? row.id : null
  if (!id) return null

  return {
    id,
    classTestId: String(row.classTestId ?? ''),
    studentId: String(row.studentId ?? ''),
    studentUserId: String(row.studentUserId ?? ''),
    studentEmail: String(row.studentEmail ?? ''),
    assignedByUserId: String(row.assignedByUserId ?? ''),
    startTime: String(row.startTime ?? ''),
    endTime: String(row.endTime ?? ''),
    status: (row.status ?? 'ACTIVE') as ClassTestMakeupStatus,
    createdAt: String(row.createdAt ?? ''),
    updatedAt: String(row.updatedAt ?? ''),
  }
}

async function ensureIndexes() {
  if (!indexPromise) {
    indexPromise = (async () => {
      try {
        await prisma.$runCommandRaw({
          createIndexes: COLLECTION,
          indexes: [
            { key: { makeupKey: 1 }, name: 'class_test_makeup_unique_idx', unique: true },
            { key: { classTestId: 1, status: 1, createdAt: -1 }, name: 'class_test_makeup_test_idx' },
            { key: { studentUserId: 1, status: 1, startTime: -1 }, name: 'class_test_makeup_student_idx' },
          ],
        })
      } catch (error) {
        console.warn('[ClassTestMakeup] Could not ensure MongoDB indexes:', error)
      }
    })()
  }
  await indexPromise
}

async function findRecords(filter: Prisma.InputJsonObject, limit = 300) {
  await ensureIndexes()
  const result = (await prisma.$runCommandRaw({
    find: COLLECTION,
    filter,
    sort: { startTime: -1 },
    limit,
  })) as unknown as RawFindResult

  return (result.cursor?.firstBatch ?? [])
    .map(asRecord)
    .filter((record): record is ClassTestMakeupRecord => Boolean(record))
}

export async function getClassTestMakeup(classTestId: string, studentId: string) {
  const records = await findRecords(
    { classTestId, studentId, status: 'ACTIVE' } as Prisma.InputJsonObject,
    1
  )
  return records[0] ?? null
}

export async function listClassTestMakeups(classTestId: string) {
  return findRecords({ classTestId, status: 'ACTIVE' } as Prisma.InputJsonObject, 500)
}

export async function listClassTestMakeupsByStudent(studentUserId: string) {
  return findRecords({ studentUserId, status: 'ACTIVE' } as Prisma.InputJsonObject, 500)
}

export async function upsertClassTestMakeup(input: {
  classTestId: string
  studentId: string
  studentUserId: string
  studentEmail: string
  assignedByUserId: string
  startTime: string
  endTime: string
}) {
  await ensureIndexes()
  const now = new Date().toISOString()
  const id = randomUUID()
  const makeupKey = `${input.classTestId}:${input.studentId}`

  await prisma.$runCommandRaw({
    update: COLLECTION,
    updates: [
      {
        q: { makeupKey },
        u: {
          $set: {
            classTestId: input.classTestId,
            studentId: input.studentId,
            studentUserId: input.studentUserId,
            studentEmail: input.studentEmail,
            assignedByUserId: input.assignedByUserId,
            startTime: input.startTime,
            endTime: input.endTime,
            status: 'ACTIVE',
            updatedAt: now,
          },
          $setOnInsert: {
            _id: id,
            makeupKey,
            createdAt: now,
          },
        },
        multi: false,
        upsert: true,
      },
    ],
  })

  return getClassTestMakeup(input.classTestId, input.studentId)
}
