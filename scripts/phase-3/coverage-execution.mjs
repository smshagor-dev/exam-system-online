import fs from 'fs/promises'
import path from 'path'
import { readFileSync, createWriteStream } from 'fs'
import { spawn } from 'child_process'
import { chromium, request } from 'playwright'
import { io as socketIo } from 'socket.io-client'
import bcrypt from 'bcryptjs'
import {
  PrismaClient,
  ResultStatus,
  StudentAcademicHistoryEventType,
  StudentEnrollmentStatus,
  StudentLeaveType,
  StudentTransferType,
} from '@prisma/client'

const PORT = Number(process.env.PHASE3_PORT || '3103')
const baseUrl = process.env.PHASE3_BASE_URL || `http://127.0.0.1:${PORT}`
const rootDir = process.cwd()
const docsDir = path.join(rootDir, 'docs', 'phase-3')
const evidenceDir = path.join(docsDir, 'evidence')
const browserDir = path.join(evidenceDir, 'browser')
const networkDir = path.join(evidenceDir, 'network')
const consoleDir = path.join(evidenceDir, 'console')
const databaseDir = path.join(evidenceDir, 'database')
const summaryPath = path.join(evidenceDir, 'coverage-execution-summary.json')
const serverOutPath = path.join(evidenceDir, 'phase3-final-browser-server.out.log')
const serverErrPath = path.join(evidenceDir, 'phase3-final-browser-server.err.log')

const roles = {
  superAdmin: { email: 'admin@test.local', password: 'Admin@123', landing: '/admin' },
  cseAdmin: { email: 'cse.admin@test.local', password: 'Admin@123', landing: '/admin' },
  eeeAdmin: { email: 'eee.admin@test.local', password: 'Admin@123', landing: '/admin' },
  teacher: { email: 'teacher@test.local', password: 'Teacher@123', landing: '/teacher' },
}

const caseResults = []
const browserStorageStates = {}

function nowIso() {
  return new Date().toISOString()
}

async function ensureDirs() {
  await fs.mkdir(browserDir, { recursive: true })
  await fs.mkdir(networkDir, { recursive: true })
  await fs.mkdir(consoleDir, { recursive: true })
  await fs.mkdir(databaseDir, { recursive: true })
}

async function getBaseDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const envRaw = await fs.readFile(path.join(rootDir, '.env'), 'utf8')
  const match = envRaw.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)
  if (!match) {
    throw new Error('DATABASE_URL is required for coverage execution.')
  }
  return match[1]
}

function withDatabaseName(databaseUrl, suffix) {
  const [base, query = ''] = databaseUrl.split('?')
  const dbName = base.slice(base.lastIndexOf('/') + 1)
  const root = base.slice(0, base.lastIndexOf('/') + 1)
  return `${root}${dbName}${suffix}${query ? `?${query}` : ''}`
}

async function waitForServer(targetUrl, timeoutMs = 90000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${targetUrl}/api/auth/csrf`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for server at ${targetUrl}`)
}

async function startServer(databaseUrl) {
  const stdout = createWriteStream(serverOutPath, { flags: 'w' })
  const stderr = createWriteStream(serverErrPath, { flags: 'w' })
  const child = spawn('node', ['server.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: databaseUrl,
      NEXTAUTH_URL: baseUrl,
      AUTH_URL: baseUrl,
      NEXT_PUBLIC_SOCKET_URL: baseUrl,
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.pipe(stdout)
  child.stderr.pipe(stderr)
  await waitForServer(baseUrl)
  return child
}

function compact(value, max = 260) {
  if (value == null) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.replace(/\s+/g, ' ').slice(0, max)
}

function evidenceRef(...parts) {
  return path.join(...parts).replace(`${rootDir}${path.sep}`, '').replace(/\\/g, '/')
}

function pushCase(id, category, status, actual, evidence = []) {
  caseResults.push({
    id,
    category,
    status,
    actual,
    evidence,
    executedAt: nowIso(),
  })
}

function recordPass(ids, category, actual, evidence) {
  for (const id of ids) {
    pushCase(id, category, 'PASS', actual, evidence)
  }
}

function recordFail(ids, category, actual, evidence = []) {
  for (const id of ids) {
    pushCase(id, category, 'FAIL', actual, evidence)
  }
}

async function writeText(filePath, text) {
  await fs.writeFile(filePath, text, 'utf8')
  return evidenceRef(filePath)
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2))
  return evidenceRef(filePath)
}

async function persistSummary(extra = {}) {
  const totals = {
    PASS: caseResults.filter((item) => item.status === 'PASS').length,
    FAIL: caseResults.filter((item) => item.status === 'FAIL').length,
    BLOCKED: caseResults.filter((item) => item.status === 'BLOCKED').length,
  }

  await writeJson(summaryPath, {
    generatedAt: nowIso(),
    baseUrl,
    totals,
    ...extra,
    results: caseResults,
  })
}

async function createAuthenticatedRequest(email, password) {
  const api = await request.newContext({ baseURL: baseUrl })
  const csrfResponse = await api.get('/api/auth/csrf')
  const csrfPayload = await csrfResponse.json()
  const callbackResponse = await api.post('/api/auth/callback/credentials', {
    form: {
      email,
      password,
      csrfToken: csrfPayload.csrfToken,
      callbackUrl: `${baseUrl}/`,
      json: 'true',
    },
  })
  if (callbackResponse.status() !== 200) {
    throw new Error(`Credential callback failed for ${email} with ${callbackResponse.status()}`)
  }
  return api
}

async function apiCall(api, method, pathname, body) {
  const response = await api.fetch(pathname, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    data: body,
  })

  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}

  return {
    status: response.status(),
    text,
    json,
  }
}

async function getSocketToken(api) {
  const response = await api.fetch('/api/socket/token', { method: 'GET' })
  const payload = await response.json()
  if (response.status() !== 200 || !payload?.token) {
    throw new Error(`Socket token request failed with ${response.status()}`)
  }
  return payload.token
}

function waitForSocketEvent(socket, eventName, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler)
      reject(new Error(`Timed out waiting for socket event ${eventName}`))
    }, timeoutMs)

    const handler = (payload) => {
      clearTimeout(timer)
      socket.off(eventName, handler)
      resolve(payload)
    }

    socket.on(eventName, handler)
  })
}

async function captureBrowser(browser, roleKey, name, pathname, assertion) {
  const context = await browser.newContext({
    storageState: browserStorageStates[roleKey],
  })
  const page = await context.newPage()
  const consoleMessages = []
  const responses = []

  page.on('console', (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  })
  page.on('response', (response) => {
    const url = response.url()
    if (url.startsWith(baseUrl)) {
      responses.push(`${response.status()} ${url.replace(baseUrl, '')}`)
    }
  })

  await page.addInitScript(() => {
    window.localStorage.setItem('examflow.siteLocale', 'en')
  })
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'networkidle' })
  const actual = await assertion(page)
  const screenshotPath = path.join(browserDir, `${name}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  const consolePath = path.join(consoleDir, `${name}.txt`)
  const networkPath = path.join(networkDir, `${name}.txt`)
  const metaPath = path.join(browserDir, `${name}.json`)

  const consoleEvidence = await writeText(consolePath, consoleMessages.join('\n') || 'No console messages captured')
  const networkEvidence = await writeText(networkPath, responses.join('\n') || 'No same-origin responses captured')
  const screenshotEvidence = evidenceRef(screenshotPath)
  await writeJson(metaPath, {
    role: roleKey,
    pathname,
    actual,
    finalUrl: page.url(),
    title: await page.title(),
  })

  await context.close()
  return {
    actual,
    evidence: [screenshotEvidence, consoleEvidence, networkEvidence, evidenceRef(metaPath)],
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function fieldBlock(page, label) {
  return page
    .locator('label')
    .filter({ hasText: new RegExp(`^${escapeRegex(label)}\\s*\\*?$`) })
    .last()
    .locator('xpath=..')
}

async function selectField(page, label, value) {
  const select = fieldBlock(page, label).locator('select').first()
  await select.selectOption(value)
}

async function saveApiEvidence(name, method, pathname, body, response, dbSnapshot = null) {
  const networkPath = path.join(networkDir, `${name}.txt`)
  const databasePath = path.join(databaseDir, `${name}.json`)

  const networkEvidence = await writeText(networkPath, [
    `${method} ${pathname}`,
    body ? `request=${JSON.stringify(body, null, 2)}` : 'request=<none>',
    `status=${response.status}`,
    `body=${compact(response.json ?? response.text, 600)}`,
  ].join('\n\n'))

  const evidence = [networkEvidence]
  if (dbSnapshot) {
    evidence.push(await writeJson(databasePath, dbSnapshot))
  }
  return evidence
}

async function createAttemptAndResult(prisma, studentProfileId, examId, status, marks = 88) {
  const existing = await prisma.studentExamAttempt.findFirst({
    where: { examId, studentId: studentProfileId },
    select: { id: true },
  })
  if (existing) {
    const result = await prisma.examResult.findFirst({
      where: { examId, studentId: studentProfileId },
      select: { id: true },
    })
    return result?.id ?? existing.id
  }

  const attempt = await prisma.studentExamAttempt.create({
    data: {
      examId,
      studentId: studentProfileId,
      status: 'SUBMITTED',
      startedAt: new Date(Date.now() - 45 * 60 * 1000),
      submittedAt: new Date(Date.now() - 10 * 60 * 1000),
    },
  })

  const result = await prisma.examResult.create({
    data: {
      examId,
      attemptId: attempt.id,
      studentId: studentProfileId,
      totalMarks: 100,
      marksObtained: marks,
      percentage: marks,
      grade: marks >= 80 ? 'A' : 'B',
      isPassed: true,
      status,
      publishedAt: status === ResultStatus.PUBLISHED ? new Date() : null,
    },
  })

  return result.id
}

async function seedStudent(prisma, slug, departmentId) {
  const passwordHash = bcrypt.hashSync('Student@123', 10)
  const user = await prisma.user.create({
    data: {
      email: `phase3.exec.${slug}.${Date.now()}@student.test`,
      password: passwordHash,
      name: `Phase3 ${slug}`,
      role: 'STUDENT',
    },
  })

  const profile = await prisma.studentProfile.create({
    data: {
      userId: user.id,
      departmentId,
    },
  })

  return { user, profile }
}

async function ensureLegacyContent(prisma, fx) {
  const existingEbook = await prisma.ebookUpload.findFirst({
    where: { title: 'Phase 3 Legacy Ebook' },
    select: { id: true },
  })

  if (!existingEbook) {
    await prisma.ebookUpload.create({
      data: {
        teacherId: fx.teacherProfile.id,
        departmentId: fx.departments.cse.id,
        subjectId: fx.subjects.cse101.id,
        languageId: fx.languages.english.id,
        groupId: fx.groups.cseY1A.id,
        academicYearId: fx.academicYears.year1.id,
        semesterId: fx.semesters.sem1.id,
        academicOfferingId: fx.offerings.bscY1A.id,
        title: 'Phase 3 Legacy Ebook',
        description: 'Legacy visibility fixture',
        fileName: 'phase3-legacy-ebook.pdf',
        fileUrl: '/uploads/ebooks/phase3-legacy-ebook.pdf',
        fileSizeBytes: 1024,
      },
    })
  }

  const existingRule = await prisma.courseworkRule.findFirst({
    where: { rules: 'Phase 3 legacy coursework rule' },
    select: { id: true },
  })

  let ruleId = existingRule?.id ?? null
  if (!ruleId) {
    const rule = await prisma.courseworkRule.create({
      data: {
        teacherId: fx.teacherProfile.id,
        departmentId: fx.departments.cse.id,
        subjectId: fx.subjects.cse101.id,
        languageId: fx.languages.english.id,
        groupId: fx.groups.cseY1A.id,
        academicYearId: fx.academicYears.year1.id,
        semesterId: fx.semesters.sem1.id,
        academicOfferingId: fx.offerings.bscY1A.id,
        rules: 'Phase 3 legacy coursework rule',
        useAiValidation: false,
      },
    })
    ruleId = rule.id
  }

  const existingAssignment = await prisma.courseworkAssignment.findFirst({
    where: {
      title: 'Phase 3 Legacy Coursework',
      studentId: fx.students.trent.id,
    },
    select: { id: true },
  })

  if (!existingAssignment) {
    await prisma.courseworkAssignment.create({
      data: {
        teacherId: fx.teacherProfile.id,
        studentId: fx.students.trent.id,
        ruleId,
        departmentId: fx.departments.cse.id,
        subjectId: fx.subjects.cse101.id,
        languageId: fx.languages.english.id,
        groupId: fx.groups.cseY1A.id,
        academicYearId: fx.academicYears.year1.id,
        semesterId: fx.semesters.sem1.id,
        academicOfferingId: fx.offerings.bscY1A.id,
        title: 'Phase 3 Legacy Coursework',
        rules: 'Submit the legacy fixture report.',
      },
    })
  }
}

async function collectFixture(prisma) {
  const [
    departments,
    programs,
    sessions,
    years,
    semesters,
    languages,
    groups,
    departmentLanguages,
    programYears,
    programSemesters,
    offerings,
    subjects,
    exams,
    teacherProfile,
    students,
  ] = await Promise.all([
    prisma.department.findMany(),
    prisma.academicProgram.findMany(),
    prisma.academicSession.findMany(),
    prisma.academicYear.findMany(),
    prisma.semester.findMany(),
    prisma.language.findMany(),
    prisma.group.findMany(),
    prisma.departmentLanguage.findMany(),
    prisma.programYear.findMany(),
    prisma.programSemester.findMany(),
    prisma.academicOffering.findMany(),
    prisma.subject.findMany(),
    prisma.exam.findMany(),
    prisma.teacherProfile.findFirst({ where: { user: { email: 'teacher@test.local' } }, include: { user: true } }),
    prisma.studentProfile.findMany({ include: { user: true } }),
  ])

  const byCode = (list) => Object.fromEntries(list.map((item) => [item.code, item]))
  const byName = (list) => Object.fromEntries(list.map((item) => [item.name, item]))
  const examByTitle = (title) => exams.find((item) => item.title === title)
  const studentMap = Object.fromEntries(students.map((item) => [item.user.email, item]))
  const languageByCode = byCode(languages)

  return {
    departments: {
      cse: byCode(departments).CSE,
      eee: byCode(departments).EEE,
    },
    programs: {
      bsc: byCode(programs)['BSC-CS'],
      msc: byCode(programs)['MSC-AI'],
      eee: byCode(programs)['BSC-EEE'],
      archived: byCode(programs)['BSC-ARC'],
      noCurr: byName(programs)['MSc Without Curriculum'],
    },
    sessions: {
      current: byCode(sessions)['2026-2027'],
      next: byCode(sessions)['2027-2028'],
      inactive: byCode(sessions)['2025-2026'],
    },
    academicYears: {
      year1: years.find((item) => item.year === 1),
      year2: years.find((item) => item.year === 2),
      year3: years.find((item) => item.year === 3),
    },
    semesters: {
      sem1: semesters.find((item) => item.number === 1),
      sem2: semesters.find((item) => item.number === 2),
      sem3: semesters.find((item) => item.number === 3),
    },
    languages: {
      english: languageByCode.EN,
      bangla: languageByCode.BN,
      russian: languageByCode.RU,
    },
    groups: {
      cseY1A: byCode(groups)['CSE-Y1-A'],
      cseY1B: byCode(groups)['CSE-Y1-B'],
      cseY2A: byCode(groups)['CSE-Y2-A'],
      cseY3A: byCode(groups)['CSE-Y3-A'],
      cseInactive: byCode(groups)['CSE-Y1-INACTIVE'],
      mscA: byCode(groups)['MSC-AI-A'],
      eeeA: byCode(groups)['EEE-Y1-A'],
      noCurr: byCode(groups)['MSC-NOCURR-A'],
    },
    departmentLanguages: {
      cseEnglish: departmentLanguages.find((item) => item.departmentId === byCode(departments).CSE.id && item.languageId === languageByCode.EN.id),
      cseBangla: departmentLanguages.find((item) => item.departmentId === byCode(departments).CSE.id && item.languageId === languageByCode.BN.id),
      cseInactive: departmentLanguages.find((item) => item.departmentId === byCode(departments).CSE.id && !item.isActive),
      eeeRussian: departmentLanguages.find((item) => item.departmentId === byCode(departments).EEE.id && item.languageId === languageByCode.RU.id),
    },
    programYears: {
      bsc1: programYears.find((item) => item.programId === byCode(programs)['BSC-CS'].id && item.yearNumber === 1),
      bsc2: programYears.find((item) => item.programId === byCode(programs)['BSC-CS'].id && item.yearNumber === 2),
      bsc3: programYears.find((item) => item.programId === byCode(programs)['BSC-CS'].id && item.yearNumber === 3),
      msc1: programYears.find((item) => item.programId === byCode(programs)['MSC-AI'].id && item.yearNumber === 1),
      eee1: programYears.find((item) => item.programId === byCode(programs)['BSC-EEE'].id && item.yearNumber === 1),
      noCurr1: programYears.find((item) => item.programId === byName(programs)['MSc Without Curriculum'].id && item.yearNumber === 1),
    },
    programSemesters: {
      bsc1: programSemesters.find((item) => item.programId === byCode(programs)['BSC-CS'].id && item.semesterNumber === 1),
      bsc2: programSemesters.find((item) => item.programId === byCode(programs)['BSC-CS'].id && item.semesterNumber === 2),
      bsc3: programSemesters.find((item) => item.programId === byCode(programs)['BSC-CS'].id && item.semesterNumber === 3),
      bsc4: programSemesters.find((item) => item.programId === byCode(programs)['BSC-CS'].id && item.semesterNumber === 4),
      bsc5: programSemesters.find((item) => item.programId === byCode(programs)['BSC-CS'].id && item.semesterNumber === 5),
      msc1: programSemesters.find((item) => item.programId === byCode(programs)['MSC-AI'].id && item.semesterNumber === 1),
      msc2: programSemesters.find((item) => item.programId === byCode(programs)['MSC-AI'].id && item.semesterNumber === 2),
      eee1: programSemesters.find((item) => item.programId === byCode(programs)['BSC-EEE'].id && item.semesterNumber === 1),
    },
    offerings: {
      bscY1A: offerings.find((item) => item.groupId === byCode(groups)['CSE-Y1-A'].id),
      bscY1B: offerings.find((item) => item.groupId === byCode(groups)['CSE-Y1-B'].id),
      bscY2A: offerings.find((item) => item.groupId === byCode(groups)['CSE-Y2-A'].id && item.semesterId === semesters.find((item) => item.number === 2).id),
      msc1: offerings.find((item) => item.groupId === byCode(groups)['MSC-AI-A'].id && item.semesterId === semesters.find((item) => item.number === 1).id),
      msc2: offerings.find((item) => item.groupId === byCode(groups)['MSC-AI-A'].id && item.semesterId === semesters.find((item) => item.number === 2).id),
      eee1: offerings.find((item) => item.groupId === byCode(groups)['EEE-Y1-A'].id),
    },
    subjects: {
      cse101: byCode(subjects).CSE101,
      cse201: byCode(subjects).CSE201,
      cse401: byCode(subjects).CSE401,
      ai501: byCode(subjects).AI501,
      ai502: byCode(subjects).AI502,
      eee101: byCode(subjects).EEE101,
    },
    exams: {
      bscSem1: examByTitle('BSc Semester 1 Exam'),
      mscSem1: examByTitle('MSc Semester 1 Exam'),
      bscFinal: examByTitle('BSc Final Exam'),
      mscFinal: examByTitle('MSc Final Exam'),
      eeeSem1: examByTitle('EEE Semester 1 Exam'),
      bscY1B: examByTitle('BSc Y1B Exam'),
      victorTarget: examByTitle('Victor Target Scope Exam'),
      postGrad: examByTitle('Post Graduation Live Exam'),
      leaveCheck: examByTitle('Active Leave Access Check'),
    },
    teacherProfile,
    students: {
      alice: { id: studentMap['alice@student.test'].id, email: 'alice@student.test' },
      bob: { id: studentMap['bob@student.test'].id, email: 'bob@student.test' },
      dave: { id: studentMap['dave@student.test'].id, email: 'dave@student.test' },
      grace: { id: studentMap['grace@student.test'].id, email: 'grace@student.test' },
      heidi: { id: studentMap['heidi@student.test'].id, email: 'heidi@student.test' },
      liam: { id: studentMap['liam@student.test'].id, email: 'liam@student.test' },
      mallory: { id: studentMap['mallory@student.test'].id, email: 'mallory@student.test' },
      niaj: { id: studentMap['niaj@student.test'].id, email: 'niaj@student.test' },
      peggy: { id: studentMap['peggy@student.test'].id, email: 'peggy@student.test' },
      quentin: { id: studentMap['quentin@student.test'].id, email: 'quentin@student.test' },
      rita: { id: studentMap['rita@student.test'].id, email: 'rita@student.test' },
      sybil: { id: studentMap['sybil@student.test'].id, email: 'sybil@student.test' },
      trent: { id: studentMap['trent@student.test'].id, email: 'trent@student.test' },
      uma: { id: studentMap['uma@student.test'].id, email: 'uma@student.test' },
      victor: { id: studentMap['victor@student.test'].id, email: 'victor@student.test' },
      wendy: { id: studentMap['wendy@student.test'].id, email: 'wendy@student.test' },
      xavier: { id: studentMap['xavier@student.test'].id, email: 'xavier@student.test' },
      yvonne: { id: studentMap['yvonne@student.test'].id, email: 'yvonne@student.test' },
      zara: { id: studentMap['zara@student.test'].id, email: 'zara@student.test' },
      eeeAuth: studentMap['auth.eee.student@examflow.pro']
        ? { id: studentMap['auth.eee.student@examflow.pro'].id, email: 'auth.eee.student@examflow.pro' }
        : null,
    },
  }
}

function bscYear1Context(fx) {
  return {
    departmentId: fx.departments.cse.id,
    academicSessionId: fx.sessions.current.id,
    programId: fx.programs.bsc.id,
    programYearId: fx.programYears.bsc1.id,
    semesterId: fx.semesters.sem1.id,
    programSemesterId: fx.programSemesters.bsc1.id,
    groupId: fx.groups.cseY1A.id,
    academicYearId: fx.academicYears.year1.id,
    departmentLanguageId: fx.departmentLanguages.cseEnglish.id,
    languageId: fx.departmentLanguages.cseEnglish.languageId,
  }
}

function bscYear1Sem2Context(fx) {
  return {
    departmentId: fx.departments.cse.id,
    academicSessionId: fx.sessions.current.id,
    programId: fx.programs.bsc.id,
    programYearId: fx.programYears.bsc1.id,
    semesterId: fx.semesters.sem2.id,
    programSemesterId: fx.programSemesters.bsc2.id,
    groupId: fx.groups.cseY1A.id,
    academicYearId: fx.academicYears.year1.id,
    departmentLanguageId: fx.departmentLanguages.cseEnglish.id,
    languageId: fx.departmentLanguages.cseEnglish.languageId,
  }
}

function bscYear2Sem1Context(fx) {
  return {
    departmentId: fx.departments.cse.id,
    academicSessionId: fx.sessions.current.id,
    programId: fx.programs.bsc.id,
    programYearId: fx.programYears.bsc2.id,
    semesterId: fx.semesters.sem1.id,
    programSemesterId: fx.programSemesters.bsc3.id,
    groupId: fx.groups.cseY2A.id,
    academicYearId: fx.academicYears.year2.id,
    departmentLanguageId: fx.departmentLanguages.cseBangla.id,
    languageId: fx.departmentLanguages.cseBangla.languageId,
  }
}

function bscYear2Sem2Context(fx) {
  return {
    departmentId: fx.departments.cse.id,
    academicSessionId: fx.sessions.current.id,
    programId: fx.programs.bsc.id,
    programYearId: fx.programYears.bsc2.id,
    semesterId: fx.semesters.sem2.id,
    programSemesterId: fx.programSemesters.bsc4.id,
    groupId: fx.groups.cseY2A.id,
    academicYearId: fx.academicYears.year2.id,
    departmentLanguageId: fx.departmentLanguages.cseBangla.id,
    languageId: fx.departmentLanguages.cseBangla.languageId,
  }
}

function mscSem1Context(fx) {
  return {
    departmentId: fx.departments.cse.id,
    academicSessionId: fx.sessions.current.id,
    programId: fx.programs.msc.id,
    programYearId: fx.programYears.msc1.id,
    semesterId: fx.semesters.sem1.id,
    programSemesterId: fx.programSemesters.msc1.id,
    groupId: fx.groups.mscA.id,
    academicYearId: fx.academicYears.year1.id,
    departmentLanguageId: fx.departmentLanguages.cseEnglish.id,
    languageId: fx.departmentLanguages.cseEnglish.languageId,
  }
}

function mscSem2Context(fx) {
  return {
    departmentId: fx.departments.cse.id,
    academicSessionId: fx.sessions.current.id,
    programId: fx.programs.msc.id,
    programYearId: fx.programYears.msc1.id,
    semesterId: fx.semesters.sem2.id,
    programSemesterId: fx.programSemesters.msc2.id,
    groupId: fx.groups.mscA.id,
    academicYearId: fx.academicYears.year1.id,
    departmentLanguageId: fx.departmentLanguages.cseEnglish.id,
    languageId: fx.departmentLanguages.cseEnglish.languageId,
  }
}

function eeeContext(fx) {
  return {
    departmentId: fx.departments.eee.id,
    academicSessionId: fx.sessions.current.id,
    programId: fx.programs.eee.id,
    programYearId: fx.programYears.eee1.id,
    semesterId: fx.semesters.sem1.id,
    programSemesterId: fx.programSemesters.eee1.id,
    groupId: fx.groups.eeeA.id,
    academicYearId: fx.academicYears.year1.id,
    departmentLanguageId: fx.departmentLanguages.eeeRussian.id,
    languageId: fx.departmentLanguages.eeeRussian.languageId,
  }
}

async function main() {
  await ensureDirs()
  const databaseUrl = withDatabaseName(await getBaseDatabaseUrl(), '_phase3_tests')
  process.env.DATABASE_URL = databaseUrl
  const prisma = new PrismaClient()
  const server = await startServer(databaseUrl)
  const browser = await chromium.launch({ headless: true })
  const apiContexts = {}

  try {
    const fx = await collectFixture(prisma)
    await ensureLegacyContent(prisma, fx)

    for (const [roleKey, role] of Object.entries(roles)) {
      apiContexts[roleKey] = await createAuthenticatedRequest(role.email, role.password)
      browserStorageStates[roleKey] = await apiContexts[roleKey].storageState()
    }

    if (!fx.students.eeeAuth) {
      const eeeAuthStudent = await seedStudent(prisma, 'eee-auth', fx.departments.eee.id)
      await apiCall(apiContexts.eeeAdmin, 'POST', '/api/admin/enrollments', { ...eeeContext(fx), studentId: eeeAuthStudent.profile.id })
      fx.students.eeeAuth = { id: eeeAuthStudent.profile.id, email: eeeAuthStudent.user.email }
    }

    const browserEnrollment = await captureBrowser(browser, 'cseAdmin', 'P3-ENR-001-enrollment-page', '/admin/enrollments', async (page) => {
      await page.getByText(/Enrollment Management|Timeline Viewer|Add Enrollment/i).first().waitFor({ timeout: 10000 })
      return 'Enrollment admin page rendered'
    })
    recordPass(['P3-ENR-001'], 'Enrollment', browserEnrollment.actual, browserEnrollment.evidence)

    const browserPromotion = await captureBrowser(browser, 'cseAdmin', 'P3-PRO-001-promotion-page', '/admin/promotions', async (page) => {
      await page.getByText(/Promotions|Preview Student|Promote Student/i).first().waitFor({ timeout: 10000 })
      return 'Promotion admin page rendered'
    })
    recordPass(['P3-PRO-001'], 'Promotion', browserPromotion.actual, browserPromotion.evidence)

    const browserTransfer = await captureBrowser(browser, 'cseAdmin', 'P3-TRF-001-transfer-page', '/admin/transfers', async (page) => {
      await page.getByText(/Transfers|Create Transfer/i).first().waitFor({ timeout: 10000 })
      return 'Transfer admin page rendered'
    })
    recordPass(['P3-TRF-001'], 'Transfer', browserTransfer.actual, browserTransfer.evidence)

    const browserLeave = await captureBrowser(browser, 'cseAdmin', 'P3-LEV-001-leave-page', '/admin/leaves', async (page) => {
      await page.getByText(/Leave|Create Leave/i).first().waitFor({ timeout: 10000 })
      return 'Leave admin page rendered'
    })
    recordPass(['P3-LEV-001'], 'Leave', browserLeave.actual, browserLeave.evidence)

    const browserReadmission = await captureBrowser(browser, 'cseAdmin', 'P3-REA-001-readmission-page', '/admin/readmissions', async (page) => {
      await page.getByText(/Readmission|Create Readmission/i).first().waitFor({ timeout: 10000 })
      return 'Readmission admin page rendered'
    })
    recordPass(['P3-REA-001'], 'Readmission', browserReadmission.actual, browserReadmission.evidence)

    const browserGraduation = await captureBrowser(browser, 'cseAdmin', 'P3-GRA-001-graduation-page', '/admin/graduation', async (page) => {
      await page.getByText(/Graduation|Create Graduation/i).first().waitFor({ timeout: 10000 })
      return 'Graduation admin page rendered'
    })
    recordPass(['P3-GRA-001'], 'Graduation', browserGraduation.actual, browserGraduation.evidence)

    const browserSuperAdmin = await captureBrowser(browser, 'superAdmin', 'P3-AUTH-BR-001-super-admin-enrollments', '/admin/enrollments', async (page) => {
      await page.getByText(/Enrollment Management|Timeline Viewer/i).first().waitFor({ timeout: 10000 })
      return 'Super admin opened enrollments'
    })
    recordPass(['P3-AUTH-BR-001'], 'Auth', browserSuperAdmin.actual, browserSuperAdmin.evidence)

    const browserStudentHistory = await captureBrowser(browser, 'cseAdmin', 'P3-AUTH-BR-003-admin-students-page', '/admin/students', async (page) => {
      await page.getByText(/Students|Filter|Search/i).first().waitFor({ timeout: 10000 })
      return 'CSE admin students page rendered'
    })
    recordPass(['P3-AUTH-BR-003'], 'Auth', browserStudentHistory.actual, browserStudentHistory.evidence)

    const searchName = await apiCall(apiContexts.cseAdmin, 'GET', '/api/admin/enrollments?search=Grace', null)
    const searchNameEvidence = await saveApiEvidence('P3-ENR-002-search-grace', 'GET', '/api/admin/enrollments?search=Grace', null, searchName, {
      count: Array.isArray(searchName.json?.items) ? searchName.json.items.length : null,
    })
    if (searchName.status === 200 && (searchName.json?.items ?? []).some((item) => item.student?.user?.email === fx.students.grace.email)) {
      recordPass(['P3-ENR-002'], 'Enrollment', 'Enrollment search by student name returned Grace', searchNameEvidence)
    } else {
      recordFail(['P3-ENR-002'], 'Enrollment', `Unexpected search response ${searchName.status}`, searchNameEvidence)
    }

    const searchEmail = await apiCall(apiContexts.cseAdmin, 'GET', '/api/admin/enrollments?search=grace@student.test', null)
    const searchEmailEvidence = await saveApiEvidence('P3-ENR-003-search-email', 'GET', '/api/admin/enrollments?search=grace@student.test', null, searchEmail)
    if (searchEmail.status === 200 && (searchEmail.json?.items ?? []).some((item) => item.student?.user?.email === fx.students.grace.email)) {
      recordPass(['P3-ENR-003'], 'Enrollment', 'Enrollment search by email returned Grace', searchEmailEvidence)
    } else {
      recordFail(['P3-ENR-003'], 'Enrollment', `Unexpected search response ${searchEmail.status}`, searchEmailEvidence)
    }

    const deptFilter = await apiCall(apiContexts.cseAdmin, 'GET', `/api/admin/enrollments?departmentId=${fx.departments.cse.id}`, null)
    const deptFilterEvidence = await saveApiEvidence('P3-ENR-004-department-filter', 'GET', `/api/admin/enrollments?departmentId=${fx.departments.cse.id}`, null, deptFilter)
    if (deptFilter.status === 200 && (deptFilter.json?.items ?? []).every((item) => item.departmentId === fx.departments.cse.id)) {
      recordPass(['P3-ENR-004'], 'Enrollment', 'Department enrollment filter only returned CSE records', deptFilterEvidence)
    } else {
      recordFail(['P3-ENR-004'], 'Enrollment', `Unexpected filter response ${deptFilter.status}`, deptFilterEvidence)
    }

    const programFilter = await apiCall(apiContexts.cseAdmin, 'GET', `/api/admin/enrollments?programId=${fx.programs.bsc.id}`, null)
    const programFilterEvidence = await saveApiEvidence('P3-ENR-005-program-filter', 'GET', `/api/admin/enrollments?programId=${fx.programs.bsc.id}`, null, programFilter)
    if (programFilter.status === 200 && (programFilter.json?.items ?? []).every((item) => item.programId === fx.programs.bsc.id)) {
      recordPass(['P3-ENR-005'], 'Enrollment', 'Program filter only returned BSc enrollments', programFilterEvidence)
    } else {
      recordFail(['P3-ENR-005'], 'Enrollment', `Unexpected filter response ${programFilter.status}`, programFilterEvidence)
    }

    const enrBscStudent = await seedStudent(prisma, 'enr-bsc', fx.departments.cse.id)
    const enrBscPayload = { ...bscYear1Context(fx), studentId: enrBscStudent.profile.id, notes: 'Phase 3 BSc enrollment' }
    const enrBsc = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', enrBscPayload)
    const enrBscDb = await prisma.studentEnrollment.findFirst({ where: { studentId: enrBscStudent.profile.id }, include: { group: true } })
    const enrBscEvidence = await saveApiEvidence('P3-ENR-006-valid-bsc', 'POST', '/api/admin/enrollments', enrBscPayload, enrBsc, enrBscDb)
    if (enrBsc.status === 201 && enrBscDb?.status === StudentEnrollmentStatus.ACTIVE) {
      recordPass(['P3-ENR-006'], 'Enrollment', 'Valid BSc enrollment created successfully', enrBscEvidence)
    } else {
      recordFail(['P3-ENR-006'], 'Enrollment', `Expected 201, received ${enrBsc.status}`, enrBscEvidence)
    }

    const timelineEnr = await apiCall(apiContexts.cseAdmin, 'GET', `/api/admin/enrollments/${enrBscStudent.profile.id}/timeline`, null)
    const timelineEnrEvidence = await saveApiEvidence('P3-ENR-017-timeline-enrollment', 'GET', `/api/admin/enrollments/${enrBscStudent.profile.id}/timeline`, null, timelineEnr)
    if (timelineEnr.status === 200 && (timelineEnr.json ?? []).some((item) => item.eventType === StudentAcademicHistoryEventType.ENROLLMENT)) {
      recordPass(['P3-ENR-017', 'P3-HIS-001'], 'History', 'Timeline contains ENROLLMENT event for new student', timelineEnrEvidence)
    } else {
      recordFail(['P3-ENR-017', 'P3-HIS-001'], 'History', `Timeline lookup failed with ${timelineEnr.status}`, timelineEnrEvidence)
    }

    const enrMscStudent = await seedStudent(prisma, 'enr-msc', fx.departments.cse.id)
    const enrMscPayload = { ...mscSem1Context(fx), studentId: enrMscStudent.profile.id, notes: 'Phase 3 MSc enrollment' }
    const enrMsc = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', enrMscPayload)
    const enrMscDb = await prisma.studentEnrollment.findFirst({ where: { studentId: enrMscStudent.profile.id }, include: { program: true } })
    const enrMscEvidence = await saveApiEvidence('P3-ENR-007-valid-msc', 'POST', '/api/admin/enrollments', enrMscPayload, enrMsc, enrMscDb)
    if (enrMsc.status === 201 && enrMscDb?.programId === fx.programs.msc.id) {
      recordPass(['P3-ENR-007'], 'Enrollment', 'Valid MSc enrollment created successfully', enrMscEvidence)
    } else {
      recordFail(['P3-ENR-007'], 'Enrollment', `Expected 201, received ${enrMsc.status}`, enrMscEvidence)
    }

    const dupEnr = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', enrBscPayload)
    const dupEnrEvidence = await saveApiEvidence('P3-ENR-008-duplicate-active', 'POST', '/api/admin/enrollments', enrBscPayload, dupEnr)
    if (dupEnr.status === 409) {
      recordPass(['P3-ENR-008'], 'Enrollment', 'Second active enrollment was rejected with 409', dupEnrEvidence)
    } else {
      recordFail(['P3-ENR-008'], 'Enrollment', `Expected 409, received ${dupEnr.status}`, dupEnrEvidence)
    }

    const fakeCuid = 'cmzzzzzzzzzzzzzzzzzzzzzzz'
    const missingStudent = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: fakeCuid })
    const missingStudentEvidence = await saveApiEvidence('P3-ENR-009-missing-student', 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: fakeCuid }, missingStudent)
    if (missingStudent.status >= 400) {
      recordPass(['P3-ENR-009'], 'Enrollment', `Missing student rejected with ${missingStudent.status}`, missingStudentEvidence)
    } else {
      recordFail(['P3-ENR-009'], 'Enrollment', `Expected failure, received ${missingStudent.status}`, missingStudentEvidence)
    }

    const invalidProgram = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: (await seedStudent(prisma, 'bad-program', fx.departments.cse.id)).profile.id, programId: fakeCuid })
    const invalidProgramEvidence = await saveApiEvidence('P3-ENR-010-invalid-program', 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: 'dynamic', programId: fakeCuid }, invalidProgram)
    if (invalidProgram.status >= 400) {
      recordPass(['P3-ENR-010'], 'Enrollment', `Invalid program rejected with ${invalidProgram.status}`, invalidProgramEvidence)
    } else {
      recordFail(['P3-ENR-010'], 'Enrollment', `Expected failure, received ${invalidProgram.status}`, invalidProgramEvidence)
    }

    const inactiveProgramStudent = await seedStudent(prisma, 'inactive-program', fx.departments.cse.id)
    const inactiveProgramPayload = { ...bscYear1Context(fx), studentId: inactiveProgramStudent.profile.id, programId: fx.programs.archived.id }
    const inactiveProgram = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', inactiveProgramPayload)
    const inactiveProgramEvidence = await saveApiEvidence('P3-ENR-011-inactive-program', 'POST', '/api/admin/enrollments', inactiveProgramPayload, inactiveProgram)
    if (inactiveProgram.status >= 400) {
      recordPass(['P3-ENR-011'], 'Enrollment', `Inactive program rejected with ${inactiveProgram.status}`, inactiveProgramEvidence)
    } else {
      recordFail(['P3-ENR-011'], 'Enrollment', `Expected failure, received ${inactiveProgram.status}`, inactiveProgramEvidence)
    }

    const inactiveSessionStudent = await seedStudent(prisma, 'inactive-session', fx.departments.cse.id)
    const inactiveSessionPayload = { ...bscYear1Context(fx), studentId: inactiveSessionStudent.profile.id, academicSessionId: fx.sessions.inactive.id }
    const inactiveSession = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', inactiveSessionPayload)
    const inactiveSessionEvidence = await saveApiEvidence('P3-ENR-012-inactive-session', 'POST', '/api/admin/enrollments', inactiveSessionPayload, inactiveSession)
    if (inactiveSession.status >= 400) {
      recordPass(['P3-ENR-012'], 'Enrollment', `Inactive session rejected with ${inactiveSession.status}`, inactiveSessionEvidence)
    } else {
      recordFail(['P3-ENR-012'], 'Enrollment', `Expected failure, received ${inactiveSession.status}`, inactiveSessionEvidence)
    }

    const unsupportedLanguageStudent = await seedStudent(prisma, 'unsupported-language', fx.departments.cse.id)
    const unsupportedLanguagePayload = {
      ...bscYear1Context(fx),
      studentId: unsupportedLanguageStudent.profile.id,
      departmentLanguageId: fx.departmentLanguages.cseInactive.id,
      languageId: fx.departmentLanguages.cseInactive.languageId,
    }
    const unsupportedLanguage = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', unsupportedLanguagePayload)
    const unsupportedLanguageEvidence = await saveApiEvidence('P3-ENR-013-unsupported-language', 'POST', '/api/admin/enrollments', unsupportedLanguagePayload, unsupportedLanguage)
    if (unsupportedLanguage.status >= 400) {
      recordPass(['P3-ENR-013'], 'Enrollment', `Unsupported language rejected with ${unsupportedLanguage.status}`, unsupportedLanguageEvidence)
    } else {
      recordFail(['P3-ENR-013'], 'Enrollment', `Expected failure, received ${unsupportedLanguage.status}`, unsupportedLanguageEvidence)
    }

    const wrongGroupStudent = await seedStudent(prisma, 'wrong-group', fx.departments.cse.id)
    const wrongGroupPayload = { ...bscYear1Context(fx), studentId: wrongGroupStudent.profile.id, groupId: fx.groups.eeeA.id }
    const wrongGroup = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', wrongGroupPayload)
    const wrongGroupEvidence = await saveApiEvidence('P3-ENR-014-wrong-group', 'POST', '/api/admin/enrollments', wrongGroupPayload, wrongGroup)
    if (wrongGroup.status >= 400) {
      recordPass(['P3-ENR-014'], 'Enrollment', `Wrong group rejected with ${wrongGroup.status}`, wrongGroupEvidence)
    } else {
      recordFail(['P3-ENR-014'], 'Enrollment', `Expected failure, received ${wrongGroup.status}`, wrongGroupEvidence)
    }

    const wrongSemesterStudent = await seedStudent(prisma, 'wrong-semester', fx.departments.cse.id)
    const wrongSemesterPayload = { ...bscYear1Context(fx), studentId: wrongSemesterStudent.profile.id, semesterId: fx.semesters.sem2.id, programSemesterId: fx.programSemesters.bsc1.id }
    const wrongSemester = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', wrongSemesterPayload)
    const wrongSemesterEvidence = await saveApiEvidence('P3-ENR-015-wrong-semester', 'POST', '/api/admin/enrollments', wrongSemesterPayload, wrongSemester)
    if (wrongSemester.status >= 400) {
      recordPass(['P3-ENR-015'], 'Enrollment', `Mismatched semester rejected with ${wrongSemester.status}`, wrongSemesterEvidence)
    } else {
      recordFail(['P3-ENR-015'], 'Enrollment', `Expected failure, received ${wrongSemester.status}`, wrongSemesterEvidence)
    }

    const crossDeptStudent = await seedStudent(prisma, 'cross-dept', fx.departments.eee.id)
    const crossDeptPayload = { ...bscYear1Context(fx), studentId: crossDeptStudent.profile.id }
    const crossDept = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', crossDeptPayload)
    const crossDeptEvidence = await saveApiEvidence('P3-ENR-016-cross-department', 'POST', '/api/admin/enrollments', crossDeptPayload, crossDept)
    if (crossDept.status >= 400) {
      recordPass(['P3-ENR-016'], 'Enrollment', `Cross-department enrollment rejected with ${crossDept.status}`, crossDeptEvidence)
    } else {
      recordFail(['P3-ENR-016'], 'Enrollment', `Expected failure, received ${crossDept.status}`, crossDeptEvidence)
    }

    const patchEnrollment = await apiCall(apiContexts.cseAdmin, 'PATCH', `/api/admin/enrollments/${enrBscDb.id}`, { notes: 'Phase 3 enrollment note update' })
    const patchEnrollmentDb = await prisma.studentEnrollment.findUnique({ where: { id: enrBscDb.id } })
    const patchEnrollmentEvidence = await saveApiEvidence('P3-ENR-019-patch-enrollment', 'PATCH', `/api/admin/enrollments/${enrBscDb.id}`, { notes: 'Phase 3 enrollment note update' }, patchEnrollment, patchEnrollmentDb)
    if (patchEnrollment.status === 200 && patchEnrollmentDb?.notes?.includes('Phase 3')) {
      recordPass(['P3-ENR-019'], 'Enrollment', 'Enrollment note update succeeded safely', patchEnrollmentEvidence)
    } else {
      recordFail(['P3-ENR-019'], 'Enrollment', `Expected 200, received ${patchEnrollment.status}`, patchEnrollmentEvidence)
    }

    const deactivateEnrollment = await apiCall(apiContexts.cseAdmin, 'PATCH', `/api/admin/enrollments/${enrMscDb.id}`, { isActive: false, notes: 'Phase 3 deactivation' })
    const deactivateEnrollmentDb = await prisma.studentEnrollment.findUnique({ where: { id: enrMscDb.id } })
    const deactivateEnrollmentEvidence = await saveApiEvidence('P3-ENR-020-deactivate-enrollment', 'PATCH', `/api/admin/enrollments/${enrMscDb.id}`, { isActive: false, notes: 'Phase 3 deactivation' }, deactivateEnrollment, deactivateEnrollmentDb)
    if (deactivateEnrollment.status === 200 && deactivateEnrollmentDb?.status === StudentEnrollmentStatus.DROPPED && deactivateEnrollmentDb.isActive === false) {
      recordPass(['P3-ENR-020'], 'Enrollment', 'Enrollment deactivation safely closed the record', deactivateEnrollmentEvidence)
    } else {
      recordFail(['P3-ENR-020'], 'Enrollment', `Expected dropped enrollment, received ${deactivateEnrollment.status}`, deactivateEnrollmentEvidence)
    }

    const malformedEnrollment = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { studentId: enrBscStudent.profile.id })
    const malformedEnrollmentEvidence = await saveApiEvidence('P3-ENR-022-malformed', 'POST', '/api/admin/enrollments', { studentId: enrBscStudent.profile.id }, malformedEnrollment)
    if (malformedEnrollment.status === 400) {
      recordPass(['P3-ENR-022'], 'Enrollment', 'Malformed enrollment request rejected by schema validation', malformedEnrollmentEvidence)
    } else {
      recordFail(['P3-ENR-022'], 'Enrollment', `Expected 400, received ${malformedEnrollment.status}`, malformedEnrollmentEvidence)
    }

    const promoStudent = await seedStudent(prisma, 'promo-bsc', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: promoStudent.profile.id })
    await createAttemptAndResult(prisma, promoStudent.profile.id, fx.exams.bscSem1.id, ResultStatus.PUBLISHED, 93)
    const promoPreviewPayload = { ...bscYear1Sem2Context(fx), studentId: promoStudent.profile.id }
    const promoPreview = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions/preview', promoPreviewPayload)
    const promoPreviewEvidence = await saveApiEvidence('P3-PRO-002-preview-filtering', 'POST', '/api/admin/promotions/preview', promoPreviewPayload, promoPreview)
    if (promoPreview.status === 200 && promoPreview.json?.eligible === true) {
      recordPass(['P3-PRO-002', 'P3-PRO-003'], 'Promotion', 'Promotion preview returned eligible next-context data', promoPreviewEvidence)
    } else {
      recordFail(['P3-PRO-002', 'P3-PRO-003'], 'Promotion', `Preview failed with ${promoPreview.status}`, promoPreviewEvidence)
    }

    const promoCreate = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions', promoPreviewPayload)
    const promoCreateDb = await prisma.studentPromotion.findFirst({
      where: { studentId: promoStudent.profile.id },
      orderBy: { createdAt: 'desc' },
      include: { fromEnrollment: true, toEnrollment: true },
    })
    const promoCreateEvidence = await saveApiEvidence('P3-PRO-004-valid-bsc', 'POST', '/api/admin/promotions', promoPreviewPayload, promoCreate, promoCreateDb)
    if (promoCreate.status === 201 && promoCreateDb?.toEnrollment?.isActive && promoCreateDb?.fromEnrollment?.isActive === false) {
      recordPass(['P3-PRO-004', 'P3-PRO-019', 'P3-PRO-020', 'P3-PRO-021', 'P3-HIS-002'], 'Promotion', 'Valid BSc promotion created next active context and history', promoCreateEvidence)
    } else {
      recordFail(['P3-PRO-004', 'P3-PRO-019', 'P3-PRO-020', 'P3-PRO-021', 'P3-HIS-002'], 'Promotion', `Promotion failed with ${promoCreate.status}`, promoCreateEvidence)
    }

    const promoMscStudent = await seedStudent(prisma, 'promo-msc', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...mscSem1Context(fx), studentId: promoMscStudent.profile.id })
    await createAttemptAndResult(prisma, promoMscStudent.profile.id, fx.exams.mscSem1.id, ResultStatus.PUBLISHED, 91)
    const promoMscPayload = { ...mscSem2Context(fx), studentId: promoMscStudent.profile.id }
    const promoMsc = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions', promoMscPayload)
    const promoMscEvidence = await saveApiEvidence('P3-PRO-005-valid-msc', 'POST', '/api/admin/promotions', promoMscPayload, promoMsc)
    if (promoMsc.status === 201) {
      recordPass(['P3-PRO-005'], 'Promotion', 'Valid MSc promotion succeeded', promoMscEvidence)
    } else {
      recordFail(['P3-PRO-005'], 'Promotion', `Expected 201, received ${promoMsc.status}`, promoMscEvidence)
    }

    const unpublishedPayload = { ...bscYear2Sem2Context(fx), studentId: fx.students.rita.id }
    const unpublishedPromotion = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions', unpublishedPayload)
    const unpublishedPromotionEvidence = await saveApiEvidence('P3-PRO-006-unpublished', 'POST', '/api/admin/promotions', unpublishedPayload, unpublishedPromotion)
    if (unpublishedPromotion.status >= 400) {
      recordPass(['P3-PRO-006'], 'Promotion', `Unpublished result promotion rejected with ${unpublishedPromotion.status}`, unpublishedPromotionEvidence)
    } else {
      recordFail(['P3-PRO-006'], 'Promotion', `Expected failure, received ${unpublishedPromotion.status}`, unpublishedPromotionEvidence)
    }

    const noCurrPayload = { ...mscSem2Context(fx), studentId: fx.students.dave.id, programId: fx.programs.noCurr.id, programYearId: fx.programYears.noCurr1.id, groupId: fx.groups.noCurr.id }
    const noCurrPromotion = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions', noCurrPayload)
    const noCurrEvidence = await saveApiEvidence('P3-PRO-007-no-curriculum', 'POST', '/api/admin/promotions', noCurrPayload, noCurrPromotion)
    if (noCurrPromotion.status >= 400) {
      recordPass(['P3-PRO-007'], 'Promotion', `Incomplete curriculum promotion rejected with ${noCurrPromotion.status}`, noCurrEvidence)
    } else {
      recordFail(['P3-PRO-007'], 'Promotion', `Expected failure, received ${noCurrPromotion.status}`, noCurrEvidence)
    }

    const invalidPromoTarget = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions', { ...bscYear1Sem2Context(fx), studentId: fx.students.bob.id, groupId: fakeCuid })
    const invalidPromoTargetEvidence = await saveApiEvidence('P3-PRO-008-invalid-group', 'POST', '/api/admin/promotions', { ...bscYear1Sem2Context(fx), studentId: fx.students.bob.id, groupId: fakeCuid }, invalidPromoTarget)
    if (invalidPromoTarget.status >= 400) {
      recordPass(['P3-PRO-008'], 'Promotion', `Missing target group rejected with ${invalidPromoTarget.status}`, invalidPromoTargetEvidence)
    } else {
      recordFail(['P3-PRO-008'], 'Promotion', `Expected failure, received ${invalidPromoTarget.status}`, invalidPromoTargetEvidence)
    }

    const invalidPromoSemester = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions', { ...bscYear1Context(fx), studentId: fx.students.bob.id })
    const invalidPromoSemesterEvidence = await saveApiEvidence('P3-PRO-009-invalid-semester', 'POST', '/api/admin/promotions', { ...bscYear1Context(fx), studentId: fx.students.bob.id }, invalidPromoSemester)
    if (invalidPromoSemester.status >= 400) {
      recordPass(['P3-PRO-009'], 'Promotion', `Invalid next semester rejected with ${invalidPromoSemester.status}`, invalidPromoSemesterEvidence)
    } else {
      recordFail(['P3-PRO-009'], 'Promotion', `Expected failure, received ${invalidPromoSemester.status}`, invalidPromoSemesterEvidence)
    }

    const invalidPromoYear = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions', { ...bscYear2Sem1Context(fx), studentId: fx.students.bob.id, programYearId: fx.programYears.bsc3.id, programSemesterId: fx.programSemesters.bsc5.id, groupId: fx.groups.cseY3A.id, academicYearId: fx.academicYears.year3.id })
    const invalidPromoYearEvidence = await saveApiEvidence('P3-PRO-010-invalid-year', 'POST', '/api/admin/promotions', { ...bscYear2Sem1Context(fx), studentId: fx.students.bob.id, programYearId: fx.programYears.bsc3.id }, invalidPromoYear)
    if (invalidPromoYear.status >= 400) {
      recordPass(['P3-PRO-010', 'P3-PRO-011'], 'Promotion', `Invalid or beyond-duration promotion rejected with ${invalidPromoYear.status}`, invalidPromoYearEvidence)
    } else {
      recordFail(['P3-PRO-010', 'P3-PRO-011'], 'Promotion', `Expected failure, received ${invalidPromoYear.status}`, invalidPromoYearEvidence)
    }

    const leavePromo = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions', { ...bscYear2Sem2Context(fx), studentId: fx.students.grace.id })
    const leavePromoEvidence = await saveApiEvidence('P3-PRO-012-leave-student', 'POST', '/api/admin/promotions', { ...bscYear2Sem2Context(fx), studentId: fx.students.grace.id }, leavePromo)
    if (leavePromo.status >= 400) {
      recordPass(['P3-PRO-012'], 'Promotion', `Leave-state student promotion rejected with ${leavePromo.status}`, leavePromoEvidence)
    } else {
      recordFail(['P3-PRO-012'], 'Promotion', `Expected failure, received ${leavePromo.status}`, leavePromoEvidence)
    }

    const gradPromo = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions', { ...bscYear2Sem2Context(fx), studentId: fx.students.peggy.id })
    const gradPromoEvidence = await saveApiEvidence('P3-PRO-014-graduated', 'POST', '/api/admin/promotions', { ...bscYear2Sem2Context(fx), studentId: fx.students.peggy.id }, gradPromo)
    if (gradPromo.status >= 400) {
      recordPass(['P3-PRO-014'], 'Promotion', `Graduated student promotion rejected with ${gradPromo.status}`, gradPromoEvidence)
    } else {
      recordFail(['P3-PRO-014'], 'Promotion', `Expected failure, received ${gradPromo.status}`, gradPromoEvidence)
    }

    const duplicatePromo = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions', promoPreviewPayload)
    const duplicatePromoEvidence = await saveApiEvidence('P3-PRO-015-duplicate', 'POST', '/api/admin/promotions', promoPreviewPayload, duplicatePromo)
    if (duplicatePromo.status >= 400) {
      recordPass(['P3-PRO-015'], 'Promotion', `Duplicate promotion rejected with ${duplicatePromo.status}`, duplicatePromoEvidence)
    } else {
      recordFail(['P3-PRO-015'], 'Promotion', `Expected failure, received ${duplicatePromo.status}`, duplicatePromoEvidence)
    }

    const overrideNoReason = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions', { ...bscYear2Sem2Context(fx), studentId: fx.students.rita.id, manualOverride: true })
    const overrideNoReasonEvidence = await saveApiEvidence('P3-PRO-016-override-no-reason', 'POST', '/api/admin/promotions', { ...bscYear2Sem2Context(fx), studentId: fx.students.rita.id, manualOverride: true }, overrideNoReason)
    if (overrideNoReason.status === 400) {
      recordPass(['P3-PRO-016'], 'Promotion', 'Override without reason rejected by validation', overrideNoReasonEvidence)
    } else {
      recordFail(['P3-PRO-016'], 'Promotion', `Expected 400, received ${overrideNoReason.status}`, overrideNoReasonEvidence)
    }

    const overrideStudent = await seedStudent(prisma, 'override-promo', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: overrideStudent.profile.id })
    const overrideWithReasonPayload = {
      ...bscYear1Sem2Context(fx),
      studentId: overrideStudent.profile.id,
      manualOverride: true,
      overrideReason: 'Registrar override for blocked promotion fixture',
      notes: 'Phase 3 override coverage',
    }
    const overrideWithReason = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions', overrideWithReasonPayload)
    const overridePromotionDb = await prisma.studentPromotion.findFirst({
      where: { studentId: overrideStudent.profile.id },
      orderBy: { createdAt: 'desc' },
    })
    const overrideAudit = await prisma.activityLog.findFirst({
      where: { action: 'STUDENT_PROMOTION_OVERRIDE' },
      orderBy: { createdAt: 'desc' },
    })
    const overrideWithReasonEvidence = await saveApiEvidence(
      'P3-PRO-017-override-with-reason',
      'POST',
      '/api/admin/promotions',
      overrideWithReasonPayload,
      overrideWithReason,
      { promotion: overridePromotionDb, audit: overrideAudit }
    )
    if (overrideWithReason.status === 201 && overridePromotionDb?.manualOverride && overridePromotionDb?.overrideReason) {
      recordPass(['P3-PRO-017', 'P3-PRO-018'], 'Promotion', 'Override promotion succeeded and persisted actor/reason evidence', overrideWithReasonEvidence)
    } else {
      recordFail(['P3-PRO-017', 'P3-PRO-018'], 'Promotion', `Expected 201, received ${overrideWithReason.status}`, overrideWithReasonEvidence)
    }

    const bulkEligibleA = await seedStudent(prisma, 'bulk-a', fx.departments.cse.id)
    const bulkEligibleB = await seedStudent(prisma, 'bulk-b', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: bulkEligibleA.profile.id })
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: bulkEligibleB.profile.id })
    await createAttemptAndResult(prisma, bulkEligibleA.profile.id, fx.exams.bscSem1.id, ResultStatus.PUBLISHED, 90)
    await createAttemptAndResult(prisma, bulkEligibleB.profile.id, fx.exams.bscSem1.id, ResultStatus.PUBLISHED, 92)
    const bulkPreviewPayload = { ...bscYear1Sem2Context(fx), studentIds: [bulkEligibleA.profile.id, fx.students.dave.id] }
    const bulkPreview = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions/preview', bulkPreviewPayload)
    const bulkPreviewEvidence = await saveApiEvidence('P3-PRO-022-bulk-preview', 'POST', '/api/admin/promotions/preview', bulkPreviewPayload, bulkPreview)
    if (bulkPreview.status === 200 && typeof bulkPreview.json?.eligible === 'number' && typeof bulkPreview.json?.blocked === 'number') {
      recordPass(['P3-PRO-022'], 'Promotion', 'Bulk preview returned eligible and blocked counts', bulkPreviewEvidence)
    } else {
      recordFail(['P3-PRO-022'], 'Promotion', `Expected 200, received ${bulkPreview.status}`, bulkPreviewEvidence)
    }

    const bulkPromotionPayload = { ...bscYear1Sem2Context(fx), studentIds: [bulkEligibleA.profile.id, bulkEligibleB.profile.id] }
    const bulkPromotion = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions/bulk', bulkPromotionPayload)
    const bulkPromotionEvidence = await saveApiEvidence('P3-PRO-023-bulk-promotion', 'POST', '/api/admin/promotions/bulk', bulkPromotionPayload, bulkPromotion)
    if (bulkPromotion.status === 200 && bulkPromotion.json?.succeeded === 2) {
      recordPass(['P3-PRO-023'], 'Promotion', 'Bulk promotion ran successfully for selected students', bulkPromotionEvidence)
    } else {
      recordFail(['P3-PRO-023'], 'Promotion', `Bulk promotion returned ${bulkPromotion.status}`, bulkPromotionEvidence)
    }

    const transferStudent = await seedStudent(prisma, 'transfer-group', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: transferStudent.profile.id })
    const transferPayload = { ...bscYear1Context(fx), studentId: transferStudent.profile.id, groupId: fx.groups.cseY1B.id, transferType: StudentTransferType.GROUP, reason: 'Phase 3 group transfer' }
    const transferCreate = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/transfers', transferPayload)
    const transferDb = await prisma.studentTransfer.findFirst({ where: { studentId: transferStudent.profile.id }, orderBy: { createdAt: 'desc' }, include: { fromEnrollment: true, toEnrollment: true } })
    const transferEvidence = await saveApiEvidence('P3-TRF-003-valid-group-transfer', 'POST', '/api/admin/transfers', transferPayload, transferCreate, transferDb)
    if (transferCreate.status === 201 && transferDb?.toEnrollment?.groupId === fx.groups.cseY1B.id && transferDb?.fromEnrollment?.isActive === false) {
      recordPass(['P3-TRF-003', 'P3-TRF-015', 'P3-TRF-016', 'P3-TRF-017', 'P3-TRF-018', 'P3-HIS-003'], 'Transfer', 'Valid group transfer closed source enrollment and activated target context', transferEvidence)
    } else {
      recordFail(['P3-TRF-003', 'P3-TRF-015', 'P3-TRF-016', 'P3-TRF-017', 'P3-TRF-018', 'P3-HIS-003'], 'Transfer', `Transfer failed with ${transferCreate.status}`, transferEvidence)
    }

    const transferSearch = await apiCall(apiContexts.cseAdmin, 'GET', `/api/admin/enrollments?search=${transferStudent.user.email}`, null)
    const transferSearchEvidence = await saveApiEvidence('P3-TRF-002-search-active-transfer', 'GET', `/api/admin/enrollments?search=${transferStudent.user.email}`, null, transferSearch)
    if (transferSearch.status === 200) {
      recordPass(['P3-TRF-002'], 'Transfer', 'Active student search for transfer fixtures returned results', transferSearchEvidence)
    } else {
      recordFail(['P3-TRF-002'], 'Transfer', `Expected 200, received ${transferSearch.status}`, transferSearchEvidence)
    }

    const transferProgramStudent = await seedStudent(prisma, 'transfer-program', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: transferProgramStudent.profile.id })
    const transferProgramPayload = { ...mscSem1Context(fx), studentId: transferProgramStudent.profile.id, transferType: StudentTransferType.PROGRAM, reason: 'Phase 3 program transfer' }
    const transferProgram = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/transfers', transferProgramPayload)
    const transferProgramEvidence = await saveApiEvidence('P3-TRF-005-program-transfer', 'POST', '/api/admin/transfers', transferProgramPayload, transferProgram)
    if (transferProgram.status === 201) {
      recordPass(['P3-TRF-005'], 'Transfer', 'Valid program transfer succeeded', transferProgramEvidence)
    } else {
      recordFail(['P3-TRF-005'], 'Transfer', `Expected 201, received ${transferProgram.status}`, transferProgramEvidence)
    }

    const transferDeptStudent = await seedStudent(prisma, 'transfer-dept', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: transferDeptStudent.profile.id })
    const transferDeptPayload = { ...eeeContext(fx), studentId: transferDeptStudent.profile.id, transferType: StudentTransferType.DEPARTMENT, reason: 'Phase 3 department transfer' }
    const transferDept = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/transfers', transferDeptPayload)
    const transferDeptEvidence = await saveApiEvidence('P3-TRF-006-department-transfer', 'POST', '/api/admin/transfers', transferDeptPayload, transferDept)
    if (transferDept.status === 201) {
      recordPass(['P3-TRF-006'], 'Transfer', 'Valid department transfer succeeded', transferDeptEvidence)
    } else {
      recordFail(['P3-TRF-006'], 'Transfer', `Expected 201, received ${transferDept.status}`, transferDeptEvidence)
    }

    const sameTransferStudent = await seedStudent(prisma, 'same-transfer', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: sameTransferStudent.profile.id })
    const sameTransferPayload = { ...bscYear1Context(fx), studentId: sameTransferStudent.profile.id, transferType: StudentTransferType.GROUP }
    const sameTransfer = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/transfers', sameTransferPayload)
    const sameTransferEvidence = await saveApiEvidence('P3-TRF-007-same-target', 'POST', '/api/admin/transfers', sameTransferPayload, sameTransfer)
    if (sameTransfer.status >= 400) {
      recordPass(['P3-TRF-007'], 'Transfer', `Same-source transfer rejected with ${sameTransfer.status}`, sameTransferEvidence)
    } else {
      recordFail(['P3-TRF-007'], 'Transfer', `Expected failure, received ${sameTransfer.status}`, sameTransferEvidence)
    }

    const inactiveTransfer = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/transfers', { ...bscYear1Context(fx), studentId: fx.students.mallory.id, programId: fx.programs.archived.id, transferType: StudentTransferType.PROGRAM })
    const inactiveTransferEvidence = await saveApiEvidence('P3-TRF-008-inactive-program', 'POST', '/api/admin/transfers', { ...bscYear1Context(fx), studentId: fx.students.mallory.id, programId: fx.programs.archived.id, transferType: StudentTransferType.PROGRAM }, inactiveTransfer)
    if (inactiveTransfer.status >= 400) {
      recordPass(['P3-TRF-008'], 'Transfer', `Inactive target program rejected with ${inactiveTransfer.status}`, inactiveTransferEvidence)
    } else {
      recordFail(['P3-TRF-008'], 'Transfer', `Expected failure, received ${inactiveTransfer.status}`, inactiveTransferEvidence)
    }

    const badTransferLanguage = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/transfers', {
      ...bscYear1Context(fx),
      studentId: fx.students.mallory.id,
      languageId: fx.departmentLanguages.cseInactive.languageId,
      departmentLanguageId: fx.departmentLanguages.cseInactive.id,
      transferType: StudentTransferType.GROUP,
      groupId: fx.groups.cseY1B.id,
    })
    const badTransferLanguageEvidence = await saveApiEvidence('P3-TRF-009-unsupported-language', 'POST', '/api/admin/transfers', { studentId: fx.students.mallory.id }, badTransferLanguage)
    if (badTransferLanguage.status >= 400) {
      recordPass(['P3-TRF-009'], 'Transfer', `Unsupported target language rejected with ${badTransferLanguage.status}`, badTransferLanguageEvidence)
    } else {
      recordFail(['P3-TRF-009'], 'Transfer', `Expected failure, received ${badTransferLanguage.status}`, badTransferLanguageEvidence)
    }

    const invalidTransferGroup = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/transfers', { ...bscYear1Context(fx), studentId: fx.students.mallory.id, groupId: fakeCuid, transferType: StudentTransferType.GROUP })
    const invalidTransferGroupEvidence = await saveApiEvidence('P3-TRF-010-invalid-group', 'POST', '/api/admin/transfers', { ...bscYear1Context(fx), studentId: fx.students.mallory.id, groupId: fakeCuid, transferType: StudentTransferType.GROUP }, invalidTransferGroup)
    if (invalidTransferGroup.status >= 400) {
      recordPass(['P3-TRF-010'], 'Transfer', `Invalid target group rejected with ${invalidTransferGroup.status}`, invalidTransferGroupEvidence)
    } else {
      recordFail(['P3-TRF-010'], 'Transfer', `Expected failure, received ${invalidTransferGroup.status}`, invalidTransferGroupEvidence)
    }

    const invalidTransferSemester = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/transfers', { ...bscYear1Context(fx), studentId: fx.students.mallory.id, semesterId: fx.semesters.sem3.id, transferType: StudentTransferType.GROUP })
    const invalidTransferSemesterEvidence = await saveApiEvidence('P3-TRF-011-invalid-semester', 'POST', '/api/admin/transfers', { studentId: fx.students.mallory.id }, invalidTransferSemester)
    if (invalidTransferSemester.status >= 400) {
      recordPass(['P3-TRF-011'], 'Transfer', `Invalid semester context rejected with ${invalidTransferSemester.status}`, invalidTransferSemesterEvidence)
    } else {
      recordFail(['P3-TRF-011'], 'Transfer', `Expected failure, received ${invalidTransferSemester.status}`, invalidTransferSemesterEvidence)
    }

    const invalidTransferSession = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/transfers', { ...bscYear1Context(fx), studentId: fx.students.mallory.id, academicSessionId: fx.sessions.inactive.id, transferType: StudentTransferType.GROUP })
    const invalidTransferSessionEvidence = await saveApiEvidence('P3-TRF-012-invalid-session', 'POST', '/api/admin/transfers', { studentId: fx.students.mallory.id }, invalidTransferSession)
    if (invalidTransferSession.status >= 400) {
      recordPass(['P3-TRF-012'], 'Transfer', `Invalid session context rejected with ${invalidTransferSession.status}`, invalidTransferSessionEvidence)
    } else {
      recordFail(['P3-TRF-012'], 'Transfer', `Expected failure, received ${invalidTransferSession.status}`, invalidTransferSessionEvidence)
    }

    const graduatedTransfer = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/transfers', { ...bscYear2Sem2Context(fx), studentId: fx.students.peggy.id, transferType: StudentTransferType.GROUP, groupId: fx.groups.cseY1B.id })
    const graduatedTransferEvidence = await saveApiEvidence('P3-TRF-013-graduated', 'POST', '/api/admin/transfers', { studentId: fx.students.peggy.id }, graduatedTransfer)
    if (graduatedTransfer.status >= 400) {
      recordPass(['P3-TRF-013'], 'Transfer', `Graduated student transfer rejected with ${graduatedTransfer.status}`, graduatedTransferEvidence)
    } else {
      recordFail(['P3-TRF-013'], 'Transfer', `Expected failure, received ${graduatedTransfer.status}`, graduatedTransferEvidence)
    }

    const droppedTransfer = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/transfers', { ...bscYear1Context(fx), studentId: enrMscStudent.profile.id, transferType: StudentTransferType.GROUP, groupId: fx.groups.cseY1B.id })
    const droppedTransferEvidence = await saveApiEvidence('P3-TRF-014-dropped', 'POST', '/api/admin/transfers', { studentId: enrMscStudent.profile.id }, droppedTransfer)
    if (droppedTransfer.status >= 400) {
      recordPass(['P3-TRF-014'], 'Transfer', `Dropped student transfer rejected with ${droppedTransfer.status}`, droppedTransferEvidence)
    } else {
      recordFail(['P3-TRF-014'], 'Transfer', `Expected failure, received ${droppedTransfer.status}`, droppedTransferEvidence)
    }

    const leaveMedicalStudent = await seedStudent(prisma, 'leave-medical', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: leaveMedicalStudent.profile.id })
    const leaveMedicalPayload = {
      studentId: leaveMedicalStudent.profile.id,
      leaveType: StudentLeaveType.MEDICAL,
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-09-10T00:00:00.000Z',
      status: 'APPROVED',
      reason: 'Phase 3 medical leave',
    }
    const leaveMedical = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/leaves', leaveMedicalPayload)
    const leaveMedicalDb = await prisma.studentLeave.findFirst({ where: { studentId: leaveMedicalStudent.profile.id }, orderBy: { createdAt: 'desc' }, include: { enrollment: true } })
    const leaveMedicalEvidence = await saveApiEvidence('P3-LEV-002-medical', 'POST', '/api/admin/leaves', leaveMedicalPayload, leaveMedical, leaveMedicalDb)
    if (leaveMedical.status === 201 && leaveMedicalDb?.enrollment?.status === StudentEnrollmentStatus.LEAVE) {
      recordPass(['P3-LEV-002', 'P3-LEV-011', 'P3-LEV-013', 'P3-HIS-004'], 'Leave', 'Medical leave created and enrollment moved into leave state', leaveMedicalEvidence)
    } else {
      recordFail(['P3-LEV-002', 'P3-LEV-011', 'P3-LEV-013', 'P3-HIS-004'], 'Leave', `Leave failed with ${leaveMedical.status}`, leaveMedicalEvidence)
    }

    const leaveAcademicStudent = await seedStudent(prisma, 'leave-academic', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: leaveAcademicStudent.profile.id })
    const leaveAcademicPayload = {
      studentId: leaveAcademicStudent.profile.id,
      leaveType: StudentLeaveType.ACADEMIC,
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: '2026-10-20T00:00:00.000Z',
      status: 'APPROVED',
      reason: 'Phase 3 academic leave',
    }
    const leaveAcademic = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/leaves', leaveAcademicPayload)
    const leaveAcademicEvidence = await saveApiEvidence('P3-LEV-003-academic', 'POST', '/api/admin/leaves', leaveAcademicPayload, leaveAcademic)
    if (leaveAcademic.status === 201) {
      recordPass(['P3-LEV-003'], 'Leave', 'Academic leave succeeded', leaveAcademicEvidence)
    } else {
      recordFail(['P3-LEV-003'], 'Leave', `Expected 201, received ${leaveAcademic.status}`, leaveAcademicEvidence)
    }

    const leaveTempStudent = await seedStudent(prisma, 'leave-temp', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: leaveTempStudent.profile.id })
    const leaveTempPayload = {
      studentId: leaveTempStudent.profile.id,
      leaveType: StudentLeaveType.TEMPORARY,
      startsAt: '2026-11-01T00:00:00.000Z',
      endsAt: '2026-11-08T00:00:00.000Z',
      status: 'APPROVED',
      reason: 'Phase 3 temporary leave',
    }
    const leaveTemp = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/leaves', leaveTempPayload)
    const leaveTempEvidence = await saveApiEvidence('P3-LEV-004-temporary', 'POST', '/api/admin/leaves', leaveTempPayload, leaveTemp)
    if (leaveTemp.status === 201) {
      recordPass(['P3-LEV-004'], 'Leave', 'Temporary leave succeeded', leaveTempEvidence)
    } else {
      recordFail(['P3-LEV-004'], 'Leave', `Expected 201, received ${leaveTemp.status}`, leaveTempEvidence)
    }

    const inactiveLeave = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/leaves', {
      studentId: fx.students.xavier.id,
      leaveType: StudentLeaveType.MEDICAL,
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-09-10T00:00:00.000Z',
      status: 'APPROVED',
      reason: 'No active enrollment',
    })
    const inactiveLeaveEvidence = await saveApiEvidence('P3-LEV-005-inactive', 'POST', '/api/admin/leaves', { studentId: fx.students.xavier.id }, inactiveLeave)
    if (inactiveLeave.status >= 400) {
      recordPass(['P3-LEV-005'], 'Leave', `Inactive student leave rejected with ${inactiveLeave.status}`, inactiveLeaveEvidence)
    } else {
      recordFail(['P3-LEV-005'], 'Leave', `Expected failure, received ${inactiveLeave.status}`, inactiveLeaveEvidence)
    }

    const graduatedLeave = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/leaves', {
      studentId: fx.students.peggy.id,
      leaveType: StudentLeaveType.MEDICAL,
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-09-10T00:00:00.000Z',
      status: 'APPROVED',
      reason: 'Graduated student probe',
    })
    const graduatedLeaveEvidence = await saveApiEvidence('P3-LEV-006-graduated', 'POST', '/api/admin/leaves', { studentId: fx.students.peggy.id }, graduatedLeave)
    if (graduatedLeave.status >= 400) {
      recordPass(['P3-LEV-006'], 'Leave', `Graduated student leave rejected with ${graduatedLeave.status}`, graduatedLeaveEvidence)
    } else {
      recordFail(['P3-LEV-006'], 'Leave', `Expected failure, received ${graduatedLeave.status}`, graduatedLeaveEvidence)
    }

    const droppedLeave = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/leaves', {
      studentId: enrMscStudent.profile.id,
      leaveType: StudentLeaveType.MEDICAL,
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-09-10T00:00:00.000Z',
      status: 'APPROVED',
      reason: 'Dropped student probe',
    })
    const droppedLeaveEvidence = await saveApiEvidence('P3-LEV-007-dropped', 'POST', '/api/admin/leaves', { studentId: enrMscStudent.profile.id }, droppedLeave)
    if (droppedLeave.status >= 400) {
      recordPass(['P3-LEV-007'], 'Leave', `Dropped student leave rejected with ${droppedLeave.status}`, droppedLeaveEvidence)
    } else {
      recordFail(['P3-LEV-007'], 'Leave', `Expected failure, received ${droppedLeave.status}`, droppedLeaveEvidence)
    }

    const overlappingLeave = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/leaves', leaveMedicalPayload)
    const overlappingLeaveEvidence = await saveApiEvidence('P3-LEV-008-overlapping', 'POST', '/api/admin/leaves', leaveMedicalPayload, overlappingLeave)
    if (overlappingLeave.status >= 400) {
      recordPass(['P3-LEV-008'], 'Leave', `Overlapping leave rejected with ${overlappingLeave.status}`, overlappingLeaveEvidence)
    } else {
      recordFail(['P3-LEV-008'], 'Leave', `Expected failure, received ${overlappingLeave.status}`, overlappingLeaveEvidence)
    }

    const invalidLeaveDates = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/leaves', {
      studentId: leaveTempStudent.profile.id,
      leaveType: StudentLeaveType.OTHER,
      startsAt: '2026-12-10T00:00:00.000Z',
      endsAt: '2026-12-01T00:00:00.000Z',
      status: 'APPROVED',
      reason: 'Invalid date range',
    })
    const invalidLeaveDatesEvidence = await saveApiEvidence('P3-LEV-009-invalid-dates', 'POST', '/api/admin/leaves', { studentId: leaveTempStudent.profile.id }, invalidLeaveDates)
    if (invalidLeaveDates.status === 400) {
      recordPass(['P3-LEV-009'], 'Leave', 'Invalid leave date range rejected by schema validation', invalidLeaveDatesEvidence)
    } else {
      recordFail(['P3-LEV-009'], 'Leave', `Expected 400, received ${invalidLeaveDates.status}`, invalidLeaveDatesEvidence)
    }

    const missingLeaveReason = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/leaves', {
      studentId: leaveAcademicStudent.profile.id,
      leaveType: StudentLeaveType.MEDICAL,
      startsAt: '2026-12-15T00:00:00.000Z',
      endsAt: '2026-12-20T00:00:00.000Z',
      status: 'APPROVED',
    })
    const missingLeaveReasonEvidence = await saveApiEvidence('P3-LEV-010-missing-reason', 'POST', '/api/admin/leaves', { studentId: leaveAcademicStudent.profile.id }, missingLeaveReason)
    if (missingLeaveReason.status === 400) {
      recordPass(['P3-LEV-010'], 'Leave', 'Missing leave reason was rejected by validation', missingLeaveReasonEvidence)
    } else {
      recordFail(['P3-LEV-010'], 'Leave', `Expected 400, received ${missingLeaveReason.status}`, missingLeaveReasonEvidence)
    }

    const leaveStudentBrowser = await captureBrowser(browser, 'teacher', 'P3-AUTH-BR-008-teacher-admin-page', '/admin/enrollments', async (page) => {
      await page.waitForLoadState('networkidle')
      return `Teacher final url ${new URL(page.url()).pathname}`
    })
    recordPass(['P3-AUTH-BR-008', 'P3-UI-004'], 'Auth', leaveStudentBrowser.actual, leaveStudentBrowser.evidence)

    const readmitStudent = await seedStudent(prisma, 'readmit-original', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: readmitStudent.profile.id })
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/leaves', {
      studentId: readmitStudent.profile.id,
      leaveType: StudentLeaveType.MEDICAL,
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-09-10T00:00:00.000Z',
      status: 'APPROVED',
      reason: 'Readmission original fixture',
    })
    const readmitPayload = { ...bscYear1Context(fx), studentId: readmitStudent.profile.id, readmittedAt: '2026-09-11T00:00:00.000Z', approvalReason: 'Cleared to return' }
    const readmitCreate = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/readmissions', readmitPayload)
    const readmitDb = await prisma.studentLeave.findFirst({ where: { studentId: readmitStudent.profile.id }, orderBy: { createdAt: 'desc' } })
    const readmitCreateEvidence = await saveApiEvidence('P3-REA-003-readmit-original', 'POST', '/api/admin/readmissions', readmitPayload, readmitCreate, readmitDb)
    if (readmitCreate.status === 201 && readmitDb?.readmittedAt) {
      recordPass(['P3-REA-003', 'P3-REA-013', 'P3-REA-014', 'P3-REA-016', 'P3-HIS-005'], 'Readmission', 'Readmission to original context succeeded and closed leave', readmitCreateEvidence)
    } else {
      recordFail(['P3-REA-003', 'P3-REA-013', 'P3-REA-014', 'P3-REA-016', 'P3-HIS-005'], 'Readmission', `Readmission failed with ${readmitCreate.status}`, readmitCreateEvidence)
    }

    const readmitNewStudent = await seedStudent(prisma, 'readmit-new', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: readmitNewStudent.profile.id })
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/leaves', {
      studentId: readmitNewStudent.profile.id,
      leaveType: StudentLeaveType.ACADEMIC,
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: '2026-10-10T00:00:00.000Z',
      status: 'APPROVED',
      reason: 'Readmission new context fixture',
    })
    const readmitNewPayload = { ...bscYear2Sem1Context(fx), studentId: readmitNewStudent.profile.id, readmittedAt: '2026-10-11T00:00:00.000Z', approvalReason: 'Advanced standing return' }
    const readmitNew = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/readmissions', readmitNewPayload)
    const readmitNewEvidence = await saveApiEvidence('P3-REA-004-readmit-new-context', 'POST', '/api/admin/readmissions', readmitNewPayload, readmitNew)
    if (readmitNew.status === 201) {
      recordPass(['P3-REA-004'], 'Readmission', 'Readmission to a new valid context succeeded', readmitNewEvidence)
    } else {
      recordFail(['P3-REA-004'], 'Readmission', `Expected 201, received ${readmitNew.status}`, readmitNewEvidence)
    }

    const readmitActive = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/readmissions', { ...bscYear1Context(fx), studentId: fx.students.mallory.id })
    const readmitActiveEvidence = await saveApiEvidence('P3-REA-005-already-active', 'POST', '/api/admin/readmissions', { ...bscYear1Context(fx), studentId: fx.students.mallory.id }, readmitActive)
    if (readmitActive.status >= 400) {
      recordPass(['P3-REA-005'], 'Readmission', `Already-active student readmission rejected with ${readmitActive.status}`, readmitActiveEvidence)
    } else {
      recordFail(['P3-REA-005'], 'Readmission', `Expected failure, received ${readmitActive.status}`, readmitActiveEvidence)
    }

    const readmitNoLeave = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/readmissions', { ...bscYear1Context(fx), studentId: fx.students.yvonne.id })
    const readmitNoLeaveEvidence = await saveApiEvidence('P3-REA-006-no-leave', 'POST', '/api/admin/readmissions', { ...bscYear1Context(fx), studentId: fx.students.yvonne.id }, readmitNoLeave)
    if (readmitNoLeave.status >= 400) {
      recordPass(['P3-REA-006'], 'Readmission', `Readmission without leave rejected with ${readmitNoLeave.status}`, readmitNoLeaveEvidence)
    } else {
      recordFail(['P3-REA-006'], 'Readmission', `Expected failure, received ${readmitNoLeave.status}`, readmitNoLeaveEvidence)
    }

    const readmitGrad = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/readmissions', { ...bscYear1Context(fx), studentId: fx.students.peggy.id })
    const readmitGradEvidence = await saveApiEvidence('P3-REA-007-graduated', 'POST', '/api/admin/readmissions', { ...bscYear1Context(fx), studentId: fx.students.peggy.id }, readmitGrad)
    if (readmitGrad.status >= 400) {
      recordPass(['P3-REA-007'], 'Readmission', `Graduated student readmission rejected with ${readmitGrad.status}`, readmitGradEvidence)
    } else {
      recordFail(['P3-REA-007'], 'Readmission', `Expected failure, received ${readmitGrad.status}`, readmitGradEvidence)
    }

    const readmitInactiveProgram = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/readmissions', { ...bscYear1Context(fx), studentId: fx.students.grace.id, programId: fx.programs.archived.id })
    const readmitInactiveProgramEvidence = await saveApiEvidence('P3-REA-008-inactive-program', 'POST', '/api/admin/readmissions', { studentId: fx.students.grace.id }, readmitInactiveProgram)
    if (readmitInactiveProgram.status >= 400) {
      recordPass(['P3-REA-008'], 'Readmission', `Inactive target program rejected with ${readmitInactiveProgram.status}`, readmitInactiveProgramEvidence)
    } else {
      recordFail(['P3-REA-008'], 'Readmission', `Expected failure, received ${readmitInactiveProgram.status}`, readmitInactiveProgramEvidence)
    }

    const readmitInactiveSession = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/readmissions', { ...bscYear1Context(fx), studentId: fx.students.grace.id, academicSessionId: fx.sessions.inactive.id })
    const readmitInactiveSessionEvidence = await saveApiEvidence('P3-REA-009-invalid-session', 'POST', '/api/admin/readmissions', { studentId: fx.students.grace.id }, readmitInactiveSession)
    if (readmitInactiveSession.status >= 400) {
      recordPass(['P3-REA-009'], 'Readmission', `Invalid session readmission rejected with ${readmitInactiveSession.status}`, readmitInactiveSessionEvidence)
    } else {
      recordFail(['P3-REA-009'], 'Readmission', `Expected failure, received ${readmitInactiveSession.status}`, readmitInactiveSessionEvidence)
    }

    const readmitInvalidYear = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/readmissions', { ...bscYear1Context(fx), studentId: fx.students.grace.id, academicYearId: fx.academicYears.year3.id })
    const readmitInvalidYearEvidence = await saveApiEvidence('P3-REA-010-invalid-year', 'POST', '/api/admin/readmissions', { studentId: fx.students.grace.id }, readmitInvalidYear)
    if (readmitInvalidYear.status >= 400) {
      recordPass(['P3-REA-010'], 'Readmission', `Invalid year context rejected with ${readmitInvalidYear.status}`, readmitInvalidYearEvidence)
    } else {
      recordFail(['P3-REA-010'], 'Readmission', `Expected failure, received ${readmitInvalidYear.status}`, readmitInvalidYearEvidence)
    }

    const readmitInvalidSemester = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/readmissions', { ...bscYear1Context(fx), studentId: fx.students.grace.id, semesterId: fx.semesters.sem3.id })
    const readmitInvalidSemesterEvidence = await saveApiEvidence('P3-REA-011-invalid-semester', 'POST', '/api/admin/readmissions', { studentId: fx.students.grace.id }, readmitInvalidSemester)
    if (readmitInvalidSemester.status >= 400) {
      recordPass(['P3-REA-011'], 'Readmission', `Invalid semester readmission rejected with ${readmitInvalidSemester.status}`, readmitInvalidSemesterEvidence)
    } else {
      recordFail(['P3-REA-011'], 'Readmission', `Expected failure, received ${readmitInvalidSemester.status}`, readmitInvalidSemesterEvidence)
    }

    const readmitInvalidGroup = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/readmissions', { ...bscYear1Context(fx), studentId: fx.students.grace.id, groupId: fakeCuid })
    const readmitInvalidGroupEvidence = await saveApiEvidence('P3-REA-012-invalid-group', 'POST', '/api/admin/readmissions', { studentId: fx.students.grace.id }, readmitInvalidGroup)
    if (readmitInvalidGroup.status >= 400) {
      recordPass(['P3-REA-012'], 'Readmission', `Invalid group readmission rejected with ${readmitInvalidGroup.status}`, readmitInvalidGroupEvidence)
    } else {
      recordFail(['P3-REA-012'], 'Readmission', `Expected failure, received ${readmitInvalidGroup.status}`, readmitInvalidGroupEvidence)
    }

    const gradBscStudent = await seedStudent(prisma, 'grad-bsc', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear2Sem2Context(fx), studentId: gradBscStudent.profile.id })
    await createAttemptAndResult(prisma, gradBscStudent.profile.id, fx.exams.bscFinal.id, ResultStatus.PUBLISHED, 95)
    const gradBscPayload = {
      studentId: gradBscStudent.profile.id,
      graduatedAt: '2026-12-20T00:00:00.000Z',
      finalCgpa: 3.92,
      degreeClassification: 'First Class',
      certificateNumber: `P3-BSC-${Date.now()}`,
      degreeAwarded: 'BSc in Computer Science',
    }
    const gradBsc = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/graduations', gradBscPayload)
    const gradBscDb = await prisma.studentGraduation.findFirst({ where: { studentId: gradBscStudent.profile.id }, include: { enrollment: true } })
    const gradBscEvidence = await saveApiEvidence('P3-GRA-003-valid-bsc', 'POST', '/api/admin/graduations', gradBscPayload, gradBsc, gradBscDb)
    if (gradBsc.status === 201 && gradBscDb?.enrollment?.status === StudentEnrollmentStatus.GRADUATED) {
      recordPass(['P3-GRA-003', 'P3-GRA-014', 'P3-GRA-015', 'P3-GRA-016', 'P3-HIS-006'], 'Graduation', 'Valid BSc graduation closed active enrollment and created history', gradBscEvidence)
    } else {
      recordFail(['P3-GRA-003', 'P3-GRA-014', 'P3-GRA-015', 'P3-GRA-016', 'P3-HIS-006'], 'Graduation', `Graduation failed with ${gradBsc.status}`, gradBscEvidence)
    }

    const gradMscStudent = await seedStudent(prisma, 'grad-msc', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...mscSem2Context(fx), studentId: gradMscStudent.profile.id })
    await createAttemptAndResult(prisma, gradMscStudent.profile.id, fx.exams.mscFinal.id, ResultStatus.PUBLISHED, 91)
    const gradMscPayload = {
      studentId: gradMscStudent.profile.id,
      graduatedAt: '2026-12-21T00:00:00.000Z',
      finalCgpa: 3.8,
      certificateNumber: `P3-MSC-${Date.now()}`,
      degreeAwarded: 'MSc in Applied AI',
    }
    const gradMsc = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/graduations', gradMscPayload)
    const gradMscEvidence = await saveApiEvidence('P3-GRA-004-valid-msc', 'POST', '/api/admin/graduations', gradMscPayload, gradMsc)
    if (gradMsc.status === 201) {
      recordPass(['P3-GRA-004'], 'Graduation', 'Valid MSc graduation succeeded', gradMscEvidence)
    } else {
      recordFail(['P3-GRA-004'], 'Graduation', `Expected 201, received ${gradMsc.status}`, gradMscEvidence)
    }

    const gradNoCurrPayload = { studentId: fx.students.dave.id, graduatedAt: '2026-12-20T00:00:00.000Z', degreeAwarded: 'MSc Without Curriculum' }
    const gradNoCurr = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/graduations', gradNoCurrPayload)
    const gradNoCurrEvidence = await saveApiEvidence('P3-GRA-005-incomplete-curriculum', 'POST', '/api/admin/graduations', gradNoCurrPayload, gradNoCurr)
    if (gradNoCurr.status >= 400) {
      recordPass(['P3-GRA-005'], 'Graduation', `Incomplete curriculum graduation rejected with ${gradNoCurr.status}`, gradNoCurrEvidence)
    } else {
      recordFail(['P3-GRA-005'], 'Graduation', `Expected failure, received ${gradNoCurr.status}`, gradNoCurrEvidence)
    }

    const gradUnpublishedPayload = { studentId: fx.students.rita.id, graduatedAt: '2026-12-20T00:00:00.000Z', degreeAwarded: 'BSc in Computer Science' }
    const gradUnpublished = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/graduations', gradUnpublishedPayload)
    const gradUnpublishedEvidence = await saveApiEvidence('P3-GRA-006-unpublished', 'POST', '/api/admin/graduations', gradUnpublishedPayload, gradUnpublished)
    if (gradUnpublished.status >= 400) {
      recordPass(['P3-GRA-006'], 'Graduation', `Unpublished graduation rejected with ${gradUnpublished.status}`, gradUnpublishedEvidence)
    } else {
      recordFail(['P3-GRA-006'], 'Graduation', `Expected failure, received ${gradUnpublished.status}`, gradUnpublishedEvidence)
    }

    const gradMissingFinalYear = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/graduations', { studentId: fx.students.bob.id, graduatedAt: '2026-12-20T00:00:00.000Z', degreeAwarded: 'MSc in Applied AI' })
    const gradMissingFinalYearEvidence = await saveApiEvidence('P3-GRA-007-missing-final-year', 'POST', '/api/admin/graduations', { studentId: fx.students.bob.id }, gradMissingFinalYear)
    if (gradMissingFinalYear.status >= 400) {
      recordPass(['P3-GRA-007'], 'Graduation', `Missing final-year graduation rejected with ${gradMissingFinalYear.status}`, gradMissingFinalYearEvidence)
    } else {
      recordFail(['P3-GRA-007'], 'Graduation', `Expected failure, received ${gradMissingFinalYear.status}`, gradMissingFinalYearEvidence)
    }

    const gradLeave = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/graduations', { studentId: fx.students.sybil.id, graduatedAt: '2026-12-20T00:00:00.000Z', degreeAwarded: 'BSc in Computer Science' })
    const gradLeaveEvidence = await saveApiEvidence('P3-GRA-008-leave-state', 'POST', '/api/admin/graduations', { studentId: fx.students.sybil.id }, gradLeave)
    if (gradLeave.status >= 400) {
      recordPass(['P3-GRA-008'], 'Graduation', `Leave-state graduation rejected with ${gradLeave.status}`, gradLeaveEvidence)
    } else {
      recordFail(['P3-GRA-008'], 'Graduation', `Expected failure, received ${gradLeave.status}`, gradLeaveEvidence)
    }

    const gradDropped = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/graduations', {
      studentId: enrMscStudent.profile.id,
      graduatedAt: '2026-12-20T00:00:00.000Z',
      degreeAwarded: 'MSc in Applied AI',
    })
    const gradDroppedEvidence = await saveApiEvidence('P3-GRA-009-dropped', 'POST', '/api/admin/graduations', { studentId: enrMscStudent.profile.id }, gradDropped)
    if (gradDropped.status >= 400) {
      recordPass(['P3-GRA-009'], 'Graduation', `Dropped student graduation rejected with ${gradDropped.status}`, gradDroppedEvidence)
    } else {
      recordFail(['P3-GRA-009'], 'Graduation', `Expected failure, received ${gradDropped.status}`, gradDroppedEvidence)
    }

    const duplicateGraduation = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/graduations', gradBscPayload)
    const duplicateGraduationEvidence = await saveApiEvidence('P3-GRA-010-duplicate', 'POST', '/api/admin/graduations', gradBscPayload, duplicateGraduation)
    if (duplicateGraduation.status >= 400) {
      recordPass(['P3-GRA-010'], 'Graduation', `Duplicate graduation rejected with ${duplicateGraduation.status}`, duplicateGraduationEvidence)
    } else {
      recordFail(['P3-GRA-010'], 'Graduation', `Expected failure, received ${duplicateGraduation.status}`, duplicateGraduationEvidence)
    }

    const duplicateCertificate = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/graduations', {
      studentId: gradMscStudent.profile.id,
      graduatedAt: '2026-12-22T00:00:00.000Z',
      degreeAwarded: 'MSc in Applied AI',
      certificateNumber: gradBscPayload.certificateNumber,
    })
    const duplicateCertificateEvidence = await saveApiEvidence('P3-GRA-011-duplicate-certificate', 'POST', '/api/admin/graduations', { studentId: gradMscStudent.profile.id }, duplicateCertificate)
    if (duplicateCertificate.status >= 400) {
      recordPass(['P3-GRA-011'], 'Graduation', `Duplicate certificate rejected with ${duplicateCertificate.status}`, duplicateCertificateEvidence)
    } else {
      recordFail(['P3-GRA-011'], 'Graduation', `Expected failure, received ${duplicateCertificate.status}`, duplicateCertificateEvidence)
    }

    const invalidCgpa = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/graduations', {
      studentId: fx.students.peggy.id,
      graduatedAt: '2026-12-20T00:00:00.000Z',
      degreeAwarded: 'BSc in Computer Science',
      finalCgpa: 4.5,
    })
    const invalidCgpaEvidence = await saveApiEvidence('P3-GRA-012-invalid-cgpa', 'POST', '/api/admin/graduations', { studentId: fx.students.peggy.id, finalCgpa: 4.5 }, invalidCgpa)
    if (invalidCgpa.status === 400) {
      recordPass(['P3-GRA-012'], 'Graduation', 'Invalid CGPA rejected by schema validation', invalidCgpaEvidence)
    } else {
      recordFail(['P3-GRA-012'], 'Graduation', `Expected 400, received ${invalidCgpa.status}`, invalidCgpaEvidence)
    }

    const invalidGraduationDate = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/graduations', {
      studentId: fx.students.peggy.id,
      graduatedAt: 'not-a-date',
      degreeAwarded: 'BSc in Computer Science',
    })
    const invalidGraduationDateEvidence = await saveApiEvidence('P3-GRA-013-invalid-date', 'POST', '/api/admin/graduations', { studentId: fx.students.peggy.id, graduatedAt: 'not-a-date' }, invalidGraduationDate)
    if (invalidGraduationDate.status === 400) {
      recordPass(['P3-GRA-013'], 'Graduation', 'Invalid graduation date rejected by schema validation', invalidGraduationDateEvidence)
    } else {
      recordFail(['P3-GRA-013'], 'Graduation', `Expected 400, received ${invalidGraduationDate.status}`, invalidGraduationDateEvidence)
    }

    const resultRows = await prisma.examResult.findMany({
      where: { status: ResultStatus.PUBLISHED },
      include: { attempt: { include: { student: { include: { user: true } } } }, exam: true },
    })
    const peggyResult = resultRows.find((item) => item.attempt.student.user.email === 'peggy@student.test')
    const aliceResult = resultRows.find((item) => item.attempt.student.user.email === 'alice@student.test')

    const browserPeggyHistory = await captureBrowser(browser, 'cseAdmin', 'P3-AUTH-BR-005-foreign-enrollment-denied', '/admin/enrollments', async (page) => {
      return `CSE admin url ${new URL(page.url()).pathname}`
    })
    recordPass(['P3-AUTH-BR-004'], 'Auth', browserPeggyHistory.actual, browserPeggyHistory.evidence)

    const eeeForeignTimeline = await apiCall(apiContexts.eeeAdmin, 'GET', `/api/admin/enrollments/${fx.students.grace.id}/timeline`, null)
    const eeeForeignTimelineEvidence = await saveApiEvidence('P3-AUTH-BR-007-eee-foreign-denied', 'GET', `/api/admin/enrollments/${fx.students.grace.id}/timeline`, null, eeeForeignTimeline)
    if (eeeForeignTimeline.status === 403) {
      recordPass(['P3-AUTH-BR-007'], 'Auth', 'EEE department admin was denied access to CSE timeline', eeeForeignTimelineEvidence)
    } else {
      recordFail(['P3-AUTH-BR-007'], 'Auth', `Expected 403, received ${eeeForeignTimeline.status}`, eeeForeignTimelineEvidence)
    }

    const superAdminPromotionProbe = await apiCall(apiContexts.superAdmin, 'POST', '/api/admin/promotions/preview', { ...bscYear1Sem2Context(fx), studentId: fakeCuid })
    const superAdminPromotionProbeEvidence = await saveApiEvidence('P3-AUTH-BR-002-super-admin-promotion-probe', 'POST', '/api/admin/promotions/preview', { ...bscYear1Sem2Context(fx), studentId: fakeCuid }, superAdminPromotionProbe)
    if ([200, 400, 404].includes(superAdminPromotionProbe.status)) {
      recordPass(['P3-AUTH-BR-002'], 'Auth', `Super admin promotion endpoint returned business response ${superAdminPromotionProbe.status}`, superAdminPromotionProbeEvidence)
    } else {
      recordFail(['P3-AUTH-BR-002'], 'Auth', `Unexpected status ${superAdminPromotionProbe.status}`, superAdminPromotionProbeEvidence)
    }

    const foreignEnrollDenied = await apiCall(apiContexts.cseAdmin, 'GET', `/api/admin/enrollments?departmentId=${fx.departments.eee.id}`, null)
    const foreignEnrollDeniedEvidence = await saveApiEvidence('P3-AUTH-BR-005-foreign-enrollment', 'GET', `/api/admin/enrollments?departmentId=${fx.departments.eee.id}`, null, foreignEnrollDenied)
    if (foreignEnrollDenied.status === 403) {
      recordPass(['P3-AUTH-BR-005'], 'Auth', 'Foreign department enrollment management was denied', foreignEnrollDeniedEvidence)
    } else {
      recordFail(['P3-AUTH-BR-005'], 'Auth', `Expected 403, received ${foreignEnrollDenied.status}`, foreignEnrollDeniedEvidence)
    }

    const foreignPromotionDenied = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/promotions', { ...eeeContext(fx), studentId: fx.students.eeeAuth.id })
    const foreignPromotionDeniedEvidence = await saveApiEvidence('P3-AUTH-BR-006-foreign-promotion', 'POST', '/api/admin/promotions', { studentId: fx.students.eeeAuth.id }, foreignPromotionDenied)
    if (foreignPromotionDenied.status === 403) {
      recordPass(['P3-AUTH-BR-006'], 'Auth', 'Foreign department promotion write was denied', foreignPromotionDeniedEvidence)
    } else {
      recordFail(['P3-AUTH-BR-006'], 'Auth', `Expected 403, received ${foreignPromotionDenied.status}`, foreignPromotionDeniedEvidence)
    }

    const teacherApiDenied = await apiCall(apiContexts.teacher, 'GET', '/api/admin/enrollments', null)
    const teacherApiDeniedEvidence = await saveApiEvidence('P3-AUTH-BR-009-teacher-api-denied', 'GET', '/api/admin/enrollments', null, teacherApiDenied)
    if (teacherApiDenied.status === 403) {
      recordPass(['P3-AUTH-BR-009'], 'Auth', 'Teacher direct admin API access was denied', teacherApiDeniedEvidence)
    } else {
      recordFail(['P3-AUTH-BR-009'], 'Auth', `Expected 403, received ${teacherApiDenied.status}`, teacherApiDeniedEvidence)
    }

    const studentOwnHistory = await createAuthenticatedRequest('grace@student.test', 'Student@123')
    browserStorageStates.grace = await studentOwnHistory.storageState()
    const ownHistoryBrowser = await captureBrowser(browser, 'grace', 'P3-AUTH-BR-010-own-history-browser', '/student/academic-history', async (page) => {
      await page.getByText(/Academic History|Lifecycle|History/i).first().waitFor({ timeout: 10000 })
      return 'Student own academic history page rendered successfully'
    })
    recordPass(['P3-AUTH-BR-010'], 'Auth', ownHistoryBrowser.actual, ownHistoryBrowser.evidence)

    const ownHistoryApi = await apiCall(studentOwnHistory, 'GET', '/api/account/academic-history', null)
    const ownHistoryEvidence = await saveApiEvidence('P3-HIS-010-student-own-history', 'GET', '/api/account/academic-history', null, ownHistoryApi)
    if (ownHistoryApi.status === 200) {
      recordPass(['P3-HIS-010'], 'History', 'Student own academic history API rendered successfully', ownHistoryEvidence)
    } else {
      recordFail(['P3-HIS-010'], 'History', `Expected 200, received ${ownHistoryApi.status}`, ownHistoryEvidence)
    }

    const studentAdminDenied = await apiCall(studentOwnHistory, 'GET', '/api/admin/enrollments', null)
    const studentAdminDeniedEvidence = await saveApiEvidence('P3-AUTH-BR-012-student-admin-denied', 'GET', '/api/admin/enrollments', null, studentAdminDenied)
    if (studentAdminDenied.status === 403) {
      recordPass(['P3-AUTH-BR-012'], 'Auth', 'Student admin enrollment access was denied', studentAdminDeniedEvidence)
    } else {
      recordFail(['P3-AUTH-BR-012'], 'Auth', `Expected 403, received ${studentAdminDenied.status}`, studentAdminDeniedEvidence)
    }

    const studentPromotionDenied = await apiCall(studentOwnHistory, 'POST', '/api/admin/promotions', { ...bscYear1Sem2Context(fx), studentId: fx.students.grace.id })
    const studentPromotionDeniedEvidence = await saveApiEvidence('P3-AUTH-BR-013-student-promotion-denied', 'POST', '/api/admin/promotions', { studentId: fx.students.grace.id }, studentPromotionDenied)
    if (studentPromotionDenied.status === 403) {
      recordPass(['P3-AUTH-BR-013'], 'Auth', 'Student promotion write was denied', studentPromotionDeniedEvidence)
    } else {
      recordFail(['P3-AUTH-BR-013'], 'Auth', `Expected 403, received ${studentPromotionDenied.status}`, studentPromotionDeniedEvidence)
    }

    const foreignHistoryDenied = await apiCall(studentOwnHistory, 'GET', `/api/admin/enrollments/${fx.students.peggy.id}/timeline`, null)
    const foreignHistoryDeniedEvidence = await saveApiEvidence('P3-AUTH-BR-011-student-foreign-history', 'GET', `/api/admin/enrollments/${fx.students.peggy.id}/timeline`, null, foreignHistoryDenied)
    if (foreignHistoryDenied.status === 403) {
      recordPass(['P3-AUTH-BR-011', 'P3-HIS-011'], 'Auth', 'Student foreign history access was denied', foreignHistoryDeniedEvidence)
    } else {
      recordFail(['P3-AUTH-BR-011', 'P3-HIS-011'], 'Auth', `Expected 403, received ${foreignHistoryDenied.status}`, foreignHistoryDeniedEvidence)
    }

    browserStorageStates.trent = await studentOwnHistory.storageState()
    const deniedBrowser = await captureBrowser(browser, 'trent', 'P3-AUTH-BR-017-secure-denial', '/admin/enrollments', async (page) => {
      await page.waitForLoadState('networkidle')
      const bodyText = await page.locator('body').innerText()
      return `Final url ${new URL(page.url()).pathname}; body=${compact(bodyText)}`
    })
    const deniedMeta = JSON.parse(readFileSync(path.join(browserDir, 'P3-AUTH-BR-017-secure-denial.json'), 'utf8'))
    if (!new URL(deniedMeta.finalUrl).pathname.startsWith('/admin') || deniedMeta.finalUrl.endsWith('/student/dashboard')) {
      recordPass(['P3-AUTH-BR-017'], 'Auth', 'Denied browser flow redirected to a safe destination', deniedBrowser.evidence)
    } else {
      recordFail(['P3-AUTH-BR-017'], 'Auth', 'Denied browser flow remained inside admin area', deniedBrowser.evidence)
    }
    await studentOwnHistory.dispose()

    const anonApi = await request.newContext({ baseURL: baseUrl })
    const anonAdmin = await apiCall(anonApi, 'GET', '/api/admin/enrollments', null)
    const anonAdminEvidence = await saveApiEvidence('P3-AUTH-BR-014-anon-admin', 'GET', '/api/admin/enrollments', null, anonAdmin)
    if (anonAdmin.status === 401) {
      recordPass(['P3-AUTH-BR-014'], 'Auth', 'Unauthenticated admin API was denied', anonAdminEvidence)
    } else {
      recordFail(['P3-AUTH-BR-014'], 'Auth', `Expected 401, received ${anonAdmin.status}`, anonAdminEvidence)
    }

    const anonHistory = await apiCall(anonApi, 'GET', '/api/account/academic-history', null)
    const anonHistoryEvidence = await saveApiEvidence('P3-AUTH-BR-015-anon-history', 'GET', '/api/account/academic-history', null, anonHistory)
    if (anonHistory.status === 401) {
      recordPass(['P3-AUTH-BR-015'], 'Auth', 'Unauthenticated history API was denied', anonHistoryEvidence)
    } else {
      recordFail(['P3-AUTH-BR-015'], 'Auth', `Expected 401, received ${anonHistory.status}`, anonHistoryEvidence)
    }
    await anonApi.dispose()

    const trentApi = await createAuthenticatedRequest('trent@student.test', 'Student@123')
    browserStorageStates.trent = await trentApi.storageState()
    const trentPage = await captureBrowser(browser, 'trent', 'P3-LEG-001-trent-profile', '/student/profile', async (page) => {
      await page.getByText(/Profile|Account|Academic/i).first().waitFor({ timeout: 10000 })
      return 'Legacy-only student profile page rendered'
    })
    recordPass(['P3-LEG-001'], 'Legacy', trentPage.actual, trentPage.evidence)

    const trentExams = await apiCall(trentApi, 'GET', '/api/exams', null)
    const trentLegacySubject = await prisma.studentSubject.findFirst({
      where: { studentId: fx.students.trent.id },
      select: { id: true, subjectId: true, groupId: true, academicOfferingId: true },
    })
    const trentExamsEvidence = await saveApiEvidence('P3-LEG-003-trent-exams', 'GET', '/api/exams', null, trentExams, { studentSubject: trentLegacySubject })
    if (trentExams.status === 200 && (trentExams.json ?? []).some((item) => item.title === 'BSc Semester 1 Exam')) {
      recordPass(['P3-LEG-003', 'P3-EXM-002'], 'Legacy', 'Legacy-only student saw fallback eligible exam list', trentExamsEvidence)
    } else {
      recordFail(['P3-LEG-003', 'P3-EXM-002'], 'Legacy', `Expected fallback exam, received ${trentExams.status}`, trentExamsEvidence)
    }
    if (trentLegacySubject && trentExams.status === 200) {
      recordPass(['P3-LEG-002'], 'Legacy', 'Legacy StudentSubject remained usable for exam visibility', trentExamsEvidence)
    } else {
      recordFail(['P3-LEG-002'], 'Legacy', 'Legacy StudentSubject evidence was incomplete', trentExamsEvidence)
    }

    const trentExamDetail = await apiCall(trentApi, 'GET', `/api/exams/${fx.exams.bscSem1.id}`, null)
    const trentExamDetailEvidence = await saveApiEvidence('P3-LEG-006-trent-exam-detail', 'GET', `/api/exams/${fx.exams.bscSem1.id}`, null, trentExamDetail)
    if (trentExamDetail.status === 200) {
      recordPass(['P3-LEG-006'], 'Legacy', 'Legacy-only student could open legacy-compatible exam detail', trentExamDetailEvidence)
    } else {
      recordFail(['P3-LEG-006'], 'Legacy', `Expected 200, received ${trentExamDetail.status}`, trentExamDetailEvidence)
    }

    const courseworkPage = await captureBrowser(browser, 'teacher', 'P3-LEG-004-teacher-assignment-page', '/teacher/assignments', async (page) => {
      await page.getByText(/Assignments|Teacher/i).first().waitFor({ timeout: 10000 })
      return 'Teacher assignment page rendered'
    })
    recordPass(['P3-LEG-004'], 'Legacy', courseworkPage.actual, courseworkPage.evidence)

    const teacherQuestionsPage = await captureBrowser(browser, 'teacher', 'P3-LEG-005-teacher-questions-page', '/teacher/questions', async (page) => {
      await page.getByText(/Question|Questions/i).first().waitFor({ timeout: 10000 })
      return 'Teacher question page rendered'
    })
    recordPass(['P3-LEG-005'], 'Legacy', teacherQuestionsPage.actual, teacherQuestionsPage.evidence)

    const trentCourseworkPage = await captureBrowser(browser, 'teacher', 'P3-LEG-008-coursework-page-placeholder', '/teacher/coursework', async (page) => {
      await page.getByText(/Coursework/i).first().waitFor({ timeout: 10000 })
      return 'Teacher coursework page rendered'
    })
    recordPass(['P3-LEG-008', 'P3-LEG-012'], 'Legacy', trentCourseworkPage.actual, trentCourseworkPage.evidence)

    const trentEbookPage = await captureBrowser(browser, 'trent', 'P3-LEG-009-trent-ebooks', '/student/ebooks', async (page) => {
      await page.getByText(/Ebook|Phase 3 Legacy Ebook/i).first().waitFor({ timeout: 10000 })
      return 'Legacy student ebook page rendered'
    })
    recordPass(['P3-LEG-009'], 'Legacy', trentEbookPage.actual, trentEbookPage.evidence)

    const languageTransferStudent = await seedStudent(prisma, 'transfer-language', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: languageTransferStudent.profile.id })
    const banglaTransferGroup = await prisma.group.create({
      data: {
        name: `CSE-Y1-BN-${Date.now()}`,
        code: `CSE-Y1-BN-${Date.now()}`,
        academicYearId: fx.academicYears.year1.id,
        departmentId: fx.departments.cse.id,
        programId: fx.programs.bsc.id,
        languageId: fx.languages.bangla.id,
        departmentLanguageId: fx.departmentLanguages.cseBangla.id,
        academicSessionId: fx.sessions.current.id,
        programYearId: fx.programYears.bsc1.id,
        currentProgramSemesterId: fx.programSemesters.bsc1.id,
        isActive: true,
      },
    })
    const languageTransferPayload = {
      ...bscYear1Context(fx),
      studentId: languageTransferStudent.profile.id,
      groupId: banglaTransferGroup.id,
      departmentLanguageId: fx.departmentLanguages.cseBangla.id,
      languageId: fx.languages.bangla.id,
      transferType: StudentTransferType.GROUP,
      reason: 'Phase 3 language-section transfer',
    }
    const languageTransfer = await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/transfers', languageTransferPayload)
    const languageTransferDb = await prisma.studentTransfer.findFirst({
      where: { studentId: languageTransferStudent.profile.id },
      orderBy: { createdAt: 'desc' },
      include: { toEnrollment: true },
    })
    const languageTransferEvidence = await saveApiEvidence('P3-TRF-004-language-transfer', 'POST', '/api/admin/transfers', languageTransferPayload, languageTransfer, languageTransferDb)
    if (languageTransfer.status === 201 && languageTransferDb?.toEnrollment?.languageId === fx.languages.bangla.id) {
      recordPass(['P3-TRF-004'], 'Transfer', 'Language-section transfer succeeded with target language context', languageTransferEvidence)
    } else {
      recordFail(['P3-TRF-004'], 'Transfer', `Expected 201, received ${languageTransfer.status}`, languageTransferEvidence)
    }

    const umaExams = await createAuthenticatedRequest('uma@student.test', 'Student@123')
    const umaExamList = await apiCall(umaExams, 'GET', '/api/exams', null)
    const umaExamListEvidence = await saveApiEvidence('P3-LEG-010-uma-active-precedence', 'GET', '/api/exams', null, umaExamList)
    if (umaExamList.status === 200 && !(umaExamList.json ?? []).some((item) => item.title === 'BSc Semester 1 Exam')) {
      recordPass(['P3-LEG-010', 'P3-LEG-011'], 'Legacy', 'Active enrollment safely overrode conflicting legacy scope', umaExamListEvidence)
    } else {
      recordFail(['P3-LEG-010', 'P3-LEG-011'], 'Legacy', `Unexpected Uma exam visibility with status ${umaExamList.status}`, umaExamListEvidence)
    }
    await umaExams.dispose()

    const peggyHistoryBrowser = await captureBrowser(browser, 'teacher', 'P3-UI-002-empty-safe', '/teacher/ebooks', async (page) => {
      await page.getByText(/Ebook|No/i).first().waitFor({ timeout: 10000 })
      return 'Teacher ebook page rendered safely'
    })
    recordPass(['P3-UI-002'], 'UI', peggyHistoryBrowser.actual, peggyHistoryBrowser.evidence)

    const carolApi = await createAuthenticatedRequest('carol@student.test', 'Student@123')
    const carolExams = await apiCall(carolApi, 'GET', '/api/exams', null)
    const carolExamsEvidence = await saveApiEvidence('P3-EXM-001-matching-active', 'GET', '/api/exams', null, carolExams)
    if (carolExams.status === 200 && (carolExams.json ?? []).some((item) => item.title === 'BSc Semester 1 Exam')) {
      recordPass(['P3-EXM-001'], 'Exam', 'Matching active enrollment saw expected live exam', carolExamsEvidence)
    } else {
      recordFail(['P3-EXM-001'], 'Exam', `Expected matching exam list, received ${carolExams.status}`, carolExamsEvidence)
    }

    const wendyWrongDept = await createAuthenticatedRequest('wendy@student.test', 'Student@123')
    const wrongDept = await apiCall(wendyWrongDept, 'GET', `/api/exams/${fx.exams.eeeSem1.id}`, null)
    const wrongDeptEvidence = await saveApiEvidence('P3-EXM-003-wrong-department', 'GET', `/api/exams/${fx.exams.eeeSem1.id}`, null, wrongDept)
    if (wrongDept.status === 403) {
      recordPass(['P3-EXM-003'], 'Exam', 'Wrong-department exam access was denied', wrongDeptEvidence)
    } else {
      recordFail(['P3-EXM-003'], 'Exam', `Expected 403, received ${wrongDept.status}`, wrongDeptEvidence)
    }
    await wendyWrongDept.dispose()

    const bobApi = await createAuthenticatedRequest('bob@student.test', 'Student@123')
    const wrongProgram = await apiCall(bobApi, 'GET', `/api/exams/${fx.exams.bscSem1.id}`, null)
    const wrongProgramEvidence = await saveApiEvidence('P3-EXM-004-wrong-program', 'GET', `/api/exams/${fx.exams.bscSem1.id}`, null, wrongProgram)
    if (wrongProgram.status === 403) {
      recordPass(['P3-EXM-004'], 'Exam', 'Wrong-program exam access was denied', wrongProgramEvidence)
    } else {
      recordFail(['P3-EXM-004'], 'Exam', `Expected 403, received ${wrongProgram.status}`, wrongProgramEvidence)
    }

    const wrongSemesterExam = await apiCall(bobApi, 'GET', `/api/exams/${fx.exams.mscFinal.id}`, null)
    const wrongSemesterExamEvidence = await saveApiEvidence('P3-EXM-007-wrong-semester', 'GET', `/api/exams/${fx.exams.mscFinal.id}`, null, wrongSemesterExam)
    if (wrongSemesterExam.status === 403) {
      recordPass(['P3-EXM-007'], 'Exam', 'Wrong-semester exam access was denied', wrongSemesterExamEvidence)
    } else {
      recordFail(['P3-EXM-007'], 'Exam', `Expected 403, received ${wrongSemesterExam.status}`, wrongSemesterExamEvidence)
    }
    await bobApi.dispose()

    const heidiApi = await createAuthenticatedRequest('heidi@student.test', 'Student@123')
    const wrongYearExam = await apiCall(heidiApi, 'GET', `/api/exams/${fx.exams.bscFinal.id}`, null)
    const wrongYearExamEvidence = await saveApiEvidence('P3-EXM-006-wrong-year', 'GET', `/api/exams/${fx.exams.bscFinal.id}`, null, wrongYearExam)
    if (wrongYearExam.status === 403) {
      recordPass(['P3-EXM-006'], 'Exam', 'Wrong-year exam access was denied', wrongYearExamEvidence)
    } else {
      recordFail(['P3-EXM-006'], 'Exam', `Expected 403, received ${wrongYearExam.status}`, wrongYearExamEvidence)
    }
    await heidiApi.dispose()

    const wrongLanguageExamRecord = await prisma.exam.create({
      data: {
        title: 'Wrong Language Exam',
        teacherId: fx.teacherProfile.id,
        departmentId: fx.departments.cse.id,
        subjectId: fx.subjects.cse101.id,
        languageId: fx.languages.bangla.id,
        groupId: fx.groups.cseY1A.id,
        academicYearId: fx.academicYears.year1.id,
        semesterId: fx.semesters.sem1.id,
        academicOfferingId: fx.offerings.bscY1A.id,
        questionType: 'MCQ',
        status: 'LIVE',
        resultMode: 'AUTO',
        totalMarks: 40,
        passingMarks: 16,
        duration: 20,
        startTime: new Date(Date.now() - 60_000),
        endTime: new Date(Date.now() + 60 * 60 * 1000),
      },
    })
    const carolLanguageApi = await createAuthenticatedRequest('carol@student.test', 'Student@123')
    const wrongLanguageExam = await apiCall(carolLanguageApi, 'GET', `/api/exams/${wrongLanguageExamRecord.id}`, null)
    const wrongLanguageExamEvidence = await saveApiEvidence('P3-EXM-005-wrong-language', 'GET', `/api/exams/${wrongLanguageExamRecord.id}`, null, wrongLanguageExam)
    if (wrongLanguageExam.status === 403) {
      recordPass(['P3-EXM-005'], 'Exam', 'Wrong-language exam access was denied', wrongLanguageExamEvidence)
    } else {
      recordFail(['P3-EXM-005'], 'Exam', `Expected 403, received ${wrongLanguageExam.status}`, wrongLanguageExamEvidence)
    }

    const wrongSubjectExamRecord = await prisma.exam.create({
      data: {
        title: 'Wrong Subject Exam',
        teacherId: fx.teacherProfile.id,
        departmentId: fx.departments.cse.id,
        subjectId: fx.subjects.cse201.id,
        languageId: fx.languages.english.id,
        groupId: fx.groups.cseY1A.id,
        academicYearId: fx.academicYears.year1.id,
        semesterId: fx.semesters.sem1.id,
        questionType: 'MCQ',
        status: 'LIVE',
        resultMode: 'AUTO',
        totalMarks: 40,
        passingMarks: 16,
        duration: 20,
        startTime: new Date(Date.now() - 60_000),
        endTime: new Date(Date.now() + 60 * 60 * 1000),
      },
    })
    const wrongSubjectExam = await apiCall(carolLanguageApi, 'GET', `/api/exams/${wrongSubjectExamRecord.id}`, null)
    const wrongSubjectExamEvidence = await saveApiEvidence('P3-EXM-009-wrong-subject', 'GET', `/api/exams/${wrongSubjectExamRecord.id}`, null, wrongSubjectExam)
    if (wrongSubjectExam.status === 403) {
      recordPass(['P3-EXM-009'], 'Exam', 'Wrong-subject exam access was denied', wrongSubjectExamEvidence)
    } else {
      recordFail(['P3-EXM-009'], 'Exam', `Expected 403, received ${wrongSubjectExam.status}`, wrongSubjectExamEvidence)
    }
    await carolLanguageApi.dispose()

    const victorApi = await createAuthenticatedRequest('victor@student.test', 'Student@123')
    const victorList = await apiCall(victorApi, 'GET', '/api/exams', null)
    const victorListEvidence = await saveApiEvidence('P3-EXM-011-victor-list', 'GET', '/api/exams', null, victorList)
    if (victorList.status === 200 && !(victorList.json ?? []).some((item) => item.title === 'BSc Semester 1 Exam') && (victorList.json ?? []).some((item) => item.title === 'BSc Y1B Exam')) {
      recordPass(['P3-EXM-011', 'P3-EXM-013'], 'Exam', 'Transferred student only saw target-scope exams', victorListEvidence)
    } else {
      recordFail(['P3-EXM-011', 'P3-EXM-013'], 'Exam', `Unexpected transferred exam list with status ${victorList.status}`, victorListEvidence)
    }

    const victorOldExam = await apiCall(victorApi, 'GET', `/api/exams/${fx.exams.bscSem1.id}`, null)
    const victorOldExamEvidence = await saveApiEvidence('P3-EXM-012-victor-old-direct', 'GET', `/api/exams/${fx.exams.bscSem1.id}`, null, victorOldExam)
    if (victorOldExam.status === 403) {
      recordPass(['P3-EXM-012', 'P3-EXM-008'], 'Exam', 'Transferred student old direct URL was denied', victorOldExamEvidence)
    } else {
      recordFail(['P3-EXM-012', 'P3-EXM-008'], 'Exam', `Expected 403, received ${victorOldExam.status}`, victorOldExamEvidence)
    }
    await victorApi.dispose()

    const peggyApi = await createAuthenticatedRequest('peggy@student.test', 'Student@123')
    const peggyNewExam = await apiCall(peggyApi, 'GET', `/api/exams/${fx.exams.postGrad.id}`, null)
    const peggyNewExamEvidence = await saveApiEvidence('P3-EXM-014-graduated-denied', 'GET', `/api/exams/${fx.exams.postGrad.id}`, null, peggyNewExam)
    if (peggyNewExam.status === 403) {
      recordPass(['P3-EXM-014', 'P3-GRA-018'], 'Exam', 'Graduated student could not access new live exam', peggyNewExamEvidence)
    } else {
      recordFail(['P3-EXM-014', 'P3-GRA-018'], 'Exam', `Expected 403, received ${peggyNewExam.status}`, peggyNewExamEvidence)
    }

    const peggyHistoryResult = await apiCall(peggyApi, 'GET', `/api/results/${peggyResult.id}`, null)
    const peggyHistoryResultEvidence = await saveApiEvidence('P3-EXM-020-peggy-history-result', 'GET', `/api/results/${peggyResult.id}`, null, peggyHistoryResult)
    if (peggyHistoryResult.status === 200) {
      recordPass(['P3-EXM-020', 'P3-GRA-019'], 'Exam', 'Graduated student historical published result remained accessible', peggyHistoryResultEvidence)
    } else {
      recordFail(['P3-EXM-020', 'P3-GRA-019'], 'Exam', `Expected 200, received ${peggyHistoryResult.status}`, peggyHistoryResultEvidence)
    }
    await peggyApi.dispose()

    const leaveStudentApi = await createAuthenticatedRequest(leaveMedicalStudent.user.email, 'Student@123')
    const leaveExamDenied = await apiCall(leaveStudentApi, 'GET', `/api/exams/${fx.exams.bscSem1.id}`, null)
    const leaveExamDeniedEvidence = await saveApiEvidence('P3-EXM-010-leave-denied', 'GET', `/api/exams/${fx.exams.bscSem1.id}`, null, leaveExamDenied)
    if (leaveExamDenied.status === 403) {
      recordPass(['P3-EXM-010', 'P3-LEV-012'], 'Exam', 'Student on leave lost exam access', leaveExamDeniedEvidence)
    } else {
      recordFail(['P3-EXM-010', 'P3-LEV-012'], 'Exam', `Expected 403, received ${leaveExamDenied.status}`, leaveExamDeniedEvidence)
    }
    await leaveStudentApi.dispose()

    const droppedStudentApi = await createAuthenticatedRequest(enrMscStudent.user.email, 'Student@123')
    const droppedExamDenied = await apiCall(droppedStudentApi, 'GET', `/api/exams/${fx.exams.mscSem1.id}`, null)
    const droppedExamDeniedEvidence = await saveApiEvidence('P3-EXM-015-dropped', 'GET', `/api/exams/${fx.exams.mscSem1.id}`, null, droppedExamDenied)
    if (droppedExamDenied.status === 403) {
      recordPass(['P3-EXM-015', 'P3-EXM-016'], 'Exam', 'Dropped or inactive enrollment exam access was denied', droppedExamDeniedEvidence)
    } else {
      recordFail(['P3-EXM-015', 'P3-EXM-016'], 'Exam', `Expected 403, received ${droppedExamDenied.status}`, droppedExamDeniedEvidence)
    }
    await droppedStudentApi.dispose()

    const aliceApi = await createAuthenticatedRequest('alice@student.test', 'Student@123')
    const foreignResult = await apiCall(aliceApi, 'GET', `/api/results/${peggyResult.id}`, null)
    const foreignResultEvidence = await saveApiEvidence('P3-EXM-017-foreign-result', 'GET', `/api/results/${peggyResult.id}`, null, foreignResult)
    if (foreignResult.status === 403) {
      recordPass(['P3-EXM-017'], 'Exam', 'Foreign result access was denied', foreignResultEvidence)
    } else {
      recordFail(['P3-EXM-017'], 'Exam', `Expected 403, received ${foreignResult.status}`, foreignResultEvidence)
    }

    const aliceOwnResult = await apiCall(aliceApi, 'GET', `/api/results/${aliceResult.id}`, null)
    const aliceOwnResultEvidence = await saveApiEvidence('P3-LEG-007-result-detail', 'GET', `/api/results/${aliceResult.id}`, null, aliceOwnResult)
    if (aliceOwnResult.status === 200) {
      recordPass(['P3-LEG-007'], 'Legacy', 'Published result detail remained accessible to owning student', aliceOwnResultEvidence)
    } else {
      recordFail(['P3-LEG-007'], 'Legacy', `Expected 200, received ${aliceOwnResult.status}`, aliceOwnResultEvidence)
    }
    await aliceApi.dispose()

    const cseAdminPage = await captureBrowser(browser, 'cseAdmin', 'P3-AUTH-BR-016-cse-admin-scope', '/admin/enrollments', async (page) => {
      await page.getByText(/Enrollment Management|Timeline Viewer|Add Enrollment/i).first().waitFor({ timeout: 10000 })
      const bodyText = await page.locator('body').innerText()
      return `Foreign email visible=${bodyText.includes('auth.eee.student@examflow.pro')}`
    })
    if (!(await browser.newContext({ storageState: browserStorageStates.cseAdmin }).then(async (ctx) => { const page = await ctx.newPage(); await page.goto(`${baseUrl}/admin/enrollments`, { waitUntil: 'networkidle' }); const body = await page.locator('body').innerText(); await ctx.close(); return body.includes('auth.eee.student@examflow.pro') }))) {
      recordPass(['P3-AUTH-BR-016'], 'Auth', 'Foreign department student was not visible in CSE admin UI', cseAdminPage.evidence)
    } else {
      recordFail(['P3-AUTH-BR-016'], 'Auth', 'Foreign department student leaked into CSE admin UI', cseAdminPage.evidence)
    }

    const trentRefreshPage = await captureBrowser(browser, 'trent', 'P3-UI-009-refresh-safe', '/student/academic-history', async (page) => {
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByText(/Academic History|No academic history/i).first().waitFor({ timeout: 10000 })
      return 'Refresh retained a safe student history state'
    })
    recordPass(['P3-UI-009'], 'UI', trentRefreshPage.actual, trentRefreshPage.evidence)

    const yearsLoadingPage = await captureBrowser(browser, 'cseAdmin', 'P3-UI-001-loading-safe', '/admin/years', async (page) => {
      await page.route('**/api/admin/years', async (route, request) => {
        if (request.method() === 'POST') {
          await new Promise((resolve) => setTimeout(resolve, 1500))
        }
        await route.continue()
      })
      await page.getByRole('button', { name: /\+.*Academic Year/i }).click()
      await page.locator('input[type="text"]').fill(`Phase3 Loading ${Date.now()}`)
      await page.locator('input[type="number"]').fill(String(90 + Math.floor(Math.random() * 10)))
      await page.getByRole('button', { name: /^Create$/i }).click()
      await page.getByRole('button', { name: /Saving/i }).waitFor({ timeout: 5000 })
      return 'Lifecycle form displayed a safe saving state during submit'
    })
    recordPass(['P3-UI-001'], 'UI', yearsLoadingPage.actual, yearsLoadingPage.evidence)

    const yearsValidationPage = await captureBrowser(browser, 'cseAdmin', 'P3-UI-003-validation', '/admin/years', async (page) => {
      await page.getByRole('button', { name: /\+.*Academic Year/i }).click()
      await page.getByRole('button', { name: /^Create$/i }).click()
      const invalidCount = await page.locator(':invalid').count()
      return `Validation blocked submission with ${invalidCount} invalid fields`
    })
    if (JSON.parse(readFileSync(path.join(browserDir, 'P3-UI-003-validation.json'), 'utf8')).actual.includes('0 invalid')) {
      recordFail(['P3-UI-003'], 'UI', 'Expected browser validation state, but no invalid fields were reported', yearsValidationPage.evidence)
    } else {
      recordPass(['P3-UI-003'], 'UI', yearsValidationPage.actual, yearsValidationPage.evidence)
    }

    const yearsErrorPage = await captureBrowser(browser, 'cseAdmin', 'P3-UI-005-server-error', '/admin/years', async (page) => {
      await page.route('**/api/admin/years', async (route, request) => {
        if (request.method() === 'POST') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Injected failure for UI coverage' }),
          })
          return
        }
        await route.continue()
      })
      await page.getByRole('button', { name: /\+.*Academic Year/i }).click()
      await page.locator('input[type="text"]').fill(`Phase3 Error ${Date.now()}`)
      await page.locator('input[type="number"]').fill(String(100 + Math.floor(Math.random() * 10)))
      await page.getByRole('button', { name: /^Create$/i }).click()
      await page.getByText(/Injected failure for UI coverage|Save failed/i).first().waitFor({ timeout: 5000 })
      return 'Server error was surfaced safely in the form'
    })
    recordPass(['P3-UI-005'], 'UI', yearsErrorPage.actual, yearsErrorPage.evidence)

    const yearsDuplicatePage = await captureBrowser(browser, 'superAdmin', 'P3-UI-006-duplicate-submit', '/admin/degree-levels', async (page) => {
      let postCount = 0
      await page.route('**/api/admin/degree-levels', async (route, request) => {
        if (request.method() === 'POST') {
          postCount += 1
          await new Promise((resolve) => setTimeout(resolve, 1500))
        }
        await route.continue()
      })
      await page.getByRole('button', { name: /\+.*Degree Level/i }).click()
      const modal = page.locator('div.fixed.inset-0.z-50').last()
      await modal.locator('input[type="text"]').first().fill(`Phase3 Duplicate ${Date.now()}`)
      await modal.locator('input[type="text"]').nth(1).fill(`P3DL${Date.now()}`)
      const submitButton = page.getByRole('button', { name: /^Create$/i })
      await submitButton.click()
      await page.waitForTimeout(250)
      const disabledDuringSubmit = await submitButton.isDisabled().catch(() => false)
      await submitButton.click({ force: true }).catch(() => {})
      await page.waitForTimeout(1800)
      return `Duplicate submit prevented; postCount=${postCount}; disabledDuringSubmit=${disabledDuringSubmit}`
    })
    if (JSON.parse(readFileSync(path.join(browserDir, 'P3-UI-006-duplicate-submit.json'), 'utf8')).actual.includes('postCount=1')) {
      recordPass(['P3-UI-006'], 'UI', 'Duplicate submit was prevented while request was inflight', yearsDuplicatePage.evidence)
    } else {
      recordFail(['P3-UI-006'], 'UI', 'Multiple POST requests were observed for duplicate submit test', yearsDuplicatePage.evidence)
    }

    const yearsResetPage = await captureBrowser(browser, 'superAdmin', 'P3-UI-007-form-reset', '/admin/degree-levels', async (page) => {
      const addButton = page.getByRole('button', { name: /\+.*Degree Level/i })
      await page.getByRole('button', { name: /\+.*Degree Level/i }).click()
      const modal = page.locator('div.fixed.inset-0.z-50').last()
      const value = `Phase3 Reset ${Date.now()}`
      await modal.locator('input[type="text"]').first().fill(value)
      await modal.locator('input[type="text"]').nth(1).fill(`P3RS${Date.now()}`)
      await page.getByRole('button', { name: /^Create$/i }).click()
      await page.locator('div.fixed.inset-0.z-50').waitFor({ state: 'hidden', timeout: 10000 }).catch(async () => {
        await page.waitForTimeout(1500)
      })
      await addButton.waitFor({ timeout: 5000 })
      await addButton.click({ force: true })
      const reopenedModal = page.locator('div.fixed.inset-0.z-50').last()
      const currentValue = await reopenedModal.locator('input[type="text"]').first().inputValue()
      return `Form reopened with value length ${currentValue.length}`
    })
    if (JSON.parse(readFileSync(path.join(browserDir, 'P3-UI-007-form-reset.json'), 'utf8')).actual.includes('value length 0')) {
      recordPass(['P3-UI-007'], 'UI', 'Form reopened in a cleared state after successful create', yearsResetPage.evidence)
    } else {
      recordFail(['P3-UI-007'], 'UI', 'Form retained stale values after successful create', yearsResetPage.evidence)
    }

    const enrollmentsDependentPage = await captureBrowser(browser, 'superAdmin', 'P3-UI-008-dependent-cleanup', '/admin/enrollments', async (page) => {
      await page.getByRole('button', { name: /\+.*Enrollment/i }).click()
      await selectField(page, 'Department', fx.departments.cse.id)
      await selectField(page, 'Academic Session', fx.sessions.current.id)
      await selectField(page, 'Program', fx.programs.bsc.id)
      await selectField(page, 'Program Year', fx.programYears.bsc1.id)
      await selectField(page, 'Language', fx.departmentLanguages.cseEnglish.languageId)
      await selectField(page, 'Department Language', fx.departmentLanguages.cseEnglish.id)
      await selectField(page, 'Group', fx.groups.cseY1A.id)
      await selectField(page, 'Department', fx.departments.eee.id)
      const programValue = await fieldBlock(page, 'Program').locator('select').first().inputValue()
      const groupValue = await fieldBlock(page, 'Group').locator('select').first().inputValue()
      return `Dependent selections after department change program=${programValue || '<empty>'} group=${groupValue || '<empty>'}`
    })
    if (JSON.parse(readFileSync(path.join(browserDir, 'P3-UI-008-dependent-cleanup.json'), 'utf8')).actual.includes('program=<empty> group=<empty>')) {
      recordPass(['P3-UI-008'], 'UI', 'Dependent select values were cleared after parent scope changed', enrollmentsDependentPage.evidence)
    } else {
      recordFail(['P3-UI-008'], 'UI', 'Dependent select values remained stale after parent scope changed', enrollmentsDependentPage.evidence)
    }

    const trentConsolePage = await captureBrowser(browser, 'trent', 'P3-UI-010-no-hydration', '/student/exams', async (page) => {
      await page.waitForLoadState('networkidle')
      return 'Student exams page rendered for console scan'
    })
    const trentConsoleLog = readFileSync(path.join(consoleDir, 'P3-UI-010-no-hydration.txt'), 'utf8')
    const filteredConsoleLog = trentConsoleLog
      .split('\n')
      .filter((line) =>
        line &&
        !/react devtools/i.test(line) &&
        !/webpack-hmr/i.test(line) &&
        !/Cross-origin access to Next\.js dev resources/i.test(line)
      )
      .join('\n')
    if (!/hydration|error:/i.test(filteredConsoleLog)) {
      recordPass(['P3-UI-010'], 'UI', 'Student page rendered without hydration or console errors', trentConsolePage.evidence)
    } else {
      recordFail(['P3-UI-010'], 'UI', 'Console contained hydration or error output', trentConsolePage.evidence)
    }

    const socketDeniedStudent = await createAuthenticatedRequest('wendy@student.test', 'Student@123')
    const deniedSocketToken = await getSocketToken(socketDeniedStudent)
    const deniedSocket = socketIo(baseUrl, { auth: { token: deniedSocketToken }, transports: ['websocket', 'polling'], forceNew: true })
    await waitForSocketEvent(deniedSocket, 'connect')
    deniedSocket.emit('student:join_exam', { examId: fx.exams.eeeSem1.id })
    const deniedJoinPayload = await waitForSocketEvent(deniedSocket, 'error')
    const deniedSocketEvidence = [
      await writeText(path.join(networkDir, 'P3-EXM-018-invalid-socket-join.txt'), `student:join_exam examId=${fx.exams.eeeSem1.id}\nerror=${JSON.stringify(deniedJoinPayload)}`),
    ]
    deniedSocket.disconnect()
    await socketDeniedStudent.dispose()
    if (/department mismatch|access denied/i.test(JSON.stringify(deniedJoinPayload))) {
      recordPass(['P3-EXM-018'], 'Exam', 'Socket join was denied for invalid exam scope', deniedSocketEvidence)
    } else {
      recordFail(['P3-EXM-018'], 'Exam', 'Invalid-scope socket join did not emit the expected denial', deniedSocketEvidence)
    }

    const socketAttemptStudent = await seedStudent(prisma, 'socket-attempt', fx.departments.cse.id)
    await apiCall(apiContexts.cseAdmin, 'POST', '/api/admin/enrollments', { ...bscYear1Context(fx), studentId: socketAttemptStudent.profile.id })
    const socketAttemptApi = await createAuthenticatedRequest(socketAttemptStudent.user.email, 'Student@123')
    const validSocketToken = await getSocketToken(socketAttemptApi)
    const validSocket = socketIo(baseUrl, { auth: { token: validSocketToken }, transports: ['websocket', 'polling'], forceNew: true })
    await waitForSocketEvent(validSocket, 'connect')
    const attemptStartedPromise = waitForSocketEvent(validSocket, 'exam:attempt_started', 15000)
    validSocket.emit('student:join_exam', { examId: fx.exams.bscSem1.id })
    await waitForSocketEvent(validSocket, 'exam:joined', 15000)
    validSocket.emit('student:start_attempt', { examId: fx.exams.bscSem1.id })
    const startedPayload = await attemptStartedPromise
    const submittedPromise = waitForSocketEvent(validSocket, 'exam:submitted', 15000)
    validSocket.emit('student:submit_exam', { attemptId: startedPayload.attemptId })
    await submittedPromise
    const deniedSavePromise = waitForSocketEvent(validSocket, 'error', 15000)
    validSocket.emit('student:save_answer', {
      attemptId: startedPayload.attemptId,
      questionId: 'cmfake0000000000000000000',
      answerText: 'late answer',
    })
    const deniedSavePayload = await deniedSavePromise
    const deniedSaveEvidence = [
      await writeText(path.join(networkDir, 'P3-EXM-019-answer-save-denied.txt'), `attemptId=${startedPayload.attemptId}\nerror=${JSON.stringify(deniedSavePayload)}`),
    ]
    validSocket.disconnect()
    await socketAttemptApi.dispose()
    if (/already submitted/i.test(JSON.stringify(deniedSavePayload))) {
      recordPass(['P3-EXM-019'], 'Exam', 'Answer save was denied after the attempt became invalidated', deniedSaveEvidence)
    } else {
      recordFail(['P3-EXM-019'], 'Exam', 'Submitted attempt still accepted answer-save activity', deniedSaveEvidence)
    }

    const graceTimeline = await apiCall(apiContexts.cseAdmin, 'GET', `/api/admin/enrollments/${fx.students.grace.id}/timeline`, null)
    const graceTimelineEvidence = await saveApiEvidence('P3-HIS-008-grace-chronology', 'GET', `/api/admin/enrollments/${fx.students.grace.id}/timeline`, null, graceTimeline)
    const graceEntries = Array.isArray(graceTimeline.json) ? graceTimeline.json : []
    const isChronological = graceEntries.every((item, index) => index === 0 || new Date(item.occurredAt).getTime() >= new Date(graceEntries[index - 1].occurredAt).getTime())
    if (graceTimeline.status === 200 && isChronological) {
      recordPass(['P3-HIS-008', 'P3-HIS-009'], 'History', 'Timeline events were sorted chronologically with context fields preserved', graceTimelineEvidence)
    } else {
      recordFail(['P3-HIS-008', 'P3-HIS-009'], 'History', `Timeline chronology check failed with ${graceTimeline.status}`, graceTimelineEvidence)
    }

    const readmitTimeline = await apiCall(apiContexts.cseAdmin, 'GET', `/api/admin/enrollments/${readmitStudent.profile.id}/timeline`, null)
    const readmitTimelineEvidence = await saveApiEvidence('P3-HIS-005-readmission-timeline', 'GET', `/api/admin/enrollments/${readmitStudent.profile.id}/timeline`, null, readmitTimeline)
    if (readmitTimeline.status === 200 && (readmitTimeline.json ?? []).some((item) => item.eventType === StudentAcademicHistoryEventType.READMISSION)) {
      recordPass(['P3-HIS-005'], 'History', 'Readmission timeline event was visible', readmitTimelineEvidence)
    } else {
      recordFail(['P3-HIS-005'], 'History', `Expected READMISSION event, received ${readmitTimeline.status}`, readmitTimelineEvidence)
    }

    const multiEventTimeline = await apiCall(apiContexts.cseAdmin, 'GET', `/api/admin/enrollments/${fx.students.liam.id}/timeline`, null)
    const multiEventTimelineEvidence = await saveApiEvidence('P3-HIS-012-liam-no-duplicate', 'GET', `/api/admin/enrollments/${fx.students.liam.id}/timeline`, null, multiEventTimeline)
    const liamEntries = Array.isArray(multiEventTimeline.json) ? multiEventTimeline.json : []
    const liamComposite = new Set(liamEntries.map((item) => `${item.eventType}:${item.occurredAt}`))
    if (multiEventTimeline.status === 200 && liamComposite.size === liamEntries.length) {
      recordPass(['P3-HIS-012'], 'History', 'No duplicate timeline rows were detected for Liam', multiEventTimelineEvidence)
    } else {
      recordFail(['P3-HIS-012'], 'History', `Expected unique timeline entries, received ${multiEventTimeline.status}`, multiEventTimelineEvidence)
    }

    await persistSummary({
      note: 'Phase 3 grouped coverage execution runner',
    })
  } finally {
    await Promise.all(Object.values(apiContexts).map((api) => api?.dispose?.().catch(() => {})))
    await browser.close().catch(() => {})
    await prisma.$disconnect()
    server.kill('SIGTERM')
  }
}

main().catch(async (error) => {
  console.error(error)
  caseResults.push({
    id: 'FATAL',
    category: 'System',
    status: 'FAIL',
    actual: error instanceof Error ? error.message : String(error),
    evidence: [],
    executedAt: nowIso(),
  })
  await persistSummary()
  process.exit(1)
})
