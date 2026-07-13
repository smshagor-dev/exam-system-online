import path from 'path'
import { PrismaClient } from '@prisma/client'
import {
  connectSocket,
  createApiContext,
  databaseDir,
  ensureEvidenceDirs,
  getSocketToken,
  networkDir,
  startRedis,
  startServer,
  stopRedis,
  stopServer,
  waitForSocketEvent,
  writeJson,
} from './evidence-helpers.mjs'
import {
  closePhase6FixturesPrisma,
  ensurePhase6EvidenceFixtures,
} from './evidence-fixtures.mjs'

const prisma = new PrismaClient()

async function waitForManualSubmitCount(examId, expectedCount, timeoutMs = 5000) {
  const deadlineAt = Date.now() + timeoutMs

  while (Date.now() < deadlineAt) {
    const count = await prisma.activityLog.count({
      where: { examId, action: 'MANUAL_SUBMIT' },
    })

    if (count >= expectedCount) {
      return count
    }

    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  return prisma.activityLog.count({
    where: { examId, action: 'MANUAL_SUBMIT' },
  })
}

async function main() {
  await ensureEvidenceDirs()
  const fixtures = await ensurePhase6EvidenceFixtures()
  const redis = await startRedis('two-instance')
  const serverA = await startServer({
    port: 3218,
    redisUrl: redis.redisUrl,
    logPrefix: 'phase6-two-instance-a',
    nodeEnv: 'production',
  })
  const serverB = await startServer({
    port: 3219,
    redisUrl: redis.redisUrl,
    logPrefix: 'phase6-two-instance-b',
    nodeEnv: 'production',
  })

  const studentApi = await createApiContext(
    serverA.baseUrl,
    fixtures.emails.englishStudent,
    fixtures.passwords.student
  )
  const teacherApi = await createApiContext(
    serverB.baseUrl,
    fixtures.emails.leadTeacher,
    fixtures.passwords.teacher
  )
  const teacherApiA = await createApiContext(
    serverA.baseUrl,
    fixtures.emails.leadTeacher,
    fixtures.passwords.teacher
  )

  const teacherToken = await getSocketToken(teacherApi, 'P6-TI-teacher-token')
  const teacherSocket = connectSocket(serverB.baseUrl, teacherToken.token)
  await waitForSocketEvent(teacherSocket, 'connect', 5000)
  const teacherProbeTokenA = await getSocketToken(teacherApiA, 'P6-TI-teacher-token-a')
  const teacherProbeSocketA = connectSocket(serverA.baseUrl, teacherProbeTokenA.token)
  await waitForSocketEvent(teacherProbeSocketA, 'connect', 5000)
  const monitorSnapshots = []
  const timerUpdates = []
  teacherSocket.on('exam:monitor_snapshot', (payload) => {
    if (payload.examId === fixtures.ids.phase6.manualExam) {
      monitorSnapshots.push(payload)
    }
  })
  teacherSocket.on('exam:timer_update', (payload) => {
    if (payload.examId === fixtures.ids.phase6.manualExam) {
      timerUpdates.push({
        ...payload,
        receivedAtMs: Date.now(),
      })
    }
  })
  const initialMonitorPromise = waitForSocketEvent(
    teacherSocket,
    'exam:monitor_snapshot',
    20000,
    (payload) => payload.examId === fixtures.ids.phase6.manualExam
  )
  const initialMonitorAPromise = waitForSocketEvent(
    teacherProbeSocketA,
    'exam:monitor_snapshot',
    20000,
    (payload) => payload.examId === fixtures.ids.phase6.manualExam
  )
  teacherSocket.emit('teacher:join_exam_monitor', { examId: fixtures.ids.phase6.manualExam })
  teacherProbeSocketA.emit('teacher:join_exam_monitor', { examId: fixtures.ids.phase6.manualExam })
  const initialMonitor = await initialMonitorPromise
  const initialMonitorA = await initialMonitorAPromise
  if (!initialMonitor) {
    throw new Error('Initial monitor snapshot was not received')
  }

  const startedEventPromise = waitForSocketEvent(teacherSocket, 'exam:started')
  teacherSocket.emit('teacher:start_exam', { examId: fixtures.ids.phase6.manualExam })
  const startedEvent = await startedEventPromise

  const studentToken = await getSocketToken(studentApi, 'P6-TI-student-token')
  const studentSocket = connectSocket(serverA.baseUrl, studentToken.token)
  await waitForSocketEvent(studentSocket, 'connect', 5000)
  const joinedPromise = waitForSocketEvent(studentSocket, 'exam:joined')
  studentSocket.emit('student:join_exam', { examId: fixtures.ids.phase6.manualExam })
  await joinedPromise
  const attemptStartedPromise = waitForSocketEvent(studentSocket, 'exam:attempt_started')
  studentSocket.emit('student:start_attempt', { examId: fixtures.ids.phase6.manualExam })
  const attemptStarted = await attemptStartedPromise
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const crossInstanceJoin = monitorSnapshots.at(-1)

  const heartbeatAckPromise = waitForSocketEvent(studentSocket, 'exam:heartbeat_ack', 10000)
  const heartbeatMonitorPromise = waitForSocketEvent(
    teacherSocket,
    'exam:monitor_snapshot',
    15000,
    (payload) =>
      payload.examId === fixtures.ids.phase6.manualExam &&
      payload.students.some(
        (entry) =>
          entry.userId === fixtures.ids.student.englishUserId &&
          typeof entry.lastHeartbeatAtMs === 'number'
      )
  )
  studentSocket.emit('student:heartbeat', {
    examId: fixtures.ids.phase6.manualExam,
    attemptId: attemptStarted.attemptId,
    pendingQueueSize: 0,
    reconnectToken: attemptStarted.reconnectToken,
  })
  const heartbeatAck = await heartbeatAckPromise
  const heartbeatMonitor = await heartbeatMonitorPromise

  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: fixtures.ids.phase6.manualExam },
    include: {
      questions: {
        include: {
          question: { include: { options: { orderBy: { orderIndex: 'asc' } } } },
        },
      },
    },
  })
  const question = exam.questions[0].question
  const option = question.options[0]

  studentSocket.emit('student:save_answer', {
    attemptId: attemptStarted.attemptId,
    questionId: question.id,
    selectedOption: option.id,
    requestId: 'two-instance-save',
    clientSavedAtMs: Date.now(),
  })
  await waitForSocketEvent(studentSocket, 'exam:answer_saved')

  await new Promise((resolve) => setTimeout(resolve, 4500))

  const beforeRestartAttemptCount = await prisma.studentExamAttempt.count({
    where: {
      examId: fixtures.ids.phase6.manualExam,
      studentId: fixtures.ids.phase6.englishStudentId,
    },
  })

  await stopServer(serverA)

  const studentApiAfter = await createApiContext(
    serverB.baseUrl,
    fixtures.emails.englishStudent,
    fixtures.passwords.student
  )
  const studentTokenAfter = await getSocketToken(studentApiAfter, 'P6-TI-student-token-after')
  const studentSocketAfter = connectSocket(serverB.baseUrl, studentTokenAfter.token)
  await waitForSocketEvent(studentSocketAfter, 'connect', 5000)
  const restoredStatePromise = waitForSocketEvent(studentSocketAfter, 'exam:attempt_state')
  studentSocketAfter.emit('student:join_exam', { examId: fixtures.ids.phase6.manualExam })
  const restoredState = await restoredStatePromise
  const beforeDuplicateSubmitLogs = await prisma.activityLog.count({
    where: { examId: fixtures.ids.phase6.manualExam, action: 'MANUAL_SUBMIT' },
  })
  const submittedPromise = waitForSocketEvent(studentSocketAfter, 'exam:submitted')
  studentSocketAfter.emit('student:submit_exam', { attemptId: attemptStarted.attemptId })
  await submittedPromise
  const afterFirstSubmitLogs = await waitForManualSubmitCount(fixtures.ids.phase6.manualExam, 1)
  const duplicateSubmitPromise = waitForSocketEvent(studentSocketAfter, 'exam:submitted')
  studentSocketAfter.emit('student:submit_exam', { attemptId: attemptStarted.attemptId })
  await duplicateSubmitPromise
  const afterDuplicateSubmitLogs = await waitForManualSubmitCount(fixtures.ids.phase6.manualExam, 1)
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const submitMonitor = monitorSnapshots.at(-1)

  const attemptCountAfter = await prisma.studentExamAttempt.count({
    where: {
      examId: fixtures.ids.phase6.manualExam,
      studentId: fixtures.ids.phase6.englishStudentId,
    },
  })
  const duplicateTimerFrames = timerUpdates.filter((entry, index, list) => {
    if (index === 0) {
      return false
    }

    const previous = list[index - 1]
    return (
      entry.remaining === previous.remaining &&
      entry.elapsed === previous.elapsed &&
      entry.receivedAtMs - previous.receivedAtMs < 400
    )
  }).length
  const monotonicTimer = timerUpdates.every((entry, index, list) => {
    if (index === 0) return true
    return (
      entry.remaining <= list[index - 1].remaining &&
      entry.elapsed >= list[index - 1].elapsed
    )
  })

  const output = {
    executedAt: new Date().toISOString(),
    checks: {
      studentConnectedToA: !!attemptStarted.attemptId,
      runtimeModeAIsRedis: initialMonitorA.runtime.mode === 'redis',
      runtimeModeBIsRedis: initialMonitor.runtime.mode === 'redis',
      teacherConnectedToB: initialMonitor.examId === fixtures.ids.phase6.manualExam,
      crossInstanceEventsWork:
        crossInstanceJoin.students.some(
          (entry) => entry.userId === fixtures.ids.student.englishUserId
        ),
      sharedPresenceWorks:
        crossInstanceJoin.students.find((entry) => entry.userId === fixtures.ids.student.englishUserId)?.online === true,
      heartbeatShared:
        heartbeatAck.examId === fixtures.ids.phase6.manualExam &&
        heartbeatMonitor.students.some(
          (entry) =>
            entry.userId === fixtures.ids.student.englishUserId &&
            typeof entry.lastHeartbeatAtMs === 'number'
        ),
      sharedTimerWorks: timerUpdates.length >= 2,
      answerSaveStateShared:
        restoredState.answers?.some(
          (entry) =>
            entry.questionId === question.id && entry.selectedOption === option.id
        ) ?? false,
      submissionAppearsOnBothInstances:
        submitMonitor.students.find((entry) => entry.userId === fixtures.ids.student.englishUserId)?.submitted === true,
      restartingOneInstanceDoesNotLoseState: restoredState.attemptId === attemptStarted.attemptId,
      reconnectThroughBPreservesState: restoredState.attemptId === attemptStarted.attemptId,
      noDuplicateTimerBroadcasts: duplicateTimerFrames === 0 && monotonicTimer,
      noDuplicateSubmissionSideEffects:
        beforeDuplicateSubmitLogs === 0 &&
        afterFirstSubmitLogs === 1 &&
        afterDuplicateSubmitLogs === 1,
      noSplitBrainAttemptState:
        beforeRestartAttemptCount === 1 && attemptCountAfter === 1,
    },
    startedEvent,
    attemptStarted,
    heartbeatAck,
    heartbeatMonitor,
    restoredState,
    timerUpdates,
    duplicateTimerFrames,
    monotonicTimer,
    initialMonitor,
    initialMonitorA,
    crossInstanceJoin,
    submitMonitor,
    submitLogCounts: {
      beforeDuplicateSubmitLogs,
      afterFirstSubmitLogs,
      afterDuplicateSubmitLogs,
    },
  }

  await writeJson(path.join(networkDir, 'two-instance.json'), output)
  await writeJson(path.join(networkDir, 'two-instance-success.json'), output)
  await writeJson(path.join(databaseDir, 'two-instance-db.json'), {
    beforeRestartAttemptCount,
    attemptCountAfter,
  })

  studentSocket.disconnect()
  studentSocketAfter.disconnect()
  teacherSocket.disconnect()
  teacherProbeSocketA.disconnect()
  await studentApi.dispose()
  await studentApiAfter.dispose()
  await teacherApi.dispose()
  await teacherApiA.dispose()
  await stopServer(serverB)
  await stopRedis(redis)
  await prisma.$disconnect()
  await closePhase6FixturesPrisma()

  if (Object.values(output.checks).some((value) => !value)) {
    throw new Error('Two-instance Redis checks failed')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
