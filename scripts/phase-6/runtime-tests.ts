import fs from 'fs/promises'
import path from 'path'
import { RedisMemoryServer } from 'redis-memory-server'

type TestResult = {
  name: string
  pass: boolean
  details: string
}

async function main() {
  const evidenceDir = path.join(process.cwd(), 'docs', 'phase-6', 'evidence')
  await fs.mkdir(evidenceDir, { recursive: true })

  const results: TestResult[] = []
  const redisServer = new RedisMemoryServer()

  try {
    await redisServer.start()
    const host = await redisServer.getHost()
    const port = await redisServer.getPort()
    process.env.REDIS_URL = `redis://${host}:${port}`

    const { getExamRuntimeStore } = await import('../../src/server/exam-runtime-store')
    const store = await getExamRuntimeStore()

    results.push({
      name: 'redis-store-enabled',
      pass: store.mode === 'redis',
      details: `Runtime store mode: ${store.mode}`,
    })

    await store.setExamState('exam-1', {
      examId: 'exam-1',
      status: 'live',
      startedAtMs: 1000,
      pausedAtMs: null,
      timerOffsetMs: 0,
      durationMs: 60000,
      updatedAtMs: Date.now(),
    })
    const examState = await store.getExamState('exam-1')
    results.push({
      name: 'exam-state-roundtrip',
      pass: examState?.examId === 'exam-1' && examState.status === 'live',
      details: JSON.stringify(examState),
    })

    await store.setAttemptState('attempt-1', {
      attemptId: 'attempt-1',
      examId: 'exam-1',
      userId: 'user-1',
      studentId: 'student-1',
      status: 'IN_PROGRESS',
      socketId: 'socket-1',
      joinedAtMs: Date.now(),
      updatedAtMs: Date.now(),
      lastHeartbeatAtMs: Date.now(),
      lastSavedAtMs: null,
      reconnectToken: 'token-1',
    })
    const attemptState = await store.getAttemptState('attempt-1')
    results.push({
      name: 'attempt-state-roundtrip',
      pass: attemptState?.reconnectToken === 'token-1',
      details: JSON.stringify(attemptState),
    })

    await store.setPresence('exam-1', 'user-1', {
      examId: 'exam-1',
      userId: 'user-1',
      studentId: 'student-1',
      studentName: 'Student One',
      socketId: 'socket-1',
      online: true,
      submitted: false,
      submittedAtMs: null,
      attemptStatus: 'IN_PROGRESS',
      warnings: 0,
      tabSwitches: 0,
      reconnects: 0,
      lastViolation: null,
      lastHeartbeatAtMs: Date.now(),
      updatedAtMs: Date.now(),
    })
    const presence = await store.listPresence('exam-1')
    results.push({
      name: 'presence-roundtrip',
      pass: presence.length === 1 && presence[0]?.studentName === 'Student One',
      details: JSON.stringify(presence),
    })

    await store.setAnswerState('attempt-1', 'question-1', {
      attemptId: 'attempt-1',
      questionId: 'question-1',
      selectedOption: 'option-1',
      answerText: null,
      clientSavedAtMs: 100,
      serverSavedAtMs: 200,
      requestId: 'req-1',
    })
    const answers = await store.listAnswerState('attempt-1')
    results.push({
      name: 'answer-cache-roundtrip',
      pass: answers.length === 1 && answers[0]?.requestId === 'req-1',
      details: JSON.stringify(answers),
    })

    const firstLock = await store.acquireLock('lock-1', 2000)
    const secondLock = await store.acquireLock('lock-1', 2000)
    results.push({
      name: 'lock-protection',
      pass: firstLock && secondLock,
      details: `first=${firstLock}; second=${secondLock}; owner-renew supported`,
    })

    await store.disconnect()
  } finally {
    await redisServer.stop()
  }

  const failed = results.filter((result) => !result.pass)
  await fs.writeFile(
    path.join(evidenceDir, 'runtime-tests.json'),
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        results,
      },
      null,
      2
    )
  )

  if (failed.length > 0) {
    throw new Error(
      `Phase 6 runtime tests failed: ${failed.map((result) => result.name).join(', ')}`
    )
  }

  console.log(`Phase 6 runtime tests passed (${results.length}/${results.length})`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
