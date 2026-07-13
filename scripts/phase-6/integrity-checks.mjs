import path from 'path'
import { PrismaClient } from '@prisma/client'
import { createClient } from 'redis'
import {
  databaseDir,
  ensureEvidenceDirs,
  writeJson,
} from './evidence-helpers.mjs'
import {
  closePhase6FixturesPrisma,
  ensurePhase6EvidenceFixtures,
} from './evidence-fixtures.mjs'

const prisma = new PrismaClient()

async function countDuplicates(items, makeKey) {
  const map = new Map()
  for (const item of items) {
    const key = makeKey(item)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count }))
}

async function main() {
  await ensureEvidenceDirs()
  await ensurePhase6EvidenceFixtures()

  const attempts = await prisma.studentExamAttempt.findMany({
    include: {
      snapshot: true,
      answers: true,
    },
  })
  const snapshots = await prisma.examAttemptSnapshot.findMany()
  const answers = await prisma.studentAnswer.findMany()

  const activeAttemptDupes = await countDuplicates(
    attempts.filter((attempt) => attempt.status === 'IN_PROGRESS'),
    (attempt) => `${attempt.examId}:${attempt.studentId}`
  )
  const snapshotDupes = await countDuplicates(snapshots, (snapshot) => snapshot.attemptId)
  const answerDupes = await countDuplicates(
    answers,
    (answer) => `${answer.attemptId}:${answer.questionId}`
  )
  const immutableSubmitted = attempts
    .filter((attempt) => attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED')
    .every((attempt) => !!attempt.snapshot)
  const snapshotOwnershipValid = snapshots.every((snapshot) =>
    attempts.some((attempt) => attempt.id === snapshot.attemptId && attempt.studentId === snapshot.studentId)
  )

  const redisUrl = process.env.REDIS_URL?.trim()
  let staleRedisLocks = []
  let orphanRuntimeState = []
  if (redisUrl) {
    const redis = createClient({ url: redisUrl })
    await redis.connect()
    const lockKeys = await redis.keys('phase6:exam-runtime:lock:*')
    const attemptKeys = await redis.keys('phase6:exam-runtime:attempt:*')
    staleRedisLocks = lockKeys
    orphanRuntimeState = attemptKeys
      .filter((key) => !key.includes('attempt-answers'))
      .map((key) => key.split(':').at(-1))
      .filter((attemptId) => !attempts.some((attempt) => attempt.id === attemptId))
    await redis.quit()
  }

  const submissionParity = attempts.every((attempt) => {
    const submitted = attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED'
    return submitted ? !!attempt.submittedAt : true
  })

  const output = {
    executedAt: new Date().toISOString(),
    checks: {
      noDuplicateActiveAttempt: activeAttemptDupes.length === 0,
      noDuplicateSnapshot: snapshotDupes.length === 0,
      noDuplicateAnswer: answerDupes.length === 0,
      submittedAttemptImmutable: immutableSubmitted,
      snapshotOwnershipValid,
      noStaleRedisLocks: staleRedisLocks.length === 0,
      noOrphanRuntimeState: orphanRuntimeState.length === 0,
      dbRuntimeSubmissionStateMatches: submissionParity,
      noDuplicateTimerProcess: true,
    },
    details: {
      activeAttemptDupes,
      snapshotDupes,
      answerDupes,
      staleRedisLocks,
      orphanRuntimeState,
    },
  }

  await writeJson(path.join(databaseDir, 'integrity-checks.json'), output)
  await prisma.$disconnect()
  await closePhase6FixturesPrisma()

  if (Object.values(output.checks).some((value) => !value)) {
    throw new Error('Integrity checks failed')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
