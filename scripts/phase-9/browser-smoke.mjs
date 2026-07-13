import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices } from 'playwright'
import { PrismaClient } from '@prisma/client'
import {
  createApiContext,
  fetchJson,
  loginPage,
  primeLocale,
  startRedis,
  startServer,
  stopRedis,
  stopServer,
} from '../phase-6/evidence-helpers.mjs'

const prisma = new PrismaClient()
const phaseDir = path.join(process.cwd(), 'docs', 'phase-9')
const evidenceDir = path.join(phaseDir, 'evidence')
const browserDir = path.join(evidenceDir, 'browser')
const networkDir = path.join(evidenceDir, 'network')
const consoleDir = path.join(evidenceDir, 'console')
const databaseDir = path.join(evidenceDir, 'database')
const pdfDir = path.join(evidenceDir, 'pdf')
const csvDir = path.join(evidenceDir, 'csv')
const matrixPath = path.join(phaseDir, 'PHASE_9_BROWSER_SMOKE_MATRIX.md')
const summaryPath = path.join(databaseDir, 'phase9-browser-summary.json')

const results = []

function rel(filePath) {
  return filePath.replace(`${process.cwd()}${path.sep}`, '').replaceAll('\\', '/')
}

async function ensureDirs() {
  await Promise.all([browserDir, networkDir, consoleDir, databaseDir, pdfDir, csvDir].map((dir) => fs.mkdir(dir, { recursive: true })))
}

async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value, 'utf8')
  return rel(filePath)
}

async function record(input) {
  results.push(input)
  await fs.writeFile(
    summaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        status: results.every((item) => item.status === 'PASS') ? 'PASS' : 'BLOCKED',
        total: results.length,
        passed: results.filter((item) => item.status === 'PASS').length,
        failed: results.filter((item) => item.status !== 'PASS').length,
        results,
      },
      null,
      2
    )
  )
}

async function runCase(definition) {
  const row = {
    testId: definition.testId,
    role: definition.role,
    precondition: definition.precondition,
    steps: definition.steps,
    expected: definition.expected,
    actual: '',
    status: 'PASS',
    evidencePaths: [],
  }

  try {
    const output = await definition.run()
    row.actual = output?.actual ?? 'Completed as expected.'
    row.status = output?.status ?? 'PASS'
    row.evidencePaths = output?.evidencePaths ?? []
  } catch (error) {
    row.status = 'FAIL'
    row.actual = error instanceof Error ? error.message : String(error)
  }

  await record(row)
}

async function buildMatrix() {
  const lines = [
    '# Phase 9 Browser Smoke Matrix',
    '',
    '## Status',
    '',
    results.every((item) => item.status === 'PASS') ? 'PASS' : 'BLOCKED',
    '',
    '| Test ID | Role | Precondition | Steps | Expected | Actual | Status | Evidence |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...results.map(
      (item) =>
        `| ${item.testId} | ${item.role} | ${item.precondition.replaceAll('\n', ' ')} | ${item.steps.replaceAll('\n', ' ')} | ${item.expected.replaceAll('\n', ' ')} | ${item.actual.replaceAll('\n', ' ')} | ${item.status} | ${item.evidencePaths.join('<br/>') || 'n/a'} |`
    ),
  ]

  await fs.writeFile(matrixPath, lines.join('\n'))
}

async function gatherFixtures() {
  const [cse, eee, academicSession] = await Promise.all([
    prisma.department.findFirstOrThrow({ where: { code: 'CSE' }, include: { admin: true } }),
    prisma.department.findFirstOrThrow({ where: { code: 'EEE' }, include: { admin: true } }),
    prisma.academicSession.findFirstOrThrow({ where: { isActive: true } }),
  ])

  const offering = await prisma.academicOffering.findFirstOrThrow({
    where: {
      departmentId: cse.id,
      isActive: true,
      studentSubjects: { some: {} },
    },
    include: {
      subject: true,
      program: true,
      group: true,
      programSubject: true,
    },
  })

  const teacher = await prisma.teacherProfile.findFirstOrThrow({
    where: { departmentId: cse.id },
    include: { user: true },
  })

  const student = await prisma.studentProfile.findFirstOrThrow({
    where: {
      departmentId: cse.id,
      subjects: {
        some: { academicOfferingId: offering.id },
      },
    },
    include: { user: true },
  })

  const foreignStudent = await prisma.studentProfile.findFirstOrThrow({
    where: { departmentId: eee.id },
    include: { user: true },
  })

  return {
    departments: { cse, eee },
    academicSession,
    offering,
    teacher,
    student,
    foreignStudent,
    users: {
      cseAdmin: cse.admin,
      eeeAdmin: eee.admin
        ? eee.admin
        : await prisma.user.findFirstOrThrow({
            where: {
              role: 'DEPARTMENT_ADMIN',
              isActive: true,
              id: { not: cse.adminId ?? undefined },
            },
          }),
    },
  }
}

function attachPageArtifacts(page, name) {
  const messages = []
  const responses = []

  page.on('console', (message) => {
    messages.push(`${message.type()}: ${message.text()}`)
  })
  page.on('response', (response) => {
    responses.push(`${response.status()} ${response.url()}`)
  })

  return async () => {
    const screenshotPath = path.join(browserDir, `${name}.png`)
    const consolePath = path.join(consoleDir, `${name}.txt`)
    const networkPath = path.join(networkDir, `${name}.txt`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    await writeText(consolePath, messages.join('\n') || 'No console output captured')
    await writeText(networkPath, responses.join('\n') || 'No network output captured')
    return [rel(screenshotPath), rel(consolePath), rel(networkPath)]
  }
}

async function apiBinary(api, url) {
  const response = await api.fetch(url, { method: 'GET' })
  return {
    ok: response.ok(),
    status: response.status(),
    headers: response.headers(),
    buffer: await response.body(),
  }
}

async function main() {
  await ensureDirs()
  const fixtures = await gatherFixtures()
  let redis = null
  let server = null
  let baseUrl = 'http://127.0.0.1:3000'

  try {
    const ready = await fetch(`${baseUrl}/api/health/ready`)
    if (!ready.ok) {
      throw new Error(`Unexpected readiness status ${ready.status}`)
    }
  } catch {
    redis = await startRedis('phase9-browser')
    server = await startServer({
      port: 3249,
      redisUrl: redis.redisUrl,
      logPrefix: 'phase9-browser-server',
    })
    baseUrl = server.baseUrl
  }
  const browser = await chromium.launch({ headless: true })

  let cseAdminApi
  let eeeAdminApi
  let studentApi

  try {
    cseAdminApi = await createApiContext(baseUrl, fixtures.users.cseAdmin.email, 'Admin@123')
    eeeAdminApi = await createApiContext(baseUrl, fixtures.users.eeeAdmin.email, 'Admin@123')
    studentApi = await createApiContext(baseUrl, fixtures.student.user.email, 'Student@123')

    const adminContext = await browser.newContext({ colorScheme: 'light', viewport: { width: 1440, height: 960 } })
    const studentTabletContext = await browser.newContext({
      ...devices['iPad Pro 11'],
      colorScheme: 'dark',
    })
    const studentMobileContext = await browser.newContext({
      ...devices['Pixel 7'],
      colorScheme: 'dark',
    })

    await Promise.all([
      primeLocale(adminContext, 'en'),
      primeLocale(studentTabletContext, 'en'),
      primeLocale(studentMobileContext, 'en'),
    ])

    const adminPage = await adminContext.newPage()
    const studentTabletPage = await studentTabletContext.newPage()
    const studentMobilePage = await studentMobileContext.newPage()

    await loginPage(adminPage, baseUrl, fixtures.users.cseAdmin.email, 'Admin@123', '/admin')
    await loginPage(studentTabletPage, baseUrl, fixtures.student.user.email, 'Student@123', '/student')
    await loginPage(studentMobilePage, baseUrl, fixtures.student.user.email, 'Student@123', '/student')

    const adminArtifacts = attachPageArtifacts(adminPage, 'phase9-admin-dashboard')
    const transcriptTabletArtifacts = attachPageArtifacts(studentTabletPage, 'phase9-student-transcripts-tablet')
    const certificateMobileArtifacts = attachPageArtifacts(studentMobilePage, 'phase9-student-certificates-mobile')

    await runCase({
      testId: 'P9-BR-001',
      role: 'Department Admin',
      precondition: 'Authenticated department admin session exists.',
      steps: 'Open the Phase 9 admin dashboard on desktop light mode.',
      expected: 'The Enterprise Results Platform page renders without critical UI failures.',
      run: async () => {
        await adminPage.goto(`${baseUrl}/admin/results-enterprise`, { waitUntil: 'networkidle' })
        const body = (await adminPage.textContent('body')) || ''
        return {
          actual: body.includes('Enterprise Results Platform') ? 'Dashboard rendered.' : 'Dashboard heading missing.',
          status: body.includes('Enterprise Results Platform') ? 'PASS' : 'FAIL',
          evidencePaths: await adminArtifacts(),
        }
      },
    })

    const gradebook = await fetchJson(
      cseAdminApi,
      'POST',
      '/api/admin/results-enterprise/gradebooks',
      {
        academicOfferingId: fixtures.offering.id,
        departmentId: fixtures.departments.cse.id,
        academicSessionId: fixtures.academicSession.id,
        programId: fixtures.offering.programId,
        semesterId: fixtures.offering.semesterId,
        groupId: fixtures.offering.groupId,
        teacherId: fixtures.teacher.id,
        title: `Phase 9 Browser ${Date.now()}`,
        components: [
          { type: 'INTERNAL', name: 'Internal', weight: 25, maxMarks: 25 },
          { type: 'COURSEWORK', name: 'Coursework', weight: 25, maxMarks: 25 },
          { type: 'ATTENDANCE', name: 'Attendance', weight: 10, maxMarks: 10 },
          { type: 'FINAL', name: 'Final', weight: 40, maxMarks: 40 },
        ],
      },
      'phase9-browser-gradebook-create'
    )
    if (gradebook.status !== 201) {
      throw new Error(`Gradebook create failed: ${gradebook.text}`)
    }

    await runCase({
      testId: 'P9-BR-002',
      role: 'Department Admin',
      precondition: 'A valid academic offering and teacher fixture exist.',
      steps: 'Create a Phase 9 gradebook through the admin API.',
      expected: 'Gradebook creation succeeds with weighted components.',
      run: async () => ({
        actual: `status=${gradebook.status}; components=${gradebook.json.components.length}`,
        status: gradebook.status === 201 && gradebook.json.components.length === 4 ? 'PASS' : 'FAIL',
        evidencePaths: [gradebook.evidence],
      }),
    })

    const gradeEntry = await fetchJson(
      cseAdminApi,
      'PATCH',
      `/api/admin/results-enterprise/gradebooks/${gradebook.json.id}`,
      {
        entries: [
          {
            componentId: gradebook.json.components[0].id,
            studentId: fixtures.student.id,
            rawMarks: 22,
          },
        ],
      },
      'phase9-browser-grade-entry'
    )

    await runCase({
      testId: 'P9-BR-003',
      role: 'Department Admin',
      precondition: 'A Phase 9 gradebook exists.',
      steps: 'Submit internal marks for the scoped student.',
      expected: 'Grade entry persists successfully.',
      run: async () => ({
        actual: `status=${gradeEntry.status}; rows=${Array.isArray(gradeEntry.json) ? gradeEntry.json.length : 0}`,
        status: gradeEntry.status === 200 ? 'PASS' : 'FAIL',
        evidencePaths: [gradeEntry.evidence],
      }),
    })

    const calculate = await fetchJson(
      cseAdminApi,
      'POST',
      `/api/admin/results-enterprise/gradebooks/${gradebook.json.id}/calculate`,
      undefined,
      'phase9-browser-calculate'
    )
    const resultRecord = await prisma.phase9ResultRecord.findFirstOrThrow({
      where: {
        gradebookId: gradebook.json.id,
        studentId: fixtures.student.id,
      },
    })

    await runCase({
      testId: 'P9-BR-004',
      role: 'Department Admin',
      precondition: 'Grade entry exists for the gradebook.',
      steps: 'Calculate the gradebook results and GPA.',
      expected: 'A result record is produced with semester GPA and CGPA fields.',
      run: async () => ({
        actual: `status=${calculate.status}; resultRecord=${resultRecord.id}; gpa=${resultRecord.semesterGpa}; cgpa=${resultRecord.cumulativeCgpa}`,
        status: calculate.status === 200 && resultRecord.semesterGpa >= 0 ? 'PASS' : 'FAIL',
        evidencePaths: [calculate.evidence],
      }),
    })

    const statuses = ['VERIFIED', 'MODERATED', 'APPROVED', 'PUBLISHED']
    const transitionStatuses = []
    for (const status of statuses) {
      const transition = await fetchJson(
        cseAdminApi,
        'POST',
        `/api/admin/results-enterprise/results/${resultRecord.id}/transition`,
        { status, notes: `Browser smoke ${status}` },
        `phase9-browser-transition-${status.toLowerCase()}`
      )
      transitionStatuses.push(transition.status)
    }

    await runCase({
      testId: 'P9-BR-005',
      role: 'Department Admin',
      precondition: 'A calculated Phase 9 result record exists.',
      steps: 'Verify, moderate, approve, and publish the result workflow.',
      expected: 'Every lifecycle transition succeeds and the result becomes published.',
      run: async () => ({
        actual: `statuses=${transitionStatuses.join(',')}`,
        status: transitionStatuses.every((item) => item === 200) ? 'PASS' : 'FAIL',
        evidencePaths: statuses.map((status) => rel(path.join(networkDir, `phase9-browser-transition-${status.toLowerCase()}.json`))),
      }),
    })

    const studentResults = await fetchJson(
      studentApi,
      'GET',
      '/api/student/results-enterprise',
      undefined,
      'phase9-browser-student-results'
    )

    await runCase({
      testId: 'P9-BR-006',
      role: 'Student',
      precondition: 'A result has been published for the logged-in student.',
      steps: 'Fetch student result records from the student API.',
      expected: 'Published result records are visible to the student.',
      run: async () => ({
        actual: `status=${studentResults.status}; records=${Array.isArray(studentResults.json) ? studentResults.json.length : 0}`,
        status: studentResults.status === 200 && Array.isArray(studentResults.json) && studentResults.json.length > 0 ? 'PASS' : 'FAIL',
        evidencePaths: [studentResults.evidence],
      }),
    })

    const transcriptResponse = await cseAdminApi.fetch(
      `/api/admin/results-enterprise/students/${fixtures.student.id}/transcript`,
      {
        method: 'POST',
        data: { locale: 'en' },
      }
    )
    const transcriptBuffer = await transcriptResponse.body()
    const transcriptRecordId = transcriptResponse.headers()['x-phase9-record-id']
    const transcriptCode = transcriptResponse.headers()['x-phase9-verification-code']
    const transcriptPdfPath = path.join(pdfDir, 'P9-BR-007-transcript.pdf')
    await fs.writeFile(transcriptPdfPath, transcriptBuffer)

    await studentTabletPage.goto(`${baseUrl}/student/transcripts`, { waitUntil: 'networkidle' })

    await runCase({
      testId: 'P9-BR-007',
      role: 'Department Admin / Student',
      precondition: 'The student has a published result.',
      steps: 'Generate a transcript PDF and open the student transcript page on tablet dark mode.',
      expected: 'Transcript PDF is generated and the student transcript page lists issued documents.',
      run: async () => {
        const body = (await studentTabletPage.textContent('body')) || ''
        return {
          actual: `status=${transcriptResponse.status()}; pageHasTranscript=${body.includes('Official Transcripts')}`,
          status: transcriptResponse.ok() && body.includes('Official Transcripts') ? 'PASS' : 'FAIL',
          evidencePaths: [rel(transcriptPdfPath), ...(await transcriptTabletArtifacts())],
        }
      },
    })

    const verifyTranscript = await fetchJson(
      cseAdminApi,
      'GET',
      `/api/public/records/verify?code=${encodeURIComponent(transcriptCode)}`,
      undefined,
      'phase9-browser-verify-transcript'
    )
    const marksheetResponse = await cseAdminApi.fetch(
      `/api/admin/results-enterprise/students/${fixtures.student.id}/marksheet`,
      {
        method: 'POST',
        data: { locale: 'en', type: 'CONSOLIDATED' },
      }
    )
    const marksheetPdfPath = path.join(pdfDir, 'P9-BR-008-marksheet.pdf')
    await fs.writeFile(marksheetPdfPath, await marksheetResponse.body())

    await runCase({
      testId: 'P9-BR-008',
      role: 'Department Admin / Public',
      precondition: 'Transcript generation has completed.',
      steps: 'Verify the transcript code publicly and generate a consolidated marksheet PDF.',
      expected: 'Verification returns a valid document and marksheet PDF downloads successfully.',
      run: async () => ({
        actual: `verify=${verifyTranscript.status}; marksheet=${marksheetResponse.status()}`,
        status: verifyTranscript.status === 200 && marksheetResponse.ok() ? 'PASS' : 'FAIL',
        evidencePaths: [verifyTranscript.evidence, rel(marksheetPdfPath)],
      }),
    })

    const appeal = await fetchJson(
      studentApi,
      'POST',
      '/api/student/results-enterprise/appeals',
      {
        resultRecordId: resultRecord.id,
        teacherId: fixtures.teacher.id,
        reason: 'Browser smoke appeal submission for published result.',
      },
      'phase9-browser-appeal-submit'
    )

    await runCase({
      testId: 'P9-BR-009',
      role: 'Student',
      precondition: 'The student can see a published result.',
      steps: 'Submit a result appeal from the student API.',
      expected: 'Appeal is created in submitted status.',
      run: async () => ({
        actual: `status=${appeal.status}; appealId=${appeal.json?.id ?? 'none'}`,
        status: appeal.status === 201 ? 'PASS' : 'FAIL',
        evidencePaths: [appeal.evidence],
      }),
    })

    const appealResolve = await fetchJson(
      cseAdminApi,
      'PATCH',
      `/api/admin/results-enterprise/appeals/${appeal.json.id}`,
      {
        status: 'RESOLVED',
        teacherResponse: 'Verified against grade entries.',
        adminDecision: 'Resolved after review.',
      },
      'phase9-browser-appeal-resolve'
    )

    await runCase({
      testId: 'P9-BR-010',
      role: 'Department Admin',
      precondition: 'A submitted Phase 9 appeal exists.',
      steps: 'Resolve the appeal through the admin API.',
      expected: 'Appeal transitions to resolved status with audit details.',
      run: async () => ({
        actual: `status=${appealResolve.status}; resolved=${appealResolve.json?.status ?? 'unknown'}`,
        status: appealResolve.status === 200 && appealResolve.json?.status === 'RESOLVED' ? 'PASS' : 'FAIL',
        evidencePaths: [appealResolve.evidence],
      }),
    })

    const graduationCandidate = await fetchJson(
      cseAdminApi,
      'POST',
      `/api/admin/results-enterprise/students/${fixtures.student.id}/graduation`,
      {},
      'phase9-browser-graduation-create'
    )
    if (graduationCandidate.json?.audit?.id) {
      await prisma.phase9DegreeAudit.update({
        where: { id: graduationCandidate.json.audit.id },
        data: {
          isEligible: true,
          completedCredits: graduationCandidate.json.audit.requiredCredits ?? 0,
          remainingCredits: 0,
          currentCgpa: Math.max(graduationCandidate.json.audit.currentCgpa ?? 0, 3.25),
          compulsoryOutstanding: [],
          electiveOutstanding: [],
          requirementSummary: {
            promotedBy: 'phase9-browser-smoke',
            promotedAt: new Date().toISOString(),
          },
        },
      })
    }
    const graduationApprove = await fetchJson(
      cseAdminApi,
      'POST',
      `/api/admin/results-enterprise/students/${fixtures.student.id}/graduation`,
      { status: 'APPROVED', notes: 'Browser smoke approved' },
      'phase9-browser-graduation-approve'
    )
    const graduationCertify = await fetchJson(
      cseAdminApi,
      'POST',
      `/api/admin/results-enterprise/students/${fixtures.student.id}/graduation`,
      { status: 'CERTIFIED', notes: 'Browser smoke certified' },
      'phase9-browser-graduation-certify'
    )

    await runCase({
      testId: 'P9-BR-011',
      role: 'Department Admin',
      precondition: 'A degree audit can be generated for the student.',
      steps: 'Create the graduation candidate, approve it, and certify it.',
      expected: 'Graduation workflow reaches certified status.',
      run: async () => ({
        actual: `create=${graduationCandidate.status}; approve=${graduationApprove.status}; certify=${graduationCertify.status}`,
        status:
          graduationCandidate.status === 201 &&
          graduationApprove.status === 200 &&
          graduationCertify.status === 200
            ? 'PASS'
            : 'FAIL',
        evidencePaths: [graduationCandidate.evidence, graduationApprove.evidence, graduationCertify.evidence],
      }),
    })

    const certificateResponse = await cseAdminApi.fetch(
      `/api/admin/results-enterprise/students/${fixtures.student.id}/certificate`,
      {
        method: 'POST',
        data: {
          locale: 'en',
          type: 'GRADUATION',
        },
      }
    )
    const certificateBuffer = await certificateResponse.body()
    const certificateRecordId = certificateResponse.headers()['x-phase9-record-id']
    const certificateCode = certificateResponse.headers()['x-phase9-verification-code']
    const certificatePdfPath = path.join(pdfDir, 'P9-BR-012-certificate.pdf')
    await fs.writeFile(certificatePdfPath, certificateBuffer)
    await studentMobilePage.goto(`${baseUrl}/student/certificates`, { waitUntil: 'networkidle' })

    await runCase({
      testId: 'P9-BR-012',
      role: 'Department Admin / Student',
      precondition: 'Graduation workflow is certified.',
      steps: 'Generate a graduation certificate PDF and open the student certificate page on mobile dark mode.',
      expected: 'Certificate PDF is generated and student certificate page loads successfully.',
      run: async () => {
        const body = (await studentMobilePage.textContent('body')) || ''
        return {
          actual: `status=${certificateResponse.status()}; pageHasCertificates=${body.includes('Certificates')}`,
          status: certificateResponse.ok() && body.includes('Certificates') ? 'PASS' : 'FAIL',
          evidencePaths: [rel(certificatePdfPath), ...(await certificateMobileArtifacts())],
        }
      },
    })

    const studentTranscriptPdf = await apiBinary(studentApi, `/api/student/transcripts/${transcriptRecordId}`)
    const studentCertificatePdf = await apiBinary(studentApi, `/api/student/certificates/${certificateRecordId}`)
    const verifyCertificate = await fetchJson(
      cseAdminApi,
      'GET',
      `/api/public/records/verify?code=${encodeURIComponent(certificateCode)}`,
      undefined,
      'phase9-browser-verify-certificate'
    )

    await runCase({
      testId: 'P9-BR-013',
      role: 'Student / Public',
      precondition: 'Transcript and certificate records have been issued.',
      steps: 'Download student transcript and certificate PDFs, then verify the certificate code publicly.',
      expected: 'Student downloads succeed and public verification returns a valid certificate record.',
      run: async () => ({
        actual: `studentTranscript=${studentTranscriptPdf.status}; studentCertificate=${studentCertificatePdf.status}; verify=${verifyCertificate.status}`,
        status:
          studentTranscriptPdf.ok &&
          studentCertificatePdf.ok &&
          verifyCertificate.status === 200
            ? 'PASS'
            : 'FAIL',
        evidencePaths: [verifyCertificate.evidence],
      }),
    })

    const analyticsJson = await fetchJson(
      cseAdminApi,
      'GET',
      `/api/admin/results-enterprise/analytics?departmentId=${fixtures.departments.cse.id}`,
      undefined,
      'phase9-browser-analytics-json'
    )
    const analyticsCsv = await apiBinary(
      cseAdminApi,
      `/api/admin/results-enterprise/analytics?departmentId=${fixtures.departments.cse.id}&format=csv`
    )
    const analyticsPdf = await apiBinary(
      cseAdminApi,
      `/api/admin/results-enterprise/analytics?departmentId=${fixtures.departments.cse.id}&format=pdf`
    )
    const analyticsCsvPath = path.join(csvDir, 'P9-BR-014-analytics.csv')
    const analyticsPdfPath = path.join(pdfDir, 'P9-BR-014-analytics.pdf')
    await fs.writeFile(analyticsCsvPath, analyticsCsv.buffer)
    await fs.writeFile(analyticsPdfPath, analyticsPdf.buffer)

    await runCase({
      testId: 'P9-BR-014',
      role: 'Department Admin',
      precondition: 'Phase 9 results, graduation, and documents exist.',
      steps: 'Download JSON, CSV, and PDF analytics exports.',
      expected: 'All analytics formats are generated successfully.',
      run: async () => ({
        actual: `json=${analyticsJson.status}; csv=${analyticsCsv.status}; pdf=${analyticsPdf.status}`,
        status:
          analyticsJson.status === 200 &&
          analyticsCsv.ok &&
          analyticsPdf.ok
            ? 'PASS'
            : 'FAIL',
        evidencePaths: [analyticsJson.evidence, rel(analyticsCsvPath), rel(analyticsPdfPath)],
      }),
    })

    const foreignAdminIsolation = await fetchJson(
      eeeAdminApi,
      'GET',
      `/api/admin/results-enterprise/analytics?departmentId=${fixtures.departments.cse.id}`,
      undefined,
      'phase9-browser-tenant-isolation'
    )

    await runCase({
      testId: 'P9-BR-015',
      role: 'Foreign Department Admin',
      precondition: 'CSE Phase 9 data exists and EEE admin is authenticated.',
      steps: 'Attempt to read CSE analytics using EEE department admin credentials.',
      expected: 'Cross-department analytics access is denied.',
      run: async () => ({
        actual: `status=${foreignAdminIsolation.status}`,
        status: foreignAdminIsolation.status === 403 ? 'PASS' : 'FAIL',
        evidencePaths: [foreignAdminIsolation.evidence],
      }),
    })

    const adminDegreeAudit = await fetchJson(
      cseAdminApi,
      'POST',
      `/api/admin/results-enterprise/students/${fixtures.student.id}/degree-audit`,
      {},
      'phase9-browser-degree-audit'
    )

    await runCase({
      testId: 'P9-BR-016',
      role: 'Department Admin',
      precondition: 'Published results exist for the student.',
      steps: 'Request the degree audit report for the student.',
      expected: 'Degree audit returns missing/completed requirement details.',
      run: async () => ({
        actual: `status=${adminDegreeAudit.status}; eligible=${adminDegreeAudit.json?.isEligible ?? 'unknown'}`,
        status: adminDegreeAudit.status === 201 ? 'PASS' : 'FAIL',
        evidencePaths: [adminDegreeAudit.evidence],
      }),
    })

    await buildMatrix()

    await adminContext.close()
    await studentTabletContext.close()
    await studentMobileContext.close()
  } finally {
    await cseAdminApi?.dispose().catch(() => {})
    await eeeAdminApi?.dispose().catch(() => {})
    await studentApi?.dispose().catch(() => {})
    await browser.close().catch(() => {})
    if (server) {
      await stopServer(server).catch(() => {})
    }
    if (redis) {
      await stopRedis(redis).catch(() => {})
    }
    await prisma.$disconnect().catch(() => {})
  }

  if (!results.every((item) => item.status === 'PASS')) {
    console.error('[phase9:browser] BLOCKED')
    process.exit(1)
  }

  console.log('[phase9:browser] PASS')
}

main().catch(async (error) => {
  await ensureDirs()
  await writeText(path.join(consoleDir, 'phase9-browser-smoke-error.txt'), String(error?.stack || error))
  try {
    await prisma.$disconnect()
  } catch {}
  console.error('[phase9:browser] FAIL', error)
  process.exit(1)
})
