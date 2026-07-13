import fs from 'fs/promises'
import path from 'path'
import { chromium } from 'playwright'
import { PrismaClient } from '@prisma/client'
import {
  browserDir,
  consoleDir,
  connectSocket,
  createApiContext,
  databaseDir,
  ensureEvidenceDirs,
  evidenceDir,
  getSocketToken,
  loginPage,
  networkDir,
  phaseDir,
  primeLocale,
  rel,
  startRedis,
  startServer,
  stopRedis,
  stopServer,
  waitForSocketEvent,
  writeJson,
  writeText,
} from './evidence-helpers.mjs'
import {
  closePhase6FixturesPrisma,
  ensurePhase6EvidenceFixtures,
} from './evidence-fixtures.mjs'

const prisma = new PrismaClient()
const results = []
const matrixPath = path.join(phaseDir, 'PHASE_6_BROWSER_SMOKE_MATRIX.md')
const summaryPath = path.join(evidenceDir, 'browser-smoke-results.json')

function pushResult({
  testId,
  role,
  steps,
  expected,
  actual,
  status,
  evidencePaths,
}) {
  results.push({
    testId,
    role,
    steps,
    expected,
    actual,
    status,
    evidencePaths,
  })
}

async function persistResults(baseUrl) {
  await writeJson(summaryPath, {
    generatedAt: new Date().toISOString(),
    baseUrl,
    results,
  })
}

async function record(baseUrl, input) {
  pushResult(input)
  await persistResults(baseUrl)
}

async function buildMatrix() {
  const lines = [
    '# Phase 6 Browser Smoke Matrix',
    '',
    '## Status',
    '',
    results.some((item) => item.status !== 'PASS') ? 'BLOCKED' : 'PASS',
    '',
    '| Test ID | Role | Steps | Expected | Actual | Status | Evidence |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...results.map(
      (item) =>
        `| ${item.testId} | ${item.role} | ${item.steps.replaceAll('\n', ' ')} | ${item.expected.replaceAll('\n', ' ')} | ${item.actual.replaceAll('\n', ' ')} | ${item.status} | ${item.evidencePaths.join('<br/>') || 'n/a'} |`
    ),
  ]

  await fs.writeFile(matrixPath, lines.join('\n'))
}

function attachPageObservers(page, scope) {
  const consoleMessages = []
  const networkResponses = []
  page.on('console', (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  })
  page.on('response', (response) => {
    if (response.url().startsWith(scope.baseUrl)) {
      networkResponses.push(`${response.status()} ${response.url().replace(scope.baseUrl, '')}`)
    }
  })

  return {
    async flush(name) {
      const screenshot = path.join(browserDir, `${name}.png`)
      const consoleFile = path.join(consoleDir, `${name}.txt`)
      const networkFile = path.join(networkDir, `${name}.txt`)
      await page.screenshot({ path: screenshot, fullPage: true })
      await writeText(consoleFile, consoleMessages.join('\n') || 'No console messages captured')
      await writeText(networkFile, networkResponses.join('\n') || 'No same-origin responses captured')
      return [rel(screenshot), rel(consoleFile), rel(networkFile)]
    },
  }
}

async function createStorageState(browser, baseUrl, key, email, password, landing, locale = 'en') {
  const context = await browser.newContext()
  await primeLocale(context, locale)
  const page = await context.newPage()
  await loginPage(page, baseUrl, email, password, landing)
  const statePath = path.join(databaseDir, `${key}-storage-state.json`)
  await context.storageState({ path: statePath })
  await context.close()
  return statePath
}

async function waitForAnswerInDb(attemptId, questionId, expectedOptionId, timeoutMs = 20000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const answer = await prisma.studentAnswer.findUnique({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId,
        },
      },
    })
    if (answer?.selectedOption === expectedOptionId) {
      return answer
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

async function waitForAttemptStatus(attemptId, expectedStatus, timeoutMs = 20000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const attempt = await prisma.studentExamAttempt.findUnique({ where: { id: attemptId } })
    if (attempt?.status === expectedStatus) {
      return attempt
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

async function waitForManualSubmitCount(examId, expectedCount, timeoutMs = 5000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
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

function nearEqualSeconds(left, right, tolerance = 5) {
  return Math.abs(left - right) <= tolerance
}

async function main() {
  await ensureEvidenceDirs()
  const fixtures = await ensurePhase6EvidenceFixtures()
  const redis = await startRedis('browser-smoke')
  const server = await startServer({
    port: 3216,
    redisUrl: redis.redisUrl,
    logPrefix: 'phase6-browser-server',
  })
  const browser = await chromium.launch({ headless: true })

  const manualExam = await prisma.exam.findUniqueOrThrow({
    where: { id: fixtures.ids.phase6.manualExam },
    include: {
      questions: {
        include: {
          question: {
            include: {
              options: { orderBy: { orderIndex: 'asc' } },
            },
          },
        },
      },
    },
  })
  const autoExam = await prisma.exam.findUniqueOrThrow({ where: { id: fixtures.ids.phase6.autoExam } })
  const manualQuestion = manualExam.questions[0].question
  const optionA = manualQuestion.options[0]
  const optionB = manualQuestion.options[1]

  const roleStates = {}
  const apiContexts = {}
  const liveSockets = []

  try {
    for (const [key, role] of Object.entries({
      lead: { email: fixtures.emails.leadTeacher, password: fixtures.passwords.teacher, landing: '/teacher' },
      englishStudent: { email: fixtures.emails.englishStudent, password: fixtures.passwords.student, landing: '/student' },
      russianStudent: { email: fixtures.emails.russianStudent, password: fixtures.passwords.student, landing: '/student' },
      unassigned: { email: fixtures.emails.unassignedTeacher, password: fixtures.passwords.teacher, landing: '/teacher' },
    })) {
      apiContexts[key] = await createApiContext(server.baseUrl, role.email, role.password)
      roleStates[key] = await createStorageState(
        browser,
        server.baseUrl,
        key,
        role.email,
        role.password,
        role.landing
      )
    }

    const teacherSocketToken = await getSocketToken(apiContexts.lead, 'P6-BR-TEACHER-SOCKET-TOKEN')
    const teacherSocket = connectSocket(server.baseUrl, teacherSocketToken.token)
    liveSockets.push(teacherSocket)
    await waitForSocketEvent(teacherSocket, 'connect', 5000)
    const initialMonitorPromise = waitForSocketEvent(teacherSocket, 'exam:monitor_snapshot')
    teacherSocket.emit('teacher:join_exam_monitor', { examId: manualExam.id })
    const initialMonitor = await initialMonitorPromise
    await writeJson(path.join(networkDir, 'P6-BR-000-monitor-initial.json'), initialMonitor)

    const teacherContext = await browser.newContext({ storageState: roleStates.lead })
    await primeLocale(teacherContext)
    const teacherPage = await teacherContext.newPage()
    const teacherObs = attachPageObservers(teacherPage, server)
    await teacherPage.goto(`${server.baseUrl}/teacher/exams/${manualExam.id}/live`, {
      waitUntil: 'networkidle',
    })
    if (await teacherPage.getByRole('button', { name: 'Start Exam' }).isVisible().catch(() => false)) {
      await teacherPage.getByRole('button', { name: 'Start Exam' }).click()
    }
    const teacherStartEvidence = await teacherObs.flush('P6-BR-001-teacher-live')
    await record(server.baseUrl, {
      testId: 'P6-BR-001',
      role: 'Teacher',
      steps: 'Teacher opens live monitoring page and starts the manual exam.',
      expected: 'Live page renders and runtime starts in Redis mode.',
      actual: (await teacherPage.textContent('body'))?.includes('Runtime: redis')
        ? 'Teacher live page rendered with Redis runtime.'
        : 'Teacher live page did not show Redis runtime.',
      status: (await teacherPage.textContent('body'))?.includes('Runtime: redis') ? 'PASS' : 'FAIL',
      evidencePaths: teacherStartEvidence,
    })

    const studentContext = await browser.newContext({ storageState: roleStates.englishStudent })
    await primeLocale(studentContext)
    const studentPage = await studentContext.newPage()
    const studentObs = attachPageObservers(studentPage, server)
    await studentPage.goto(`${server.baseUrl}/student/exams/${manualExam.id}/attempt`, {
      waitUntil: 'networkidle',
    })
    const monitorAfterJoinPromise = waitForSocketEvent(teacherSocket, 'exam:monitor_snapshot')
    const startButton = studentPage.getByRole('button', { name: 'Start Exam' })
    const submitButton = studentPage.getByRole('button', { name: 'Stop and Submit' })
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click()
    } else if (!(await submitButton.isVisible().catch(() => false))) {
      const unexpectedBody = (await studentPage.textContent('body')) || ''
      const evidence = await studentObs.flush('P6-BR-002-student-start-missing-button')
      throw new Error(
        `Student attempt page did not expose start or active controls. Body: ${unexpectedBody.slice(0, 400)}. Evidence: ${evidence.join(', ')}`
      )
    }
    await submitButton.waitFor({ timeout: 20000 })

    let attempt = await prisma.studentExamAttempt.findUnique({
      where: {
        examId_studentId: {
          examId: manualExam.id,
          studentId: fixtures.ids.phase6.englishStudentId,
        },
      },
      include: { snapshot: true },
    })

    const studentStartEvidence = await studentObs.flush('P6-BR-002-student-start')
    await record(server.baseUrl, {
      testId: 'P6-BR-002',
      role: 'Student',
      steps: 'Student opens attempt page and starts the manual exam.',
      expected: 'Student joins the exam and a single in-progress attempt starts.',
      actual: attempt
        ? `Attempt ${attempt.id} started with status ${attempt.status}.`
        : 'Attempt was not created.',
      status: attempt?.status === 'IN_PROGRESS' ? 'PASS' : 'FAIL',
      evidencePaths: [
        ...studentStartEvidence,
        await writeJson(path.join(databaseDir, 'P6-BR-002-attempt.json'), attempt),
      ],
    })

    const monitorAfterJoin = await monitorAfterJoinPromise
    const joinedStudent = monitorAfterJoin.students.find(
      (entry) => entry.userId === fixtures.ids.student.englishUserId
    )
    await record(server.baseUrl, {
      testId: 'P6-BR-003',
      role: 'Teacher monitor',
      steps: 'Teacher monitor receives join state for the student attempt.',
      expected: 'Teacher sees the student online in monitor state.',
      actual: joinedStudent ? `online=${joinedStudent.online}` : 'Student missing from monitor.',
      status: joinedStudent?.online ? 'PASS' : 'FAIL',
      evidencePaths: [
        await writeJson(path.join(networkDir, 'P6-BR-003-monitor-joined.json'), monitorAfterJoin),
      ],
    })

    const studentSocketToken = await getSocketToken(apiContexts.englishStudent, 'P6-BR-STUDENT-SOCKET-TOKEN')
    const studentSocket = connectSocket(server.baseUrl, studentSocketToken.token)
    liveSockets.push(studentSocket)
    await waitForSocketEvent(studentSocket, 'connect', 5000)
    const duplicateStartPromise = waitForSocketEvent(studentSocket, 'exam:attempt_started')
    studentSocket.emit('student:start_attempt', { examId: manualExam.id })
    const duplicateStart = await duplicateStartPromise
    const attemptCount = await prisma.studentExamAttempt.count({
      where: {
        examId: manualExam.id,
        studentId: fixtures.ids.phase6.englishStudentId,
      },
    })
    await record(server.baseUrl, {
      testId: 'P6-BR-004',
      role: 'Student socket',
      steps: 'Duplicate student start event is emitted after the browser already started the attempt.',
      expected: 'Attempt start remains idempotent and does not create a second attempt.',
      actual: `Returned attempt=${duplicateStart.attemptId}; attempts in DB=${attemptCount}`,
      status:
        duplicateStart.attemptId === attempt?.id && attemptCount === 1 ? 'PASS' : 'FAIL',
      evidencePaths: [
        await writeJson(path.join(networkDir, 'P6-BR-004-duplicate-start.json'), duplicateStart),
      ],
    })

    await studentPage.getByLabel(new RegExp(optionA.text)).click()
    const savedAnswer = await waitForAnswerInDb(attempt.id, manualQuestion.id, optionA.id)
    await record(server.baseUrl, {
      testId: 'P6-BR-005',
      role: 'Student',
      steps: 'Student selects an answer and lets autosave persist it.',
      expected: 'Answer autosave writes the selected option.',
      actual: savedAnswer ? `Saved option=${savedAnswer.selectedOption}` : 'Answer was not saved.',
      status: savedAnswer?.selectedOption === optionA.id ? 'PASS' : 'FAIL',
      evidencePaths: [
        ...(await studentObs.flush('P6-BR-005-autosave')),
        await writeJson(path.join(databaseDir, 'P6-BR-005-answer.json'), savedAnswer),
      ],
    })

    const duplicateSavePayload = {
      attemptId: attempt.id,
      questionId: manualQuestion.id,
      selectedOption: optionA.id,
      requestId: 'dup-save-1',
      clientSavedAtMs: Date.now(),
    }
    studentSocket.emit('student:save_answer', duplicateSavePayload)
    await waitForSocketEvent(studentSocket, 'exam:answer_saved')
    const duplicateSavePromise = waitForSocketEvent(studentSocket, 'exam:answer_saved')
    studentSocket.emit('student:save_answer', duplicateSavePayload)
    await duplicateSavePromise
    const duplicateAnswerCount = await prisma.studentAnswer.count({
      where: { attemptId: attempt.id, questionId: manualQuestion.id },
    })
    await record(server.baseUrl, {
      testId: 'P6-BR-006',
      role: 'Student socket',
      steps: 'The same answer save payload is replayed twice.',
      expected: 'Duplicate save creates no duplicate answer row.',
      actual: `Answer row count=${duplicateAnswerCount}`,
      status: duplicateAnswerCount === 1 ? 'PASS' : 'FAIL',
      evidencePaths: [
        await writeJson(path.join(databaseDir, 'P6-BR-006-duplicate-save.json'), {
          duplicateAnswerCount,
          payload: duplicateSavePayload,
        }),
      ],
    })

    await studentContext.setOffline(true)
    await studentPage.getByLabel(new RegExp(optionB.text)).click()
    await studentPage.waitForTimeout(1000)
    const offlineText = (await studentPage.textContent('body')) || ''
    const offlineBannerVisible =
      offlineText.includes('Offline mode active') ||
      offlineText.includes('Connection lost, trying to recover your attempt') ||
      offlineText.includes('answer update syncing')
    const offlineEvidence = await studentObs.flush('P6-BR-007-offline-queue')
    await record(server.baseUrl, {
      testId: 'P6-BR-007',
      role: 'Student',
      steps: 'Student goes offline and changes the selected answer.',
      expected: 'Offline answers queue locally in the browser.',
      actual: offlineBannerVisible ? 'Offline queue or recovery banner visible.' : 'Offline queue banner missing.',
      status: offlineBannerVisible ? 'PASS' : 'FAIL',
      evidencePaths: offlineEvidence,
    })

    await studentContext.setOffline(false)
    const reconnectMonitorPromise = waitForSocketEvent(teacherSocket, 'exam:monitor_snapshot')
    const replayedAnswer = await waitForAnswerInDb(attempt.id, manualQuestion.id, optionB.id)
    await studentPage.reload({ waitUntil: 'networkidle' })
    if (await studentPage.getByRole('button', { name: 'Start Exam' }).isVisible().catch(() => false)) {
      await studentPage.getByRole('button', { name: 'Start Exam' }).click()
    }
    await studentPage.getByRole('button', { name: 'Stop and Submit' }).waitFor({ timeout: 20000 })
    const timerText = ((await studentPage.locator('div.font-mono').first().textContent()) || '').trim()
    attempt = await prisma.studentExamAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
      include: { snapshot: true },
    })
    const expectedRemainingSeconds = Math.max(
      0,
      Math.floor(
        (Math.min(
          attempt.startedAt.getTime() + manualExam.duration * 60 * 1000,
          manualExam.endTime.getTime()
        ) - Date.now()) / 1000
      )
    )
    const timerParts = timerText.split(':').map((part) => Number(part))
    const renderedSeconds =
      timerParts.length === 2
        ? timerParts[0] * 60 + timerParts[1]
        : timerParts[0] * 3600 + timerParts[1] * 60 + timerParts[2]
    const refreshChecked = await studentPage
      .locator(`input[type="radio"][name="q-${manualQuestion.id}"]`)
      .nth(1)
      .isChecked()
    const reconnectMonitor = await reconnectMonitorPromise
    const reconnectStudent = reconnectMonitor.students.find(
      (entry) => entry.userId === fixtures.ids.student.englishUserId
    )
    await record(server.baseUrl, {
      testId: 'P6-BR-008',
      role: 'Student',
      steps: 'Student reconnects and refreshes the browser after an offline answer update.',
      expected:
        'Reconnect replays queued answers, restores the same attempt, and restores the remaining timer.',
      actual: `attempt=${attempt.id}; answer=${replayedAnswer?.selectedOption}; checked=${refreshChecked}; timer=${renderedSeconds}s expected=${expectedRemainingSeconds}s`,
      status:
        replayedAnswer?.selectedOption === optionB.id &&
        refreshChecked &&
        nearEqualSeconds(renderedSeconds, expectedRemainingSeconds)
          ? 'PASS'
          : 'FAIL',
      evidencePaths: [
        ...(await studentObs.flush('P6-BR-008-refresh-recover')),
        await writeJson(path.join(databaseDir, 'P6-BR-008-refresh.json'), {
          attemptId: attempt.id,
          reconnectStudent,
          renderedSeconds,
          expectedRemainingSeconds,
          replayedOption: replayedAnswer?.selectedOption ?? null,
        }),
      ],
    })

    const reconnectTokenErrorPromise = waitForSocketEvent(studentSocket, 'error')
    studentSocket.emit('student:heartbeat', {
      examId: manualExam.id,
      attemptId: attempt.id,
      pendingQueueSize: 0,
      reconnectToken: 'invalid-reconnect-token',
    })
    const reconnectTokenError = await reconnectTokenErrorPromise
    await record(server.baseUrl, {
      testId: 'P6-BR-009',
      role: 'Student socket',
      steps: 'Heartbeat is replayed with an invalid reconnect token.',
      expected: 'Invalid reconnect token is denied.',
      actual: reconnectTokenError?.message || 'No error returned.',
      status: reconnectTokenError?.message === 'Reconnect token mismatch' ? 'PASS' : 'FAIL',
      evidencePaths: [
        await writeJson(path.join(networkDir, 'P6-BR-009-invalid-reconnect-token.json'), reconnectTokenError),
      ],
    })

    const wrongOwnerSocketToken = await getSocketToken(
      apiContexts.russianStudent,
      'P6-BR-RUSSIAN-STUDENT-SOCKET-TOKEN'
    )
    const wrongOwnerSocket = connectSocket(server.baseUrl, wrongOwnerSocketToken.token)
    liveSockets.push(wrongOwnerSocket)
    await waitForSocketEvent(wrongOwnerSocket, 'connect', 5000)
    const wrongOwnerErrorPromise = waitForSocketEvent(wrongOwnerSocket, 'error')
    wrongOwnerSocket.emit('student:save_answer', {
      attemptId: attempt.id,
      questionId: manualQuestion.id,
      selectedOption: optionA.id,
      requestId: 'wrong-owner',
      clientSavedAtMs: Date.now(),
    })
    const wrongOwnerError = await wrongOwnerErrorPromise
    await record(server.baseUrl, {
      testId: 'P6-BR-010',
      role: 'Student socket',
      steps: 'A different student attempts to save an answer to the active attempt.',
      expected: 'Wrong attempt ownership is denied.',
      actual: wrongOwnerError?.message || 'No error returned.',
      status: wrongOwnerError?.message === 'Not your attempt' ? 'PASS' : 'FAIL',
      evidencePaths: [
        await writeJson(path.join(networkDir, 'P6-BR-010-wrong-ownership.json'), wrongOwnerError),
      ],
    })

    const invalidSocket = connectSocket(server.baseUrl, 'invalid-token')
    const invalidJoinError = await waitForSocketEvent(invalidSocket, 'connect_error')
    invalidSocket.disconnect()
    await record(server.baseUrl, {
      testId: 'P6-BR-011',
      role: 'Anonymous socket',
      steps: 'A socket attempts to connect with an invalid auth token.',
      expected: 'Unauthorized socket join is denied.',
      actual: invalidJoinError?.message || 'No connect error returned.',
      status: invalidJoinError?.message === 'Invalid token' ? 'PASS' : 'FAIL',
      evidencePaths: [
        await writeJson(path.join(networkDir, 'P6-BR-011-unauthorized-join.json'), {
          message: invalidJoinError?.message ?? null,
        }),
      ],
    })

    const wrongLanguageContext = await browser.newContext({ storageState: roleStates.russianStudent })
    await primeLocale(wrongLanguageContext)
    const wrongLanguagePage = await wrongLanguageContext.newPage()
    const wrongLanguageObs = attachPageObservers(wrongLanguagePage, server)
    await wrongLanguagePage.goto(`${server.baseUrl}/student/exams/${manualExam.id}`, {
      waitUntil: 'networkidle',
    })
    const wrongLanguageBody = (await wrongLanguagePage.textContent('body')) || ''
    await record(server.baseUrl, {
      testId: 'P6-BR-012',
      role: 'Russian student',
      steps: 'A Russian-scope student directly requests the English exam detail page.',
      expected: 'Wrong-language delivery is denied.',
      actual: wrongLanguageBody.includes('404') || wrongLanguageBody.includes('Not Found')
        ? 'Not Found rendered.'
        : `Body length=${wrongLanguageBody.length}`,
      status:
        wrongLanguageBody.includes('404') || wrongLanguageBody.includes('Not Found')
          ? 'PASS'
          : 'FAIL',
      evidencePaths: await wrongLanguageObs.flush('P6-BR-012-wrong-language-denied'),
    })
    await wrongLanguageContext.close()

    const secondTabContext = await browser.newContext({ storageState: roleStates.englishStudent })
    await primeLocale(secondTabContext)
    const secondTab = await secondTabContext.newPage()
    const secondTabObs = attachPageObservers(secondTab, server)
    await secondTab.goto(`${server.baseUrl}/student/exams/${manualExam.id}/attempt`, {
      waitUntil: 'networkidle',
    })
    const twoTabMonitorPromise = waitForSocketEvent(teacherSocket, 'exam:monitor_snapshot')
    if (await secondTab.getByRole('button', { name: 'Start Exam' }).isVisible().catch(() => false)) {
      await secondTab.getByRole('button', { name: 'Start Exam' }).click()
    }
    await secondTab.getByRole('button', { name: 'Stop and Submit' }).waitFor({ timeout: 20000 })
    const postTwoTabAttemptCount = await prisma.studentExamAttempt.count({
      where: {
        examId: manualExam.id,
        studentId: fixtures.ids.phase6.englishStudentId,
      },
    })
    const twoTabMonitor = await twoTabMonitorPromise
    const twoTabStudent = twoTabMonitor.students.find(
      (entry) => entry.userId === fixtures.ids.student.englishUserId
    )
    await record(server.baseUrl, {
      testId: 'P6-BR-013',
      role: 'Student',
      steps: 'A second browser tab opens the same active attempt.',
      expected:
        'Two-tab duplicate behavior is handled safely with the same attempt id and no duplicate attempt rows.',
      actual: `attempts=${postTwoTabAttemptCount}; reconnects=${twoTabStudent?.reconnects ?? 0}`,
      status: postTwoTabAttemptCount === 1 ? 'PASS' : 'FAIL',
      evidencePaths: [
        ...(await secondTabObs.flush('P6-BR-013-two-tab-safe')),
        await writeJson(path.join(databaseDir, 'P6-BR-013-two-tab.json'), {
          attemptCount: postTwoTabAttemptCount,
          monitor: twoTabMonitor,
        }),
      ],
    })
    await secondTabContext.close()

    await studentPage.getByRole('button', { name: 'Stop and Submit' }).click()
    const submitMonitorPromise = waitForSocketEvent(
      teacherSocket,
      'exam:monitor_snapshot',
      20000,
      (payload) =>
        payload.examId === manualExam.id &&
        payload.students.some(
          (entry) =>
            entry.userId === fixtures.ids.student.englishUserId &&
            entry.submitted === true &&
            entry.attemptStatus === 'SUBMITTED' &&
            typeof entry.submittedAtMs === 'number'
        )
    )
    await studentPage.getByRole('button', { name: 'Yes, Stop and Submit' }).click()
    await studentPage.getByText('Exam Submitted!').waitFor({ timeout: 20000 })
    const submittedAttempt = await waitForAttemptStatus(attempt.id, 'SUBMITTED')
    const beforeDuplicateManualLogs = await waitForManualSubmitCount(manualExam.id, 1)
    const duplicateSubmitPromise = waitForSocketEvent(studentSocket, 'exam:submitted')
    studentSocket.emit('student:submit_exam', { attemptId: attempt.id })
    await duplicateSubmitPromise
    const afterDuplicateManualLogs = await waitForManualSubmitCount(manualExam.id, 1)
    const submitMonitor = await submitMonitorPromise
    const submitStudent = submitMonitor.students.find(
      (entry) => entry.userId === fixtures.ids.student.englishUserId
    )
    await record(server.baseUrl, {
      testId: 'P6-BR-014',
      role: 'Student',
      steps: 'Student manually submits the active attempt and then replays submit.',
      expected:
        'Manual submit works, duplicate submit is ignored, and teacher sees the submitted state.',
      actual: `status=${submittedAttempt?.status}; manualSubmitLogs=${beforeDuplicateManualLogs}->${afterDuplicateManualLogs}; submitted=${submitStudent?.submitted ?? false}`,
      status:
        submittedAttempt?.status === 'SUBMITTED' &&
        beforeDuplicateManualLogs === afterDuplicateManualLogs &&
        submitStudent?.submitted
          ? 'PASS'
          : 'FAIL',
      evidencePaths: [
        ...(await studentObs.flush('P6-BR-014-manual-submit')),
        ...(await teacherObs.flush('P6-BR-014-teacher-submitted')),
        await writeJson(path.join(databaseDir, 'P6-BR-014-submit.json'), {
          submittedAttempt,
          beforeDuplicateManualLogs,
          afterDuplicateManualLogs,
          monitor: submitMonitor,
        }),
      ],
    })

    await teacherPage.goto(`${server.baseUrl}/teacher/exams/${autoExam.id}/live`, {
      waitUntil: 'networkidle',
    })
    if (await teacherPage.getByRole('button', { name: 'Start Exam' }).isVisible().catch(() => false)) {
      await teacherPage.getByRole('button', { name: 'Start Exam' }).click()
    }
    const autoMonitorPromise = waitForSocketEvent(teacherSocket, 'exam:monitor_snapshot')
    teacherSocket.emit('teacher:join_exam_monitor', { examId: autoExam.id })
    await autoMonitorPromise

    const autoContext = await browser.newContext({ storageState: roleStates.englishStudent })
    await primeLocale(autoContext)
    const autoPage = await autoContext.newPage()
    const autoObs = attachPageObservers(autoPage, server)
    const autoAttempt = await prisma.studentExamAttempt.upsert({
      where: {
        examId_studentId: {
          examId: autoExam.id,
          studentId: fixtures.ids.phase6.englishStudentId,
        },
      },
      update: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        submittedAt: null,
        socketId: null,
      },
      create: {
        examId: autoExam.id,
        studentId: fixtures.ids.phase6.englishStudentId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    })
    await autoPage.goto(`${server.baseUrl}/student/exams/${autoExam.id}/attempt`, {
      waitUntil: 'networkidle',
    })
    await prisma.exam.update({
      where: { id: autoExam.id },
      data: {
        endTime: new Date(Date.now() + 5000),
      },
    })
    await waitForAttemptStatus(autoAttempt.id, 'AUTO_SUBMITTED', 30000)
    await autoPage.reload({ waitUntil: 'networkidle' })
    let autoSubmittedVisible = true
    try {
      await autoPage.getByText('Exam Submitted!').waitFor({ timeout: 30000 })
    } catch {
      autoSubmittedVisible = false
    }
    const autoAttemptAfter = await prisma.studentExamAttempt.findUnique({
      where: { id: autoAttempt.id },
    })
    await record(server.baseUrl, {
      testId: 'P6-BR-015',
      role: 'Student',
      steps: 'Student starts the short auto-submit exam and waits for timer expiry.',
      expected: 'Auto-submit works at the end of the exam window.',
      actual: autoAttemptAfter
        ? `attempt=${autoAttempt.id}; status=${autoAttemptAfter.status}; browserSubmitted=${autoSubmittedVisible}`
        : 'Auto attempt missing.',
      status: autoAttemptAfter?.status === 'AUTO_SUBMITTED' && autoSubmittedVisible ? 'PASS' : 'FAIL',
      evidencePaths: [
        ...(await autoObs.flush('P6-BR-015-auto-submit')),
        await writeJson(path.join(databaseDir, 'P6-BR-015-auto-submit.json'), {
          attempt: autoAttemptAfter,
          browserSubmitted: autoSubmittedVisible,
          body: await autoPage.textContent('body'),
        }),
      ],
    })
    await autoContext.close()

    await buildMatrix()
  } finally {
    for (const socket of liveSockets) {
      socket.disconnect()
    }
    for (const api of Object.values(apiContexts)) {
      await api.dispose().catch(() => {})
    }
    await browser.close().catch(() => {})
    await stopServer(server).catch(() => {})
    await stopRedis(redis).catch(() => {})
    await prisma.$disconnect().catch(() => {})
    await closePhase6FixturesPrisma().catch(() => {})
  }
}

main().catch(async (error) => {
  console.error('[phase-6] browser smoke failed', error)
  await ensureEvidenceDirs()
  await writeText(path.join(consoleDir, 'phase6-browser-smoke-error.txt'), String(error?.stack || error))
  process.exit(1)
})
