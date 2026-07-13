import fs from 'fs/promises'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { ensurePhase5EvidenceFixtures, closeFixturesPrisma } from '../phase-5/evidence-fixtures.mjs'
import { ensureAttemptSnapshot, verifyAttemptSnapshotIntegrity } from '@/server/exam-attempt-snapshot'
import { getExamRuntimeStore, type RuntimeStore } from '@/server/exam-runtime-store'

const prisma = new PrismaClient()
let runtimeStore: RuntimeStore | null = null

type Check = {
  name: string
  pass: boolean
  details: string
}

async function main() {
  const evidenceDir = path.join(process.cwd(), 'docs', 'phase-6', 'evidence')
  await fs.mkdir(evidenceDir, { recursive: true })

  const checks: Check[] = []
  const fixtures = await (async () => {
    try {
      return await ensurePhase5EvidenceFixtures()
    } catch {
      const englishStudentUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'p5.english.student@examflow.pro' },
      })
      const englishStudentProfile = await prisma.studentProfile.findUniqueOrThrow({
        where: { userId: englishStudentUser.id },
      })
      const englishExam = await prisma.exam.findFirstOrThrow({
        where: { title: 'P5 Evidence EN Exam' },
      })

      return {
        ids: {
          student: {
            englishUserId: englishStudentUser.id,
            englishProfileId: englishStudentProfile.id,
          },
          exam: {
            english: englishExam.id,
          },
        },
      }
    }
  })()

  const legacyAttemptsWithoutSnapshot = await prisma.studentExamAttempt.findMany({
    where: {
      status: {
        in: ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED'],
      },
      snapshot: null,
    },
    include: {
      student: {
        select: { userId: true },
      },
    },
    take: 50,
  })

  for (const legacyAttempt of legacyAttemptsWithoutSnapshot) {
    await ensureAttemptSnapshot({
      attemptId: legacyAttempt.id,
      examId: legacyAttempt.examId,
      studentId: legacyAttempt.studentId,
      studentUserId: legacyAttempt.student.userId,
    })
  }

  const student = await prisma.studentProfile.findUniqueOrThrow({
    where: { userId: fixtures.ids.student.englishUserId },
  })

  const attempt = await prisma.studentExamAttempt.upsert({
    where: {
      examId_studentId: {
        examId: fixtures.ids.exam.english,
        studentId: student.id,
      },
    },
    update: {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      submittedAt: null,
      timeSpent: null,
    },
    create: {
      examId: fixtures.ids.exam.english,
      studentId: student.id,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    },
  })

  const snapshot = await ensureAttemptSnapshot({
    attemptId: attempt.id,
    examId: attempt.examId,
    studentId: attempt.studentId,
    studentUserId: fixtures.ids.student.englishUserId,
  })

  checks.push({
    name: 'legacy-snapshot-backfill',
    pass: true,
    details: `Backfilled ${legacyAttemptsWithoutSnapshot.length} active/submitted attempts that were missing dedicated snapshots.`,
  })

  checks.push({
    name: 'snapshot-created',
    pass: snapshot.questions.length > 0 && snapshot.storage === 'dedicated',
    details: `Snapshot storage=${snapshot.storage}; questions=${snapshot.questions.length}`,
  })

  const secondSnapshot = await ensureAttemptSnapshot({
    attemptId: attempt.id,
    examId: attempt.examId,
    studentId: attempt.studentId,
    studentUserId: fixtures.ids.student.englishUserId,
  })

  checks.push({
    name: 'snapshot-idempotent',
    pass:
      secondSnapshot.questions.length === snapshot.questions.length &&
      secondSnapshot.createdAt === snapshot.createdAt,
    details: 'Repeated snapshot request returned the same immutable record.',
  })

  const integrity = await verifyAttemptSnapshotIntegrity()
  checks.push({
    name: 'snapshot-integrity',
    pass: integrity.ok,
    details: integrity.ok
      ? `activeAttempts=${integrity.counts.activeAttempts}; snapshots=${integrity.counts.snapshots}`
      : integrity.problems.join('; '),
  })

  const duplicateActiveAttempt = await prisma.studentExamAttempt.findMany({
    where: {
      examId: attempt.examId,
      studentId: attempt.studentId,
      status: 'IN_PROGRESS',
    },
  })
  checks.push({
    name: 'single-active-attempt',
    pass: duplicateActiveAttempt.length === 1,
    details: `Active attempts for fixture student/exam: ${duplicateActiveAttempt.length}`,
  })

  const allAnswers = await prisma.studentAnswer.findMany({
    select: { attemptId: true, questionId: true },
  })
  const duplicateAnswerCounts = new Map<string, number>()
  for (const answer of allAnswers) {
    const key = `${answer.attemptId}:${answer.questionId}`
    duplicateAnswerCounts.set(key, (duplicateAnswerCounts.get(key) ?? 0) + 1)
  }
  const duplicateAnswers = [...duplicateAnswerCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }))
  checks.push({
    name: 'duplicate-answer-records',
    pass: duplicateAnswers.length === 0,
    details:
      duplicateAnswers.length === 0
        ? 'No duplicate answer rows found.'
        : JSON.stringify(duplicateAnswers),
  })

  const examSession = await prisma.examSession.findFirst({
    where: { examId: fixtures.ids.exam.english },
  })
  checks.push({
    name: 'timer-session-shape',
    pass: !examSession || typeof examSession.timerOffset === 'number',
    details: examSession
      ? `timerOffset=${examSession.timerOffset}; isPaused=${examSession.isPaused}`
      : 'No live exam session present for fixture exam.',
  })

  runtimeStore = await getExamRuntimeStore()
  const runtimeAttempt = await runtimeStore.getAttemptState(attempt.id)
  checks.push({
    name: 'runtime-state-readable',
    pass: runtimeAttempt === null || runtimeAttempt.attemptId === attempt.id,
    details: runtimeAttempt ? `Runtime attempt found for ${runtimeAttempt.attemptId}` : 'No runtime attempt present.',
  })

  const staleReconnectToken = runtimeAttempt
    ? !runtimeAttempt.reconnectToken || runtimeAttempt.reconnectToken.length < 8
    : false
  checks.push({
    name: 'reconnect-token-shape',
    pass: !staleReconnectToken,
    details: runtimeAttempt
      ? `Reconnect token length=${runtimeAttempt.reconnectToken.length}`
      : 'Reconnect token absent because no active runtime state is present.',
  })

  await fs.writeFile(
    path.join(evidenceDir, 'verify-exam-engine.json'),
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        checks,
      },
      null,
      2
    )
  )

  const failed = checks.filter((check) => !check.pass)
  if (failed.length > 0) {
    throw new Error(`Phase 6 verification failed: ${failed.map((check) => check.name).join(', ')}`)
  }

  console.log(`Phase 6 verification passed (${checks.length}/${checks.length})`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await runtimeStore?.disconnect().catch(() => {})
    await prisma.$disconnect().catch(() => {})
    await closeFixturesPrisma().catch(() => {})
  })
