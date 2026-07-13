import fs from 'fs/promises'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { RedisMemoryServer } from 'redis-memory-server'
import { ensurePhase6EvidenceFixtures, closePhase6FixturesPrisma } from './evidence-fixtures.mjs'

type TestResult = {
  name: string
  pass: boolean
  details: string
}

const prisma = new PrismaClient()

async function resetAttemptArtifacts(attemptId: string, examId: string) {
  await prisma.notification.deleteMany({
    where: {
      link: {
        contains: attemptId,
      },
    },
  }).catch(() => {})
  await prisma.examResult.deleteMany({ where: { attemptId } })
  await prisma.activityLog.deleteMany({
    where: {
      examId,
      details: {
        contains: attemptId,
      },
    },
  }).catch(() => {})
}

async function createAttempt(input: {
  examId: string
  studentId: string
}) {
  return prisma.studentExamAttempt.upsert({
    where: {
      examId_studentId: {
        examId: input.examId,
        studentId: input.studentId,
      },
    },
    update: {
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 30_000),
      submittedAt: null,
      timeSpent: null,
      socketId: 'submit-test-socket',
    },
    create: {
      examId: input.examId,
      studentId: input.studentId,
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 30_000),
      socketId: 'submit-test-socket',
    },
  })
}

async function waitForResultRecord(attemptId: string, timeoutMs = 10_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const result = await prisma.examResult.findUnique({
      where: { attemptId },
    })
    if (result) {
      return result
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  return null
}

async function resolveFixtures() {
  try {
    return await ensurePhase6EvidenceFixtures()
  } catch {
    const manualExam = await prisma.exam.findFirstOrThrow({
      where: { title: 'P6 Evidence Manual Exam' },
    })
    const autoExam = await prisma.exam.findFirstOrThrow({
      where: { title: 'P6 Evidence Auto Exam' },
    })
    const loadExam = await prisma.exam.findFirstOrThrow({
      where: { title: 'P6 Evidence Load Exam' },
    })
    const englishStudentUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'p5.english.student@examflow.pro' },
    })
    const russianStudentUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'p5.russian.student@examflow.pro' },
    })
    const englishStudentProfile = await prisma.studentProfile.findUniqueOrThrow({
      where: { userId: englishStudentUser.id },
    })

    return {
      ids: {
        student: {
          englishUserId: englishStudentUser.id,
          russianUserId: russianStudentUser.id,
        },
        phase6: {
          manualExam: manualExam.id,
          autoExam: autoExam.id,
          loadExam: loadExam.id,
          englishStudentId: englishStudentProfile.id,
        },
      },
    }
  }
}

async function main() {
  const evidenceDir = path.join(process.cwd(), 'docs', 'phase-6', 'evidence')
  await fs.mkdir(evidenceDir, { recursive: true })

  const redisServer = new RedisMemoryServer()
  const results: TestResult[] = []

  try {
    await redisServer.start()
    const host = await redisServer.getHost()
    const port = await redisServer.getPort()
    process.env.REDIS_URL = `redis://${host}:${port}`
    process.env.REDIS_REQUIRED = 'true'

    const fixtures = await resolveFixtures()
    const { submitStudentAttempt } = await import('../../src/server/socket-server')

    await prisma.exam.update({
      where: { id: fixtures.ids.phase6.manualExam },
      data: { autoPublish: true },
    })

    const studentUser = await prisma.user.findUniqueOrThrow({
      where: { id: fixtures.ids.student.englishUserId },
      select: { id: true },
    })

    const singleAttempt = await createAttempt({
      examId: fixtures.ids.phase6.manualExam,
      studentId: fixtures.ids.phase6.englishStudentId,
    })
    await resetAttemptArtifacts(singleAttempt.id, fixtures.ids.phase6.manualExam)

    const singleSubmit = await submitStudentAttempt(
      singleAttempt.id,
      studentUser.id,
      'SUBMITTED'
    )
    const singleResult = await waitForResultRecord(singleAttempt.id)

    const singleAttemptAfter = await prisma.studentExamAttempt.findUniqueOrThrow({
      where: { id: singleAttempt.id },
    })

    results.push({
      name: 'single-submit-transition',
      pass:
        singleSubmit?.status === 'SUBMITTED' &&
        singleAttemptAfter.status === 'SUBMITTED' &&
        !!singleAttemptAfter.submittedAt &&
        !!singleResult,
      details: `status=${singleAttemptAfter.status}; result=${singleResult?.id ?? 'missing'}`,
    })

    const duplicateAttempt = await createAttempt({
      examId: fixtures.ids.phase6.loadExam,
      studentId: fixtures.ids.phase6.englishStudentId,
    })
    await resetAttemptArtifacts(duplicateAttempt.id, fixtures.ids.phase6.loadExam)
    await prisma.exam.update({
      where: { id: fixtures.ids.phase6.loadExam },
      data: { autoPublish: false },
    })

    const [parallelA, parallelB] = await Promise.all([
      submitStudentAttempt(duplicateAttempt.id, studentUser.id, 'SUBMITTED'),
      submitStudentAttempt(duplicateAttempt.id, studentUser.id, 'SUBMITTED'),
    ])
    const duplicateResultRecord = await waitForResultRecord(duplicateAttempt.id)

    const duplicateAttemptAfter = await prisma.studentExamAttempt.findUniqueOrThrow({
      where: { id: duplicateAttempt.id },
    })
    const duplicateLogs = await prisma.activityLog.count({
      where: {
        examId: fixtures.ids.phase6.loadExam,
        action: 'MANUAL_SUBMIT',
      },
    })
    const duplicateResults = duplicateResultRecord ? 1 : 0

    results.push({
      name: 'parallel-duplicate-submit-idempotent',
      pass:
        parallelA?.status === 'SUBMITTED' &&
        parallelB?.status === 'SUBMITTED' &&
        duplicateAttemptAfter.status === 'SUBMITTED' &&
        duplicateLogs === 1 &&
        duplicateResults === 1,
      details: `logs=${duplicateLogs}; results=${duplicateResults}; status=${duplicateAttemptAfter.status}`,
    })

    const duplicateResubmit = await submitStudentAttempt(
      duplicateAttempt.id,
      studentUser.id,
      'SUBMITTED'
    )
    const duplicateLogsAfterResubmit = await prisma.activityLog.count({
      where: {
        examId: fixtures.ids.phase6.loadExam,
        action: 'MANUAL_SUBMIT',
      },
    })

    results.push({
      name: 'repeat-submit-no-extra-side-effects',
      pass: duplicateResubmit?.status === 'SUBMITTED' && duplicateLogsAfterResubmit === 1,
      details: `logs=${duplicateLogsAfterResubmit}; status=${duplicateResubmit?.status ?? 'missing'}`,
    })

    const autoAttempt = await createAttempt({
      examId: fixtures.ids.phase6.autoExam,
      studentId: fixtures.ids.phase6.englishStudentId,
    })
    await resetAttemptArtifacts(autoAttempt.id, fixtures.ids.phase6.autoExam)
    await submitStudentAttempt(autoAttempt.id, studentUser.id, 'AUTO_SUBMITTED')
    const manualAfterAuto = await submitStudentAttempt(autoAttempt.id, studentUser.id, 'SUBMITTED')
    const autoSubmitLogs = await prisma.activityLog.count({
      where: {
        examId: fixtures.ids.phase6.autoExam,
        action: 'AUTO_SUBMIT',
      },
    })
    const manualSubmitLogsAfterAuto = await prisma.activityLog.count({
      where: {
        examId: fixtures.ids.phase6.autoExam,
        action: 'MANUAL_SUBMIT',
      },
    })

    results.push({
      name: 'manual-submit-after-auto-submit-stays-idempotent',
      pass:
        manualAfterAuto?.status === 'AUTO_SUBMITTED' &&
        autoSubmitLogs === 1 &&
        manualSubmitLogsAfterAuto === 0,
      details: `returned=${manualAfterAuto?.status ?? 'missing'}; autoLogs=${autoSubmitLogs}; manualLogs=${manualSubmitLogsAfterAuto}`,
    })

    const unauthorizedUser = await prisma.user.findUniqueOrThrow({
      where: { id: fixtures.ids.student.russianUserId },
      select: { id: true },
    })

    let unauthorizedMessage = ''
    try {
      await submitStudentAttempt(duplicateAttempt.id, unauthorizedUser.id, 'SUBMITTED')
    } catch (error) {
      unauthorizedMessage = error instanceof Error ? error.message : String(error)
    }

    results.push({
      name: 'submit-ownership-enforced',
      pass: unauthorizedMessage === 'Unauthorized',
      details: unauthorizedMessage || 'missing error',
    })
  } finally {
    await redisServer.stop().catch(() => {})
    await prisma.$disconnect().catch(() => {})
    await closePhase6FixturesPrisma().catch(() => {})
  }

  await fs.writeFile(
    path.join(evidenceDir, 'submit-path-tests.json'),
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        results,
      },
      null,
      2
    )
  )

  const failed = results.filter((result) => !result.pass)
  if (failed.length > 0) {
    throw new Error(
      `Phase 6 submit-path tests failed: ${failed.map((result) => result.name).join(', ')}`
    )
  }

  console.log(`Phase 6 submit-path tests passed (${results.length}/${results.length})`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
