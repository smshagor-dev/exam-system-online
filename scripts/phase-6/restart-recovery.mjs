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

async function main() {
  await ensureEvidenceDirs()
  const fixtures = await ensurePhase6EvidenceFixtures()
  const redis = await startRedis('restart-recovery')
  let server = await startServer({
    port: 3217,
    redisUrl: redis.redisUrl,
    logPrefix: 'phase6-restart-server-a',
  })

  const api = await createApiContext(
    server.baseUrl,
    fixtures.emails.englishStudent,
    fixtures.passwords.student
  )
  const teacherApi = await createApiContext(
    server.baseUrl,
    fixtures.emails.leadTeacher,
    fixtures.passwords.teacher
  )

  const teacherToken = await getSocketToken(teacherApi, 'P6-RR-teacher-token')
  const teacherSocket = connectSocket(server.baseUrl, teacherToken.token)
  await waitForSocketEvent(teacherSocket, 'connect', 5000)
  teacherSocket.emit('teacher:join_exam_monitor', { examId: fixtures.ids.phase6.manualExam })
  await waitForSocketEvent(teacherSocket, 'exam:monitor_snapshot')
  teacherSocket.emit('teacher:start_exam', { examId: fixtures.ids.phase6.manualExam })
  await waitForSocketEvent(teacherSocket, 'exam:started')

  const studentToken = await getSocketToken(api, 'P6-RR-student-token')
  const studentSocket = connectSocket(server.baseUrl, studentToken.token)
  await waitForSocketEvent(studentSocket, 'connect', 5000)
  studentSocket.emit('student:join_exam', { examId: fixtures.ids.phase6.manualExam })
  await waitForSocketEvent(studentSocket, 'exam:joined')
  studentSocket.emit('student:start_attempt', { examId: fixtures.ids.phase6.manualExam })
  const started = await waitForSocketEvent(studentSocket, 'exam:attempt_started')

  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: fixtures.ids.phase6.manualExam },
    include: {
      questions: {
        include: {
          question: {
            include: { options: { orderBy: { orderIndex: 'asc' } } },
          },
        },
      },
    },
  })
  const question = exam.questions[0].question
  const option = question.options[0]

  const savePayloads = [1, 2, 3].map((index) => ({
    attemptId: started.attemptId,
    questionId: question.id,
    selectedOption: option.id,
    requestId: `restart-save-${index}`,
    clientSavedAtMs: Date.now() + index,
  }))

  for (const payload of savePayloads) {
    studentSocket.emit('student:save_answer', payload)
    await waitForSocketEvent(studentSocket, 'exam:answer_saved')
  }

  const beforeRestart = await prisma.studentExamAttempt.findUniqueOrThrow({
    where: { id: started.attemptId },
    include: {
      snapshot: {
        include: {
          questions: {
            include: { options: true },
          },
        },
      },
      answers: true,
    },
  })

  studentSocket.disconnect()
  teacherSocket.disconnect()
  await api.dispose()
  await teacherApi.dispose()
  await stopServer(server)

  server = await startServer({
    port: 3217,
    redisUrl: redis.redisUrl,
    logPrefix: 'phase6-restart-server-b',
  })

  const apiAfter = await createApiContext(
    server.baseUrl,
    fixtures.emails.englishStudent,
    fixtures.passwords.student
  )
  const teacherApiAfter = await createApiContext(
    server.baseUrl,
    fixtures.emails.leadTeacher,
    fixtures.passwords.teacher
  )
  const teacherTokenAfter = await getSocketToken(teacherApiAfter, 'P6-RR-teacher-token-after')
  const teacherSocketAfter = connectSocket(server.baseUrl, teacherTokenAfter.token)
  await waitForSocketEvent(teacherSocketAfter, 'connect', 5000)
  teacherSocketAfter.emit('teacher:join_exam_monitor', { examId: fixtures.ids.phase6.manualExam })
  const restoredMonitor = await waitForSocketEvent(teacherSocketAfter, 'exam:monitor_snapshot')

  const studentTokenAfter = await getSocketToken(apiAfter, 'P6-RR-student-token-after')
  const studentSocketAfter = connectSocket(server.baseUrl, studentTokenAfter.token)
  await waitForSocketEvent(studentSocketAfter, 'connect', 5000)
  studentSocketAfter.emit('student:join_exam', { examId: fixtures.ids.phase6.manualExam })
  const restoredState = await waitForSocketEvent(studentSocketAfter, 'exam:attempt_state')
  studentSocketAfter.emit('student:submit_exam', { attemptId: started.attemptId })
  await waitForSocketEvent(studentSocketAfter, 'exam:submitted')

  const afterRestart = await prisma.studentExamAttempt.findUniqueOrThrow({
    where: { id: started.attemptId },
    include: {
      snapshot: {
        include: {
          questions: {
            include: { options: true },
          },
        },
      },
      answers: true,
    },
  })

  const output = {
    executedAt: new Date().toISOString(),
    checks: {
      sameAttemptId: restoredState.attemptId === started.attemptId,
      sameImmutableSnapshot: beforeRestart.snapshot?.id === afterRestart.snapshot?.id,
      answersRestored: (restoredState.answers ?? []).length === beforeRestart.answers.length,
      remainingTimeRestored: typeof restoredState.remainingSeconds === 'number',
      noDuplicateAttempt:
        (await prisma.studentExamAttempt.count({
          where: {
            examId: fixtures.ids.phase6.manualExam,
            studentId: fixtures.ids.phase6.englishStudentId,
          },
        })) === 1,
      monitoringStateRestored:
        restoredMonitor.students.some(
          (entry) => entry.userId === fixtures.ids.student.englishUserId
        ),
      finalSubmissionSucceeded: afterRestart.status === 'SUBMITTED',
    },
    beforeRestart,
    restoredState,
    restoredMonitor,
    afterRestart,
  }

  await writeJson(path.join(networkDir, 'restart-recovery.json'), output)
  await writeJson(path.join(databaseDir, 'restart-recovery-db.json'), {
    beforeRestart,
    afterRestart,
  })

  teacherSocketAfter.disconnect()
  studentSocketAfter.disconnect()
  await apiAfter.dispose()
  await teacherApiAfter.dispose()
  await stopServer(server)
  await stopRedis(redis)
  await prisma.$disconnect()
  await closePhase6FixturesPrisma()

  if (Object.values(output.checks).some((value) => !value)) {
    throw new Error('Restart recovery checks failed')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
