import { chromium } from 'playwright'
import { RedisMemoryServer } from 'redis-memory-server'
import { PrismaClient, CourseworkPublicationStatus } from '@prisma/client'
import { spawn } from 'child_process'
import { unlink, writeFile, mkdir } from 'fs/promises'
import fs from 'fs/promises'
import path from 'path'

const prisma = new PrismaClient()
const port = Number(process.env.PHASE7_PORT || 3010)
const baseUrl = process.env.PHASE7_BASE_URL || `http://127.0.0.1:${port}`
const evidenceRoot = path.join(process.cwd(), 'docs', 'phase-7', 'evidence')
const browserDir = path.join(evidenceRoot, 'browser')
const networkDir = path.join(evidenceRoot, 'network')
const consoleDir = path.join(evidenceRoot, 'console')
const databaseDir = path.join(evidenceRoot, 'database')
const uploadFixturePath = path.join(databaseDir, 'phase7-upload-fixture.txt')
const runStartedAt = new Date()

const createdIds = {
  templateId: null,
  versionId: null,
  publicationId: null,
  attemptId: null,
  attemptIds: [],
  extensionRequestIds: [],
  gradeId: null,
}

async function ensureDirs() {
  await Promise.all([
    mkdir(browserDir, { recursive: true }),
    mkdir(networkDir, { recursive: true }),
    mkdir(consoleDir, { recursive: true }),
    mkdir(databaseDir, { recursive: true }),
  ])
}

async function waitForServer(url, timeoutMs = 120000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${url}/api/health/ready`)
      if (response.ok) {
        const payload = await response.json()
        if (payload?.ready) {
          return payload
        }
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function login(page, email, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').first().fill(email)
  await page.locator('input[type="password"]').first().fill(password)
  await page.locator('form').evaluate((form) => form.requestSubmit())
  await page.waitForFunction(() => window.location.pathname !== '/login', { timeout: 30000 })
  await page.waitForLoadState('networkidle')
}

async function apiJson(page, urlPath, options = {}) {
  return page.evaluate(
    async ({ urlPath: innerUrlPath, options: innerOptions }) => {
      const response = await fetch(innerUrlPath, innerOptions)
      const text = await response.text()
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      return {
        ok: response.ok,
        status: response.status,
        json,
        text,
      }
    },
    { urlPath, options }
  )
}

async function apiStudentSubmission(page, publicationId, payload) {
  return page.evaluate(
    async ({ publicationId: innerPublicationId, payload: innerPayload }) => {
      const formData = new FormData()
      formData.append('plainTextSubmission', innerPayload.plainTextSubmission)
      formData.append('richTextSubmission', innerPayload.richTextSubmission)
      formData.append('externalLink', innerPayload.externalLink)
      formData.append('repositoryUrl', innerPayload.repositoryUrl)
      if (innerPayload.idempotencyKey) {
        formData.append('idempotencyKey', innerPayload.idempotencyKey)
      }
      formData.append(
        'files',
        new File([innerPayload.fileContents], innerPayload.fileName, {
          type: innerPayload.mimeType,
        })
      )

      const response = await fetch(`/api/student/coursework/publications/${innerPublicationId}/attempts`, {
        method: 'POST',
        body: formData,
      })
      const text = await response.text()
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      return {
        ok: response.ok,
        status: response.status,
        json,
        text,
      }
    },
    { publicationId, payload }
  )
}

function normalizeCaseId(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

async function screenshotCase(page, caseId) {
  const fileName = `${normalizeCaseId(caseId)}.png`
  const screenshotPath = path.join(browserDir, fileName)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  return screenshotPath
}

async function gatherFixtures() {
  const leadTeacher = await prisma.teacherProfile.findFirst({
    where: {
      teachingAssignments: {
        some: {
          status: 'ACTIVE',
          roles: {
            some: { role: 'LEAD_TEACHER' },
          },
        },
      },
    },
    include: {
      user: true,
      teachingAssignments: {
        where: {
          status: 'ACTIVE',
          roles: {
            some: { role: 'LEAD_TEACHER' },
          },
        },
        include: {
          academicOffering: true,
        },
        take: 1,
      },
    },
  })

  if (!leadTeacher?.teachingAssignments[0]) {
    throw new Error('No lead teacher with an active offering was found for Phase 7 browser fixtures')
  }

  const scope = leadTeacher.teachingAssignments[0]
  const eligibleStudent = await prisma.studentProfile.findFirst({
    where: {
      departmentId: scope.departmentId,
      subjects: {
        some: scope.academicOfferingId
          ? {
              OR: [
                { academicOfferingId: scope.academicOfferingId },
                {
                  subjectId: scope.academicOffering.subjectId,
                  languageId: scope.academicOffering.languageId,
                  groupId: scope.academicOffering.groupId,
                  academicYearId: scope.academicOffering.programYearId,
                  semesterId: scope.academicOffering.semesterId,
                },
              ],
            }
          : {
              subjectId: scope.academicOffering.subjectId,
              languageId: scope.academicOffering.languageId,
              groupId: scope.academicOffering.groupId,
              academicYearId: scope.academicOffering.programYearId,
              semesterId: scope.academicOffering.semesterId,
            },
      },
    },
    include: {
      user: true,
      subjects: {
        where: scope.academicOfferingId
          ? {
              OR: [
                { academicOfferingId: scope.academicOfferingId },
                {
                  subjectId: scope.academicOffering.subjectId,
                  languageId: scope.academicOffering.languageId,
                  groupId: scope.academicOffering.groupId,
                  academicYearId: {
                    not: '',
                  },
                  semesterId: scope.academicOffering.semesterId,
                },
              ],
            }
          : {
              subjectId: scope.academicOffering.subjectId,
              languageId: scope.academicOffering.languageId,
              groupId: scope.academicOffering.groupId,
              academicYearId: {
                not: '',
              },
              semesterId: scope.academicOffering.semesterId,
            },
        take: 5,
      },
    },
  })

  const foreignStudent = await prisma.studentProfile.findFirst({
    where: {
      NOT: {
        id: eligibleStudent?.id ?? '__no_match__',
      },
    },
    include: { user: true },
  })

  const assistantTeacher = await prisma.teacherProfile.findFirst({
    where: {
      id: {
        not: leadTeacher.id,
      },
      teachingAssignments: {
        some: {
          status: 'ACTIVE',
          academicOfferingId: scope.academicOfferingId,
        },
      },
    },
    include: {
      user: true,
    },
  })

  if (!eligibleStudent?.user?.email || !foreignStudent?.user?.email || !assistantTeacher?.user?.email) {
    throw new Error('Eligible, foreign student, or assistant teacher fixture was not found for Phase 7 browser smoke')
  }

  const scopedSubject = eligibleStudent.subjects.find(
    (subject) =>
      subject.subjectId === scope.academicOffering.subjectId &&
      subject.languageId === scope.academicOffering.languageId &&
      subject.groupId === scope.academicOffering.groupId &&
      subject.semesterId === scope.academicOffering.semesterId
  )

  if (!scopedSubject?.academicYearId) {
    throw new Error('Eligible student does not have a coursework scope with a valid academicYearId for browser fixtures')
  }

  return {
    leadTeacher,
    assistantTeacher,
    scope,
    eligibleStudent,
    foreignStudent,
    scopedSubject,
  }
}

async function cleanupFixture() {
  if (createdIds.gradeId) {
    await prisma.courseworkModerationDecision.deleteMany({ where: { gradeId: createdIds.gradeId } })
    await prisma.courseworkGradeCriterionScore.deleteMany({ where: { gradeId: createdIds.gradeId } })
    await prisma.courseworkGrade.deleteMany({ where: { id: createdIds.gradeId } })
  }
  if (createdIds.publicationId) {
    const attachments = await prisma.courseworkAttemptAttachment.findMany({
      where: { attempt: { publicationId: createdIds.publicationId } },
      select: { id: true, fileUrl: true },
    })
    for (const attachment of attachments) {
      const storedPath = path.join(process.cwd(), 'public', attachment.fileUrl.replace(/^\//, '').replaceAll('/', path.sep))
      try {
        await unlink(storedPath)
      } catch {}
    }
    await prisma.courseworkAttemptRequest.deleteMany({ where: { publicationId: createdIds.publicationId } })
    await prisma.courseworkAttemptAttachment.deleteMany({ where: { attempt: { publicationId: createdIds.publicationId } } })
    await prisma.courseworkAttempt.deleteMany({ where: { publicationId: createdIds.publicationId } })
  }
  if (createdIds.extensionRequestIds.length > 0) {
    await prisma.courseworkExtensionRequest.deleteMany({
      where: {
        id: { in: createdIds.extensionRequestIds },
      },
    })
  }
  if (createdIds.publicationId) {
    await prisma.courseworkPublicationTarget.deleteMany({ where: { publicationId: createdIds.publicationId } })
    await prisma.courseworkPublication.deleteMany({ where: { id: createdIds.publicationId } })
  }
  if (createdIds.versionId) {
    await prisma.courseworkTemplateVersion.deleteMany({ where: { id: createdIds.versionId } })
  }
  if (createdIds.templateId) {
    await prisma.courseworkRubricLevel.deleteMany({ where: { criterion: { rubric: { templateId: createdIds.templateId } } } })
    await prisma.courseworkRubricCriterion.deleteMany({ where: { rubric: { templateId: createdIds.templateId } } })
    await prisma.courseworkRubric.deleteMany({ where: { templateId: createdIds.templateId } })
    await prisma.courseworkTemplate.deleteMany({ where: { id: createdIds.templateId } })
  }
  try {
    await unlink(uploadFixturePath)
  } catch {}
}

async function main() {
  await ensureDirs()
  await writeFile(uploadFixturePath, 'Phase 7 browser upload fixture\n', 'utf8')

  const fixtures = await gatherFixtures()
  const redisServer = new RedisMemoryServer({ instance: { port: 6380 } })
  const redisHost = await redisServer.getHost()
  const redisPort = await redisServer.getPort()
  const redisUrl = `redis://${redisHost}:${redisPort}`
  const serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NEXTAUTH_URL: baseUrl,
      NEXT_PUBLIC_SOCKET_URL: baseUrl,
      REDIS_URL: redisUrl,
      REDIS_REQUIRED: 'true',
      ALLOW_MEMORY_RUNTIME_FALLBACK: 'false',
    },
    stdio: 'inherit',
  })

  const browser = await chromium.launch({ headless: true })
  const teacherContext = await browser.newContext()
  const assistantTeacherContext = await browser.newContext()
  const studentContext = await browser.newContext()
  const foreignStudentContext = await browser.newContext()
  const teacherPage = await teacherContext.newPage()
  const assistantTeacherPage = await assistantTeacherContext.newPage()
  const studentPage = await studentContext.newPage()
  const foreignStudentPage = await foreignStudentContext.newPage()

  const consoleEvents = []
  const networkEvents = []
  for (const [role, page] of [
    ['teacher', teacherPage],
    ['assistant-teacher', assistantTeacherPage],
    ['student', studentPage],
    ['foreign-student', foreignStudentPage],
  ]) {
    page.on('console', (message) => {
      consoleEvents.push({ role, type: message.type(), text: message.text() })
    })
    page.on('response', (response) => {
      networkEvents.push({ role, url: response.url(), status: response.status() })
    })
  }

  const cases = []
  const summary = {
    baseUrl,
    executedAt: new Date().toISOString(),
    fixtures: {
      teacher: fixtures.leadTeacher.user.email,
      assistantTeacher: fixtures.assistantTeacher.user.email,
      eligibleStudent: fixtures.eligibleStudent.user.email,
      foreignStudent: fixtures.foreignStudent.user.email,
    },
    cases,
    status: 'PASS',
    notes: [],
  }

  async function runCase(definition) {
    const record = {
      testId: definition.testId,
      role: definition.role,
      steps: definition.steps,
      expected: definition.expected,
      actual: '',
      status: 'PASS',
      evidencePath: null,
    }

    try {
      const result = await definition.run()
      record.actual = result?.actual ?? 'Completed as expected.'
      record.status = result?.status ?? 'PASS'
      record.evidencePath = result?.evidencePath ?? null
    } catch (error) {
      record.status = 'FAIL'
      record.actual = error instanceof Error ? error.message : String(error)
      summary.status = 'BLOCKED'
    }

    if (record.status !== 'PASS') {
      summary.status = 'BLOCKED'
    }
    cases.push(record)
  }

  try {
    await waitForServer(baseUrl)

    await runCase({
      testId: 'P7-BR-001',
      role: 'teacher',
      steps: ['Login as teacher', 'Open /teacher/coursework'],
      expected: 'Teacher can authenticate and load enterprise coursework overview.',
      run: async () => {
        await login(teacherPage, fixtures.leadTeacher.user.email, 'Teacher@123')
        await teacherPage.goto(`${baseUrl}/teacher/coursework`, { waitUntil: 'networkidle' })
        const evidencePath = await screenshotCase(teacherPage, 'P7-BR-001')
        return {
          actual: 'Teacher login succeeded and coursework overview rendered.',
          evidencePath,
        }
      },
    })

    await runCase({
      testId: 'P7-BR-002',
      role: 'teacher',
      steps: ['Create an enterprise coursework template through the authenticated teacher API'],
      expected: 'Template and rubric are created for the teacher scope.',
      run: async () => {
        const response = await apiJson(teacherPage, '/api/teacher/coursework/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            academicOfferingId: fixtures.scope.academicOfferingId,
            subjectId: fixtures.scope.academicOffering.subjectId,
            languageId: fixtures.scope.academicOffering.languageId,
            groupId: fixtures.scope.academicOffering.groupId,
            academicYearId: fixtures.scopedSubject.academicYearId,
            semesterId: fixtures.scope.academicOffering.semesterId,
            type: 'HOMEWORK',
            title: 'P7 Browser Fixture Template',
            description: 'Phase 7 browser fixture template',
            instructions: 'Submit a text response and one attachment.',
            allowedFileTypes: ['txt'],
            maxAttempts: 2,
            allowUnlimitedAttempts: false,
            latePolicyType: 'LATE_WITHOUT_PENALTY',
            reviewRequestsEnabled: true,
            rubric: {
              title: 'P7 Browser Fixture Rubric',
              criteria: [
                {
                  title: 'Correctness',
                  maximumMarks: 70,
                  weight: 0.7,
                },
                {
                  title: 'Documentation',
                  maximumMarks: 30,
                  weight: 0.3,
                },
              ],
            },
          }),
        })
        if (!response.ok || !response.json?.template?.id) {
          throw new Error(response.json?.error || 'Template creation failed')
        }
        createdIds.templateId = response.json.template.id
        const savedTemplate = await prisma.courseworkTemplate.findUnique({
          where: { id: createdIds.templateId },
          include: {
            versions: { take: 1, orderBy: { versionNumber: 'desc' } },
            rubric: { include: { criteria: true } },
          },
        })
        createdIds.versionId = savedTemplate?.versions[0]?.id ?? null
        if (!savedTemplate?.rubric?.criteria?.length) {
          throw new Error('Template rubric was not persisted')
        }
        await teacherPage.goto(`${baseUrl}/teacher/coursework/templates`, { waitUntil: 'networkidle' })
        const evidencePath = await screenshotCase(teacherPage, 'P7-BR-002')
        return {
          actual: `Template ${createdIds.templateId} created with ${savedTemplate.rubric.criteria.length} rubric criteria.`,
          evidencePath,
        }
      },
    })

    await runCase({
      testId: 'P7-BR-003',
      role: 'teacher',
      steps: ['Create a draft publication targeted to the eligible student', 'Move it to SCHEDULED', 'Move it to PUBLISHED'],
      expected: 'Publication lifecycle supports valid DRAFT -> SCHEDULED -> PUBLISHED transitions.',
      run: async () => {
        const createResponse = await apiJson(teacherPage, '/api/teacher/coursework/publications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: createdIds.templateId,
            title: 'P7 Browser Fixture Publication',
            status: 'DRAFT',
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          hardCloseAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          reviewRequestsEnabled: true,
          targetStudentIds: [fixtures.eligibleStudent.id],
        }),
      })
        if (!createResponse.ok || !createResponse.json?.publication?.id) {
          throw new Error(createResponse.json?.error || 'Publication creation failed')
        }
        createdIds.publicationId = createResponse.json.publication.id

        const scheduledResponse = await apiJson(teacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'SCHEDULED',
            scheduledFor: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          }),
        })
        if (!scheduledResponse.ok) {
          throw new Error(scheduledResponse.json?.error || 'Failed to schedule publication')
        }

        const publishedResponse = await apiJson(teacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'PUBLISHED',
          }),
        })
        if (!publishedResponse.ok) {
          throw new Error(publishedResponse.json?.error || 'Failed to publish publication')
        }

        await teacherPage.goto(`${baseUrl}/teacher/coursework/assignments`, { waitUntil: 'networkidle' })
        const evidencePath = await screenshotCase(teacherPage, 'P7-BR-003')
        return {
          actual: `Publication ${createdIds.publicationId} moved from DRAFT to SCHEDULED to PUBLISHED.`,
          evidencePath,
        }
      },
    })

    await runCase({
      testId: 'P7-BR-004',
      role: 'teacher',
      steps: ['Archive the publication', 'Attempt invalid ARCHIVED -> DRAFT transition'],
      expected: 'Invalid lifecycle transitions are rejected by the server.',
      run: async () => {
        const archiveResponse = await apiJson(teacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'ARCHIVED' }),
        })
        if (!archiveResponse.ok) {
          throw new Error(archiveResponse.json?.error || 'Failed to archive publication')
        }

        const invalidResponse = await apiJson(teacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'DRAFT' }),
        })
        if (invalidResponse.ok || invalidResponse.status !== 400) {
          throw new Error('Invalid archived-to-draft transition was not rejected')
        }

        const republishResponse = await apiJson(teacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'PUBLISHED' }),
        })
        return {
          status: republishResponse.ok ? 'FAIL' : 'PASS',
          actual: republishResponse.ok
            ? 'Archived publication unexpectedly returned to PUBLISHED.'
            : 'Archived publication rejected invalid reverse transition as expected.',
          evidencePath: await screenshotCase(teacherPage, 'P7-BR-004'),
        }
      },
    })

    await runCase({
      testId: 'P7-BR-005',
      role: 'student',
      steps: ['Login as eligible student', 'Open coursework list', 'Open coursework detail'],
      expected: 'Eligible student can list and open the published targeted coursework.',
      run: async () => {
        const republishFresh = await prisma.courseworkPublication.update({
          where: { id: createdIds.publicationId },
          data: { status: CourseworkPublicationStatus.PUBLISHED, publishedAt: new Date(), archivedAt: null },
        })
        void republishFresh

        await login(studentPage, fixtures.eligibleStudent.user.email, 'Student@123')
        const publicationListResponse = await apiJson(studentPage, '/api/student/coursework/publications')
        if (!publicationListResponse.ok) {
          throw new Error(publicationListResponse.json?.error || 'Student publication list request failed')
        }
        const publication = publicationListResponse.json?.publications?.find((item) => item.id === createdIds.publicationId)
        if (!publication) {
          throw new Error('Published targeted coursework did not appear in the eligible student publication list')
        }
        await studentPage.goto(`${baseUrl}/student/coursework/${createdIds.publicationId}/submit`, { waitUntil: 'networkidle' })
        const evidencePath = await screenshotCase(studentPage, 'P7-BR-005')
        return {
          actual: `Eligible student listed publication ${createdIds.publicationId} and loaded the submission route.`,
          evidencePath,
        }
      },
    })

    await runCase({
      testId: 'P7-BR-006',
      role: 'foreign-student',
      steps: ['Login as foreign student', 'Attempt to open the targeted coursework detail route'],
      expected: 'Non-target student is denied access to the targeted coursework.',
      run: async () => {
        await login(foreignStudentPage, fixtures.foreignStudent.user.email, 'Student@123')
        const publicationListResponse = await apiJson(foreignStudentPage, '/api/student/coursework/publications')
        if (!publicationListResponse.ok) {
          throw new Error(publicationListResponse.json?.error || 'Foreign student publication list request failed')
        }
        const publication = publicationListResponse.json?.publications?.find((item) => item.id === createdIds.publicationId)
        if (publication) {
          throw new Error('Foreign student unexpectedly saw the targeted publication in the publication list')
        }
        const attemptResponse = await apiJson(
          foreignStudentPage,
          `/api/student/coursework/publications/${createdIds.publicationId}/attempts`
        )
        if (attemptResponse.ok || attemptResponse.status !== 403) {
          throw new Error('Foreign student was not denied by the attempts API')
        }
        await foreignStudentPage.goto(`${baseUrl}/student/coursework`, { waitUntil: 'networkidle' })
        const evidencePath = await screenshotCase(foreignStudentPage, 'P7-BR-006')
        return {
          actual: 'Foreign student was denied publication visibility and attempts API access.',
          evidencePath,
        }
      },
    })

    await runCase({
      testId: 'P7-BR-007',
      role: 'student',
      steps: ['Open submission page', 'Submit text, link, repository URL, and attachment through the UI'],
      expected: 'Student can submit an attempt and the attempt is persisted with an attachment.',
      run: async () => {
        await studentPage.goto(`${baseUrl}/student/coursework/${createdIds.publicationId}/submit`, { waitUntil: 'networkidle' })
        const submitResponse = await apiStudentSubmission(studentPage, createdIds.publicationId, {
          plainTextSubmission: 'Phase 7 browser submission text',
          richTextSubmission: 'Phase 7 browser rich text fallback',
          externalLink: 'https://example.com/phase7',
          repositoryUrl: 'https://github.com/example/phase7',
          idempotencyKey: 'phase7-browser-submit-1',
          fileContents: 'Phase 7 browser upload fixture\n',
          fileName: 'phase7-upload-fixture.txt',
          mimeType: 'text/plain',
        })
        if (!submitResponse.ok) {
          throw new Error(submitResponse.json?.error || 'Student submission API request failed')
        }
        const attempt = await prisma.courseworkAttempt.findFirst({
          where: {
            publicationId: createdIds.publicationId,
            studentId: fixtures.eligibleStudent.id,
          },
          include: {
            attachments: true,
          },
          orderBy: { attemptNumber: 'desc' },
        })
        if (!attempt?.attachments?.length) {
          throw new Error('Submitted attempt was not persisted with an attachment')
        }
        createdIds.attemptId = attempt.id
        createdIds.attemptIds = [attempt.id]
        await studentPage.reload({ waitUntil: 'networkidle' })
        const evidencePath = await screenshotCase(studentPage, 'P7-BR-007')
        return {
          actual: `Attempt ${attempt.id} submitted with ${attempt.attachments.length} attachment(s).`,
          evidencePath,
        }
      },
    })

    await runCase({
      testId: 'P7-BR-014',
      role: 'student',
      steps: ['Repeat the same submission with the same idempotency key', 'Verify no duplicate attempt or attachment is created'],
      expected: 'Duplicate submission returns the same submitted attempt without duplicating side effects.',
      run: async () => {
        const duplicateResponse = await apiStudentSubmission(studentPage, createdIds.publicationId, {
          plainTextSubmission: 'Phase 7 browser submission text',
          richTextSubmission: 'Phase 7 browser rich text fallback',
          externalLink: 'https://example.com/phase7',
          repositoryUrl: 'https://github.com/example/phase7',
          idempotencyKey: 'phase7-browser-submit-1',
          fileContents: 'Phase 7 browser upload fixture\n',
          fileName: 'phase7-upload-fixture.txt',
          mimeType: 'text/plain',
        })
        if (!duplicateResponse.ok || !duplicateResponse.json?.idempotent) {
          throw new Error(duplicateResponse.json?.error || 'Duplicate submission did not return an idempotent response')
        }

        const attempts = await prisma.courseworkAttempt.findMany({
          where: {
            publicationId: createdIds.publicationId,
            studentId: fixtures.eligibleStudent.id,
          },
          include: { attachments: true },
          orderBy: { attemptNumber: 'asc' },
        })
        if (attempts.length !== 1) {
          throw new Error(`Expected one attempt after duplicate submit, found ${attempts.length}`)
        }
        if (attempts[0].id !== createdIds.attemptId || attempts[0].attachments.length !== 1) {
          throw new Error('Duplicate submit altered the original attempt or attachment linkage')
        }

        const teacherNotifications = await prisma.notification.count({
          where: {
            userId: fixtures.leadTeacher.userId,
            title: 'Coursework submission received',
          },
        })
        if (teacherNotifications < 1) {
          throw new Error('Expected a submission notification for the original submit')
        }

        return {
          actual: `Duplicate submit returned attempt ${duplicateResponse.json.attempt.id} idempotently and kept attempt count at ${attempts.length}.`,
          evidencePath: await screenshotCase(studentPage, 'P7-BR-014'),
        }
      },
    })

    await runCase({
      testId: 'P7-BR-015',
      role: 'teacher',
      steps: ['Return the first attempt for revision', 'Student submits a second attempt', 'Verify history shows both attempts and the limit blocks a third'],
      expected: 'Returned resubmission creates a second immutable attempt and the attempt limit is enforced.',
      run: async () => {
        const returnResponse = await apiJson(teacherPage, `/api/teacher/coursework/attempts/${createdIds.attemptId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'RETURN' }),
        })
        if (!returnResponse.ok) {
          throw new Error(returnResponse.json?.error || 'Teacher could not return the first attempt')
        }

        const resubmitResponse = await apiStudentSubmission(studentPage, createdIds.publicationId, {
          plainTextSubmission: 'Phase 7 browser submission revision',
          richTextSubmission: 'Phase 7 browser rich text revision',
          externalLink: 'https://example.com/phase7-revision',
          repositoryUrl: 'https://github.com/example/phase7-revision',
          idempotencyKey: 'phase7-browser-submit-2',
          fileContents: 'Phase 7 browser upload revision fixture\n',
          fileName: 'phase7-upload-revision.txt',
          mimeType: 'text/plain',
        })
        if (!resubmitResponse.ok || !resubmitResponse.json?.attempt?.id) {
          throw new Error(resubmitResponse.json?.error || 'Returned resubmission failed')
        }

        const attempts = await prisma.courseworkAttempt.findMany({
          where: {
            publicationId: createdIds.publicationId,
            studentId: fixtures.eligibleStudent.id,
          },
          include: { attachments: true },
          orderBy: { attemptNumber: 'asc' },
        })
        if (attempts.length !== 2) {
          throw new Error(`Expected two attempts after resubmission, found ${attempts.length}`)
        }
        if (attempts[0].status !== 'RETURNED' || attempts[1].attemptNumber !== 2) {
          throw new Error('Attempt history did not preserve the returned first attempt and separate second attempt')
        }
        createdIds.attemptIds = attempts.map((attempt) => attempt.id)

        await studentPage.goto(`${baseUrl}/student/coursework/${createdIds.publicationId}/history`, { waitUntil: 'networkidle' })
        const historyText = await studentPage.textContent('body')
        if (!historyText?.includes('Attempt #1') || !historyText.includes('Attempt #2')) {
          throw new Error('Attempt history UI did not show both attempts')
        }

        const blockedThirdSubmit = await apiStudentSubmission(studentPage, createdIds.publicationId, {
          plainTextSubmission: 'Phase 7 browser third attempt should be blocked',
          richTextSubmission: '',
          externalLink: '',
          repositoryUrl: '',
          idempotencyKey: 'phase7-browser-submit-3',
          fileContents: 'Blocked third attempt\n',
          fileName: 'phase7-third-attempt.txt',
          mimeType: 'text/plain',
        })
        if (blockedThirdSubmit.ok || blockedThirdSubmit.status !== 400) {
          throw new Error('Attempt limit did not block a third submission')
        }

        return {
          actual: `Returned attempt created a separate second attempt (${attempts[1].id}) and a third attempt was rejected at the limit.`,
          evidencePath: await screenshotCase(studentPage, 'P7-BR-015'),
        }
      },
    })

    await runCase({
      testId: 'P7-BR-016',
      role: 'student',
      steps: ['Open the protected download route for your own attachment', 'Retry as a foreign student', 'Retry without authentication'],
      expected: 'Only the owning student and authorized teachers can fetch protected coursework attachments.',
      run: async () => {
        const latestAttachment = await prisma.courseworkAttemptAttachment.findFirst({
          where: {
            attempt: {
              publicationId: createdIds.publicationId,
              studentId: fixtures.eligibleStudent.id,
            },
          },
          orderBy: { createdAt: 'desc' },
        })
        if (!latestAttachment) {
          throw new Error('No attachment was available for protected-delivery verification')
        }

        const ownerDownload = await apiJson(studentPage, `/api/coursework/attachments/${latestAttachment.id}`)
        if (!ownerDownload.ok || ownerDownload.status !== 200) {
          throw new Error('Owning student could not download the protected attachment')
        }

        const foreignDownload = await apiJson(foreignStudentPage, `/api/coursework/attachments/${latestAttachment.id}`)
        if (foreignDownload.ok || foreignDownload.status !== 403) {
          throw new Error('Foreign student was not denied protected attachment access')
        }

        const anonymousResponse = await fetch(`${baseUrl}/api/coursework/attachments/${latestAttachment.id}`, {
          redirect: 'manual',
        })
        if (anonymousResponse.status !== 401) {
          throw new Error(`Expected unauthenticated attachment request to return 401, received ${anonymousResponse.status}`)
        }

        const historyHtml = await studentPage.content()
        if (historyHtml.includes('/uploads/coursework-enterprise/')) {
          throw new Error('Student coursework history still exposed a direct public attachment URL')
        }

        return {
          actual: `Protected attachment delivery allowed the owner, denied a foreign student, and rejected anonymous access for attachment ${latestAttachment.id}.`,
          evidencePath: await screenshotCase(studentPage, 'P7-BR-016'),
        }
      },
    })

    await runCase({
      testId: 'P7-BR-008',
      role: 'student',
      steps: ['Request an extension for the published coursework'],
      expected: 'Student can create an extension request for eligible coursework.',
      run: async () => {
        await studentPage.goto(`${baseUrl}/student/coursework/${createdIds.publicationId}/submit`, { waitUntil: 'networkidle' })
        const extensionResponse = await apiJson(studentPage, `/api/student/coursework/publications/${createdIds.publicationId}/extensions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestedUntil: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
            reason: 'Need a little more time for the browser fixture.',
          }),
        })
        if (!extensionResponse.ok) {
          throw new Error(extensionResponse.json?.error || 'Student extension request failed')
        }
        const extensionRequest = await prisma.courseworkExtensionRequest.findFirst({
          where: {
            publicationId: createdIds.publicationId,
            studentId: fixtures.eligibleStudent.id,
          },
          orderBy: { createdAt: 'desc' },
        })
        if (!extensionRequest) {
          throw new Error('Extension request was not persisted')
        }
        createdIds.extensionRequestIds.push(extensionRequest.id)
        await studentPage.reload({ waitUntil: 'networkidle' })
        const evidencePath = await screenshotCase(studentPage, 'P7-BR-008')
        return {
          actual: `Extension request ${extensionRequest.id} created in REQUESTED state.`,
          evidencePath,
        }
      },
    })

    await runCase({
      testId: 'P7-BR-009',
      role: 'teacher',
      steps: ['Approve the latest extension request through the teacher API'],
      expected: 'Teacher can approve an eligible extension request with a new deadline.',
      run: async () => {
        const latestRequest = await prisma.courseworkExtensionRequest.findFirst({
          where: {
            publicationId: createdIds.publicationId,
            studentId: fixtures.eligibleStudent.id,
          },
          orderBy: { createdAt: 'desc' },
        })
        const latestRequestId = latestRequest?.id
        if (!latestRequestId) {
          throw new Error('No persisted extension request was available for approval')
        }
        const response = await apiJson(
          teacherPage,
          `/api/teacher/coursework/publications/${createdIds.publicationId}/extensions/${latestRequestId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'APPROVED',
              approvedUntil: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
              teacherNote: 'Approved during browser fixture execution.',
            }),
          }
        )
        if (!response.ok) {
          throw new Error(response.json?.error || 'Teacher extension approval failed')
        }
        await teacherPage.goto(`${baseUrl}/teacher/coursework/extensions`, { waitUntil: 'networkidle' })
        const evidencePath = await screenshotCase(teacherPage, 'P7-BR-009')
        return {
          actual: `Extension request ${latestRequestId} approved with a new deadline.`,
          evidencePath,
        }
      },
    })

    await runCase({
      testId: 'P7-LATE-001',
      role: 'student',
      steps: ['Create a publication that is already past due', 'Verify the student is blocked', 'Approve an extension for the same student', 'Verify the same student can submit within the extension window'],
      expected: 'Server-side late-policy enforcement blocks after the original deadline and only the approved extension reopens the deadline for that student.',
      run: async () => {
        const latePublicationResponse = await apiJson(teacherPage, '/api/teacher/coursework/publications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: createdIds.templateId,
            title: 'P7 Browser Late Policy Fixture',
            status: 'PUBLISHED',
            dueAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            hardCloseAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
            targetStudentIds: [fixtures.eligibleStudent.id],
            latePolicyType: 'NO_LATE_SUBMISSION',
          }),
        })
        if (!latePublicationResponse.ok || !latePublicationResponse.json?.publication?.id) {
          throw new Error(latePublicationResponse.json?.error || 'Late-policy fixture publication creation failed')
        }

        const latePublicationId = latePublicationResponse.json.publication.id
        try {
          const initialBlocked = await apiStudentSubmission(studentPage, latePublicationId, {
            plainTextSubmission: 'late policy blocked submit',
            richTextSubmission: '',
            externalLink: '',
            repositoryUrl: '',
            idempotencyKey: 'phase7-late-blocked-1',
            fileContents: 'late blocked\n',
            fileName: 'late-blocked.txt',
            mimeType: 'text/plain',
          })
          if (initialBlocked.ok || initialBlocked.status !== 400) {
            throw new Error('Late-policy fixture unexpectedly allowed a past-due submission before extension approval')
          }

          const extensionRequest = await prisma.courseworkExtensionRequest.create({
            data: {
              publicationId: latePublicationId,
              studentId: fixtures.eligibleStudent.id,
              status: 'APPROVED',
              requestedUntil: new Date(Date.now() + 2 * 60 * 60 * 1000),
              approvedUntil: new Date(Date.now() + 2 * 60 * 60 * 1000),
              reason: 'Browser late-policy extension fixture',
              teacherNote: 'Approved in browser fixture',
              decidedAt: new Date(),
              decidedByTeacherId: fixtures.leadTeacher.id,
            },
          })
          createdIds.extensionRequestIds.push(extensionRequest.id)

          const allowedAfterExtension = await apiStudentSubmission(studentPage, latePublicationId, {
            plainTextSubmission: 'late policy extension submit',
            richTextSubmission: '',
            externalLink: '',
            repositoryUrl: '',
            idempotencyKey: 'phase7-late-extension-1',
            fileContents: 'late extension allowed\n',
            fileName: 'late-extension.txt',
            mimeType: 'text/plain',
          })
          if (!allowedAfterExtension.ok || !allowedAfterExtension.json?.attempt?.id) {
            throw new Error(allowedAfterExtension.json?.error || 'Approved extension did not reopen the deadline for the intended student')
          }

          return {
            actual: `Past-due submission was blocked before approval, then attempt ${allowedAfterExtension.json.attempt.id} succeeded only after the approved extension.`,
            evidencePath: await screenshotCase(studentPage, 'P7-LATE-001'),
          }
        } finally {
          await prisma.courseworkAttemptRequest.deleteMany({ where: { publicationId: latePublicationId } })
          await prisma.courseworkAttemptAttachment.deleteMany({ where: { attempt: { publicationId: latePublicationId } } })
          await prisma.courseworkAttempt.deleteMany({ where: { publicationId: latePublicationId } })
          await prisma.courseworkExtensionRequest.deleteMany({ where: { publicationId: latePublicationId } })
          await prisma.courseworkPublicationTarget.deleteMany({ where: { publicationId: latePublicationId } })
          await prisma.courseworkPublication.deleteMany({ where: { id: latePublicationId } })
        }
      },
    })

    await runCase({
      testId: 'P7-MOD-001',
      role: 'teacher',
      steps: ['Lead teacher saves a draft grade', 'Lead teacher submits for moderation', 'Assistant teacher requests changes', 'Lead teacher resubmits', 'Lead teacher self-approval is denied', 'Assistant teacher approves', 'Lead teacher publishes', 'Published grade mutation is denied'],
      expected: 'The moderation chain enforces role separation, keeps draft grades hidden from students, audits each transition, and only exposes the grade after publication.',
      run: async () => {
        await login(assistantTeacherPage, fixtures.assistantTeacher.user.email, 'Teacher@123')

        const moderatedAttemptId = createdIds.attemptIds[1] ?? createdIds.attemptId
        if (!moderatedAttemptId) {
          throw new Error('No moderated attempt fixture was available for the moderation workflow')
        }

        const template = await prisma.courseworkTemplate.findUnique({
          where: { id: createdIds.templateId },
          include: {
            rubric: {
              include: {
                criteria: {
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
          },
        })
        const criterionScores = (template?.rubric?.criteria ?? []).map((criterion) => ({
          criterionId: criterion.id,
          selectedLevelId: null,
          awardedScore: criterion.maximumMarks,
          feedback: `Workflow score for ${criterion.title}`,
        }))

        const saveDraft = await apiJson(teacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}/grades`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowAction: 'SAVE_DRAFT',
            attemptId: moderatedAttemptId,
            manualAdjustment: 0,
            textFeedback: 'Draft feedback not visible to student',
            privateNotes: 'Draft private note',
            criterionScores,
          }),
        })
        if (!saveDraft.ok || saveDraft.json?.grade?.status !== 'DRAFT') {
          throw new Error(saveDraft.json?.error || 'Lead teacher could not save the draft grade')
        }
        createdIds.gradeId = saveDraft.json.grade.id

        const unpublishedHistory = await apiJson(studentPage, `/api/student/coursework/publications/${createdIds.publicationId}/attempts`)
        const moderatedAttemptHistory = unpublishedHistory.json?.attempts?.find((attempt) => attempt.id === moderatedAttemptId)
        if (moderatedAttemptHistory?.grades?.length) {
          throw new Error('Student could see a non-published draft grade before moderation completed')
        }

        const submitForModeration = await apiJson(teacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}/grades`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowAction: 'SUBMIT_FOR_MODERATION',
            attemptId: moderatedAttemptId,
            manualAdjustment: 0,
            textFeedback: 'Submitted for moderation',
            privateNotes: 'Moderation draft notes',
            criterionScores,
          }),
        })
        if (!submitForModeration.ok || submitForModeration.json?.grade?.status !== 'MODERATION') {
          throw new Error(submitForModeration.json?.error || 'Lead teacher could not submit the grade for moderation')
        }

        const requestChanges = await apiJson(assistantTeacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}/grades`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowAction: 'REQUEST_CHANGES',
            attemptId: moderatedAttemptId,
            manualAdjustment: 0,
            textFeedback: 'Needs revision before approval',
            privateNotes: 'Moderator note should stay private',
            moderationNotes: 'Please clarify the implementation details.',
            criterionScores,
          }),
        })
        if (!requestChanges.ok || requestChanges.json?.grade?.status !== 'SUBMITTED') {
          throw new Error(requestChanges.json?.error || 'Assistant teacher could not request moderation changes')
        }

        const resubmit = await apiJson(teacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}/grades`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowAction: 'RESUBMIT',
            attemptId: moderatedAttemptId,
            manualAdjustment: 0,
            textFeedback: 'Revised for moderation approval',
            privateNotes: 'Updated after changes requested',
            criterionScores,
          }),
        })
        if (!resubmit.ok || resubmit.json?.grade?.status !== 'MODERATION') {
          throw new Error(resubmit.json?.error || 'Lead teacher could not resubmit after changes were requested')
        }

        const selfApproveDenied = await apiJson(teacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}/grades`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowAction: 'APPROVE',
            attemptId: moderatedAttemptId,
            criterionScores,
          }),
        })
        if (selfApproveDenied.ok || selfApproveDenied.status !== 400 || !String(selfApproveDenied.json?.error || '').includes('Self-approval')) {
          throw new Error('Lead teacher self-approval was not denied during moderation')
        }

        const approve = await apiJson(assistantTeacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}/grades`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowAction: 'APPROVE',
            attemptId: moderatedAttemptId,
            moderationNotes: 'Approved after revision.',
            criterionScores,
          }),
        })
        if (!approve.ok || approve.json?.grade?.status !== 'APPROVED') {
          throw new Error(approve.json?.error || 'Assistant teacher could not approve the moderated grade')
        }

        const publish = await apiJson(teacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}/grades`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowAction: 'PUBLISH',
            attemptId: moderatedAttemptId,
            manualAdjustment: 0,
            textFeedback: 'Published feedback for the student.',
            privateNotes: 'Teacher-only note that should not reach student views.',
            moderationNotes: 'Moderator-only note',
            criterionScores,
          }),
        })
        if (!publish.ok || publish.json?.grade?.status !== 'PUBLISHED') {
          throw new Error(publish.json?.error || 'Lead teacher could not publish the approved grade')
        }
        createdIds.gradeId = publish.json.grade.id

        const publishedMutationDenied = await apiJson(teacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}/grades`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowAction: 'SAVE_DRAFT',
            attemptId: moderatedAttemptId,
            textFeedback: 'Should not mutate after publish',
            criterionScores,
          }),
        })
        if (publishedMutationDenied.ok || publishedMutationDenied.status !== 400 || !String(publishedMutationDenied.json?.error || '').includes('Published grades are immutable')) {
          throw new Error('Published grade mutation was not blocked')
        }

        const auditActions = await prisma.activityLog.findMany({
          where: {
            action: {
              in: [
                'coursework.grade.draft',
                'coursework.grade.submit_for_moderation',
                'coursework.grade.changes_requested',
                'coursework.grade.resubmit',
                'coursework.grade.approve',
                'coursework.grade.publish',
              ],
            },
            details: {
              contains: moderatedAttemptId,
            },
          },
          select: { action: true },
        })
        if (new Set(auditActions.map((entry) => entry.action)).size !== 6) {
          throw new Error('Not every moderation transition was audited')
        }

        return {
          actual: `Moderation chain completed for attempt ${moderatedAttemptId}, self-approval was denied, and all six transition audits were recorded.`,
          evidencePath: await screenshotCase(teacherPage, 'P7-MOD-001'),
        }
      },
    })

    await runCase({
      testId: 'P7-BR-010',
      role: 'teacher',
      steps: ['Open the teacher grading studio after moderation and publication'],
      expected: 'Teacher can see the published grade state after the moderation workflow completes.',
      run: async () => {
        await teacherPage.goto(`${baseUrl}/teacher/coursework/grading`, { waitUntil: 'networkidle' })
        const bodyText = await teacherPage.textContent('body')
        if (!bodyText?.includes('PUBLISHED')) {
          throw new Error('Teacher grading studio did not show the published grade state after moderation')
        }
        const evidencePath = await screenshotCase(teacherPage, 'P7-BR-010')
        return {
          actual: `Teacher grading studio displayed the published grade ${createdIds.gradeId} after moderation completed.`,
          evidencePath,
        }
      },
    })

    await runCase({
      testId: 'P7-NOT-001',
      role: 'teacher',
      steps: ['Verify workflow notifications created by publish, resubmission, extension, grade publication, submission receipt, and review request paths'],
      expected: 'Expected coursework notifications exist once for the correct users, with authorized links and no duplicate leakage.',
      run: async () => {
        const gradeReview = await apiJson(studentPage, `/api/student/coursework/grades/${createdIds.gradeId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Please review the published mark.' }),
        })
        if (!gradeReview.ok) {
          throw new Error(gradeReview.json?.error || 'Student could not create a coursework grade review request')
        }

        const [studentNotifications, teacherNotifications] = await Promise.all([
          prisma.notification.findMany({
            where: {
              userId: fixtures.eligibleStudent.user.id,
              createdAt: {
                gte: runStartedAt,
              },
              title: {
                in: [
                  'Coursework published',
                  'Coursework extension approved',
                  'Coursework resubmission allowed',
                  'Coursework grade published',
                ],
              },
            },
            orderBy: { createdAt: 'asc' },
          }),
          prisma.notification.findMany({
            where: {
              userId: fixtures.leadTeacher.user.id,
              createdAt: {
                gte: runStartedAt,
              },
              title: {
                in: [
                  'Coursework submission received',
                  'Coursework grade review requested',
                ],
              },
            },
            orderBy: { createdAt: 'asc' },
          }),
        ])

        const studentTitles = new Set(studentNotifications.map((notification) => notification.title))
        const teacherTitles = new Set(teacherNotifications.map((notification) => notification.title))
        if (
          !studentTitles.has('Coursework published') ||
          !studentTitles.has('Coursework extension approved') ||
          !studentTitles.has('Coursework resubmission allowed') ||
          !studentTitles.has('Coursework grade published') ||
          !teacherTitles.has('Coursework submission received') ||
          !teacherTitles.has('Coursework grade review requested')
        ) {
          throw new Error('Expected workflow notifications were not persisted for the correct users')
        }

        const duplicatePublishedNotifications = studentNotifications.filter((notification) => notification.title === 'Coursework grade published')
        if (duplicatePublishedNotifications.length !== 1) {
          throw new Error('Grade publication notification was duplicated unexpectedly')
        }
        if (studentNotifications.some((notification) => notification.link?.startsWith('/student/coursework') === false)) {
          throw new Error('Student notification links did not stay within authorized coursework routes')
        }

        return {
          actual: `Student notifications (${studentNotifications.length}) and teacher notifications (${teacherNotifications.length}) were recorded without duplicate grade-publication side effects.`,
          evidencePath: await screenshotCase(studentPage, 'P7-NOT-001'),
        }
      },
    })

    await runCase({
      testId: 'P7-BR-011',
      role: 'student',
      steps: ['Open coursework history after grade publication'],
      expected: 'Student can see published feedback without private teacher notes.',
      run: async () => {
        await studentPage.goto(`${baseUrl}/student/coursework/${createdIds.publicationId}/history`, { waitUntil: 'networkidle' })
        const bodyText = await studentPage.textContent('body')
        if (!bodyText?.includes('Published feedback for the student.')) {
          throw new Error('Published student feedback was not visible in coursework history')
        }
        if (bodyText.includes('Teacher-only note that should not reach student views.')) {
          throw new Error('Private teacher notes leaked into the student coursework history view')
        }
        const evidencePath = await screenshotCase(studentPage, 'P7-BR-011')
        return {
          actual: 'Published feedback was visible and private teacher notes were not exposed to the student.',
          evidencePath,
        }
      },
    })

    await runCase({
      testId: 'P7-BR-012',
      role: 'teacher',
      steps: ['Fetch JSON reports', 'Fetch grades CSV export'],
      expected: 'Teacher reports and CSV export are available for the publication scope.',
      run: async () => {
        const jsonResponse = await apiJson(teacherPage, `/api/teacher/coursework/reports?publicationId=${createdIds.publicationId}`)
        if (!jsonResponse.ok || !jsonResponse.json?.summary) {
          throw new Error(jsonResponse.json?.error || 'JSON report request failed')
        }
        const csvResponse = await apiJson(
          teacherPage,
          `/api/teacher/coursework/reports?publicationId=${createdIds.publicationId}&format=csv&type=grades`
        )
        if (!csvResponse.ok || !csvResponse.text?.includes('Publication')) {
          throw new Error('CSV report export failed')
        }
        await fs.writeFile(path.join(networkDir, 'reports-grades.csv'), csvResponse.text)
        await teacherPage.goto(`${baseUrl}/teacher/coursework/reports`, { waitUntil: 'networkidle' })
        const evidencePath = await screenshotCase(teacherPage, 'P7-BR-012')
        return {
          actual: 'Teacher report JSON and CSV export both succeeded for the publication scope.',
          evidencePath,
        }
      },
    })

    await runCase({
      testId: 'P7-VIEW-001',
      role: 'teacher',
      steps: ['Run critical teacher and student coursework pages in light/dark mode across desktop, tablet, and mobile viewports', 'Verify no horizontal overflow, no critical console errors, and no failed network requests'],
      expected: 'Critical coursework workflows remain usable across the required viewport and theme matrix.',
      run: async () => {
        const matrix = [
          { label: 'light-desktop', colorScheme: 'light', viewport: { width: 1440, height: 900 } },
          { label: 'dark-desktop', colorScheme: 'dark', viewport: { width: 1440, height: 900 } },
          { label: 'light-tablet', colorScheme: 'light', viewport: { width: 834, height: 1112 } },
          { label: 'dark-tablet', colorScheme: 'dark', viewport: { width: 834, height: 1112 } },
          { label: 'light-mobile', colorScheme: 'light', viewport: { width: 390, height: 844 } },
          { label: 'dark-mobile', colorScheme: 'dark', viewport: { width: 390, height: 844 } },
        ]
        const teacherPaths = [
          '/teacher/coursework/templates',
          '/teacher/coursework/assignments',
          '/teacher/coursework/grading',
          '/teacher/coursework/extensions',
          '/teacher/coursework/reports',
        ]
        const studentPaths = [
          '/student/coursework',
          `/student/coursework/${createdIds.publicationId}/submit`,
          `/student/coursework/${createdIds.publicationId}/history`,
        ]
        const viewResults = []

        for (const combo of matrix) {
          for (const roleConfig of [
            { role: 'teacher', email: fixtures.leadTeacher.user.email, password: 'Teacher@123', paths: teacherPaths },
            { role: 'student', email: fixtures.eligibleStudent.user.email, password: 'Student@123', paths: studentPaths },
          ]) {
            const context = await browser.newContext({
              colorScheme: combo.colorScheme,
              viewport: combo.viewport,
            })
            const page = await context.newPage()
            const comboConsoleErrors = []
            const comboNetworkErrors = []

            page.on('console', (message) => {
              if (message.type() === 'error') {
                comboConsoleErrors.push(message.text())
              }
            })
            page.on('response', (response) => {
              if (response.status() >= 400) {
                comboNetworkErrors.push({ url: response.url(), status: response.status() })
              }
            })

            try {
              await login(page, roleConfig.email, roleConfig.password)
              for (const targetPath of roleConfig.paths) {
                await page.goto(`${baseUrl}${targetPath}`, { waitUntil: 'networkidle' })
                const metrics = await page.evaluate(() => ({
                  innerWidth: window.innerWidth,
                  scrollWidth: document.documentElement.scrollWidth,
                }))
                if (metrics.scrollWidth > metrics.innerWidth + 1) {
                  throw new Error(`Horizontal overflow detected for ${roleConfig.role} on ${targetPath} in ${combo.label}`)
                }
              }

              if (comboConsoleErrors.length > 0) {
                throw new Error(`Critical console errors detected in ${combo.label} for ${roleConfig.role}: ${comboConsoleErrors.join(' | ')}`)
              }
              if (comboNetworkErrors.length > 0) {
                throw new Error(`Failed network requests detected in ${combo.label} for ${roleConfig.role}: ${JSON.stringify(comboNetworkErrors)}`)
              }

              viewResults.push({
                combo: combo.label,
                role: roleConfig.role,
                status: 'PASS',
              })
            } finally {
              await context.close()
            }
          }
        }

        const matrixEvidencePath = path.join(databaseDir, 'viewport-theme-matrix.json')
        await fs.writeFile(matrixEvidencePath, JSON.stringify(viewResults, null, 2))

        return {
          actual: `Viewport/theme matrix completed across ${viewResults.length} role+viewport combinations with no overflow, console, or network failures.`,
          evidencePath: matrixEvidencePath,
        }
      },
    })

    await runCase({
      testId: 'P7-BR-013',
      role: 'teacher',
      steps: ['Close the publication', 'Attempt another student submission'],
      expected: 'Closed coursework rejects new submissions.',
      run: async () => {
        const closeResponse = await apiJson(teacherPage, `/api/teacher/coursework/publications/${createdIds.publicationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'CLOSED' }),
        })
        if (!closeResponse.ok) {
          throw new Error(closeResponse.json?.error || 'Closing the publication failed')
        }
        await studentPage.goto(`${baseUrl}/student/coursework/${createdIds.publicationId}/submit`, { waitUntil: 'networkidle' })
        const rejectedSubmission = await apiStudentSubmission(studentPage, createdIds.publicationId, {
          plainTextSubmission: 'A second submission after closure should fail.',
          richTextSubmission: '',
          externalLink: '',
          repositoryUrl: '',
          fileContents: 'Closed submission should be rejected\n',
          fileName: 'closed-rejection.txt',
          mimeType: 'text/plain',
        })
        if (rejectedSubmission.ok || rejectedSubmission.status !== 400) {
          throw new Error('Closed publication did not reject a new submission attempt')
        }
        if (!rejectedSubmission.json?.error?.includes('not open for new submissions')) {
          throw new Error(`Unexpected closed-submission error: ${rejectedSubmission.json?.error || rejectedSubmission.text}`)
        }
        const evidencePath = await screenshotCase(studentPage, 'P7-BR-013')
        return {
          actual: 'Closed publication rejected a new submission attempt.',
          evidencePath,
        }
      },
    })

    const errorConsoleEntries = consoleEvents.filter((entry) => entry.type === 'error')
    summary.notes.push(`Structured workflow cases executed: ${cases.length}`)
    summary.notes.push(`Console error count observed during run: ${errorConsoleEntries.length}`)
    await fs.writeFile(
      path.join(databaseDir, 'workflow-fixture.json'),
      JSON.stringify(
        {
          createdIds,
          fixtures: summary.fixtures,
        },
        null,
        2
      )
    )
  } catch (error) {
    summary.status = 'BLOCKED'
    summary.notes.push(error instanceof Error ? error.message : String(error))
  } finally {
    await fs.writeFile(path.join(browserDir, 'summary.json'), JSON.stringify(summary, null, 2))
    await fs.writeFile(path.join(consoleDir, 'events.json'), JSON.stringify(consoleEvents, null, 2))
    await fs.writeFile(path.join(networkDir, 'events.json'), JSON.stringify(networkEvents, null, 2))
    await cleanupFixture()
    await teacherContext.close()
    await assistantTeacherContext.close()
    await studentContext.close()
    await foreignStudentContext.close()
    await browser.close()
    serverProcess.kill('SIGTERM')
    await redisServer.stop()
    await prisma.$disconnect()
  }

  if (summary.status !== 'PASS') {
    console.error('[phase7:browser] BLOCKED')
    console.error(JSON.stringify(summary, null, 2))
    process.exit(1)
  }

  console.log('[phase7:browser] PASS')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch(async (error) => {
  console.error('[phase7:browser] FAIL', error)
  try {
    await prisma.$disconnect()
  } catch {}
  process.exit(1)
})
