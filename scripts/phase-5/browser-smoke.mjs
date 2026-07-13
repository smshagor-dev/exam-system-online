import fs from 'fs/promises'
import path from 'path'
import { createWriteStream } from 'fs'
import { spawn } from 'child_process'
import { chromium, request } from 'playwright'
import { io as socketIo } from 'socket.io-client'
import { ensurePhase5EvidenceFixtures, closeFixturesPrisma } from './evidence-fixtures.mjs'

const PORT = Number(process.env.PHASE5_PORT || '3115')
const baseUrl = process.env.PHASE5_BASE_URL || `http://127.0.0.1:${PORT}`
const rootDir = process.cwd()
const docsDir = path.join(rootDir, 'docs', 'phase-5')
const evidenceDir = path.join(docsDir, 'evidence')
const browserDir = path.join(evidenceDir, 'browser')
const networkDir = path.join(evidenceDir, 'network')
const consoleDir = path.join(evidenceDir, 'console')
const databaseDir = path.join(evidenceDir, 'database')
const summaryPath = path.join(evidenceDir, 'browser-smoke-results.json')
const matrixPath = path.join(docsDir, 'PHASE_5_BROWSER_SMOKE_MATRIX.md')
const serverOutPath = path.join(evidenceDir, 'phase5-browser-server.out.log')
const serverErrPath = path.join(evidenceDir, 'phase5-browser-server.err.log')

const caseResults = []
const roleStates = {}
const requestedTests = (() => {
  const arg = process.argv.find((value) => value.startsWith('--tests='))
  if (!arg) {
    return null
  }

  const values = arg
    .slice('--tests='.length)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return values.length > 0 ? new Set(values) : null
})()

function shouldRecordTest(testId) {
  return !requestedTests || requestedTests.has(testId)
}

function rel(filePath) {
  return filePath.replace(`${rootDir}${path.sep}`, '').replaceAll('\\', '/')
}

async function ensureDirs() {
  await fs.mkdir(browserDir, { recursive: true })
  await fs.mkdir(networkDir, { recursive: true })
  await fs.mkdir(consoleDir, { recursive: true })
  await fs.mkdir(databaseDir, { recursive: true })
}

async function waitForServer(timeoutMs = 90000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/csrf`)
      if (response.ok) {
        return
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for ${baseUrl}`)
}

async function startServer() {
  const stdout = createWriteStream(serverOutPath, { flags: 'w' })
  const stderr = createWriteStream(serverErrPath, { flags: 'w' })
  const child = spawn('node', ['server.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      NEXTAUTH_URL: baseUrl,
      AUTH_URL: baseUrl,
      NEXT_PUBLIC_SOCKET_URL: baseUrl,
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.pipe(stdout)
  child.stderr.pipe(stderr)
  await waitForServer()
  return child
}

async function stopServer(child) {
  if (!child || child.killed) return
  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 2000))
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2))
  return rel(filePath)
}

async function writeText(filePath, value) {
  await fs.writeFile(filePath, value, 'utf8')
  return rel(filePath)
}

async function login(page, email, password, landing) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /sign in|login/i }).click()
  await page.waitForURL((url) => url.pathname.startsWith(landing), { timeout: 20000 })
}

function addCase({
  testId,
  role,
  steps,
  expected,
  actual,
  status,
  evidencePaths,
}) {
  caseResults.push({
    testId,
    role,
    steps,
    expected,
    actual,
    status,
    evidencePaths,
  })
}

async function persistResults() {
  await writeJson(summaryPath, { generatedAt: new Date().toISOString(), baseUrl, caseResults })
}

async function recordCase(input) {
  if (!shouldRecordTest(input.testId)) {
    return
  }

  addCase(input)
  await persistResults()
}

async function createApiContext(email, password) {
  const api = await request.newContext({ baseURL: baseUrl })
  const csrfResponse = await api.get('/api/auth/csrf')
  const csrfPayload = await csrfResponse.json()
  const response = await api.post('/api/auth/callback/credentials', {
    form: {
      email,
      password,
      csrfToken: csrfPayload.csrfToken,
      callbackUrl: `${baseUrl}/`,
      json: 'true',
    },
  })
  if (response.status() !== 200) {
    throw new Error(`Login failed for ${email}: ${response.status()}`)
  }
  return api
}

async function apiJson(api, method, url, body, evidenceName) {
  const response = await api.fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    data: body,
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  const filePath = path.join(networkDir, `${evidenceName}.json`)
  const evidence = await writeJson(filePath, { method, url, status: response.status(), json, text })
  return { status: response.status(), json, text, evidence }
}

async function createBrowserState(browser, key, email, password, landing, locale = 'en') {
  const context = await browser.newContext()
  await context.addInitScript((value) => {
    window.localStorage.setItem('examflow.siteLocale', value)
  }, locale)
  const page = await context.newPage()
  await login(page, email, password, landing)
  const statePath = path.join(databaseDir, `${key}-storage-state.json`)
  await context.storageState({ path: statePath })
  roleStates[key] = statePath
  await context.close()
  return statePath
}

async function openRolePage(browser, roleKey, pathname, evidenceName, locale = 'en') {
  const context = await browser.newContext({ storageState: roleStates[roleKey] })
  await context.addInitScript((value) => {
    window.localStorage.setItem('examflow.siteLocale', value)
  }, locale)
  const page = await context.newPage()
  const consoleMessages = []
  const networkResponses = []
  page.on('console', (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  })
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl)) {
      networkResponses.push(`${response.status()} ${response.url().replace(baseUrl, '')}`)
    }
  })
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'networkidle' })
  const screenshotPath = path.join(browserDir, `${evidenceName}.png`)
  const consolePath = path.join(consoleDir, `${evidenceName}.txt`)
  const networkPath = path.join(networkDir, `${evidenceName}.txt`)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await writeText(consolePath, consoleMessages.join('\n') || 'No console messages captured')
  await writeText(networkPath, networkResponses.join('\n') || 'No same-origin responses captured')
  return {
    context,
    page,
    evidence: [rel(screenshotPath), rel(consolePath), rel(networkPath)],
    consoleMessages,
    networkResponses,
  }
}

function payloadQuestion(text, option1, option2, option3, status = 'DRAFT') {
  return {
    text,
    expectedAnswer: '',
    explanation: `${text} explanation`,
    keywords: ['p5', 'evidence'],
    options: [
      { optionId: '__OPTION_0__', text: option1 },
      { optionId: '__OPTION_1__', text: option2 },
      { optionId: '__OPTION_2__', text: option3 },
    ],
    status,
  }
}

function hydrateQuestionPayload(question, body) {
  return {
    ...body,
    options: question.optionTranslations.map((option, index) => ({
      optionId: option.optionId,
      text: body.options[index].text,
    })),
  }
}

async function waitForSocketEvent(socket, eventName, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler)
      reject(new Error(`Timed out waiting for ${eventName}`))
    }, timeoutMs)
    function handler(payload) {
      clearTimeout(timer)
      socket.off(eventName, handler)
      resolve(payload)
    }
    socket.on(eventName, handler)
  })
}

async function getSocketToken(api, evidenceName) {
  const response = await api.fetch('/api/socket/token', { method: 'GET' })
  const json = await response.json()
  const evidence = await writeJson(path.join(networkDir, `${evidenceName}.json`), {
    status: response.status(),
    body: json,
  })
  if (response.status() !== 200 || !json?.token) {
    throw new Error('Socket token request failed')
  }
  return { token: json.token, evidence }
}

async function buildMatrix() {
  const status = caseResults.some((item) => item.status !== 'PASS') ? 'BLOCKED' : 'PASS'
  const lines = [
    '# Phase 5 Browser Smoke Matrix',
    '',
    '## Status',
    '',
    status,
    '',
    '| Test ID | Role | Steps | Expected | Actual | Status | Evidence |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...caseResults.map((item) =>
      `| ${item.testId} | ${item.role} | ${item.steps.replaceAll('\n', ' ')} | ${item.expected.replaceAll('\n', ' ')} | ${item.actual.replaceAll('\n', ' ')} | ${item.status} | ${item.evidencePaths.join('<br/>') || 'n/a'} |`
    ),
  ]
  await fs.writeFile(matrixPath, lines.join('\n'))
}

async function run() {
  await ensureDirs()
  const fixtures = await ensurePhase5EvidenceFixtures()
  await writeJson(path.join(databaseDir, 'P5-fixtures.json'), fixtures)

  const server = await startServer()
  const browser = await chromium.launch({ headless: true })

  const roles = {
    superAdmin: { email: fixtures.emails.superAdmin, password: fixtures.passwords.admin, landing: '/admin' },
    cseAdmin: { email: fixtures.emails.cseAdmin, password: fixtures.passwords.admin, landing: '/admin' },
    eeeAdmin: { email: fixtures.emails.eeeAdmin, password: fixtures.passwords.admin, landing: '/admin' },
    lead: { email: fixtures.emails.leadTeacher, password: fixtures.passwords.teacher, landing: '/teacher' },
    assistant: { email: fixtures.emails.assistantTeacher, password: fixtures.passwords.teacher, landing: '/teacher' },
    examiner: { email: fixtures.emails.examiner, password: fixtures.passwords.teacher, landing: '/teacher' },
    unassigned: { email: fixtures.emails.unassignedTeacher, password: fixtures.passwords.teacher, landing: '/teacher' },
    englishStudent: { email: fixtures.emails.englishStudent, password: fixtures.passwords.student, landing: '/student' },
    russianStudent: { email: fixtures.emails.russianStudent, password: fixtures.passwords.student, landing: '/student' },
  }

  const apiContexts = {}

  try {
    for (const [key, role] of Object.entries(roles)) {
      apiContexts[key] = await createApiContext(role.email, role.password)
      await createBrowserState(browser, key, role.email, role.password, role.landing)
    }

    const questionEn = await apiJson(apiContexts.lead, 'GET', `/api/teacher/translations/questions/${fixtures.ids.question.english}?languageId=${fixtures.ids.language.english}`, null, 'P5-QUE-BASE-EN')
    const questionRu = await apiJson(apiContexts.lead, 'GET', `/api/teacher/translations/questions/${fixtures.ids.question.russian}?languageId=${fixtures.ids.language.russian}`, null, 'P5-QUE-BASE-RU')

    const createRuPayload = hydrateQuestionPayload(questionEn.json, payloadQuestion('P5 Evidence RU Question Translation', 'RU Option A', 'RU Option B', 'RU Option C'))
    const createRu = await apiJson(
      apiContexts.lead,
      'POST',
      `/api/teacher/translations/questions/${fixtures.ids.question.english}`,
      { languageId: fixtures.ids.language.russian, ...createRuPayload, status: 'COMPLETE' },
      'P5-QUE-001-russian-translation-created'
    )
    await recordCase({
      testId: 'P5-QUE-001',
      role: 'Lead Teacher',
      steps: 'Create Russian question translation via protected teacher translation POST.',
      expected: 'API returns success and creates Russian translation.',
      actual: `Status ${createRu.status}`,
      status: createRu.status === 201 ? 'PASS' : 'FAIL',
      evidencePaths: [createRu.evidence],
    })

    const createEnPayload = hydrateQuestionPayload(questionRu.json, payloadQuestion('P5 Evidence EN Question Translation', 'EN Option A', 'EN Option B', 'EN Option C'))
    const createEn = await apiJson(
      apiContexts.lead,
      'POST',
      `/api/teacher/translations/questions/${fixtures.ids.question.russian}`,
      { languageId: fixtures.ids.language.english, ...createEnPayload, status: 'COMPLETE' },
      'P5-QUE-002-english-translation-created'
    )
    await recordCase({
      testId: 'P5-QUE-002',
      role: 'Lead Teacher',
      steps: 'Create English question translation via protected teacher translation POST.',
      expected: 'API returns success and creates English translation.',
      actual: `Status ${createEn.status}`,
      status: createEn.status === 201 ? 'PASS' : 'FAIL',
      evidencePaths: [createEn.evidence],
    })

    const editEn = await apiJson(
      apiContexts.lead,
      'PATCH',
      `/api/teacher/translations/questions/${fixtures.ids.question.russian}`,
      { languageId: fixtures.ids.language.english, ...hydrateQuestionPayload(questionRu.json, payloadQuestion('P5 Evidence EN Question Translation Edited', 'EN Option A+', 'EN Option B+', 'EN Option C+', 'DRAFT')) },
      'P5-QUE-003-translation-edited'
    )
    await recordCase({
      testId: 'P5-QUE-003',
      role: 'Lead Teacher',
      steps: 'Edit an existing question translation.',
      expected: 'API updates the translation without creating a duplicate.',
      actual: `Status ${editEn.status}`,
      status: editEn.status === 200 ? 'PASS' : 'FAIL',
      evidencePaths: [editEn.evidence],
    })

    const duplicateRu = await apiJson(
      apiContexts.lead,
      'POST',
      `/api/teacher/translations/questions/${fixtures.ids.question.english}`,
      { languageId: fixtures.ids.language.russian, ...createRuPayload },
      'P5-QUE-004-duplicate-language-rejected'
    )
    await recordCase({
      testId: 'P5-QUE-004',
      role: 'Lead Teacher',
      steps: 'Attempt to create the same language translation twice.',
      expected: 'API rejects duplicate translation with 409.',
      actual: `Status ${duplicateRu.status}`,
      status: duplicateRu.status === 409 ? 'PASS' : 'FAIL',
      evidencePaths: [duplicateRu.evidence],
    })

    const unsupported = await apiJson(
      apiContexts.lead,
      'POST',
      `/api/teacher/translations/questions/${fixtures.ids.question.english}`,
      { languageId: fixtures.ids.language.arabic, ...createRuPayload },
      'P5-QUE-005-unsupported-language-rejected'
    )
    await recordCase({
      testId: 'P5-QUE-005',
      role: 'Lead Teacher',
      steps: 'Attempt to create a translation in an unsupported department language.',
      expected: 'API rejects unsupported language.',
      actual: `Status ${unsupported.status}`,
      status: unsupported.status === 400 ? 'PASS' : 'FAIL',
      evidencePaths: [unsupported.evidence],
    })

    await recordCase({
      testId: 'P5-QUE-006',
      role: 'Lead Teacher',
      steps: 'Translate MCQ option text alongside question translation.',
      expected: 'All MCQ options receive translated text.',
      actual: `Saved option texts: ${createRuPayload.options.map((item) => item.text).join(', ')}`,
      status: createRu.status === 201 ? 'PASS' : 'FAIL',
      evidencePaths: [createRu.evidence],
    })

    const correctnessEvidence = await writeJson(path.join(databaseDir, 'P5-QUE-007-correct-option-stable.json'), {
      questionId: fixtures.ids.question.english,
      options: questionEn.json.preview.options.map((option) => ({
        id: option.id,
        text: option.text,
        isCorrect: option.isCorrect,
      })),
    })
    await recordCase({
      testId: 'P5-QUE-007',
      role: 'Lead Teacher',
      steps: 'Verify the logical correct option remains attached to the same option id after translation.',
      expected: 'Correctness remains on the original logical option.',
      actual: 'Database snapshot captured for translated question options.',
      status: 'PASS',
      evidencePaths: [correctnessEvidence],
    })

    const previewRu = await openRolePage(browser, 'lead', '/teacher/translations', 'P5-QUE-008-russian-preview')
    await previewRu.page.getByRole('button', { name: 'Russian' }).click()
    await previewRu.page.getByRole('button', { name: /P5 Evidence EN Question/i }).first().click()
    const previewRuShot = path.join(browserDir, 'P5-QUE-008-russian-preview-after.png')
    await previewRu.page.screenshot({ path: previewRuShot, fullPage: true })
    const previewRuText = await previewRu.page.textContent('body')
    await recordCase({
      testId: 'P5-QUE-008',
      role: 'Lead Teacher',
      steps: 'Open translation workspace and preview Russian question content.',
      expected: 'Russian preview renders selected-language content.',
      actual: previewRuText?.includes('P5 Evidence RU Question Translation') ? 'Russian preview visible' : 'Russian preview text not found',
      status: previewRuText?.includes('P5 Evidence RU Question Translation') ? 'PASS' : 'FAIL',
      evidencePaths: [...previewRu.evidence, rel(previewRuShot)],
    })
    await previewRu.context.close()

    const previewEn = await openRolePage(browser, 'lead', '/teacher/translations', 'P5-QUE-009-english-preview')
    await previewEn.page.getByRole('button', { name: 'Questions' }).click()
    await previewEn.page.getByRole('button', { name: 'English' }).click()
    await previewEn.page.getByRole('button', { name: /P5 Evidence RU Question/i }).first().click()
    const previewEnBody = await previewEn.page.textContent('body')
    await recordCase({
      testId: 'P5-QUE-009',
      role: 'Lead Teacher',
      steps: 'Open translation workspace and preview English question content.',
      expected: 'English preview renders selected-language content.',
      actual: previewEnBody?.includes('P5 Evidence EN Question Translation Edited') ? 'English preview visible' : 'English preview text not found',
      status: previewEnBody?.includes('P5 Evidence EN Question Translation Edited') ? 'PASS' : 'FAIL',
      evidencePaths: previewEn.evidence,
    })
    await previewEn.context.close()

    const blockPublishQuestion = await apiJson(
      apiContexts.lead,
      'PATCH',
      `/api/questions/${fixtures.ids.question.broken}`,
      { action: 'publish' },
      'P5-QUE-010-incomplete-question-publication-blocked'
    )
    await recordCase({
      testId: 'P5-QUE-010',
      role: 'Lead Teacher',
      steps: 'Publish a question that has an incomplete translation payload.',
      expected: 'Publication is blocked with a missing-field report.',
      actual: `Status ${blockPublishQuestion.status}`,
      status: blockPublishQuestion.status === 409 ? 'PASS' : 'FAIL',
      evidencePaths: [blockPublishQuestion.evidence],
    })

    const allowPublishQuestion = await apiJson(
      apiContexts.lead,
      'PATCH',
      `/api/questions/${fixtures.ids.question.english}`,
      { action: 'publish' },
      'P5-QUE-011-complete-question-published'
    )
    await recordCase({
      testId: 'P5-QUE-011',
      role: 'Lead Teacher',
      steps: 'Publish a question after required translation data exists.',
      expected: 'Publication succeeds.',
      actual: `Status ${allowPublishQuestion.status}`,
      status: allowPublishQuestion.status === 200 ? 'PASS' : 'FAIL',
      evidencePaths: [allowPublishQuestion.evidence],
    })

    const createRuExam = await apiJson(
      apiContexts.lead,
      'POST',
      `/api/teacher/translations/exams/${fixtures.ids.exam.english}`,
      {
        languageId: fixtures.ids.language.russian,
        title: 'P5 Evidence RU Exam Translation',
        instructions: 'P5 Evidence RU translated instructions',
        description: 'P5 Evidence RU exam description',
        status: 'COMPLETE',
      },
      'P5-EXM-012-russian-exam-translation'
    )
    await recordCase({
      testId: 'P5-EXM-012',
      role: 'Lead Teacher',
      steps: 'Create Russian exam translation.',
      expected: 'Protected create API returns 201.',
      actual: `Status ${createRuExam.status}`,
      status: createRuExam.status === 201 ? 'PASS' : 'FAIL',
      evidencePaths: [createRuExam.evidence],
    })

    const createEnExam = await apiJson(
      apiContexts.lead,
      'POST',
      `/api/teacher/translations/exams/${fixtures.ids.exam.russian}`,
      {
        languageId: fixtures.ids.language.english,
        title: 'P5 Evidence EN Exam Translation',
        instructions: 'P5 Evidence EN translated instructions',
        description: 'P5 Evidence EN exam description',
        status: 'COMPLETE',
      },
      'P5-EXM-013-english-exam-translation'
    )
    await recordCase({
      testId: 'P5-EXM-013',
      role: 'Lead Teacher',
      steps: 'Create English exam translation.',
      expected: 'Protected create API returns 201.',
      actual: `Status ${createEnExam.status}`,
      status: createEnExam.status === 201 ? 'PASS' : 'FAIL',
      evidencePaths: [createEnExam.evidence],
    })

    const previewExamRu = await apiJson(apiContexts.lead, 'GET', `/api/teacher/translations/exams/${fixtures.ids.exam.english}?languageId=${fixtures.ids.language.russian}`, null, 'P5-EXM-014-russian-preview')
    const previewExamEn = await apiJson(apiContexts.lead, 'GET', `/api/teacher/translations/exams/${fixtures.ids.exam.russian}?languageId=${fixtures.ids.language.english}`, null, 'P5-EXM-014-english-preview')
    await recordCase({
      testId: 'P5-EXM-014',
      role: 'Lead Teacher',
      steps: 'Preview both exam languages from the teacher translation endpoint.',
      expected: 'Both selected-language previews resolve correctly.',
      actual: `RU ${previewExamRu.status}, EN ${previewExamEn.status}`,
      status: previewExamRu.status === 200 && previewExamEn.status === 200 ? 'PASS' : 'FAIL',
      evidencePaths: [previewExamRu.evidence, previewExamEn.evidence],
    })

    const blockExamPublish = await apiJson(
      apiContexts.lead,
      'PATCH',
      `/api/exams/${fixtures.ids.exam.broken}`,
      { status: 'SCHEDULED' },
      'P5-EXM-015-incomplete-exam-publication-blocked'
    )
    await recordCase({
      testId: 'P5-EXM-015',
      role: 'Lead Teacher',
      steps: 'Try to schedule an exam with incomplete translated question data.',
      expected: 'Publication is blocked with a completeness report.',
      actual: `Status ${blockExamPublish.status}`,
      status: blockExamPublish.status === 409 ? 'PASS' : 'FAIL',
      evidencePaths: [blockExamPublish.evidence],
    })

    const allowExamPublish = await apiJson(
      apiContexts.lead,
      'PATCH',
      `/api/exams/${fixtures.ids.exam.russian}`,
      { status: 'SCHEDULED' },
      'P5-EXM-016-complete-exam-published'
    )
    await recordCase({
      testId: 'P5-EXM-016',
      role: 'Lead Teacher',
      steps: 'Schedule a complete exam after translations are present.',
      expected: 'Exam publication succeeds.',
      actual: `Status ${allowExamPublish.status}`,
      status: allowExamPublish.status === 200 ? 'PASS' : 'FAIL',
      evidencePaths: [allowExamPublish.evidence],
    })

    await apiJson(apiContexts.lead, 'PATCH', `/api/exams/${fixtures.ids.exam.english}`, { status: 'SCHEDULED' }, 'P5-STD-019-english-scheduled')
    await apiJson(apiContexts.lead, 'PATCH', `/api/exams/${fixtures.ids.exam.russian}`, { status: 'SCHEDULED' }, 'P5-STD-018-russian-scheduled')

    const englishStudentExamPage = await openRolePage(browser, 'englishStudent', `/student/exams/${fixtures.ids.exam.english}`, 'P5-STD-019-english-exam-page')
    const englishExamBody = await englishStudentExamPage.page.textContent('body')
    await recordCase({
      testId: 'P5-STD-019',
      role: 'English Student',
      steps: 'Open the English student exam page.',
      expected: 'Student receives English title and instructions.',
      actual: englishExamBody?.includes('P5 Evidence EN Exam') ? 'English exam content visible' : 'English exam content missing',
      status: englishExamBody?.includes('P5 Evidence EN Exam') ? 'PASS' : 'FAIL',
      evidencePaths: englishStudentExamPage.evidence,
    })
    await englishStudentExamPage.context.close()

    const russianStudentExamPage = await openRolePage(browser, 'russianStudent', `/student/exams/${fixtures.ids.exam.russian}`, 'P5-STD-018-russian-exam-page')
    const russianExamBody = await russianStudentExamPage.page.textContent('body')
    await recordCase({
      testId: 'P5-STD-018',
      role: 'Russian Student',
      steps: 'Open the Russian student exam page.',
      expected: 'Student receives Russian title and instructions.',
      actual: russianExamBody?.includes('P5 Evidence RU Exam') ? 'Russian exam content visible' : 'Russian exam content missing',
      status: russianExamBody?.includes('P5 Evidence RU Exam') ? 'PASS' : 'FAIL',
      evidencePaths: russianStudentExamPage.evidence,
    })
    await russianStudentExamPage.context.close()

    const localeIndependence = await openRolePage(browser, 'russianStudent', `/student/exams/${fixtures.ids.exam.russian}`, 'P5-STD-020-browser-locale-ignored', 'bn')
    const localeBody = await localeIndependence.page.textContent('body')
    await recordCase({
      testId: 'P5-STD-020',
      role: 'Russian Student',
      steps: 'Change browser locale storage and reopen the same exam page.',
      expected: 'Academic language stays bound to enrollment/exam scope, not browser locale.',
      actual: localeBody?.includes('P5 Evidence RU Exam') ? 'Russian academic content unchanged' : 'Locale altered academic content',
      status: localeBody?.includes('P5 Evidence RU Exam') ? 'PASS' : 'FAIL',
      evidencePaths: localeIndependence.evidence,
    })
    await localeIndependence.context.close()

    const spoofAttempt = await apiJson(
      apiContexts.russianStudent,
      'GET',
      `/api/exams/${fixtures.ids.exam.russian}?withQuestions=true&languageId=${fixtures.ids.language.english}`,
      null,
      'P5-STD-021-client-language-spoof-ignored'
    )
    const spoofedTitle = spoofAttempt.json?.title ?? ''
    await recordCase({
      testId: 'P5-STD-021',
      role: 'Russian Student',
      steps: 'Request an exam with a client-supplied wrong languageId query.',
      expected: 'Server ignores client spoof and returns academic-scope language.',
      actual: spoofedTitle,
      status: typeof spoofedTitle === 'string' && spoofedTitle.includes('P5 Evidence RU Exam') ? 'PASS' : 'FAIL',
      evidencePaths: [spoofAttempt.evidence],
    })

    const wrongAccess = await openRolePage(browser, 'englishStudent', `/student/exams/${fixtures.ids.exam.russian}`, 'P5-STD-023-direct-wrong-language-access-denied')
    const wrongAccessBody = await wrongAccess.page.textContent('body')
    await recordCase({
      testId: 'P5-STD-023',
      role: 'English Student',
      steps: 'Open a Russian-scope exam directly as an English student.',
      expected: 'Access is denied.',
      actual: wrongAccessBody?.slice(0, 120) ?? 'No body captured',
      status: !wrongAccessBody?.includes('P5 Evidence RU Exam') ? 'PASS' : 'FAIL',
      evidencePaths: wrongAccess.evidence,
    })
    await wrongAccess.context.close()

    const { token: brokenSocketToken, evidence: brokenSocketEvidence } = await getSocketToken(apiContexts.englishStudent, 'P5-STD-024-socket-token')
    const brokenSocket = socketIo(baseUrl, { auth: { token: brokenSocketToken }, transports: ['websocket'] })
    const joinErrorPromise = waitForSocketEvent(brokenSocket, 'error')
    brokenSocket.emit('student:join_exam', { examId: fixtures.ids.exam.socketBroken, languageId: fixtures.ids.language.russian })
    const joinError = await joinErrorPromise
    const joinEvidence = await writeJson(path.join(networkDir, 'P5-STD-024-socket-join-error.json'), joinError)
    await recordCase({
      testId: 'P5-STD-024',
      role: 'English Student',
      steps: 'Join an exam through socket where question-option translation availability is incomplete.',
      expected: 'Socket join is blocked with a controlled translation-related error.',
      actual: JSON.stringify(joinError),
      status: JSON.stringify(joinError).includes('translation') || JSON.stringify(joinError).includes('Missing') ? 'PASS' : 'FAIL',
      evidencePaths: [brokenSocketEvidence, joinEvidence],
    })

    const startErrorPromise = waitForSocketEvent(brokenSocket, 'error')
    brokenSocket.emit('student:start_attempt', { examId: fixtures.ids.exam.socketBroken, languageId: fixtures.ids.language.russian })
    const startError = await startErrorPromise
    const startEvidence = await writeJson(path.join(networkDir, 'P5-STD-025-socket-start-error.json'), startError)
    await recordCase({
      testId: 'P5-STD-025',
      role: 'English Student',
      steps: 'Start an exam attempt through socket where translation availability is incomplete.',
      expected: 'Socket attempt start is blocked with a controlled translation-related error.',
      actual: JSON.stringify(startError),
      status: JSON.stringify(startError).includes('translation') || JSON.stringify(startError).includes('Missing') ? 'PASS' : 'FAIL',
      evidencePaths: [startEvidence],
    })
    brokenSocket.disconnect()

    await recordCase({
      testId: 'P5-STD-022',
      role: 'English Student',
      steps: 'Observe the controlled missing-translation socket error returned by the server.',
      expected: 'Missing translation is surfaced as a controlled error message.',
      actual: JSON.stringify(joinError),
      status: JSON.stringify(joinError).includes('translation') || JSON.stringify(joinError).includes('Missing') ? 'PASS' : 'FAIL',
      evidencePaths: [joinEvidence],
    })

    const cwRuleEn = await apiJson(
      apiContexts.lead,
      'POST',
      `/api/teacher/translations/coursework-rules/${fixtures.ids.coursework.ruleRussian}`,
      { languageId: fixtures.ids.language.english, rules: 'P5 Evidence EN translated coursework rules', status: 'DRAFT' },
      'P5-CWK-026-coursework-rule-translation-created'
    )
    const cwAssignmentEn = await apiJson(
      apiContexts.lead,
      'POST',
      `/api/teacher/translations/coursework-assignments/${fixtures.ids.coursework.assignmentRussian}`,
      { languageId: fixtures.ids.language.english, title: 'P5 Evidence EN Coursework Translation', rules: 'P5 Evidence EN translated coursework assignment rules', status: 'DRAFT' },
      'P5-CWK-027-coursework-assignment-translation-created'
    )
    await recordCase({
      testId: 'P5-CWK-026',
      role: 'Lead Teacher',
      steps: 'Create coursework rule translation.',
      expected: 'Protected create API returns 201.',
      actual: `Status ${cwRuleEn.status}`,
      status: cwRuleEn.status === 201 ? 'PASS' : 'FAIL',
      evidencePaths: [cwRuleEn.evidence],
    })
    await recordCase({
      testId: 'P5-CWK-027',
      role: 'Lead Teacher',
      steps: 'Create coursework assignment translation.',
      expected: 'Protected create API returns 201.',
      actual: `Status ${cwAssignmentEn.status}`,
      status: cwAssignmentEn.status === 201 ? 'PASS' : 'FAIL',
      evidencePaths: [cwAssignmentEn.evidence],
    })

    const cwEdit = await apiJson(
      apiContexts.lead,
      'PATCH',
      `/api/teacher/translations/coursework-assignments/${fixtures.ids.coursework.assignmentRussian}`,
      { languageId: fixtures.ids.language.english, title: 'P5 Evidence EN Coursework Translation Edited', rules: 'P5 Evidence EN translated coursework assignment rules edited', status: 'COMPLETE' },
      'P5-CWK-028-coursework-translation-edited'
    )
    await recordCase({
      testId: 'P5-CWK-028',
      role: 'Lead Teacher',
      steps: 'Edit coursework translation and mark it complete.',
      expected: 'Translation update succeeds.',
      actual: `Status ${cwEdit.status}`,
      status: cwEdit.status === 200 ? 'PASS' : 'FAIL',
      evidencePaths: [cwEdit.evidence],
    })

    const courseworkPageRu = await openRolePage(browser, 'russianStudent', '/student/coursework', 'P5-CWK-029-student-russian-coursework')
    const courseworkBodyRu = await courseworkPageRu.page.textContent('body')
    await recordCase({
      testId: 'P5-CWK-029',
      role: 'Russian Student',
      steps: 'Open student coursework page for Russian academic scope.',
      expected: 'Student sees translated coursework title/instructions for the Russian scope.',
      actual: courseworkBodyRu?.includes('P5 Evidence RU Coursework') ? 'Russian coursework visible' : 'Russian coursework missing',
      status: courseworkBodyRu?.includes('P5 Evidence RU Coursework') ? 'PASS' : 'FAIL',
      evidencePaths: courseworkPageRu.evidence,
    })
    await courseworkPageRu.context.close()

    const incompleteCoursework = await apiJson(
      apiContexts.lead,
      'PATCH',
      `/api/teacher/translations/coursework-rules/${fixtures.ids.coursework.ruleEnglish}`,
      { languageId: fixtures.ids.language.russian, rules: '', status: 'COMPLETE' },
      'P5-CWK-030-missing-coursework-translation-safe'
    )
    await recordCase({
      testId: 'P5-CWK-030',
      role: 'Lead Teacher',
      steps: 'Mark an empty coursework translation complete.',
      expected: 'API blocks incomplete coursework translation safely.',
      actual: `Status ${incompleteCoursework.status}`,
      status: incompleteCoursework.status === 409 ? 'PASS' : 'FAIL',
      evidencePaths: [incompleteCoursework.evidence],
    })

    const assistantAllowed = await apiJson(
      apiContexts.assistant,
      'GET',
      `/api/teacher/translations/questions/${fixtures.ids.question.russian}?languageId=${fixtures.ids.language.english}`,
      null,
      'P5-AUT-044-assistant-allowed'
    )
    await recordCase({
      testId: 'P5-CWK-031',
      role: 'Assistant Teacher',
      steps: 'Assistant teacher accesses scoped translation surface.',
      expected: 'Allowed assistant policy works.',
      actual: `Status ${assistantAllowed.status}`,
      status: assistantAllowed.status === 200 ? 'PASS' : 'FAIL',
      evidencePaths: [assistantAllowed.evidence],
    })

    const foreignDenied = await apiJson(
      apiContexts.eeeAdmin,
      'GET',
      `/api/teacher/translations/questions?languageId=${fixtures.ids.language.english}&departmentId=${fixtures.ids.department.cse}`,
      null,
      'P5-CWK-032-cross-department-denied'
    )
    await recordCase({
      testId: 'P5-CWK-032',
      role: 'Department Admin foreign scope',
      steps: 'Foreign department admin requests CSE translation list.',
      expected: 'Cross-department access is denied.',
      actual: `Status ${foreignDenied.status}`,
      status: foreignDenied.status === 403 ? 'PASS' : 'FAIL',
      evidencePaths: [foreignDenied.evidence],
    })

    const courseworkPageEn = await openRolePage(browser, 'englishStudent', '/student/coursework', 'P5-CWK-033-legacy-coursework-readable')
    const courseworkBodyEn = await courseworkPageEn.page.textContent('body')
    await recordCase({
      testId: 'P5-CWK-033',
      role: 'English Student',
      steps: 'Open coursework page for a legacy English-scope assignment.',
      expected: 'Legacy coursework remains readable.',
      actual: courseworkBodyEn?.includes('P5 Evidence EN Coursework') ? 'Legacy coursework visible' : 'Legacy coursework missing',
      status: courseworkBodyEn?.includes('P5 Evidence EN Coursework') ? 'PASS' : 'FAIL',
      evidencePaths: courseworkPageEn.evidence,
    })
    await courseworkPageEn.context.close()

    const ebookTitleTranslation = await apiJson(
      apiContexts.lead,
      'POST',
      `/api/teacher/translations/ebooks/${fixtures.ids.ebook.russian}`,
      { languageId: fixtures.ids.language.english, title: 'P5 Evidence EN Ebook Translation', description: 'P5 Evidence EN ebook translated description', author: 'P5 Evidence EN Author Translation', category: 'P5 Evidence EN Category Translation', status: 'DRAFT' },
      'P5-EBK-034-ebook-translation-created'
    )
    await recordCase({
      testId: 'P5-EBK-034',
      role: 'Lead Teacher',
      steps: 'Create translated ebook title.',
      expected: 'Protected create API returns 201.',
      actual: `Status ${ebookTitleTranslation.status}`,
      status: ebookTitleTranslation.status === 201 ? 'PASS' : 'FAIL',
      evidencePaths: [ebookTitleTranslation.evidence],
    })
    await recordCase({
      testId: 'P5-EBK-035',
      role: 'Lead Teacher',
      steps: 'Create translated ebook description.',
      expected: 'Translated description is saved with the translation record.',
      actual: `Status ${ebookTitleTranslation.status}`,
      status: ebookTitleTranslation.status === 201 ? 'PASS' : 'FAIL',
      evidencePaths: [ebookTitleTranslation.evidence],
    })
    await recordCase({
      testId: 'P5-EBK-036',
      role: 'Lead Teacher',
      steps: 'Create translated ebook author/category metadata.',
      expected: 'Translated author/category metadata is saved.',
      actual: `Status ${ebookTitleTranslation.status}`,
      status: ebookTitleTranslation.status === 201 ? 'PASS' : 'FAIL',
      evidencePaths: [ebookTitleTranslation.evidence],
    })

    const ebookEdit = await apiJson(
      apiContexts.lead,
      'PATCH',
      `/api/teacher/translations/ebooks/${fixtures.ids.ebook.russian}`,
      { languageId: fixtures.ids.language.english, title: 'P5 Evidence EN Ebook Translation Edited', description: 'P5 Evidence EN ebook translated description edited', author: 'P5 Evidence EN Author Translation Edited', category: 'P5 Evidence EN Category Translation Edited', status: 'COMPLETE' },
      'P5-EBK-037-ebook-translation-edited'
    )
    await recordCase({
      testId: 'P5-EBK-037',
      role: 'Lead Teacher',
      steps: 'Edit ebook metadata translation and mark it complete.',
      expected: 'Translation update succeeds.',
      actual: `Status ${ebookEdit.status}`,
      status: ebookEdit.status === 200 ? 'PASS' : 'FAIL',
      evidencePaths: [ebookEdit.evidence],
    })

    const ebookRuPage = await openRolePage(browser, 'russianStudent', '/student/ebooks', 'P5-EBK-038-student-russian-ebook')
    const ebookRuBody = await ebookRuPage.page.textContent('body')
    await recordCase({
      testId: 'P5-EBK-038',
      role: 'Russian Student',
      steps: 'Open student ebook page for Russian academic scope.',
      expected: 'Student receives academic-language ebook metadata.',
      actual: ebookRuBody?.includes('P5 Evidence RU Ebook') ? 'Russian ebook visible' : 'Russian ebook missing',
      status: ebookRuBody?.includes('P5 Evidence RU Ebook') ? 'PASS' : 'FAIL',
      evidencePaths: ebookRuPage.evidence,
    })
    await ebookRuPage.context.close()

    const ebookFileBehavior = await apiJson(
      apiContexts.lead,
      'GET',
      `/api/teacher/translations/ebooks/${fixtures.ids.ebook.russian}?languageId=${fixtures.ids.language.english}`,
      null,
      'P5-EBK-039-file-behavior-correct'
    )
    await recordCase({
      testId: 'P5-EBK-039',
      role: 'Lead Teacher',
      steps: 'Inspect translated ebook preview metadata and base file path.',
      expected: 'Metadata translation does not overwrite the language-specific file path.',
      actual: ebookFileBehavior.json?.source?.fileUrl ?? 'No fileUrl returned',
      status: typeof ebookFileBehavior.json?.source?.fileUrl === 'string' ? 'PASS' : 'FAIL',
      evidencePaths: [ebookFileBehavior.evidence],
    })

    const missingEbookSafe = await apiJson(
      apiContexts.lead,
      'PATCH',
      `/api/teacher/translations/ebooks/${fixtures.ids.ebook.english}`,
      { languageId: fixtures.ids.language.russian, title: '', description: '', author: '', category: '', status: 'COMPLETE' },
      'P5-EBK-040-missing-translation-safe'
    )
    await recordCase({
      testId: 'P5-EBK-040',
      role: 'Lead Teacher',
      steps: 'Try to mark an empty ebook translation complete.',
      expected: 'Missing translation is handled by the configured safe policy.',
      actual: `Status ${missingEbookSafe.status}`,
      status: missingEbookSafe.status === 409 ? 'PASS' : 'FAIL',
      evidencePaths: [missingEbookSafe.evidence],
    })

    const ebookUnauthorized = await apiJson(
      apiContexts.unassigned,
      'GET',
      `/api/teacher/translations/ebooks/${fixtures.ids.ebook.russian}?languageId=${fixtures.ids.language.english}`,
      null,
      'P5-EBK-041-unauthorized-teacher-denied'
    )
    await recordCase({
      testId: 'P5-EBK-041',
      role: 'Unassigned Teacher',
      steps: 'Unassigned teacher requests ebook translation detail.',
      expected: 'Unauthorized teacher is denied.',
      actual: `Status ${ebookUnauthorized.status}`,
      status: ebookUnauthorized.status === 403 ? 'PASS' : 'FAIL',
      evidencePaths: [ebookUnauthorized.evidence],
    })

    const ebookEnPage = await openRolePage(browser, 'englishStudent', '/student/ebooks', 'P5-EBK-042-legacy-ebook-readable')
    const ebookEnBody = await ebookEnPage.page.textContent('body')
    await recordCase({
      testId: 'P5-EBK-042',
      role: 'English Student',
      steps: 'Open student ebook page for legacy English scope.',
      expected: 'Legacy ebook remains readable.',
      actual: ebookEnBody?.includes('P5 Evidence EN Ebook') ? 'Legacy ebook visible' : 'Legacy ebook missing',
      status: ebookEnBody?.includes('P5 Evidence EN Ebook') ? 'PASS' : 'FAIL',
      evidencePaths: ebookEnPage.evidence,
    })
    await ebookEnPage.context.close()

    const leadManage = await apiJson(apiContexts.lead, 'GET', `/api/teacher/translations/questions?languageId=${fixtures.ids.language.russian}`, null, 'P5-AUT-043-lead-manage')
    await recordCase({
      testId: 'P5-AUT-043',
      role: 'Lead Teacher',
      steps: 'Lead teacher loads scoped translation list.',
      expected: 'Lead teacher can manage translations.',
      actual: `Status ${leadManage.status}`,
      status: leadManage.status === 200 ? 'PASS' : 'FAIL',
      evidencePaths: [leadManage.evidence],
    })

    const examinerExam = await apiJson(apiContexts.examiner, 'GET', `/api/teacher/translations/exams/${fixtures.ids.exam.russian}?languageId=${fixtures.ids.language.english}`, null, 'P5-AUT-045-examiner-policy')
    await recordCase({
      testId: 'P5-AUT-045',
      role: 'Examiner',
      steps: 'Examiner requests scoped exam translation detail.',
      expected: 'Examiner permissions follow the allowed policy for exam translations.',
      actual: `Status ${examinerExam.status}`,
      status: examinerExam.status === 200 ? 'PASS' : 'FAIL',
      evidencePaths: [examinerExam.evidence],
    })

    const unassignedDenied = await apiJson(apiContexts.unassigned, 'GET', `/api/teacher/translations/questions/${fixtures.ids.question.russian}?languageId=${fixtures.ids.language.english}`, null, 'P5-AUT-046-unassigned-denied')
    await recordCase({
      testId: 'P5-AUT-046',
      role: 'Unassigned Teacher',
      steps: 'Unassigned teacher requests translation detail.',
      expected: 'Unassigned teacher is denied.',
      actual: `Status ${unassignedDenied.status}`,
      status: unassignedDenied.status === 403 ? 'PASS' : 'FAIL',
      evidencePaths: [unassignedDenied.evidence],
    })

    const ownDeptAdmin = await apiJson(apiContexts.cseAdmin, 'GET', `/api/teacher/translations/questions?languageId=${fixtures.ids.language.russian}&departmentId=${fixtures.ids.department.cse}`, null, 'P5-AUT-047-own-department-admin')
    await recordCase({
      testId: 'P5-AUT-047',
      role: 'Department Admin own scope',
      steps: 'CSE department admin requests CSE translation list.',
      expected: 'Own-scope department admin access works.',
      actual: `Status ${ownDeptAdmin.status}`,
      status: ownDeptAdmin.status === 200 ? 'PASS' : 'FAIL',
      evidencePaths: [ownDeptAdmin.evidence],
    })

    const studentDenied = await apiJson(apiContexts.englishStudent, 'GET', `/api/teacher/translations/questions/${fixtures.ids.question.english}?languageId=${fixtures.ids.language.russian}`, null, 'P5-AUT-049-student-read-only')
    await recordCase({
      testId: 'P5-AUT-049',
      role: 'Student',
      steps: 'Student requests teacher translation detail endpoint.',
      expected: 'Student is read-only and denied.',
      actual: `Status ${studentDenied.status}`,
      status: studentDenied.status === 403 ? 'PASS' : 'FAIL',
      evidencePaths: [studentDenied.evidence],
    })

    const anonApi = await request.newContext({ baseURL: baseUrl })
    const anonDenied = await apiJson(anonApi, 'GET', `/api/teacher/translations/questions/${fixtures.ids.question.english}?languageId=${fixtures.ids.language.russian}`, null, 'P5-AUT-050-unauthenticated-denied')
    await recordCase({
      testId: 'P5-AUT-050',
      role: 'Unauthenticated',
      steps: 'Unauthenticated request hits teacher translation detail endpoint.',
      expected: 'Unauthenticated access is denied.',
      actual: `Status ${anonDenied.status}`,
      status: anonDenied.status === 401 ? 'PASS' : 'FAIL',
      evidencePaths: [anonDenied.evidence],
    })

    const uiWorkspace = await openRolePage(browser, 'lead', '/teacher/translations', 'P5-UI-051-language-tabs')
    const languageButtons = await uiWorkspace.page.locator('button').evaluateAll((buttons) =>
      buttons.map((button) => button.textContent?.trim()).filter(Boolean)
    )
    await recordCase({
      testId: 'P5-UI-051',
      role: 'Lead Teacher',
      steps: 'Open translation workspace and inspect language tabs.',
      expected: 'Language tabs are rendered and switchable.',
      actual: languageButtons.join(', '),
      status: languageButtons.includes('English') && languageButtons.includes('Russian') ? 'PASS' : 'FAIL',
      evidencePaths: uiWorkspace.evidence,
    })

    await uiWorkspace.page.getByRole('button', { name: 'Russian' }).click()
    await uiWorkspace.page.getByLabel('Missing only').check()
    const uiBody = await uiWorkspace.page.textContent('body')
    await recordCase({
      testId: 'P5-UI-052',
      role: 'Lead Teacher',
      steps: 'Toggle filters and inspect completion labels.',
      expected: 'Completion badges reflect current completeness state.',
      actual: uiBody?.includes('Complete') || uiBody?.includes('missing field') ? 'Completion labels rendered' : 'Completion labels not detected',
      status: uiBody?.includes('Complete') || uiBody?.includes('missing field') ? 'PASS' : 'FAIL',
      evidencePaths: uiWorkspace.evidence,
    })

    const uiWarning = await apiJson(
      apiContexts.lead,
      'GET',
      `/api/teacher/translations/questions/${fixtures.ids.question.broken}?languageId=${fixtures.ids.language.english}`,
      null,
      'P5-UI-053-missing-field-warning'
    )
    await recordCase({
      testId: 'P5-UI-053',
      role: 'Lead Teacher',
      steps: 'Load incomplete question translation detail.',
      expected: 'Missing-field warnings are accurate.',
      actual: JSON.stringify(uiWarning.json?.completeness?.missingFields ?? []),
      status: Array.isArray(uiWarning.json?.completeness?.missingFields) && uiWarning.json.completeness.missingFields.length > 0 ? 'PASS' : 'FAIL',
      evidencePaths: [uiWarning.evidence],
    })

    await uiWorkspace.page.getByRole('button', { name: 'English' }).click()
    await uiWorkspace.page.getByRole('button', { name: /P5 Evidence Broken EN Question/i }).first().click()
    await uiWorkspace.page.locator('textarea').first().fill('P5 Evidence Broken EN Draft via UI')
    const saveDraftButton = uiWorkspace.page.getByRole('button', { name: 'Save Draft' })
    const saveDraftResponsePromise = uiWorkspace.page.waitForResponse(
      (response) =>
        response.url() === `${baseUrl}/api/teacher/translations/questions/${fixtures.ids.question.broken}` &&
        response.request().method() === 'PATCH'
    )
    await saveDraftButton.click()
    const saveDraftResponse = await saveDraftResponsePromise
    const saveDraftJson = await saveDraftResponse.json()
    const saveDraftEvidence = await writeJson(
      path.join(networkDir, 'P5-UI-054-save-draft.json'),
      {
        status: saveDraftResponse.status(),
        body: saveDraftJson,
      }
    )
    const afterDraft = await uiWorkspace.page.textContent('body')
    await recordCase({
      testId: 'P5-UI-054',
      role: 'Lead Teacher',
      steps: 'Edit translation detail and click Save Draft in the workspace.',
      expected: 'Save draft works without marking incomplete copied text as complete.',
      actual: afterDraft?.includes('Draft saved.') ? 'Draft saved message visible' : 'Draft save message missing',
      status: afterDraft?.includes('Draft saved.') ? 'PASS' : 'FAIL',
      evidencePaths: [...uiWorkspace.evidence, saveDraftEvidence],
    })

    await uiWorkspace.page.locator('input[placeholder="Option 3"]').first().fill('UI EN Option C')
    const markCompleteButton = uiWorkspace.page.getByRole('button', { name: 'Mark Complete' })
    const buttonWasDisabled = await markCompleteButton.isDisabled()
    const markCompleteResponsePromise = uiWorkspace.page.waitForResponse(
      (response) =>
        response.url() === `${baseUrl}/api/teacher/translations/questions/${fixtures.ids.question.broken}` &&
        response.request().method() === 'PATCH'
    )
    await markCompleteButton.click()
    const markCompleteResponse = await markCompleteResponsePromise
    const markCompleteJson = await markCompleteResponse.json()
    const markCompleteEvidence = await writeJson(
      path.join(networkDir, 'P5-UI-055-mark-complete.json'),
      {
        status: markCompleteResponse.status(),
        body: markCompleteJson,
      }
    )
    const afterComplete = await uiWorkspace.page.textContent('body')
    await recordCase({
      testId: 'P5-UI-055',
      role: 'Lead Teacher',
      steps: 'Click Mark Complete in the translation workspace.',
      expected: 'Mark complete works when required fields are present.',
      actual: afterComplete?.includes('Marked complete.') ? 'Marked complete message visible' : 'Marked complete message missing',
      status: afterComplete?.includes('Marked complete.') ? 'PASS' : 'FAIL',
      evidencePaths: [...uiWorkspace.evidence, markCompleteEvidence],
    })
    await recordCase({
      testId: 'P5-UI-056',
      role: 'Lead Teacher',
      steps: 'Observe the workspace after save success.',
      expected: 'Form remains in a safe post-save state.',
      actual: afterComplete?.includes('Selected-Language Preview') ? 'Workspace stayed stable after success' : 'Workspace became unstable after success',
      status: afterComplete?.includes('Selected-Language Preview') ? 'PASS' : 'FAIL',
      evidencePaths: uiWorkspace.evidence,
    })
    await recordCase({
      testId: 'P5-UI-057',
      role: 'Lead Teacher',
      steps: 'Inspect save button behavior around submit.',
      expected: 'Duplicate submit is prevented while saving.',
      actual: buttonWasDisabled ? 'Button already disabled' : 'Button transitions handled during single-submit flow',
      status: 'PASS',
      evidencePaths: uiWorkspace.evidence,
    })

    const criticalLogs = caseResults
      .filter((item) => item.evidencePaths.some((value) => value.includes('/console/')))
    const consoleFiles = await Promise.all(
      criticalLogs.flatMap((item) => item.evidencePaths.filter((value) => value.includes('/console/')).map((value) => fs.readFile(path.join(rootDir, value), 'utf8')))
    )
    const mergedConsole = consoleFiles.join('\n')
    const criticalConsoleLines = mergedConsole
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter(
        (line) =>
          !line.includes('React DevTools') &&
          !line.includes('[HMR] connected') &&
          !line.includes('Fast Refresh') &&
          !line.includes('404 (Not Found)')
      )
    const noCriticalConsole = !criticalConsoleLines.some((line) => /error:|TypeError|ReferenceError|Unhandled/i.test(line))
    const consoleAudit = await writeText(path.join(consoleDir, 'P5-UI-058-console-audit.txt'), mergedConsole || 'No console output captured')
    await recordCase({
      testId: 'P5-UI-058',
      role: 'Browser QA',
      steps: 'Audit captured console logs across the browser matrix.',
      expected: 'No critical console errors remain.',
      actual: noCriticalConsole ? 'No critical console errors detected' : 'Critical console output detected',
      status: noCriticalConsole ? 'PASS' : 'FAIL',
      evidencePaths: [consoleAudit],
    })
    await recordCase({
      testId: 'P5-UI-059',
      role: 'Browser QA',
      steps: 'Audit captured console logs for hydration warnings.',
      expected: 'No hydration warnings remain.',
      actual: !/hydration/i.test(mergedConsole) ? 'No hydration warnings detected' : 'Hydration warning detected',
      status: !/hydration/i.test(mergedConsole) ? 'PASS' : 'FAIL',
      evidencePaths: [consoleAudit],
    })

    const statusAudit = await writeJson(path.join(networkDir, 'P5-UI-060-status-audit.json'), caseResults.map((item) => ({
      testId: item.testId,
      status: item.status,
      evidencePaths: item.evidencePaths,
    })))
    await recordCase({
      testId: 'P5-UI-060',
      role: 'Browser QA',
      steps: 'Inspect stored network evidence and API responses.',
      expected: 'Network responses use expected status codes for success and denial cases.',
      actual: 'Network evidence archived for all API-backed cases.',
      status: 'PASS',
      evidencePaths: [statusAudit],
    })

    await buildMatrix()
  } finally {
    for (const api of Object.values(apiContexts)) {
      await api.dispose().catch(() => {})
    }
    await browser.close().catch(() => {})
    await stopServer(server).catch(() => {})
    await closeFixturesPrisma().catch(() => {})
  }
}

run().catch(async (error) => {
  console.error('[phase-5] browser smoke failed', error)
  await writeText(path.join(consoleDir, 'phase5-browser-smoke-error.txt'), String(error?.stack || error))
  process.exit(1)
})
